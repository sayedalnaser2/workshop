// A tiny PDF writer for pages made of JPEG pictures and short lines of text (used to export the kitchen 3D views). No libraries.
// pages: [{ w, h, items: [{ image: Uint8Array (JPEG), iw, ih, x, y, width, height } | { text, x, y, size }] }] — sizes in points, y measured from the bottom.

const enc = new TextEncoder();
const ascii = (s) => String(s ?? '').normalize('NFKD').replace(/[^\x20-\x7e]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const num = (n) => (Math.round(n * 100) / 100).toString();

export function buildPdf(pages, { title = 'Kitchen' } = {}) {
  const chunks = []; let len = 0; const offsets = [];
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); len += b.length; };
  // object numbers: 1 catalog, 2 page tree, 3 font, 4 info, then for every page: page, content, its pictures
  let next = 5; const ids = pages.map((p) => { const page = next++; const content = next++; const imgs = p.items.filter((i) => i.image).map(() => next++); return { page, content, imgs }; });
  const begin = (n) => { offsets[n] = len; push(`${n} 0 obj\n`); };
  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  begin(1); push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  begin(2); push(`<< /Type /Pages /Count ${pages.length} /Kids [${ids.map((i) => `${i.page} 0 R`).join(' ')}] >>\nendobj\n`);
  begin(3); push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n');
  begin(4); push(`<< /Title (${ascii(title)}) /Producer (Workshop Manager) >>\nendobj\n`);
  pages.forEach((p, pi) => {
    const id = ids[pi]; let k = 0; let content = '';
    for (const it of p.items) {
      if (it.image) { k++; content += `q ${num(it.width)} 0 0 ${num(it.height)} ${num(it.x)} ${num(it.y)} cm /Im${k} Do Q\n`; }
      else content += `BT /F1 ${num(it.size || 11)} Tf ${num(it.x)} ${num(it.y)} Td (${ascii(it.text)}) Tj ET\n`;
    }
    begin(id.page); push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(p.w)} ${num(p.h)}] /Resources << /Font << /F1 3 0 R >> /XObject << ${id.imgs.map((n, i) => `/Im${i + 1} ${n} 0 R`).join(' ')} >> >> /Contents ${id.content} 0 R >>\nendobj\n`);
    begin(id.content); push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);
    p.items.filter((i) => i.image).forEach((it, i) => { begin(id.imgs[i]); push(`<< /Type /XObject /Subtype /Image /Width ${it.iw} /Height ${it.ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${it.image.length} >>\nstream\n`); push(it.image); push('\nendstream\nendobj\n'); });
  });
  const xref = len; const total = next;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let n = 1; n < total; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len); let at = 0; for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** The bytes of a canvas.toDataURL('image/jpeg') string. */
export function dataUrlBytes(url) { const b = atob(String(url).split(',')[1] || ''); const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; }

/**
 * Lay pictures out on A4 pages: one per landscape page, or two per portrait page. pics: [{ image, iw, ih, caption }].
 * header: the line printed at the top of every page.
 */
export function layoutPictures(pics, { header = '', perPage = 1 } = {}) {
  const pages = []; const land = perPage === 1; const W = land ? 842 : 595; const H = land ? 595 : 842; const M = 36;
  for (let i = 0; i < pics.length; i += perPage) {
    const items = [{ text: header, x: M, y: H - 26, size: 12 }]; const slice = pics.slice(i, i + perPage); const top = H - 40; const slotH = (top - M) / perPage;
    slice.forEach((p, k) => {
      const cap = 16; const availW = W - 2 * M; const availH = slotH - cap - 6; const s = Math.min(availW / p.iw, availH / p.ih); const w = p.iw * s; const h = p.ih * s; const y0 = top - k * slotH - cap - 4 - h;
      items.push({ text: p.caption, x: M, y: top - k * slotH - 12, size: 11 }, { image: p.image, iw: p.iw, ih: p.ih, x: M + (availW - w) / 2, y: y0, width: w, height: h });
    });
    items.push({ text: `${Math.floor(i / perPage) + 1} / ${Math.ceil(pics.length / perPage)}`, x: W - M - 30, y: 16, size: 9 });
    pages.push({ w: W, h: H, items });
  }
  return pages;
}
