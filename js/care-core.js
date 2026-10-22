/* Doula's House — care core.
 * The single implementation of the shared-care rules: plans, consent grants, team, messages, appointments,
 * recommendations, billing, break-glass and audit. It is pure (no I/O): it takes a `db` object, the acting
 * user and an action name, and either returns a result or throws CareError.
 * Used by server/server.js (Node, authoritative) and by js/auth.js's browser-only fallback — one set of rules.
 *
 * Authorization principles enforced here (never in the UI):
 *   - A mother owns her plan. Nobody else can read it unless she has granted them, section by section.
 *   - Clinical sections can only be granted to clinicians. Doulas can never receive them.
 *   - Grants can expire and can be revoked at any moment; access ends immediately.
 *   - Every view by someone other than the owner is written to the mother's audit log.
 *   - Break-glass gives a clinician 24h read-only access to clinical sections only, with a reason, and is logged.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DHCare = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ reference data */
  const SECTIONS = [
    { id: 'env', title: 'Labor environment', clinical: false, hint: 'Lighting, sound, movement, who is in the room…' },
    { id: 'pain', title: 'Comfort & pain relief', clinical: false, hint: 'What helps you cope? What would you like to be offered, or not?' },
    { id: 'interv', title: 'Interventions', clinical: false, hint: 'Monitoring, induction, assisted delivery, cesarean — how you want to be consulted.' },
    { id: 'support', title: 'Support people', clinical: false, hint: 'Who will be with you, and what is each person’s role?' },
    { id: 'newborn', title: 'Newborn care', clinical: false, hint: 'Cord clamping, skin-to-skin, first bath, vitamin K…' },
    { id: 'feeding', title: 'Feeding', clinical: false, hint: 'Your feeding plans and the support you want.' },
    { id: 'post', title: 'Postpartum plan', clinical: false, hint: 'Visits, rest, help at home, and who to call when something feels wrong.' },
    { id: 'escalate', title: 'Advocacy & escalation', clinical: false, hint: 'How should the team respond if you or your doula raise a concern?' },
    { id: 'culture', title: 'Cultural & spiritual', clinical: false, hint: 'Language, prayer, privacy, dignity — whatever matters to you.' },
    { id: 'health', title: 'Health history & risk flags', clinical: true, hint: 'Conditions, medications, allergies. Clinical: only clinicians can receive this.' }
  ];
  const SERVICES = { prenatal: ['Prenatal visit', 85], labor: ['Labor & delivery support', 450], post: ['Postpartum visit', 85] };
  const EXPIRY = { '30 days': 30, '6 weeks': 42, '12 weeks': 84, '1 year': 365, 'No end date': null };
  const DEFAULT_EXPIRY = '12 weeks';
  const BG_REASONS = ['Obstetric emergency', 'Emergency admission', 'Unable to reach patient — urgent safety concern'];
  const SETTINGS = ['hospital', 'birthcenter', 'home'];
  const PLANS = ['', 'Medicaid', 'Private', 'Self-pay'];
  const INSURERS = ['', 'medicaid', 'uhc', 'anthem', 'emblem', 'bcbs', 'aetna', 'cigna', 'humana', 'kaiser', 'other'];
  const DAY = 864e5;

  class CareError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code || 'error'; } }
  const need = (cond, status, msg, code) => { if (!cond) throw new CareError(status, msg, code); };
  const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
  const SSN = /\b\d{3}-\d{2}-\d{4}\b/;

  /* ------------------------------------------------------------------ db helpers */
  function ensure(db) {
    db.care = db.care || {};
    ['plans', 'grants', 'invites', 'intros', 'notes', 'recs', 'claims', 'appts', 'acks', 'bglass', 'scholarships'].forEach((k) => { db.care[k] = db.care[k] || {}; });
    db.care.messages = db.care.messages || [];
    db.care.audit = db.care.audit || [];
    return db.care;
  }
  const iso = (env, offsetMs = 0) => new Date(env.now() + offsetMs).toISOString();
  const user = (db, id) => db.users[id] || null;
  const byEmail = (db, email) => Object.values(db.users).find((u) => u.email === String(email || '').trim().toLowerCase()) || null;

  function defaultProfile(role) {
    if (role === 'mom') return { dueDate: '', state: '', plan: '', memberLast4: '', insurer: '', prefs: { lang: 'any', setting: 'hospital', ins: 'Medicaid', post: true } };
    if (role === 'doula') return { headline: '', title: '', org: '', cert: '', yearsPractice: '', languages: [], insurance: [], settings: [], services: [], listed: true, align: [0, 0, 0, 0, 0] };
    if (role === 'clinician') return { headline: '', title: '', org: '', cert: '', yearsPractice: '', languages: [], insurance: [], settings: [], services: [], listed: true, align: [0, 0, 0, 0, 0] };
    return {};
  }
  const list = (v, n = 8, m = 40) => (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => clean(x, m)).filter(Boolean).slice(0, n);
  /* Validate + merge a (partial) profile for a role. Unknown keys are dropped. */
  function cleanProfile(role, input, existing) {
    const out = Object.assign(defaultProfile(role), existing || {});
    const p = input || {};
    if (role === 'mom') {
      if (p.dueDate !== undefined) { need(p.dueDate === '' || /^\d{4}-\d{2}-\d{2}$/.test(p.dueDate), 400, 'Please enter a valid due date.', 'dueDate'); out.dueDate = p.dueDate; }
      if (p.state !== undefined) out.state = clean(p.state, 2).toUpperCase();
      if (p.plan !== undefined) { need(PLANS.includes(p.plan), 400, 'Unknown plan type.', 'plan'); out.plan = p.plan; }
      if (p.insurer !== undefined) { need(INSURERS.includes(p.insurer), 400, 'Unknown insurer.', 'insurer'); out.insurer = p.insurer; }
      if (p.memberLast4 !== undefined) { need(/^\d{0,4}$/.test(String(p.memberLast4)), 400, 'Member ID suffix must be up to 4 digits.', 'memberLast4'); out.memberLast4 = String(p.memberLast4); }
      if (p.prefs && typeof p.prefs === 'object') {
        const q = out.prefs = Object.assign({}, out.prefs);
        if (p.prefs.lang !== undefined) q.lang = clean(p.prefs.lang, 20) || 'any';
        if (p.prefs.setting !== undefined && SETTINGS.includes(p.prefs.setting)) q.setting = p.prefs.setting;
        if (p.prefs.ins !== undefined && ['Medicaid', 'Private', 'Self-pay'].includes(p.prefs.ins)) q.ins = p.prefs.ins;
        if (p.prefs.post !== undefined) q.post = !!p.prefs.post;
      }
    } else if (role === 'doula' || role === 'clinician') {
      ['headline', 'title', 'org', 'cert'].forEach((k) => { if (p[k] !== undefined) out[k] = clean(p[k], k === 'headline' ? 120 : 80); });
      if (p.yearsPractice !== undefined) out.yearsPractice = clean(p.yearsPractice, 3).replace(/\D/g, '');
      ['languages', 'insurance', 'services'].forEach((k) => { if (p[k] !== undefined) out[k] = list(p[k]); });
      if (p.settings !== undefined) out.settings = list(p.settings).filter((s) => SETTINGS.includes(s));
      if (p.listed !== undefined) out.listed = !!p.listed;
      if (p.align !== undefined) { need(Array.isArray(p.align) && p.align.length === 5, 400, 'Bad alignment data.'); out.align = p.align.map((x) => (x ? 1 : 0)); }
    }
    return out;
  }

  const weeksOf = (due, env) => { if (!due) return null; const left = Math.ceil((Date.parse(due + 'T12:00:00Z') - env.now()) / (7 * DAY)); return Math.max(0, Math.min(42, 40 - left)); };
  const first = (n) => String(n || '').split(' ')[0];
  const pubUser = (u) => u && ({ id: u.id, name: u.name, role: u.role, city: u.city || '', org: (u.profile && u.profile.org) || '', title: (u.profile && u.profile.title) || '', cert: (u.profile && u.profile.cert) || '' });
  const proCard = (u) => Object.assign(pubUser(u), { headline: u.profile.headline || '', yearsPractice: u.profile.yearsPractice || '', languages: u.profile.languages || [], insurance: u.profile.insurance || [], settings: u.profile.settings || [], services: u.profile.services || [], align: u.profile.align || [0, 0, 0, 0, 0] });

  /* ------------------------------------------------------------------ plans, sections, grants */
  function getPlan(db, momId, env) {
    const c = ensure(db);
    return c.plans[momId] || (c.plans[momId] = { text: {}, custom: [], updatedAt: iso(env) });
  }
  function sectionDefs(db, momId, env) {
    const p = getPlan(db, momId, env);
    return [...SECTIONS, ...p.custom.map((s) => ({ id: s.id, title: s.title, clinical: false, custom: true, hint: 'Your own section.' }))];
  }
  const findGrant = (db, momId, granteeId) => Object.values(ensure(db).grants).find((g) => g.momId === momId && g.granteeId === granteeId) || null;
  const grantActive = (g, env) => !!g && (!g.expiresAt || env.now() < Date.parse(g.expiresAt));
  const activeGrant = (db, momId, granteeId, env) => { const g = findGrant(db, momId, granteeId); return grantActive(g, env) ? g : null; };
  const grantsOfMom = (db, momId, env) => Object.values(ensure(db).grants).filter((g) => g.momId === momId && grantActive(g, env));
  const grantsToUser = (db, uid, env) => Object.values(ensure(db).grants).filter((g) => g.granteeId === uid && grantActive(g, env) && db.users[g.momId]);
  function activeBG(db, momId, clinId, env) { return Object.values(ensure(db).bglass).find((b) => b.momId === momId && b.clinicianId === clinId && env.now() < Date.parse(b.until)) || null; }

  function ensureGrant(db, momId, granteeId, env, label) {
    let g = findGrant(db, momId, granteeId);
    if (g && !grantActive(g, env)) { delete db.care.grants[g.id]; g = null; } // expired grants are replaced, not silently revived
    if (!g) {
      const l = label || DEFAULT_EXPIRY;
      g = db.care.grants[env.uid()] = { id: null, momId, granteeId, sections: {}, expiryLabel: l, expiresAt: EXPIRY[l] == null ? null : iso(env, EXPIRY[l] * DAY), createdAt: iso(env) };
      g.id = Object.keys(db.care.grants).find((k) => db.care.grants[k] === g);
    }
    return g;
  }

  /* ------------------------------------------------------------------ audit */
  function audit(db, env, momId, actor, action, detail, throttleMs) {
    const a = ensure(db).audit;
    if (throttleMs) {
      const hit = a.find((e) => e.momId === momId && e.actorId === actor.id && e.action === action && e.detail === detail && env.now() - Date.parse(e.t) < throttleMs);
      if (hit) { hit.t = iso(env); return; }
    }
    a.unshift({ id: env.uid(), momId, t: iso(env), actorId: actor.id, actorName: actor.name, actorRole: actor.role, action, detail: detail || '' });
    if (a.length > 5000) a.length = 5000;
  }

  /* ------------------------------------------------------------------ ack / recs / appts shapes */
  const ackOf = (db, momId, clinId) => ensure(db).acks[momId + ':' + clinId] || null;
  function recStatus(db, momId) {
    const rs = Object.values(ensure(db).recs).filter((r) => r.momId === momId);
    return rs.some((r) => r.status === 'issued') ? 'issued' : rs.some((r) => r.status === 'requested') ? 'requested' : 'none';
  }
  const apptView = (db, a) => ({ id: a.id, momId: a.momId, title: a.title, at: a.at, withName: a.withName || '', createdBy: a.createdBy, createdByName: (db.users[a.createdBy] || {}).name || 'Former member' });
  const apptsOf = (db, momId) => Object.values(ensure(db).appts).filter((a) => a.momId === momId).sort((x, y) => (x.at > y.at ? 1 : -1)).map((a) => apptView(db, a));

  /* ------------------------------------------------------------------ messages */
  function threadInfo(db, actor, tid, env) {
    let m = /^t:(.+)$/.exec(tid);
    if (m) {
      const mom = user(db, m[1]); if (!mom || mom.role !== 'mom') return null;
      if (actor.id === mom.id || activeGrant(db, mom.id, actor.id, env)) return { id: tid, momId: mom.id, title: first(mom.name) + '’s care team', kind: 'team', members: [mom.id, ...grantsOfMom(db, mom.id, env).map((g) => g.granteeId)] };
      return null;
    }
    m = /^d:([^:]+):(.+)$/.exec(tid);
    if (m) {
      const mom = user(db, m[1]), other = user(db, m[2]); if (!mom || !other || mom.role !== 'mom' || !activeGrant(db, mom.id, other.id, env)) return null;
      if (actor.id !== mom.id && actor.id !== other.id) return null;
      const partner = actor.id === mom.id ? other : mom;
      return { id: tid, momId: mom.id, title: partner.name, kind: 'direct', members: [mom.id, other.id] };
    }
    return null;
  }
  function visibleThreads(db, actor, env) {
    const out = [];
    const push = (tid) => { const t = threadInfo(db, actor, tid, env); if (t) { const msgs = db.care.messages.filter((x) => x.tid === tid); out.push({ id: tid, title: t.title, kind: t.kind, members: t.members.map((id) => (db.users[id] || {}).name).filter(Boolean), count: msgs.length, last: msgs.length ? msgs[msgs.length - 1].at : null }); } };
    if (actor.role === 'mom') { push('t:' + actor.id); grantsOfMom(db, actor.id, env).forEach((g) => push('d:' + actor.id + ':' + g.granteeId)); }
    else grantsToUser(db, actor.id, env).forEach((g) => { push('t:' + g.momId); push('d:' + g.momId + ':' + actor.id); });
    return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'team' ? -1 : 1));
  }

  /* ------------------------------------------------------------------ billing */
  function claimChecks(db, doula, momId, units, env) {
    const mom = user(db, momId); need(mom && mom.role === 'mom', 404, 'Client not found.');
    const cov = mom.profile || {};
    return [
      { id: 'grant', label: 'Client has shared her care team with you', ok: !!activeGrant(db, momId, doula.id, env) },
      { id: 'coverage', label: 'Coverage on file (Medicaid or private plan, member ID)', ok: !!(cov.plan && cov.plan !== 'Self-pay' && cov.memberLast4) },
      { id: 'rec', label: 'Provider recommendation on file', ok: recStatus(db, momId) === 'issued' },
      { id: 'visit', label: 'Visit documented (units entered)', ok: Number(units) > 0 },
      { id: 'cred', label: 'Your certification is on your profile', ok: !!(doula.profile && doula.profile.cert) }
    ];
  }
  const claimView = (db, c) => { const m = db.users[c.momId] || {}; return { id: c.id, ref: c.ref, momId: c.momId, client: initials(m.name), memberLast4: (m.profile && m.profile.memberLast4) || '', service: c.service, serviceKey: c.serviceKey, units: c.units, amount: c.amount, date: c.date, status: c.status, reason: c.reason || '' }; };
  const initials = (n) => String(n || '?').split(/[ ,.]+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join('.') + '.';
  let claimSeq = 1060;

  /* ================================================================== actions */
  const A = {};
  const act = (name, write, fn) => { A[name] = { w: write, fn }; };
  const mustRole = (a, ...roles) => need(roles.includes(a.role), 403, 'That isn’t available for your account type.', 'forbidden');

  /* ---------- directory ---------- */
  act('directory.list', false, (db, a, args) => {
    const role = args.role === 'clinician' ? 'clinician' : 'doula';
    return Object.values(db.users).filter((u) => u.role === role && u.profile && u.profile.listed !== false).map(proCard);
  });

  /* ---------- mom: everything she needs in one call ---------- */
  act('mom.state', false, (db, a, args, env) => {
    mustRole(a, 'mom');
    const c = ensure(db), plan = getPlan(db, a.id, env);
    const team = grantsOfMom(db, a.id, env).map((g) => { const u = user(db, g.granteeId); return { id: g.id, user: pubUser(u), sections: Object.keys(g.sections).filter((k) => g.sections[k]), expiry: { label: g.expiryLabel, expiresAt: g.expiresAt }, createdAt: g.createdAt, ack: u.role === 'clinician' ? ackOf(db, a.id, u.id) : null }; });
    const invites = Object.values(c.invites).filter((i) => i.momId === a.id && i.status === 'pending');
    const intros = Object.values(c.intros).filter((i) => i.momId === a.id).map((i) => ({ id: i.id, status: i.status, at: i.at, to: pubUser(user(db, i.toId)) })).filter((i) => i.to);
    const recs = Object.values(c.recs).filter((r) => r.momId === a.id).map((r) => ({ id: r.id, status: r.status, clinician: pubUser(user(db, r.clinicianId)), requestedAt: r.requestedAt, issuedAt: r.issuedAt }));
    const bg = Object.values(c.bglass).filter((b) => b.momId === a.id && env.now() < Date.parse(b.until)).map((b) => ({ by: (user(db, b.clinicianId) || {}).name, reason: b.reason, until: b.until }));
    return {
      me: { id: a.id, name: a.name, city: a.city, profile: a.profile, weeks: weeksOf(a.profile.dueDate, env) },
      plan: { text: plan.text, custom: plan.custom, updatedAt: plan.updatedAt }, sections: sectionDefs(db, a.id, env),
      team, invites, intros, recs, appts: apptsOf(db, a.id), emergency: bg,
      audit: c.audit.filter((e) => e.momId === a.id).slice(0, 150),
      scholarships: Object.values(c.scholarships).filter((s) => s.userId === a.id).map((s) => ({ id: s.id, track: s.track, status: s.status, at: s.at }))
    };
  });
  act('plan.setText', true, (db, a, args, env) => {
    mustRole(a, 'mom'); const defs = sectionDefs(db, a.id, env), d = defs.find((s) => s.id === args.sectionId); need(d, 404, 'No such section.');
    const p = getPlan(db, a.id, env); p.text[d.id] = clean(args.text, 4000); p.updatedAt = iso(env);
    audit(db, env, a.id, a, 'Edited', d.title, 5 * 60000); return { ok: true, updatedAt: p.updatedAt };
  });
  act('plan.addSection', true, (db, a, args, env) => {
    mustRole(a, 'mom'); const title = clean(args.title, 60); need(title, 400, 'Please give the section a name.'); const p = getPlan(db, a.id, env);
    need(p.custom.length < 10, 400, 'You can add up to 10 custom sections.'); const s = { id: 'c_' + env.uid().slice(0, 8), title }; p.custom.push(s); p.updatedAt = iso(env);
    audit(db, env, a.id, a, 'Added section', title); return s;
  });
  act('plan.renameSection', true, (db, a, args, env) => {
    mustRole(a, 'mom'); const p = getPlan(db, a.id, env), s = p.custom.find((x) => x.id === args.id); need(s, 404, 'No such section.'); const t = clean(args.title, 60); need(t, 400, 'Please give the section a name.');
    s.title = t; audit(db, env, a.id, a, 'Renamed section', t); return { ok: true };
  });
  act('plan.deleteSection', true, (db, a, args, env) => {
    mustRole(a, 'mom'); const p = getPlan(db, a.id, env), i = p.custom.findIndex((x) => x.id === args.id); need(i >= 0, 404, 'No such section.');
    const [s] = p.custom.splice(i, 1); delete p.text[s.id]; Object.values(db.care.grants).forEach((g) => { if (g.momId === a.id) delete g.sections[s.id]; });
    audit(db, env, a.id, a, 'Deleted section', s.title); return { ok: true };
  });

  /* ---------- consent grants ---------- */
  act('grant.set', true, (db, a, args, env) => {
    mustRole(a, 'mom'); const g0 = findGrant(db, a.id, args.granteeId); const gu = user(db, args.granteeId);
    need(gu && g0 && grantActive(g0, env), 404, 'That person isn’t on your care team.');
    const d = sectionDefs(db, a.id, env).find((s) => s.id === args.sectionId); need(d, 404, 'No such section.');
    need(!(d.clinical && gu.role !== 'clinician'), 403, 'Clinical information can only be shared with clinicians.', 'clinical');
    if (args.on) g0.sections[d.id] = 1; else delete g0.sections[d.id];
    audit(db, env, a.id, a, args.on ? 'Granted access' : 'Revoked', gu.name + ' · ' + d.title); return { ok: true };
  });
  act('grant.setExpiry', true, (db, a, args, env) => {
    mustRole(a, 'mom'); const g = findGrant(db, a.id, args.granteeId); need(g && grantActive(g, env), 404, 'That person isn’t on your care team.');
    need(Object.prototype.hasOwnProperty.call(EXPIRY, args.label), 400, 'Unknown option.');
    g.expiryLabel = args.label; g.expiresAt = EXPIRY[args.label] == null ? null : iso(env, EXPIRY[args.label] * DAY);
    audit(db, env, a.id, a, 'Changed access end', (user(db, g.granteeId) || {}).name + ' · ' + args.label); return { ok: true };
  });
  act('grant.remove', true, (db, a, args, env) => {
    mustRole(a, 'mom'); const g = findGrant(db, a.id, args.granteeId); need(g, 404, 'That person isn’t on your care team.');
    delete db.care.grants[g.id]; audit(db, env, a.id, a, 'Removed from team', (user(db, g.granteeId) || {}).name); return { ok: true };
  });
  act('grant.removeAll', true, (db, a, args, env) => {
    mustRole(a, 'mom'); let n = 0; Object.values(db.care.grants).forEach((g) => { if (g.momId === a.id) { delete db.care.grants[g.id]; n++; } });
    audit(db, env, a.id, a, 'Revoked', 'Everyone · all sections'); return { removed: n };
  });

  /* ---------- invitations & introductions ---------- */
  act('invite.create', true, (db, a, args, env) => {
    mustRole(a, 'mom'); const email = clean(args.email, 254).toLowerCase(); need(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 400, 'Please enter a valid email.', 'email');
    const kind = args.kind === 'clinician' ? 'clinician' : 'doula'; const target = byEmail(db, email);
    if (target) {
      need(target.role === kind, 409, 'That account is registered as a ' + (target.role === 'mom' ? 'mother' : target.role) + ', not a ' + kind + '.', 'role');
      need(!activeGrant(db, a.id, target.id, env), 409, target.name + ' is already on your team.', 'exists');
      ensureGrant(db, a.id, target.id, env); audit(db, env, a.id, a, 'Added to team', target.name + ' · no sections shared yet');
      return { added: pubUser(target) };
    }
    need(!Object.values(db.care.invites).some((i) => i.momId === a.id && i.email === email && i.status === 'pending'), 409, 'You’ve already invited that email.', 'exists');
    const inv = db.care.invites[env.uid()] = { id: null, momId: a.id, email, kind, status: 'pending', at: iso(env) }; inv.id = Object.keys(db.care.invites).find((k) => db.care.invites[k] === inv);
    audit(db, env, a.id, a, 'Invited', email + ' (' + kind + ') · they’ll get access only after they join and you choose sections');
    return { invited: email };
  });
  act('invite.update', true, (db, a, args) => { mustRole(a, 'mom'); const i = db.care.invites[args.id]; need(i && i.momId === a.id, 404, 'Invitation not found.'); i.kind = args.kind === 'clinician' ? 'clinician' : 'doula'; return { ok: true }; });
  act('invite.cancel', true, (db, a, args, env) => { mustRole(a, 'mom'); const i = db.care.invites[args.id]; need(i && i.momId === a.id, 404, 'Invitation not found.'); delete db.care.invites[i.id]; audit(db, env, a.id, a, 'Cancelled invitation', i.email); return { ok: true }; });
  act('intro.request', true, (db, a, args, env) => {
    mustRole(a, 'mom'); const to = user(db, args.toId); need(to && (to.role === 'doula' || to.role === 'clinician') && to.profile.listed !== false, 404, 'That professional isn’t available.');
    need(!activeGrant(db, a.id, to.id, env), 409, 'Already on your team.', 'exists');
    need(!Object.values(db.care.intros).some((i) => i.momId === a.id && i.toId === to.id && i.status === 'pending'), 409, 'Introduction already requested.', 'exists');
    const i = db.care.intros[env.uid()] = { id: null, momId: a.id, toId: to.id, status: 'pending', at: iso(env) }; i.id = Object.keys(db.care.intros).find((k) => db.care.intros[k] === i);
    audit(db, env, a.id, a, 'Intro requested', to.name + ' — shared: first name, city, due month only'); return { id: i.id };
  });
  act('intro.cancel', true, (db, a, args) => { mustRole(a, 'mom'); const i = db.care.intros[args.id]; need(i && i.momId === a.id, 404, 'Not found.'); delete db.care.intros[i.id]; return { ok: true }; });
  act('intro.respond', true, (db, a, args, env) => {
    mustRole(a, 'doula', 'clinician'); const i = db.care.intros[args.id]; need(i && i.toId === a.id && i.status === 'pending', 404, 'Introduction not found.');
    i.status = args.accept ? 'accepted' : 'declined';
    if (args.accept) { ensureGrant(db, i.momId, a.id, env); audit(db, env, i.momId, a, 'Accepted introduction', a.name + ' joined your team — no sections shared yet'); }
    return { ok: true };
  });

  /* ---------- professionals: clients / patients ---------- */
  act('pro.state', false, (db, a, args, env) => {
    mustRole(a, 'doula', 'clinician'); const c = ensure(db);
    const clients = grantsToUser(db, a.id, env).map((g) => {
      const m = user(db, g.momId); const vis = SECTIONS.concat(getPlan(db, m.id, env).custom.map((s) => ({ id: s.id, clinical: false }))).filter((s) => g.sections[s.id] && (!s.clinical || a.role === 'clinician'));
      const next = apptsOf(db, m.id).find((x) => x.at >= iso(env).slice(0, 16));
      const ack = a.role === 'clinician' ? ackOf(db, m.id, a.id) : null;
      return { mom: { id: m.id, name: m.name, city: m.city, weeks: weeksOf(m.profile.dueDate, env), dueDate: m.profile.dueDate }, shared: vis.length, total: sectionDefs(db, m.id, env).filter((s) => a.role === 'clinician' || !s.clinical).length, rec: recStatus(db, m.id), next: next || null, expiry: { label: g.expiryLabel, expiresAt: g.expiresAt }, ack: ack ? { at: ack.at, stale: ack.at < getPlan(db, m.id, env).updatedAt } : null };
    });
    const intros = Object.values(c.intros).filter((i) => i.toId === a.id && i.status === 'pending').map((i) => { const m = user(db, i.momId); return m ? { id: i.id, at: i.at, from: { firstName: first(m.name), city: m.city, dueMonth: m.profile.dueDate ? m.profile.dueDate.slice(0, 7) : '' } } : null; }).filter(Boolean);
    const out = { me: { id: a.id, name: a.name, role: a.role, profile: a.profile }, clients, intros };
    if (a.role === 'clinician') {
      out.recRequests = Object.values(c.recs).filter((r) => r.clinicianId === a.id && r.status === 'requested' && activeGrant(db, r.momId, a.id, env)).map((r) => ({ id: r.id, requestedAt: r.requestedAt, mom: pubUser(user(db, r.momId)), by: (user(db, r.requestedBy) || {}).name }));
      out.emergency = Object.values(c.bglass).filter((b) => b.clinicianId === a.id && env.now() < Date.parse(b.until)).map((b) => ({ mom: pubUser(user(db, b.momId)), until: b.until, reason: b.reason }));
    } else {
      out.claims = Object.values(c.claims).filter((x) => x.doulaId === a.id).sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)).map((x) => claimView(db, x));
    }
    return out;
  });
  act('client.get', false, (db, a, args, env) => {
    mustRole(a, 'doula', 'clinician'); const mom = user(db, args.momId); need(mom && mom.role === 'mom', 404, 'Not found.');
    const g = activeGrant(db, mom.id, a.id, env), bg = !g && a.role === 'clinician' ? activeBG(db, mom.id, a.id, env) : null;
    need(g || bg, 403, 'This mother hasn’t shared her plan with you, or access has ended.', 'no_access');
    const defs = sectionDefs(db, mom.id, env), plan = getPlan(db, mom.id, env), shown = [], locked = [];
    defs.forEach((d) => {
      const allowed = g ? (g.sections[d.id] && (!d.clinical || a.role === 'clinician')) : (d.clinical);
      if (allowed) shown.push({ id: d.id, title: d.title, clinical: d.clinical, text: plan.text[d.id] || '', via: g ? 'shared' : 'emergency' });
      else locked.push({ id: d.id, title: d.title, clinical: d.clinical, reason: d.clinical && a.role !== 'clinician' ? 'clinical' : 'not_shared' });
    });
    audit(db, env, mom.id, a, bg ? 'Viewed (emergency access)' : 'Viewed', shown.map((s) => s.title).join(', ') || 'Nothing shared yet', 10 * 60000);
    const res = { mom: { id: mom.id, name: mom.name, city: mom.city, dueDate: mom.profile.dueDate, weeks: weeksOf(mom.profile.dueDate, env) }, shown, locked, planUpdatedAt: plan.updatedAt, emergency: bg ? { until: bg.until, reason: bg.reason } : null, access: g ? { expiry: { label: g.expiryLabel, expiresAt: g.expiresAt } } : null };
    if (g) {
      res.team = grantsOfMom(db, mom.id, env).map((x) => pubUser(user(db, x.granteeId))).concat([pubUser(mom)]);
      res.appts = apptsOf(db, mom.id);
      res.recs = Object.values(db.care.recs).filter((r) => r.momId === mom.id).map((r) => ({ id: r.id, status: r.status, clinician: pubUser(user(db, r.clinicianId)), requestedAt: r.requestedAt, issuedAt: r.issuedAt }));
      res.recStatus = recStatus(db, mom.id);
      if (a.role === 'doula') { res.coverage = { plan: mom.profile.plan, state: mom.profile.state, memberLast4: mom.profile.memberLast4 }; res.notes = Object.values(db.care.notes).filter((n) => n.doulaId === a.id && n.momId === mom.id).sort((x, y) => (x.at < y.at ? 1 : -1)); res.clinicians = grantsOfMom(db, mom.id, env).map((x) => user(db, x.granteeId)).filter((u) => u.role === 'clinician').map(pubUser); }
      else { const k = ackOf(db, mom.id, a.id); res.ack = k ? { at: k.at, stale: k.at < plan.updatedAt } : null; }
    }
    return res;
  });

  /* ---------- clinician actions ---------- */
  act('ack.set', true, (db, a, args, env) => {
    mustRole(a, 'clinician'); const g = activeGrant(db, args.momId, a.id, env); need(g, 403, 'No access.', 'no_access');
    db.care.acks[args.momId + ':' + a.id] = { at: iso(env) }; audit(db, env, args.momId, a, 'Acknowledged', 'Birth plan'); return { ok: true };
  });
  act('rec.request', true, (db, a, args, env) => {
    const momId = a.role === 'mom' ? a.id : args.momId; mustRole(a, 'mom', 'doula');
    if (a.role === 'doula') need(activeGrant(db, momId, a.id, env), 403, 'No access.', 'no_access');
    const cl = user(db, args.clinicianId); need(cl && cl.role === 'clinician' && activeGrant(db, momId, cl.id, env), 404, 'That clinician isn’t on the care team.');
    need(!Object.values(db.care.recs).some((r) => r.momId === momId && r.clinicianId === cl.id && r.status !== 'declined'), 409, 'A recommendation has already been requested from ' + cl.name + '.', 'exists');
    const r = db.care.recs[env.uid()] = { id: null, momId, clinicianId: cl.id, requestedBy: a.id, status: 'requested', requestedAt: iso(env), issuedAt: null }; r.id = Object.keys(db.care.recs).find((k) => db.care.recs[k] === r);
    audit(db, env, momId, a, 'Requested recommendation', 'Doula services · from ' + cl.name); return { id: r.id };
  });
  act('rec.issue', true, (db, a, args, env) => {
    mustRole(a, 'clinician'); const r = db.care.recs[args.id]; need(r && r.clinicianId === a.id && r.status === 'requested', 404, 'Request not found.');
    need(activeGrant(db, r.momId, a.id, env), 403, 'Access has ended for this patient.', 'no_access');
    r.status = 'issued'; r.issuedAt = iso(env); audit(db, env, r.momId, a, 'Issued recommendation', 'Doula services'); return { ok: true };
  });
  act('bglass.request', true, (db, a, args, env) => {
    mustRole(a, 'clinician'); const reason = clean(args.reason, 80), note = clean(args.note, 300);
    need(BG_REASONS.includes(reason), 400, 'Please choose a reason.'); need(note.length >= 15, 400, 'Please describe the situation (at least 15 characters).', 'note');
    const recent = Object.values(db.care.bglass).filter((b) => b.clinicianId === a.id && env.now() - Date.parse(b.at) < DAY).length; need(recent < 5, 429, 'Emergency access limit reached for today. Please contact the privacy officer.', 'rate_limited');
    const mom = byEmail(db, args.email);
    if (mom && mom.role === 'mom' && !activeGrant(db, mom.id, a.id, env)) {
      const b = db.care.bglass[env.uid()] = { id: null, momId: mom.id, clinicianId: a.id, reason, note, at: iso(env), until: iso(env, DAY) }; b.id = Object.keys(db.care.bglass).find((k) => db.care.bglass[k] === b);
      audit(db, env, mom.id, a, 'Emergency access', reason + ' · clinical sections only · 24 hours');
    }
    return { ok: true, message: 'If a matching patient record exists, clinical sections are now available for 24 hours. This request has been logged and the patient will be able to see it.' };
  });

  /* ---------- doula: notes ---------- */
  act('note.create', true, (db, a, args, env) => {
    mustRole(a, 'doula'); need(activeGrant(db, args.momId, a.id, env), 403, 'No access.', 'no_access'); const text = clean(args.text, 2000); need(text, 400, 'Please write a note.');
    const n = db.care.notes[env.uid()] = { id: null, doulaId: a.id, momId: args.momId, text, at: iso(env), edited: false }; n.id = Object.keys(db.care.notes).find((k) => db.care.notes[k] === n); return n;
  });
  act('note.update', true, (db, a, args) => { const n = db.care.notes[args.id]; need(n && n.doulaId === a.id, 404, 'Note not found.'); const t = clean(args.text, 2000); need(t, 400, 'Please write a note.'); n.text = t; n.edited = true; return n; });
  act('note.delete', true, (db, a, args) => { const n = db.care.notes[args.id]; need(n && n.doulaId === a.id, 404, 'Note not found.'); delete db.care.notes[n.id]; return { ok: true }; });

  /* ---------- appointments (shared calendar) ---------- */
  act('appt.create', true, (db, a, args, env) => {
    const momId = a.role === 'mom' ? a.id : args.momId; mustRole(a, 'mom', 'doula', 'clinician');
    if (a.role !== 'mom') need(activeGrant(db, momId, a.id, env), 403, 'No access.', 'no_access');
    const title = clean(args.title, 80); need(title, 400, 'Please add a title.'); need(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(args.at)), 400, 'Please choose a date and time.', 'at');
    const x = db.care.appts[env.uid()] = { id: null, momId, title, at: args.at, withName: clean(args.withName, 60), createdBy: a.id }; x.id = Object.keys(db.care.appts).find((k) => db.care.appts[k] === x);
    audit(db, env, momId, a, 'Added appointment', title); return apptView(db, x);
  });
  act('appt.update', true, (db, a, args, env) => {
    const x = db.care.appts[args.id]; need(x && (x.createdBy === a.id || x.momId === a.id), 404, 'Appointment not found.');
    if (args.title !== undefined) { const t = clean(args.title, 80); need(t, 400, 'Please add a title.'); x.title = t; }
    if (args.at !== undefined) { need(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(args.at)), 400, 'Please choose a date and time.', 'at'); x.at = args.at; }
    if (args.withName !== undefined) x.withName = clean(args.withName, 60); return apptView(db, x);
  });
  act('appt.delete', true, (db, a, args, env) => { const x = db.care.appts[args.id]; need(x && (x.createdBy === a.id || x.momId === a.id), 404, 'Appointment not found.'); delete db.care.appts[x.id]; audit(db, env, x.momId, a, 'Removed appointment', x.title); return { ok: true }; });

  /* ---------- messages ---------- */
  act('thread.list', false, (db, a, args, env) => visibleThreads(db, a, env));
  act('thread.messages', false, (db, a, args, env) => {
    const t = threadInfo(db, a, String(args.threadId), env); need(t, 403, 'You don’t have access to that conversation.', 'no_access');
    return { thread: { id: t.id, title: t.title, kind: t.kind, members: t.members.map((id) => pubUser(user(db, id))).filter(Boolean) }, messages: db.care.messages.filter((m) => m.tid === t.id).map((m) => ({ id: m.id, at: m.at, text: m.text, author: pubUser(user(db, m.authorId)) || { name: 'Former member', role: '' }, mine: m.authorId === a.id })) };
  });
  act('thread.send', true, (db, a, args, env) => {
    const t = threadInfo(db, a, String(args.threadId), env); need(t, 403, 'You don’t have access to that conversation.', 'no_access');
    const text = clean(args.text, 2000); need(text, 400, 'Please write a message.'); need(!SSN.test(text), 400, 'That looks like a Social Security number — please don’t send it in messages.', 'phi');
    const m = { id: env.uid(), tid: t.id, authorId: a.id, text, at: iso(env) }; db.care.messages.push(m); return { id: m.id };
  });
  act('thread.unsend', true, (db, a, args) => { const i = db.care.messages.findIndex((m) => m.id === args.messageId && m.authorId === a.id); need(i >= 0, 404, 'Message not found.'); db.care.messages.splice(i, 1); return { ok: true }; });

  /* ---------- billing (doula) ---------- */
  act('claim.checks', false, (db, a, args, env) => { mustRole(a, 'doula'); return claimChecks(db, a, args.momId, args.units == null ? 1 : args.units, env); });
  const claimInput = (db, a, args, env) => {
    const sv = SERVICES[args.serviceKey]; need(sv, 400, 'Choose a service.'); const units = Math.max(1, Math.min(4, Math.floor(Number(args.units) || 1)));
    need(/^\d{4}-\d{2}-\d{2}$/.test(String(args.date)), 400, 'Please choose the date of service.', 'date');
    return { serviceKey: args.serviceKey, service: sv[0], units, amount: sv[1] * units, date: args.date };
  };
  act('claim.create', true, (db, a, args, env) => {
    mustRole(a, 'doula'); need(activeGrant(db, args.momId, a.id, env), 403, 'No access.', 'no_access');
    const c = db.care.claims[env.uid()] = Object.assign({ id: null, ref: 'CLM-' + (++claimSeq), doulaId: a.id, momId: args.momId, status: 'draft', reason: '', createdAt: iso(env) }, claimInput(db, a, args, env)); c.id = Object.keys(db.care.claims).find((k) => db.care.claims[k] === c);
    return claimView(db, c);
  });
  act('claim.update', true, (db, a, args, env) => {
    const c = db.care.claims[args.id]; need(c && c.doulaId === a.id && c.status === 'draft', 404, 'Only draft claims can be edited.'); Object.assign(c, claimInput(db, a, Object.assign({ date: c.date }, args), env)); return claimView(db, c);
  });
  act('claim.delete', true, (db, a, args) => { const c = db.care.claims[args.id]; need(c && c.doulaId === a.id && c.status !== 'paid' && c.status !== 'submitted', 404, 'Only draft or denied claims can be deleted.'); delete db.care.claims[c.id]; return { ok: true }; });
  act('claim.submit', true, (db, a, args, env) => {
    const c = db.care.claims[args.id]; need(c && c.doulaId === a.id && (c.status === 'draft' || c.status === 'denied'), 404, 'Claim not found.');
    const bad = claimChecks(db, a, c.momId, c.units, env).filter((x) => !x.ok); need(!bad.length, 422, 'Not ready to submit: ' + bad.map((b) => b.label.toLowerCase()).join('; ') + '.', 'checks');
    c.status = 'submitted'; c.reason = ''; return claimView(db, c);
  });
  act('claim.simulate', true, (db, a, args, env) => { // demo: pretend the payer responded
    const c = db.care.claims[args.id]; need(c && c.doulaId === a.id && c.status === 'submitted', 404, 'Claim not found.'); c.status = 'paid'; return claimView(db, c);
  });

  /* ---------- export & funding ---------- */
  act('mom.export', true, (db, a, args, env) => {
    mustRole(a, 'mom'); const s = A['mom.state'].fn(db, a, {}, env); audit(db, env, a.id, a, 'Exported', 'Birth plan and care data (JSON)');
    const msgs = visibleThreads(db, a, env).map((t) => ({ thread: t.title, messages: db.care.messages.filter((m) => m.tid === t.id).map((m) => ({ at: m.at, from: (db.users[m.authorId] || {}).name, text: m.text })) }));
    return { exportedAt: iso(env), account: { name: a.name, email: a.email }, plan: s.plan, sections: s.sections, team: s.team.map((t) => ({ name: t.user.name, role: t.user.role, sections: t.sections, expiry: t.expiry })), appointments: s.appts, accessLog: s.audit, messages: msgs };
  });
  act('scholarship.create', true, (db, a, args, env) => {
    const track = ['doula', 'night', 'prep', 'train'].includes(args.track) ? args.track : null; need(track, 400, 'Choose a scholarship.');
    const s = db.care.scholarships[env.uid()] = { id: null, userId: a.id, track, status: 'received', at: iso(env) }; s.id = Object.keys(db.care.scholarships).find((k) => db.care.scholarships[k] === s); return { id: s.id };
  });

  /* ================================================================== lifecycle hooks */
  function onRegister(db, u, env) {
    ensure(db); u.profile = u.profile || defaultProfile(u.role);
    if (u.role === 'mom') getPlan(db, u.id, env);
    Object.values(db.care.invites).forEach((i) => {
      if (i.status === 'pending' && i.email === u.email && i.kind === u.role) { i.status = 'accepted'; ensureGrant(db, i.momId, u.id, env); const mom = user(db, i.momId); if (mom) audit(db, env, i.momId, u, 'Joined your team', u.name + ' accepted your invitation — no sections shared yet'); }
    });
  }
  function removeUser(db, id) {
    const c = ensure(db);
    delete c.plans[id];
    Object.values(c.grants).forEach((g) => { if (g.momId === id || g.granteeId === id) delete c.grants[g.id]; });
    ['invites', 'intros', 'recs', 'claims', 'notes', 'scholarships', 'bglass'].forEach((k) => Object.values(c[k]).forEach((x) => { if (x.momId === id || x.toId === id || x.clinicianId === id || x.doulaId === id || x.userId === id || x.requestedBy === id) delete c[k][x.id]; }));
    Object.values(c.appts).forEach((x) => { if (x.momId === id) delete c.appts[x.id]; });
    Object.keys(c.acks).forEach((k) => { if (k.startsWith(id + ':') || k.endsWith(':' + id)) delete c.acks[k]; });
    c.messages = c.messages.filter((m) => m.authorId !== id && !m.tid.split(':').slice(1).includes(id));
    c.audit = c.audit.filter((e) => e.momId !== id && e.actorId !== id);
  }

  /* The one entry point both adapters use. */
  function handle(db, actor, action, args, env) {
    ensure(db);
    const h = A[action]; need(h, 404, 'Unknown action.', 'unknown_action'); need(actor, 401, 'Please sign in.', 'unauthenticated');
    const result = h.fn(db, actor, args || {}, env);
    return { result, dirty: h.w };
  }

  /* ================================================================== demo scenario */
  function demoPeople(env) {
    const d = (days) => new Date(env.now() + days * DAY).toISOString().slice(0, 10);
    const pro = (o) => Object.assign({ headline: '', title: '', org: '', cert: '', yearsPractice: '', languages: ['English'], insurance: [], settings: [], services: [], listed: true, align: [0, 0, 0, 0, 0] }, o);
    const mom = (o) => Object.assign(defaultProfile('mom'), o);
    return [
      { email: 'mom@demo.doulashouse.test', name: 'Amara Bell', role: 'mom', city: 'Brooklyn, NY', profile: mom({ dueDate: d(42), state: 'NY', plan: 'Medicaid', memberLast4: '3394' }) },
      { email: 'doula@demo.doulashouse.test', name: 'Imani Brooks', role: 'doula', city: 'Brooklyn, NY', profile: pro({ headline: 'Birth & postpartum doula — you won’t have to explain yourself twice.', cert: 'DONA', yearsPractice: '8', org: 'Rooted Birth Doula Care', languages: ['English'], insurance: ['Medicaid', 'Private'], settings: ['hospital', 'birthcenter', 'home'], services: ['Birth', 'Postpartum'] }) },
      { email: 'clinician@demo.doulashouse.test', name: 'Dr. Lena Okafor', role: 'clinician', city: 'Brooklyn, NY', profile: pro({ title: 'OB-GYN', org: 'Mercy Women’s Hospital', languages: ['English', 'Igbo'], insurance: ['Medicaid', 'Private'], settings: ['hospital'], align: [1, 1, 1, 1, 0] }) },
      { email: 'admin@demo.doulashouse.test', name: 'Doula’s House Staff', role: 'admin', city: '', profile: {} },
      { email: 'danielle@demo.doulashouse.test', name: 'Danielle Reyes', role: 'mom', city: 'Queens, NY', profile: mom({ dueDate: d(133), state: 'NY', plan: 'Medicaid', memberLast4: '4821' }) },
      { email: 'simone@demo.doulashouse.test', name: 'Simone Taylor', role: 'mom', city: 'Bronx, NY', profile: mom({ dueDate: d(-14), state: 'NY', plan: 'Medicaid', memberLast4: '7710' }) },
      { email: 'priya@demo.doulashouse.test', name: 'Priya Shah', role: 'mom', city: 'Newark, NJ', profile: mom({ dueDate: d(84), state: 'NJ', plan: 'Private', memberLast4: '2208' }) },
      { email: 'rosa@demo.doulashouse.test', name: 'Rosa Delgado', role: 'doula', city: 'Queens, NY', profile: pro({ cert: 'CAPPA', yearsPractice: '6', languages: ['English', 'Spanish'], insurance: ['Medicaid'], settings: ['hospital', 'birthcenter'], services: ['Birth', 'Postpartum'] }) },
      { email: 'meiling@demo.doulashouse.test', name: 'Mei-Ling Chow', role: 'doula', city: 'Manhattan, NY', profile: pro({ cert: 'DONA', yearsPractice: '11', languages: ['English', 'Mandarin', 'Cantonese'], insurance: ['Private', 'Medicaid'], settings: ['hospital', 'home'], services: ['Birth', 'Postpartum'] }) },
      { email: 'fatou@demo.doulashouse.test', name: 'Fatou Diallo', role: 'doula', city: 'Bronx, NY', profile: pro({ cert: 'Community-trained', yearsPractice: '5', languages: ['English', 'French', 'Wolof'], insurance: ['Medicaid', 'Sliding scale'], settings: ['hospital', 'birthcenter'], services: ['Birth', 'Postpartum'] }) },
      { email: 'hannah@demo.doulashouse.test', name: 'Hannah Weiss', role: 'doula', city: 'Brooklyn, NY', profile: pro({ cert: 'ProDoula', yearsPractice: '9', languages: ['English', 'Hebrew'], insurance: ['Private'], settings: ['home', 'hospital'], services: ['Birth'] }) },
      { email: 'sarah@demo.doulashouse.test', name: 'Sarah Nguyen, CNM', role: 'clinician', city: 'Brooklyn, NY', profile: pro({ title: 'Certified nurse-midwife', org: 'Maple Birth Center', languages: ['English', 'Vietnamese'], insurance: ['Medicaid', 'Private'], settings: ['birthcenter'], align: [1, 1, 1, 1, 1] }) },
      { email: 'carlos@demo.doulashouse.test', name: 'Dr. Carlos Rivera', role: 'clinician', city: 'Queens, NY', profile: pro({ title: 'OB-GYN', org: 'Harbor Perinatal', languages: ['English', 'Spanish'], insurance: ['Medicaid', 'Private'], settings: ['hospital'], align: [1, 1, 1, 1, 0] }) },
      { email: 'joy@demo.doulashouse.test', name: 'Joy Adeyemi, LM', role: 'clinician', city: 'Brooklyn, NY', profile: pro({ title: 'Licensed midwife', org: 'Rooted Home Birth', languages: ['English'], insurance: ['Private', 'Sliding scale'], settings: ['home'], align: [1, 1, 1, 1, 1] }) }
    ];
  }
  const DEMO_TESTIMONIALS = [
    { name: 'Maya R.', roleLabel: 'Mom of two · Queens, NY', audience: 'families', quote: 'Having my doula and my OB literally looking at the same plan changed everything. When I said something felt wrong at 3 a.m., nobody had to guess what I wanted — they already knew.' },
    { name: 'Dana W.', roleLabel: 'Birth doula · 9 years', audience: 'doulas', quote: 'For years I was on the outside of the hospital door. Now the nurse can message me, I can see the sections a family has chosen to share, and I’m finally getting paid for the prenatal visits I always did for free.' },
    { name: 'Dr. Evelyn T.', roleLabel: 'OB-GYN', audience: 'clinicians', quote: 'A structured plan that arrives before the patient does is a gift. I know her preferences, who her support people are, and the phrase she wants us to respond to. It makes me a better clinician.' },
    { name: 'Keisha M.', roleLabel: 'First-time mom · Newark, NJ', audience: 'families', quote: 'The night-nurse scholarship meant I slept for the first time in days and was able to recover. I cried when I got the email.' },
    { name: 'Rosa D.', roleLabel: 'Community doula', audience: 'doulas', quote: 'The training scholarship is the reason I’m certified. My neighbours finally have a doula who speaks their language and knows their block.' },
    { name: 'Sarah N., CNM', roleLabel: 'Nurse-midwife', audience: 'clinicians', quote: 'I love that families control access section by section. It builds trust — and I can see exactly what’s been shared with me and nothing more.' }
  ];
  const DEMO_TEXT = {
    env: 'Dim lights, quiet room, my playlist on low. Freedom to move, a birth ball and the shower or tub if possible.',
    pain: 'Start with breathing, counter-pressure and water. I’m open to an epidural if labor stalls — please ask me first rather than offering unprompted.',
    interv: 'Intermittent monitoring if low-risk. Please explain options and get my consent before any induction, assisted delivery or cesarean.',
    support: 'Jordan (partner) and Imani (doula) with me throughout. Imani present in the OR if a cesarean is needed, if policy allows.',
    newborn: 'Delayed cord clamping (1+ minute), immediate skin-to-skin, delay the first bath 24 hours. Vitamin K and eye ointment are fine.',
    feeding: 'Breastfeeding. Lactation consult within 24 hours. Please talk to me before offering any formula.',
    post: 'Night nurse for the first two weeks. Doula visits in weeks 1, 2 and 4. Check-ins with Dr. Okafor at 3 days and 2 weeks. Review warning signs before discharge.',
    escalate: 'I want my concerns taken seriously. If I or my doula say something feels wrong, please pause and reassess with us.',
    culture: 'Short prayer before pushing. Please use my name and pronouns, and knock before entering.',
    health: 'Gestational hypertension — home BP log shared weekly. Rh positive. GBS result pending (36-week swab).'
  };
  /* Populate the demo scenario once users exist. Idempotent enough for first-run seeding. */
  function seedDemo(db, env) {
    ensure(db); const U = (e) => byEmail(db, e + '@demo.doulashouse.test'); const c = db.care;
    const amara = U('mom'), imani = U('doula'), lena = U('clinician'), danielle = U('danielle'), simone = U('simone'), priya = U('priya');
    const plan = (m, t) => { const p = getPlan(db, m.id, env); Object.assign(p.text, t); p.updatedAt = iso(env, -3 * DAY); };
    plan(amara, DEMO_TEXT);
    plan(danielle, { env: 'Quiet room, low lights. Partner stays the whole time.', pain: 'Hoping for an unmedicated birth, with a plan B for an epidural.', support: 'My sister and Imani.', newborn: 'Skin-to-skin right away.', post: 'My mother is staying for a month.', escalate: 'If I say “I need to stop,” please stop and talk to me.', health: 'No known conditions.' });
    plan(simone, { post: 'Rest, lactation help twice a week, and a check-in on my mood at every visit.', feeding: 'Combination feeding.', newborn: 'Baby is 2 weeks old — doing well.', support: 'My aunt and my doula.', health: 'Postpartum BP checks twice weekly.' });
    plan(priya, { pain: 'Open to an epidural; would like to try nitrous oxide first.', interv: 'Prefers a vaginal birth. Wants to discuss induction timing at 41 weeks.', health: 'Chronic hypertension on labetalol. Weekly BP log. Rh positive.' });
    const grant = (mom, who, ids, label) => { const g = ensureGrant(db, mom.id, who.id, env, label || '12 weeks'); ids.forEach((i) => { g.sections[i] = 1; }); return g; };
    grant(amara, imani, ['env', 'pain', 'interv', 'support', 'newborn', 'feeding', 'post', 'escalate']);
    grant(amara, lena, ['env', 'pain', 'interv', 'newborn', 'escalate', 'health']);
    grant(danielle, imani, ['env', 'pain', 'support', 'newborn', 'post', 'escalate']); grant(danielle, lena, ['pain', 'health']);
    grant(simone, imani, ['post', 'feeding', 'newborn', 'support']); grant(simone, lena, ['post', 'health']);
    grant(priya, lena, ['pain', 'interv']);
    const rec = (mom, st) => { const r = c.recs[env.uid()] = { id: null, momId: mom.id, clinicianId: lena.id, requestedBy: imani.id, status: st, requestedAt: iso(env, -6 * DAY), issuedAt: st === 'issued' ? iso(env, -5 * DAY) : null }; r.id = Object.keys(c.recs).find((k) => c.recs[k] === r); };
    rec(simone, 'issued');
    const at = (days, hm) => new Date(env.now() + days * DAY).toISOString().slice(0, 10) + 'T' + hm;
    [[6, '10:30', 'Prenatal visit', 'Dr. Okafor · Mercy Women’s Hospital', lena], [9, '18:00', 'Comfort-positions practice', 'Imani Brooks · with Jordan', imani], [18, '14:00', 'Hospital tour', 'Mercy Labor & Delivery', amara], [28, '09:15', '36-week visit & GBS swab', 'Dr. Okafor', lena]].forEach(([d, hm, title, w, by]) => { const x = c.appts[env.uid()] = { id: null, momId: amara.id, title, at: at(d, hm), withName: w, createdBy: by.id }; x.id = Object.keys(c.appts).find((k) => c.appts[k] === x); });
    const say = (tid, who, text, minAgo) => c.messages.push({ id: env.uid(), tid, authorId: who.id, text, at: iso(env, -minAgo * 60000) });
    say('t:' + amara.id, imani, 'Hi Dr. Okafor — Amara would like to keep intermittent monitoring if labor stays low-risk. Is that supported at Mercy?', 1500);
    say('t:' + amara.id, lena, 'Yes, as long as there are no new concerns. I’ve reviewed her plan and added my acknowledgment.', 1380);
    say('t:' + amara.id, amara, 'Thank you both. This helps me feel so much calmer.', 1300);
    say('d:' + amara.id + ':' + imani.id, imani, 'Reminder: we’ll practise the comfort positions soon. Bring Jordan if he can!', 700);
    say('d:' + amara.id + ':' + imani.id, amara, 'He’ll be there. Can we also talk about the night nurse dates?', 640);
    c.acks[amara.id + ':' + lena.id] = { at: iso(env, -2 * DAY) };
    const clm = (ref, mom, key, daysAgo, status, reason) => { const sv = SERVICES[key]; const k = env.uid(); c.claims[k] = { id: k, ref, doulaId: imani.id, momId: mom.id, serviceKey: key, service: sv[0], units: 1, amount: sv[1], date: new Date(env.now() - daysAgo * DAY).toISOString().slice(0, 10), status, reason: reason || '', createdAt: iso(env, -daysAgo * DAY) }; };
    clm('CLM-1042', danielle, 'prenatal', 13, 'paid'); clm('CLM-1043', simone, 'post', 10, 'paid'); clm('CLM-1051', amara, 'prenatal', 6, 'draft');
    clm('CLM-1052', danielle, 'prenatal', 4, 'denied', 'Missing provider recommendation on file'); clm('CLM-1053', simone, 'post', 2, 'submitted');
    c.audit.unshift({ id: env.uid(), momId: amara.id, t: iso(env, -4320 * 60000), actorId: amara.id, actorName: amara.name, actorRole: 'mom', action: 'Granted access', detail: 'Imani Brooks · 8 sections' });
    c.audit.unshift({ id: env.uid(), momId: amara.id, t: iso(env, -2900 * 60000), actorId: lena.id, actorName: lena.name, actorRole: 'clinician', action: 'Viewed', detail: 'Interventions' });
    c.audit.unshift({ id: env.uid(), momId: amara.id, t: iso(env, -1500 * 60000), actorId: imani.id, actorName: imani.name, actorRole: 'doula', action: 'Viewed', detail: 'Postpartum plan' });
  }

  return { SECTIONS, SERVICES, EXPIRY, BG_REASONS, SETTINGS, CareError, handle, ensure, onRegister, removeUser, cleanProfile, defaultProfile, demoPeople, seedDemo, DEMO_TESTIMONIALS, actions: Object.keys(A) };
});
