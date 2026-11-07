import { Router } from 'express';
import { all, get, getSettings } from '../db.js';
import { requirePerm } from '../auth.js';
import { DEVICE_STATUS, REPAIR_STATUS, ALLOCATION_TYPES, CONDITIONS, labelOf, calcDepreciation, can } from '../../public/js/constants.js';
import { HttpError, today, addDays, sendXlsx } from '../util.js';
import { scopeWhere } from './devices.js';

export const router = Router();

function alertsFor(user) {
  const s = getSettings();
  const t = today();
  const scope = scopeWhere(user);
  const wDays = Number(s.warranty_alert_days) || 30;
  const lDays = Number(s.license_alert_days) || 30;
  const mDays = Number(s.maintenance_alert_days) || 7;
  const out = {
    warranty_expiring: all(`SELECT v.id, v.asset_code, v.name, v.warranty_end FROM devices v
       WHERE v.deleted_at IS NULL AND v.status NOT IN ('disposed','lost') AND v.warranty_end BETWEEN ? AND ?${scope.sql}
       ORDER BY v.warranty_end LIMIT 50`, t, addDays(t, wDays), ...scope.params),
    maintenance_overdue: all(`SELECT m.id, m.title, m.scheduled_date, v.asset_code, v.name AS device_name FROM maintenances m
       LEFT JOIN devices v ON v.id = m.device_id WHERE m.status = 'planned' AND m.scheduled_date < ?${scope.sql}
       ORDER BY m.scheduled_date LIMIT 50`, t, ...scope.params),
    maintenance_upcoming: all(`SELECT m.id, m.title, m.scheduled_date, v.asset_code, v.name AS device_name FROM maintenances m
       LEFT JOIN devices v ON v.id = m.device_id WHERE m.status = 'planned' AND m.scheduled_date BETWEEN ? AND ?${scope.sql}
       ORDER BY m.scheduled_date LIMIT 50`, t, addDays(t, mDays), ...scope.params),
    repairs_open: all(`SELECT r.id, r.code, r.priority, r.status, r.report_date, v.asset_code, v.name AS device_name FROM repairs r
       JOIN devices v ON v.id = r.device_id WHERE r.status IN ('pending','in_progress','warranty')${scope.sql}
       ORDER BY CASE r.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, r.report_date LIMIT 50`, ...scope.params),
    licenses_expiring: [],
  };
  if (can(user, 'view.all')) {
    out.licenses_expiring = all(`SELECT id, name, version, expiry_date FROM licenses WHERE expiry_date IS NOT NULL AND expiry_date <= ?
       ORDER BY expiry_date LIMIT 50`, addDays(t, lDays));
  }
  return out;
}

router.get('/alerts', (req, res) => {
  const a = alertsFor(req.user);
  res.json({
    ...a,
    count: a.warranty_expiring.length + a.maintenance_overdue.length + a.maintenance_upcoming.length + a.licenses_expiring.length
      + a.repairs_open.filter((r) => r.status === 'pending').length,
  });
});

