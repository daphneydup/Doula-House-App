#!/usr/bin/env node
/* Authorization tests for the shared-care core. Run: npm test */
'use strict';
const assert = require('assert');
const Care = require('../js/care-core.js');

let t = Date.parse('2026-10-15T12:00:00Z'), n = 0;
const env = { now: () => t, uid: () => 'id' + (++n).toString(36).padStart(4, '0') };
const advance = (days) => { t += days * 864e5; };

function world() {
  const db = { users: {}, care: null };
  Care.demoPeople(env).forEach((p) => { const id = env.uid(); db.users[id] = { id, email: p.email, name: p.name, role: p.role, city: p.city, profile: p.profile }; });
  Care.ensure(db); Care.seedDemo(db, env); return db;
}
const U = (db, e) => Object.values(db.users).find((u) => u.email === e + '@demo.doulashouse.test');
const call = (db, who, action, args) => { const r = Care.handle(db, who, action, args || {}, env); return r.result; };
const fails = (fn, status, code) => { try { fn(); } catch (e) { assert(e instanceof Care.CareError, 'expected CareError, got ' + e); if (status) assert.strictEqual(e.status, status, `status ${e.status} (${e.message})`); if (code) assert.strictEqual(e.code, code); return; } assert.fail('expected failure'); };

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e).split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

console.log('Shared-care authorization');

test('a doula sees only the sections the mother granted her', () => {
  const db = world(), amara = U(db, 'mom'), imani = U(db, 'doula');
  const c = call(db, imani, 'client.get', { momId: amara.id });
  const ids = c.shown.map((s) => s.id).sort();
  assert.deepStrictEqual(ids, ['env', 'escalate', 'feeding', 'interv', 'newborn', 'pain', 'post', 'support']);
  assert(c.locked.find((s) => s.id === 'culture' && s.reason === 'not_shared'));
  assert(c.locked.find((s) => s.id === 'health' && s.reason === 'clinical'));
  assert(!JSON.stringify(c).includes('Gestational hypertension'), 'clinical text must never reach a doula');
});

test('a clinician sees clinical sections she was granted', () => {
  const db = world(), c = call(db, U(db, 'clinician'), 'client.get', { momId: U(db, 'mom').id });
  assert(c.shown.find((s) => s.id === 'health').text.includes('Gestational hypertension'));
  assert(!c.shown.find((s) => s.id === 'feeding'), 'feeding not shared with the clinician');
});

test('nobody can read a mother who has not shared with them', () => {
  const db = world();
  fails(() => call(db, U(db, 'rosa'), 'client.get', { momId: U(db, 'mom').id }), 403, 'no_access');
  fails(() => call(db, U(db, 'doula'), 'client.get', { momId: U(db, 'priya').id }), 403, 'no_access');
});

test('moms cannot use professional endpoints, and vice versa', () => {
  const db = world();
  fails(() => call(db, U(db, 'mom'), 'client.get', { momId: U(db, 'danielle').id }), 403);
  fails(() => call(db, U(db, 'mom'), 'pro.state'), 403);
  fails(() => call(db, U(db, 'doula'), 'mom.state'), 403);
  fails(() => call(db, U(db, 'doula'), 'plan.setText', { sectionId: 'env', text: 'hacked' }), 403);
});

test('clinical sections can never be granted to a doula', () => {
  const db = world(), amara = U(db, 'mom'), imani = U(db, 'doula');
  fails(() => call(db, amara, 'grant.set', { granteeId: imani.id, sectionId: 'health', on: true }), 403, 'clinical');
});

test('granting and revoking changes what the professional sees immediately', () => {
  const db = world(), amara = U(db, 'mom'), imani = U(db, 'doula');
  call(db, amara, 'grant.set', { granteeId: imani.id, sectionId: 'culture', on: true });
  assert(call(db, imani, 'client.get', { momId: amara.id }).shown.find((s) => s.id === 'culture'));
  call(db, amara, 'grant.set', { granteeId: imani.id, sectionId: 'culture', on: false });
  assert(!call(db, imani, 'client.get', { momId: amara.id }).shown.find((s) => s.id === 'culture'));
});

test('edits by the mother are what the team reads', () => {
  const db = world(), amara = U(db, 'mom');
  call(db, amara, 'plan.setText', { sectionId: 'env', text: 'NEW TEXT about the room' });
  assert.strictEqual(call(db, U(db, 'doula'), 'client.get', { momId: amara.id }).shown.find((s) => s.id === 'env').text, 'NEW TEXT about the room');
  const ack = call(db, U(db, 'clinician'), 'client.get', { momId: amara.id }).ack;
  assert(ack && ack.stale === true, 'acknowledgement goes stale after the plan changes');
});

