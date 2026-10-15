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
  if (item.type === 'length' && w > 0) return Math.round(((w / 100) * rate) * 1000) / 1000; // railings etc.: rate per metre of width
  return rate;
}

export const r3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** A line carries VAT unless it was switched off (vat: false / 0). Older quotations have no flag, so every line counts. */
export const hasVat = (i) => i.vat !== false && i.vat !== 0 && i.vat !== '0';
export function quoteTotals(q) {
  const items = q.items || [];
  const lineAmt = (i) => (Number(i.qty) || 0) * (Number(i.price) || 0);
  const subtotal = items.reduce((s, i) => s + lineAmt(i), 0);
  const vatBase = items.filter(hasVat).reduce((s, i) => s + lineAmt(i), 0); // only these lines are charged VAT
  const exempt = subtotal - vatBase;
  const discount = Number(q.discount) || 0;
  const waived = Number(q.vat_waived) || 0;
  const discPct = subtotal ? (discount / subtotal) * 100 : 0;
  if (q.disc_mode === 'after') { // VAT on the full items total, then the discount comes off the VAT-inclusive total
    const vat = (vatBase * (Number(q.vat_rate) || 0)) / 100; const total = subtotal + vat;
    return { subtotal, discount, amount: subtotal, vat, vatBase, exempt, waived, total, grand: total - discount - waived, discPct, after: true };
  }
  const amount = subtotal - discount;
  const base = subtotal ? vatBase - (discount * vatBase) / subtotal : 0; // the discount is shared out over the lines, so the VAT-free ones take their share too
  const vat = (base * (Number(q.vat_rate) || 0)) / 100;
  return { subtotal, discount, amount, vat, vatBase: base, exempt, waived, total: amount + vat, grand: amount + vat - waived, discPct, after: false };
}

/** Discount as a percentage of the items total. */
export const discountPct = (q) => { const t = quoteTotals(q); return t.subtotal > 0 ? (t.discount / t.subtotal) * 100 : 0; };
/**
 * Approval state a saved quotation should have. A discount above the limit needs an admin; once approved,
 * the same or a smaller discount stays approved. Returns { approval, approved_disc }.
 */
export function approvalFor(q, cur, limitPct, isAdmin) {
  const over = limitPct > 0 && discountPct(q) > limitPct + 1e-9;
  if (!over) return { approval: '', approved_disc: 0 };
  if (isAdmin) return { approval: 'approved', approved_disc: Number(q.discount) || 0 };
  if (cur && cur.approval === 'approved' && (Number(q.discount) || 0) <= (Number(cur.approved_disc) || 0) + 1e-9) return { approval: 'approved', approved_disc: cur.approved_disc };
  return { approval: 'pending', approved_disc: 0 };
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

// ---------------------------------------------------------------------------- amount in words, Arabic
const A_ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const A_TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const A_HUND = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
function arBelow1000(n) {
  const parts = [];
  if (n >= 100) { parts.push(A_HUND[Math.floor(n / 100)]); n %= 100; }
  if (n >= 20) { const o = n % 10; const t = A_TENS[Math.floor(n / 10)]; parts.push(o ? `${A_ONES[o]} و${t}` : t); } else if (n > 0) parts.push(A_ONES[n]);
  return parts.join(' و');
}
/** A whole number in Arabic words (masculine), up to billions. */
export function arabicWords(n) {
  if (n === 0) return 'صفر';
  const scales = [[1e9, 'مليار', 'ملياران', 'مليارات'], [1e6, 'مليون', 'مليونان', 'ملايين'], [1e3, 'ألف', 'ألفان', 'آلاف']];
  const parts = [];
  for (const [v, one, two, many] of scales) {
    if (n >= v) {
      const c = Math.floor(n / v); n %= v;
      parts.push(c === 1 ? one : c === 2 ? two : c <= 10 ? `${arBelow1000(c)} ${many}` : `${arBelow1000(c)} ${one}`);
    }
  }
  if (n) parts.push(arBelow1000(n));
  return parts.join(' و');
}
/** A counted noun in the right Arabic form: دينار واحد، ديناران، ثلاثة دنانير، أحد عشر ديناراً، مائة دينار. */
function arCount(n, f) {
  const r = n % 100;
  if (n === 1) return f.one; if (n === 2) return f.two;
  if (r === 1) return `${arabicWords(n - 1)} و${f.one}`;
  if (r === 2) return `${arabicWords(n - 2)} و${f.two}`;
  return `${arabicWords(n)} ${r >= 3 && r <= 10 ? f.few : r === 0 ? f.gen : f.acc}`;
}
const BHD = { one: 'دينار بحريني واحد', two: 'ديناران بحرينيان', few: 'دنانير بحرينية', acc: 'ديناراً بحرينياً', gen: 'دينار بحريني' };
const FILS = { one: 'فلس واحد', two: 'فلسان', few: 'فلوس', acc: 'فلساً', gen: 'فلس' };
/** 345.5 -> "فقط ثلاثمائة وخمسة وأربعون ديناراً بحرينياً وخمسمائة فلس لا غير" */
export function amountInWordsAr(amount) {
  const a = Math.round((Number(amount) || 0) * 1000) / 1000;
  if (a <= 0) return '';
  const whole = Math.floor(a); const fils = Math.round((a - whole) * 1000);
  return `فقط ${[whole && arCount(whole, BHD), fils && arCount(fils, FILS)].filter(Boolean).join(' و')} لا غير`;
}
