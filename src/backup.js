import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getDb, BACKUP_DIR, DB_PATH, getSetting, openDb, closeDb } from './db.js';

const pad = (n) => String(n).padStart(2, '0');
const stamp = () => {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

/** Tạo bản sao lưu nhất quán bằng VACUUM INTO */
export function createBackup(kind = 'manual') {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `qltb_${kind}_${stamp()}.db`);
  getDb().exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  return file;
}

export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { name: f, size: st.size, created_at: st.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function pruneBackups() {
  const keep = Number(getSetting('backup_keep')) || 30;
  const autos = listBackups().filter((b) => b.name.includes('_auto_'));
  for (const b of autos.slice(keep)) fs.rmSync(path.join(BACKUP_DIR, b.name), { force: true });
}

/** Kiểm tra tệp sao lưu hợp lệ */
export function validateBackupFile(file) {
  let d;
  try {
    d = new DatabaseSync(file, { readOnly: true });
    const ok = d.prepare('PRAGMA integrity_check').get();
    const t = d.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('devices','users','settings')").get();
    if (Object.values(ok)[0] !== 'ok' || t.n !== 3) return false;
    return true;
  } catch {
    return false;
  } finally {
    try { d?.close(); } catch { /* ignore */ }
  }
}

/** Phục hồi dữ liệu từ tệp (tự sao lưu dữ liệu hiện tại trước khi ghi đè) */
export function restoreFrom(file) {
  if (!validateBackupFile(file)) throw new Error('Tệp sao lưu không hợp lệ hoặc bị hỏng');
  const safety = createBackup('before_restore');
  closeDb();
  for (const ext of ['-wal', '-shm']) fs.rmSync(DB_PATH + ext, { force: true });
  fs.copyFileSync(file, DB_PATH);
  openDb();
  return safety;
}

export function startAutoBackup() {
  const check = () => {
    try {
      if (getSetting('auto_backup') !== '1') return;
      const todayTag = stamp().slice(0, 8);
      if (listBackups().some((b) => b.name.startsWith(`qltb_auto_${todayTag}`))) return;
      createBackup('auto');
      pruneBackups();
      console.log(`[Sao lưu tự động] Đã sao lưu dữ liệu ngày ${todayTag}`);
    } catch (e) {
      console.error('[Sao lưu tự động] Lỗi:', e.message);
    }
  };
  setTimeout(check, 10_000);
  return setInterval(check, 60 * 60 * 1000);
}
