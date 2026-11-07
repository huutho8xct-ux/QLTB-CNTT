import { api } from '../api.js';
import { state, navigate, setQuery } from '../app.js';
import { $, esc, fmtDate, fmtMoney, fmtNum, options, toastError, todayStr } from '../ui.js';
import { printReport } from '../print.js';

const DESCRIPTIONS = {
  'asset-register': ['📒', 'Sổ theo dõi tài sản: nguyên giá, hao mòn lũy kế, giá trị còn lại tại thời điểm chọn'],
  depreciation: ['🧮', 'Bảng tính hao mòn TSCĐ trong năm: lũy kế đầu năm, phát sinh, cuối năm'],
  'by-department': ['🏢', 'Tổng hợp số lượng, giá trị thiết bị theo từng phòng ban'],
  'by-category': ['🗂️', 'Tổng hợp số lượng, giá trị theo loại thiết bị'],
  'by-funding': ['💰', 'Tổng hợp theo nguồn vốn hình thành tài sản'],
  increase: ['📈', 'Tình hình tăng (mua sắm, tiếp nhận) và giảm (thanh lý) trong kỳ'],
  repairs: ['🛠️', 'Danh sách, chi phí và thời gian xử lý sửa chữa trong kỳ'],
  warranty: ['🛡️', 'Thiết bị còn / sắp hết / đã hết bảo hành'],
  aging: ['⏳', 'Thiết bị theo số năm sử dụng, đề xuất thay thế phục vụ lập kế hoạch mua sắm'],
  allocations: ['🔁', 'Sổ theo dõi cấp phát, điều chuyển, thu hồi trong kỳ'],
  network: ['🌐', 'Danh sách thiết bị theo IP/MAC, phát hiện trùng địa chỉ IP'],
};

const PARAM_INPUT = {
  as_of: (v) => `<label>Tính đến ngày <input type="date" name="as_of" value="${esc(v || todayStr())}"></label>`,
  year: (v) => `<label>Năm <input type="number" name="year" style="width:100px" value="${esc(v || new Date().getFullYear())}"></label>`,
  from: (v) => `<label>Từ ngày <input type="date" name="from" value="${esc(v || `${new Date().getFullYear()}-01-01`)}"></label>`,
  to: (v) => `<label>Đến ngày <input type="date" name="to" value="${esc(v || todayStr())}"></label>`,
  department_id: (v) => `<select name="department_id">${options(state.cat.departments, { selected: v, empty: 'Tất cả phòng ban' })}</select>`,
  category_id: (v) => `<select name="category_id">${options(state.cat.categories, { selected: v, empty: 'Tất cả loại' })}</select>`,
  funding_source_id: (v) => `<select name="funding_source_id">${options(state.cat.funding, { selected: v, empty: 'Tất cả nguồn vốn' })}</select>`,
  fixed_only: (v) => `<label class="check"><input type="checkbox" name="fixed_only" value="1" ${v === '1' ? 'checked' : ''}> Chỉ TSCĐ (≥ ${fmtMoney(state.settings.fixed_asset_threshold)} đ)</label>`,
  warranty: (v) => `<select name="warranty">${options([{ id: 'active', name: 'Còn bảo hành' }, { id: 'expiring', name: 'Sắp hết (90 ngày)' }, { id: 'expired', name: 'Đã hết bảo hành' }], { selected: v, empty: 'Tất cả' })}</select>`,
  min_years: (v) => `<label>Sử dụng từ <input type="number" name="min_years" style="width:80px" min="0" value="${esc(v ?? '0')}"> năm</label>`,
};

