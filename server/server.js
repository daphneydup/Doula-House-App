#!/usr/bin/env node
/*
 * Doula's House — development server (zero dependencies).
 * Serves the static site and a small JSON API with real accounts:
 *   - scrypt password hashing, random session tokens (stored hashed), HttpOnly SameSite=Strict cookies
 *   - login rate limiting, same-origin checks on writes, security headers
 *   - CRUD for accounts and testimonials; admin user management
 *   - POST /api/care: all shared-care data (plans, consent grants, team, messages) via js/care-core.js,
 *     which enforces who may see what. The server only authenticates and persists.
 * Data is a JSON file (server/data/db.json). This is a prototype backend: for real health data
 * use a HIPAA-eligible database/host, signed BAAs, MFA and a security review (see README).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Care = require('../js/care-core.js');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DH_DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT) || 4173;
const SESSION_TTL = 8 * 3600 * 1000;
const MAX_BODY = 300 * 1024;
const ROLES = ['mom', 'doula', 'clinician'];

/* ---------------- Database ---------------- */
let db;
function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); delete db.workspaces; Care.ensure(db); Object.values(db.users).forEach((u) => { if (!u.profile) u.profile = Care.defaultProfile(u.role); }); return; }
  db = { users: {}, sessions: {}, testimonials: {}, activity: [] };
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8')), env = careEnv();
  Care.demoPeople(env).forEach((u) => {
    const id = uid();
    db.users[id] = { id, email: u.email.toLowerCase(), name: u.name, role: u.role, city: u.city || '', bio: '', profile: u.profile, ...hash(seed.demoPassword), createdAt: now() };
  });
  for (const t of Care.DEMO_TESTIMONIALS) {
    const id = uid();
    db.testimonials[id] = { id, userId: null, name: t.name, roleLabel: t.roleLabel, audience: t.audience, quote: t.quote, status: 'approved', sample: true, createdAt: now(), updatedAt: now() };
  }
  Care.ensure(db); Care.seedDemo(db, env);
  save();
  console.log('Seeded demo accounts, a shared care scenario and sample testimonials (see js/care-core.js).');
}
const careEnv = () => ({ now: () => Date.now(), uid: () => crypto.randomBytes(9).toString('base64url') });
let writing = Promise.resolve();
function save() {
  const data = JSON.stringify(db);
  writing = writing.then(() => new Promise((resolve) => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFile(tmp, data, (e) => { if (e) { console.error(e); return resolve(); } fs.rename(tmp, DB_FILE, () => resolve()); });
  }));
}
const now = () => new Date().toISOString();
const uid = () => crypto.randomBytes(9).toString('base64url');

/* ---------------- Crypto ---------------- */
function hash(password, salt = crypto.randomBytes(16)) {
  const h = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return { salt: salt.toString('base64'), hash: h.toString('base64') };
}
function verify(password, user) {
  const salt = user ? Buffer.from(user.salt, 'base64') : Buffer.alloc(16);
  const h = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  if (!user) return false; // still paid the hashing cost, so timing doesn't reveal unknown emails
  return crypto.timingSafeEqual(h, Buffer.from(user.hash, 'base64'));
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/* ---------------- Helpers ---------------- */
class HttpError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, city: u.city || '', bio: u.bio || '', profile: u.profile || {}, createdAt: u.createdAt });
const clientIp = (req) => req.socket.remoteAddress || '';
function log(userId, event, req, detail = '') {
  db.activity.unshift({ t: now(), userId, event, ip: clientIp(req).replace('::ffff:', ''), detail });
  if (db.activity.length > 2000) db.activity.length = 2000;
}
function checkPassword(pw, email) {
  if (typeof pw !== 'string' || pw.length < 10) throw new HttpError(400, 'Use at least 10 characters for your password.', 'weak_password');
  if (pw.length > 200) throw new HttpError(400, 'That password is too long.', 'weak_password');
  if (email && pw.toLowerCase() === email.toLowerCase()) throw new HttpError(400, 'Your password can\'t be your email.', 'weak_password');
}

/* Rate limit failed logins: 6 per 15 minutes per email+ip */
const fails = new Map();
function limited(key) { const f = (fails.get(key) || []).filter((t) => Date.now() - t < 15 * 60000); fails.set(key, f); return f.length >= 6; }
function fail(key) { const f = fails.get(key) || []; f.push(Date.now()); fails.set(key, f); }

