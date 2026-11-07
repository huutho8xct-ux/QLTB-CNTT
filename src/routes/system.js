import { Router } from 'express';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { all, get, run, getSettings, BACKUP_DIR } from '../db.js';
import { requirePerm } from '../auth.js';
import { HttpError, audit, pageParams, likeParam } from '../util.js';
import { createBackup, listBackups, restoreFrom, pruneBackups } from '../backup.js';

export const router = Router();

const PUBLIC_SETTINGS = ['org_parent', 'org_name', 'org_address', 'org_phone', 'org_email', 'org_tax_code', 'org_city',
  'director_name', 'director_title', 'accountant_name', 'asset_manager_name', 'depreciation_method', 'fixed_asset_threshold',
  'warranty_alert_days', 'license_alert_days', 'maintenance_alert_days', 'auto_backup', 'backup_keep', 'session_hours'];

router.get('/settings', (_req, res) => {
  const s = getSettings();
  res.json(Object.fromEntries(PUBLIC_SETTINGS.map((k) => [k, s[k] ?? ''])));
});

router.put('/settings', requirePerm('settings.write'), (req, res) => {
  const b = req.body || {};
  for (const k of PUBLIC_SETTINGS) {
    if (b[k] === undefined) continue;
    run('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, String(b[k] ?? ''));
  }
  audit(req, 'Cập nhật cấu hình hệ thống', 'settings');
  res.json({ ok: true });
});

router.get('/audit-logs', requirePerm('audit.view'), (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const where = ['1=1'];
  const p = [];
  if (req.query.q) {
    const l = likeParam(req.query.q);
    where.push(`(username LIKE ? ESCAPE '\\' OR action LIKE ? ESCAPE '\\' OR detail LIKE ? ESCAPE '\\')`);
    p.push(l, l, l);
  }
  if (req.query.user_id) { where.push('user_id = ?'); p.push(req.query.user_id); }
  if (req.query.from) { where.push('created_at >= ?'); p.push(req.query.from); }
  if (req.query.to) { where.push('created_at <= ?'); p.push(req.query.to + ' 23:59:59'); }
  const w = where.join(' AND ');
  res.json({
    total: get(`SELECT COUNT(*) AS n FROM audit_logs WHERE ${w}`, ...p).n,
    rows: all(`SELECT * FROM audit_logs WHERE ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, ...p, pageSize, offset),
    page, pageSize,
  });
});

router.get('/system-info', requirePerm('backup'), (_req, res) => {
  const counts = {};
  for (const t of ['devices', 'users', 'allocations', 'repairs', 'maintenances', 'inventories', 'disposals', 'licenses', 'audit_logs', 'device_history']) {
    counts[t] = get(`SELECT COUNT(*) AS n FROM ${t}`).n;
  }
  const dbFile = path.resolve(process.env.DATA_DIR || 'data', 'qltb.db');
  res.json({
    node: process.version, platform: `${os.type()} ${os.release()}`, hostname: os.hostname(), uptime: Math.round(process.uptime()),
    db_size: fs.existsSync(dbFile) ? fs.statSync(dbFile).size : 0, data_dir: path.dirname(dbFile), counts,
  });
});

router.get('/backups', requirePerm('backup'), (_req, res) => res.json(listBackups()));

router.post('/backups', requirePerm('backup'), (req, res) => {
  const f = createBackup('manual');
  pruneBackups();
  audit(req, 'Sao lưu dữ liệu', 'system', null, path.basename(f));
  res.json({ name: path.basename(f) });
});

function safeName(name) {
  const n = path.basename(String(name || ''));
  if (!/^qltb_[\w-]+\.db$/.test(n)) throw new HttpError(400, 'Tên tệp không hợp lệ');
  const f = path.join(BACKUP_DIR, n);
  if (!fs.existsSync(f)) throw new HttpError(404, 'Không tìm thấy tệp sao lưu');
  return f;
}

router.get('/backups/:name/download', requirePerm('backup'), (req, res) => {
  const f = safeName(req.params.name);
  audit(req, 'Tải tệp sao lưu', 'system', null, req.params.name);
  res.download(f);
});

router.delete('/backups/:name', requirePerm('backup'), (req, res) => {
  fs.rmSync(safeName(req.params.name));
  audit(req, 'Xóa tệp sao lưu', 'system', null, req.params.name);
  res.json({ ok: true });
});

router.post('/backups/:name/restore', requirePerm('backup'), (req, res) => {
  const f = safeName(req.params.name);
  const safety = restoreFrom(f);
  audit(req, 'Phục hồi dữ liệu', 'system', null, `Từ ${req.params.name}; bản an toàn: ${path.basename(safety)}`);
  res.json({ ok: true });
});

router.post('/restore-upload', requirePerm('backup'), express.raw({ type: '*/*', limit: '500mb' }), (req, res) => {
  if (!req.body?.length) throw new HttpError(400, 'Không có tệp');
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const tmp = path.join(BACKUP_DIR, `qltb_upload_${Date.now()}.db`);
  fs.writeFileSync(tmp, req.body);
  try {
    const safety = restoreFrom(tmp);
    audit(req, 'Phục hồi dữ liệu từ tệp tải lên', 'system', null, `Bản an toàn: ${path.basename(safety)}`);
    res.json({ ok: true });
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw new HttpError(400, e.message);
  }
});
