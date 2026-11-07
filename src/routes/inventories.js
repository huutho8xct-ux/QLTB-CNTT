import { Router } from 'express';
import { all, get, run, tx, getSettings } from '../db.js';
import { requirePerm } from '../auth.js';
import { CONDITIONS, DEVICE_STATUS, labelOf, calcDepreciation } from '../../public/js/constants.js';
import { HttpError, pick, insert, update, audit, addHistory, nextCode, today, sendXlsx } from '../util.js';

export const router = Router();

router.use(requirePerm('view.all'));

router.get('/', (_req, res) => {
  res.json(all(`
    SELECT i.*, d.name AS department_name, u.full_name AS created_by_name,
           (SELECT COUNT(*) FROM inventory_items x WHERE x.inventory_id = i.id AND x.is_extra = 0) AS total,
           (SELECT COUNT(*) FROM inventory_items x WHERE x.inventory_id = i.id AND x.found IS NOT NULL) AS checked,
           (SELECT COUNT(*) FROM inventory_items x WHERE x.inventory_id = i.id AND x.found = 0) AS missing,
           (SELECT COUNT(*) FROM inventory_items x WHERE x.inventory_id = i.id AND x.is_extra = 1) AS extra
      FROM inventories i LEFT JOIN departments d ON d.id = i.department_id LEFT JOIN users u ON u.id = i.created_by
     ORDER BY i.id DESC`));
});

router.post('/', requirePerm('inventory.write'), (req, res) => {
  const data = pick(req.body, ['name', 'inventory_date', 'department_id', 'committee', 'note']);
  if (!data.name) throw new HttpError(400, 'Vui lòng nhập tên đợt kiểm kê');
  data.inventory_date = data.inventory_date || today();
  const result = tx(() => {
    const code = nextCode('inventories', 'KK', data.inventory_date);
    const id = insert('inventories', { ...data, code, status: 'open', created_by: req.user.id });
    const where = ["deleted_at IS NULL AND status NOT IN ('disposed')"];
    const p = [];
    if (data.department_id) { where.push('department_id = ?'); p.push(data.department_id); }
    const devs = all(`SELECT id, status, department_id FROM devices WHERE ${where.join(' AND ')}`, ...p);
    for (const d of devs) insert('inventory_items', { inventory_id: id, device_id: d.id, book_status: d.status, book_department_id: d.department_id });
    return { id, code, count: devs.length };
  });
  audit(req, 'Tạo đợt kiểm kê', 'inventory', result.id, `${result.code}: ${result.count} thiết bị`);
  res.json(result);
});

function loadInv(id) {
  const inv = get(`SELECT i.*, d.name AS department_name FROM inventories i LEFT JOIN departments d ON d.id = i.department_id WHERE i.id = ?`, id);
  if (!inv) throw new HttpError(404, 'Không tìm thấy đợt kiểm kê');
  return inv;
}

function items(id) {
  const settings = getSettings();
  return all(`
    SELECT x.*, v.asset_code, v.name, v.serial_number, v.model, v.unit, v.location AS book_location, v.assigned_to, v.original_price,
           v.depreciation_years, v.in_use_date, v.purchase_date, v.condition AS book_condition, c.name AS category_name,
           d.name AS book_department_name
      FROM inventory_items x JOIN devices v ON v.id = x.device_id
      LEFT JOIN categories c ON c.id = v.category_id
      LEFT JOIN departments d ON d.id = x.book_department_id
     WHERE x.inventory_id = ? ORDER BY x.is_extra, d.name, v.asset_code`, id).map((r) => ({
    ...r, remaining: calcDepreciation(r, r.checked_at?.slice(0, 10) || today(), settings.depreciation_method).remaining,
  }));
}

router.get('/:id', (req, res) => {
  const inv = loadInv(req.params.id);
  inv.items = items(inv.id);
  res.json(inv);
});

router.put('/:id', requirePerm('inventory.write'), (req, res) => {
  const data = pick(req.body, ['name', 'inventory_date', 'committee', 'conclusion', 'note']);
  update('inventories', req.params.id, data);
  audit(req, 'Sửa đợt kiểm kê', 'inventory', req.params.id);
  res.json({ ok: true });
});

// Kiểm đếm một thiết bị (theo mã tài sản quét được hoặc theo item)
router.post('/:id/check', requirePerm('inventory.check'), (req, res) => {
  const inv = loadInv(req.params.id);
  if (inv.status !== 'open') throw new HttpError(400, 'Đợt kiểm kê đã kết thúc');
  const b = req.body || {};
  let item;
  if (b.item_id) item = get('SELECT * FROM inventory_items WHERE id = ? AND inventory_id = ?', b.item_id, inv.id);
  else if (b.asset_code) {
    const dev = get('SELECT id, asset_code, name, status FROM devices WHERE asset_code = ? AND deleted_at IS NULL', String(b.asset_code).trim());
    if (!dev) throw new HttpError(404, `Không tìm thấy thiết bị có mã "${b.asset_code}" trong hệ thống`);
    item = get('SELECT * FROM inventory_items WHERE inventory_id = ? AND device_id = ?', inv.id, dev.id);
    if (!item) {
      // Thiết bị thừa (có thực tế nhưng không thuộc phạm vi sổ sách của đợt kiểm kê)
      const id = insert('inventory_items', { inventory_id: inv.id, device_id: dev.id, book_status: dev.status, is_extra: 1 });
      item = get('SELECT * FROM inventory_items WHERE id = ?', id);
    }
  }
  if (!item) throw new HttpError(404, 'Không tìm thấy thiết bị trong đợt kiểm kê');
  const found = b.found === undefined ? 1 : b.found === null ? null : b.found ? 1 : 0;
  if (b.actual_condition && !CONDITIONS[b.actual_condition]) throw new HttpError(400, 'Tình trạng không hợp lệ');
  update('inventory_items', item.id, {
    found,
    actual_condition: found ? b.actual_condition || item.actual_condition || get('SELECT condition FROM devices WHERE id = ?', item.device_id)?.condition : null,
    actual_location: b.actual_location ?? item.actual_location,
    note: b.note ?? item.note,
    checked_by: found === null ? null : req.user.full_name,
    checked_at: found === null ? null : new Date().toLocaleString('sv-SE'),
  });
  res.json(items(inv.id).find((x) => x.id === item.id));
});

