import { Router } from 'express';
import { all, get, run, tx, getSettings } from '../db.js';
import { requirePerm } from '../auth.js';
import { DISPOSAL_METHOD, calcDepreciation } from '../../public/js/constants.js';
import { HttpError, pick, insert, update, audit, addHistory, nextCode, today } from '../util.js';

export const router = Router();

router.use(requirePerm('view.all'));

router.get('/', (_req, res) => {
  res.json(all(`
    SELECT x.*, u.full_name AS created_by_name,
           (SELECT COUNT(*) FROM disposal_items i WHERE i.disposal_id = x.id) AS item_count,
           (SELECT COALESCE(SUM(i.original_price),0) FROM disposal_items i WHERE i.disposal_id = x.id) AS total_original,
           (SELECT COALESCE(SUM(i.remaining_value),0) FROM disposal_items i WHERE i.disposal_id = x.id) AS total_remaining
      FROM disposals x LEFT JOIN users u ON u.id = x.created_by ORDER BY x.id DESC`));
});

function load(id) {
  const x = get('SELECT x.*, u.full_name AS created_by_name FROM disposals x LEFT JOIN users u ON u.id = x.created_by WHERE x.id = ?', id);
  if (!x) throw new HttpError(404, 'Không tìm thấy hồ sơ thanh lý');
  x.items = all(`SELECT i.*, v.asset_code, v.name, v.serial_number, v.model, v.brand, v.unit, v.purchase_date, v.in_use_date, v.condition,
                        c.name AS category_name, d.name AS department_name
                   FROM disposal_items i JOIN devices v ON v.id = i.device_id
                   LEFT JOIN categories c ON c.id = v.category_id LEFT JOIN departments d ON d.id = v.department_id
                  WHERE i.disposal_id = ? ORDER BY v.asset_code`, id);
  return x;
}

router.get('/:id', (req, res) => res.json(load(req.params.id)));

router.post('/', requirePerm('disposal.write'), (req, res) => {
  const b = req.body || {};
  const data = pick(b, ['doc_date', 'method', 'reason', 'note']);
  if (data.method && !DISPOSAL_METHOD[data.method]) throw new HttpError(400, 'Hình thức thanh lý không hợp lệ');
  if (!data.reason) throw new HttpError(400, 'Vui lòng nhập lý do thanh lý');
  const ids = (b.device_ids || []).map(Number).filter(Boolean);
  if (!ids.length) throw new HttpError(400, 'Vui lòng chọn thiết bị cần thanh lý');
  data.doc_date = data.doc_date || today();
  const settings = getSettings();
  const result = tx(() => {
    const code = nextCode('disposals', 'TL', data.doc_date);
    const id = insert('disposals', { ...data, code, status: 'proposed', created_by: req.user.id });
    for (const did of ids) {
      const d = get('SELECT * FROM devices WHERE id = ? AND deleted_at IS NULL', did);
      if (!d) throw new HttpError(400, 'Thiết bị không tồn tại');
      if (['disposed', 'pending_disposal'].includes(d.status)) throw new HttpError(400, `Thiết bị ${d.asset_code} đã/đang trong hồ sơ thanh lý`);
      const dep = calcDepreciation(d, data.doc_date, settings.depreciation_method);
      insert('disposal_items', { disposal_id: id, device_id: d.id, original_price: d.original_price || 0, remaining_value: dep.remaining, prev_status: d.status });
      run("UPDATE devices SET status = 'pending_disposal', updated_at = datetime('now','localtime') WHERE id = ?", d.id);
      addHistory(req, d.id, 'Đề nghị thanh lý', `Đưa vào hồ sơ thanh lý ${code}: ${data.reason}`, 'disposal', id);
    }
    return { id, code };
  });
  audit(req, 'Lập hồ sơ thanh lý', 'disposal', result.id, `${result.code}: ${ids.length} thiết bị`);
  res.json(result);
});

router.put('/:id', requirePerm('disposal.write'), (req, res) => {
  const x = load(req.params.id);
  const data = pick(req.body, ['doc_date', 'method', 'reason', 'note', 'revenue', 'expense', 'decision_no', 'decision_date']);
  if (x.status === 'completed') delete data.doc_date;
  update('disposals', x.id, data);
  audit(req, 'Sửa hồ sơ thanh lý', 'disposal', x.id, x.code);
  res.json({ ok: true });
});

function restoreDevices(req, x, why) {
  for (const it of x.items) {
    run("UPDATE devices SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?", it.prev_status || 'broken', it.device_id);
    addHistory(req, it.device_id, 'Thanh lý', `${why} hồ sơ ${x.code}, trả lại trạng thái trước đó`, 'disposal', x.id);
  }
}

router.post('/:id/approve', requirePerm('disposal.approve'), (req, res) => {
  const x = load(req.params.id);
  if (x.status !== 'proposed') throw new HttpError(400, 'Chỉ phê duyệt được hồ sơ đang ở trạng thái Đề xuất');
  const approve = req.body.approve !== false;
  tx(() => {
    update('disposals', x.id, {
      status: approve ? 'approved' : 'rejected',
      decision_no: req.body.decision_no || x.decision_no,
      decision_date: req.body.decision_date || today(),
      approved_by: req.user.full_name,
      note: req.body.note ?? x.note,
    });
    if (!approve) restoreDevices(req, x, 'Không phê duyệt');
  });
  audit(req, approve ? 'Phê duyệt thanh lý' : 'Từ chối thanh lý', 'disposal', x.id, x.code);
  res.json({ ok: true });
});

router.post('/:id/complete', requirePerm('disposal.write'), (req, res) => {
  const x = load(req.params.id);
  if (x.status !== 'approved') throw new HttpError(400, 'Hồ sơ phải được phê duyệt trước khi hoàn thành thanh lý');
  const date = req.body.completed_date || today();
  tx(() => {
    update('disposals', x.id, { status: 'completed', completed_date: date, revenue: Number(req.body.revenue) || 0, expense: Number(req.body.expense) || 0 });
    for (const it of x.items) {
      run("UPDATE devices SET status = 'disposed', assigned_to = NULL, updated_at = datetime('now','localtime') WHERE id = ?", it.device_id);
      run('DELETE FROM license_assignments WHERE device_id = ?', it.device_id);
      addHistory(req, it.device_id, 'Thanh lý', `Ghi giảm - đã thanh lý theo hồ sơ ${x.code}${x.decision_no ? ', QĐ số ' + x.decision_no : ''}`, 'disposal', x.id);
    }
  });
  audit(req, 'Hoàn thành thanh lý', 'disposal', x.id, x.code);
  res.json({ ok: true });
});

router.delete('/:id', requirePerm('disposal.write'), (req, res) => {
  const x = load(req.params.id);
  if (!['proposed', 'rejected'].includes(x.status) && !(req.user.role === 'admin' && x.status === 'approved')) {
    throw new HttpError(400, 'Không thể xóa hồ sơ đã phê duyệt hoặc đã thanh lý');
  }
  tx(() => {
    if (x.status !== 'rejected') restoreDevices(req, x, 'Hủy');
    run('DELETE FROM disposals WHERE id = ?', x.id);
  });
  audit(req, 'Xóa hồ sơ thanh lý', 'disposal', x.id, x.code);
  res.json({ ok: true });
});

