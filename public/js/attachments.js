// Photos and files on an order, task or site survey: pick or take a photo, it is shrunk on the phone, uploaded, and shown as a gallery.
import { api, $, $$, esc, toast, guard, confirmBox } from './ui.js';
import { S } from './app.js';

/** Shrink a camera photo to at most `max` px on its long side (JPEG). Other files are sent untouched. */
export async function prepare(file, max = 1600, quality = 0.82) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file); const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}
export async function upload(type, key, file, { kind = 'file', tag = '', note = '' } = {}) {
  const f = await prepare(file);
  const q = new URLSearchParams({ ref_type: type, ref_key: key, kind, tag, note, name: f.name || 'photo.jpg' });
  const r = await fetch('/api/files?' + q, { method: 'POST', headers: { 'Content-Type': f.type || 'application/octet-stream' }, body: f });
  const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || 'Upload failed');
  return data;
}
export const fileUrl = (id) => `/api/files/${id}`;
const isImg = (a) => /^image\//.test(a.mime || '');

/**
 * Draw a photo/file panel into `el`. opts: { type, key, kinds:[['before','Before'],['after','After'],['file','File']], title, tag, compact }
 */
export async function attachmentsPanel(el, { type, key, kinds = [['before', 'Before'], ['after', 'After'], ['file', 'Other']], title = 'Photos & files', tag = '', canDelete = true, onChange } = {}) {
  const draw = async () => {
    let list = [];
    try { list = await api.get(`files?ref_type=${type}&ref_key=${encodeURIComponent(key)}`); } catch (e) { el.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    if (tag !== '*') list = list.filter((a) => (a.tag || '') === tag);
    const mine = (a) => S.me?.role !== 'worker' || a.user_name === S.me?.name;
    el.innerHTML = `<div class="att"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h3 style="margin:0">${esc(title)}</h3><span class="muted">${list.length} file(s)</span><span class="grow"></span>${kinds.map(([k, l]) => `<label class="btn sm${k === kinds[0][0] ? ' primary' : ''}" style="cursor:pointer">📷 ${esc(l)}<input type="file" hidden data-kind="${k}" accept="${k === 'file' ? 'image/*,application/pdf' : 'image/*'}" ${k === 'file' ? '' : 'capture="environment"'} multiple></label>`).join('')}</div>
      <div class="gallery">${list.map((a) => `<figure data-id="${a.id}">${isImg(a) ? `<a href="${fileUrl(a.id)}" target="_blank" rel="noopener"><img loading="lazy" src="${fileUrl(a.id)}" alt="${esc(a.file_name)}"></a>` : `<a class="doc-tile" href="${fileUrl(a.id)}" target="_blank" rel="noopener">📄<br>${esc(a.file_name)}</a>`}<figcaption><span class="badge ${a.kind === 'before' ? 'warn' : a.kind === 'after' ? 'ok' : ''}">${esc((kinds.find((k) => k[0] === a.kind) || [0, a.kind])[1])}</span> <span class="muted">${esc(a.user_name || '')} · ${esc((a.created_at || '').slice(0, 10))}</span>${canDelete && mine(a) ? ' <button class="btn sm danger" data-del title="Delete">×</button>' : ''}</figcaption></figure>`).join('') || '<p class="muted" style="margin:10px 0 0">No photos yet. On a phone the buttons open the camera.</p>'}</div></div>`;
    $$('input[type=file]', el).forEach((inp) => inp.addEventListener('change', guard(async () => {
      const files = [...inp.files]; if (!files.length) return; inp.value = '';
      toast(`Uploading ${files.length} file(s)…`);
      for (const f of files) await upload(type, key, f, { kind: inp.dataset.kind, tag: tag === '*' ? '' : tag });
      toast('Uploaded'); await draw(); onChange?.();
    })));
    $$('[data-del]', el).forEach((b) => b.addEventListener('click', guard(async () => { if (!await confirmBox('Delete this file?')) return; await api.del(`files/${b.closest('figure').dataset.id}`); await draw(); onChange?.(); })));
  };
  await draw();
}
