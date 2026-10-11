// Pure calculation helpers shared by the browser and the Excel importer.

/** Price rule taken from the workbook: windows are priced per m² (sizes in cm) and rounded to the nearest 5;
 *  doors/other items — and descriptions that contain "WC" — use the fixed list price. */
export function guessPriceType(name = '') {
  const n = name.toUpperCase();
  if (n.includes('WINDOW') && !n.includes('WC')) return 'area';
  return 'fixed';
}
export function priceFor(item, w, h) {
  if (!item) return 0;
  const rate = Number(item.rate) || 0;
  if (item.type === 'area' && w > 0 && h > 0) return Math.round((w * h * (rate / 10000)) / 5) * 5;
  return rate;
}

export const r3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function quoteTotals(q) {
  const items = q.items || [];
  const subtotal = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
  const discount = Number(q.discount) || 0;
  const amount = subtotal - discount;
  const vat = (amount * (Number(q.vat_rate) || 0)) / 100;
  const waived = Number(q.vat_waived) || 0;
  const grand = amount + vat - waived;
  return { subtotal, discount, amount, vat, waived, grand, discPct: subtotal ? (discount / subtotal) * 100 : 0 };
}

// ---------------------------------------------------------------------------- amount in words
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function below1000(n) {
  const out = [];
  if (n >= 100) { out.push(ONES[Math.floor(n / 100)], 'Hundred'); n %= 100; if (n) out.push('and'); }
  if (n >= 20) { out.push(TENS[Math.floor(n / 10)]); n %= 10; }
  if (n) out.push(ONES[n]);
  return out.join(' ');
}
export function intWords(n) {
  if (n === 0) return 'Zero';
  const parts = [];
  for (const [v, name] of [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']]) {
    if (n >= v) { parts.push(below1000(Math.floor(n / v)) + ' ' + name); n %= v; }
  }
  if (n) parts.push(below1000(n));
  return parts.join(' ');
}
/** 345.5 -> "Bahraini Dinars Three Hundred and Forty Five and 500 Fils Only" */
export function amountInWords(amount) {
  const a = Math.round((Number(amount) || 0) * 1000) / 1000;
  if (a <= 0) return '';
  const whole = Math.floor(a);
  const fils = Math.round((a - whole) * 1000);
  let s = 'Bahraini Dinars ' + intWords(whole);
  if (fils) s += ` and ${fils} Fils`;
  return s + ' Only';
}

// ---------------------------------------------------------------------------- formula evaluation (no eval)
const FUNCS = { min: Math.min, max: Math.max, round: Math.round, floor: Math.floor, ceil: Math.ceil, abs: Math.abs, sqrt: Math.sqrt };
export function evalExpr(src, vars = {}) {
  const s = String(src ?? '').trim();
  if (s === '') return 0;
  const tokens = s.match(/\d*\.\d+|\d+|[A-Za-z_][A-Za-z_0-9]*|[-+*/(),]/g);
  if (!tokens || tokens.join('').length !== s.replace(/\s+/g, '').length) throw new Error(`Bad formula: ${s}`);
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  function primary() {
    const t = next();
    if (t === undefined) throw new Error(`Bad formula: ${s}`);
    if (t === '(') { const v = expr(); if (next() !== ')') throw new Error(`Missing ) in ${s}`); return v; }
    if (t === '-') return -primary();
    if (t === '+') return primary();
    if (/^[\d.]/.test(t)) return parseFloat(t);
    if (peek() === '(') {
      next(); const args = [];
      if (peek() !== ')') { do { args.push(expr()); } while (peek() === ',' && next()); }
      if (next() !== ')') throw new Error(`Missing ) in ${s}`);
      const f = FUNCS[t.toLowerCase()]; if (!f) throw new Error(`Unknown function ${t}`);
      return f(...args);
    }
    if (!(t in vars)) throw new Error(`Unknown variable ${t}`);
    return Number(vars[t]);
  }
  function term() { let v = primary(); while (peek() === '*' || peek() === '/') { const op = next(); const r = primary(); v = op === '*' ? v * r : v / r; } return v; }
  function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const op = next(); const r = term(); v = op === '+' ? v + r : v - r; } return v; }
  const v = expr();
  if (i !== tokens.length) throw new Error(`Bad formula: ${s}`);
  return v;
}

/** Evaluate a model for a given size (cm). Returns profile pieces, glass panes and accessories. */
export function computeModel(model, w, h, lib = {}) {
  const spec = model.spec || {};
  const vars = { W: Number(w) || 0, H: Number(h) || 0 };
  for (const [k, v] of Object.entries(spec.params || {})) if (!(k in vars)) vars[k] = Number(v) || 0;
  for (const d of spec.vars || []) vars[d.name] = evalExpr(d.expr, vars);
  const safe = (fn) => { try { return fn(); } catch (e) { return NaN; } };
  const profiles = (spec.profiles || []).map((p) => {
    const prof = (lib.profiles || []).find((x) => x.id === Number(p.profile_id));
    return { label: p.label, profile: prof || null, profile_id: p.profile_id, length: safe(() => evalExpr(p.len, vars)), qty: safe(() => evalExpr(p.qty ?? '1', vars)) };
  });
  const glass = (spec.glass || []).map((g) => ({ label: g.label, w: safe(() => evalExpr(g.w, vars)), h: safe(() => evalExpr(g.h, vars)), qty: safe(() => evalExpr(g.qty ?? '1', vars)) }));
  const accessories = (spec.accessories || []).map((a) => {
    const acc = (lib.accessories || []).find((x) => x.id === Number(a.accessory_id));
    return { label: a.label, accessory: acc || null, accessory_id: a.accessory_id, qty: safe(() => evalExpr(a.qty ?? '1', vars)) };
  });
  return { vars, profiles, glass, accessories };
}

/** Material cost estimate for one unit of a model at W×H (cm). */
export function modelCost(model, w, h, lib = {}, glassType = null) {
  const m = computeModel(model, w, h, lib);
  let prof = 0, glassCost = 0, acc = 0;
  for (const p of m.profiles) if (p.profile && p.profile.bar_length > 0) prof += ((p.length * p.qty) / p.profile.bar_length) * (p.profile.price_bar || 0);
  if (glassType) for (const g of m.glass) glassCost += ((g.w * g.h * g.qty) / 10000) * (glassType.price_m2 || 0);
  for (const a of m.accessories) if (a.accessory) acc += a.qty * (a.accessory.price || 0);
  return { profiles: prof, glass: glassCost, accessories: acc, total: prof + glassCost + acc };
}

/** First-fit-decreasing bar nesting. pieces: [{length, tag}], returns bars [{pieces, used}] */
export function nestBars(pieces, barLength, kerf = 0) {
  const sorted = [...pieces].sort((a, b) => b.length - a.length);
  const bars = [];
  const unfit = [];
  for (const p of sorted) {
    if (!(p.length > 0)) continue;
    if (p.length > barLength) { unfit.push(p); continue; }
    let bar = bars.find((b) => b.used + p.length + (b.pieces.length ? kerf : 0) <= barLength + 1e-9);
    if (!bar) { bar = { pieces: [], used: 0 }; bars.push(bar); }
    bar.used += p.length + (bar.pieces.length ? kerf : 0);
    bar.pieces.push(p);
  }
  return { bars, unfit };
}