router.post('/:id/complete', requirePerm('inventory.write'), (req, res) => {
  const inv = loadInv(req.params.id);
  if (inv.status !== 'open') throw new HttpError(400, 'Đợt kiểm kê đã kết thúc');
  const apply = req.body.apply_results !== false;
  const markMissing = req.body.mark_missing_lost === true;
  const unchecked = get('SELECT COUNT(*) AS n FROM inventory_items WHERE inventory_id = ? AND found IS NULL', inv.id).n;
  if (unchecked && !req.body.force) throw new HttpError(400, `Còn ${unchecked} thiết bị chưa kiểm đếm. Đánh dấu "Không tìm thấy" hoặc chọn hoàn thành bắt buộc.`);
  tx(() => {
    if (apply) {
      for (const it of all('SELECT * FROM inventory_items WHERE inventory_id = ?', inv.id)) {
        if (it.found === 1) {
          const dev = get('SELECT condition, location FROM devices WHERE id = ?', it.device_id);
          const upd = {};
          if (it.actual_condition && it.actual_condition !== dev.condition) upd.condition = it.actual_condition;
          if (it.actual_location && it.actual_location !== dev.location) upd.location = it.actual_location;
          if (Object.keys(upd).length) update('devices', it.device_id, upd);
          addHistory(req, it.device_id, 'Kiểm kê', `Có mặt khi kiểm kê (${inv.code})${upd.condition ? `, tình trạng: ${labelOf(CONDITIONS, upd.condition)}` : ''}`, 'inventory', inv.id);
        } else if (it.found === 0) {
          if (markMissing) run("UPDATE devices SET status = 'lost' WHERE id = ?", it.device_id);
          addHistory(req, it.device_id, 'Kiểm kê', `Không tìm thấy khi kiểm kê (${inv.code})${markMissing ? ', chuyển trạng thái Mất/Thất lạc' : ''}`, 'inventory', inv.id);
        }
      }
    }
    update('inventories', inv.id, { status: 'completed', completed_at: new Date().toLocaleString('sv-SE'), conclusion: req.body.conclusion ?? inv.conclusion });
  });
  audit(req, 'Hoàn thành kiểm kê', 'inventory', inv.id, inv.code);
  res.json({ ok: true });
});

router.get('/:id/export', async (req, res) => {
  const inv = loadInv(req.params.id);
  const rows = items(inv.id).map((r) => ({
    ...r,
    book_qty: r.is_extra ? 0 : 1,
    actual_qty: r.found ? 1 : 0,
    diff: (r.found ? 1 : 0) - (r.is_extra ? 0 : 1),
    result: r.found == null ? 'Chưa kiểm' : r.found ? (r.is_extra ? 'Thừa' : 'Khớp') : 'Thiếu',
    condition_label: labelOf(CONDITIONS, r.actual_condition),
    status_label: labelOf(DEVICE_STATUS, r.book_status),
  }));
  await sendXlsx(res, {
    filename: `Kiem_ke_${inv.code}.xlsx`,
    title: `BIÊN BẢN KIỂM KÊ THIẾT BỊ CNTT - ${inv.name.toUpperCase()}`,
    subtitle: `Số: ${inv.code} - Thời điểm kiểm kê: ${inv.inventory_date.split('-').reverse().join('/')}${inv.department_name ? ' - Phạm vi: ' + inv.department_name : ''}`,
    settings: getSettings(),
    columns: [
      { key: 'asset_code', label: 'Mã TS', width: 12 }, { key: 'name', label: 'Tên thiết bị', width: 30 },
      { key: 'serial_number', label: 'Serial', width: 14 }, { key: 'book_department_name', label: 'Phòng ban (sổ sách)', width: 20 },
      { key: 'original_price', label: 'Nguyên giá', type: 'money' }, { key: 'remaining', label: 'Giá trị còn lại', type: 'money' },
      { key: 'book_qty', label: 'SL sổ sách', type: 'number', width: 8 }, { key: 'actual_qty', label: 'SL thực tế', type: 'number', width: 8 },
      { key: 'diff', label: 'Chênh lệch', type: 'number', width: 8 }, { key: 'result', label: 'Kết quả', width: 10 },
      { key: 'condition_label', label: 'Tình trạng thực tế', width: 12 }, { key: 'actual_location', label: 'Vị trí thực tế', width: 14 },
      { key: 'note', label: 'Ghi chú', width: 20 },
    ],
    rows,
  });
});

router.delete('/:id', requirePerm('inventory.write'), (req, res) => {
  const inv = loadInv(req.params.id);
  if (inv.status === 'completed' && req.user.role !== 'admin') throw new HttpError(400, 'Không thể xóa đợt kiểm kê đã hoàn thành');
  run('DELETE FROM inventories WHERE id = ?', inv.id);
  audit(req, 'Xóa đợt kiểm kê', 'inventory', inv.id, inv.code);
  res.json({ ok: true });
});
