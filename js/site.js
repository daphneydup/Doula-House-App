/* Doula's House — shared site script: icons, logo, header/footer, helpers, product art, cart */
(function () {
  const ICONS = {
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M16 13H8M16 17H8M10 9H8"/>',
    dollar: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    grad: '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z"/><path d="M12 9v4M12 17h.01"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M16 7l3 3"/>',
    home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>'
  };
  const icon = (n, cls) => `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  /* The Doorway Bloom mark. An open doorway (the care team's welcome) holding a heart (the mother) above a
     lotus (resilience and rebirth), standing on the ground (the doula's steadiness). Grid 100 x 100, stroke 11.
     Colour comes from CSS (currentColor + --mark-heart) or explicit opts. The lotus follows the heart colour.
     variants: signature (default) · spectrum (clay / honey / dawn = family / doula / clinician) · mono */
  let _lm = 0;
  const petal = (bx, by, tx, ty, b) => { const vx = tx - bx, vy = ty - by, L = Math.hypot(vx, vy), nx = -vy / L, ny = vx / L, f = (k, q) => `${(bx + vx * k + nx * b * q).toFixed(2)} ${(by + vy * k + ny * b * q).toFixed(2)}`; return `M${bx} ${by} C${f(0.26, 1)} ${f(0.76, 0.96)} ${tx} ${ty} C${f(0.76, -0.96)} ${f(0.26, -1)} ${bx} ${by}Z`; };
  /* Five petals, back to front. Each back petal is masked where a front petal overlaps it, so the separations
     are true cut-outs: the mark works on any background, photograph or colour. */
  function bloom(color, cx, by, sc, gap) {
    const id = 'lm' + (++_lm) + '_', g = gap || 2.4;
    const P = [petal(cx - 3, by, cx - 17 * sc, by - 10 * sc, 4.8 * sc), petal(cx + 3, by, cx + 17 * sc, by - 10 * sc, 4.8 * sc), petal(cx - 2, by, cx - 10 * sc, by - 23 * sc, 5.6 * sc), petal(cx + 2, by, cx + 10 * sc, by - 23 * sc, 5.6 * sc), petal(cx, by, cx, by - 32 * sc, 7 * sc)];
    const masks = P.map((d, i) => `<mask id="${id}${i}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="160" height="160"><rect x="-20" y="-20" width="160" height="160" fill="#fff"/><g fill="#000" stroke="#000" stroke-width="${g}" stroke-linejoin="round">${P.slice(i + 1).map((q) => `<path d="${q}"/>`).join('')}</g></mask>`).join('');
    return `<defs>${masks}</defs><g fill="${color}">${P.map((d, i) => `<path d="${d}" mask="url(#${id}${i})"/>`).join('')}</g>`;
  }
  const HEART = 'M30 82C21 75 18 70 18 66C18 61 26 59 30 65C34 59 42 61 42 66C42 70 39 75 30 82Z';
  const mark = (cls, o = {}) => {
    const v = o.variant || 'signature';
    const main = o.main || 'currentColor';
    const heart = o.heart || (v === 'mono' ? main : 'var(--mark-heart, var(--clay))');
    const lotusC = o.lotus || (v === 'mono' ? main : heart);
    const ground = v === 'spectrum' ? (o.ground || 'var(--camel)') : main;
    const arch = v === 'spectrum' ? (o.arch || 'var(--sky)') : main;
    return `<svg class="${cls || ''}" viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false"><g fill="none">
      <path d="M10.5 100V46A39.5 39.5 0 0 1 89.5 46V100" stroke="${arch}" stroke-width="11"/>
      <path d="M3 97H97" stroke="${ground}" stroke-width="6" stroke-linecap="round"/></g>
      <path d="${HEART}" fill="${heart}" transform="translate(${50 - 30 * 0.9} ${34 - 70.5 * 0.9}) scale(0.9)"/>${bloom(lotusC, 50, 89, 1.2)}</svg>`;
  };
  /* The lotus on its own: the emblem for pockets, patches and small marks. */
  const lotus = (cls, o = {}) => `<svg class="${cls || ''}" viewBox="0 0 52 36" fill="none" aria-hidden="true" focusable="false">${bloom(o.color || 'currentColor', 26, 35, 1.04, o.gap)}</svg>`;
  const figure = mark; // legacy alias

  /* ---------- Header / footer ---------- */
  const NAV_L = [['families.html', 'Families'], ['doulas.html', 'Doulas'], ['care-teams.html', 'Care Teams']];
  const NAV_R = [['about.html', 'About'], ['stories.html', 'Stories'], ['shop.html', 'Shop & Give']];
  const page = document.body.dataset.page || '';
  const cur = (href) => (location.pathname.split('/').pop() || 'index.html') === href ? ' aria-current="page"' : '';

  function header() {
    const el = document.getElementById('site-header');
    if (!el) return;
    el.outerHTML = `<a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header"><div class="container">
      <div class="nav">
        <nav class="nav-links" aria-label="Primary">${NAV_L.map(([h, t]) => `<a href="${h}"${cur(h)}>${t}</a>`).join('')}</nav>
        <a class="brand" href="index.html" aria-label="Doula’s House — home">
          <span class="brand-name">${mark('brand-mark')}Doula’s House</span>
          <span class="brand-tag">Birthing your story</span>
        </a>
        <nav class="nav-links right" aria-label="Secondary">
          ${NAV_R.map(([h, t]) => `<a href="${h}"${cur(h)}>${t}</a>`).join('')}
          <button class="cart-btn" data-open-cart aria-label="Open cart">${icon('bag')}<span class="cart-count" data-cart-count></span></button>
          <div class="acct" data-acct><a class="btn btn-sm" href="login.html">Sign in</a></div>
        </nav>
        <button class="menu-btn" aria-label="Menu" aria-expanded="false" data-menu>${icon('menu')}</button>
      </div>
    </div>
    <nav class="mobile-nav" id="mobile-nav" aria-label="Mobile">
      ${[...NAV_L, ...NAV_R, ['trust.html', 'Privacy & Trust']].map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}
      <a href="#" data-open-cart>Cart <span data-cart-count-text></span></a>
      <div data-acct-m><a class="btn" href="login.html">Sign in</a></div>
    </nav></header>`;
    const btn = document.querySelector('[data-menu]'), mn = document.getElementById('mobile-nav');
    btn.addEventListener('click', () => { const o = mn.classList.toggle('open'); btn.setAttribute('aria-expanded', o); });
  }

  /* ---------- Account control (signed-in state) ---------- */
  function paintAuth(u) {
    const d = document.querySelector('[data-acct]'), m = document.querySelector('[data-acct-m]');
    if (!d) return;
    if (!u) { d.innerHTML = '<a class="btn btn-sm" href="login.html">Sign in</a>'; if (m) m.innerHTML = '<a class="btn" href="login.html">Sign in</a>'; return; }
    const ini = esc(u.name.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase());
    d.innerHTML = `<button class="acct-btn" aria-haspopup="true" aria-expanded="false" aria-label="Account menu for ${esc(u.name)}"><span class="acct-ini">${ini}</span></button>
      <div class="acct-menu" role="menu"><div class="acct-who"><b>${esc(u.name)}</b><span>${esc(u.email)}</span></div>
      <a role="menuitem" href="app.html">Open the app</a><a role="menuitem" href="account.html">Account</a><a role="menuitem" href="account.html#stories">My stories</a><button role="menuitem" data-signout>Sign out</button></div>`;
    if (m) m.innerHTML = `<a href="app.html">Open the app</a><a href="account.html">Account (${esc(u.name.split(' ')[0])})</a><button class="btn btn-ghost" data-signout style="width:100%;margin-top:16px">Sign out</button>`;
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.acct-btn');
    document.querySelectorAll('.acct').forEach((a) => { const open = btn && a.contains(btn) ? !a.classList.contains('open') : false; a.classList.toggle('open', open); const b = a.querySelector('.acct-btn'); if (b) b.setAttribute('aria-expanded', open); });
    if (e.target.closest('[data-signout]')) window.DHAuth.logout().then(() => { location.href = 'index.html'; });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.acct.open').forEach((a) => a.classList.remove('open')); });

  function footer() {
    const el = document.getElementById('site-footer');
    if (!el) return;
    el.outerHTML = `<footer class="site-footer"><div class="orn orn-tr gold" style="opacity:.55"></div><div class="orn orn-bl gold" style="opacity:.55"></div>
    <div class="container">
      <div class="footer-grid">
        <div><div class="footer-brand">${mark('brand-mark')}Doula’s House</div><p class="eyebrow" style="margin:16px 0 20px;color:var(--camel)">Birthing your story</p>
          <p class="small" style="color:#cbbfae;max-width:36ch">One circle of care around every mother — doulas, families and care teams working from the same plan.</p></div>
        <div><h4>Platform</h4><a href="families.html">For families</a><a href="doulas.html">For doulas</a><a href="care-teams.html">For care teams</a><a href="coverage.html">Insurance coverage</a><a href="app.html">Product demo</a></div>
        <div><h4>Give &amp; shop</h4><a href="shop.html">Merch store</a><a href="shop.html#scholarships">Scholarships</a><a href="shop.html#give">Donate</a></div>
        <div><h4>Company</h4><a href="about.html">About us</a><a href="stories.html">Stories</a><a href="trust.html">Privacy &amp; trust</a><a href="login.html">Sign in</a><a href="brand.html">Brand identity</a><a href="design-system.html">Design system</a></div>
      </div>
      <div class="footer-legal">
        <p><b>Doula's House is not a medical provider</b> and does not give medical advice. Doulas provide non-clinical support. If you think you are having a medical emergency, call 911.</p>
        <p><b>Need to talk to someone now?</b> National Maternal Mental Health Hotline: 1-833-852-6262 (call or text, 24/7). Suicide &amp; Crisis Lifeline: call or text 988.</p>
        <p class="footer-url">WWW.DOULASHOUSE.COM</p>
      </div>
    </div></footer>
    <div class="overlay" data-overlay></div><div class="toast" role="status" aria-live="polite" id="toast"></div>`;
  }

  /* ---------- Helpers ---------- */
  let toastT;
  function toast(msg) { const t = document.getElementById('toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200); }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const store = {
    get(k, d) { try { const v = localStorage.getItem('dh:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('dh:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };
  function reveal() {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((en) => en.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
    els.forEach((e) => io.observe(e));
  }

  /* ---------- Product art — rendered by js/merch.js (loaded on every page) ---------- */
  const FILLS = { cream: '#ece5d8', honey: '#d9ad63', clay: '#aa4f36', dawn: '#8ea4bc', hearth: '#3a2e27', mocha: '#675a4e' };
  const productArt = (p, color) => (window.DH_MERCH ? window.DH_MERCH(p, color) : '');

  const PRODUCTS = [
    { id: 'wrap-tee', name: 'Rebirth Wrap Tee', kind: 'tee', art: 'lotus', price: 42, tag: 'New', sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'], colors: ['hearth', 'cream', 'clay', 'honey', 'dawn'] },
    { id: 'bloom-hoodie', name: 'Bloom Tunic Hoodie', kind: 'hoodie', art: 'mark', price: 78, sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'], colors: ['cream', 'clay', 'dawn', 'hearth', 'honey'] },
    { id: 'half-zip', name: 'Resilience Half-Zip', kind: 'halfzip', art: 'lotus', price: 84, tag: 'Bestseller', sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'], colors: ['clay', 'cream', 'dawn', 'hearth', 'honey'] },
    { id: 'lotus-bodysuit', name: 'Lotus Pocket Bodysuit', kind: 'onesie', art: 'pocket', price: 24, tag: 'Fan favourite', sizes: ['0–3M', '3–6M', '6–12M'], colors: ['cream', 'honey', 'clay', 'dawn', 'hearth'] },
    { id: 'first-five', name: 'First Five Bodysuit Set', kind: 'pack', art: 'pack', price: 58, tag: 'Gift set', sizes: ['0–3M', '3–6M', '6–12M'], colors: [] },
    { id: 'tote-slogan', name: 'Doulas Save Lives Zip Tote', kind: 'tote', art: 'slogan', slogan: ['DOULAS', 'SAVE', 'LIVES'], price: 36, sizes: ['One size'], colors: ['dawn', 'cream', 'hearth', 'mocha', 'honey'] },
    { id: 'tote-lotus', name: 'Lotus Zip Tote', kind: 'tote', art: 'lotus', price: 36, sizes: ['One size'], colors: ['cream', 'dawn', 'hearth', 'mocha', 'honey'] },
    { id: 'bodysuit-slogan', name: 'Birthed By A Doula Bodysuit', kind: 'onesie', art: 'slogan', slogan: ['BIRTHED', 'BY A', 'DOULA'], price: 22, sizes: ['0–3M', '3–6M', '6–12M'], colors: ['cream', 'honey', 'clay', 'dawn', 'hearth'] }
  ];

  /* ---------- Cart ---------- */
  const cart = {
    items: store.get('cart', []).filter((i) => i && i.id && PRODUCTS.some((p) => p.id === i.id)),
    save() { store.set('cart', this.items); this.paint(); },
    add(item) { const k = item.id + item.size + item.color; const f = this.items.find((i) => i.k === k); if (f) f.qty++; else this.items.push({ ...item, k, qty: 1 }); this.save(); },
    qty(k, d) { const i = this.items.find((x) => x.k === k); if (!i) return; i.qty += d; if (i.qty <= 0) this.items = this.items.filter((x) => x.k !== k); this.save(); },
    count() { return this.items.reduce((a, b) => a + b.qty, 0); },
    total() { return this.items.reduce((a, b) => a + b.qty * b.price, 0); },
    paint() {
      const n = this.count();
      document.querySelectorAll('[data-cart-count]').forEach((e) => { e.textContent = n || ''; e.dataset.n = n; });
      document.querySelectorAll('[data-cart-count-text]').forEach((e) => { e.textContent = n ? `(${n})` : ''; });
      const body = document.getElementById('cart-body'); if (!body) return;
      if (!this.items.length) body.innerHTML = `<div class="center muted" style="padding:48px 0">${icon('bag')}<p style="margin-top:12px">Your cart is empty.</p></div>`;
      else body.innerHTML = this.items.map((i) => { const p = PRODUCTS.find((x) => x.id === i.id); return `<div class="cart-line"><div class="thumb">${productArt(p, i.color)}</div><div><b class="small">${esc(i.name)}</b><div class="xs muted">${esc(i.color)} · ${esc(i.size)} · ${money(i.price)}</div><div class="qty" style="margin-top:6px"><button data-qty="${i.k}" data-d="-1" aria-label="Decrease">−</button><span>${i.qty}</span><button data-qty="${i.k}" data-d="1" aria-label="Increase">+</button></div></div><b>${money(i.price * i.qty)}</b></div>`; }).join('');
      const t = document.getElementById('cart-total'); if (t) t.textContent = money(this.total());
      const c = document.getElementById('cart-checkout'); if (c) c.disabled = !this.items.length;
    }
  };

  function cartDrawer() {
    if (document.getElementById('cart-drawer')) return;
    const d = document.createElement('aside');
    d.className = 'drawer'; d.id = 'cart-drawer'; d.setAttribute('aria-label', 'Shopping cart');
    d.innerHTML = `<div class="drawer-head"><h3 class="h3">Your cart</h3><button class="modal-close" style="position:static" data-close aria-label="Close cart">${icon('x')}</button></div>
      <div class="drawer-body" id="cart-body"></div>
      <div class="drawer-foot"><div class="row-between"><span class="muted">Subtotal</span><b id="cart-total">$0</b></div>
      <p class="xs muted" style="margin:0">Net proceeds fund scholarships for moms and aspiring doulas.</p>
      <button class="btn" id="cart-checkout" data-checkout>Checkout</button></div>`;
    document.body.appendChild(d);
    const m = document.createElement('div');
    m.className = 'modal'; m.id = 'checkout-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'co-t');
    m.innerHTML = `<button class="modal-close" data-close aria-label="Close">${icon('x')}</button><h3 class="h3" id="co-t">Checkout — demo</h3>
      <p class="muted">This is a design prototype, so no payment is taken. In production, checkout connects to a payments provider (e.g. Shopify or Stripe) and the order confirmation shows how much went to the scholarship fund.</p>
      <div class="alert cream" style="margin:16px 0">${icon('info')}<span>Merch orders never touch health data — the shop is fully separate from the care-coordination app.</span></div>
      <button class="btn" data-close data-clear-cart>Got it</button>`;
    document.body.appendChild(m);
  }
  const openLayer = (id) => { document.querySelector('[data-overlay]').classList.add('open'); document.getElementById(id).classList.add('open'); };
  const closeLayers = () => { document.querySelector('[data-overlay]').classList.remove('open'); document.querySelectorAll('.drawer.open,.modal.open').forEach((e) => e.classList.remove('open')); };

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open-cart],[data-close],[data-qty],[data-checkout],[data-overlay]');
    if (!t) return;
    if (t.matches('[data-open-cart]')) { e.preventDefault(); cartDrawer(); cart.paint(); openLayer('cart-drawer'); }
    else if (t.matches('[data-qty]')) cart.qty(t.dataset.qty, +t.dataset.d);
    else if (t.matches('[data-checkout]')) { closeLayers(); openLayer('checkout-modal'); }
    else { if (t.matches('[data-clear-cart]')) { cart.items = []; cart.save(); } closeLayers(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLayers(); });

  /* Inline logo placeholders: <span data-figure="class" data-variant="spectrum"> */
  function figures() { document.querySelectorAll('[data-figure]').forEach((el) => { el.innerHTML = mark(el.dataset.figure, { variant: el.dataset.variant || 'signature' }); }); }
  function icons() { document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); el.style.display = el.style.display || 'contents'; }); }

  /* ---------- Testimonial card (used on home + stories) ---------- */
  const AUD = { families: 'Family', doulas: 'Doula', clinicians: 'Clinician' };
  const storyCard = (t) => `<figure class="story-card">
      <span class="story-mark" aria-hidden="true">&ldquo;</span>
      <blockquote>${esc(t.quote)}</blockquote>
      <figcaption><span class="story-ava" aria-hidden="true">${esc((t.name || '?')[0])}</span><span><b>${esc(t.name)}</b>${t.roleLabel ? `<span class="story-role">${esc(t.roleLabel)}</span>` : ''}</span>
      <span class="chip ${t.audience === 'doulas' ? 'gold' : t.audience === 'clinicians' ? 'info' : ''}">${AUD[t.audience] || 'Family'}</span></figcaption>
      ${t.sample ? '<span class="story-sample" title="Sample story for the prototype">Sample</span>' : ''}</figure>`;

  window.DH = { storyCard, icon, figure, mark, lotus, ICONS, toast, esc, money, store, productArt, PRODUCTS, cart, openLayer, closeLayers, FILLS };
  document.addEventListener('DOMContentLoaded', () => { header(); footer(); cartDrawer(); cart.paint(); figures(); icons(); reveal();
    if (window.DHAuth) { window.DHAuth.ready.then(paintAuth); window.DHAuth.onChange(paintAuth); } });
})();