test('removing someone from the team ends access and conversation access', () => {
  const db = world(), amara = U(db, 'mom'), imani = U(db, 'doula');
  assert(call(db, imani, 'thread.messages', { threadId: 't:' + amara.id }).messages.length >= 3);
  call(db, amara, 'grant.remove', { granteeId: imani.id });
  fails(() => call(db, imani, 'client.get', { momId: amara.id }), 403);
  fails(() => call(db, imani, 'thread.messages', { threadId: 't:' + amara.id }), 403);
  fails(() => call(db, imani, 'thread.messages', { threadId: 'd:' + amara.id + ':' + imani.id }), 403);
});

test('expired grants stop working; replacing one starts with nothing shared', () => {
  const db = world(), amara = U(db, 'mom'), imani = U(db, 'doula');
  call(db, amara, 'grant.setExpiry', { granteeId: imani.id, label: '30 days' });
  advance(31);
  fails(() => call(db, imani, 'client.get', { momId: amara.id }), 403);
  assert(!call(db, imani, 'pro.state').clients.find((c) => c.mom.id === amara.id));
  call(db, amara, 'invite.create', { email: imani.email, kind: 'doula' });
  const c = call(db, imani, 'client.get', { momId: amara.id });
  assert.strictEqual(c.shown.length, 0, 'a revived grant must not resurrect old consent');
  advance(-31);
});

test('conversations: only members can read or post; unsend only your own', () => {
  const db = world(), amara = U(db, 'mom'), imani = U(db, 'doula'), lena = U(db, 'clinician'), rosa = U(db, 'rosa');
  const team = 't:' + amara.id, direct = 'd:' + amara.id + ':' + imani.id;
  fails(() => call(db, rosa, 'thread.messages', { threadId: team }), 403);
  fails(() => call(db, lena, 'thread.messages', { threadId: direct }), 403, 'no_access');
  fails(() => call(db, lena, 'thread.send', { threadId: direct, text: 'hi' }), 403);
  const sent = call(db, imani, 'thread.send', { threadId: team, text: 'Hello team' });
  assert(call(db, lena, 'thread.messages', { threadId: team }).messages.find((m) => m.id === sent.id && !m.mine));
  fails(() => call(db, lena, 'thread.unsend', { messageId: sent.id }), 404);
  call(db, imani, 'thread.unsend', { messageId: sent.id });
  fails(() => call(db, imani, 'thread.send', { threadId: team, text: 'ssn 123-45-6789' }), 400, 'phi');
});

test('every view by a non-owner lands in the mother’s audit log; the log is hers alone', () => {
  const db = world(), amara = U(db, 'mom'), imani = U(db, 'doula');
  call(db, imani, 'client.get', { momId: amara.id });
  const log = call(db, amara, 'mom.state').audit;
  assert(log.find((e) => e.actorId === imani.id && e.action === 'Viewed'));
  const dani = U(db, 'danielle');
  assert(!call(db, dani, 'mom.state').audit.some((e) => e.actorId === imani.id && e.detail.includes('Postpartum plan') && e.momId === amara.id));
});

test('break-glass: clinical sections only, read-only, 24h, logged, rate-limited', () => {
  const db = world(), priya = U(db, 'priya'), lena = U(db, 'clinician'), rosa = U(db, 'rosa');
  fails(() => call(db, lena, 'bglass.request', { email: priya.email, reason: 'Obstetric emergency', note: 'short' }), 400, 'note');
  fails(() => call(db, U(db, 'doula'), 'bglass.request', { email: priya.email, reason: 'Obstetric emergency', note: 'long enough reason text' }), 403);
  // Priya already shared pain+interv with Lena, so no break-glass record is needed or created
  call(db, lena, 'bglass.request', { email: priya.email, reason: 'Obstetric emergency', note: 'long enough reason text' });
  // Danielle shared only pain+health with Lena; use Rosa (a clinician stand-in is needed): use Sarah the midwife
  const sarah = U(db, 'sarah'), dani = U(db, 'danielle');
  fails(() => call(db, sarah, 'client.get', { momId: dani.id }), 403);
  const res = call(db, sarah, 'bglass.request', { email: dani.email, reason: 'Emergency admission', note: 'arrived in labor, history unknown' });
  assert(res.ok);
  const c = call(db, sarah, 'client.get', { momId: dani.id });
  assert.deepStrictEqual(c.shown.map((s) => s.id), ['health'], 'only the clinical section is visible');
  assert(c.emergency && !c.team && !c.appts, 'no team or calendar through break-glass');
  assert(call(db, dani, 'mom.state').audit.find((e) => e.action === 'Emergency access' && e.actorId === sarah.id), 'the patient can see it');
  assert.strictEqual(call(db, dani, 'mom.state').emergency.length, 1);
  advance(1.1); fails(() => call(db, sarah, 'client.get', { momId: dani.id }), 403); advance(-1.1);
  // unknown email returns the same shape and reveals nothing
  assert(call(db, sarah, 'bglass.request', { email: 'nobody@example.test', reason: 'Emergency admission', note: 'arrived in labor, history unknown' }).ok);
  void rosa;
});

