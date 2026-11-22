// Send a printed document (a quotation or an invoice) to the customer in a chat: the page is turned into a PDF, kept under a private link,
// and the customer's WhatsApp chat opens with the message and that link ready to send.
import { buildPdf, dataUrlBytes } from './pdf.js';
import { waLink } from './pages/calendar.js';
import { toast } from './ui.js';

const loadScript = (src) => new Promise((resolve, reject) => { if (window.html2canvas) return resolve(); const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load the PDF maker')); document.head.appendChild(s); });

/** The A4 pages (JPEG bytes) of an element: the page is drawn once, then cut into A4 slices. */
export async function pagesOf(docEl) {
  await loadScript('/vendor/html2canvas.min.js');
  const canvas = await window.html2canvas(docEl, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: Math.max(docEl.scrollWidth, 900) });
  const sliceH = Math.floor((canvas.width * 842) / 595); const pages = [];
  for (let y = 0; y < canvas.height; y += sliceH) {
    const h = Math.min(sliceH, canvas.height - y); const c = document.createElement('canvas'); c.width = canvas.width; c.height = h; const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, h); ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    pages.push({ image: dataUrlBytes(c.toDataURL('image/jpeg', 0.92)), iw: c.width, ih: h, hPt: (h * 595) / c.width });
  }
  return pages;
}

/** The PDF of the document on the screen. */
export async function pdfOf(docEl, title) {
  const pages = await pagesOf(docEl);
  return buildPdf(pages.map((p) => ({ w: 595, h: 842, items: [{ image: p.image, iw: p.iw, ih: p.ih, x: 0, y: 842 - p.hPt, width: 595, height: p.hPt }] })), { title });
}

/**
 * Make the PDF, give it a private link and open the customer's chat with the message ready.
 * what: { docEl, name ('Quotation 1234'), kind ('quotation' | 'invoice'), client, mobile, company }
 */
export async function sendToCustomer({ docEl, name, kind, client, mobile, company }) {
  const chat = window.open('', '_blank'); // opened now, while the click still counts, and pointed at the chat when the PDF is ready
  if (chat) chat.document.write('<p style="font:16px sans-serif;padding:24px">Preparing the PDF…</p>');
  try {
    const bytes = await pdfOf(docEl, name);
    const r = await fetch(`/api/share-doc?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: bytes });
    const j = await r.json().catch(() => ({})); if (!r.ok || !j.path) throw new Error(j.error || 'Could not save the PDF');
    const url = `${location.origin}${j.path}`;
    const text = `Dear ${client || 'customer'},\nPlease find your ${kind} (${name}) here:\n${url}${company ? `\n\n${company}` : ''}`;
    const link = waLink(mobile, text);
    if (chat) chat.location.href = link; else window.open(link, '_blank', 'noopener');
    if (!String(mobile || '').replace(/\D/g, '')) toast('This customer has no mobile number saved — choose the chat in WhatsApp');
    else toast('The chat is open: press send');
    return url;
  } catch (e) { if (chat) chat.close(); toast(e.message || 'Could not prepare the PDF', 'err'); return null; }
}
