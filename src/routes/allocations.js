import { Router } from 'express';
import { all, get, run, tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { ALLOCATION_TYPES, DEVICE_STATUS, labelOf, can } from '../../public/js/constants.js';
import { HttpError, pick, insert, audit, addHistory, nextCode, pageParams, likeParam, today } from '../util.js';

export const router = Router();

const SELECT = `
  SELECT a.*, fd.name AS from_department_name, td.name AS to_department_name, u.full_name AS created_by_name,
         (SELECT COUNT(*) FROM allocation_items i WHERE i.allocation_id = a.id) AS item_count
    FROM allocations a
    LEFT JOIN departments fd ON fd.id = a.from_department_id
    LEFT JOIN departments td ON td.id = a.to_department_id
    LEFT JOIN users u ON u.id = a.created_by`;

router.get('/', (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const where = ['1=1'];
  const p = [];
  if (req.query.type) { where.push('a.type = ?'); p.push(req.query.type); }
  if (req.query.department_id) { where.push('(a.to_department_id = ? OR a.from_department_id = ?)'); p.push(req.query.department_id, req.query.department_id); }
  if (req.query.from) { where.push('a.doc_date >= ?'); p.push(req.query.from); }
  if (req.query.to) { where.push('a.doc_date <= ?'); p.push(req.query.to); }
  if (req.query.q) {
    where.push(`(a.code LIKE ? ESCAPE '\\' OR a.receiver_person LIKE ? ESCAPE '\\' OR a.reason LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM allocation_items i JOIN devices v ON v.id = i.device_id WHERE i.allocation_id = a.id AND (v.asset_code LIKE ? ESCAPE '\\' OR v.name LIKE ? ESCAPE '\\')))`);
    const l = likeParam(req.query.q);
    p.push(l, l, l, l, l);
  }
  if (!can(req.user, 'view.all')) {
    where.push('(a.to_department_id = ? OR a.from_department_id = ?)');
    p.push(req.user.department_id ?? -1, req.user.department_id ?? -1);
  }
  const w = where.join(' AND ');
  const total = get(`SELECT COUNT(*) AS n FROM allocations a WHERE ${w}`, ...p).n;
  const rows = all(`${SELECT} WHERE ${w} ORDER BY a.doc_date DESC, a.id DESC LIMIT ? OFFSET ?`, ...p, pageSize, offset);
  res.json({ rows, total, page, pageSize });
});

router.get('/:id', (req, res) => {
  const a = get(`${SELECT} WHERE a.id = ?`, req.params.id);
  if (!a) throw new HttpError(404, 'Không tìm thấy phiếu');
  if (!can(req.user, 'view.all') && ![a.to_department_id, a.from_department_id].includes(req.user.department_id)) throw new HttpError(403, 'Không có quyền xem phiếu này');
  a.items = all(`SELECT i.*, v.asset_code, v.name, v.serial_number, v.model, v.brand, v.unit, v.original_price, c.name AS category_name
                   FROM allocation_items i JOIN devices v ON v.id = i.device_id LEFT JOIN categories c ON c.id = v.category_id
                  WHERE i.allocation_id = ? ORDER BY i.id`, a.id);
  res.json(a);
});

router.post('/', requirePerm('allocation.write'), (req, res) => {
  const b = req.body || {};
  const type = b.type;
  if (!ALLOCATION_TYPES[type]) throw new HttpError(400, 'Loại phiếu không hợp lệ');
  const items = Array.isArray(b.items) ? b.items.filter((i) => i.device_id) : [];
  if (!items.length) throw new HttpError(400, 'Phiếu phải có ít nhất một thiết bị');
  const data = pick(b, ['doc_date', 'from_department_id', 'to_department_id', 'handover_person', 'receiver_person', 'receiver_position', 'location', 'reason', 'decision_no', 'note']);
  data.doc_date = data.doc_date || today();
  if (type !== 'recall' && !data.to_department_id) throw new HttpError(400, 'Vui lòng chọn phòng ban nhận');
  if (type === 'recall') data.to_department_id = null;
  const assignTo = b.assign_user !== false && type !== 'recall';

  const result = tx(() => {
    const code = nextCode('allocations', ALLOCATION_TYPES[type].prefix, data.doc_date);
    const id = insert('allocations', { ...data, code, type, created_by: req.user.id });
    const toName = data.to_department_id ? get('SELECT name FROM departments WHERE id = ?', data.to_department_id)?.name : 'Kho';
    for (const it of items) {
      const d = get('SELECT * FROM devices WHERE id = ? AND deleted_at IS NULL', it.device_id);
      if (!d) throw new HttpError(400, 'Thiết bị không tồn tại');
      if (['disposed', 'pending_disposal', 'lost'].includes(d.status)) throw new HttpError(400, `Thiết bị ${d.asset_code} đang ở trạng thái "${labelOf(DEVICE_STATUS, d.status)}", không thể ${ALLOCATION_TYPES[type].label.toLowerCase()}`);
      if (type === 'allocate' && d.status !== 'in_stock') throw new HttpError(400, `Thiết bị ${d.asset_code} không ở trong kho, hãy dùng phiếu Điều chuyển hoặc Thu hồi trước`);
      if (type === 'recall' && d.status === 'in_stock' && d.department_id == null) throw new HttpError(400, `Thiết bị ${d.asset_code} đã ở trong kho`);
      insert('allocation_items', { allocation_id: id, device_id: d.id, condition: it.condition || d.condition, note: it.note || null });
      const upd = { department_id: data.to_department_id ?? null, condition: it.condition || d.condition };
      if (type === 'recall') { upd.status = 'in_stock'; upd.assigned_to = null; upd.location = data.location || 'Kho'; }
      else {
        if (d.status === 'in_stock') upd.status = 'in_use';
        if (assignTo) upd.assigned_to = it.assigned_to || data.receiver_person || null;
        if (data.location) upd.location = data.location;
        if (!d.in_use_date && type === 'allocate') upd.in_use_date = data.doc_date;
      }
      const keys = Object.keys(upd);
      run(`UPDATE devices SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now','localtime') WHERE id = ?`, ...keys.map((k) => upd[k]), d.id);
      const fromName = d.department_id ? get('SELECT name FROM departments WHERE id = ?', d.department_id)?.name : 'Kho';
      addHistory(req, d.id, ALLOCATION_TYPES[type].label,
        `${ALLOCATION_TYPES[type].label} từ "${fromName}" sang "${toName}"${upd.assigned_to ? `, người sử dụng: ${upd.assigned_to}` : ''} (phiếu ${code})`,
        'allocation', id);
    }
    return { id, code };
  });
  audit(req, `Lập phiếu ${ALLOCATION_TYPES[type].label.toLowerCase()}`, 'allocation', result.id, `${result.code}: ${items.length} thiết bị`);
  res.json(result);
});

// Chỉ sửa thông tin chung (không thay đổi danh sách thiết bị đã bàn giao)
router.put('/:id', requirePerm('allocation.write'), (req, res) => {
  const data = pick(req.body, ['handover_person', 'receiver_person', 'receiver_position', 'reason', 'decision_no', 'note']);
  const keys = Object.keys(data);
  if (keys.length) run(`UPDATE allocations SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => data[k]), req.params.id);
  audit(req, 'Sửa phiếu bàn giao', 'allocation', req.params.id);
  res.json({ ok: true });
});
