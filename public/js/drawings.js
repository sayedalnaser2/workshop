// Schematic SVG drawings for window / door models. Pure functions → SVG strings.

export const KINDS = {
  fix: 'Fixed window', hinged1: 'Single hinged', hinged2: 'Two-leaf hinged', bottom: 'Bottom hinged', tilt: 'Tilt & turn',
  sliding2: 'Sliding – 2 panels', sliding3: 'Sliding – 3 panels', sliding4: 'Sliding – 4 panels',
  door1: 'Single swing door', door2: 'Double swing door', partition: 'Frameless / partition', partition_frame: 'Framed partition', custom: 'Custom design (dividers)',
  shower_fix: 'Shower – fixed panel', shower_door: 'Shower – hinged door', shower_slide: 'Shower – sliding',
  railing: 'Glass railing', railing_bar: 'Railing – posts & balusters', curtain: 'Curtain wall', mirror: 'Mirror', folding: 'Folding door',
};


/** Finish colours → screen colour, glass types → tint, stone names → colour. Used so drawings follow the choices made. */
const COLOUR_HEX = { white: '#f2f2ee', brown: '#6b4a2f', black: '#2a2c30', bronze: '#8c6a3d', silver: '#c4cad1', wood: '#a5733b', grey: '#8a8f98', gray: '#8a8f98', gold: '#c9a227', champagne: '#d9c7a1', 'dark grey': '#555a63', natural: '#d8dadd', beige: '#d8c9a8', cream: '#ece3cf', blue: '#3f6fa8', green: '#4f7a5c', red: '#b5483c' };
export const HAND_KINDS = ['hinged1', 'door1', 'shower_door'];
export const SWING_KINDS = ['hinged1', 'hinged2', 'bottom', 'tilt', 'door1', 'door2', 'shower_door', 'folding'];
/** The shop's own colours (name + code from the Colours page) take precedence over the built-in look. */
let CUSTOM = new Map();
export function setColourDefs(list) { TEX.clear(); if (typeof Image !== 'undefined') for (const x of list || []) if (x && x.name && typeof x.tex === 'string' && x.tex.startsWith('data:image/')) { const im = new Image(); im.src = x.tex; TEX.set(String(x.name).toLowerCase().trim(), im); } CUSTOM = new Map((list || []).filter((x) => x && x.name && /^#[0-9a-f]{6}$/i.test(x.hex || '')).map((x) => [String(x.name).toLowerCase().trim(), String(x.hex).toLowerCase()])); }
const TEX = new Map(); // colour name → picture (an Image once loaded)
export function colourTex(name) { const n = String(name || '').toLowerCase().trim(); const im = TEX.get(n); return im && im.complete && im.naturalWidth ? im : null; }
export const colourHex = (name) => { const n = String(name || '').toLowerCase().trim(); if (!n) return ''; if (CUSTOM.has(n)) return CUSTOM.get(n); return COLOUR_HEX[n] || Object.entries(COLOUR_HEX).find(([k]) => n.includes(k))?.[1] || ''; };
export const GLASS_HEX = [[/mirror/, '#e6eef3'], [/reflect/, '#8fb7bf'], [/tint|dark/, '#7f9bad'], [/bronze/, '#b79a7c'], [/grey|gray/, '#97a3ab'], [/sandblast|frost|obscure|satin|acid/, '#eef2f4'], [/lamin/, '#c4dfec'], [/double|insul/, '#bddcee'], [/tempered/, '#cde6f4']];
export const glassHex = (name) => { const n = String(name || '').toLowerCase(); return (GLASS_HEX.find(([re]) => re.test(n)) || [0, '#cfe6f7'])[1]; };
const STONE_HEX = [[/black|galaxy|nero|marquina/, '#2b2d33'], [/white|carrara|calacatta|statuario|snow/, '#e9e7e2'], [/grey|gray|ash|concrete/, '#8a8d93'], [/beige|cream|crema|travertine|sand/, '#d8c9a8'], [/brown|emperador|coffee|chocolate/, '#6b4a3a'], [/green|verde/, '#4f6b58'], [/red|rosso/, '#8c3b34'], [/blue|azul/, '#3f5f86']];
export const stoneHex = (name) => { const n = String(name || '').toLowerCase(); return (STONE_HEX.find(([re]) => re.test(n)) || [0, '#6b6f78'])[1]; };
const mix = (hex, to, a) => { const f = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const [r, g, b] = f(hex); const [r2, g2, b2] = f(to); return '#' + [r + (r2 - r) * a, g + (g2 - g) * a, b + (b2 - b) * a].map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''); };
export const lighten = (hex, a) => mix(hex, '#ffffff', a);

/** colour = finish name (frame), glass = glass type name (pane tint). Both optional. */
export function drawModel(kind, w = 100, h = 100, { dims = true, colour = '', glass: glassName = '', hand = '', swing = '', layout = null } = {}) {
  const FR = colourHex(colour) || '#9aa7b5'; const FR2 = colourHex(colour) ? lighten(FR, .55) : '#e9eef4'; const FR3 = colourHex(colour) ? lighten(FR, .3) : '#cfd8e2'; const GL = glassName ? glassHex(glassName) : '#cfe6f7';
  w = Number(w) || 100; h = Number(h) || 100;
  const M = 150; const k = M / Math.max(w, h);
  const W = Math.max(40, w * k), H = Math.max(40, h * k);
  const pad = dims ? 26 : 8; const ox = pad, oy = 8;
  const vw = W + pad + 14, vh = H + oy + (dims ? 26 : 8);
  const ft = 5; // frame thickness
  const glass = `fill="${GL}" stroke="#26435f" stroke-width="1"`;
  const line = 'stroke="#26435f" stroke-width="1" fill="none"';
  const dash = `stroke="#26435f" stroke-width="1" fill="none" stroke-dasharray="${swing === 'in' ? '1.5 3' : '4 3'}"`; // dashed = opens outward, dotted = opens inward
  const HR = hand === 'R'; // hinge on the right (viewed from outside)
  const F = (x, y, w, h) => `<text x="${x + w / 2}" y="${y + h / 2 + Math.min(w, h) * .12}" font-size="${Math.max(12, Math.min(34, Math.min(w, h) * .3))}" font-weight="700" text-anchor="middle" fill="#26435f" opacity=".75">F</text>`; // F = fixed pane
  const tag = (txt) => (swing ? `<text x="${ox + 4}" y="${oy + 12}" font-size="9" font-weight="700" fill="#26435f" opacity=".8">${txt}</text>` : '');
  const x0 = ox, y0 = oy, x1 = ox + W, y1 = oy + H;
  let s = `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="${FR}" stroke="#26435f" stroke-width="1.5"/>`;
  const pane = (x, y, ww, hh) => `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" ${glass}/>`;
  const ix = x0 + ft, iy = y0 + ft, iw = W - 2 * ft, ih = H - 2 * ft;
  // dashed opening symbol: its point is on the side OPPOSITE the hinge (the handle side), so every symbol is drawn with the hinge side flipped
  const tri = (x, y, ww, hh, side) => {
    const hinge = { L: 'R', R: 'L', B: 'T', T: 'B' }[side] || side;
    if (hinge === 'L') return `<path d="M${x + ww} ${y} L${x} ${y + hh / 2} L${x + ww} ${y + hh}" ${dash}/>`;
    if (hinge === 'R') return `<path d="M${x} ${y} L${x + ww} ${y + hh / 2} L${x} ${y + hh}" ${dash}/>`;
    if (hinge === 'B') return `<path d="M${x} ${y} L${x + ww / 2} ${y + hh} L${x + ww} ${y}" ${dash}/>`;
    return `<path d="M${x} ${y + hh} L${x + ww / 2} ${y} L${x + ww} ${y + hh}" ${dash}/>`;
  };
  const arrow = (x, y, dir) => `<path d="M${x} ${y} h${dir * 22} m${-dir * 6} -4 l${dir * 6} 4 l${-dir * 6} 4" ${line} stroke-width="1.6"/>`;
  const handle = (x, y) => `<rect x="${x - 1.5}" y="${y - 7}" width="3" height="14" rx="1.5" fill="#26435f"/>`;

  switch (kind) {
    case 'fix':
      s += pane(ix, iy, iw, ih) + `<path d="M${ix + 10} ${iy + ih - 8} L${ix + 40} ${iy + 8}" stroke="#fff" stroke-width="3" opacity=".7"/>` + F(ix, iy, iw, ih);
      break;
    case 'hinged1': s += pane(ix, iy, iw, ih) + tri(ix + 4, iy + 4, iw - 8, ih - 8, HR ? 'R' : 'L') + handle(HR ? ix + 8 : ix + iw - 8, y0 + H / 2) + tag(swing === 'in' ? 'OPENS IN' : 'OPENS OUT'); break;
    case 'bottom': s += pane(ix, iy, iw, ih) + tri(ix + 4, iy + 4, iw - 8, ih - 8, 'B') + handle(x0 + W / 2, iy + 8) + tag(swing === 'in' ? 'OPENS IN' : 'OPENS OUT'); break;
    case 'tilt': s += pane(ix, iy, iw, ih) + tri(ix + 4, iy + 4, iw - 8, ih - 8, 'L') + tri(ix + 4, iy + 4, iw - 8, ih - 8, 'B') + handle(ix + iw - 8, y0 + H / 2); break;
    case 'hinged2': {
      const m = ix + iw / 2;
      s += pane(ix, iy, iw / 2 - 1, ih) + pane(m + 1, iy, iw / 2 - 1, ih) + tri(ix + 3, iy + 3, iw / 2 - 7, ih - 6, 'L') + tri(m + 4, iy + 3, iw / 2 - 7, ih - 6, 'R') + handle(m - 5, y0 + H / 2) + handle(m + 5, y0 + H / 2);
      break;
    }
    case 'sliding2': case 'sliding3': case 'sliding4': {
      const n = Number(kind.slice(-1)); const ov = 4; const pw = (iw + ov * (n - 1)) / n;
      // which panels slide: 2 panels → one slides (hand L = left one), 3 → the outer two, 4 → the outer two; the rest are fixed (F)
      const moving = n === 2 ? [HR ? 1 : 0] : [0, n - 1];
      for (let i = 0; i < n; i++) {
        const px = ix + i * (pw - ov);
        s += `<rect x="${px}" y="${iy}" width="${pw}" height="${ih}" ${glass} fill-opacity="${i % 2 ? 1 : .75}"/><rect x="${px + 1.5}" y="${iy + 1.5}" width="${pw - 3}" height="${ih - 3}" ${line} stroke-opacity=".35"/>`;
        if (moving.includes(i)) s += arrow(i === 0 ? px + 8 : px + pw - 8, y0 + H / 2, i === 0 ? 1 : -1); else s += F(px, iy, pw, ih);
      }
      break;
    }
    case 'door1':
      s += `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="${FR2}" stroke="#26435f"/>` + pane(ix + iw * .18, iy + ih * .08, iw * .64, ih * .5) + `<rect x="${ix + iw * .18}" y="${iy + ih * .64}" width="${iw * .64}" height="${ih * .26}" fill="${FR3}" stroke="#26435f"/>` + handle(HR ? ix + 7 : ix + iw - 7, y0 + H * .55) + tri(ix + 4, iy + 4, iw - 8, ih - 8, HR ? 'R' : 'L') + tag(swing === 'in' ? 'OPENS IN' : 'OPENS OUT');
      break;
    case 'door2': {
      const m = ix + iw / 2;
      for (const [x, ww] of [[ix, iw / 2 - 1], [m + 1, iw / 2 - 1]]) s += `<rect x="${x}" y="${iy}" width="${ww}" height="${ih}" fill="${FR2}" stroke="#26435f"/>` + pane(x + ww * .16, iy + ih * .08, ww * .68, ih * .5) + `<rect x="${x + ww * .16}" y="${iy + ih * .64}" width="${ww * .68}" height="${ih * .26}" fill="${FR3}" stroke="#26435f"/>`;
      s += handle(m - 5, y0 + H * .55) + handle(m + 5, y0 + H * .55) + tri(ix + 3, iy + 3, iw / 2 - 7, ih - 6, 'L') + tri(m + 4, iy + 3, iw / 2 - 7, ih - 6, 'R');
      break;
    }
    case 'partition':
      s = `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" ${glass} stroke-width="1.5"/><path d="M${x0 + 12} ${y1 - 10} L${x0 + 44} ${y0 + 10}" stroke="#fff" stroke-width="3" opacity=".7"/>` + F(x0, y0, W, H);
      break;
    case 'partition_frame': {
      const n = 2; const pw = iw / n;
      for (let i = 0; i < n; i++) s += pane(ix + i * pw + (i ? 2 : 0), iy, pw - (i ? 2 : 0) - (i < n - 1 ? 2 : 0), ih) + F(ix + i * pw, iy, pw, ih);
      s += `<line x1="${ix + pw}" y1="${iy}" x2="${ix + pw}" y2="${iy + ih}" stroke="#26435f" stroke-width="3"/>`;
      break;
    }
    case 'shower_fix':
      s = `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" ${glass} stroke-width="1.5"/>` + [0.15, 0.85].map((f) => `<circle cx="${x0 + 7}" cy="${y0 + H * f}" r="3" fill="#26435f"/>`).join('') + `<path d="M${x0 + 14} ${y1 - 12} L${x0 + 44} ${y0 + 12}" stroke="#fff" stroke-width="3" opacity=".7"/>` + F(x0, y0, W, H);
      break;
    case 'shower_door':
      s = `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" ${glass} stroke-width="1.5"/>` + [0.12, 0.88].map((f) => `<rect x="${HR ? x1 - 8 : x0 - 1}" y="${y0 + H * f - 5}" width="9" height="10" fill="#26435f" rx="1"/>`).join('') + tri(x0 + 4, y0 + 4, W - 8, H - 8, HR ? 'R' : 'L') + `<rect x="${HR ? x0 + 6 : x1 - 10}" y="${y0 + H / 2 - 14}" width="3.5" height="28" rx="1.7" fill="#26435f"/>` + tag(swing === 'in' ? 'OPENS IN' : 'OPENS OUT');
      break;
    case 'shower_slide': {
      s = `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="none" stroke="#26435f" stroke-width="1.5"/><rect x="${x0}" y="${y0}" width="${W}" height="4" fill="${FR}"/><rect x="${x0}" y="${y1 - 4}" width="${W}" height="4" fill="${FR}"/>`;
      const pw = (W - 2) / 2 + 3;
      s += `<rect x="${x0 + 1}" y="${y0 + 5}" width="${pw}" height="${H - 10}" ${glass} fill-opacity=".75"/><rect x="${x1 - pw - 1}" y="${y0 + 5}" width="${pw}" height="${H - 10}" ${glass}/>` + arrow(x0 + 10, y0 + H / 2, 1);
      break;
    }
    case 'railing': {
      const n = Math.max(1, Math.round(w / 120)); const pw = (W - 4) / n;
      s = `<rect x="${x0}" y="${y0}" width="${W}" height="6" rx="3" fill="#7d8a9a" stroke="#26435f"/><rect x="${x0}" y="${y1 - 5}" width="${W}" height="5" fill="${FR}" stroke="#26435f"/>`;
      for (let i = 0; i < n; i++) s += `<rect x="${x0 + 2 + i * pw + 1}" y="${y0 + 8}" width="${pw - 2}" height="${H - 15}" ${glass}/>` + F(x0 + 2 + i * pw, y0 + 8, pw, H - 15);
      for (let i = 0; i <= n; i++) s += `<rect x="${x0 + i * pw + (i === n ? 0 : 0) - 1}" y="${y0 + 6}" width="4" height="${H - 11}" fill="#26435f"/>`;
      break;
    }
    case 'railing_bar': {
      const n = Math.max(2, Math.round(w / 11)); const np = Math.max(2, Math.round(w / 120) + 1);
      s = `<rect x="${x0}" y="${y0}" width="${W}" height="6" rx="3" fill="#7d8a9a" stroke="#26435f"/><rect x="${x0}" y="${y1 - 8}" width="${W}" height="5" fill="${FR}" stroke="#26435f"/>`;
      for (let i = 1; i < n; i++) s += `<rect x="${x0 + (W * i) / n - 1}" y="${y0 + 6}" width="2" height="${H - 14}" fill="#55627a"/>`;
      for (let i = 0; i < np; i++) s += `<rect x="${x0 + ((W - 5) * i) / (np - 1)}" y="${y0 + 3}" width="5" height="${H - 3}" fill="#26435f"/>`;
      break;
    }
    case 'curtain': {
      const nc = Math.max(1, Math.ceil(w / 100)); const nr = Math.max(1, Math.ceil(h / 125));
      s = `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="${FR}" stroke="#26435f" stroke-width="1.5"/>`;
      for (let c = 0; c < nc; c++) for (let r = 0; r < nr; r++) s += `<rect x="${x0 + (W * c) / nc + 2}" y="${y0 + (H * r) / nr + 2}" width="${W / nc - 4}" height="${H / nr - 4}" ${glass}/>` + F(x0 + (W * c) / nc, y0 + (H * r) / nr, W / nc, H / nr);
      break;
    }
    case 'mirror':
      s = `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#7d8a9a" stroke="#26435f" stroke-width="1.5"/><rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="#e8f0f6" stroke="#26435f"/><path d="M${ix + 8} ${iy + ih - 6} L${ix + 38} ${iy + 8}" stroke="#fff" stroke-width="5" opacity=".9"/><path d="M${ix + 24} ${iy + ih - 6} L${ix + 44} ${iy + 24}" stroke="#fff" stroke-width="3" opacity=".8"/>`;
      break;
    case 'folding': {
      const n = 4; const pw = iw / n;
      for (let i = 0; i < n; i++) s += `<rect x="${ix + i * pw}" y="${iy}" width="${pw}" height="${ih}" fill="${FR2}" stroke="#26435f"/>` + pane(ix + i * pw + pw * .15, iy + ih * .08, pw * .7, ih * .6);
      s += [1, 2, 3].map((i) => `<line x1="${ix + i * pw}" y1="${iy}" x2="${ix + i * pw}" y2="${iy + ih}" stroke="#26435f" stroke-width="2"/>`).join('') + arrow(ix + 8, y0 + H * .55, 1);
      break;
    }
    case 'custom': {
      // a free design: the frame is divided by vertical / horizontal dividers; every pane has its own opening type
      const MT = 4; const lay = layout || { t: 'F' };
      const leaf = (n, x, y, w, h) => {
        let o = pane(x, y, w, h); const t = n.t || 'F'; const ow = swing === 'in' ? 'in' : 'out';
        if (t === 'F') o += F(x, y, w, h);
        else if (t === 'HL' || t === 'DL') o += tri(x + 3, y + 3, w - 6, h - 6, 'L') + handle(x + w - 7, y + h / 2);
        else if (t === 'HR' || t === 'DR') o += tri(x + 3, y + 3, w - 6, h - 6, 'R') + handle(x + 7, y + h / 2);
        else if (t === 'BT') o += tri(x + 3, y + 3, w - 6, h - 6, 'B') + handle(x + w / 2, y + 8);
        else if (t === 'TT') o += tri(x + 3, y + 3, w - 6, h - 6, 'T') + handle(x + w / 2, y + h - 8);
        else if (t === 'SL') o += arrow(x + w - 8, y + h / 2, -1) ;
        else if (t === 'SR') o += arrow(x + 8, y + h / 2, 1);
        void ow; return o;
      };
      const walk = (n, x, y, w, h) => {
        if (!n || !n.d) return leaf(n || {}, x, y, w, h);
        const f = Math.min(.95, Math.max(.05, Number(n.f) || .5));
        if (n.d === 'v') { const w1 = (w - MT) * f; return walk(n.a, x, y, w1, h) + `<rect x="${x + w1}" y="${y}" width="${MT}" height="${h}" fill="${FR}" stroke="#26435f" stroke-width=".8"/>` + walk(n.b, x + w1 + MT, y, w - w1 - MT, h); }
        const h1 = (h - MT) * f; return walk(n.a, x, y, w, h1) + `<rect x="${x}" y="${y + h1}" width="${w}" height="${MT}" fill="${FR}" stroke="#26435f" stroke-width=".8"/>` + walk(n.b, x, y + h1 + MT, w, h - h1 - MT);
      };
      s += walk(lay, ix, iy, iw, ih);
      break;
    }
    default: s += pane(ix, iy, iw, ih);
  }
  if (dims) {
    const tx = '#55627a';
    s += `<line x1="${x0}" y1="${y1 + 10}" x2="${x1}" y2="${y1 + 10}" stroke="${tx}" stroke-width=".8"/><text x="${x0 + W / 2}" y="${y1 + 21}" font-size="10" text-anchor="middle" fill="${tx}">${+w.toFixed(1)}</text>`;
    s += `<line x1="${x0 - 10}" y1="${y0}" x2="${x0 - 10}" y2="${y1}" stroke="${tx}" stroke-width=".8"/><text transform="translate(${x0 - 14} ${y0 + H / 2}) rotate(-90)" font-size="10" text-anchor="middle" fill="${tx}">${+h.toFixed(1)}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" role="img" aria-label="${KINDS[kind] || 'Model'} drawing">${s}</svg>`;
}
