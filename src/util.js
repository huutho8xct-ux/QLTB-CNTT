import ExcelJS from 'exceljs';
import { get, run } from './db.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function addMonths(dateStr, months) {
  if (!dateStr || !months) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return null;
  const day = d.getDate();
  d.setMonth(d.getMonth() + Number(months));
  if (d.getDate() !== day) d.setDate(0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + Number(days));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Lấy các trường cho phép từ body, chuỗi rỗng -> null */
export function pick(body, fields) {
  const out = {};
  for (const f of fields) {
    if (body[f] === undefined) continue;
    let v = body[f];
    if (typeof v === 'string') {
      v = v.trim();
      if (v === '') v = null;
    }
    out[f] = v;
  }
  return out;
}

export function required(obj, fields) {
  for (const [f, label] of Object.entries(fields)) {
    if (obj[f] == null || obj[f] === '') throw new HttpError(400, `Vui lòng nhập: ${label}`);
  }
}

export function insert(table, data) {
  const keys = Object.keys(data);
  const r = run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => data[k]));
  return Number(r.lastInsertRowid);
}

export function update(table, id, data) {
  const keys = Object.keys(data);
  if (!keys.length) return;
  run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => data[k]), id);
}

export function pageParams(q) {
  const page = Math.max(1, parseInt(q.page) || 1);
  const pageSize = Math.min(1000, Math.max(1, parseInt(q.pageSize) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function likeParam(s) {
  return `%${String(s).trim().replace(/[\\%_]/g, (m) => '\\' + m)}%`;
}

export function audit(req, action, entity, entityId, detail) {
  try {
    run(
      'INSERT INTO audit_logs(user_id, username, action, entity, entity_id, detail, ip) VALUES (?,?,?,?,?,?,?)',
      req?.user?.id ?? null,
      req?.user?.username ?? req?.body?.username ?? null,
      action,
      entity ?? null,
      entityId ?? null,
      typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : null,
      req?.ip ?? null
    );
  } catch (e) {
    console.error('Lỗi ghi nhật ký:', e.message);
  }
}

export function addHistory(req, deviceId, action, description, refType = null, refId = null) {
  run(
    'INSERT INTO device_history(device_id, action, description, ref_type, ref_id, user_id, user_name) VALUES (?,?,?,?,?,?,?)',
    deviceId, action, description, refType, refId, req?.user?.id ?? null, req?.user?.full_name ?? null
  );
}

/** Sinh số chứng từ: PREFIX-YYYY-0001 */
export function nextCode(table, prefix, date) {
  const year = (date || today()).slice(0, 4);
  const p = `${prefix}-${year}-`;
  const r = get(`SELECT code FROM ${table} WHERE code LIKE ? ORDER BY code DESC LIMIT 1`, p + '%');
  const n = r ? parseInt(r.code.slice(p.length)) + 1 : 1;
  return p + String(n).padStart(4, '0');
}

/** Sinh mã tài sản: PREFIX.00001 theo loại thiết bị */
export function nextAssetCode(prefix) {
  prefix = (prefix || 'TB').toUpperCase();
  const p = `${prefix}.`;
  const rows = get(
    `SELECT MAX(CAST(substr(asset_code, ?) AS INTEGER)) AS n FROM devices WHERE asset_code LIKE ? AND substr(asset_code, ?) GLOB '[0-9]*'`,
    p.length + 1, p + '%', p.length + 1
  );
  return p + String((rows?.n || 0) + 1).padStart(5, '0');
}

/**
 * Xuất Excel chuẩn có tiêu đề đơn vị
 * columns: [{key, label, width, type: 'money'|'number'|'date'|'text'}]
 */
export async function sendXlsx(res, { filename, title, subtitle, columns, rows, settings, totals }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'QLTB-CNTT';
  wb.created = new Date();
  const ws = wb.addWorksheet('Dữ liệu', { views: [{ state: 'frozen', ySplit: 6 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  const n = columns.length + 1;
  const colLetter = (i) => {
    let s = '';
    for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  };
  const last = colLetter(n - 1);
  ws.mergeCells(`A1:${colLetter(Math.max(1, Math.floor(n / 2) - 1))}1`);
  ws.getCell('A1').value = (settings?.org_parent || '').toUpperCase();
  ws.mergeCells(`A2:${colLetter(Math.max(1, Math.floor(n / 2) - 1))}2`);
  ws.getCell('A2').value = (settings?.org_name || '').toUpperCase();
  ws.getCell('A2').font = { bold: true };
  ws.mergeCells(`A4:${last}4`);
  ws.getCell('A4').value = title;
  ws.getCell('A4').font = { bold: true, size: 14 };
  ws.getCell('A4').alignment = { horizontal: 'center' };
  ws.mergeCells(`A5:${last}5`);
  ws.getCell('A5').value = subtitle || `Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`;
  ws.getCell('A5').font = { italic: true };
  ws.getCell('A5').alignment = { horizontal: 'center' };

  const header = ws.getRow(6);
  header.values = ['STT', ...columns.map((c) => c.label)];
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 32;
  header.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
  });
  ws.getColumn(1).width = 6;
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 2);
    col.width = c.width || (c.type === 'money' ? 16 : c.type === 'date' ? 12 : 20);
    if (c.type === 'money') col.numFmt = '#,##0';
    if (c.type === 'number') col.numFmt = '#,##0.##';
  });
  rows.forEach((r, idx) => {
    const vals = columns.map((c) => {
      const v = r[c.key];
      if (v == null || v === '') return null;
      if (c.type === 'money' || c.type === 'number') return Number(v);
      if (c.type === 'date' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
        const [y, m, d] = v.slice(0, 10).split('-');
        return `${d}/${m}/${y}`;
      }
      return v;
    });
    ws.addRow([idx + 1, ...vals]);
  });
  if (totals) {
    const tr = ws.addRow(['', ...columns.map((c, i) => (i === 0 ? 'TỔNG CỘNG' : totals[c.key] ?? null))]);
    tr.font = { bold: true };
  }
  const end = ws.rowCount;
  for (let r = 6; r <= end; r++) {
    ws.getRow(r).eachCell({ includeEmpty: true }, (c) => {
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      if (r > 6) c.alignment = { vertical: 'top', wrapText: true };
    });
  }
  const sig = end + 2;
  ws.mergeCells(`${colLetter(Math.max(0, n - 4))}${sig}:${last}${sig}`);
  ws.getCell(`${colLetter(Math.max(0, n - 4))}${sig}`).value = `${settings?.org_city || ''}, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`;
  ws.getCell(`${colLetter(Math.max(0, n - 4))}${sig}`).alignment = { horizontal: 'center' };
  ws.getCell(`${colLetter(Math.max(0, n - 4))}${sig}`).font = { italic: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  await wb.xlsx.write(res);
  res.end();
}