/* ---------------- Sessions ---------------- */
function parseCookies(req) {
  const out = {}; (req.headers.cookie || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function startSession(res, req, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.sessions[sha(token)] = { userId: user.id, created: Date.now(), last: Date.now() };
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `dh_sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}${secure}`);
}
function endSessionCookie(res) { res.setHeader('Set-Cookie', 'dh_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); }
function currentUser(req) {
  const tok = parseCookies(req).dh_sid; if (!tok) return null;
  const s = db.sessions[sha(tok)]; if (!s) return null;
  if (Date.now() - s.last > SESSION_TTL) { delete db.sessions[sha(tok)]; return null; }
  s.last = Date.now();
  const u = db.users[s.userId]; return u || null;
}
const needUser = (req) => { const u = currentUser(req); if (!u) throw new HttpError(401, 'Please sign in.', 'unauthenticated'); return u; };
const needAdmin = (req) => { const u = needUser(req); if (u.role !== 'admin') throw new HttpError(403, 'Staff only.', 'forbidden'); return u; };

/* ---------------- API ---------------- */
const send = (res, status, obj) => { const b = JSON.stringify(obj); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(b) }); res.end(b); };
function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve({});
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new HttpError(413, 'Request too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(new HttpError(400, 'Invalid JSON.')); } });
    req.on('error', reject);
  });
}
function sameOrigin(req) {
  const o = req.headers.origin; if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch (e) { return false; }
}
const tView = (t, viewer) => ({ id: t.id, name: t.name, roleLabel: t.roleLabel, audience: t.audience, quote: t.quote, status: t.status, sample: !!t.sample, createdAt: t.createdAt, mine: !!(viewer && t.userId === viewer.id) });