test('billing: a claim cannot be submitted without a recommendation; issuing one unblocks it', () => {
  const db = world(), imani = U(db, 'doula'), lena = U(db, 'clinician'), amara = U(db, 'mom');
  const draft = call(db, imani, 'pro.state').claims.find((c) => c.ref === 'CLM-1051');
  fails(() => call(db, imani, 'claim.submit', { id: draft.id }), 422, 'checks');
  const r = call(db, imani, 'rec.request', { momId: amara.id, clinicianId: lena.id });
  fails(() => call(db, imani, 'claim.submit', { id: draft.id }), 422);
  assert.strictEqual(call(db, lena, 'pro.state').recRequests.length, 1);
  fails(() => call(db, imani, 'rec.issue', { id: r.id }), 403);
  call(db, lena, 'rec.issue', { id: r.id });
  assert.strictEqual(call(db, imani, 'claim.submit', { id: draft.id }).status, 'submitted');
  assert.strictEqual(call(db, imani, 'claim.simulate', { id: draft.id }).status, 'paid');
  fails(() => call(db, imani, 'claim.delete', { id: draft.id }), 404);
});

test('claims belong to the doula who made them', () => {
  const db = world(), imani = U(db, 'doula'), rosa = U(db, 'rosa'), amara = U(db, 'mom');
  const c = call(db, imani, 'pro.state').claims[0];
  fails(() => call(db, rosa, 'claim.update', { id: c.id, serviceKey: 'labor', units: 1 }), 404);
  fails(() => call(db, rosa, 'claim.create', { momId: amara.id, serviceKey: 'prenatal', units: 1, date: '2026-10-10' }), 403, 'no_access');
  fails(() => call(db, U(db, 'clinician'), 'claim.create', { momId: amara.id, serviceKey: 'prenatal', units: 1, date: '2026-10-10' }), 403);
});

test('private doula notes are private to the doula', () => {
  const db = world(), imani = U(db, 'doula'), amara = U(db, 'mom'), lena = U(db, 'clinician');
  const n = call(db, imani, 'note.create', { momId: amara.id, text: 'Birth ball helps' });
  assert(call(db, imani, 'client.get', { momId: amara.id }).notes.find((x) => x.id === n.id));
  assert(!('notes' in call(db, lena, 'client.get', { momId: amara.id })));
  assert(!JSON.stringify(call(db, amara, 'mom.state')).includes('Birth ball helps'));
  fails(() => call(db, lena, 'note.delete', { id: n.id }), 404);
  fails(() => call(db, U(db, 'rosa'), 'note.create', { momId: amara.id, text: 'x' }), 403);
});

test('invitations: existing accounts join the team; new emails wait for registration', () => {
  const db = world(), amara = U(db, 'mom'), rosa = U(db, 'rosa');
  assert(call(db, amara, 'invite.create', { email: rosa.email, kind: 'doula' }).added);
  assert.strictEqual(call(db, rosa, 'client.get', { momId: amara.id }).shown.length, 0);
  fails(() => call(db, amara, 'invite.create', { email: rosa.email, kind: 'doula' }), 409, 'exists');
  fails(() => call(db, amara, 'invite.create', { email: rosa.email, kind: 'clinician' }), 409, 'role');
  const r = call(db, amara, 'invite.create', { email: 'newdoula@example.test', kind: 'doula' });
  assert(r.invited);
  const nu = { id: env.uid(), email: 'newdoula@example.test', name: 'New Doula', role: 'doula', city: '', profile: Care.defaultProfile('doula') }; db.users[nu.id] = nu;
  Care.onRegister(db, nu, env);
  assert(call(db, nu, 'pro.state').clients.find((c) => c.mom.id === amara.id));
  assert.strictEqual(call(db, amara, 'mom.state').invites.length, 0);
});

