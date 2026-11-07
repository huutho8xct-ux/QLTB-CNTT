import { Router } from 'express';
import express from 'express';
import ExcelJS from 'exceljs';
import { all, get, run, tx, getSettings } from '../db.js';
import { requirePerm } from '../auth.js';
import { DEVICE_STATUS, CONDITIONS, can, labelOf, calcDepreciation } from '../../public/js/constants.js';
import { HttpError, pick, required, insert, update, audit, addHistory, addMonths, nextAssetCode, pageParams, likeParam, sendXlsx, today } from '../util.js';

export const router = Router();

export const DEVICE_FIELDS = [
  'asset_code', 'name', 'category_id', 'brand', 'model', 'serial_number', 'origin', 'manufacture_year', 'unit',
  'cpu', 'ram', 'storage', 'os', 'hostname', 'ip_address', 'mac_address', 'specs',
  'supplier_id', 'funding_source_id', 'invoice_no', 'contract_no', 'purchase_date', 'in_use_date',
  'original_price', 'depreciation_years', 'warranty_months', 'warranty_end',
  'status', 'condition', 'department_id', 'assigned_to', 'location', 'parent_id', 'note',
];

// Cột xuất/nhập Excel
const XLS_COLUMNS = [
  { key: 'asset_code', label: 'Mã tài sản', width: 14 },
  { key: 'name', label: 'Tên thiết bị', width: 30 },
  { key: 'category_name', label: 'Loại thiết bị', width: 20 },
  { key: 'brand', label: 'Hãng sản xuất', width: 12 },
  { key: 'model', label: 'Model', width: 16 },
  { key: 'serial_number', label: 'Số serial', width: 16 },
  { key: 'origin', label: 'Xuất xứ', width: 10 },
  { key: 'manufacture_year', label: 'Năm sản xuất', width: 8 },
  { key: 'unit', label: 'Đơn vị tính', width: 8 },
  { key: 'cpu', label: 'CPU', width: 18 },
  { key: 'ram', label: 'RAM', width: 8 },
  { key: 'storage', label: 'Ổ cứng', width: 12 },
  { key: 'os', label: 'Hệ điều hành', width: 14 },
  { key: 'hostname', label: 'Tên máy', width: 12 },
  { key: 'ip_address', label: 'Địa chỉ IP', width: 14 },
  { key: 'mac_address', label: 'Địa chỉ MAC', width: 18 },
  { key: 'specs', label: 'Cấu hình / thông số khác', width: 24 },
  { key: 'supplier_name', label: 'Nhà cung cấp', width: 20 },
  { key: 'funding_name', label: 'Nguồn vốn', width: 20 },
  { key: 'invoice_no', label: 'Số hóa đơn', width: 12 },
  { key: 'contract_no', label: 'Số hợp đồng', width: 12 },
  { key: 'purchase_date', label: 'Ngày mua', type: 'date' },
  { key: 'in_use_date', label: 'Ngày đưa vào sử dụng', type: 'date' },
  { key: 'original_price', label: 'Nguyên giá (đồng)', type: 'money' },
  { key: 'depreciation_years', label: 'Số năm sử dụng', type: 'number', width: 8 },
  { key: 'warranty_months', label: 'Bảo hành (tháng)', type: 'number', width: 8 },
  { key: 'warranty_end', label: 'Hết hạn bảo hành', type: 'date' },
  { key: 'status_label', label: 'Trạng thái', width: 14 },
  { key: 'condition_label', label: 'Tình trạng', width: 10 },
  { key: 'department_name', label: 'Phòng ban sử dụng', width: 22 },
  { key: 'assigned_to', label: 'Người sử dụng', width: 18 },
  { key: 'location', label: 'Vị trí đặt', width: 14 },
  { key: 'note', label: 'Ghi chú', width: 20 },
];
const XLS_EXTRA = [
  { key: 'accumulated', label: 'Hao mòn lũy kế', type: 'money' },
  { key: 'remaining', label: 'Giá trị còn lại', type: 'money' },
];

const BASE_SELECT = `
  SELECT v.*, c.name AS category_name, c.prefix AS category_prefix, d.name AS department_name,
         s.name AS supplier_name, f.name AS funding_name, p.asset_code AS parent_code, p.name AS parent_name
    FROM devices v
    LEFT JOIN categories c ON c.id = v.category_id
    LEFT JOIN departments d ON d.id = v.department_id
    LEFT JOIN suppliers s ON s.id = v.supplier_id
    LEFT JOIN funding_sources f ON f.id = v.funding_source_id
    LEFT JOIN devices p ON p.id = v.parent_id`;