async function api(req, res, url) {
  const m = req.method, p = url.pathname;
  if (m !== 'GET' && m !== 'HEAD') {
    if (!sameOrigin(req)) throw new HttpError(403, 'Cross-site request blocked.', 'csrf');
    if (!/application\/json/.test(req.headers['content-type'] || '') && Number(req.headers['content-length'] || 0) > 0) throw new HttpError(415, 'JSON only.');
  }
  const body = await readBody(req);

  if (p === '/api/health' && m === 'GET') return send(res, 200, { ok: true, mode: 'server', demo: true });

  /* ---- Auth: Create / Read / Update / Delete account ---- */
  if (p === '/api/auth/register' && m === 'POST') {
    const email = clean(body.email, 254).toLowerCase(), name = clean(body.name, 80), role = clean(body.role, 20);
    if (!name) throw new HttpError(400, 'Please add your name.', 'name');
    if (!EMAIL.test(email)) throw new HttpError(400, 'Please enter a valid email.', 'email');
    if (!ROLES.includes(role)) throw new HttpError(400, 'Please choose how you\'ll use Doula\'s House.', 'role');
    checkPassword(body.password, email);
    if (!body.consent) throw new HttpError(400, 'Please agree to the terms and privacy notice.', 'consent');
    if (Object.values(db.users).some((u) => u.email === email)) throw new HttpError(409, 'An account with that email already exists. Try signing in.', 'exists');
    const id = uid();
    const user = db.users[id] = { id, email, name, role, city: clean(body.city, 80), bio: '', profile: Care.defaultProfile(role), ...hash(body.password), createdAt: now() };
    Care.onRegister(db, user, careEnv());
    startSession(res, req, user); log(id, 'Account created', req, role); save();
    return send(res, 201, { user: publicUser(user) });
  }
  if (p === '/api/auth/login' && m === 'POST') {
    const email = clean(body.email, 254).toLowerCase(), key = email + '|' + clientIp(req);
    if (limited(key)) throw new HttpError(429, 'Too many attempts. Please wait 15 minutes and try again.', 'rate_limited');
    const user = Object.values(db.users).find((u) => u.email === email) || null;
    const ok = verify(String(body.password || ''), user);
    if (!ok) { fail(key); if (user) { log(user.id, 'Failed sign-in', req); save(); } throw new HttpError(401, 'Invalid email or password.', 'bad_credentials'); }
    fails.delete(key); startSession(res, req, user); log(user.id, 'Signed in', req); save();
    return send(res, 200, { user: publicUser(user) });
  }
  if (p === '/api/auth/logout' && m === 'POST') {
    const tok = parseCookies(req).dh_sid, u = currentUser(req);
    if (tok) delete db.sessions[sha(tok)];
    if (u) log(u.id, 'Signed out', req); save(); endSessionCookie(res);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/auth/me') {
    if (m === 'GET') { const u = currentUser(req); return send(res, 200, { user: u ? publicUser(u) : null }); }
    const u = needUser(req);
    if (m === 'PATCH') {
      if (body.name !== undefined) { const n = clean(body.name, 80); if (!n) throw new HttpError(400, 'Name can\'t be empty.', 'name'); u.name = n; }
      if (body.city !== undefined) u.city = clean(body.city, 80);
      if (body.bio !== undefined) u.bio = clean(body.bio, 500);
      if (body.profile !== undefined) { try { u.profile = Care.cleanProfile(u.role, body.profile, u.profile); } catch (e) { throw new HttpError(e.status || 400, e.message, e.code); } }
      if (body.email !== undefined) {
        const e = clean(body.email, 254).toLowerCase();
        if (!EMAIL.test(e)) throw new HttpError(400, 'Please enter a valid email.', 'email');
        if (e !== u.email) {
          if (!verify(String(body.password || ''), u)) throw new HttpError(401, 'Enter your current password to change your email.', 'bad_credentials');
          if (Object.values(db.users).some((x) => x.email === e && x.id !== u.id)) throw new HttpError(409, 'That email is already in use.', 'exists');
          u.email = e; log(u.id, 'Email changed', req);
        }
      }
      log(u.id, 'Profile updated', req); save();
      return send(res, 200, { user: publicUser(u) });
    }
    if (m === 'DELETE') {
      if (!verify(String(body.password || ''), u)) throw new HttpError(401, 'Password is incorrect.', 'bad_credentials');
      if (u.role === 'admin' && Object.values(db.users).filter((x) => x.role === 'admin').length < 2) throw new HttpError(400, 'The last staff account can\'t be deleted.', 'last_admin');
      removeUser(u.id); save(); endSessionCookie(res);
      return send(res, 200, { ok: true });
    }
  }
  if (p === '/api/auth/password' && m === 'POST') {
    const u = needUser(req);
    if (!verify(String(body.current || ''), u)) { log(u.id, 'Failed password change', req); save(); throw new HttpError(401, 'Your current password is incorrect.', 'bad_credentials'); }
    checkPassword(body.next, u.email); Object.assign(u, hash(body.next));
    const keep = sha(parseCookies(req).dh_sid || ''); // sign out every other device
    for (const k of Object.keys(db.sessions)) if (db.sessions[k].userId === u.id && k !== keep) delete db.sessions[k];
    log(u.id, 'Password changed', req); save();
    return send(res, 200, { ok: true });
  }
  if (p === '/api/auth/activity' && m === 'GET') {
    const u = needUser(req);
    return send(res, 200, { activity: db.activity.filter((a) => a.userId === u.id).slice(0, 30).map(({ t, event, ip }) => ({ t, event, ip })) });
  }

  /* ---- Shared care data: every rule lives in js/care-core.js ---- */
  if (p === '/api/care' && m === 'POST') {
    const u = needUser(req);
    if (typeof body.action !== 'string') throw new HttpError(400, 'Missing action.');
    try {
      const r = Care.handle(db, u, body.action, body.args || {}, careEnv());
      if (r.dirty) save();
      return send(res, 200, { result: r.result === undefined ? null : r.result });
    } catch (e) { if (e instanceof Care.CareError) throw new HttpError(e.status, e.message, e.code); throw e; }
  }

  /* ---- Testimonials: full CRUD with ownership + moderation ---- */
  if (p === '/api/testimonials' && m === 'GET') {
    const viewer = currentUser(req), mine = url.searchParams.get('mine') === '1', status = url.searchParams.get('status');
    let list = Object.values(db.testimonials);
    if (mine) { if (!viewer) throw new HttpError(401, 'Please sign in.', 'unauthenticated'); list = list.filter((t) => t.userId === viewer.id); }
    else if (status && status !== 'approved') { needAdmin(req); list = list.filter((t) => t.status === status); }
    else list = list.filter((t) => t.status === 'approved');
    list.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
    return send(res, 200, { testimonials: list.map((t) => tView(t, viewer)) });
  }
  if (p === '/api/testimonials' && m === 'POST') {
    const u = needUser(req);
    const quote = clean(body.quote, 600); if (quote.length < 30) throw new HttpError(400, 'Please share a little more (at least 30 characters).', 'quote');
    if (!body.consent) throw new HttpError(400, 'Please confirm you\'re happy for us to publish your story.', 'consent');
    const aud = { mom: 'families', doula: 'doulas', clinician: 'clinicians', admin: 'families' }[u.role];
    const id = uid(); const t = db.testimonials[id] = { id, userId: u.id, name: clean(body.name, 60) || u.name.split(' ')[0], roleLabel: clean(body.roleLabel, 80), audience: aud, quote, status: 'pending', sample: false, createdAt: now(), updatedAt: now() };
    log(u.id, 'Story submitted', req); save();
    return send(res, 201, { testimonial: tView(t, u) });
  }
  const tm = p.match(/^\/api\/testimonials\/([\w-]+)$/);
  if (tm) {
    const u = needUser(req), t = db.testimonials[tm[1]];
    if (!t) throw new HttpError(404, 'Not found.');
    const owner = t.userId === u.id, admin = u.role === 'admin';
    if (!owner && !admin) throw new HttpError(403, 'You can only change your own stories.', 'forbidden');
    if (m === 'PATCH') {
      if (body.status !== undefined) { if (!admin) throw new HttpError(403, 'Only staff can moderate.', 'forbidden'); if (!['approved', 'pending', 'rejected'].includes(body.status)) throw new HttpError(400, 'Bad status.'); t.status = body.status; }
      if (body.quote !== undefined || body.name !== undefined || body.roleLabel !== undefined) {
        if (body.quote !== undefined) { const q = clean(body.quote, 600); if (q.length < 30) throw new HttpError(400, 'Please share a little more (at least 30 characters).', 'quote'); t.quote = q; }
        if (body.name !== undefined) t.name = clean(body.name, 60) || t.name;
        if (body.roleLabel !== undefined) t.roleLabel = clean(body.roleLabel, 80);
        if (!admin) t.status = 'pending'; // edits by authors are re-reviewed
      }
      t.updatedAt = now(); save();
      return send(res, 200, { testimonial: tView(t, u) });
    }
    if (m === 'DELETE') { delete db.testimonials[t.id]; save(); return send(res, 200, { ok: true }); }
  }

  /* ---- Admin: users CRUD ---- */
  if (p === '/api/admin/users' && m === 'GET') {
    needAdmin(req);
    return send(res, 200, { users: Object.values(db.users).map(publicUser).sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1)) });
  }
  const um = p.match(/^\/api\/admin\/users\/([\w-]+)$/);
  if (um) {
    const admin = needAdmin(req), t = db.users[um[1]];
    if (!t) throw new HttpError(404, 'Not found.');
    if (m === 'PATCH') {
      if (t.id === admin.id) throw new HttpError(400, 'You can\'t change your own role here.');
      if (![...ROLES, 'admin'].includes(body.role)) throw new HttpError(400, 'Bad role.');
      t.role = body.role; log(admin.id, 'Role changed', req, t.email + ' → ' + t.role); save();
      return send(res, 200, { user: publicUser(t) });
    }
    if (m === 'DELETE') {
      if (t.id === admin.id) throw new HttpError(400, 'Delete your own account from the Account page.');
      removeUser(t.id); log(admin.id, 'User deleted', req, t.email); save();
      return send(res, 200, { ok: true });
    }
  }
  throw new HttpError(404, 'Not found.');
}
function removeUser(id) {
  Care.removeUser(db, id); delete db.users[id];
  for (const k of Object.keys(db.sessions)) if (db.sessions[k].userId === id) delete db.sessions[k];
  for (const t of Object.values(db.testimonials)) if (t.userId === id) delete db.testimonials[t.id];
  db.activity = db.activity.filter((a) => a.userId !== id);
}

/* ---------------- Static files ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname); if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  const top = path.relative(ROOT, file).split(path.sep)[0];
  if (!file.startsWith(ROOT + path.sep) || top === 'server' || top.startsWith('.') || top === 'node_modules') { res.writeHead(404); return res.end('Not found'); }
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': ext === '.html' ? 'no-cache' : 'no-cache', ...SEC_HEADERS });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

load();
setInterval(() => { // purge expired sessions
  let n = 0; for (const [k, s] of Object.entries(db.sessions)) if (Date.now() - s.last > SESSION_TTL) { delete db.sessions[k]; n++; } if (n) save();
}, 600000).unref();

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e instanceof HttpError ? e.message : 'Something went wrong.', code: e.code || 'error' });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Doula's House running at http://localhost:${PORT}`));
