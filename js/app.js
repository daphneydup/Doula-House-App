/* Doula's House — care app on real, shared data.
 * Mom, doula and clinician accounts all read and write the same records through DHApi.care(...).
 * What each person can see is decided by the server (js/care-core.js), never by this file. */
(function () {
  const { icon, esc, money, toast } = DH;
  const $ = (s, r = document) => r.querySelector(s);
  const care = (action, args) => DHApi.care(action, args);
  const Care = window.DHCare;

  /* ---------------- state ---------------- */
  let U = null;               // signed-in user
  let D = null;               // role state (mom.state / pro.state)
  let tab = null, sel = null, detail = null, clientErr = null;
  let dir = { doula: null, clinician: null };
  let threads = [], thread = null, msgs = null;
  let noteEdit = null, loadedAt = null;

  const TABS = {
    mom: [['overview', 'Overview', 'home'], ['plan', 'Birth plan', 'file'], ['team', 'Care team', 'users'], ['matches', 'Find your team', 'search'], ['messages', 'Messages', 'message'], ['funding', 'Coverage & funding', 'dollar'], ['privacy', 'Privacy log', 'history']],
    doula: [['clients', 'Clients', 'users'], ['billing', 'Billing', 'dollar'], ['messages', 'Messages', 'message']],
    clinician: [['patients', 'Patients', 'users'], ['network', 'Doula network', 'heart'], ['messages', 'Messages', 'message']]
  };
  const ALIGN = ['Doulas welcomed in labor & delivery', 'Shared birth plans are reviewed', 'Escalation pathway when a concern is raised', 'Postpartum hand-off within 7 days', 'Bias & trauma-informed care training'];
  const ROLE = { mom: 'Mom', doula: 'Doula', clinician: 'Clinician', admin: 'Staff' };
    const STATES = (window.DHCoverage && window.DHCoverage.STATES) || { NY: 'New York' };
  const SETLABEL = { hospital: 'Hospital', birthcenter: 'Birth center', home: 'Home' };

  /* ---------------- helpers ---------------- */
  const fmtD = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fmtT = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const fmtAt = (at) => new Date(at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const ini = (n) => String(n || '?').split(/[ ,.@]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  const first = (n) => String(n || '').split(' ')[0];
  const stage = (m) => { if (!m.dueDate) return 'Due date not set'; const due = Date.parse(m.dueDate + 'T12:00:00'); if (due < Date.now()) return 'Postpartum · week ' + Math.max(1, Math.ceil((Date.now() - due) / (7 * 864e5))); return m.weeks + ' weeks · due ' + fmtD(m.dueDate + 'T12:00:00'); };
  const upcoming = (appts) => (appts || []).filter((a) => a.at >= new Date().toISOString().slice(0, 16));
  const head = (title, sub, right = '') => `<div class="view-head row-between"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${right}</div>`;
  const chipRec = (st) => `<span class="chip ${st === 'issued' ? 'ok' : st === 'requested' ? 'info' : 'warn'}">${icon('file')} Recommendation: ${st === 'issued' ? 'on file' : st === 'requested' ? 'requested' : 'needed'}</span>`;
  const expiryText = (e) => (e.expiresAt ? 'Ends ' + fmtD(e.expiresAt) : 'No end date');
  const empty = (icn, title, body) => `<div class="panel center" style="padding:44px 28px"><div class="icon-badge" style="margin:0 auto 14px">${icon(icn)}</div><h3 style="font-size:1.15rem">${title}</h3><p class="muted" style="max-width:52ch;margin:8px auto 0">${body}</p></div>`;

  /* ---------------- data loading ---------------- */
  async function ensureDir(role) { if (!dir[role]) dir[role] = await care('directory.list', { role }); }
  async function loadThreads() {
    threads = await care('thread.list');
    if (!threads.find((t) => t.id === thread)) thread = threads[0] ? threads[0].id : null;
    msgs = thread ? await care('thread.messages', { threadId: thread }) : null;
  }
  async function load() {
    D = await care(U.role === 'mom' ? 'mom.state' : 'pro.state');
    if (U.role === 'mom') { U.profile = D.me.profile; if (tab === 'matches') await Promise.all([ensureDir('doula'), ensureDir('clinician')]); }
    else {
      if (sel) { try { detail = await care('client.get', { momId: sel }); clientErr = null; } catch (e) { detail = null; clientErr = e.message; sel = null; } }
      if (tab === 'network') await ensureDir('doula');
    }
    if (tab === 'messages') await loadThreads();
    loadedAt = new Date(); const ls = $('#live-state'); if (ls) ls.textContent = 'Live · updated ' + loadedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  }
  async function refresh(opts = {}) { try { await load(); render(); } catch (e) { if (!opts.quiet) toast(e.message); } }
  /* Run a mutation, then reload so everything on screen is the server's truth. */
  async function run(action, args, okMsg, opts = {}) {
    try { const r = await care(action, args); if (okMsg) toast(okMsg); if (!opts.noReload) await refresh(); return r || true; } catch (e) { toast(e.message); if (!opts.noReload) await refresh({ quiet: true }); return null; }
  }

  /* ---------------- shell ---------------- */
  function renderNav() {
    const badge = (id) => { let n = 0; if (U.role === 'clinician' && id === 'patients') n = (D.recRequests || []).length + (D.intros || []).length; if (U.role === 'doula' && id === 'clients') n = (D.intros || []).length; return n ? `<span class="badge">${n}</span>` : ''; };
    $('#side-nav').innerHTML = TABS[U.role].map(([id, label, ic]) => `<button data-tab="${id}" ${tab === id ? 'aria-current="page"' : ''}>${icon(ic)}${label}${D ? badge(id) : ''}</button>`).join('');
  }
  function render() {
    if (!D) return;
    renderNav();
    const keep = document.activeElement && document.activeElement.id === 'msg' ? document.activeElement.value : null;
    $('#app').innerHTML = VIEWS[U.role][tab]();
    if (keep !== null && $('#msg')) { $('#msg').value = keep; $('#msg').focus(); }
    const chat = $('#chat'); if (chat) chat.scrollTop = chat.scrollHeight;
  }

  /* ---------------- shared: messages ---------------- */
  function messagesView() {
    if (!threads.length) return head('Messages', 'Secure threads between the people on a care team.') + empty('message', 'No conversations yet', U.role === 'mom' ? 'Conversations open when you add someone to your care team.' : 'Conversations open when a mother adds you to her care team.');
    const t = msgs && msgs.thread;
    return `${head('Messages', 'Secure threads inside the app. Notifications only ever say “you have a new message”.')}
    <div class="threads"><div>${threads.map((th) => `<button class="thread-btn" data-thread="${esc(th.id)}" aria-pressed="${thread === th.id}"><b class="small">${esc(th.title)}</b><div class="xs muted">${th.kind === 'team' ? 'Whole care team' : 'Direct'} · ${esc(th.members.map(first).join(', '))}</div></button>`).join('')}</div>
    <div class="panel" style="margin:0"><div class="panel-head"><h3>${esc(t ? t.title : '')}</h3><span class="chip ok">${icon('lock')} In-app only</span></div>
      <div class="chat" id="chat">${(msgs ? msgs.messages : []).map((m) => `<div class="bubble ${m.mine ? 'me' : ''}"><small>${esc(m.author.name)}${m.author.role ? ' · ' + ROLE[m.author.role] : ''} · ${fmtT(m.at)}</small>${esc(m.text)}${m.mine ? `<button data-act="unsend" data-id="${esc(m.id)}" style="display:block;margin-top:6px;background:none;border:0;color:inherit;opacity:.6;font-size:.7rem;text-decoration:underline;padding:0">Unsend</button>` : ''}</div>`).join('') || '<p class="muted small">No messages yet. Say hello.</p>'}</div>
      <form class="composer" id="composer"><label class="sr-only" for="msg">Message</label><input class="input" id="msg" placeholder="Write a message…" autocomplete="off" maxlength="2000"><button class="btn btn-sm" aria-label="Send">${icon('send')}</button></form>
      <p class="xs muted" style="margin:10px 0 0">Share only what the team needs. Never send Social Security numbers or full dates of birth.</p></div></div>`;
  }

  /* ---------------- shared: appointments ---------------- */
  function apptList(appts, momId, canAdd) {
    const up = upcoming(appts);
    return `<div class="panel" style="margin-top:20px"><div class="panel-head"><h3>Shared calendar</h3><span class="xs muted">Everyone on the team sees this</span></div>
      ${up.length ? up.map((a) => `<div class="list-row"><div class="avatar">${icon('calendar')}</div><div class="grow"><b>${esc(a.title)}</b><span class="sub">${fmtAt(a.at)}${a.withName ? ' · ' + esc(a.withName) : ''} · added by ${esc(a.createdByName)}</span></div>${a.createdBy === U.id || U.role === 'mom' ? `<button class="btn btn-ghost btn-xs" data-act="appt-del" data-id="${esc(a.id)}">Remove</button>` : ''}</div>`).join('') : '<p class="muted small" style="margin:0 0 6px">Nothing scheduled yet.</p>'}
      ${canAdd ? `<form class="form-grid" data-appt-form="${esc(momId || '')}" style="margin-top:14px;grid-template-columns:2fr 1.4fr 1.4fr auto;align-items:end"><div class="field"><label>Title</label><input class="input" name="title" maxlength="80" placeholder="e.g. Prenatal visit" required></div><div class="field"><label>When</label><input class="input" name="at" type="datetime-local" required></div><div class="field"><label>With / where</label><input class="input" name="withName" maxlength="60"></div><button class="btn btn-sm">Add</button></form>` : ''}</div>`;
  }

  /* ---------------- shared: reading a shared plan (doula / clinician) ---------------- */
  function planReader(d) {
    const row = (s) => `<details class="sec-item" ${s.via === 'emergency' ? 'open' : ''}><summary>${icon('chevron')}<b>${esc(s.title)}</b>${s.clinical ? '<span class="chip dark">Clinical</span>' : ''}<span class="chip ${s.via === 'emergency' ? 'warn' : 'ok'}">${s.via === 'emergency' ? 'Emergency access' : 'Shared'}</span></summary><div class="body"><p style="margin:0">${s.text ? esc(s.text) : '<span class="muted">Shared, but she hasn’t written anything here yet.</span>'}</p></div></details>`;
    const lock = (s) => `<div class="sec-locked">${icon('lock')}<span><b>${esc(s.title)}</b> — ${s.reason === 'clinical' ? 'clinical information isn’t available to non-clinical roles' : 'not shared with you'}</span></div>`;
    return d.shown.map(row).join('') + d.locked.map(lock).join('');
  }

  /* ================================================================== MOM */
  const planDone = () => D.sections.filter((s) => (D.plan.text[s.id] || '').trim().length > 10).length;
  const teamBy = (role) => D.team.filter((t) => t.user.role === role);

  function momOverview() {
    const m = D.me, p = m.profile, views = D.audit.filter((e) => e.actorId !== m.id && /^Viewed/.test(e.action)).length;
    const todo = [];
    if (!p.dueDate) todo.push(['warn', 'To do', 'Add your due date', 'So your team knows where you are. <a href="account.html#profile">Open your profile</a>']);
    if (!D.team.length) todo.push(['warn', 'To do', 'Add your doula or clinician', 'Invite them by email on <a href="#" data-tab-link="team">Care team</a> — or browse <a href="#" data-tab-link="matches">Find your team</a>.']);
    if (D.team.length && D.team.some((t) => !t.sections.length)) todo.push(['warn', 'To do', 'Choose what to share', 'Someone on your team can’t see anything yet. <a href="#" data-tab-link="plan">Open your birth plan</a>.']);
    if (D.team.length && D.team.some((t) => !t.sections.includes('escalate'))) todo.push(['warn', 'To do', 'Share “Advocacy & escalation”', 'So everyone knows how to respond if you raise a concern.']);
    if (teamBy('doula').length && teamBy('clinician').length && !D.recs.length) todo.push(['warn', 'To do', 'Request a provider recommendation', 'Many Medicaid plans need one before your doula can bill. <a href="#" data-tab-link="funding">Coverage &amp; funding</a>']);
    D.recs.forEach((r) => todo.push([r.status === 'issued' ? 'ok' : 'info', r.status === 'issued' ? 'Done' : 'Waiting', 'Recommendation from ' + esc(r.clinician.name), r.status === 'issued' ? 'Issued ' + fmtD(r.issuedAt) + '.' : 'Requested ' + fmtD(r.requestedAt) + '.']));
    D.team.filter((t) => t.ack).forEach((t) => todo.push([t.ack.at >= D.plan.updatedAt ? 'ok' : 'info', t.ack.at >= D.plan.updatedAt ? 'Done' : 'Update', esc(t.user.name) + ' acknowledged your plan', t.ack.at >= D.plan.updatedAt ? 'On ' + fmtD(t.ack.at) + '.' : 'You’ve changed your plan since — they’ll review it again.']));
    if (!todo.length) todo.push(['ok', 'All set', 'Nothing needs your attention', 'Your team is in place and your plan is shared.']);
    return `${head('Hi, ' + esc(first(m.name)), p.dueDate ? `You’re <b>${m.weeks} weeks</b> along — due <b>${fmtD(p.dueDate + 'T12:00:00')}</b>.` : 'Add your due date in your profile to see your week count.', p.dueDate ? `<span class="chip gold">${icon('calendar')} ${Math.max(0, 40 - m.weeks)} weeks to go</span>` : '')}
    ${D.emergency.length ? `<div class="alert bad" style="margin-bottom:20px">${icon('alert')}<span><b>Emergency access in use.</b> ${D.emergency.map((e) => `${esc(e.by)} (${esc(e.reason)}) until ${fmtT(e.until)}`).join('; ')}. They can see your clinical sections only. Details are in your <a href="#" data-tab-link="privacy">Privacy log</a>.</span></div>` : ''}
    <div class="grid g3" style="gap:16px">
      <div class="kpi"><b>${planDone()}/${D.sections.length}</b><span>birth plan sections written</span><div class="progress" style="margin-top:12px"><i style="width:${Math.round(planDone() * 100 / D.sections.length)}%"></i></div></div>
      <div class="kpi"><b>${D.team.length}</b><span>${D.team.length === 1 ? 'person' : 'people'} on your care team</span></div>
      <div class="kpi"><b>${views}</b><span>times your team viewed your plan</span></div>
    </div>
    <div class="grid g2" style="margin-top:20px">
      <div class="panel" style="margin:0"><div class="panel-head"><h3>Your to-do list</h3></div>${todo.map((t) => `<div class="list-row"><span class="chip ${t[0]}">${t[1]}</span><div class="grow"><b>${t[2]}</b><span class="sub">${t[3]}</span></div></div>`).join('')}</div>
      <div style="display:grid;gap:20px;align-content:start">
        <div class="panel" style="margin:0"><div class="panel-head"><h3>Your team</h3><a class="link-arrow" href="#" data-tab-link="team">Manage ${icon('arrow')}</a></div>${D.team.map((t) => `<div class="list-row"><div class="avatar">${esc(ini(t.user.name))}</div><div class="grow"><b>${esc(t.user.name)}</b><span class="sub">${ROLE[t.user.role]}${t.user.org ? ' · ' + esc(t.user.org) : ''} · ${t.sections.length} sections shared</span></div></div>`).join('') || '<p class="muted small" style="margin:0">Nobody yet.</p>'}</div>
      </div>
    </div>
    ${apptList(D.appts, null, true)}
    <div class="alert cream" style="margin-top:20px">${icon('shield')}<span><b>You’re in control.</b> Only people you’ve added can see your plan — and only the sections you choose. Review or change this in <a href="#" data-tab-link="team">Care team</a> or <a href="#" data-tab-link="privacy">Privacy log</a>.</span></div>`;
  }

  function matrix() {
    if (!D.team.length) return `<div class="alert cream">${icon('info')}<span>Add someone to your care team to start sharing. <a href="#" data-tab-link="team">Open Care team</a>.</span></div>`;
    const short = (n) => { const w = n.replace(/,.*$/, '').split(' '); return /^Dr\.?$/.test(w[0]) ? 'Dr. ' + w[w.length - 1] : w[0]; };
    return `<div class="table-wrap" style="border:0"><table class="matrix"><thead><tr><th scope="col">Section</th>${D.team.map((t) => `<th scope="col">${esc(short(t.user.name))}<br><span style="font-weight:500;letter-spacing:0;text-transform:none">${ROLE[t.user.role]}</span></th>`).join('')}</tr></thead><tbody>
    ${D.sections.map((s) => `<tr><td>${esc(s.title)} ${s.clinical ? '<span class="chip dark" style="height:22px;font-size:.62rem;margin-left:6px">Clinical</span>' : ''}</td>${D.team.map((t) => (s.clinical && t.user.role !== 'clinician') ? `<td><span class="lock" title="Clinical information can only be shared with clinicians">${icon('lock')}</span></td>` : `<td><label class="switch"><input type="checkbox" data-share="${esc(s.id)}" data-who="${esc(t.user.id)}" ${t.sections.includes(s.id) ? 'checked' : ''} aria-label="${esc(s.title)} — ${esc(t.user.name)}"><span class="track"></span></label></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function momPlan() {
    return `${head('Birth plan', 'Write in your own words, then choose exactly who can see each section. Your team sees changes the moment you make them.', `<button class="btn btn-ghost btn-sm" data-act="export">Download my data</button>`)}
    <div class="panel"><div class="panel-head"><div><h3>Who can see what</h3><span class="sub muted small">Every change is logged for you in the Privacy log.</span></div><span class="chip info">${icon('lock')} Consent-first</span></div>${matrix()}
      <div class="alert cream" style="margin-top:12px">${icon('info')}<span><b>Why the locks?</b> Clinical details (like health history) can only be shared with clinicians. A doula can never receive them.</span></div></div>
    <div class="panel"><div class="panel-head"><h3>Your sections</h3><span class="xs muted">${planDone()} of ${D.sections.length} written</span></div>
    ${D.sections.map((s) => { const who = D.team.filter((t) => t.sections.includes(s.id)); return `<details class="sec-item"><summary>${icon('chevron')}<b>${esc(s.title)}</b>${s.clinical ? '<span class="chip dark">Clinical</span>' : ''}<span class="chip ${who.length ? 'ok' : ''}">${who.length ? 'Shared with ' + who.length : 'Private'}</span></summary>
      <div class="body">${s.custom ? `<div class="row" style="margin-bottom:10px;flex-wrap:nowrap"><input class="input" style="flex:1;min-height:42px" data-ctitle="${esc(s.id)}" value="${esc(s.title)}" aria-label="Section title" maxlength="60"><button class="btn btn-ghost btn-xs" data-act="del-section" data-id="${esc(s.id)}">Delete section</button></div>` : ''}
      <textarea class="textarea" data-plan="${esc(s.id)}" aria-label="${esc(s.title)}" placeholder="${esc(s.hint)}" maxlength="4000">${esc(D.plan.text[s.id] || '')}</textarea>
      <div class="row" style="margin-top:10px">${who.map((t) => `<span class="chip info">${esc(t.user.name)}</span>`).join('') || '<span class="xs muted">Not shared with anyone</span>'}</div></div></details>`; }).join('')}
      <form id="sec-form" class="composer" style="margin-top:14px"><label class="sr-only" for="sec-title">New section title</label><input class="input" id="sec-title" placeholder="Add your own section (e.g. Siblings, Pets, Photography)" maxlength="60" autocomplete="off"><button class="btn btn-sm">Add section</button></form></div>`;
  }

  function momTeam() {
    const ackChip = (t) => t.user.role !== 'clinician' ? '' : !t.ack ? '<span class="chip">Hasn’t reviewed yet</span>' : t.ack.at >= D.plan.updatedAt ? '<span class="chip ok">Acknowledged</span>' : '<span class="chip warn">Plan updated since</span>';
    const sm = 'style="width:auto;min-height:40px;padding:8px 40px 8px 14px;font-size:.82rem"';
    return `${head('Care team', 'Everyone supporting you, what they can see, and when their access ends.')}
    <div class="panel">${D.team.map((t) => `<div class="list-row" style="flex-wrap:wrap">
      <div class="avatar">${esc(ini(t.user.name))}</div>
      <div class="grow" style="min-width:200px"><b>${esc(t.user.name)}</b><span class="sub">${ROLE[t.user.role]}${t.user.org ? ' · ' + esc(t.user.org) : ''}${t.user.cert ? ' · ' + esc(t.user.cert) : ''} · ${t.sections.length} of ${D.sections.filter((s) => t.user.role === 'clinician' || !s.clinical).length} sections shared · ${expiryText(t.expiry)}</span></div>${ackChip(t)}
      <select class="select" ${sm} data-expiry="${esc(t.user.id)}" aria-label="Access end for ${esc(t.user.name)}">${Object.keys(Care.EXPIRY).map((o) => `<option ${t.expiry.label === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
      <button class="btn btn-ghost btn-xs" data-act="remove-member" data-id="${esc(t.user.id)}" data-name="${esc(t.user.name)}">Remove</button></div>`).join('') || '<p class="muted small" style="margin:0 0 4px">Nobody yet — add someone below.</p>'}
      ${D.invites.map((i) => `<div class="list-row" style="flex-wrap:wrap"><div class="avatar">${esc(ini(i.email))}</div><div class="grow" style="min-width:200px"><b>${esc(i.email)}</b><span class="sub">Invitation sent — they get access only after they join <i>and</i> you choose sections</span></div><span class="chip warn">Pending</span><select class="select" ${sm} data-invkind="${esc(i.id)}" aria-label="Role"><option value="doula" ${i.kind === 'doula' ? 'selected' : ''}>Doula</option><option value="clinician" ${i.kind === 'clinician' ? 'selected' : ''}>Clinician</option></select><button class="btn btn-ghost btn-xs" data-act="cancel-invite" data-id="${esc(i.id)}">Cancel</button></div>`).join('')}</div>
    <div class="panel"><h3>Add someone</h3><p class="muted small">Enter the email they use for Doula’s House. If they already have an account they’re added right away — with <b>nothing shared</b> until you choose. If not, they’re invited.</p>
      <form id="invite-form" class="form-grid" style="margin-top:12px"><div class="field"><label for="inv-email">Their email</label><input class="input" id="inv-email" type="email" required placeholder="name@example.com"></div>
      <div class="field"><label for="inv-kind">They are a</label><select class="select" id="inv-kind"><option value="doula">Doula</option><option value="clinician">Clinician (OB-GYN, midwife…)</option></select></div>
      <div class="full"><button class="btn btn-sm">Add to my team</button></div></form></div>`;
  }

  function scoreFor(kind, d) {
    const p = D.me.profile.prefs || {}; let s = 20; const why = [];
    const lang = p.lang || 'any', ins = p.ins || 'Medicaid';
    if (lang === 'any' || (d.languages || []).includes(lang)) { s += kind === 'doula' ? 28 : 25; if (lang !== 'any') why.push('Speaks ' + lang); } else s -= 10;
    if ((d.insurance || []).includes(ins) || (ins === 'Self-pay' && (d.insurance || []).includes('Sliding scale'))) { s += kind === 'doula' ? 22 : 20; why.push(ins === 'Self-pay' ? 'Sliding scale' : 'Accepts ' + ins); }
    if ((d.settings || []).includes(p.setting)) { s += kind === 'doula' ? 18 : 20; why.push(SETLABEL[p.setting] + (kind === 'doula' ? ' births' : '')); }
    if (kind === 'doula') { if (p.post !== false && (d.services || []).includes('Postpartum')) { s += 6; why.push('Postpartum support'); } }
    else { const a = (d.align || []).reduce((x, y) => x + y, 0); s += a * 3; why.push('Doula-aligned ' + a + '/5'); }
    return { s: Math.max(20, Math.min(99, s)), why };
  }
  function matchRow(kind, d, sc) {
    const onTeam = D.team.find((t) => t.user.id === d.id), intro = D.intros.find((i) => i.to.id === d.id && i.status === 'pending'), declined = D.intros.find((i) => i.to.id === d.id && i.status === 'declined');
    const btn = onTeam ? '<span class="chip ok">On your team</span>' : intro ? `<button class="btn btn-ghost btn-sm" data-act="intro-cancel" data-id="${esc(intro.id)}">Requested · undo</button>` : declined ? '<span class="chip">Not available</span>' : `<button class="btn btn-sm" data-act="intro" data-id="${esc(d.id)}">Request intro</button>`;
    return `<div class="match-card"><div class="score" style="--p:${sc.s}" data-s="${sc.s}%" aria-label="${sc.s}% match"></div><div><b>${esc(d.name)}</b> <span class="muted small">· ${esc(kind === 'doula' ? [d.cert, d.yearsPractice && d.yearsPractice + ' yrs', d.city].filter(Boolean).join(' · ') : [d.title, d.org].filter(Boolean).join(' · '))}</span>
      ${d.headline ? `<div class="small muted" style="margin-top:2px">${esc(d.headline)}</div>` : ''}<div class="row" style="gap:6px;margin-top:8px">${sc.why.map((w) => `<span class="chip">${esc(w)}</span>`).join('')}</div></div>${btn}</div>`;
  }
  function momMatches() {
    const p = D.me.profile.prefs || {};
    const sel2 = (id, opts, val) => `<select class="select" data-pref="${id}">${opts.map(([v, l]) => `<option value="${v}" ${String(val) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const rank = (kind) => (dir[kind] || []).filter((d) => d.id !== U.id).map((d) => ({ d, sc: scoreFor(kind, d) })).sort((a, b) => b.sc.s - a.sc.s);
    return `${head('Find your team', 'Real doulas and clinicians on Doula’s House, matched on language, coverage, birth setting and how doula-aligned they are. An introduction shares only your first name, city and due month.')}
    <div class="panel"><div class="form-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
      <div class="field"><label>Language</label>${sel2('lang', [['any', 'Any'], ['English', 'English'], ['Spanish', 'Spanish'], ['French', 'French'], ['Mandarin', 'Mandarin'], ['Cantonese', 'Cantonese'], ['Hebrew', 'Hebrew']], p.lang || 'any')}</div>
      <div class="field"><label>Birth setting</label>${sel2('setting', [['hospital', 'Hospital'], ['birthcenter', 'Birth center'], ['home', 'Home']], p.setting || 'hospital')}</div>
      <div class="field"><label>Coverage</label>${sel2('ins', [['Medicaid', 'Medicaid'], ['Private', 'Private insurance'], ['Self-pay', 'Self-pay / need help']], p.ins || 'Medicaid')}</div>
      <div class="field"><label>Postpartum</label>${sel2('post', [['true', 'I want postpartum support'], ['false', 'Birth only']], p.post !== false)}</div></div></div>
    <div class="panel"><div class="panel-head"><h3>Doulas</h3><span class="xs muted">${(dir.doula || []).length} listed</span></div>${rank('doula').map((x) => matchRow('doula', x.d, x.sc)).join('') || '<p class="muted small">No doulas listed yet.</p>'}</div>
    <div class="panel"><div class="panel-head"><h3>Doula-aligned clinicians</h3><span class="chip gold">${icon('star')} Alignment score</span></div>${rank('clinician').map((x) => matchRow('clinician', x.d, x.sc)).join('') || '<p class="muted small">No clinicians listed yet.</p>'}</div>`;
  }

  function momFunding() {
    const p = D.me.profile, C = window.DHCoverage;
    const ins = p.insurer || (p.plan === 'Medicaid' ? 'medicaid' : '');
    let res;
    if (!p.plan && !ins) res = `<div class="alert cream">${icon('info')}<span>Choose your coverage to see what’s likely.</span></div>`;
    else if (p.plan === 'Self-pay') res = `<div class="alert info">${icon('heart')}<span><b>Scholarships can help.</b> Apply for doula, night-nurse or baby-prep support funded by our community.</span></div>`;
    else if (ins && ins !== 'other' && C) {
      const r = C.check({ insurer: ins, state: p.state }), k = r.level === 'likely' ? 'ok' : r.level === 'possible' ? 'info' : 'warn';
      res = `<div class="alert ${k}">${icon(r.level === 'likely' ? 'check' : r.level === 'possible' ? 'info' : 'alert')}<span><b>${esc(r.title)}.</b> ${esc(r.body)}${r.ask ? `<br><b>Ask your plan:</b> ${esc(r.ask)}` : ''}<br><a class="link-arrow" href="coverage.html?insurer=${esc(ins)}&state=${esc(p.state || '')}">See all insurers ${icon('arrow')}</a></span></div>`;
    } else res = `<div class="alert info">${icon('info')}<span><b>Worth asking.</b> Some plans reimburse doula care or allow HSA/FSA funds. Ask about benefits; your doula can provide an invoice. <a class="link-arrow" href="coverage.html">See which insurers cover doulas ${icon('arrow')}</a></span></div>`;
    const cl = teamBy('clinician'), avail = cl.filter((t) => !D.recs.some((r) => r.clinician.id === t.user.id));
    const lbl = { doula: 'Doula Support', night: 'Night Nurse', prep: 'Prepare for Baby', train: 'Doula Training' };
    return `${head('Coverage & funding', 'Your coverage details are shared only with people on your care team. Based on public reporting — always confirm with your plan.')}
    <div class="panel"><h3>Coverage check</h3><div class="form-grid" style="margin:12px 0 18px;grid-template-columns:repeat(2,minmax(0,1fr))"><div class="field"><label>State</label><select class="select" data-cov="state"><option value="">Choose…</option>${Object.entries(STATES).map(([k, v]) => `<option value="${k}" ${p.state === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label>Plan type</label><select class="select" data-cov="plan">${['', 'Medicaid', 'Private', 'Self-pay'].map((o) => `<option value="${o}" ${p.plan === o ? 'selected' : ''}>${o || 'Choose…'}</option>`).join('')}</select></div>
      <div class="field"><label>Insurer</label><select class="select" data-cov="insurer"><option value="">Choose…</option>${((window.DHCoverage && window.DHCoverage.INSURERS) || []).map((i) => `<option value="${i.id}" ${p.insurer === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}<option value="other" ${p.insurer === 'other' ? 'selected' : ''}>Other / not listed</option></select></div>
      <div class="field"><label>Member ID · last 4</label><input class="input" data-cov="memberLast4" inputmode="numeric" maxlength="4" value="${esc(p.memberLast4 || '')}"></div></div>${res}</div>
    <div class="panel"><div class="panel-head"><h3>Provider recommendation</h3><span class="xs muted">Needed by many Medicaid plans before a doula can bill</span></div>
      ${D.recs.map((r) => `<div class="list-row"><div class="avatar">${esc(ini(r.clinician.name))}</div><div class="grow"><b>${esc(r.clinician.name)}</b><span class="sub">${r.status === 'issued' ? 'Issued ' + fmtD(r.issuedAt) : 'Requested ' + fmtD(r.requestedAt)}</span></div><span class="chip ${r.status === 'issued' ? 'ok' : 'info'}">${r.status === 'issued' ? 'On file' : 'Requested'}</span></div>`).join('')}
      ${avail.length ? `<form id="rec-form" class="row" style="margin-top:12px;gap:10px"><select class="select" id="rec-who" style="width:auto" aria-label="Clinician">${avail.map((t) => `<option value="${esc(t.user.id)}">${esc(t.user.name)}</option>`).join('')}</select><button class="btn btn-sm">Request recommendation</button></form>` : (cl.length ? '' : '<p class="muted small" style="margin:8px 0 0">Add a clinician to your care team to request one.</p>')}</div>
    <div class="panel"><div class="panel-head"><h3>Scholarships</h3><a class="link-arrow" href="shop.html#scholarships">Apply ${icon('arrow')}</a></div>
      ${D.scholarships.map((s) => `<div class="list-row"><div class="avatar">${icon('heart')}</div><div class="grow"><b>${lbl[s.track] || esc(s.track)}</b><span class="sub">Applied ${fmtD(s.at)}</span></div><span class="chip info">Received</span></div>`).join('') || '<p class="muted small" style="margin:0">No applications yet. Scholarships are funded by merch sales and donations.</p>'}</div>`;
  }

  function momPrivacy() {
    return `${head('Privacy log', 'Every time your plan was viewed, shared, changed or exported — by anyone. Only you can see this page.')}
    <div class="panel"><div class="panel-head"><h3>Access history</h3><span class="chip ok">${icon('shield')} ${D.audit.length} events</span></div>
      <div class="table-wrap" style="border:0"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead><tbody>${D.audit.map((a) => `<tr><td class="tabular small">${fmtT(a.t)}</td><td>${esc(a.actorName)} <span class="xs muted">${ROLE[a.actorRole] || ''}</span></td><td><span class="chip ${/Emergency/.test(a.action) ? 'bad' : /Revoked|Removed|Cancel/.test(a.action) ? 'warn' : /Viewed/.test(a.action) ? '' : 'info'}">${esc(a.action)}</span></td><td class="small">${esc(a.detail)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="grid g2" style="margin-top:20px"><div class="panel" style="margin:0"><h3>Your rights</h3><ul class="check-list" style="margin-top:12px"><li>${icon('check')}<span>See who accessed your plan</span></li><li>${icon('check')}<span>Remove anyone, instantly</span></li><li>${icon('check')}<span>Download a copy of your data</span></li><li>${icon('check')}<span>Delete your account and everything in it</span></li></ul></div>
    <div class="panel" style="margin:0"><h3>Quick actions</h3><div class="stack" style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-act="export">Download my data (JSON)</button><button class="btn btn-ghost btn-sm" data-act="remove-all">Remove everyone’s access</button><a class="btn btn-ghost btn-sm" href="account.html#profile">Delete my account…</a></div></div></div>`;
  }

  /* ================================================================== professionals */
  function clientDetail() {
    if (clientErr) return `<div class="alert warn" style="margin-top:20px">${icon('alert')}<span>${esc(clientErr)}</span></div>`;
    if (!sel || !detail) return '';
    const d = detail, m = d.mom, isDoula = U.role === 'doula';
    const bg = d.emergency ? `<div class="alert bad" style="margin-bottom:14px">${icon('alert')}<span><b>Emergency access</b> until ${fmtT(d.emergency.until)} — clinical sections only. Reason: ${esc(d.emergency.reason)}. The patient can see this in her privacy log.</span></div>` : '';
    const clinOpts = (d.clinicians || []).filter((c) => !(d.recs || []).some((r) => r.clinician.id === c.id));
    const actions = isDoula ? (d.recStatus === 'none' && clinOpts.length ? `<form data-rec-form="${esc(m.id)}" class="row" style="gap:8px"><select class="select" name="who" style="width:auto;min-height:38px;padding:6px 36px 6px 12px;font-size:.82rem">${clinOpts.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select><button class="btn btn-xs">Request recommendation</button></form>` : '') :
      `<button class="btn btn-sm ${d.ack && !d.ack.stale ? 'btn-ghost' : ''}" data-act="ack" data-id="${esc(m.id)}" ${d.emergency ? 'disabled' : ''}>${d.ack ? (d.ack.stale ? 'Plan updated — acknowledge again' : 'Plan acknowledged ✓') : 'Acknowledge plan'}</button>`;
    return `<div class="panel" id="client-detail"><div class="panel-head"><div class="row"><div class="avatar lg">${esc(ini(m.name))}</div><div><h3 style="font-size:1.25rem">${esc(m.name)}</h3><span class="sub muted small">${esc(stage(m))}${m.city ? ' · ' + esc(m.city) : ''}${d.access ? ' · ' + expiryText(d.access.expiry) : ''}</span></div></div><div class="row">${isDoula && d.recStatus ? chipRec(d.recStatus) : ''}${actions}</div></div>${bg}
      ${planReader(d)}</div>
    ${d.team ? `<div class="panel"><h3>Care team</h3><div class="row" style="margin-top:10px;gap:8px">${d.team.map((t) => `<span class="chip ${t.role === 'doula' ? 'gold' : t.role === 'clinician' ? 'info' : ''}">${esc(t.name)} · ${ROLE[t.role]}</span>`).join('')}</div></div>` : ''}
    ${d.appts ? apptList(d.appts, m.id, true) : ''}
    ${isDoula && d.notes ? `<div class="panel"><div class="panel-head"><h3>Private visit notes</h3><span class="chip dark">${icon('lock')} Only you</span></div><p class="small muted">Never visible to the mother or the clinical team.</p>
      <form id="note-form" data-mom="${esc(m.id)}" class="composer" style="margin-top:12px"><input class="input" id="note-in" placeholder="Add a note from today’s visit…" maxlength="2000" value="${noteEdit && d.notes.find((n) => n.id === noteEdit) ? esc(d.notes.find((n) => n.id === noteEdit).text) : ''}"><button class="btn btn-sm">${noteEdit ? 'Update' : 'Save'}</button>${noteEdit ? '<button type="button" class="btn btn-ghost btn-sm" data-act="cancel-note">Cancel</button>' : ''}</form>
      ${d.notes.map((n) => `<div class="list-row"><div class="avatar">${icon('edit')}</div><div class="grow"><b class="small">${esc(n.text)}</b><span class="sub">${fmtT(n.at)}${n.edited ? ' · edited' : ''} · private</span></div><button class="btn btn-ghost btn-xs" data-act="edit-note" data-id="${esc(n.id)}">Edit</button><button class="btn btn-ghost btn-xs" data-act="del-note" data-id="${esc(n.id)}">Delete</button></div>`).join('')}</div>` : ''}`;
  }
  function introsPanel() {
    if (!D.intros.length) return '';
    return `<div class="panel" style="margin-bottom:20px"><div class="panel-head"><h3>Introduction requests</h3><span class="chip warn">${D.intros.length}</span></div><p class="small muted">Mothers who’d like to meet you. They’ve shared only a first name, city and due month. Accepting adds you to her team — she then chooses what to share.</p>
      ${D.intros.map((i) => `<div class="list-row"><div class="avatar">${esc(ini(i.from.firstName))}</div><div class="grow"><b>${esc(i.from.firstName)}</b><span class="sub">${esc(i.from.city || 'Location not shared')}${i.from.dueMonth ? ' · due ' + esc(i.from.dueMonth) : ''}</span></div><button class="btn btn-sm" data-act="intro-accept" data-id="${esc(i.id)}">Accept</button><button class="btn btn-ghost btn-sm" data-act="intro-decline" data-id="${esc(i.id)}">Decline</button></div>`).join('')}</div>`;
  }
  function clientTable(cols) {
    return `<div class="panel"><div class="table-wrap" style="border:0"><table><thead><tr><th>${U.role === 'doula' ? 'Client' : 'Patient'}</th><th>Stage</th>${cols.map((c) => `<th>${c[0]}</th>`).join('')}<th>Shared</th><th></th></tr></thead><tbody>${D.clients.map((c) => `<tr><td><b>${esc(c.mom.name)}</b></td><td class="small">${esc(stage(c.mom))}</td>${cols.map((col) => `<td class="small">${col[1](c)}</td>`).join('')}<td><span class="chip ${c.shared ? 'ok' : ''}">${c.shared} of ${c.total}</span></td><td><button class="btn btn-ghost btn-xs" data-client="${esc(c.mom.id)}">${sel === c.mom.id ? 'Open' : 'View'}</button></td></tr>`).join('')}</tbody></table></div></div>`;
  }

  function doulaClients() {
    const cols = [['Next visit', (c) => (c.next ? fmtAt(c.next.at) : '—')], ['Recommendation', (c) => (c.rec === 'issued' ? '<span class="chip ok">On file</span>' : c.rec === 'requested' ? '<span class="chip info">Requested</span>' : '<span class="chip warn">Needed</span>')], ['Access', (c) => expiryText(c.expiry)]];
    return `${head('Clients', 'Mothers who have added you to their care team. You see only what each has chosen to share — the server enforces it.')}
    ${introsPanel()}
    ${D.clients.length ? clientTable(cols) : empty('users', 'No clients yet', `A mother adds you by entering your email (<b>${esc(U.email)}</b>) on her Care team page — or by requesting an introduction from the directory. Finish your <a href="account.html#profile">practice profile</a> so families can find you.`)}
    ${clientDetail()}`;
  }
  function doulaBilling() {
    const sum = (st) => D.claims.filter((c) => st.includes(c.status)).reduce((a, c) => a + c.amount, 0);
    const chip = { paid: ['ok', 'Paid'], submitted: ['info', 'Submitted'], draft: ['', 'Draft'], denied: ['bad', 'Needs fix'] };
    return `${head('Billing', 'Insurance claims from draft to payment. Clients appear by initials and member-ID suffix.', `<button class="btn btn-sm" data-act="new-claim" ${D.clients.length ? '' : 'disabled'}>New claim</button>`)}
    <div class="grid g3" style="gap:16px"><div class="kpi"><b>${money(sum(['paid']))}</b><span>Paid</span></div><div class="kpi"><b>${money(sum(['submitted']))}</b><span>Awaiting payment</span></div><div class="kpi"><b>${money(sum(['draft', 'denied']))}</b><span>Needs attention</span></div></div>
    <div class="panel" style="margin-top:20px">${D.claims.length ? `<div class="table-wrap" style="border:0"><table><thead><tr><th>Claim</th><th>Client</th><th>Service</th><th>Date</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>
    ${D.claims.map((c) => { const [k, l] = chip[c.status]; return `<tr><td class="mono">${esc(c.ref)}</td><td>${esc(c.client)} <span class="muted xs">••${esc(c.memberLast4)}</span></td><td class="small">${esc(c.service)}${c.units > 1 ? ' × ' + c.units : ''}</td><td class="small">${fmtD(c.date + 'T12:00:00')}</td><td class="num">${money(c.amount)}</td><td><span class="chip ${k}">${l}</span>${c.reason ? `<div class="xs" style="color:var(--bad);margin-top:4px">${esc(c.reason)}</div>` : ''}</td>
      <td><div class="row" style="gap:6px;flex-wrap:nowrap">${c.status === 'draft' || c.status === 'denied' ? `<button class="btn btn-ghost btn-xs" data-act="claim-submit" data-id="${esc(c.id)}">${c.status === 'denied' ? 'Resubmit' : 'Submit'}</button>` : ''}${c.status === 'draft' ? `<button class="btn btn-ghost btn-xs" data-act="claim-edit" data-id="${esc(c.id)}">Edit</button>` : ''}${c.status === 'draft' || c.status === 'denied' ? `<button class="btn btn-ghost btn-xs" data-act="claim-del" data-id="${esc(c.id)}">Delete</button>` : ''}${c.status === 'submitted' ? `<button class="btn btn-ghost btn-xs" data-act="claim-pay" data-id="${esc(c.id)}">Simulate payment</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted small" style="margin:0">No claims yet.</p>'}
      <p class="xs muted" style="margin:12px 0 0">Illustrative rates and rules. In production, codes and rates come from a verified rules service for each payer. “Simulate payment” stands in for the payer’s response. A claim can only be submitted when all pre-checks pass — the server enforces it.</p></div>`;
  }

  function clinicianPatients() {
    const cols = [['Plan', (c) => (c.ack ? (c.ack.stale ? '<span class="chip warn">Updated since</span>' : '<span class="chip ok">Acknowledged</span>') : '<span class="chip">Not reviewed</span>')], ['Access', (c) => expiryText(c.expiry)]];
    const recReqs = D.recRequests.length ? `<div class="panel" style="margin-bottom:20px"><div class="panel-head"><h3>Recommendation requests</h3><span class="chip warn">${D.recRequests.length}</span></div><p class="small muted">Requests for a provider recommendation for doula services (needed by many Medicaid plans). Issuing one tells her doula she can bill.</p>
      ${D.recRequests.map((r) => `<div class="list-row"><div class="avatar">${esc(ini(r.mom.name))}</div><div class="grow"><b>${esc(r.mom.name)}</b><span class="sub">Requested by ${esc(r.by || 'a team member')} · ${fmtD(r.requestedAt)}</span></div><button class="btn btn-sm" data-act="rec-issue" data-id="${esc(r.id)}">Issue recommendation</button></div>`).join('')}</div>` : '';
    const emerg = D.emergency.length ? `<div class="panel" style="margin-bottom:20px;border-color:#e8c9c4"><div class="panel-head"><h3>Emergency access (active)</h3><span class="chip bad">${D.emergency.length}</span></div>${D.emergency.map((e) => `<div class="list-row"><div class="avatar">${esc(ini(e.mom.name))}</div><div class="grow"><b>${esc(e.mom.name)}</b><span class="sub">${esc(e.reason)} · until ${fmtT(e.until)} · clinical sections only</span></div><button class="btn btn-ghost btn-xs" data-client="${esc(e.mom.id)}">Open</button></div>`).join('')}</div>` : '';
    return `${head('Patients', 'Birth plans shared with you by patients who have consented. You see only the sections granted to your role.')}
    ${recReqs}${introsPanel()}${emerg}
    ${D.clients.length ? clientTable(cols) : empty('users', 'No patients have shared with you yet', `A patient adds you by entering your email (<b>${esc(U.email)}</b>) on her Care team page, or by requesting an introduction. Complete your <a href="account.html#profile">practice profile</a> so families can find you.`)}
    ${clientDetail()}
    <div class="panel" style="margin-top:20px"><div class="panel-head"><div><h3>Emergency access — break glass</h3><span class="sub muted small">For a patient who hasn’t shared with you. Clinical sections only · 24 hours · reasoned, logged, and visible to her.</span></div>${icon('alert')}</div>
      <form id="bg-form" class="form-grid" style="margin-top:8px"><div class="field"><label for="bg-email">Patient’s account email</label><input class="input" id="bg-email" type="email" required></div><div class="field"><label for="bg-reason">Reason</label><select class="select" id="bg-reason">${Care.BG_REASONS.map((r) => `<option>${esc(r)}</option>`).join('')}</select></div>
      <div class="field full"><label for="bg-note">Describe the situation (min. 15 characters)</label><textarea class="textarea" id="bg-note" maxlength="300" style="min-height:80px" required></textarea></div>
      <label class="full row" style="gap:10px;font-size:.88rem;align-items:flex-start"><input type="checkbox" id="bg-ok" style="margin-top:4px"><span>I attest this access is necessary for treatment and understand it will be audited.</span></label>
      <div class="full"><button class="btn btn-danger btn-sm">Unlock for 24 hours</button></div></form></div>`;
  }
  function clinicianNetwork() {
    const score = (D.me.profile.align || []).reduce((a, b) => a + b, 0);
    return `${head('Doula network', 'Your practice’s doula-aligned commitments, and the doulas families can find.', `<span class="chip gold">${icon('star')} Doula-aligned ${score}/5</span>`)}
    <div class="grid g2"><div class="panel" style="margin:0"><h3>Alignment commitments</h3><p class="small muted">Families and doulas see this badge when they choose a clinician.</p>
      ${ALIGN.map((c, i) => `<div class="list-row"><div class="grow"><b class="small">${c}</b></div><label class="switch"><input type="checkbox" data-align="${i}" ${(D.me.profile.align || [])[i] ? 'checked' : ''} aria-label="${esc(c)}"><span class="track"></span></label></div>`).join('')}</div>
    <div class="panel" style="margin:0"><h3>Doulas in the directory</h3>${(dir.doula || []).map((d) => `<div class="list-row"><div class="avatar">${esc(ini(d.name))}</div><div class="grow"><b>${esc(d.name)}</b><span class="sub">${esc([d.cert, d.city].filter(Boolean).join(' · '))}${d.languages.length ? ' · ' + esc(d.languages.join(', ')) : ''}</span></div></div>`).join('') || '<p class="muted small">No doulas listed yet.</p>'}</div></div>`;
  }

  const VIEWS = {
    mom: { overview: momOverview, plan: momPlan, team: momTeam, matches: momMatches, messages: messagesView, funding: momFunding, privacy: momPrivacy },
    doula: { clients: doulaClients, billing: doulaBilling, messages: messagesView },
    clinician: { patients: clinicianPatients, network: clinicianNetwork, messages: messagesView }
  };

  /* ================================================================== modals */
  function modal(html) {
    let m = $('#app-modal');
    if (!m) { m = document.createElement('div'); m.id = 'app-modal'; m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); document.body.appendChild(m); }
    m.innerHTML = `<button class="modal-close" data-close aria-label="Close">${icon('x')}</button>${html}`; DH.openLayer('app-modal');
  }
  const svcOpts = (sel) => Object.entries(Care.SERVICES).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v[0]} · ${money(v[1])}</option>`).join('');
  function claimModal() {
    modal(`<h3 class="h3">New claim</h3><p class="muted small">Pre-checks run before you can submit — so problems are fixed before they become denials.</p>
      <div class="form-grid" style="margin:16px 0"><div class="field"><label for="c-client">Client</label><select class="select" id="c-client">${D.clients.map((c) => `<option value="${esc(c.mom.id)}">${esc(c.mom.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="c-service">Service</label><select class="select" id="c-service">${svcOpts()}</select></div>
      <div class="field"><label for="c-date">Date of service</label><input class="input" id="c-date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="field"><label for="c-qty">Units</label><input class="input" id="c-qty" type="number" min="1" max="4" value="1"></div></div>
      <div id="c-checks"></div><div class="row" style="margin-top:18px"><button class="btn" id="c-save">Save as draft</button><button class="btn btn-ghost" id="c-submit">Submit now</button><button class="btn btn-ghost" data-close>Cancel</button></div>`);
    const upd = async () => {
      try { const ch = await care('claim.checks', { momId: $('#c-client').value, units: +$('#c-qty').value }); const ok = ch.every((c) => c.ok);
        $('#c-checks').innerHTML = `<div class="table-wrap"><table class="mini-table">${ch.map((c) => `<tr><td>${esc(c.label)}</td><td style="text-align:right"><span class="chip ${c.ok ? 'ok' : 'bad'}">${c.ok ? 'Ready' : 'Missing'}</span></td></tr>`).join('')}</table></div>${ok ? '' : `<div class="alert warn" style="margin-top:12px">${icon('alert')}<span>You can save a draft now and submit once everything is ready. A recommendation can be requested from her client page.</span></div>`}`;
        $('#c-submit').disabled = !ok; } catch (e) { $('#c-checks').innerHTML = `<div class="alert bad">${icon('alert')}<span>${esc(e.message)}</span></div>`; }
    };
    ['c-client', 'c-qty'].forEach((id) => $('#' + id).addEventListener('input', upd)); upd();
    const payload = () => ({ momId: $('#c-client').value, serviceKey: $('#c-service').value, units: +$('#c-qty').value, date: $('#c-date').value });
    $('#c-save').addEventListener('click', async () => { if (await run('claim.create', payload(), 'Draft saved', { noReload: true })) { DH.closeLayers(); await refresh(); } });
    $('#c-submit').addEventListener('click', async () => { try { const c = await care('claim.create', payload()); await care('claim.submit', { id: c.id }); toast('Claim submitted'); DH.closeLayers(); await refresh(); } catch (e) { toast(e.message); await refresh({ quiet: true }); } });
  }
  function editClaimModal(id) {
    const c = D.claims.find((x) => x.id === id); if (!c) return;
    modal(`<h3 class="h3">Edit draft claim</h3><p class="muted small">${esc(c.ref)} · ${esc(c.client)} ••${esc(c.memberLast4)}</p>
      <div class="form-grid" style="margin:16px 0"><div class="field"><label for="e-service">Service</label><select class="select" id="e-service">${svcOpts(c.serviceKey)}</select></div><div class="field"><label for="e-qty">Units</label><input class="input" id="e-qty" type="number" min="1" max="4" value="${c.units}"></div></div>
      <div class="row"><button class="btn" id="e-save">Save changes</button><button class="btn btn-ghost" data-close>Cancel</button></div>`);
    $('#e-save').addEventListener('click', async () => { if (await run('claim.update', { id, serviceKey: $('#e-service').value, units: +$('#e-qty').value }, 'Claim updated', { noReload: true })) { DH.closeLayers(); await refresh(); } });
  }
  function confirmBox(title, text, ok) {
    return new Promise((resolve) => {
      modal(`<h3 class="h3">${esc(title)}</h3><p class="muted">${esc(text)}</p><div class="row" style="margin-top:18px"><button class="btn btn-danger" id="cb-ok">${esc(ok)}</button><button class="btn btn-ghost" id="cb-no">Cancel</button></div>`);
      $('#cb-ok').onclick = () => { DH.closeLayers(); resolve(true); }; $('#cb-no').onclick = () => { DH.closeLayers(); resolve(false); };
    });
  }

  /* ================================================================== events */
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab],[data-tab-link],[data-act],[data-thread],[data-client]'); if (!t || !t.closest('#app, #side-nav, #app-modal')) return; const d = t.dataset;
    try {
      if (d.tab || d.tabLink) { e.preventDefault(); tab = d.tab || d.tabLink; await refresh(); window.scrollTo({ top: 0 }); return; }
      if (d.thread) { thread = d.thread; msgs = await care('thread.messages', { threadId: thread }); render(); return; }
      if (d.client) { sel = d.client; noteEdit = null; await refresh(); const el = $('#client-detail'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
      const a = d.act; if (!a) return;
      if (a === 'export') { const r = await care('mom.export'); const url = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' })); const l = document.createElement('a'); l.href = url; l.download = 'doulas-house-my-data.json'; l.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Your data was downloaded — and logged in your Privacy log'); await refresh({ quiet: true }); }
      else if (a === 'remove-member') { if (await confirmBox('Remove ' + d.name + '?', 'They lose access to your plan and conversations immediately.', 'Remove')) await run('grant.remove', { granteeId: d.id }, d.name + ' removed from your team'); }
      else if (a === 'remove-all') { if (await confirmBox('Remove everyone’s access?', 'Your whole care team loses access to your plan and conversations.', 'Remove everyone')) await run('grant.removeAll', {}, 'All access removed'); }
      else if (a === 'cancel-invite') await run('invite.cancel', { id: d.id }, 'Invitation cancelled');
      else if (a === 'del-section') { if (await confirmBox('Delete this section?', 'It’s removed from your plan and from everyone you shared it with.', 'Delete')) await run('plan.deleteSection', { id: d.id }, 'Section deleted'); }
      else if (a === 'intro') await run('intro.request', { toId: d.id }, 'Introduction requested — only your first name, city and due month were shared');
      else if (a === 'intro-cancel') await run('intro.cancel', { id: d.id }, 'Request withdrawn');
      else if (a === 'intro-accept') await run('intro.respond', { id: d.id, accept: true }, 'Accepted — she’ll choose what to share with you');
      else if (a === 'intro-decline') await run('intro.respond', { id: d.id, accept: false }, 'Declined');
      else if (a === 'appt-del') await run('appt.delete', { id: d.id }, 'Removed from the calendar');
      else if (a === 'unsend') { await care('thread.unsend', { messageId: d.id }); msgs = await care('thread.messages', { threadId: thread }); render(); }
      else if (a === 'ack') await run('ack.set', { momId: d.id }, 'Plan acknowledged — she can see that you’ve reviewed it');
      else if (a === 'rec-issue') await run('rec.issue', { id: d.id }, 'Recommendation issued — her doula can now bill');
      else if (a === 'edit-note') { noteEdit = d.id; render(); const n = $('#note-in'); if (n) n.focus(); }
      else if (a === 'cancel-note') { noteEdit = null; render(); }
      else if (a === 'del-note') { noteEdit = null; await run('note.delete', { id: d.id }, 'Note deleted'); }
      else if (a === 'new-claim') claimModal();
      else if (a === 'claim-edit') editClaimModal(d.id);
      else if (a === 'claim-del') await run('claim.delete', { id: d.id }, 'Claim deleted');
      else if (a === 'claim-submit') await run('claim.submit', { id: d.id }, 'Claim submitted');
      else if (a === 'claim-pay') await run('claim.simulate', { id: d.id }, 'Payment received (simulated)');
    } catch (err) { toast(err.message); }
  });

  document.addEventListener('change', async (e) => {
    const t = e.target, d = t.dataset; if (!t.closest('#app')) return;
    try {
      if (d.share) { await care('grant.set', { granteeId: d.who, sectionId: d.share, on: t.checked }); toast(t.checked ? 'Shared' : 'Stopped sharing'); await refresh({ quiet: true }); }
      else if (d.expiry) await run('grant.setExpiry', { granteeId: d.expiry, label: t.value }, 'Access end updated');
      else if (d.invkind) await run('invite.update', { id: d.invkind, kind: t.value }, 'Invitation updated');
      else if (d.plan) { await care('plan.setText', { sectionId: d.plan, text: t.value }); D.plan.text[d.plan] = t.value; toast('Saved'); }
      else if (d.ctitle) { const v = t.value.trim(); if (v) await run('plan.renameSection', { id: d.ctitle, title: v }, 'Section renamed'); }
      else if (d.pref) { const val = d.pref === 'post' ? t.value === 'true' : t.value; const u = await DHAuth.updateMe({ profile: { prefs: { [d.pref]: val } } }); U.profile = u.profile; await refresh(); }
      else if (d.cov) { const u = await DHAuth.updateMe({ profile: { [d.cov]: t.value } }); U.profile = u.profile; await refresh(); }
      else if (d.align !== undefined) { const al = (D.me.profile.align || [0, 0, 0, 0, 0]).slice(); al[+d.align] = t.checked ? 1 : 0; const u = await DHAuth.updateMe({ profile: { align: al } }); U.profile = u.profile; await refresh(); }
    } catch (err) { toast(err.message); await refresh({ quiet: true }); }
  });

  document.addEventListener('submit', async (e) => {
    const f = e.target; if (!f.closest('#app')) return; e.preventDefault();
    try {
      if (f.id === 'composer') { const v = $('#msg').value.trim(); if (!v) return; await care('thread.send', { threadId: thread, text: v }); msgs = await care('thread.messages', { threadId: thread }); threads = await care('thread.list'); render(); const m = $('#msg'); if (m) m.focus(); }
      else if (f.id === 'invite-form') { const r = await care('invite.create', { email: $('#inv-email').value, kind: $('#inv-kind').value }); toast(r.added ? r.added.name + ' added — nothing shared yet' : 'Invitation saved — they’ll be added when they join'); await refresh(); }
      else if (f.id === 'sec-form') { const v = $('#sec-title').value.trim(); if (v) await run('plan.addSection', { title: v }, 'Section added — it’s private until you share it'); }
      else if (f.id === 'rec-form') await run('rec.request', { clinicianId: $('#rec-who').value }, 'Recommendation requested');
      else if (f.id === 'note-form') { const v = $('#note-in').value.trim(); if (!v) return; if (noteEdit) { await care('note.update', { id: noteEdit, text: v }); noteEdit = null; toast('Note updated'); } else { await care('note.create', { momId: f.dataset.mom, text: v }); toast('Saved — visible only to you'); } await refresh(); }
      else if (f.dataset.apptForm !== undefined) { const fd = new FormData(f); await run('appt.create', { momId: f.dataset.apptForm || undefined, title: fd.get('title'), at: fd.get('at'), withName: fd.get('withName') }, 'Added to the shared calendar'); }
      else if (f.dataset.recForm) { await run('rec.request', { momId: f.dataset.recForm, clinicianId: new FormData(f).get('who') }, 'Recommendation requested'); }
      else if (f.id === 'bg-form') { if (!$('#bg-ok').checked) return toast('Please confirm the attestation.'); const r = await care('bglass.request', { email: $('#bg-email').value, reason: $('#bg-reason').value, note: $('#bg-note').value }); toast(r.message); f.reset(); await refresh(); }
    } catch (err) { toast(err.message); }
  });

  /* ================================================================== auto-lock, polling, boot */
  const LOCK_SECS = 300; let last = Date.now(); const lock = $('#lock-overlay');
  const bump = () => { if (!lock.classList.contains('on')) last = Date.now(); };
  ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach((ev) => document.addEventListener(ev, bump, { passive: true }));
  setInterval(() => {
    const left = Math.max(0, LOCK_SECS - Math.floor((Date.now() - last) / 1000)); const el = $('#lock-timer'); if (el) el.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
    if (left === 0 && !lock.classList.contains('on')) lock.classList.add('on');
  }, 1000);
  $('#lock-now').addEventListener('click', () => lock.classList.add('on'));
  $('#unlock').addEventListener('click', () => { lock.classList.remove('on'); last = Date.now(); });
  $('#signout').addEventListener('click', () => DHAuth.logout().then(() => { location.href = 'index.html'; }));
  $('#refresh').addEventListener('click', () => refresh());
  /* Shared data changes under you: poll quietly, but never while you're typing or a dialog is open. */
  setInterval(() => {
    const ae = document.activeElement, typing = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.closest('#app') && (ae.value || '').length;
    if (!U || !D || document.hidden || lock.classList.contains('on') || typing || document.querySelector('.modal.open')) return;
    refresh({ quiet: true });
  }, 12000);

  const gate = (title, body, btns) => {
    document.body.classList.add('gated');
    $('#app').innerHTML = `<div class="panel center" style="max-width:520px;margin:48px auto;padding:48px 32px"><div style="width:84px;margin:0 auto 18px;color:var(--umber)">${DH.mark('', {})}</div><h2 class="h2" style="font-size:2rem">${title}</h2><p class="muted" style="margin:14px 0 26px">${body}</p><div class="row" style="justify-content:center">${btns}</div></div>`;
  };
  DHAuth.ready.then(async (u) => {
    const fig = $('.lock-overlay .figure'); if (fig) fig.innerHTML = DH.mark('', {});
    if (!u) return gate('Sign in to open the app', 'Your birth plan, care team and messages live in your account — and are only visible to the people you choose.', '<a class="btn" href="login.html?next=app.html">Sign in</a><a class="btn btn-ghost" href="login.html?next=app.html#signup">Create account</a>');
    if (u.role === 'admin') return gate('Staff accounts don’t have a care workspace', 'Use your account page to manage users and stories. To see the care experience, sign in as a mom, doula or clinician.', '<a class="btn" href="account.html">Open account</a>');
    U = Object.assign({}, u); tab = TABS[u.role][0][0];
    $('#who').textContent = u.name + ' · ' + ROLE[u.role];
    if (/@demo\.doulashouse\.test$/.test(u.email)) {
      const w = $('#switch-wrap'), s = $('#switch-demo'); w.style.display = 'flex';
      s.innerHTML = DHAuth.DEMO_ACCOUNTS.filter((d) => d.label !== 'Staff').map((d) => `<option value="${d.email}" ${d.email === u.email ? 'selected' : ''}>${d.label}</option>`).join('');
      s.addEventListener('change', async () => { const d = DHAuth.DEMO_ACCOUNTS.find((x) => x.email === s.value); await DHAuth.logout(); await DHAuth.login({ email: d.email, password: d.password }); location.reload(); });
    }
    try { await load(); render(); } catch (e) { gate('We couldn’t load your workspace', esc(e.message), '<button class="btn" onclick="location.reload()">Try again</button>'); }
  });
})();
