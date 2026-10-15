import { S } from './app.js';
import { esc } from './ui.js';
import { amountInWords, amountInWordsAr } from './calc.js';

/** Printed labels in English with the Arabic beside them — every printout is bilingual whatever the screen language. */
export const AR = {
  quote: 'عرض سعر', quotation: 'عرض سعر', date: 'التاريخ', mobile: 'الجوال', site: 'الموقع', client: 'العميل', customer: 'العميل', size: 'المقاس', description: 'الوصف', qty: 'الكمية', unit: 'السعر', amount: 'المبلغ',
  total: 'المجموع', disc: 'الخصم', vat: 'ضريبة القيمة المضافة', vatAdj: 'تعديل الضريبة', grand: 'المبلغ الإجمالي', words: 'المبلغ كتابة', prepared: 'أعدّه', custSign: 'توقيع العميل', received: 'استلم', terms: 'الشروط والأحكام',
  receipt: 'سند قبض', receiptNo: 'رقم السند', order: 'الطلب', paidBy: 'طريقة الدفع', debit: 'مدين', credit: 'دائن', balance: 'الرصيد', previous: 'الدفعات السابقة', thisReceipt: 'هذا السند', note: 'ملاحظة', receivedSum: 'استلمنا مبلغ',
  voucher: 'سند صرف', paidTo: 'المدفوع له', category: 'البند', invoice: 'فاتورة', taxInvoice: 'فاتورة ضريبية', creditNote: 'إشعار دائن', vatNo: 'الرقم الضريبي', customerVat: 'الرقم الضريبي للعميل', net: 'الصافي', vatAmt: 'الضريبة',
  subtotal: 'المجموع الفرعي', paid: 'المدفوع', due: 'المتبقي', against: 'مقابل الفاتورة', reason: 'السبب', bank: 'بيانات البنك', statement: 'كشف حساب', item: 'البند', delivered: 'سلّم', kitchen: 'مطبخ', proposal: 'عرض تصميم',
  valid: 'العرض ساري لمدة 14 يوماً', price: 'السعر', design: 'التصميم', front: 'الواجهة الأمامية', plan: 'المسقط الأفقي', materials: 'المواد', cr: 'السجل التجاري', no: 'رقم',
};
/** "Total <ar>المجموع</ar>" */
export const bi = (en, ar = AR[en.toLowerCase()] || '') => `${esc(en)}${ar ? ` <span class="ar">${ar}</span>` : ''}`;
/** "Total · المجموع" for table headers and totals. */
export const L = (key, en) => bi(en, AR[key]);

export function docHeader(title, ar = '', sub = '') {
  const c = S.settings.company || {};
  return `<div class="dh"><img src="/logo?v=${S.settings.logo?.v || 0}" alt="${esc(c.name)}"><div class="co"><b>${esc(c.name)}</b><br>${esc(c.name_ar || '')}${c.cr ? `<br>CR ${esc(c.cr)} <span class="ar">${AR.cr}</span>` : ''}${c.vat_no ? `<br><b>VAT No. ${esc(c.vat_no)}</b> <span class="ar">${AR.vatNo}</span>` : ''}${c.address ? `<br>${esc(c.address)}` : ''}<br>${esc(c.phones || '')}<br>${esc(c.email || '')}</div></div><h2>${esc(title)}</h2>${ar ? `<div class="ar-title">${ar}</div>` : ''}${sub}`;
}
export function docFooter() {
  const c = S.settings.company || {};
  return `<div class="foot">${esc(c.email || '')}${c.email && c.phones ? ' &nbsp;|&nbsp; ' : ''}${esc(c.phones || '')}</div>`;
}
/** Amount in words, English then Arabic. */
export const wordsBlock = (n) => (n > 0 ? `<p><b>${L('words', 'Amount in words')}:</b> ${esc(amountInWords(n))}</p><p class="ar-line">${amountInWordsAr(n)}</p>` : '');
/** Optional Arabic terms from Settings, printed under the English ones. */
export const termsBlock = (lines = S.settings.terms, ar = S.settings.terms_ar) => `<div class="terms">${(lines || []).map((t) => `<div>${esc(t)}</div>`).join('')}${(ar || []).length ? `<div class="ar-terms">${ar.map((t) => `<div>${esc(t)}</div>`).join('')}</div>` : ''}</div>`;
/** Wrap printable HTML in the toolbar + sheet. */
export function printView(el, { back, backLabel = '← Back', html, extraButtons = '', cls = '' }) {
  el.innerHTML = `<div class="printbar"><a class="btn" href="${back}">${backLabel}</a><button class="btn primary" id="doPrint">Print / Save as PDF</button>${extraButtons}</div><div class="doc ${cls}" data-noi18n>${html}${docFooter()}</div>`;
  el.querySelector('#doPrint').onclick = () => window.print();
}
