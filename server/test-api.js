#!/usr/bin/env node
/* End-to-end test over real HTTP: three separate sessions (mom, doula, clinician) share data through the server. */
'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const os = require('os'), fs = require('fs'), path = require('path');

const PORT = 4290 + Math.floor(Math.random() * 500), BASE = 'http://127.0.0.1:' + PORT;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-test-'));
const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT, DH_DATA_DIR: dir }, stdio: ['ignore', 'pipe', 'inherit'] });

class Client {
  constructor(name) { this.name = name; this.cookie = ''; }
  async req(method, url, body, headers = {}) {
    const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', Cookie: this.cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0].startsWith('dh_sid=;') ? '' : sc.split(';')[0];
    let data = {}; try { data = await r.json(); } catch (e) { /* none */ }
    return { status: r.status, data, headers: r.headers };
  }
  async care(action, args) { const r = await this.req('POST', '/api/care', { action, args }); return r; }
  async ok(action, args) { const r = await this.care(action, args); assert.strictEqual(r.status, 200, `${this.name} ${action} -> ${r.status} ${JSON.stringify(r.data)}`); return r.data.result; }
}
let passed = 0;
const step = async (name, fn) => { try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e).split('\n').slice(0, 4).join('\n    ')); process.exitCode = 1; } };
const wait = () => new Promise((res, rej) => { let out = ''; const t = setTimeout(() => rej(new Error('server did not start')), 8000); srv.stdout.on('data', (d) => { out += d; if (out.includes('running at')) { clearTimeout(t); res(); } }); });

