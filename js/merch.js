/* Doula's House — photoreal-style merch renderer (pure SVG, no raster assets).
 * Garment constructions follow the reference pieces: a wrap-front maternity tee, a raglan tunic hoodie, a drop-shoulder
 * half-zip fleece, a patch-pocket bodysuit (the pocket carries a lotus), a five-pack, and a striped-webbing zip tote.
 * Lit from the upper left, with fold shadows/highlights, knit and heather textures, stitching, and prints that sink into
 * the cloth (multiply on light fabric). Colours are the brand palette.
 * Usage: DH_MERCH(product, 'cream'|'honey'|'clay'|'dawn'|'hearth'|'mocha') -> SVG string. */
(function () {
  let n = 0;
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (h, t, k) => toHex(hex(h).map((v, i) => v + (t[i] - v) * k));
  const darker = (h, k) => mix(h, [20, 14, 8], k);
  const lighter = (h, k) => mix(h, [255, 252, 246], k);

  const FABRIC = { cream: '#ece5d8', honey: '#d9ad63', clay: '#aa4f36', dawn: '#8ea4bc', hearth: '#3a2e27', mocha: '#675a4e' };
  const DARK = ['clay', 'hearth', 'mocha'];
  const INK = {
    cream: { logo: '#5a3a1e', heart: '#aa4f36', text: '#8f402b', word: '#261c17', thread: '#aa4f36', blend: 'multiply', a: 0.95 },
    honey: { logo: '#3b2614', heart: '#8f402b', text: '#5a3a1e', word: '#261c17', thread: '#8f402b', blend: 'multiply', a: 0.95 },
    dawn: { logo: '#261c17', heart: '#8f402b', text: '#261c17', word: '#261c17', thread: '#f6efe4', blend: 'multiply', a: 0.92 },
    clay: { logo: '#f6efe4', heart: '#261c17', text: '#f6efe4', word: '#f6efe4', thread: '#f6efe4', blend: 'normal', a: 0.94 },
    hearth: { logo: '#f1e6d4', heart: '#d1a04f', text: '#f1e6d4', word: '#f1e6d4', thread: '#d1a04f', blend: 'normal', a: 0.93 },
    mocha: { logo: '#f1e6d4', heart: '#d1a04f', text: '#f1e6d4', word: '#f1e6d4', thread: '#d1a04f', blend: 'normal', a: 0.93 }
  };

  /* ---- shared defs ---- */
  function defs(k, base, clipPath, opts = {}) {
    return `<defs>
      <filter id="${k}g" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${opts.grain || 0.9}" numOctaves="3" seed="4"/><feColorMatrix type="matrix" values="0 0 0 0 .10  0 0 0 0 .07  0 0 0 0 .05  0 0 0 1.3 -.5"/></filter>
      <filter id="${k}sl" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".006 .5" numOctaves="2" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.3 -.5"/></filter>
      <filter id="${k}hl" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.15" numOctaves="2" seed="8"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 3.2 -1.55"/></filter>
      <filter id="${k}hd" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.05" numOctaves="2" seed="3"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 3.2 -1.6"/></filter>
      <filter id="${k}w" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".03 1.2" numOctaves="1" seed="9" result="a"/><feTurbulence type="fractalNoise" baseFrequency="1.2 .03" numOctaves="1" seed="5" result="b"/><feBlend in="a" in2="b" mode="multiply"/><feColorMatrix type="matrix" values="0 0 0 0 .1  0 0 0 0 .07  0 0 0 0 .04  0 0 0 2.2 -.8"/></filter>
      <filter id="${k}b1" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.2"/></filter>
      <filter id="${k}b2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>
      <filter id="${k}b5" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
      <filter id="${k}b14" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="12"/></filter>
      <filter id="${k}ink" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="2" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="1.8" xChannelSelector="R" yChannelSelector="G"/></filter>
      <linearGradient id="${k}sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".30"/><stop offset=".16" stop-color="#000" stop-opacity=".08"/><stop offset=".32" stop-color="#fff" stop-opacity=".06"/><stop offset=".5" stop-color="#fff" stop-opacity=".16"/><stop offset=".72" stop-color="#000" stop-opacity=".03"/><stop offset=".86" stop-color="#000" stop-opacity=".14"/><stop offset="1" stop-color="#000" stop-opacity=".34"/></linearGradient>
      <linearGradient id="${k}sv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>
      <pattern id="${k}rib" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="${darker(base, 0.1)}"/><rect width="2.2" height="5" fill="${darker(base, 0.2)}"/></pattern>
      <pattern id="${k}rf" width="3.2" height="3.2" patternUnits="userSpaceOnUse"><rect width="1.1" height="3.2" fill="#000" opacity=".5"/></pattern>
      <clipPath id="${k}c"><path d="${clipPath}"/></clipPath>
    </defs>`;
  }
  /* a soft fold: shadow stroke + offset highlight stroke */
  function fold(k, d, w, dark, a = 1) {
    const sh = dark ? 0.34 : 0.16, hi = dark ? 0.2 : 0.34;
    return `<path d="${d}" fill="none" stroke="#000" stroke-opacity="${sh * a}" stroke-width="${w}" stroke-linecap="round" filter="url(#${k}b5)"/>
            <path d="${d}" transform="translate(${w * 0.45} ${-w * 0.3})" fill="none" stroke="#fff" stroke-opacity="${hi * a}" stroke-width="${w * 0.7}" stroke-linecap="round" filter="url(#${k}b5)"/>`;
  }
  const stitch = (d, col, w = 1.3, dash = '4.5 3.5') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-dasharray="${dash}" stroke-linecap="round"/>`;
  const strip = (svg) => svg.replace(/<svg[^>]*>|<\/svg>/g, '');

  /* ---- artwork (print) ---- */
  const lotusG = (color, cx, cy, w) => { const sc = w / 52; return `<g transform="translate(${cx - 26 * sc} ${cy - 18 * sc}) scale(${sc})">${strip(DH.lotus('', { color }))}</g>`; };
  const logoG = (ink, px, py, pw) => { const sc = pw / 100; return `<g transform="translate(${px - 50 * sc} ${py - 50 * sc}) scale(${sc})">${strip(DH.mark('', { main: ink.logo, heart: ink.heart }))}</g>`; };
  function printArt(p, ink, cx, cy, w, k) {
    let g = '';
    if (p.art === 'mark') g = logoG(ink, cx, cy, w * 0.9);
    else if (p.art === 'lotus') g = lotusG(ink.heart === '#261c17' ? ink.logo : ink.heart, cx, cy, w) ;
    else if (p.art === 'wordmark') {
      const fs = w / 7.4;
      g = logoG(ink, cx, cy - fs * 1.75, w * 0.4) +
        `<text x="${cx}" y="${cy + fs * 0.62}" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="330" font-size="${fs}" letter-spacing="${-fs * 0.022}" style="font-variation-settings:'SOFT' 100,'WONK' 0,'opsz' 144" fill="${ink.word}">Doula’s House</text>` +
        `<text x="${cx}" y="${cy + fs * 1.5}" text-anchor="middle" font-family="'Instrument Sans', Arial, sans-serif" font-weight="650" font-size="${fs * 0.26}" letter-spacing="${fs * 0.1}" fill="${ink.word}" opacity=".85">BIRTHING YOUR STORY</text>`;
    } else if (p.art === 'slogan') {
      const L = p.slogan, fs = w / 3.1, lh = fs * 1.04, y0 = cy - ((L.length - 1) * lh) / 2 + fs * 0.36;
      g = L.map((t, i) => `<text x="${cx}" y="${y0 + i * lh}" text-anchor="middle" font-family="Antonio, Impact, 'Arial Narrow', sans-serif" font-weight="700" font-size="${fs}" letter-spacing="1" fill="${ink.text}">${t}</text>`).join('');
    } else return '';
    return `<g filter="url(#${k}ink)" opacity="${ink.a}" style="mix-blend-mode:${ink.blend}">${g}</g>`;
  }

  /* finishing layers inside the garment clip: print, light, folds, grain, texture */
  function finish(k, o) {
    const { p, ink, pr, dark, before = '', wr = '', grain = 0.2, tex = '', after = '', noPrint } = o;
    let t = '';
    if (tex === 'slub') t = `<rect width="100%" height="100%" filter="url(#${k}sl)" opacity="${dark ? 0.12 : 0.12}"/>`;
    else if (tex === 'heather') t = `<rect width="100%" height="100%" filter="url(#${k}hl)" opacity="${dark ? 0.14 : 0.22}"/><rect width="100%" height="100%" filter="url(#${k}hd)" opacity=".16"/>`;
    else if (tex === 'weave') t = `<rect width="100%" height="100%" filter="url(#${k}w)" opacity=".13"/>`;
    else if (tex === 'rib') t = `<rect width="100%" height="100%" fill="url(#${k}rf)" opacity=".05"/>`;
    return `${before}${noPrint ? '' : printArt(p, ink, pr.cx, pr.cy, pr.w, k)}${after}
      <rect width="100%" height="100%" fill="url(#${k}sh)"/><rect width="100%" height="100%" fill="url(#${k}sv)"/>${wr}
      <rect width="100%" height="100%" filter="url(#${k}g)" opacity="${grain}"/>${t}`;
  }
  const floor = (k, cx, y, rx, ry) => `<ellipse cx="${cx}" cy="${y}" rx="${rx}" ry="${ry}" fill="#000" opacity=".38" filter="url(#${k}b14)"/>`;
  const outline = (d) => `<path d="${d}" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="1.2"/>`;
  const setup = (color) => { const k = 'm' + ++n, base = FABRIC[color], dark = DARK.includes(color), ink = INK[color]; return { k, base, dark, ink, sc: dark ? lighter(base, 0.3) : darker(base, 0.32) }; };

  /* ================= WRAP-FRONT MATERNITY TEE (slub knit) ================= */
  function tee(p, color) {
    const { k, base, dark, ink, sc } = setup(color);
    const body = 'M146 46 C118 54 98 62 84 72 C58 86 30 114 6 170 L58 200 C70 188 82 178 92 172 C86 240 90 340 94 408 C160 420 240 420 306 408 C310 340 314 240 308 172 C318 178 330 188 342 200 L394 170 C370 114 342 86 316 72 C302 62 282 54 254 46 C244 86 156 86 146 46 Z';
    const front = 'M146 46 C156 86 244 86 254 46';
    const ridge = 'M158 66 C172 140 198 268 230 418';
    const panel = 'M154 60 C170 140 198 268 230 422 L340 424 L340 40 L260 44 C240 90 170 88 154 60Z';
    const wr = fold(k, 'M92 172 C124 196 142 238 134 300', 14, dark) + fold(k, 'M308 172 C276 196 258 238 266 300', 14, dark, 0.8) + fold(k, 'M250 280 C270 330 276 372 268 404', 10, dark, 0.6) + fold(k, 'M30 150 C46 160 52 176 52 192', 8, dark, 0.6) + fold(k, 'M370 150 C354 160 348 176 348 192', 8, dark, 0.6) +
      `<path d="M92 172 C100 190 106 204 112 214" stroke="#000" stroke-opacity=".28" stroke-width="10" fill="none" filter="url(#${k}b5)"/><path d="M308 172 C300 190 294 204 288 214" stroke="#000" stroke-opacity=".28" stroke-width="10" fill="none" filter="url(#${k}b5)"/>`;
    const layered = `<path d="${panel}" fill="${lighter(base, 0.05)}"/><path d="${panel}" fill="url(#${k}sv)" opacity=".5"/>
      <path d="${ridge}" fill="none" stroke="#000" stroke-opacity="${dark ? 0.55 : 0.34}" stroke-width="12" filter="url(#${k}b5)" transform="translate(-6 0)"/>
      <path d="${ridge}" fill="none" stroke="#fff" stroke-opacity="${dark ? 0.22 : 0.45}" stroke-width="2.4" transform="translate(2 0)"/>
      ${stitch('M166 70 C180 142 206 270 238 416', sc, 1.2)}`;
    const neckBack = `<path d="M146 46 C160 28 240 28 254 46 C244 86 156 86 146 46 Z" fill="${darker(base, 0.42)}"/><path d="M146 46 C160 28 240 28 254 46 C240 52 160 52 146 46Z" fill="#000" opacity=".25"/>`;
    const collar = `<path d="${front}" fill="none" stroke="${darker(base, 0.12)}" stroke-width="9" stroke-linecap="round"/><path d="${front}" fill="none" stroke="#fff" stroke-opacity="${dark ? 0.15 : 0.35}" stroke-width="1.6" transform="translate(0 -4)"/><path d="${front}" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="1.6" transform="translate(0 5)"/>`;
    const stitches = stitch('M12 160 L64 190', sc, 1.1) + stitch('M388 160 L336 190', sc, 1.1) + stitch('M97 400 C160 412 240 412 303 400', sc, 1.1) + stitch('M84 76 L146 52', sc, 1) + stitch('M316 76 L254 52', sc, 1);
    const pr = p.art === 'slogan' ? { cx: 266, cy: 206, w: 112 } : p.art === 'lotus' ? { cx: 268, cy: 196, w: 84 } : { cx: 266, cy: 206, w: 124 };
    return `<svg viewBox="0 0 400 440" role="img" aria-label="${p.name}">${defs(k, base, body)}${floor(k, 200, 424, 130, 10)}<path d="${body}" fill="${base}"/>
      <g clip-path="url(#${k}c)">${neckBack}${layered}${finish(k, { p, ink, pr, dark, wr, grain: 0.22, tex: 'slub' })}${collar}${stitches}</g>${outline(body)}</svg>`;
  }

  /* ================= RAGLAN TUNIC HOODIE ================= */
  function hoodie(p, color) {
    const { k, base, dark, ink, sc } = setup(color);
    const body = 'M128 84 C108 92 84 102 66 116 C46 134 34 240 30 360 L82 370 C84 304 90 246 98 206 C98 290 98 366 100 428 L300 428 C302 366 302 290 302 206 C310 246 316 304 318 370 L370 360 C366 240 354 134 334 116 C316 102 292 92 272 84 C250 100 150 100 128 84 Z';
    const hood = 'M126 90 C112 36 148 2 200 2 C252 2 288 36 274 90 C250 108 150 108 126 90 Z';
    const inner = 'M150 84 C148 48 176 30 200 30 C224 30 252 48 250 84 C230 106 170 106 150 84 Z';
    const pocket = 'M110 292 L290 292 L262 388 L138 388 Z';
    const raglanL = 'M130 90 C110 132 102 172 98 206', raglanR = 'M270 90 C290 132 298 172 302 206';
    const wr = fold(k, 'M98 206 C124 230 140 270 132 330', 15, dark) + fold(k, 'M302 206 C276 230 260 270 268 330', 15, dark, 0.8) + fold(k, 'M60 150 C56 220 56 280 52 340', 12, dark, 0.7) + fold(k, 'M340 150 C344 220 344 280 348 340', 12, dark, 0.7) + fold(k, 'M150 120 C160 170 150 210 160 262', 9, dark, 0.55) + fold(k, 'M244 124 C252 170 246 214 254 266', 9, dark, 0.5);
    const cuffL = 'M31 342 L82 352 L82 372 L30 362 Z', cuffR = 'M369 342 L318 352 L318 372 L370 362 Z';
    const ribs = `<path d="${cuffL}" fill="url(#${k}rib)"/><path d="${cuffR}" fill="url(#${k}rib)"/><path d="M31 342 L82 352" stroke="#000" stroke-opacity=".3" stroke-width="2.4"/><path d="M369 342 L318 352" stroke="#000" stroke-opacity=".3" stroke-width="2.4"/>
      <path d="M100 410 L300 410" stroke="#000" stroke-opacity=".22" stroke-width="2.4"/><path d="M100 413 L300 413" stroke="#fff" stroke-opacity=".28" stroke-width="1.4"/>
      <path d="M96 396 L104 396 L100 428Z M296 396 L304 396 L300 428Z" fill="#000" opacity=".3"/>`;
    const raglan = `<path d="${raglanL}" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="5" filter="url(#${k}b2)" transform="translate(-2 0)"/><path d="${raglanR}" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="5" filter="url(#${k}b2)" transform="translate(2 0)"/>${stitch(raglanL, sc, 1.1)}${stitch(raglanR, sc, 1.1)}`;
    const pocketMk = `<path d="${pocket}" fill="${darker(base, 0.04)}" opacity=".55"/><path d="${pocket}" fill="url(#${k}sv)" opacity=".6"/><path d="M110 292 L290 292" stroke="#fff" stroke-opacity="${dark ? 0.2 : 0.5}" stroke-width="2"/><path d="M110 292 L138 388" stroke="#000" stroke-opacity=".45" stroke-width="3" filter="url(#${k}b1)"/><path d="M290 292 L262 388" stroke="#000" stroke-opacity=".45" stroke-width="3" filter="url(#${k}b1)"/>${stitch('M118 296 L142 380', sc, 1.1)}${stitch('M282 296 L258 380', sc, 1.1)}${stitch('M140 384 L260 384', sc, 1.1)}`;
    const lining = `<path d="${inner}" fill="${darker(base, 0.34)}"/><path d="${inner}" fill="url(#${k}sh)"/><path d="${inner}" fill="#000" opacity=".16"/>`;
    const rim = `<path d="M150 84 C148 48 176 30 200 30 C224 30 252 48 250 84 C230 106 170 106 150 84" fill="none" stroke="${darker(base, 0.1)}" stroke-width="10"/><path d="M150 84 C148 48 176 30 200 30 C224 30 252 48 250 84 C230 106 170 106 150 84" fill="none" stroke="#fff" stroke-opacity="${dark ? 0.14 : 0.35}" stroke-width="2" transform="translate(-1 -5)"/>`;
    const cord = dark ? '#ddd1bd' : '#f4efe6';
    const cords = [[178, 166], [222, 166]].map(([x, y2], i) => { const sx = i ? 1 : -1, d = `M${x} 100 C${x + sx * 4} 124 ${x - sx * 2} 148 ${x + sx * 2} ${y2}`; return `<path d="${d}" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="5.5" filter="url(#${k}b2)" transform="translate(2 3)"/><path d="${d}" fill="none" stroke="${cord}" stroke-width="4.4" stroke-linecap="round"/><rect x="${x + sx * 2 - 3}" y="${y2 - 1}" width="6" height="13" rx="2.4" fill="${dark ? '#c9a46a' : '#8b7a63'}"/><circle cx="${x}" cy="98" r="4.6" fill="#000" opacity=".4"/><circle cx="${x}" cy="98" r="4.6" fill="none" stroke="${dark ? '#c9a46a' : '#9a8a73'}" stroke-width="1.6"/>`; }).join('');
    const pr = p.art === 'slogan' ? { cx: 200, cy: 240, w: 104 } : p.art === 'lotus' ? { cx: 200, cy: 234, w: 90 } : { cx: 200, cy: 232, w: 116 };
    return `<svg viewBox="0 0 400 440" role="img" aria-label="${p.name}">${defs(k, base, body + ' ' + hood, { grain: 1.1 })}${floor(k, 200, 434, 130, 9)}
      <path d="${hood}" fill="${darker(base, 0.12)}"/><path d="${hood}" fill="none" stroke="#000" stroke-opacity=".2" stroke-width="1.2"/><path d="${body}" fill="${base}"/>
      <g clip-path="url(#${k}c)">${ribs}${finish(k, { p, ink, pr, dark, wr, grain: 0.26 })}${raglan}${pocketMk}${lining}${rim}</g>${cords}${outline(body)}</svg>`;
  }

  /* ================= DROP-SHOULDER HALF-ZIP FLEECE ================= */
  function halfzip(p, color) {
    const { k, base, dark, ink, sc } = setup(color);
    const body = 'M150 54 L84 92 C54 122 30 230 36 336 L40 372 L94 380 L96 346 C100 300 104 250 112 196 C112 260 114 330 116 372 L112 418 L288 418 L284 372 C286 330 288 260 288 196 C296 250 300 300 304 346 L306 380 L360 372 L364 336 C370 230 346 122 316 92 L250 54 Z';
    const collar = 'M126 68 C122 30 158 6 200 4 C242 6 278 30 274 68 C250 80 150 80 126 68 Z';
    const wr = fold(k, 'M112 196 C140 230 156 280 148 346', 16, dark) + fold(k, 'M288 196 C260 230 244 280 252 346', 16, dark, 0.8) + fold(k, 'M60 130 C48 200 50 270 56 330', 12, dark, 0.7) + fold(k, 'M340 130 C352 200 350 270 344 330', 12, dark, 0.7) + fold(k, 'M170 230 C186 280 176 320 190 360', 10, dark, 0.5) +
      `<path d="M112 196 C118 216 124 230 128 240" stroke="#000" stroke-opacity=".3" stroke-width="12" fill="none" filter="url(#${k}b5)"/><path d="M288 196 C282 216 276 230 272 240" stroke="#000" stroke-opacity=".3" stroke-width="12" fill="none" filter="url(#${k}b5)"/>`;
    const ribs = `<path d="M40 340 L94 348 L94 380 L40 372Z" fill="url(#${k}rib)"/><path d="M360 340 L306 348 L306 380 L360 372Z" fill="url(#${k}rib)"/><path d="M114 376 L286 376 L288 418 L112 418Z" fill="url(#${k}rib)"/>
      <path d="M40 340 L94 348" stroke="#000" stroke-opacity=".3" stroke-width="2.4"/><path d="M360 340 L306 348" stroke="#000" stroke-opacity=".3" stroke-width="2.4"/><path d="M114 376 L286 376" stroke="#000" stroke-opacity=".32" stroke-width="2.6"/><path d="M114 379 L286 379" stroke="#fff" stroke-opacity=".25" stroke-width="1.4"/>`;
    const seams = `<path d="M84 92 C102 132 108 164 112 196" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="5" filter="url(#${k}b2)" transform="translate(-2 0)"/><path d="M316 92 C298 132 292 164 288 196" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="5" filter="url(#${k}b2)" transform="translate(2 0)"/>${stitch('M84 92 C102 132 108 164 112 196', sc, 1.1)}${stitch('M316 92 C298 132 292 164 288 196', sc, 1.1)}${stitch('M150 56 L84 94', sc, 1.1)}${stitch('M250 56 L316 94', sc, 1.1)}`;
    const zipTape = dark ? '#2a211b' : darker(base, 0.34), tooth = dark ? '#c9a46a' : '#a89c88';
    const zip = `<path d="M192 50 L190 164" stroke="${zipTape}" stroke-width="7"/><path d="M208 50 L210 164" stroke="${zipTape}" stroke-width="7"/><path d="M196 50 L196 160 M204 50 L204 160" stroke="${tooth}" stroke-width="2.4" stroke-dasharray="2 2.2"/>
      <path d="M190 166 L210 166" stroke="#000" stroke-opacity=".4" stroke-width="3"/><rect x="195" y="52" width="10" height="16" rx="3" fill="${tooth}" stroke="#000" stroke-opacity=".3" stroke-width=".8"/><rect x="197" y="68" width="6" height="22" rx="3" fill="${lighter(tooth, 0.2)}" stroke="#000" stroke-opacity=".3" stroke-width=".8"/>`;
    const collarMk = `<path d="${collar}" fill="${darker(base, 0.08)}"/><path d="M160 60 C176 48 190 46 196 50 L196 62 C184 56 170 60 160 66Z" fill="#000" opacity=".12"/><path d="M240 60 C224 48 210 46 204 50 L204 62 C216 56 230 60 240 66Z" fill="#000" opacity=".12"/>
      <path d="M126 68 C122 30 158 6 200 4 C242 6 278 30 274 68" fill="none" stroke="#fff" stroke-opacity="${dark ? 0.16 : 0.4}" stroke-width="2" transform="translate(0 2)"/><path d="M126 68 C150 80 250 80 274 68" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="2.6"/><path d="M152 46 C172 30 228 30 248 46 C230 56 170 56 152 46Z" fill="#000" opacity=".2"/>${stitch('M138 64 C144 30 256 30 262 64', sc, 1, '3.5 3')}`;
    const emb = p.art === 'lotus' || p.art === 'mark';
    const pr = p.art === 'slogan' ? { cx: 200, cy: 250, w: 110 } : { cx: 268, cy: 164, w: p.art === 'lotus' ? 52 : 64 };
    return `<svg viewBox="0 0 400 440" role="img" aria-label="${p.name}">${defs(k, base, body + ' ' + collar, { grain: 1.1 })}${floor(k, 200, 428, 140, 9)}<path d="${body}" fill="${base}"/><path d="${collar}" fill="${darker(base, 0.1)}"/>
      <g clip-path="url(#${k}c)">${ribs}${finish(k, { p, ink, pr, dark, wr, grain: 0.28 })}${seams}${collarMk}${zip}</g>${outline(body)}${emb ? '' : ''}</svg>`;
  }

  /* ================= BODYSUIT (lap shoulders, snaps, patch pocket with a lotus) ================= */
  function onesie(p, color, o = {}) {
    const { k, base, dark, ink, sc } = setup(color);
    const body = 'M138 32 C120 38 100 46 84 56 C62 68 44 86 28 112 L68 156 C80 148 90 142 98 138 C96 198 98 252 100 300 C100 336 98 362 104 386 C126 362 150 354 172 372 L172 404 C176 414 224 414 228 404 L228 372 C250 354 274 362 296 386 C302 362 300 336 300 300 C302 252 304 198 302 138 C310 142 320 148 332 156 L372 112 C356 86 338 68 316 56 C300 46 280 38 262 32 C246 64 154 64 138 32 Z';
    const front = 'M138 32 C154 64 246 64 262 32';
    const wr = fold(k, 'M98 138 C120 170 134 210 128 270', 13, dark) + fold(k, 'M302 138 C280 170 266 210 272 270', 13, dark, 0.8) + fold(k, 'M122 300 C170 320 232 318 280 298', 11, dark, 0.65) + fold(k, 'M160 90 C168 130 160 160 170 200', 8, dark, 0.5) + fold(k, 'M44 120 C54 130 58 142 60 152', 7, dark, 0.6) + fold(k, 'M356 120 C346 130 342 142 340 152', 7, dark, 0.6);
    const neckBack = `<path d="M138 32 C154 14 246 14 262 32 C246 64 154 64 138 32 Z" fill="${darker(base, 0.45)}"/><path d="M138 32 C154 14 246 14 262 32 C246 40 154 40 138 32Z" fill="#000" opacity=".26"/>`;
    const collar = `<path d="${front}" fill="none" stroke="url(#${k}rib)" stroke-width="12" stroke-linecap="round"/><path d="${front}" fill="none" stroke="#fff" stroke-opacity="${dark ? 0.14 : 0.35}" stroke-width="2" transform="translate(0 -5)"/>`;
    const lapL = 'M150 38 C166 70 196 88 238 92', lapR = 'M250 38 C238 62 216 74 196 78';
    const lap = [lapL, lapR].map((d, i) => `<path d="${d}" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="5" filter="url(#${k}b2)"/><path d="${d}" fill="none" stroke="${darker(base, 0.14)}" stroke-width="${i ? 7 : 9}" opacity=".85"/><path d="${d}" fill="none" stroke="#fff" stroke-opacity="${dark ? 0.14 : 0.4}" stroke-width="1.6" transform="translate(0 -4)"/>`).join('');
    const legs = `<path d="M104 386 C126 362 150 354 172 372" fill="none" stroke="url(#${k}rib)" stroke-width="11"/><path d="M296 386 C274 362 250 354 228 372" fill="none" stroke="url(#${k}rib)" stroke-width="11"/><path d="M172 376 L172 404 C176 414 224 414 228 404 L228 376" fill="none" stroke="url(#${k}rib)" stroke-width="11"/>`;
    const snaps = [186, 200, 214].map((x, i) => { const y = [396, 400, 396][i]; return `<circle cx="${x}" cy="${y}" r="4.2" fill="#000" opacity=".35" transform="translate(.8 1.2)"/><circle cx="${x}" cy="${y}" r="4.2" fill="${dark ? '#d9c8a6' : '#cfc7b8'}" stroke="#000" stroke-opacity=".3" stroke-width=".8"/><circle cx="${x - 1}" cy="${y - 1}" r="1.4" fill="#fff" opacity=".7"/>`; }).join('');
    const stitches = stitch('M34 118 L72 156', sc) + stitch('M366 118 L328 156', sc) + stitch('M110 378 C128 358 150 352 168 366', sc, 1) + stitch('M290 378 C272 358 250 352 232 366', sc, 1) + stitch('M146 40 C160 74 240 74 254 40', sc, 1);
    /* pattern all-over (lotuses or hearts) */
    let before = '';
    if (o.pattern) {
      const pid = k + 'pt', col = o.pattern.color || ink.thread, mk = o.pattern.kind === 'heart' ? `<path d="M13 21C8 17 6 14 6 11C6 8 10 7 13 10C16 7 20 8 20 11C20 14 18 17 13 21Z" fill="${col}"/>` : `<g transform="translate(0.5 1) scale(.5)">${strip(DH.lotus('', { color: col }))}</g>`;
      before = `<defs><pattern id="${pid}" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)"><g transform="translate(2 2)">${mk}</g><g transform="translate(24 24)">${mk}</g></pattern></defs><rect width="400" height="440" fill="url(#${pid})" opacity=".9"/>`;
    }
    /* patch pocket with a lotus rising out of it (the frog, replaced) */
    let pocket = '';
    if (o.pocket) {
      const pb = 'M214 130 H288 V156 C288 168 278 174 266 174 H236 C224 174 214 168 214 156 Z', th = ink.thread, pf = dark ? lighter(base, 0.07) : darker(base, 0.07);
      pocket = `<path d="${pb}" fill="#000" opacity=".28" filter="url(#${k}b2)" transform="translate(1.5 3)"/><path d="${pb}" fill="${pf}"/><path d="${pb}" fill="url(#${k}rf)" opacity=".12"/>
        <path d="${pb}" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="1.6"/><path d="M216 131.6 H286" stroke="#fff" stroke-opacity="${dark ? 0.22 : 0.55}" stroke-width="1.6"/>${stitch('M219 137 H283 V156 C283 164 276 169 266 169 H236 C226 169 219 164 219 156Z', th, 1, '3 2.6')}
        <g transform="translate(1.4 2.2)" opacity=".3" filter="url(#${k}b1)">${lotusG('#000', 251, 142, 64)}</g>${lotusG(th, 251, 142, 64)}`;
    }
    const pr = p.art === 'slogan' ? { cx: 200, cy: 214, w: 112 } : { cx: 200, cy: 214, w: 136 };
    return `<svg viewBox="0 0 400 440" role="img" aria-label="${p.name}">${defs(k, base, body)}${floor(k, 200, 426, 118, 9)}<path d="${body}" fill="${base}"/>
      <g clip-path="url(#${k}c)">${neckBack}${before}${finish(k, { p, ink, pr, dark, wr, grain: 0.2, tex: 'rib', noPrint: !!o.pocket || !!o.pattern })}${lap}${collar}${legs}${stitches}${pocket}</g>${snaps}${outline(body)}</svg>`;
  }

  /* ================= ZIP TOTE (striped webbing, leatherette X-stitch tabs, side pockets) ================= */
  function tote(p, color) {
    const { k, base, dark, ink, sc } = setup(color);
    const body = 'M42 218 C150 208 290 208 398 218 L394 398 C394 408 386 414 376 414 H64 C54 414 46 408 46 398 Z';
    const strapC = ['#2b211c', '#f1e9dc', '#aa4f36'];
    const strap = (d) => `<path d="${d}" fill="none" stroke="#000" stroke-opacity=".4" stroke-width="18" filter="url(#${k}b5)" transform="translate(3 7)"/><path d="${d}" fill="none" stroke="${strapC[0]}" stroke-width="17"/><path d="${d}" fill="none" stroke="${strapC[1]}" stroke-width="8.5"/><path d="${d}" fill="none" stroke="${strapC[2]}" stroke-width="2.4"/><path d="${d}" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="3" transform="translate(-3 0)"/>`;
    const sL = 'M150 226 C150 150 180 70 214 14', sR = 'M290 226 C290 150 250 70 214 14';
    const pL = 'M46 274 L138 254 L138 412 L50 412Z', pR = 'M394 274 L302 254 L302 412 L390 412Z';
      const leather = (x) => `<rect x="${x - 21}" y="216" width="42" height="42" rx="3" fill="#2b211c"/><rect x="${x - 21}" y="216" width="42" height="42" rx="3" fill="url(#${k}sv)" opacity=".6"/><rect x="${x - 21}" y="216" width="42" height="42" rx="3" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="1.2"/>
      <rect x="${x - 17}" y="220" width="34" height="34" rx="1.5" fill="none" stroke="#f1e9dc" stroke-opacity=".9" stroke-width="1.3" stroke-dasharray="4 3"/>
      <path d="M${x - 17} 220 L${x + 17} 254 M${x + 17} 220 L${x - 17} 254" stroke="#f1e9dc" stroke-width="1.5" stroke-dasharray="4 3"/><path d="M${x - 21} 217 H${x + 21}" stroke="#fff" stroke-opacity=".22" stroke-width="1.5"/>`;
    const th = dark ? lighter(base, 0.32) : darker(base, 0.3);
    const zipper = `<path d="M42 220 C150 210 290 210 398 220" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="5"/><path d="M42 220 C150 210 290 210 398 220" fill="none" stroke="#a89c88" stroke-width="2" stroke-dasharray="2 2.2"/><rect x="52" y="214" width="16" height="9" rx="3" fill="#c9bfae" stroke="#000" stroke-opacity=".4" stroke-width=".8" transform="rotate(-2 60 218)"/>`;
    const pockets = `<path d="${pL}" fill="${darker(base, 0.03)}" opacity=".6"/><path d="${pR}" fill="${darker(base, 0.03)}" opacity=".6"/><path d="${pL}" fill="none" stroke="#000" stroke-opacity=".32" stroke-width="1.6"/><path d="${pR}" fill="none" stroke="#000" stroke-opacity=".32" stroke-width="1.6"/>
      <path d="M46 274 L138 254" stroke="#fff" stroke-opacity="${dark ? 0.16 : 0.5}" stroke-width="2"/><path d="M394 274 L302 254" stroke="#fff" stroke-opacity="${dark ? 0.16 : 0.5}" stroke-width="2"/>
      <path d="M138 254 V412" stroke="#000" stroke-opacity=".3" stroke-width="3" filter="url(#${k}b1)"/><path d="M302 254 V412" stroke="#000" stroke-opacity=".3" stroke-width="3" filter="url(#${k}b1)"/>${stitch('M52 280 L132 262 M132 262 V406', th, 1.1)}${stitch('M388 280 L308 262 M308 262 V406', th, 1.1)}`;
    const wr = fold(k, 'M150 300 C156 340 148 380 156 410', 14, dark, 0.6) + fold(k, 'M290 300 C284 340 292 380 284 410', 14, dark, 0.6) + fold(k, 'M60 410 C150 418 290 418 380 410', 10, dark, 0.8) + fold(k, 'M60 240 C150 252 290 252 380 240', 10, dark, 0.4);
    const pr = p.art === 'slogan' ? { cx: 220, cy: 322, w: 128 } : p.art === 'lotus' ? { cx: 220, cy: 322, w: 104 } : { cx: 220, cy: 318, w: 124 };
    return `<svg viewBox="0 0 440 440" role="img" aria-label="${p.name}">${defs(k, base, body, { grain: 1 })}${floor(k, 220, 424, 170, 9)}
      ${strap(sL)}${strap(sR)}<path d="${body}" fill="${base}"/>
      <g clip-path="url(#${k}c)">${finish(k, { p, ink, pr, dark, wr, grain: 0.2, tex: 'heather' })}${pockets}${zipper}</g>${leather(150)}${leather(290)}${outline(body)}</svg>`;
  }

  /* ================= FIRST FIVE: the five-pack ================= */
  function pack(p) {
    const items = [
      { c: 'cream', o: { pattern: { kind: 'lotus', color: '#aa4f36' } }, x: 16, y: 14 },
      { c: 'clay', o: { pocket: true }, x: 280, y: 6 },
      { c: 'honey', o: { pocket: true }, x: 148, y: 116 },
      { c: 'dawn', o: { pocket: true }, x: 6, y: 262 },
      { c: 'cream', o: { pattern: { kind: 'heart', color: '#7c95b1' } }, x: 286, y: 252 }
    ];
    return `<svg viewBox="0 0 500 560" role="img" aria-label="${p.name}">${items.map((it) => { const s = onesie({ name: 'Bodysuit', art: 'none' }, it.c, it.o); return s.replace('<svg viewBox="0 0 400 440" role="img" aria-label="Bodysuit">', `<svg x="${it.x}" y="${it.y}" width="214" height="235" viewBox="0 0 400 440">`); }).join('')}</svg>`;
  }

  window.DH_MERCH = function (p, color) {
    if (p.kind === 'pack') return pack(p);
    const c = FABRIC[color] ? color : (p.colors && p.colors[0]) || 'cream';
    if (p.kind === 'onesie') return onesie(p, c, p.art === 'pocket' ? { pocket: true } : {});
    return { tee, hoodie, halfzip, tote }[p.kind](p, c);
  };
  window.DH_MERCH.FABRIC = FABRIC;
})();
