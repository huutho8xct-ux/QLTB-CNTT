import { Router } from 'express';
import { all, get, run, tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { REPAIR_STATUS, REPAIR_PRIORITY, REPAIR_TYPE, labelOf } from '../../public/js/constants.js';
import { HttpError, pick, insert, update, audit, addHistory, nextCode, pageParams, likeParam, today, sendXlsx } from '../util.js';
import { getSettings } from '../db.js';
import { scopeWhere } from './devices.js';

export const router = Router();

const SELECT = `
  SELECT r.*, v.asset_code, v.name AS device_name, v.model, v.serial_number, v.location AS device_location, v.assigned_to,
         v.warranty_end, d.name AS department_name, t.full_name AS technician_name, c.name AS category_name
    FROM repairs r
    JOIN devices v ON v.id = r.device_id
    LEFT JOIN departments d ON d.id = v.department_id
    LEFT JOIN categories c ON c.id = v.category_id
    LEFT JOIN users t ON t.id = r.technician_id`;

function filter(req) {
  const where = ['1=1'];
  const p = [];
  const q = req.query;
  if (q.status) {
    const sts = String(q.status).split(',').filter((s) => REPAIR_STATUS[s]);
    if (sts.length) { where.push(`r.status IN (${sts.map(() => '?').join(',')})`); p.push(...sts); }
  }
  if (q.open === '1') where.push("r.status IN ('pending','in_progress','warranty')");
  if (q.priority) { where.push('r.priority = ?'); p.push(q.priority); }
  if (q.technician_id) { where.push('r.technician_id = ?'); p.push(q.technician_id); }
  if (q.department_id) { where.push('v.department_id = ?'); p.push(q.department_id); }
  if (q.device_id) { where.push('r.device_id = ?'); p.push(q.device_id); }
  if (q.from) { where.push('r.report_date >= ?'); p.push(q.from); }
  if (q.to) { where.push('r.report_date <= ?'); p.push(q.to); }
  if (q.mine === '1') { where.push('r.reporter_id = ?'); p.push(req.user.id); }
  if (q.q) {
    const l = likeParam(q.q);
    where.push(`(r.code LIKE ? ESCAPE '\\' OR r.problem LIKE ? ESCAPE '\\' OR v.asset_code LIKE ? ESCAPE '\\' OR v.name LIKE ? ESCAPE '\\' OR r.reporter_name LIKE ? ESCAPE '\\')`);
    p.push(l, l, l, l, l);
  }
  const s = scopeWhere(req.user);
  if (s.sql && req.user.role === 'user') {
    where.push('(v.department_id = ? OR r.reporter_id = ?)');
    p.push(req.user.department_id ?? -1, req.user.id);
  }
  return { w: where.join(' AND '), p };
}

router.get('/', (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const { w, p } = filter(req);
  const total = get(`SELECT COUNT(*) AS n FROM repairs r JOIN devices v ON v.id = r.device_id WHERE ${w}`, ...p).n;
  const cost = get(`SELECT COALESCE(SUM(r.cost),0) AS s FROM repairs r JOIN devices v ON v.id = r.device_id WHERE ${w}`, ...p).s;
  const rows = all(`${SELECT} WHERE ${w}
     ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'warranty' THEN 2 ELSE 3 END,
              CASE r.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, r.id DESC
     LIMIT ? OFFSET ?`, ...p, pageSize, offset);
  res.json({ rows, total, page, pageSize, sum_cost: cost });
});

router.get('/export', async (req, res) => {
  const { w, p } = filter(req);
  const rows = all(`${SELECT} WHERE ${w} ORDER BY r.report_date DESC`, ...p).map((r) => ({
    ...r, status_label: labelOf(REPAIR_STATUS, r.status), priority_label: labelOf(REPAIR_PRIORITY, r.priority), type_label: labelOf(REPAIR_TYPE, r.repair_type),
  }));
  await sendXlsx(res, {
    filename: `So_theo_doi_sua_chua_${today()}.xlsx`,
    title: 'SỔ THEO DÕI SỬA CHỮA THIẾT BỊ CNTT',
    settings: getSettings(),
    columns: [
      { key: 'code', label: 'Số phiếu', width: 14 }, { key: 'report_date', label: 'Ngày báo', type: 'date' },
      { key: 'asset_code', label: 'Mã TS', width: 12 }, { key: 'device_name', label: 'Thiết bị', width: 28 },
      { key: 'department_name', label: 'Phòng ban', width: 20 }, { key: 'reporter_name', label: 'Người báo', width: 16 },
      { key: 'problem', label: 'Hiện tượng hỏng', width: 30 }, { key: 'priority_label', label: 'Mức độ', width: 10 },
      { key: 'technician_name', label: 'Người xử lý', width: 16 }, { key: 'type_label', label: 'Hình thức', width: 16 },
      { key: 'solution', label: 'Biện pháp khắc phục', width: 30 }, { key: 'cost', label: 'Chi phí', type: 'money' },
      { key: 'finish_date', label: 'Ngày hoàn thành', type: 'date' }, { key: 'status_label', label: 'Trạng thái', width: 12 },
    ],
    rows,
    totals: { cost: rows.reduce((s, r) => s + (r.cost || 0), 0) },
  });
});

function load(req) {
  const r = get(`${SELECT} WHERE r.id = ?`, req.params.id);
  if (!r) throw new HttpError(404, 'Không tìm thấy phiếu sửa chữa');
  if (req.user.role === 'user' && r.reporter_id !== req.user.id) {
    const dev = get('SELECT department_id FROM devices WHERE id = ?', r.device_id);
    if (dev.department_id !== req.user.department_id) throw new HttpError(403, 'Không có quyền xem phiếu này');
  }
  return r;
}

router.get('/:id', (req, res) => res.json(load(req)));

router.post('/', requirePerm('repair.create'), (req, res) => {
  const b = req.body || {};
  const data = pick(b, ['device_id', 'reporter_name', 'reporter_phone', 'report_date', 'problem', 'priority', 'note']);
  if (!data.device_id) throw new HttpError(400, 'Vui lòng chọn thiết bị');
  if (!data.problem) throw new HttpError(400, 'Vui lòng mô tả hiện tượng hỏng');
  const s = scopeWhere(req.user);
  const dev = get(`SELECT * FROM devices v WHERE v.id = ? AND v.deleted_at IS NULL${s.sql}`, data.device_id, ...s.params);
  if (!dev) throw new HttpError(400, 'Thiết bị không tồn tại hoặc không thuộc phòng ban của bạn');
  if (['disposed', 'lost'].includes(dev.status)) throw new HttpError(400, 'Thiết bị đã thanh lý/mất, không thể báo hỏng');
  const open = get("SELECT code FROM repairs WHERE device_id = ? AND status IN ('pending','in_progress','warranty')", dev.id);
  if (open) throw new HttpError(400, `Thiết bị đang có yêu cầu sửa chữa chưa hoàn thành (${open.code})`);
  data.report_date = data.report_date || today();
  data.priority = REPAIR_PRIORITY[data.priority] ? data.priority : 'normal';
  data.reporter_name = data.reporter_name || req.user.full_name;
  const result = tx(() => {
    const code = nextCode('repairs', 'SC', data.report_date);
    const id = insert('repairs', { ...data, code, reporter_id: req.user.id, status: 'pending', prev_device_status: dev.status });
    addHistory(req, dev.id, 'Báo hỏng', `${data.problem} (phiếu ${code})`, 'repair', id);
    return { id, code };
  });
  audit(req, 'Tạo yêu cầu sửa chữa', 'repair', result.id, `${result.code} - ${dev.asset_code}`);
  res.json(result);
});

router.put('/:id', requirePerm('repair.manage'), (req, res) => {
  const r = get('SELECT * FROM repairs WHERE id = ?', req.params.id);
  if (!r) throw new HttpError(404, 'Không tìm thấy phiếu');
  const data = pick(req.body, ['status', 'priority', 'repair_type', 'technician_id', 'vendor', 'diagnosis', 'solution', 'parts_replaced', 'cost', 'start_date', 'finish_date', 'problem', 'note', 'reporter_name', 'reporter_phone']);
  if (data.status && !REPAIR_STATUS[data.status]) throw new HttpError(400, 'Trạng thái không hợp lệ');
  if (data.cost != null) data.cost = Number(data.cost) || 0;
  const newStatus = data.status || r.status;
  if (['in_progress', 'warranty'].includes(newStatus) && !data.start_date && !r.start_date) data.start_date = today();
  if (['done', 'unrepairable'].includes(newStatus) && !data.finish_date && !r.finish_date) data.finish_date = today();
  if (newStatus === 'in_progress' && !data.technician_id && !r.technician_id) data.technician_id = req.user.id;

  tx(() => {
    update('repairs', r.id, { ...data, updated_at: new Date().toLocaleString('sv-SE') });
    if (data.status && data.status !== r.status) {
      let devStatus = null;
      if (['in_progress', 'warranty'].includes(newStatus)) devStatus = 'repairing';
      else if (newStatus === 'done') devStatus = r.prev_device_status && !['repairing', 'broken'].includes(r.prev_device_status) ? r.prev_device_status : 'in_use';
      else if (newStatus === 'unrepairable') devStatus = 'broken';
      else if (newStatus === 'cancelled' || newStatus === 'pending') devStatus = r.prev_device_status;
      if (devStatus) {
        const cond = newStatus === 'unrepairable' ? ", condition = 'broken'" : '';
        run(`UPDATE devices SET status = ?${cond}, updated_at = datetime('now','localtime') WHERE id = ?`, devStatus, r.device_id);
      }
      let desc = `Phiếu ${r.code}: ${labelOf(REPAIR_STATUS, r.status)} → ${labelOf(REPAIR_STATUS, newStatus)}`;
      if (newStatus === 'done') desc += `${data.solution || r.solution ? '. Khắc phục: ' + (data.solution || r.solution) : ''}${(data.cost ?? r.cost) ? `. Chi phí: ${Number(data.cost ?? r.cost).toLocaleString('vi-VN')} đ` : ''}`;
      addHistory(req, r.device_id, 'Sửa chữa', desc, 'repair', r.id);
    }
  });
  audit(req, 'Cập nhật phiếu sửa chữa', 'repair', r.id, `${r.code}${data.status ? ' → ' + labelOf(REPAIR_STATUS, data.status) : ''}`);
  res.json({ ok: true });
});

router.delete('/:id', requirePerm('repair.manage'), (req, res) => {
  const r = get('SELECT * FROM repairs WHERE id = ?', req.params.id);
  if (!r) throw new HttpError(404, 'Không tìm thấy phiếu');
  if (r.status !== 'pending' && r.status !== 'cancelled') throw new HttpError(400, 'Chỉ xóa được phiếu đang chờ xử lý hoặc đã hủy');
  run('DELETE FROM repairs WHERE id = ?', r.id);
  audit(req, 'Xóa phiếu sửa chữa', 'repair', r.id, r.code);
  res.json({ ok: true });
});
