import { Router } from 'express';
import { all, get, run } from '../db.js';
import { requirePerm } from '../auth.js';
import { LICENSE_TYPE, can } from '../../public/js/constants.js';
import { HttpError, pick, required, insert, update, audit, addHistory, likeParam } from '../util.js';

export const router = Router();

router.use(requirePerm('view.all'));

const FIELDS = ['name', 'publisher', 'version', 'license_type', 'license_key', 'seats', 'purchase_date', 'expiry_date', 'price', 'supplier_id', 'funding_source_id', 'contract_no', 'note'];

router.get('/', (req, res) => {
  const where = ['1=1'];
  const p = [];
  if (req.query.q) {
    const l = likeParam(req.query.q);
    where.push(`(l.name LIKE ? ESCAPE '\\' OR l.publisher LIKE ? ESCAPE '\\' OR l.contract_no LIKE ? ESCAPE '\\')`);
    p.push(l, l, l);
  }
  if (req.query.license_type) { where.push('l.license_type = ?'); p.push(req.query.license_type); }
  const rows = all(`
    SELECT l.*, s.name AS supplier_name, f.name AS funding_name,
           (SELECT COUNT(*) FROM license_assignments a WHERE a.license_id = l.id) AS used
      FROM licenses l LEFT JOIN suppliers s ON s.id = l.supplier_id LEFT JOIN funding_sources f ON f.id = l.funding_source_id
     WHERE ${where.join(' AND ')} ORDER BY CASE WHEN l.expiry_date IS NULL THEN 1 ELSE 0 END, l.expiry_date, l.name`, ...p);
  const showKey = can(req.user, 'license.write');
  res.json(rows.map((r) => (showKey ? r : { ...r, license_key: r.license_key ? '••••••••' : null })));
});

router.get('/:id', (req, res) => {
  const l = get(`SELECT l.*, s.name AS supplier_name, f.name AS funding_name FROM licenses l
                   LEFT JOIN suppliers s ON s.id = l.supplier_id LEFT JOIN funding_sources f ON f.id = l.funding_source_id WHERE l.id = ?`, req.params.id);
  if (!l) throw new HttpError(404, 'Không tìm thấy bản quyền');
  if (!can(req.user, 'license.write') && l.license_key) l.license_key = '••••••••';
  l.devices = all(`SELECT a.id AS assignment_id, a.assigned_at, v.id, v.asset_code, v.name, v.assigned_to, d.name AS department_name
                     FROM license_assignments a JOIN devices v ON v.id = a.device_id LEFT JOIN departments d ON d.id = v.department_id
                    WHERE a.license_id = ? ORDER BY v.asset_code`, l.id);
  res.json(l);
});

function validate(data) {
  if (data.license_type && !LICENSE_TYPE[data.license_type]) throw new HttpError(400, 'Loại bản quyền không hợp lệ');
  if (data.seats != null && (isNaN(Number(data.seats)) || Number(data.seats) < 0)) throw new HttpError(400, 'Số lượng bản quyền không hợp lệ');
}

router.post('/', requirePerm('license.write'), (req, res) => {
  const data = pick(req.body, FIELDS);
  required(data, { name: 'Tên phần mềm' });
  validate(data);
  const id = insert('licenses', data);
  audit(req, 'Thêm bản quyền phần mềm', 'license', id, data.name);
  res.json({ id });
});

router.put('/:id', requirePerm('license.write'), (req, res) => {
  const data = pick(req.body, FIELDS);
  validate(data);
  update('licenses', req.params.id, data);
  audit(req, 'Sửa bản quyền phần mềm', 'license', req.params.id, data.name);
  res.json({ ok: true });
});

router.delete('/:id', requirePerm('license.write'), (req, res) => {
  const l = get('SELECT name FROM licenses WHERE id = ?', req.params.id);
  run('DELETE FROM licenses WHERE id = ?', req.params.id);
  audit(req, 'Xóa bản quyền phần mềm', 'license', req.params.id, l?.name);
  res.json({ ok: true });
});

router.post('/:id/assign', requirePerm('license.write'), (req, res) => {
  const l = get('SELECT l.*, (SELECT COUNT(*) FROM license_assignments a WHERE a.license_id = l.id) AS used FROM licenses l WHERE l.id = ?', req.params.id);
  if (!l) throw new HttpError(404, 'Không tìm thấy bản quyền');
  const ids = (req.body.device_ids || [req.body.device_id]).map(Number).filter(Boolean);
  if (l.seats && l.used + ids.length > l.seats) throw new HttpError(400, `Vượt quá số lượng bản quyền (${l.used}/${l.seats} đã sử dụng)`);
  for (const did of ids) {
    const r = run('INSERT OR IGNORE INTO license_assignments(license_id, device_id) VALUES (?, ?)', l.id, did);
    if (r.changes) addHistory(req, did, 'Cài phần mềm', `Gán bản quyền: ${l.name}${l.version ? ' ' + l.version : ''}`, 'license', l.id);
  }
  audit(req, 'Gán bản quyền cho thiết bị', 'license', l.id, `${l.name}: ${ids.length} thiết bị`);
  res.json({ ok: true });
});

router.delete('/:id/assign/:deviceId', requirePerm('license.write'), (req, res) => {
  const l = get('SELECT name FROM licenses WHERE id = ?', req.params.id);
  const r = run('DELETE FROM license_assignments WHERE license_id = ? AND device_id = ?', req.params.id, req.params.deviceId);
  if (r.changes) addHistory(req, Number(req.params.deviceId), 'Gỡ phần mềm', `Thu hồi bản quyền: ${l?.name}`, 'license', Number(req.params.id));
  audit(req, 'Thu hồi bản quyền khỏi thiết bị', 'license', req.params.id);
  res.json({ ok: true });
});
