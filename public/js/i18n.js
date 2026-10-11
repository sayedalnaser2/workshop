// Arabic interface: right-to-left layout and a translator for the screen text.
// The app's screens are written in English; this swaps every piece of text it knows for its Arabic version
// (and keeps doing so as pages are drawn). Printouts are always bilingual and are not touched here.
import { AR_WORDS, AR_PATTERNS } from './i18n-ar.js';

let lang = 'en';
try { lang = localStorage.getItem('lang') === 'ar' ? 'ar' : 'en'; } catch {}
export const isAr = () => lang === 'ar';
export const setLang = (l) => { try { localStorage.setItem('lang', l); } catch {} location.reload(); };

/** Arabic for one string, or null when there is no translation. */
export function tr(text) {
  const t = text.trim(); if (!t) return null;
  const hit = AR_WORDS[t]; if (hit) return hit;
  for (const [re, fn] of AR_PATTERNS) { const m = t.match(re); if (m) return typeof fn === 'function' ? fn(...m.slice(1)) : t.replace(re, fn); }
  return null;
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'SVG', 'svg', 'NOSCRIPT']);
const seen = new WeakMap(); // text node -> the Arabic we wrote, so our own edits are not translated twice
const skipped = (el) => !el || SKIP.has(el.tagName) || !!el.closest?.('[data-noi18n], .ar, .doc, svg');

function node(n) {
  if (n.nodeType === 3) {
    if (seen.get(n) === n.nodeValue || skipped(n.parentElement)) return;
    const a = tr(n.nodeValue); if (a) { const lead = n.nodeValue.match(/^\s*/)[0]; const trail = n.nodeValue.match(/\s*$/)[0]; n.nodeValue = lead + a + trail; seen.set(n, n.nodeValue); }
  } else if (n.nodeType === 1 && !skipped(n)) {
    for (const attr of ['placeholder', 'title', 'aria-label']) { const v = n.getAttribute?.(attr); if (v) { const a = tr(v); if (a) n.setAttribute(attr, a); } }
    if (n.tagName === 'INPUT' && n.type === 'button' && n.value) { const a = tr(n.value); if (a) n.value = a; }
    for (const c of n.childNodes) node(c);
  }
}

export function initI18n() {
  const root = document.documentElement;
  root.lang = lang; root.dir = lang === 'ar' ? 'rtl' : 'ltr';
  if (lang !== 'ar') return;
  let queued = false; const pending = new Set();
  const flush = () => { queued = false; for (const n of pending) if (n.isConnected) node(n); pending.clear(); };
  new MutationObserver((muts) => {
    for (const m of muts) { if (m.type === 'characterData') pending.add(m.target); else if (m.type === 'attributes') pending.add(m.target); else m.addedNodes.forEach((n) => pending.add(n)); }
    if (!queued) { queued = true; queueMicrotask(flush); }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title'] });
  node(document.body);
  document.title = tr(document.title.split(' · ')[0]) ? document.title : document.title;
}
