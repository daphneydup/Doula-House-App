/* Doula's House — accounts & data client.
 * One interface, two adapters:
 *   server  — talks to server/server.js (real sessions, scrypt, cookies). Used when /api/health answers.
 *   local   — browser-only fallback (localStorage + PBKDF2) so the prototype still works as plain static files.
 * Both implement identical CRUD methods and the same validation rules. */
(function () {
  /* DEV ONLY — throwaway demo credentials (must match server/seed.json). Remove before any real deployment. */
  const DEMO_ACCOUNTS = [
    { label: 'Mom', email: 'mom@demo.doulashouse.test', password: 'Welcome-Home-2026' },
    { label: 'Doula', email: 'doula@demo.doulashouse.test', password: 'Welcome-Home-2026' },
    { label: 'Clinician', email: 'clinician@demo.doulashouse.test', password: 'Welcome-Home-2026' },
    { label: 'Staff', email: 'admin@demo.doulashouse.test', password: 'Welcome-Home-2026' }
  ];
  const ROLES = ['mom', 'doula', 'clinician'];
  const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

  class ApiError extends Error { constructor(message, status, code) { super(message); this.status = status || 400; this.code = code || 'error'; } }
  const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
  const nowIso = () => new Date().toISOString();
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
  const checkPassword = (pw, email) => {
    if (typeof pw !== 'string' || pw.length < 10) throw new ApiError('Use at least 10 characters for your password.', 400, 'weak_password');
    if (email && pw.toLowerCase() === email.toLowerCase()) throw new ApiError("Your password can't be your email.", 400, 'weak_password');
  };

  /* ------------------------------------------------------------------ server adapter */
  const serverAdapter = {
    mode: 'server',
    async req(method, url, body) {
      let r;
      try { r = await fetch(url, { method, credentials: 'same-origin', headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined }); }
      catch (e) { throw new ApiError('Can\'t reach the server. Check your connection.', 0, 'network'); }
      let data = {}; try { data = await r.json(); } catch (e) { /* empty */ }
      if (!r.ok) throw new ApiError(data.error || 'Something went wrong.', r.status, data.code);
      return data;
    },
    me() { return this.req('GET', '/api/auth/me').then((d) => d.user); },
    register(b) { return this.req('POST', '/api/auth/register', b).then((d) => d.user); },
    login(b) { return this.req('POST', '/api/auth/login', b).then((d) => d.user); },
    logout() { return this.req('POST', '/api/auth/logout', {}); },
    updateMe(b) { return this.req('PATCH', '/api/auth/me', b).then((d) => d.user); },
    changePassword(b) { return this.req('POST', '/api/auth/password', b); },
    deleteMe(b) { return this.req('DELETE', '/api/auth/me', b); },
    activity() { return this.req('GET', '/api/auth/activity').then((d) => d.activity); },
    care(action, args) { return this.req('POST', '/api/care', { action, args: args || {} }).then((d) => d.result); },
    listTestimonials(o = {}) { const q = o.mine ? '?mine=1' : o.status ? '?status=' + encodeURIComponent(o.status) : ''; return this.req('GET', '/api/testimonials' + q).then((d) => d.testimonials); },
    createTestimonial(b) { return this.req('POST', '/api/testimonials', b).then((d) => d.testimonial); },
    updateTestimonial(id, b) { return this.req('PATCH', '/api/testimonials/' + id, b).then((d) => d.testimonial); },
    deleteTestimonial(id) { return this.req('DELETE', '/api/testimonials/' + id); },
    adminUsers() { return this.req('GET', '/api/admin/users').then((d) => d.users); },
    adminSetRole(id, role) { return this.req('PATCH', '/api/admin/users/' + id, { role }).then((d) => d.user); },
    adminDeleteUser(id) { return this.req('DELETE', '/api/admin/users/' + id); }
  };

  /* ------------------------------------------------------------------ local (browser-only) adapter */
  const K = { db: 'dh:local:db', sess: 'dh:local:session' };
  const readDb = () => { try { return JSON.parse(localStorage.getItem(K.db)) || null; } catch (e) { return null; } };
  const writeDb = (d) => { try { localStorage.setItem(K.db, JSON.stringify(d)); } catch (e) { throw new ApiError('Your browser blocked local storage.', 500, 'storage'); } };
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  async function pbkdf2(password, saltB64) {
    const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
    if (!(crypto.subtle && crypto.subtle.importKey)) throw new ApiError('Secure hashing is unavailable in this browser context — run the dev server (npm start).', 500, 'crypto');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, key, 256);
    return { salt: b64(salt), hash: b64(bits) };
  }
  const same = (a, b) => a.length === b.length && a.split('').reduce((x, c, i) => x | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;
  const pub = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, city: u.city || '', bio: u.bio || '', profile: u.profile || {}, createdAt: u.createdAt });
  const tView = (t, viewer) => ({ id: t.id, name: t.name, roleLabel: t.roleLabel, audience: t.audience, quote: t.quote, status: t.status, sample: !!t.sample, createdAt: t.createdAt, mine: !!(viewer && t.userId === viewer.id) });

  const localAdapter = {
    mode: 'local',
    env: { now: () => Date.now(), uid: () => rid() },
    async init() {
      const existing = readDb();
      if (existing && existing.v === 3) { window.DHCare.ensure(existing); return; }
      const Care = window.DHCare, env = this.env, db = { v: 3, users: {}, testimonials: {}, activity: [] };
      const demo = await pbkdf2(DEMO_ACCOUNTS[0].password); // one hash shared by every demo account (demo seeds only)
      Care.demoPeople(env).forEach((p) => { const id = rid(); db.users[id] = { id, email: p.email, name: p.name, role: p.role, city: p.city, bio: '', profile: p.profile, ...demo, createdAt: nowIso() }; });
      Care.DEMO_TESTIMONIALS.forEach((t, i) => { const id = rid(); db.testimonials[id] = { id, userId: null, ...t, status: 'approved', sample: true, createdAt: new Date(Date.now() - i * 6e4).toISOString(), updatedAt: nowIso() }; });
      Care.ensure(db); Care.seedDemo(db, env); writeDb(db);
    },
    cur() { const db = readDb(), id = localStorage.getItem(K.sess); return { db, user: id && db ? db.users[id] || null : null }; },
    need() { const c = this.cur(); if (!c.user) throw new ApiError('Please sign in.', 401, 'unauthenticated'); return c; },
    log(db, userId, event) { db.activity.unshift({ t: nowIso(), userId, event, ip: 'this browser' }); db.activity.length = Math.min(db.activity.length, 500); },
    async me() { return this.cur().user ? pub(this.cur().user) : null; },
    async register(b) {
      const db = readDb(), email = clean(b.email, 254).toLowerCase(), name = clean(b.name, 80), role = clean(b.role, 20);
      if (!name) throw new ApiError('Please add your name.', 400, 'name');
      if (!EMAIL.test(email)) throw new ApiError('Please enter a valid email.', 400, 'email');
      if (!ROLES.includes(role)) throw new ApiError("Please choose how you'll use Doula's House.", 400, 'role');
      checkPassword(b.password, email);
      if (!b.consent) throw new ApiError('Please agree to the terms and privacy notice.', 400, 'consent');
      if (Object.values(db.users).some((u) => u.email === email)) throw new ApiError('An account with that email already exists. Try signing in.', 409, 'exists');
      const id = rid(); const u = db.users[id] = { id, email, name, role, city: clean(b.city, 80), bio: '', profile: window.DHCare.defaultProfile(role), ...(await pbkdf2(b.password)), createdAt: nowIso() };
      window.DHCare.onRegister(db, u, this.env);
      this.log(db, id, 'Account created'); writeDb(db); localStorage.setItem(K.sess, id); return pub(u);
    },
    async login(b) {
      const db = readDb(), email = clean(b.email, 254).toLowerCase(), u = Object.values(db.users).find((x) => x.email === email);
      const h = await pbkdf2(String(b.password || ''), u ? u.salt : null);
      if (!u || !same(h.hash, u.hash)) throw new ApiError('Invalid email or password.', 401, 'bad_credentials');
      this.log(db, u.id, 'Signed in'); writeDb(db); localStorage.setItem(K.sess, u.id); return pub(u);
    },
    async logout() { const c = this.cur(); if (c.user) { this.log(c.db, c.user.id, 'Signed out'); writeDb(c.db); } localStorage.removeItem(K.sess); return { ok: true }; },
    async verifyPw(u, pw) { const h = await pbkdf2(String(pw || ''), u.salt); return same(h.hash, u.hash); },
    async updateMe(b) {
      const { db, user: u } = this.need();
      if (b.name !== undefined) { const n = clean(b.name, 80); if (!n) throw new ApiError("Name can't be empty.", 400, 'name'); u.name = n; }
      if (b.city !== undefined) u.city = clean(b.city, 80);
      if (b.bio !== undefined) u.bio = clean(b.bio, 500);
      if (b.profile !== undefined) { try { u.profile = window.DHCare.cleanProfile(u.role, b.profile, u.profile); } catch (e) { throw new ApiError(e.message, e.status || 400, e.code); } }
      if (b.email !== undefined) {
        const e = clean(b.email, 254).toLowerCase(); if (!EMAIL.test(e)) throw new ApiError('Please enter a valid email.', 400, 'email');
        if (e !== u.email) {
          if (!(await this.verifyPw(u, b.password))) throw new ApiError('Enter your current password to change your email.', 401, 'bad_credentials');
          if (Object.values(db.users).some((x) => x.email === e && x.id !== u.id)) throw new ApiError('That email is already in use.', 409, 'exists');
          u.email = e; this.log(db, u.id, 'Email changed');
        }
      }
      this.log(db, u.id, 'Profile updated'); writeDb(db); return pub(u);
    },
    async changePassword(b) {
      const { db, user: u } = this.need();
      if (!(await this.verifyPw(u, b.current))) { this.log(db, u.id, 'Failed password change'); writeDb(db); throw new ApiError('Your current password is incorrect.', 401, 'bad_credentials'); }
      checkPassword(b.next, u.email); Object.assign(u, await pbkdf2(b.next)); this.log(db, u.id, 'Password changed'); writeDb(db); return { ok: true };
    },
    async deleteMe(b) {
      const { db, user: u } = this.need();
      if (!(await this.verifyPw(u, b.password))) throw new ApiError('Password is incorrect.', 401, 'bad_credentials');
      if (u.role === 'admin' && Object.values(db.users).filter((x) => x.role === 'admin').length < 2) throw new ApiError("The last staff account can't be deleted.", 400, 'last_admin');
      this.removeUser(db, u.id); writeDb(db); localStorage.removeItem(K.sess); return { ok: true };
    },
    removeUser(db, id) { window.DHCare.removeUser(db, id); delete db.users[id]; Object.values(db.testimonials).forEach((t) => { if (t.userId === id) delete db.testimonials[t.id]; }); db.activity = db.activity.filter((a) => a.userId !== id); },
    async activity() { const { db, user } = this.need(); return db.activity.filter((a) => a.userId === user.id).slice(0, 30); },
    async care(action, args) {
      const { db, user } = this.cur(); if (!user) throw new ApiError('Please sign in.', 401, 'unauthenticated');
      try { const r = window.DHCare.handle(db, user, action, args || {}, this.env); if (r.dirty) writeDb(db); return r.result === undefined ? null : r.result; }
      catch (e) { if (e instanceof window.DHCare.CareError) throw new ApiError(e.message, e.status, e.code); throw e; }
    },
    async listTestimonials(o = {}) {
      const { db, user } = this.cur(); let l = Object.values(db.testimonials);
      if (o.mine) { if (!user) throw new ApiError('Please sign in.', 401, 'unauthenticated'); l = l.filter((t) => t.userId === user.id); }
      else if (o.status && o.status !== 'approved') { if (!user || user.role !== 'admin') throw new ApiError('Staff only.', 403, 'forbidden'); l = l.filter((t) => t.status === o.status); }
      else l = l.filter((t) => t.status === 'approved');
      return l.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)).map((t) => tView(t, user));
    },
    async createTestimonial(b) {
      const { db, user } = this.need(); const quote = clean(b.quote, 600);
      if (quote.length < 30) throw new ApiError('Please share a little more (at least 30 characters).', 400, 'quote');
      if (!b.consent) throw new ApiError("Please confirm you're happy for us to publish your story.", 400, 'consent');
      const aud = { mom: 'families', doula: 'doulas', clinician: 'clinicians', admin: 'families' }[user.role];
      const id = rid(); const t = db.testimonials[id] = { id, userId: user.id, name: clean(b.name, 60) || user.name.split(' ')[0], roleLabel: clean(b.roleLabel, 80), audience: aud, quote, status: 'pending', sample: false, createdAt: nowIso(), updatedAt: nowIso() };
      this.log(db, user.id, 'Story submitted'); writeDb(db); return tView(t, user);
    },
    async updateTestimonial(id, b) {
      const { db, user } = this.need(), t = db.testimonials[id]; if (!t) throw new ApiError('Not found.', 404);
      const admin = user.role === 'admin'; if (t.userId !== user.id && !admin) throw new ApiError('You can only change your own stories.', 403, 'forbidden');
      if (b.status !== undefined) { if (!admin) throw new ApiError('Only staff can moderate.', 403, 'forbidden'); t.status = b.status; }
      if (b.quote !== undefined || b.name !== undefined || b.roleLabel !== undefined) {
        if (b.quote !== undefined) { const q = clean(b.quote, 600); if (q.length < 30) throw new ApiError('Please share a little more (at least 30 characters).', 400, 'quote'); t.quote = q; }
        if (b.name !== undefined) t.name = clean(b.name, 60) || t.name;
        if (b.roleLabel !== undefined) t.roleLabel = clean(b.roleLabel, 80);
        if (!admin) t.status = 'pending';
      }
      t.updatedAt = nowIso(); writeDb(db); return tView(t, user);
    },
    async deleteTestimonial(id) {
      const { db, user } = this.need(), t = db.testimonials[id]; if (!t) throw new ApiError('Not found.', 404);
      if (t.userId !== user.id && user.role !== 'admin') throw new ApiError('You can only change your own stories.', 403, 'forbidden');
      delete db.testimonials[id]; writeDb(db); return { ok: true };
    },
    needAdmin() { const c = this.need(); if (c.user.role !== 'admin') throw new ApiError('Staff only.', 403, 'forbidden'); return c; },
    async adminUsers() { const { db } = this.needAdmin(); return Object.values(db.users).map(pub).sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1)); },
    async adminSetRole(id, role) {
      const { db, user } = this.needAdmin(); const t = db.users[id]; if (!t) throw new ApiError('Not found.', 404);
      if (t.id === user.id) throw new ApiError("You can't change your own role here.", 400);
      if (![...ROLES, 'admin'].includes(role)) throw new ApiError('Bad role.', 400); t.role = role; writeDb(db); return pub(t);
    },
    async adminDeleteUser(id) {
      const { db, user } = this.needAdmin(); if (id === user.id) throw new ApiError('Delete your own account from the Account page.', 400);
      if (!db.users[id]) throw new ApiError('Not found.', 404); this.removeUser(db, id); writeDb(db); return { ok: true };
    }
  };

  /* ------------------------------------------------------------------ bootstrap */
  let adapter = serverAdapter;
  const listeners = [];
  const auth = { user: null, mode: 'server', DEMO_ACCOUNTS, ApiError, onChange(fn) { listeners.push(fn); } };
  async function detect() {
    if (location.protocol === 'file:') return localAdapter;
    try {
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 1500);
      const r = await fetch('/api/health', { signal: ctrl.signal, credentials: 'same-origin' }); clearTimeout(to);
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) { const j = await r.json(); if (j.ok) return serverAdapter; }
    } catch (e) { /* fall through */ }
    return localAdapter;
  }
  const loadScript = (src) => new Promise((res, rej) => { if (window.DHCare) return res(); const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(el); });
  auth.ready = (async () => {
    adapter = await detect(); auth.mode = adapter.mode;
    if (adapter.mode === 'local') await loadScript('js/care-core.js');
    if (adapter.init) await adapter.init();
    try { auth.user = await adapter.me(); } catch (e) { auth.user = null; }
    return auth.user;
  })();
  const setUser = (u) => { auth.user = u; listeners.forEach((f) => f(u)); return u; };
  /* Thin wrappers that keep auth.user in sync */
  const api = new Proxy({}, { get: (_, name) => (...a) => auth.ready.then(() => adapter[name](...a)) });
  auth.register = (b) => api.register(b).then(setUser);
  auth.login = (b) => api.login(b).then(setUser);
  auth.logout = () => api.logout().then(() => setUser(null));
  auth.updateMe = (b) => api.updateMe(b).then(setUser);
  auth.deleteMe = (b) => api.deleteMe(b).then(() => setUser(null));
  /* Only allow same-site relative redirects after sign-in */
  auth.safeNext = (n, fallback) => (typeof n === 'string' && /^\/?[\w\-./]+\.html(\?[\w=&%-]*)?(#[\w-]*)?$/.test(n) && !n.startsWith('//') ? n : fallback);
  auth.home = (u) => (u && u.role === 'admin' ? 'account.html' : 'app.html');
  window.DHAuth = auth; window.DHApi = api; window.ApiError = ApiError;
})();
