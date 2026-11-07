import { Router } from 'express';
import { all, get, run, tx, getSettings } from '../db.js';
import { requirePerm } from '../auth.js';
import { HttpError, pick, insert, update, audit, addHistory, addMonths, addDays, pageParams, likeParam, today } from '../util.js';
import { scopeWhere } from './devices.js';

export const router = Router();

const SELECT = `
  SELECT m.*, v.asset_code, v.name AS device_name, v.location AS device_location, d.name AS department_name,
         u.full_name AS assignee_name
    FROM maintenances m
    LEFT JOIN devices v ON v.id = m.device_id
    LEFT JOIN departments d ON d.id = v.department_id
    LEFT JOIN users u ON u.id = m.assignee_id`;

router.get('/', (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const where = ['1=1'];
  const p = [];
  const t = today();
  const q = req.query;
  if (q.status === 'overdue') { where.push("m.status = 'planned' AND m.scheduled_date < ?"); p.push(t); }
  else if (q.status === 'upcoming') {
    where.push("m.status = 'planned' AND m.scheduled_date BETWEEN ? AND ?");
    p.push(t, addDays(t, Number(getSettings().maintenance_alert_days) || 7));
  } else if (q.status) { where.push('m.status = ?'); p.push(q.status); }
  if (q.device_id) { where.push('m.device_id = ?'); p.push(q.device_id); }
  if (q.department_id) { where.push('v.department_id = ?'); p.push(q.department_id); }
  if (q.from) { where.push('m.scheduled_date >= ?'); p.push(q.from); }
  if (q.to) { where.push('m.scheduled_date <= ?'); p.push(q.to); }
  if (q.q) {
    const l = likeParam(q.q);
    where.push(`(m.title LIKE ? ESCAPE '\\' OR v.asset_code LIKE ? ESCAPE '\\' OR v.name LIKE ? ESCAPE '\\')`);
    p.push(l, l, l);
  }
  const s = scopeWhere(req.user);
  const w = where.join(' AND ') + s.sql;
  p.push(...s.params);
  const total = get(`SELECT COUNT(*) AS n FROM maintenances m LEFT JOIN devices v ON v.id = m.device_id WHERE ${w}`, ...p).n;
  const rows = all(`${SELECT} WHERE ${w} ORDER BY CASE m.status WHEN 'planned' THEN 0 ELSE 1 END, m.scheduled_date ${q.status === 'done' ? 'DESC' : 'ASC'}, m.id DESC LIMIT ? OFFSET ?`, ...p, pageSize, offset);
  res.json({ rows, total, page, pageSize });
});

const FIELDS = ['title', 'device_id', 'scheduled_date', 'interval_months', 'assignee_id', 'note'];

router.post('/', requirePerm('maintenance.write'), (req, res) => {
  const b = req.body || {};
  const base = pick(b, FIELDS);
  if (!base.title) throw new HttpError(400, 'Vui lòng nhập nội dung bảo trì');
  if (!base.scheduled_date) throw new HttpError(400, 'Vui lòng chọn ngày dự kiến');
  // Có thể lập kế hoạch cho nhiều thiết bị một lúc (theo danh sách hoặc theo loại/phòng ban)
  let deviceIds = Array.isArray(b.device_ids) ? b.device_ids.map(Number).filter(Boolean) : [];
  if (b.category_id || b.department_id) {
    const where = ["deleted_at IS NULL AND status NOT IN ('disposed','lost','pending_disposal')"];
    const p = [];
    if (b.category_id) { where.push('category_id = ?'); p.push(b.category_id); }
    if (b.department_id) { where.push('department_id = ?'); p.push(b.department_id); }
    deviceIds = all(`SELECT id FROM devices WHERE ${where.join(' AND ')}`, ...p).map((r) => r.id);
    if (!deviceIds.length) throw new HttpError(400, 'Không có thiết bị nào phù hợp điều kiện');
  }
  if (!deviceIds.length && base.device_id) deviceIds = [Number(base.device_id)];
  const ids = tx(() => {
    if (!deviceIds.length) return [insert('maintenances', { ...base, device_id: null })];
    return deviceIds.map((id) => insert('maintenances', { ...base, device_id: id }));
  });
  audit(req, 'Lập kế hoạch bảo trì', 'maintenance', ids[0], `${base.title} (${ids.length} thiết bị)`);
  res.json({ ids, count: ids.length });
});

router.put('/:id', requirePerm('maintenance.write'), (req, res) => {
  const data = pick(req.body, [...FIELDS, 'status', 'done_date', 'performer', 'content', 'result', 'cost']);
  update('maintenances', req.params.id, data);
  audit(req, 'Sửa kế hoạch bảo trì', 'maintenance', req.params.id);
  res.json({ ok: true });
});

router.post('/:id/complete', requirePerm('maintenance.write'), (req, res) => {
  const m = get('SELECT * FROM maintenances WHERE id = ?', req.params.id);
  if (!m) throw new HttpError(404, 'Không tìm thấy');
  if (m.status !== 'planned') throw new HttpError(400, 'Kế hoạch này đã được xử lý');
  const data = pick(req.body, ['done_date', 'performer', 'content', 'result', 'cost']);
  data.done_date = data.done_date || today();
  data.performer = data.performer || req.user.full_name;
  data.cost = Number(data.cost) || 0;
  const skip = req.body.skip === true;
  const next = tx(() => {
    update('maintenances', m.id, { ...data, status: skip ? 'skipped' : 'done' });
    if (m.device_id && !skip) {
      addHistory(req, m.device_id, 'Bảo trì', `${m.title}${data.content ? ': ' + data.content : ''}${data.result ? '. Kết quả: ' + data.result : ''}`, 'maintenance', m.id);
    }
    if (m.interval_months > 0) {
      const nextDate = addMonths(data.done_date > m.scheduled_date ? data.done_date : m.scheduled_date, m.interval_months);
      return insert('maintenances', { title: m.title, device_id: m.device_id, scheduled_date: nextDate, interval_months: m.interval_months, assignee_id: m.assignee_id, note: m.note });
    }
    return null;
  });
  audit(req, skip ? 'Bỏ qua bảo trì' : 'Hoàn thành bảo trì', 'maintenance', m.id, m.title);
  res.json({ ok: true, next_id: next });
});

router.delete('/:id', requirePerm('maintenance.write'), (req, res) => {
  run('DELETE FROM maintenances WHERE id = ?', req.params.id);
  audit(req, 'Xóa kế hoạch bảo trì', 'maintenance', req.params.id);
  res.json({ ok: true });
});