router.get('/dashboard', (req, res) => {
  const s = getSettings();
  const scope = scopeWhere(req.user);
  const base = `FROM devices v WHERE v.deleted_at IS NULL AND v.status <> 'disposed'${scope.sql}`;
  const devs = all(`SELECT v.id, v.status, v.original_price, v.depreciation_years, v.in_use_date, v.purchase_date, v.category_id, v.department_id,
                           v.funding_source_id, v.warranty_end ${base}`, ...scope.params);
  const t = today();
  let totalValue = 0, remaining = 0, fullyDep = 0, inWarranty = 0;
  for (const d of devs) {
    const dep = calcDepreciation(d, t, s.depreciation_method);
    totalValue += d.original_price || 0;
    remaining += dep.remaining;
    if (d.original_price && d.depreciation_years && dep.remaining <= 0) fullyDep++;
    if (d.warranty_end && d.warranty_end >= t) inWarranty++;
  }
  const byStatus = all(`SELECT v.status, COUNT(*) AS n ${base} GROUP BY v.status`, ...scope.params)
    .map((r) => ({ ...r, label: labelOf(DEVICE_STATUS, r.status) }));
  const byCategory = all(`SELECT COALESCE(c.name, '(Chưa phân loại)') AS label, COUNT(*) AS n, COALESCE(SUM(v.original_price),0) AS value
      FROM devices v LEFT JOIN categories c ON c.id = v.category_id
     WHERE v.deleted_at IS NULL AND v.status <> 'disposed'${scope.sql} GROUP BY v.category_id ORDER BY n DESC`, ...scope.params);
  const byDepartment = all(`SELECT COALESCE(d.name, 'Kho') AS label, COUNT(*) AS n, COALESCE(SUM(v.original_price),0) AS value
      FROM devices v LEFT JOIN departments d ON d.id = v.department_id
     WHERE v.deleted_at IS NULL AND v.status <> 'disposed'${scope.sql} GROUP BY v.department_id ORDER BY n DESC`, ...scope.params);
  const byFunding = all(`SELECT COALESCE(f.name, '(Chưa xác định)') AS label, COUNT(*) AS n, COALESCE(SUM(v.original_price),0) AS value
      FROM devices v LEFT JOIN funding_sources f ON f.id = v.funding_source_id
     WHERE v.deleted_at IS NULL AND v.status <> 'disposed'${scope.sql} GROUP BY v.funding_source_id ORDER BY value DESC`, ...scope.params);
  const byYear = all(`SELECT substr(COALESCE(v.in_use_date, v.purchase_date), 1, 4) AS label, COUNT(*) AS n, COALESCE(SUM(v.original_price),0) AS value
      ${base} AND COALESCE(v.in_use_date, v.purchase_date) IS NOT NULL GROUP BY label ORDER BY label`, ...scope.params);
  const year = t.slice(0, 4);
  const repairCost = get(`SELECT COALESCE(SUM(r.cost),0) AS s, COUNT(*) AS n FROM repairs r JOIN devices v ON v.id = r.device_id
                           WHERE substr(r.report_date,1,4) = ?${scope.sql}`, year, ...scope.params);
  const repairsByMonth = all(`SELECT substr(r.report_date, 6, 2) AS m, COUNT(*) AS n, COALESCE(SUM(r.cost),0) AS cost
      FROM repairs r JOIN devices v ON v.id = r.device_id WHERE substr(r.report_date,1,4) = ?${scope.sql} GROUP BY m`, year, ...scope.params);
  const recent = all(`SELECT h.*, v.asset_code, v.name AS device_name FROM device_history h JOIN devices v ON v.id = h.device_id
                       WHERE 1=1${scope.sql} ORDER BY h.id DESC LIMIT 12`, ...scope.params);
  const oldDevices = devs.filter((d) => {
    const st = d.in_use_date || d.purchase_date;
    return st && Number(year) - Number(st.slice(0, 4)) >= 5;
  }).length;
  res.json({
    totals: {
      devices: devs.length, value: totalValue, remaining, fully_depreciated: fullyDep, in_warranty: inWarranty, old_devices: oldDevices,
      repairs_year: repairCost.n, repair_cost_year: repairCost.s,
      in_use: devs.filter((d) => d.status === 'in_use').length,
      in_stock: devs.filter((d) => d.status === 'in_stock').length,
      broken: devs.filter((d) => ['broken', 'repairing'].includes(d.status)).length,
      licenses: can(req.user, 'view.all') ? get('SELECT COUNT(*) AS n FROM licenses').n : 0,
    },
    byStatus, byCategory, byDepartment, byFunding, byYear, repairsByMonth, recent,
    alerts: alertsFor(req.user),
  });
});

// ======================= BÁO CÁO =======================