const SORTS = {
  asset_code: 'v.asset_code', name: 'v.name', category: 'c.name', department: 'd.name', status: 'v.status',
  purchase_date: 'v.purchase_date', original_price: 'v.original_price', warranty_end: 'v.warranty_end',
  updated_at: 'v.updated_at', created_at: 'v.created_at', assigned_to: 'v.assigned_to',
};

export function scopeWhere(user, alias = 'v') {
  if (can(user, 'view.all')) return { sql: '', params: [] };
  return { sql: ` AND ${alias}.department_id = ?`, params: [user.department_id ?? -1] };
}

function buildFilter(q, user) {
  const where = ['v.deleted_at IS NULL'];
  const params = [];
  if (q.q) {
    const cols = ['v.asset_code', 'v.name', 'v.serial_number', 'v.model', 'v.brand', 'v.assigned_to', 'v.ip_address', 'v.hostname', 'v.location', 'v.mac_address'];
    where.push(`(${cols.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
    params.push(...cols.map(() => likeParam(q.q)));
  }
  if (q.category_id) { where.push('v.category_id = ?'); params.push(q.category_id); }
  if (q.department_id === 'none') where.push('v.department_id IS NULL');
  else if (q.department_id) { where.push('v.department_id = ?'); params.push(q.department_id); }
  if (q.funding_source_id) { where.push('v.funding_source_id = ?'); params.push(q.funding_source_id); }
  if (q.supplier_id) { where.push('v.supplier_id = ?'); params.push(q.supplier_id); }
  if (q.condition) { where.push('v.condition = ?'); params.push(q.condition); }
  if (q.year) { where.push("substr(COALESCE(v.in_use_date, v.purchase_date), 1, 4) = ?"); params.push(String(q.year)); }
  if (q.status) {
    const sts = String(q.status).split(',').filter((s) => DEVICE_STATUS[s]);
    if (sts.length) { where.push(`v.status IN (${sts.map(() => '?').join(',')})`); params.push(...sts); }
  } else if (!q.include_disposed) {
    where.push("v.status <> 'disposed'");
  }
  const t = today();
  if (q.warranty === 'active') { where.push('v.warranty_end >= ?'); params.push(t); }
  if (q.warranty === 'expired') { where.push('v.warranty_end < ?'); params.push(t); }
  if (q.warranty === 'expiring') {
    const days = Number(getSettings().warranty_alert_days) || 30;
    const lim = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    where.push('v.warranty_end BETWEEN ? AND ?'); params.push(t, lim);
  }
  if (q.ids) {
    const ids = String(q.ids).split(',').map(Number).filter(Boolean);
    if (ids.length) { where.push(`v.id IN (${ids.map(() => '?').join(',')})`); params.push(...ids); }
  }
  const scope = scopeWhere(user);
  return { sql: where.join(' AND ') + scope.sql, params: [...params, ...scope.params] };
}

function withComputed(rows, settings) {
  const method = settings.depreciation_method;
  const threshold = Number(settings.fixed_asset_threshold) || 10000000;
  const t = today();
  return rows.map((r) => {
    const dep = calcDepreciation(r, t, method);
    return {
      ...r,
      accumulated: dep.accumulated,
      remaining: dep.remaining,
      depreciation_rate: dep.rate,
      is_fixed_asset: (Number(r.original_price) || 0) >= threshold ? 1 : 0,
      status_label: labelOf(DEVICE_STATUS, r.status),
      condition_label: labelOf(CONDITIONS, r.condition),
    };
  });
}

router.get('/', (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const f = buildFilter(req.query, req.user);
  const sort = SORTS[req.query.sort] || 'v.updated_at';
  const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
  const total = get(`SELECT COUNT(*) AS n FROM devices v WHERE ${f.sql}`, ...f.params).n;
  const sum = get(`SELECT COALESCE(SUM(v.original_price), 0) AS s FROM devices v WHERE ${f.sql}`, ...f.params).s;
  const rows = all(`${BASE_SELECT} WHERE ${f.sql} ORDER BY ${sort} ${order}, v.id DESC LIMIT ? OFFSET ?`, ...f.params, pageSize, offset);
  res.json({ rows: withComputed(rows, getSettings()), total, page, pageSize, sum_price: sum });
});

// Tìm nhanh cho ô chọn thiết bị
router.get('/lookup', (req, res) => {
  const f = buildFilter({ q: req.query.q, status: req.query.status, department_id: req.query.department_id, include_disposed: req.query.include_disposed }, req.user);
  res.json(all(`SELECT v.id, v.asset_code, v.name, v.status, v.serial_number, v.department_id, v.assigned_to, v.original_price,
                       v.depreciation_years, v.in_use_date, v.purchase_date, v.condition, d.name AS department_name
                  FROM devices v LEFT JOIN departments d ON d.id = v.department_id
                 WHERE ${f.sql} ORDER BY v.asset_code LIMIT 30`, ...f.params));
});

router.get('/export', async (req, res) => {
  const f = buildFilter(req.query, req.user);
  const settings = getSettings();
  const rows = withComputed(all(`${BASE_SELECT} WHERE ${f.sql} ORDER BY v.asset_code`, ...f.params), settings);
  const totals = { original_price: 0, accumulated: 0, remaining: 0 };
  rows.forEach((r) => { totals.original_price += r.original_price || 0; totals.accumulated += r.accumulated; totals.remaining += r.remaining; });
  audit(req, 'Xuất Excel danh sách thiết bị', 'device', null, `${rows.length} thiết bị`);
  await sendXlsx(res, {
    filename: `Danh_sach_thiet_bi_${today()}.xlsx`,
    title: 'DANH SÁCH THIẾT BỊ CÔNG NGHỆ THÔNG TIN',
    columns: [...XLS_COLUMNS, ...XLS_EXTRA],
    rows, totals, settings,
  });
});

router.get('/import-template', async (_req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Thiết bị');
  const cols = XLS_COLUMNS.filter((c) => c.key !== 'warranty_end');
  ws.addRow(cols.map((c) => c.label + (c.key === 'name' ? ' (*)' : '')));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } }; });
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = Math.max(12, c.label.length + 2); });
  const sample = {
    asset_code: '', name: 'Máy tính để bàn Dell OptiPlex 7010', category_name: 'Máy tính để bàn', brand: 'Dell', model: 'OptiPlex 7010',
    serial_number: 'ABC123XYZ', origin: 'Trung Quốc', manufacture_year: 2024, unit: 'Bộ', cpu: 'Intel Core i5-13500', ram: '16GB', storage: 'SSD 512GB',
    os: 'Windows 11 Pro', hostname: 'PC-KT01', ip_address: '192.168.1.21', mac_address: '', specs: '', supplier_name: 'Công ty TNHH ABC',
    funding_name: 'Ngân sách nhà nước cấp', invoice_no: '0001234', contract_no: '12/2024/HĐMB', purchase_date: '15/03/2024', in_use_date: '20/03/2024',
    original_price: 18500000, depreciation_years: 5, warranty_months: 36, status_label: 'Đang sử dụng', condition_label: 'Tốt',
    department_name: 'Phòng Kế hoạch - Tài chính', assigned_to: 'Nguyễn Văn A', location: 'Phòng 201', note: '',
  };
  ws.addRow(cols.map((c) => sample[c.key] ?? ''));
  const help = wb.addWorksheet('Hướng dẫn');
  help.getColumn(1).width = 110;
  [
    'HƯỚNG DẪN NHẬP DỮ LIỆU THIẾT BỊ',
    '- Mỗi dòng là một thiết bị. Cột có dấu (*) là bắt buộc. Xóa dòng mẫu trước khi nhập.',
    '- Mã tài sản: để trống để hệ thống tự sinh theo loại thiết bị. Nếu mã đã tồn tại, dòng đó sẽ được CẬP NHẬT.',
    '- Ngày tháng: định dạng dd/mm/yyyy (ví dụ 15/03/2024) hoặc kiểu ngày của Excel.',
    '- Loại thiết bị, Phòng ban, Nhà cung cấp, Nguồn vốn: nhập đúng tên hoặc mã trong danh mục; nếu chưa có, hệ thống tự thêm mới.',
    `- Trạng thái: ${Object.values(DEVICE_STATUS).map((s) => s.label).join(', ')}`,
    `- Tình trạng: ${Object.values(CONDITIONS).join(', ')}`,
    '- Nguyên giá: nhập số (đồng), không nhập ký tự khác.',
  ].forEach((t, i) => { help.addRow([t]); if (i === 0) help.getRow(1).font = { bold: true, size: 13 }; });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''Mau_nhap_thiet_bi.xlsx");
  await wb.xlsx.write(res);
  res.end();
});

function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text) return String(v.text);
    if (v.result != null) return cellText(v.result);
    return '';
  }
  return String(v).trim();
}

function parseDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = cellText(v);
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  throw new Error(`Ngày không hợp lệ "${s}"`);
}

function parseNumber(v) {
  if (typeof v === 'number') return v;
  const s = cellText(v).replace(/[.,\s](?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  if (isNaN(n)) throw new Error(`Số không hợp lệ "${cellText(v)}"`);
  return n;
}

function findOrCreate(table, value, extra = {}) {
  const s = cellText(value);
  if (!s) return null;
  const hasCode = table !== 'suppliers';
  const r = get(`SELECT id FROM ${table} WHERE lower(name) = lower(?)${hasCode ? ' OR lower(code) = lower(?)' : ''}`, ...(hasCode ? [s, s] : [s]));
  if (r) return r.id;
  return insert(table, { name: s, ...extra });
}

function matchLabel(map, value, fallback) {
  const s = cellText(value).toLowerCase();
  if (!s) return fallback;
  for (const [k, v] of Object.entries(map)) {
    const lbl = (typeof v === 'string' ? v : v.label).toLowerCase();
    if (k === s || lbl === s) return k;
  }
  throw new Error(`Giá trị "${cellText(value)}" không hợp lệ`);
}

router.post('/import', requirePerm('device.write'), express.raw({ type: '*/*', limit: '20mb' }), async (req, res) => {
  if (!req.body?.length) throw new HttpError(400, 'Không có tệp dữ liệu');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(req.body);
  } catch {
    throw new HttpError(400, 'Tệp không đúng định dạng Excel (.xlsx)');
  }
  const ws = wb.worksheets[0];
  const headerMap = {};
  ws.getRow(1).eachCell((cell, col) => {
    const h = cellText(cell.value).replace(/\s*\(\*\)\s*$/, '').toLowerCase();
    const c = XLS_COLUMNS.find((x) => x.label.toLowerCase() === h);
    if (c) headerMap[col] = c.key;
  });
  if (!Object.values(headerMap).includes('name')) throw new HttpError(400, 'Không tìm thấy cột "Tên thiết bị". Vui lòng dùng tệp mẫu.');

  const result = { created: 0, updated: 0, errors: [] };
  const dryRun = req.query.dry_run === '1';
  try {
    tx(() => {
      ws.eachRow((row, rowNo) => {
        if (rowNo === 1) return;
        const raw = {};
        row.eachCell((cell, col) => { if (headerMap[col]) raw[headerMap[col]] = cell.value; });
        if (!cellText(raw.name) && !cellText(raw.asset_code)) return;
        try {
          if (!cellText(raw.name)) throw new Error('Thiếu tên thiết bị');
          const catId = findOrCreate('categories', raw.category_name);
          const cat = catId ? get('SELECT * FROM categories WHERE id = ?', catId) : null;
          const d = {
            name: cellText(raw.name),
            category_id: catId,
            brand: cellText(raw.brand) || null, model: cellText(raw.model) || null, serial_number: cellText(raw.serial_number) || null,
            origin: cellText(raw.origin) || null, manufacture_year: parseNumber(raw.manufacture_year), unit: cellText(raw.unit) || 'Chiếc',
            cpu: cellText(raw.cpu) || null, ram: cellText(raw.ram) || null, storage: cellText(raw.storage) || null, os: cellText(raw.os) || null,
            hostname: cellText(raw.hostname) || null, ip_address: cellText(raw.ip_address) || null, mac_address: cellText(raw.mac_address) || null,
            specs: cellText(raw.specs) || null,
            supplier_id: findOrCreate('suppliers', raw.supplier_name),
            funding_source_id: findOrCreate('funding_sources', raw.funding_name),
            invoice_no: cellText(raw.invoice_no) || null, contract_no: cellText(raw.contract_no) || null,
            purchase_date: parseDate(raw.purchase_date), in_use_date: parseDate(raw.in_use_date),
            original_price: parseNumber(raw.original_price) || 0,
            depreciation_years: parseNumber(raw.depreciation_years) ?? cat?.depreciation_years ?? null,
            warranty_months: parseNumber(raw.warranty_months),
            status: matchLabel(DEVICE_STATUS, raw.status_label, 'in_stock'),
            condition: matchLabel(CONDITIONS, raw.condition_label, 'good'),
            department_id: findOrCreate('departments', raw.department_name),
            assigned_to: cellText(raw.assigned_to) || null, location: cellText(raw.location) || null, note: cellText(raw.note) || null,
          };
          d.warranty_end = d.warranty_months && d.purchase_date ? addMonths(d.purchase_date, d.warranty_months) : null;
          const code = cellText(raw.asset_code);
          const existing = code ? get('SELECT id FROM devices WHERE asset_code = ? AND deleted_at IS NULL', code) : null;
          if (existing) {
            update('devices', existing.id, { ...d, updated_at: new Date().toLocaleString('sv-SE') });
            addHistory(req, existing.id, 'Cập nhật', 'Cập nhật từ tệp Excel');
            result.updated++;
          } else {
            const id = insert('devices', { ...d, asset_code: code || nextAssetCode(cat?.prefix), created_by: req.user.id });
            addHistory(req, id, 'Tạo mới', 'Nhập từ tệp Excel');
            result.created++;
          }
        } catch (e) {
          result.errors.push(`Dòng ${rowNo}: ${e.message}`);
        }
      });
      if (dryRun || result.errors.length) throw Object.assign(new Error('rollback'), { rollback: true });
    });
  } catch (e) {
    if (!e.rollback) throw e;
    if (!dryRun) result.created = result.updated = 0;
  }
  if (!dryRun && !result.errors.length) audit(req, 'Nhập Excel thiết bị', 'device', null, `Thêm ${result.created}, cập nhật ${result.updated}`);
  res.json({ ...result, dry_run: dryRun });
});

router.get('/next-code', (req, res) => {
  const cat = req.query.category_id ? get('SELECT prefix FROM categories WHERE id = ?', req.query.category_id) : null;
  res.json({ code: nextAssetCode(cat?.prefix) });
});

function loadDevice(req, idOrCode, byCode = false) {
  const scope = scopeWhere(req.user);
  const row = get(`${BASE_SELECT} WHERE ${byCode ? 'v.asset_code = ?' : 'v.id = ?'} AND v.deleted_at IS NULL${scope.sql}`, idOrCode, ...scope.params);
  if (!row) throw new HttpError(404, 'Không tìm thấy thiết bị hoặc bạn không có quyền xem');
  return withComputed([row], getSettings())[0];
}

router.get('/by-code/:code', (req, res) => res.json(loadDevice(req, req.params.code, true)));

router.get('/:id', (req, res) => {
  const d = loadDevice(req, req.params.id);
  d.children = all('SELECT id, asset_code, name, status FROM devices WHERE parent_id = ? AND deleted_at IS NULL', d.id);
  res.json(d);
});

router.get('/:id/history', (req, res) => {
  loadDevice(req, req.params.id);
  res.json(all('SELECT * FROM device_history WHERE device_id = ? ORDER BY id DESC', req.params.id));
});

router.get('/:id/related', (req, res) => {
  loadDevice(req, req.params.id);
  const id = req.params.id;
  res.json({
    repairs: all(`SELECT r.id, r.code, r.report_date, r.problem, r.status, r.cost, r.finish_date, u.full_name AS technician_name
                    FROM repairs r LEFT JOIN users u ON u.id = r.technician_id WHERE r.device_id = ? ORDER BY r.id DESC`, id),
    maintenances: all('SELECT * FROM maintenances WHERE device_id = ? ORDER BY scheduled_date DESC', id),
    licenses: all(`SELECT l.id, l.name, l.version, l.license_type, l.expiry_date, a.assigned_at
                     FROM license_assignments a JOIN licenses l ON l.id = a.license_id WHERE a.device_id = ?`, id),
    allocations: all(`SELECT a.id, a.code, a.type, a.doc_date, a.receiver_person, d.name AS to_department_name
                        FROM allocation_items i JOIN allocations a ON a.id = i.allocation_id
                        LEFT JOIN departments d ON d.id = a.to_department_id WHERE i.device_id = ? ORDER BY a.doc_date DESC, a.id DESC`, id),
  });
});

function prepare(body, existing) {
  const data = pick(body, DEVICE_FIELDS);
  for (const k of ['original_price', 'depreciation_years', 'warranty_months', 'manufacture_year', 'category_id', 'supplier_id', 'funding_source_id', 'department_id', 'parent_id']) {
    if (data[k] != null) {
      const n = Number(data[k]);
      if (isNaN(n)) throw new HttpError(400, `Giá trị không hợp lệ: ${k}`);
      data[k] = n;
    }
  }
  if (data.original_price != null && data.original_price < 0) throw new HttpError(400, 'Nguyên giá không được âm');
  if (data.status && !DEVICE_STATUS[data.status]) throw new HttpError(400, 'Trạng thái không hợp lệ');
  if (data.condition && !CONDITIONS[data.condition]) throw new HttpError(400, 'Tình trạng không hợp lệ');
  if (data.ip_address && !/^[0-9a-fA-F:.,\s/]+$/.test(data.ip_address)) throw new HttpError(400, 'Địa chỉ IP không hợp lệ');
  const merged = { ...existing, ...data };
  if (merged.category_id && (merged.depreciation_years == null || merged.depreciation_years === '')) {
    data.depreciation_years = get('SELECT depreciation_years FROM categories WHERE id = ?', merged.category_id)?.depreciation_years ?? null;
  }
  if (!('warranty_end' in data) || !data.warranty_end) {
    if (merged.warranty_months && merged.purchase_date) data.warranty_end = addMonths(merged.purchase_date, merged.warranty_months);
  }
  if (existing && data.parent_id === existing.id) throw new HttpError(400, 'Thiết bị cha không hợp lệ');
  return data;
}

router.post('/', requirePerm('device.write'), (req, res) => {
  const data = prepare(req.body, null);
  required(data, { name: 'Tên thiết bị' });
  const qty = Math.min(200, Math.max(1, parseInt(req.body.quantity) || 1));
  const cat = data.category_id ? get('SELECT prefix FROM categories WHERE id = ?', data.category_id) : null;
  const ids = tx(() => {
    const out = [];
    for (let i = 0; i < qty; i++) {
      const row = { ...data };
      if (!row.asset_code || i > 0) row.asset_code = nextAssetCode(cat?.prefix);
      if (i > 0) row.serial_number = null;
      if (get('SELECT 1 FROM devices WHERE asset_code = ?', row.asset_code)) throw new HttpError(400, `Mã tài sản ${row.asset_code} đã tồn tại`);
      const id = insert('devices', { ...row, status: row.status || 'in_stock', created_by: req.user.id });
      addHistory(req, id, 'Tạo mới', `Ghi tăng thiết bị${row.original_price ? `, nguyên giá ${Number(row.original_price).toLocaleString('vi-VN')} đ` : ''}`);
      out.push(id);
    }
    return out;
  });
  audit(req, 'Thêm thiết bị', 'device', ids[0], `${data.name}${qty > 1 ? ` (x${qty})` : ''}`);
  res.json({ id: ids[0], ids });
});

const TRACKED = {
  status: ['Trạng thái', (v) => labelOf(DEVICE_STATUS, v)],
  condition: ['Tình trạng', (v) => labelOf(CONDITIONS, v)],
  department_id: ['Phòng ban', (v) => (v ? get('SELECT name FROM departments WHERE id = ?', v)?.name : 'Kho')],
  assigned_to: ['Người sử dụng', (v) => v || '(trống)'],
  location: ['Vị trí', (v) => v || '(trống)'],
  original_price: ['Nguyên giá', (v) => Number(v || 0).toLocaleString('vi-VN') + ' đ'],
  ip_address: ['Địa chỉ IP', (v) => v || '(trống)'],
  ram: ['RAM', (v) => v || '(trống)'],
  storage: ['Ổ cứng', (v) => v || '(trống)'],
  cpu: ['CPU', (v) => v || '(trống)'],
  os: ['Hệ điều hành', (v) => v || '(trống)'],
};

export function describeChanges(before, after) {
  const out = [];
  for (const [k, [label, fmt]] of Object.entries(TRACKED)) {
    if (k in after && String(before[k] ?? '') !== String(after[k] ?? '')) out.push(`${label}: ${fmt(before[k])} → ${fmt(after[k])}`);
  }
  return out;
}

router.put('/:id', requirePerm('device.write'), (req, res) => {
  const existing = get('SELECT * FROM devices WHERE id = ? AND deleted_at IS NULL', req.params.id);
  if (!existing) throw new HttpError(404, 'Không tìm thấy thiết bị');
  const data = prepare(req.body, existing);
  if (data.asset_code && data.asset_code !== existing.asset_code && get('SELECT 1 FROM devices WHERE asset_code = ? AND id <> ?', data.asset_code, existing.id)) {
    throw new HttpError(400, 'Mã tài sản đã tồn tại');
  }
  if ('name' in data && !data.name) throw new HttpError(400, 'Vui lòng nhập: Tên thiết bị');
  const changes = describeChanges(existing, data);
  tx(() => {
    update('devices', existing.id, { ...data, updated_at: new Date().toLocaleString('sv-SE') });
    addHistory(req, existing.id, 'Cập nhật', changes.length ? changes.join('; ') : 'Cập nhật thông tin');
  });
  audit(req, 'Sửa thiết bị', 'device', existing.id, `${existing.asset_code}${changes.length ? ': ' + changes.join('; ') : ''}`);
  res.json({ ok: true });
});

router.post('/bulk', requirePerm('device.write'), (req, res) => {
  const ids = (req.body.ids || []).map(Number).filter(Boolean);
  if (!ids.length) throw new HttpError(400, 'Chưa chọn thiết bị');
  const data = pick(req.body.data || {}, ['status', 'condition', 'location', 'funding_source_id', 'category_id']);
  if (data.status && !DEVICE_STATUS[data.status]) throw new HttpError(400, 'Trạng thái không hợp lệ');
  if (data.condition && !CONDITIONS[data.condition]) throw new HttpError(400, 'Tình trạng không hợp lệ');
  if (!Object.keys(data).length) throw new HttpError(400, 'Chưa chọn thông tin cần cập nhật');
  tx(() => {
    for (const id of ids) {
      const before = get('SELECT * FROM devices WHERE id = ? AND deleted_at IS NULL', id);
      if (!before) continue;
      const changes = describeChanges(before, data);
      update('devices', id, { ...data, updated_at: new Date().toLocaleString('sv-SE') });
      addHistory(req, id, 'Cập nhật hàng loạt', changes.join('; ') || 'Cập nhật thông tin');
    }
  });
  audit(req, 'Cập nhật hàng loạt thiết bị', 'device', null, `${ids.length} thiết bị: ${JSON.stringify(data)}`);
  res.json({ ok: true, count: ids.length });
});

router.delete('/:id', requirePerm('device.delete'), (req, res) => {
  const d = get('SELECT * FROM devices WHERE id = ? AND deleted_at IS NULL', req.params.id);
  if (!d) throw new HttpError(404, 'Không tìm thấy thiết bị');
  const refs = get(`SELECT (SELECT COUNT(*) FROM allocation_items WHERE device_id = ?) + (SELECT COUNT(*) FROM repairs WHERE device_id = ?)
                    + (SELECT COUNT(*) FROM disposal_items WHERE device_id = ?) + (SELECT COUNT(*) FROM inventory_items WHERE device_id = ?) AS n`,
  d.id, d.id, d.id, d.id).n;
  if (refs && req.user.role !== 'admin') {
    throw new HttpError(400, 'Thiết bị đã phát sinh chứng từ (cấp phát, sửa chữa, kiểm kê, thanh lý). Chỉ quản trị hệ thống mới được xóa. Nên dùng chức năng Thanh lý.');
  }
  tx(() => {
    run("UPDATE devices SET deleted_at = datetime('now','localtime'), asset_code = asset_code || '#DEL' || id WHERE id = ?", d.id);
    run('UPDATE devices SET parent_id = NULL WHERE parent_id = ?', d.id);
    run('DELETE FROM license_assignments WHERE device_id = ?', d.id);
    addHistory(req, d.id, 'Xóa', 'Xóa thiết bị khỏi hệ thống');
  });
  audit(req, 'Xóa thiết bị', 'device', d.id, `${d.asset_code} - ${d.name}`);
  res.json({ ok: true });
});