test('introductions share only first name, city and due month; accepting adds an empty grant', () => {
  const db = world(), priya = U(db, 'priya'), rosa = U(db, 'rosa');
  call(db, priya, 'intro.request', { toId: rosa.id });
  const intro = call(db, rosa, 'pro.state').intros[0];
  assert.deepStrictEqual(Object.keys(intro.from).sort(), ['city', 'dueMonth', 'firstName']);
  assert(!JSON.stringify(intro).includes('Shah') && !JSON.stringify(intro).includes('priya@'));
  fails(() => call(db, rosa, 'client.get', { momId: priya.id }), 403);
  call(db, rosa, 'intro.respond', { id: intro.id, accept: true });
  assert.strictEqual(call(db, rosa, 'client.get', { momId: priya.id }).shown.length, 0);
  fails(() => call(db, priya, 'intro.request', { toId: rosa.id }), 409);
});

test('shared calendar: team members add to it; only creator or mother can change', () => {
  const db = world(), amara = U(db, 'mom'), imani = U(db, 'doula'), lena = U(db, 'clinician');
  const a = call(db, imani, 'appt.create', { momId: amara.id, title: 'Birth-ball session', at: '2026-11-01T17:00' });
  assert(call(db, amara, 'mom.state').appts.find((x) => x.id === a.id));
  fails(() => call(db, lena, 'appt.delete', { id: a.id }), 404);
  fails(() => call(db, U(db, 'rosa'), 'appt.create', { momId: amara.id, title: 'x', at: '2026-11-01T17:00' }), 403);
  call(db, amara, 'appt.delete', { id: a.id });
});

test('custom sections can be shared, and deleting one removes it from every grant', () => {
  const db = world(), amara = U(db, 'mom'), imani = U(db, 'doula');
  const s = call(db, amara, 'plan.addSection', { title: 'Siblings & pets' });
  call(db, amara, 'plan.setText', { sectionId: s.id, text: 'Grandma has the dog' });
  call(db, amara, 'grant.set', { granteeId: imani.id, sectionId: s.id, on: true });
  assert(call(db, imani, 'client.get', { momId: amara.id }).shown.find((x) => x.id === s.id));
  call(db, amara, 'plan.deleteSection', { id: s.id });
  assert(!call(db, imani, 'client.get', { momId: amara.id }).shown.find((x) => x.id === s.id));
});

test('professional profiles are validated; directory exposes only public fields', () => {
  const db = world();
  const p = Care.cleanProfile('doula', { languages: 'English, Spanish', settings: ['home', 'bogus'], listed: false, yearsPractice: '8x', evil: 'x' });
  assert.deepStrictEqual(p.languages, ['English', 'Spanish']); assert.deepStrictEqual(p.settings, ['home']); assert.strictEqual(p.listed, false); assert.strictEqual(p.yearsPractice, '8'); assert(!('evil' in p));
  assert.throws(() => Care.cleanProfile('mom', { dueDate: 'tomorrow' }), /due date/);
  const dir = call(db, U(db, 'mom'), 'directory.list', { role: 'doula' });
  assert(dir.length >= 5 && dir.every((d) => !('email' in d)));
  U(db, 'rosa').profile.listed = false;
  assert(!call(db, U(db, 'mom'), 'directory.list', { role: 'doula' }).find((d) => d.name === 'Rosa Delgado'));
});

test('export contains the mother’s own data and nothing about other mothers; deleting an account cascades', () => {
  const db = world(), amara = U(db, 'mom'), imani = U(db, 'doula');
  const ex = call(db, amara, 'mom.export'); assert(ex.plan && ex.accessLog.length && ex.team.length === 2);
  assert(!JSON.stringify(ex).includes('Danielle'));
  Care.removeUser(db, imani.id); delete db.users[imani.id];
  assert.strictEqual(call(db, amara, 'mom.state').team.length, 1);
  assert(!db.care.messages.some((m) => m.authorId === imani.id));
  assert(!Object.values(db.care.claims).some((c) => c.doulaId === imani.id));
});

console.log(`\n${passed} passing${process.exitCode ? ', with failures' : ''}`);