const REPORTS = {
  'asset-register': {
    title: 'SỔ THEO DÕI TÀI SẢN, THIẾT BỊ CÔNG NGHỆ THÔNG TIN',
    params: ['as_of', 'department_id', 'category_id', 'funding_source_id', 'fixed_only'],
    build(q, s) {
      const asOf = q.as_of || today();
      const where = ['v.deleted_at IS NULL', "(v.status <> 'disposed')", "COALESCE(v.in_use_date, v.purchase_date, substr(v.created_at,1,10)) <= ?"];
      const p = [asOf];
      if (q.department_id) { where.push(q.department_id === 'none' ? 'v.department_id IS NULL' : 'v.department_id = ?'); if (q.department_id !== 'none') p.push(q.department_id); }
      if (q.category_id) { where.push('v.category_id = ?'); p.push(q.category_id); }
      if (q.funding_source_id) { where.push('v.funding_source_id = ?'); p.push(q.funding_source_id); }
      if (q.fixed_only === '1') { where.push('v.original_price >= ?'); p.push(Number(s.fixed_asset_threshold) || 10000000); }
      const rows = all(`SELECT v.*, c.name AS category_name, d.name AS department_name, f.name AS funding_name
          FROM devices v LEFT JOIN categories c ON c.id = v.category_id LEFT JOIN departments d ON d.id = v.department_id
          LEFT JOIN funding_sources f ON f.id = v.funding_source_id WHERE ${where.join(' AND ')} ORDER BY c.name, v.asset_code`, ...p)
        .map((r) => {
          const dep = calcDepreciation(r, asOf, s.depreciation_method);
          return { ...r, rate: dep.rate ? Math.round(dep.rate * 100) / 100 : null, annual: dep.annual, accumulated: dep.accumulated, remaining: dep.remaining, status_label: labelOf(DEVICE_STATUS, r.status), use_date: r.in_use_date || r.purchase_date };
        });
      return {
        subtitle: `Tính đến ngày ${asOf.split('-').reverse().join('/')}`,
        columns: [
          { key: 'asset_code', label: 'Mã TS', width: 12 }, { key: 'name', label: 'Tên tài sản, thiết bị', width: 32 },
          { key: 'category_name', label: 'Loại', width: 18 }, { key: 'model', label: 'Model / Serial', width: 18, fmt: (r) => [r.model, r.serial_number].filter(Boolean).join(' / ') },
          { key: 'use_date', label: 'Ngày đưa vào SD', type: 'date' }, { key: 'funding_name', label: 'Nguồn vốn', width: 18 },
          { key: 'original_price', label: 'Nguyên giá', type: 'money' }, { key: 'rate', label: 'Tỷ lệ HM (%/năm)', type: 'number', width: 9 },
          { key: 'accumulated', label: 'Hao mòn lũy kế', type: 'money' }, { key: 'remaining', label: 'Giá trị còn lại', type: 'money' },
          { key: 'department_name', label: 'Bộ phận sử dụng', width: 20 }, { key: 'status_label', label: 'Trạng thái', width: 12 },
        ],
        rows,
        totalKeys: ['original_price', 'accumulated', 'remaining'],
      };
    },
  },

  depreciation: {
    title: 'BẢNG TÍNH HAO MÒN TÀI SẢN CỐ ĐỊNH (THIẾT BỊ CNTT)',
    params: ['year', 'department_id', 'category_id'],
    build(q, s) {
      const year = Number(q.year) || new Date().getFullYear();
      const endPrev = `${year - 1}-12-31`, end = `${year}-12-31`;
      const where = ['v.deleted_at IS NULL', 'v.original_price >= ?', 'COALESCE(v.in_use_date, v.purchase_date) <= ?'];
      const p = [Number(s.fixed_asset_threshold) || 10000000, end];
      if (q.department_id) { where.push('v.department_id = ?'); p.push(q.department_id); }
      if (q.category_id) { where.push('v.category_id = ?'); p.push(q.category_id); }
      const rows = all(`SELECT v.*, c.name AS category_name,
            (SELECT x.completed_date FROM disposal_items i JOIN disposals x ON x.id = i.disposal_id WHERE i.device_id = v.id AND x.status = 'completed' LIMIT 1) AS disposed_date
          FROM devices v LEFT JOIN categories c ON c.id = v.category_id WHERE ${where.join(' AND ')} ORDER BY c.name, v.asset_code`, ...p)
        .filter((r) => !(r.status === 'disposed' && r.disposed_date && r.disposed_date < `${year}-01-01`))
        .map((r) => {
          const a = calcDepreciation(r, endPrev, s.depreciation_method);
          const b = calcDepreciation(r, r.status === 'disposed' && r.disposed_date && r.disposed_date <= end ? r.disposed_date : end, s.depreciation_method);
          return { ...r, rate: Math.round(a.rate * 100) / 100 || Math.round(b.rate * 100) / 100, acc_begin: a.accumulated, in_year: b.accumulated - a.accumulated, acc_end: b.accumulated, remaining: b.remaining, use_date: r.in_use_date || r.purchase_date };
        });
      return {
        subtitle: `Năm ${year} - Phương pháp: ${s.depreciation_method === 'year' ? 'tính tròn năm' : 'tính theo số tháng sử dụng'}`,
        columns: [
          { key: 'asset_code', label: 'Mã TS', width: 12 }, { key: 'name', label: 'Tên tài sản', width: 32 },
          { key: 'category_name', label: 'Loại', width: 18 }, { key: 'use_date', label: 'Ngày SD', type: 'date' },
          { key: 'original_price', label: 'Nguyên giá', type: 'money' }, { key: 'depreciation_years', label: 'Số năm SD', type: 'number', width: 8 },
          { key: 'rate', label: 'Tỷ lệ HM (%)', type: 'number', width: 8 }, { key: 'acc_begin', label: 'HM lũy kế đầu năm', type: 'money' },
          { key: 'in_year', label: 'HM trong năm', type: 'money' }, { key: 'acc_end', label: 'HM lũy kế cuối năm', type: 'money' },
          { key: 'remaining', label: 'Giá trị còn lại cuối năm', type: 'money' },
        ],
        rows,
        totalKeys: ['original_price', 'acc_begin', 'in_year', 'acc_end', 'remaining'],
      };
    },
  },

  'by-department': {
    title: 'BÁO CÁO TỔNG HỢP THIẾT BỊ CNTT THEO PHÒNG BAN',
    params: [],
    build(q, s) { return groupReport('d.name', 'LEFT JOIN departments d ON d.id = v.department_id', 'Kho (chưa cấp phát)', 'Phòng ban', s); },
  },
  'by-category': {
    title: 'BÁO CÁO TỔNG HỢP THIẾT BỊ CNTT THEO LOẠI THIẾT BỊ',
    params: [],
    build(q, s) { return groupReport('c.name', 'LEFT JOIN categories c ON c.id = v.category_id', '(Chưa phân loại)', 'Loại thiết bị', s); },
  },
  'by-funding': {
    title: 'BÁO CÁO TỔNG HỢP THIẾT BỊ CNTT THEO NGUỒN VỐN HÌNH THÀNH',
    params: [],
    build(q, s) { return groupReport('f.name', 'LEFT JOIN funding_sources f ON f.id = v.funding_source_id', '(Chưa xác định)', 'Nguồn vốn', s); },
  },

  increase: {
    title: 'BÁO CÁO TÌNH HÌNH TĂNG, GIẢM THIẾT BỊ CNTT',
    params: ['from', 'to'],
    build(q) {
      const from = q.from || `${new Date().getFullYear()}-01-01`;
      const to = q.to || today();
      const inc = all(`SELECT v.asset_code, v.name, c.name AS category_name, COALESCE(v.in_use_date, v.purchase_date) AS date, v.original_price, f.name AS funding_name
          FROM devices v LEFT JOIN categories c ON c.id = v.category_id LEFT JOIN funding_sources f ON f.id = v.funding_source_id
          WHERE v.deleted_at IS NULL AND COALESCE(v.in_use_date, v.purchase_date) BETWEEN ? AND ?`, from, to)
        .map((r) => ({ ...r, kind: 'Tăng', reason: 'Mua sắm / tiếp nhận', increase: r.original_price, decrease: null }));
      const dec = all(`SELECT v.asset_code, v.name, c.name AS category_name, x.completed_date AS date, i.original_price, f.name AS funding_name, x.code
          FROM disposal_items i JOIN disposals x ON x.id = i.disposal_id JOIN devices v ON v.id = i.device_id
          LEFT JOIN categories c ON c.id = v.category_id LEFT JOIN funding_sources f ON f.id = v.funding_source_id
          WHERE x.status = 'completed' AND x.completed_date BETWEEN ? AND ?`, from, to)
        .map((r) => ({ ...r, kind: 'Giảm', reason: `Thanh lý (${r.code})`, increase: null, decrease: r.original_price }));
      return {
        subtitle: `Từ ngày ${from.split('-').reverse().join('/')} đến ngày ${to.split('-').reverse().join('/')}`,
        columns: [
          { key: 'date', label: 'Ngày', type: 'date' }, { key: 'kind', label: 'Tăng/Giảm', width: 8 },
          { key: 'asset_code', label: 'Mã TS', width: 12 }, { key: 'name', label: 'Tên thiết bị', width: 32 },
          { key: 'category_name', label: 'Loại', width: 18 }, { key: 'funding_name', label: 'Nguồn vốn', width: 18 },
          { key: 'reason', label: 'Lý do', width: 20 }, { key: 'increase', label: 'Nguyên giá tăng', type: 'money' },
          { key: 'decrease', label: 'Nguyên giá giảm', type: 'money' },
        ],
        rows: [...inc, ...dec].sort((a, b) => String(a.date).localeCompare(String(b.date))),
        totalKeys: ['increase', 'decrease'],
      };
    },
  },

  repairs: {
    title: 'BÁO CÁO TÌNH HÌNH SỬA CHỮA THIẾT BỊ CNTT',
    params: ['from', 'to', 'department_id'],
    build(q) {
      const from = q.from || `${new Date().getFullYear()}-01-01`;
      const to = q.to || today();
      const p = [from, to];
      let extra = '';
      if (q.department_id) { extra = ' AND v.department_id = ?'; p.push(q.department_id); }
      const rows = all(`SELECT r.*, v.asset_code, v.name AS device_name, d.name AS department_name, u.full_name AS technician_name
          FROM repairs r JOIN devices v ON v.id = r.device_id LEFT JOIN departments d ON d.id = v.department_id LEFT JOIN users u ON u.id = r.technician_id
          WHERE r.report_date BETWEEN ? AND ?${extra} ORDER BY r.report_date`, ...p)
        .map((r) => ({ ...r, status_label: labelOf(REPAIR_STATUS, r.status), days: r.finish_date ? Math.round((new Date(r.finish_date) - new Date(r.report_date)) / 86400000) : null }));
      return {
        subtitle: `Từ ngày ${from.split('-').reverse().join('/')} đến ngày ${to.split('-').reverse().join('/')}`,
        columns: [
          { key: 'code', label: 'Số phiếu', width: 13 }, { key: 'report_date', label: 'Ngày báo', type: 'date' },
          { key: 'asset_code', label: 'Mã TS', width: 12 }, { key: 'device_name', label: 'Thiết bị', width: 26 },
          { key: 'department_name', label: 'Phòng ban', width: 18 }, { key: 'problem', label: 'Hiện tượng', width: 28 },
          { key: 'solution', label: 'Khắc phục', width: 28 }, { key: 'technician_name', label: 'Người xử lý', width: 16 },
          { key: 'days', label: 'Số ngày xử lý', type: 'number', width: 8 }, { key: 'cost', label: 'Chi phí', type: 'money' },
          { key: 'status_label', label: 'Trạng thái', width: 12 },
        ],
        rows,
        totalKeys: ['cost'],
      };
    },
  },

  warranty: {
    title: 'DANH SÁCH THIẾT BỊ THEO TÌNH TRẠNG BẢO HÀNH',
    params: ['warranty'],
    build(q) {
      const t = today();
      const where = ["v.deleted_at IS NULL", "v.status NOT IN ('disposed','lost')", 'v.warranty_end IS NOT NULL'];
      const p = [];
      if (q.warranty === 'expired') { where.push('v.warranty_end < ?'); p.push(t); }
      else if (q.warranty === 'active') { where.push('v.warranty_end >= ?'); p.push(t); }
      else if (q.warranty === 'expiring') { where.push('v.warranty_end BETWEEN ? AND ?'); p.push(t, addDays(t, 90)); }
      const rows = all(`SELECT v.*, d.name AS department_name, s.name AS supplier_name FROM devices v
          LEFT JOIN departments d ON d.id = v.department_id LEFT JOIN suppliers s ON s.id = v.supplier_id
          WHERE ${where.join(' AND ')} ORDER BY v.warranty_end`, ...p)
        .map((r) => ({ ...r, days_left: Math.round((new Date(r.warranty_end) - new Date(t)) / 86400000) }));
      return {
        subtitle: { expired: 'Thiết bị đã hết bảo hành', active: 'Thiết bị còn bảo hành', expiring: 'Thiết bị sắp hết bảo hành (90 ngày)' }[q.warranty] || 'Tất cả thiết bị có thông tin bảo hành',
        columns: [
          { key: 'asset_code', label: 'Mã TS', width: 12 }, { key: 'name', label: 'Tên thiết bị', width: 30 },
          { key: 'serial_number', label: 'Serial', width: 16 }, { key: 'supplier_name', label: 'Nhà cung cấp', width: 22 },
          { key: 'purchase_date', label: 'Ngày mua', type: 'date' }, { key: 'warranty_months', label: 'BH (tháng)', type: 'number', width: 8 },
          { key: 'warranty_end', label: 'Hết hạn BH', type: 'date' }, { key: 'days_left', label: 'Số ngày còn lại', type: 'number', width: 10 },
          { key: 'department_name', label: 'Phòng ban', width: 20 },
        ],
        rows,
      };
    },
  },

  aging: {
    title: 'BÁO CÁO THIẾT BỊ THEO THỜI GIAN SỬ DỤNG (PHỤC VỤ LẬP KẾ HOẠCH THAY THẾ)',
    params: ['min_years', 'category_id'],
    build(q, s) {
      const minYears = Number(q.min_years) || 0;
      const t = today();
      const where = ["v.deleted_at IS NULL", "v.status NOT IN ('disposed','lost')"];
      const p = [];
      if (q.category_id) { where.push('v.category_id = ?'); p.push(q.category_id); }
      const rows = all(`SELECT v.*, c.name AS category_name, d.name AS department_name FROM devices v
          LEFT JOIN categories c ON c.id = v.category_id LEFT JOIN departments d ON d.id = v.department_id
          WHERE ${where.join(' AND ')}`, ...p)
        .map((r) => {
          const st = r.in_use_date || r.purchase_date;
          const age = st ? Math.floor(((new Date(t) - new Date(st)) / (365.25 * 86400000)) * 10) / 10 : null;
          const dep = calcDepreciation(r, t, s.depreciation_method);
          return {
            ...r, age, use_date: st, remaining: dep.remaining, condition_label: labelOf(CONDITIONS, r.condition), status_label: labelOf(DEVICE_STATUS, r.status),
            suggestion: age == null ? '' : (r.depreciation_years && age >= r.depreciation_years) || ['poor', 'broken'].includes(r.condition) ? 'Đề xuất thay thế' : age >= (r.depreciation_years || 5) - 1 ? 'Theo dõi' : '',
          };
        })
        .filter((r) => r.age != null && r.age >= minYears)
        .sort((a, b) => b.age - a.age);
      return {
        subtitle: minYears ? `Thiết bị đã sử dụng từ ${minYears} năm trở lên` : 'Tất cả thiết bị',
        columns: [
          { key: 'asset_code', label: 'Mã TS', width: 12 }, { key: 'name', label: 'Tên thiết bị', width: 30 },
          { key: 'category_name', label: 'Loại', width: 18 }, { key: 'cpu', label: 'Cấu hình', width: 24, fmt: (r) => [r.cpu, r.ram, r.storage].filter(Boolean).join(', ') },
          { key: 'use_date', label: 'Ngày SD', type: 'date' }, { key: 'age', label: 'Số năm SD', type: 'number', width: 8 },
          { key: 'remaining', label: 'Giá trị còn lại', type: 'money' }, { key: 'condition_label', label: 'Tình trạng', width: 10 },
          { key: 'department_name', label: 'Phòng ban', width: 20 }, { key: 'suggestion', label: 'Đề xuất', width: 14 },
        ],
        rows,
        totalKeys: ['remaining'],
      };
    },
  },

  allocations: {
    title: 'SỔ THEO DÕI CẤP PHÁT, ĐIỀU CHUYỂN, THU HỒI THIẾT BỊ',
    params: ['from', 'to', 'department_id'],
    build(q) {
      const from = q.from || `${new Date().getFullYear()}-01-01`;
      const to = q.to || today();
      const p = [from, to];
      let extra = '';
      if (q.department_id) { extra = ' AND (a.to_department_id = ? OR a.from_department_id = ?)'; p.push(q.department_id, q.department_id); }
      const rows = all(`SELECT a.code, a.type, a.doc_date, a.receiver_person, a.reason, fd.name AS from_name, td.name AS to_name,
             v.asset_code, v.name, v.original_price
          FROM allocations a JOIN allocation_items i ON i.allocation_id = a.id JOIN devices v ON v.id = i.device_id
          LEFT JOIN departments fd ON fd.id = a.from_department_id LEFT JOIN departments td ON td.id = a.to_department_id
          WHERE a.doc_date BETWEEN ? AND ?${extra} ORDER BY a.doc_date, a.code`, ...p)
        .map((r) => ({ ...r, type_label: labelOf(ALLOCATION_TYPES, r.type), from_name: r.from_name || 'Kho', to_name: r.to_name || 'Kho' }));
      return {
        subtitle: `Từ ngày ${from.split('-').reverse().join('/')} đến ngày ${to.split('-').reverse().join('/')}`,
        columns: [
          { key: 'doc_date', label: 'Ngày', type: 'date' }, { key: 'code', label: 'Số phiếu', width: 13 },
          { key: 'type_label', label: 'Loại', width: 11 }, { key: 'asset_code', label: 'Mã TS', width: 12 },
          { key: 'name', label: 'Tên thiết bị', width: 30 }, { key: 'from_name', label: 'Từ', width: 18 },
          { key: 'to_name', label: 'Đến', width: 18 }, { key: 'receiver_person', label: 'Người nhận', width: 16 },
          { key: 'original_price', label: 'Nguyên giá', type: 'money' }, { key: 'reason', label: 'Lý do', width: 22 },
        ],
        rows,
        totalKeys: ['original_price'],
      };
    },
  },

  network: {
    title: 'DANH SÁCH THIẾT BỊ THEO ĐỊA CHỈ MẠNG (IP / MAC)',
    params: ['department_id'],
    build(q) {
      const p = [];
      let extra = '';
      if (q.department_id) { extra = ' AND v.department_id = ?'; p.push(q.department_id); }
      const rows = all(`SELECT v.*, d.name AS department_name, c.name AS category_name FROM devices v
          LEFT JOIN departments d ON d.id = v.department_id LEFT JOIN categories c ON c.id = v.category_id
          WHERE v.deleted_at IS NULL AND v.status NOT IN ('disposed','lost') AND (v.ip_address IS NOT NULL OR v.mac_address IS NOT NULL OR v.hostname IS NOT NULL)${extra}`, ...p);
      const ipKey = (ip) => String(ip || '').split('.').map((x) => x.padStart(3, '0')).join('.');
      rows.sort((a, b) => ipKey(a.ip_address).localeCompare(ipKey(b.ip_address)));
      const seen = {};
      rows.forEach((r) => { if (r.ip_address) seen[r.ip_address] = (seen[r.ip_address] || 0) + 1; });
      rows.forEach((r) => { r.conflict = r.ip_address && seen[r.ip_address] > 1 ? 'Trùng IP' : ''; });
      return {
        subtitle: 'Phục vụ quản lý hạ tầng mạng nội bộ',
        columns: [
          { key: 'ip_address', label: 'Địa chỉ IP', width: 15 }, { key: 'mac_address', label: 'Địa chỉ MAC', width: 18 },
          { key: 'hostname', label: 'Tên máy', width: 14 }, { key: 'asset_code', label: 'Mã TS', width: 12 },
          { key: 'name', label: 'Thiết bị', width: 28 }, { key: 'category_name', label: 'Loại', width: 16 },
          { key: 'os', label: 'Hệ điều hành', width: 14 }, { key: 'department_name', label: 'Phòng ban', width: 18 },
          { key: 'assigned_to', label: 'Người sử dụng', width: 16 }, { key: 'conflict', label: 'Cảnh báo', width: 10 },
        ],
        rows,
      };
    },
  },
};