(async () => {
  await wait();
  console.log('Shared data over HTTP — three real accounts');
  const mom = new Client('mom'), doula = new Client('doula'), clin = new Client('clinician'), stranger = new Client('stranger');
  const pw = 'a-long-test-passphrase-1', E = { mom: 'tm@example.test', doula: 'td@example.test', clin: 'tc@example.test', stranger: 'ts@example.test' };
  let momId, doulaId, clinId;

  await step('three people register and get separate sessions', async () => {
    const reg = async (c, name, email, role) => { const r = await c.req('POST', '/api/auth/register', { name, email, password: pw, role, consent: true }); assert.strictEqual(r.status, 201, JSON.stringify(r.data)); return r.data.user; };
    momId = (await reg(mom, 'Tess Mother', E.mom, 'mom')).id; doulaId = (await reg(doula, 'Dana Doula', E.doula, 'doula')).id; clinId = (await reg(clin, 'Dr. Cora Clinician', E.clin, 'clinician')).id;
    await reg(stranger, 'Sam Stranger', E.stranger, 'doula');
    assert.deepStrictEqual([momId, doulaId, clinId].length, 3);
  });
  await step('the mother writes her plan and sets coverage', async () => {
    await mom.ok('plan.setText', { sectionId: 'env', text: 'Quiet room, low lights.' });
    await mom.ok('plan.setText', { sectionId: 'health', text: 'Chronic hypertension — on labetalol.' });
    await mom.ok('plan.setText', { sectionId: 'feeding', text: 'Breastfeeding.' });
    const u = await mom.req('PATCH', '/api/auth/me', { profile: { dueDate: '2027-01-20', state: 'NY', plan: 'Medicaid', memberLast4: '9921' } });
    assert.strictEqual(u.status, 200); assert.strictEqual(u.data.user.profile.plan, 'Medicaid');
  });
  await step('before she shares anything, nobody can read her plan', async () => {
    for (const c of [doula, clin, stranger]) { const r = await c.care('client.get', { momId }); assert.strictEqual(r.status, 403, c.name); }
    assert.strictEqual((await doula.ok('pro.state')).clients.length, 0);
  });
  await step('she invites her doula and clinician by email; they appear on her team with nothing shared', async () => {
    assert((await mom.ok('invite.create', { email: E.doula, kind: 'doula' })).added);
    assert((await mom.ok('invite.create', { email: E.clin, kind: 'clinician' })).added);
    const st = await mom.ok('mom.state'); assert.strictEqual(st.team.length, 2);
    assert.strictEqual((await doula.ok('client.get', { momId })).shown.length, 0);
  });
  await step('consent is section-level and role-aware', async () => {
    await mom.ok('grant.set', { granteeId: doulaId, sectionId: 'env', on: true });
    await mom.ok('grant.set', { granteeId: clinId, sectionId: 'env', on: true });
    await mom.ok('grant.set', { granteeId: clinId, sectionId: 'health', on: true });
    const bad = await mom.care('grant.set', { granteeId: doulaId, sectionId: 'health', on: true }); assert.strictEqual(bad.status, 403); assert.strictEqual(bad.data.code, 'clinical');
    const d = await doula.ok('client.get', { momId }), c = await clin.ok('client.get', { momId });
    assert.deepStrictEqual(d.shown.map((s) => s.id), ['env']); assert.deepStrictEqual(c.shown.map((s) => s.id).sort(), ['env', 'health']);
    assert(!JSON.stringify(d).includes('labetalol'), 'clinical text must not reach the doula');
    assert(!JSON.stringify(d).includes('Breastfeeding') && !JSON.stringify(c).includes('Breastfeeding'), 'unshared text stays private');
    assert.strictEqual((await stranger.care('client.get', { momId })).status, 403);
  });
  await step('the professionals’ lists show the mother; her access log shows who looked', async () => {
    assert((await doula.ok('pro.state')).clients.find((x) => x.mom.id === momId));
    const log = (await mom.ok('mom.state')).audit;
    assert(log.find((e) => e.actorId === doulaId && e.action === 'Viewed') && log.find((e) => e.actorId === clinId && e.action === 'Viewed'));
  });
  await step('the whole team talks in one thread; a stranger and the wrong person cannot', async () => {
    const team = 't:' + momId;
    await doula.ok('thread.send', { threadId: team, text: 'Hello from the doula' });
    await clin.ok('thread.send', { threadId: team, text: 'Plan received — thank you' });
    const seen = await mom.ok('thread.messages', { threadId: team }); assert.strictEqual(seen.messages.length, 2); assert(seen.messages.every((m) => !m.mine));
    assert.strictEqual((await stranger.care('thread.messages', { threadId: team })).status, 403);
    assert.strictEqual((await clin.care('thread.messages', { threadId: 'd:' + momId + ':' + doulaId })).status, 403, 'clinician must not read the mom–doula direct thread');
    assert.strictEqual((await mom.care('thread.send', { threadId: team, text: 'ssn 123-45-6789' })).status, 400);
  });
  await step('shared calendar: the doula adds a visit; the mother sees it', async () => {
    await doula.ok('appt.create', { momId, title: 'Prenatal visit', at: '2027-01-05T10:00' });
    assert((await mom.ok('mom.state')).appts.find((a) => a.title === 'Prenatal visit' && a.createdByName === 'Dana Doula'));
  });
  await step('billing across three accounts: blocked → recommendation requested → issued → submitted', async () => {
    await doula.req('PATCH', '/api/auth/me', { profile: { cert: 'DONA' } });
    const claim = await doula.ok('claim.create', { momId, serviceKey: 'prenatal', units: 1, date: '2026-12-01' });
    const blocked = await doula.care('claim.submit', { id: claim.id }); assert.strictEqual(blocked.status, 422);
    await doula.ok('rec.request', { momId, clinicianId: clinId });
    const req = (await clin.ok('pro.state')).recRequests; assert.strictEqual(req.length, 1); assert.strictEqual(req[0].mom.id, momId);
    assert.strictEqual((await doula.care('rec.issue', { id: req[0].id })).status, 403);
    await clin.ok('rec.issue', { id: req[0].id });
    assert.strictEqual((await doula.ok('claim.submit', { id: claim.id })).status, 'submitted');
    assert.strictEqual((await mom.ok('mom.state')).recs[0].status, 'issued');
  });
  await step('the clinician acknowledges the plan; it goes stale when the mother edits', async () => {
    await clin.ok('ack.set', { momId });
    assert((await mom.ok('mom.state')).team.find((t) => t.user.id === clinId).ack);
    assert.strictEqual((await clin.ok('client.get', { momId })).ack.stale, false);
    await new Promise((r) => setTimeout(r, 15)); await mom.ok('plan.setText', { sectionId: 'env', text: 'Quiet room, low lights, music off.' });
    const c = await clin.ok('client.get', { momId }); assert.strictEqual(c.ack.stale, true); assert(c.shown.find((s) => s.id === 'env').text.endsWith('music off.'));
  });
  await step('privacy: HTTP-level protections hold', async () => {
    assert.strictEqual((await new Client('anon').care('mom.state')).status, 401);
    assert.strictEqual((await mom.req('POST', '/api/care', { action: 'mom.state', args: {} }, { Origin: 'http://evil.example' })).status, 403);
    assert.strictEqual((await mom.care('nope.action', {})).status, 404);
    assert.strictEqual((await doula.care('mom.export')).status, 403);
    assert.strictEqual((await mom.care('client.get', { momId: doulaId })).status, 403);
  });
  await step('the mother can export her data, remove access instantly, and delete her account', async () => {
    const ex = await mom.ok('mom.export'); assert(ex.plan.text.env.startsWith('Quiet room')); assert(ex.messages.length >= 1); assert(ex.accessLog.length > 0); assert(!JSON.stringify(ex).includes(E.doula), 'export must not leak other members’ emails');
    await mom.ok('grant.remove', { granteeId: doulaId });
    assert.strictEqual((await doula.care('client.get', { momId })).status, 403);
    assert.strictEqual((await doula.care('thread.messages', { threadId: 't:' + momId })).status, 403);
    assert.strictEqual((await clin.ok('client.get', { momId })).mom.id, momId, 'removing the doula must not affect the clinician');
    const del = await mom.req('DELETE', '/api/auth/me', { password: pw }); assert.strictEqual(del.status, 200);
    assert.strictEqual((await clin.care('client.get', { momId })).status, 404);
    assert.strictEqual((await clin.ok('pro.state')).clients.length, 0);
  });

  srv.kill(); fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${passed} passing${process.exitCode ? ', with failures' : ''}`);
})().catch((e) => { console.error(e); srv.kill(); process.exit(1); });
