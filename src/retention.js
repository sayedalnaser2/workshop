// Workshop photos are deleted after a set time (the admin chooses how long in Settings). Documents (PDF etc.) are kept.
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { db } from './db.js';

const cutoff = (months) => { const d = new Date(); d.setMonth(d.getMonth() - months); return d.toISOString().slice(0, 19).replace('T', ' '); };
export const photoStats = (months) => ({ total: db.prepare("SELECT COUNT(*) n FROM attachments WHERE mime LIKE 'image/%'").get().n, old: months > 0 ? db.prepare("SELECT COUNT(*) n FROM attachments WHERE mime LIKE 'image/%' AND created_at < ?").get(cutoff(months)).n : 0, months });
/** Delete photos older than `months` months (files and rows). Returns how many. */
export async function purgeOldPhotos(months, dir) {
  if (!(months > 0)) return 0;
  const rows = db.prepare("SELECT id, file_path FROM attachments WHERE mime LIKE 'image/%' AND created_at < ?").all(cutoff(months));
  for (const r of rows) { await unlink(path.join(dir, path.basename(r.file_path || ''))).catch(() => {}); db.prepare('DELETE FROM attachments WHERE id=?').run(r.id); }
  return rows.length;
}