function groupReport(nameExpr, join, emptyName, label, s) {
  const t = today();
  const rows = all(`SELECT v.*, ${nameExpr} AS group_name FROM devices v ${join} WHERE v.deleted_at IS NULL AND v.status <> 'disposed'`);
  const groups = new Map();
  for (const r of rows) {
    const k = r.group_name || emptyName;
    if (!groups.has(k)) groups.set(k, { group: k, total: 0, in_use: 0, in_stock: 0, repairing: 0, broken: 0, pending_disposal: 0, lost: 0, original_price: 0, remaining: 0 });
    const g = groups.get(k);
    g.total++;
    if (r.status === 'repairing') g.repairing++;
    else if (g[r.status] != null) g[r.status]++;
    g.original_price += r.original_price || 0;
    g.remaining += calcDepreciation(r, t, s.depreciation_method).remaining;
  }
  return {
    subtitle: `Tính đến ngày ${t.split('-').reverse().join('/')}`,
    columns: [
      { key: 'group', label, width: 30 }, { key: 'total', label: 'Tổng số', type: 'number', width: 9 },
      { key: 'in_use', label: 'Đang sử dụng', type: 'number', width: 9 }, { key: 'in_stock', label: 'Trong kho', type: 'number', width: 9 },
      { key: 'repairing', label: 'Đang sửa', type: 'number', width: 9 }, { key: 'broken', label: 'Hỏng', type: 'number', width: 9 },
      { key: 'pending_disposal', label: 'Chờ thanh lý', type: 'number', width: 9 }, { key: 'lost', label: 'Mất', type: 'number', width: 9 },
      { key: 'original_price', label: 'Tổng nguyên giá', type: 'money' }, { key: 'remaining', label: 'Giá trị còn lại', type: 'money' },
    ],
    rows: [...groups.values()].sort((a, b) => b.total - a.total),
    totalKeys: ['total', 'in_use', 'in_stock', 'repairing', 'broken', 'pending_disposal', 'lost', 'original_price', 'remaining'],
  };
}

router.get('/reports', requirePerm('report.view'), (_req, res) => {
  res.json(Object.entries(REPORTS).map(([key, r]) => ({ key, title: r.title, params: r.params })));
});

router.get('/reports/:key', requirePerm('report.view'), async (req, res) => {
  const def = REPORTS[req.params.key];
  if (!def) throw new HttpError(404, 'Không có báo cáo này');
  const s = getSettings();
  const r = def.build(req.query, s);
  const rows = r.rows.map((row) => {
    const o = { ...row };
    for (const c of r.columns) if (c.fmt) o[c.key] = c.fmt(row);
    return o;
  });
  const totals = r.totalKeys ? Object.fromEntries(r.totalKeys.map((k) => [k, rows.reduce((a, x) => a + (Number(x[k]) || 0), 0)])) : null;
  const columns = r.columns.map(({ fmt, ...c }) => c);
  if (req.query.format === 'xlsx') {
    return sendXlsx(res, { filename: `${req.params.key}_${today()}.xlsx`, title: def.title, subtitle: r.subtitle, columns, rows, totals, settings: s });
  }
  res.json({ title: def.title, subtitle: r.subtitle, columns, rows, totals });
});