export default async function reports(ctx) {
  const list = await api.get('/reports');
  if (ctx.view !== 'view') {
    ctx.setTitle('Báo cáo - Thống kê');
    ctx.el.innerHTML = `<div class="page-head"><h2>Báo cáo - Thống kê</h2></div>
      <div class="report-list">${list.map((r) => `<a class="card" href="#/reports/${r.key}"><b>${DESCRIPTIONS[r.key]?.[0] || '📄'} ${esc(r.title.charAt(0) + r.title.slice(1).toLowerCase())}</b><span>${esc(DESCRIPTIONS[r.key]?.[1] || '')}</span></a>`).join('')}</div>`;
    return;
  }
  const def = list.find((r) => r.key === ctx.params.key);
  if (!def) return navigate('/reports');
  ctx.setTitle('Báo cáo');
  const q = { ...ctx.query };
  ctx.el.innerHTML = `
    <div class="page-head"><h2>${esc(def.title.charAt(0) + def.title.slice(1).toLowerCase())}</h2><a class="btn" href="#/reports">← Danh sách báo cáo</a></div>
    <div class="card"><div class="card-body" style="padding-bottom:0"><form class="toolbar" id="pf">
      ${def.params.map((p) => PARAM_INPUT[p]?.(q[p]) || '').join('')}
      <button class="btn btn-primary" type="submit">Xem báo cáo</button><span class="spacer"></span>
      <button class="btn" type="button" id="bXlsx">⬇️ Xuất Excel</button><button class="btn" type="button" id="bPrint">🖨️ In</button>
    </form></div><div id="out"><div class="empty">Đang tải...</div></div></div>`;
  let data = null;
  const params = () => {
    const f = $('#pf', ctx.el);
    const p = {};
    for (const el of f.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') { if (el.checked) p[el.name] = el.value; } else if (el.value) p[el.name] = el.value;
    }
    return p;
  };
  const cell = (c, v) => {
    if (v == null || v === '') return '<td></td>';
    if (c.type === 'money') return `<td class="num">${fmtMoney(v)}</td>`;
    if (c.type === 'number') return `<td class="num">${fmtNum(v)}</td>`;
    if (c.type === 'date') return `<td class="nowrap">${fmtDate(v)}</td>`;
    if (c.key === 'asset_code') return `<td class="nowrap"><b>${esc(v)}</b></td>`;
    if (c.key === 'conflict' || c.key === 'suggestion') return `<td>${v ? `<span class="badge badge-${v === 'Theo dõi' ? 'orange' : 'red'}">${esc(v)}</span>` : ''}</td>`;
    return `<td>${esc(v)}</td>`;
  };
  const load = async () => {
    const p = params();
    setQuery(p);
    try {
      data = await api.get(`/reports/${def.key}`, p);
    } catch (e) { toastError(e); return; }
    if (!ctx.isCurrent()) return;
    $('#out', ctx.el).innerHTML = `<div class="card-body" style="padding-top:8px"><div class="text-muted">${esc(data.subtitle || '')} · ${data.rows.length} dòng</div></div>
      <div class="table-wrap" style="max-height:70vh"><table class="table">
      <thead><tr><th>STT</th>${data.columns.map((c) => `<th class="${['money', 'number'].includes(c.type) ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${data.rows.map((r, i) => `<tr><td>${i + 1}</td>${data.columns.map((c) => cell(c, r[c.key])).join('')}</tr>`).join('')}</tbody>
      ${data.totals ? `<tfoot><tr><td></td>${data.columns.map((c, i) => (i === 0 ? '<td>TỔNG CỘNG</td>' : data.totals[c.key] != null ? cell(c, data.totals[c.key]) : '<td></td>')).join('')}</tr></tfoot>` : ''}
      </table>${data.rows.length ? '' : '<div class="empty">Không có dữ liệu</div>'}</div>`;
  };
  $('#pf', ctx.el).addEventListener('submit', (e) => { e.preventDefault(); load(); });
  $('#bXlsx', ctx.el).addEventListener('click', () => api.download(`/reports/${def.key}`, { ...params(), format: 'xlsx' }).catch(toastError));
  $('#bPrint', ctx.el).addEventListener('click', () => data && printReport(data));
  await load();
}
