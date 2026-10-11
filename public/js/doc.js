import { S } from './app.js';
import { esc } from './ui.js';

export function docHeader(title, sub = '') {
  const c = S.settings.company || {};
  return `<div class="dh"><img src="/img/logo.png" alt="${esc(c.name)}"><div class="co"><b>${esc(c.name)}</b><br>${esc(c.name_ar || '')}${c.cr ? `<br>CR ${esc(c.cr)}` : ''}${c.address ? `<br>${esc(c.address)}` : ''}<br>${esc(c.phones || '')}<br>${esc(c.email || '')}</div></div><h2>${esc(title)}</h2>${sub}`;
}
export function docFooter() {
  const c = S.settings.company || {};
  return `<div class="foot">${esc(c.email || '')}${c.email && c.phones ? ' &nbsp;|&nbsp; ' : ''}${esc(c.phones || '')}</div>`;
}
/** Wrap printable HTML in the toolbar + sheet. */
export function printView(el, { back, backLabel = '← Back', html, extraButtons = '' }) {
  el.innerHTML = `<div class="printbar"><a class="btn" href="${back}">${backLabel}</a><button class="btn primary" id="doPrint">Print / Save as PDF</button>${extraButtons}</div><div class="doc">${html}${docFooter()}</div>`;
  el.querySelector('#doPrint').onclick = () => window.print();
}
