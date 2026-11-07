import { Router } from 'express';
import { all, get, run } from '../db.js';
import { requirePerm } from '../auth.js';
import { HttpError, pick, required, insert, update, audit } from '../util.js';

export const router = Router();

const CATALOGS = {
  departments: {
    label: 'Phòng ban',
    fields: ['code', 'name', 'parent_id', 'manager_name', 'phone', 'location', 'note', 'sort_order'],
    required: { name: 'Tên phòng ban' },
    list: `SELECT d.*, p.name AS parent_name,
             (SELECT COUNT(*) FROM devices v WHERE v.department_id = d.id AND v.deleted_at IS NULL AND v.status <> 'disposed') AS device_count,
             (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id) AS user_count
           FROM departments d LEFT JOIN departments p ON p.id = d.parent_id ORDER BY d.sort_order, d.name`,
    refs: [['devices', 'department_id', 'thiết bị'], ['users', 'department_id', 'người dùng']],
  },
  categories: {
    label: 'Loại thiết bị',
    fields: ['code', 'name', 'prefix', 'depreciation_years', 'maintenance_months', 'is_it', 'description'],
    required: { name: 'Tên loại thiết bị' },
    list: `SELECT c.*, (SELECT COUNT(*) FROM devices v WHERE v.category_id = c.id AND v.deleted_at IS NULL AND v.status <> 'disposed') AS device_count
           FROM categories c ORDER BY c.name`,
    refs: [['devices', 'category_id', 'thiết bị']],
  },
  suppliers: {
    label: 'Nhà cung cấp',
    fields: ['name', 'tax_code', 'address', 'phone', 'email', 'contact_person', 'website', 'note'],
    required: { name: 'Tên nhà cung cấp' },
    list: `SELECT s.*, (SELECT COUNT(*) FROM devices v WHERE v.supplier_id = s.id AND v.deleted_at IS NULL) AS device_count
           FROM suppliers s ORDER BY s.name`,
    refs: [['devices', 'supplier_id', 'thiết bị']],
  },
  'funding-sources': {
    table: 'funding_sources',
    label: 'Nguồn vốn',
    fields: ['code', 'name', 'note'],
    required: { name: 'Tên nguồn vốn' },
    list: `SELECT f.*, (SELECT COUNT(*) FROM devices v WHERE v.funding_source_id = f.id AND v.deleted_at IS NULL) AS device_count
           FROM funding_sources f ORDER BY f.id`,
    refs: [['devices', 'funding_source_id', 'thiết bị']],
  },
};

for (const [path, cfg] of Object.entries(CATALOGS)) {
  const table = cfg.table || path;

  router.get(`/${path}`, (_req, res) => res.json(all(cfg.list)));

  router.post(`/${path}`, requirePerm('catalog.write'), (req, res) => {
    const data = pick(req.body, cfg.fields);
    required(data, cfg.required);
    try {
      const id = insert(table, data);
      audit(req, `Thêm ${cfg.label.toLowerCase()}`, table, id, data.name);
      res.json({ id });
    } catch (e) {
      if (/UNIQUE/.test(e.message)) throw new HttpError(400, 'Mã đã tồn tại, vui lòng chọn mã khác');
      throw e;
    }
  });

  router.put(`/${path}/:id`, requirePerm('catalog.write'), (req, res) => {
    const data = pick(req.body, cfg.fields);
    required({ ...get(`SELECT * FROM ${table} WHERE id = ?`, req.params.id), ...data }, cfg.required);
    if (table === 'departments' && Number(data.parent_id) === Number(req.params.id)) throw new HttpError(400, 'Phòng ban cha không hợp lệ');
    try {
      update(table, req.params.id, data);
    } catch (e) {
      if (/UNIQUE/.test(e.message)) throw new HttpError(400, 'Mã đã tồn tại, vui lòng chọn mã khác');
      throw e;
    }
    audit(req, `Sửa ${cfg.label.toLowerCase()}`, table, req.params.id, data.name);
    res.json({ ok: true });
  });

  router.delete(`/${path}/:id`, requirePerm('catalog.write'), (req, res) => {
    for (const [t, col, lbl] of cfg.refs) {
      const n = get(`SELECT COUNT(*) AS n FROM ${t} WHERE ${col} = ?${t === 'devices' ? ' AND deleted_at IS NULL' : ''}`, req.params.id).n;
      if (n) throw new HttpError(400, `Không thể xóa: đang có ${n} ${lbl} thuộc ${cfg.label.toLowerCase()} này`);
    }
    const row = get(`SELECT * FROM ${table} WHERE id = ?`, req.params.id);
    run(`DELETE FROM ${table} WHERE id = ?`, req.params.id);
    audit(req, `Xóa ${cfg.label.toLowerCase()}`, table, req.params.id, row?.name);
    res.json({ ok: true });
  });
}
