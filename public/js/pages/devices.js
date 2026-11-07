import { api } from '../api.js';
import { state, navigate, setQuery } from '../app.js';
import { DEVICE_STATUS, CONDITIONS, REPAIR_STATUS, MAINT_STATUS, ALLOCATION_TYPES, LICENSE_TYPE, can, labelOf } from '../constants.js';
import {
  $, $$, esc, fmtMoney, fmtDate, fmtDateTime, statusBadge, badge, toast, toastError, confirmDialog, modal, options, mapOptions,
  renderForm, bindForm, collectForm, pager, bindPager, debounce, formModal, todayStr,
} from '../ui.js';
import { printDeviceCard, printLabels, qrUrl } from '../print.js';

export default async function devices(ctx) {
  if (ctx.view === 'form') return form(ctx);
  if (ctx.view === 'detail') return detail(ctx, ctx.params.id);
  if (ctx.view === 'byCode') {
    const d = await api.get(`/devices/by-code/${encodeURIComponent(ctx.params.code)}`);
    history.replaceState(null, '', `#/devices/${d.id}`);
    return detail(ctx, d.id);
  }
  return list(ctx);
}

/* =================== DANH SÁCH =================== */
async function list(ctx) {
  ctx.setTitle('Danh sách thiết bị');
  const u = state.user;
  const q = { page: 1, pageSize: 20, sort: 'updated_at', order: 'desc', ...ctx.query };
  q.page = Number(q.page);
  q.pageSize = Number(q.pageSize);
  const selected = new Set();
  const viewAll = can(u, 'view.all');

  ctx.el.innerHTML = `
    <div class="page-head">
      <h2>Danh sách thiết bị</h2>
      ${can(u, 'device.write') ? `<a class="btn btn-primary" href="#/devices/new">＋ Thêm thiết bị</a><button class="btn" id="btnImport">⬆️ Nhập Excel</button>` : ''}
      <button class="btn" id="btnExport">⬇️ Xuất Excel</button>
    </div>
    <div class="card">
      <div class="card-body" style="padding-bottom:0">
        <div class="toolbar">
          <input class="search" type="search" id="fQ" placeholder="🔍 Tìm mã, tên, serial, IP, người sử dụng..." value="${esc(q.q || '')}">
          <select id="fCat">${options(state.cat.categories, { selected: q.category_id, empty: 'Tất cả loại' })}</select>
          ${viewAll ? `<select id="fDept"><option value="">Tất cả phòng ban</option><option value="none" ${q.department_id === 'none' ? 'selected' : ''}>— Kho (chưa cấp phát)</option>${options(state.cat.departments, { selected: q.department_id })}</select>` : ''}
          <select id="fStatus">${mapOptions(DEVICE_STATUS, q.status, 'Trạng thái (trừ đã thanh lý)')}</select>
          <select id="fWarranty">${options([{ id: 'active', name: 'Còn bảo hành' }, { id: 'expiring', name: 'Sắp hết bảo hành' }, { id: 'expired', name: 'Hết bảo hành' }], { selected: q.warranty, empty: 'Bảo hành: tất cả' })}</select>
          ${viewAll ? `<select id="fFund">${options(state.cat.funding, { selected: q.funding_source_id, empty: 'Tất cả nguồn vốn' })}</select>` : ''}
          <button class="btn btn-ghost" id="btnReset">↺ Xóa lọc</button>
        </div>
        <div class="toolbar hidden" id="bulkBar">
          <b id="selCount"></b>
          <button class="btn btn-sm" id="btnLabels">🏷️ In tem QR</button>
          ${can(u, 'device.write') ? '<button class="btn btn-sm" id="btnBulk">✏️ Cập nhật hàng loạt</button>' : ''}
          ${can(u, 'allocation.write') ? '<button class="btn btn-sm" id="btnAlloc">🔁 Lập phiếu bàn giao</button>' : ''}
          ${can(u, 'disposal.write') ? '<button class="btn btn-sm" id="btnDispose">♻️ Đề nghị thanh lý</button>' : ''}
          <button class="btn btn-sm btn-ghost" id="btnClearSel">Bỏ chọn</button>
        </div>
      </div>
      <div id="tbl"></div>
    </div>`;

  const sortTh = (key, label, cls = '') => `<th class="sortable ${cls}" data-sort="${key}">${label}${q.sort === key ? (q.order === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;

  const load = async () => {
    setQuery({ ...q, page: q.page > 1 ? q.page : '', pageSize: q.pageSize !== 20 ? q.pageSize : '', sort: q.sort !== 'updated_at' ? q.sort : '', order: q.order !== 'desc' ? q.order : '' });
    const data = await api.get('/devices', q);
    if (!ctx.isCurrent()) return;
    const tbl = $('#tbl', ctx.el);
    tbl.innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr><th style="width:30px"><input type="checkbox" id="chkAll"></th>
          ${sortTh('asset_code', 'Mã TS')}${sortTh('name', 'Tên thiết bị')}${sortTh('category', 'Loại')}${sortTh('department', 'Phòng ban / Người SD')}
          ${sortTh('status', 'Trạng thái')}${viewAll ? sortTh('original_price', 'Nguyên giá', 'num') + '<th class="num">GT còn lại</th>' : ''}${sortTh('warranty_end', 'Bảo hành')}
        </tr></thead>
        <tbody>${data.rows.map((d) => `
          <tr class="${selected.has(d.id) ? 'selected' : ''}">
            <td><input type="checkbox" data-id="${d.id}" ${selected.has(d.id) ? 'checked' : ''}></td>
            <td class="nowrap"><a href="#/devices/${d.id}"><b>${esc(d.asset_code)}</b></a></td>
            <td><a href="#/devices/${d.id}" style="color:inherit">${esc(d.name)}</a><div class="muted">${esc([d.brand, d.model, d.serial_number && 'SN: ' + d.serial_number, d.ip_address].filter(Boolean).join(' · '))}</div></td>
            <td>${esc(d.category_name || '')}</td>
            <td>${esc(d.department_name || 'Kho')}<div class="muted">${esc([d.assigned_to, d.location].filter(Boolean).join(' · '))}</div></td>
            <td>${statusBadge(d.status)}${d.condition && d.condition !== 'good' && d.condition !== 'new' ? `<div class="muted">${esc(labelOf(CONDITIONS, d.condition))}</div>` : ''}</td>
            ${viewAll ? `<td class="num">${fmtMoney(d.original_price)}</td><td class="num">${fmtMoney(d.remaining)}</td>` : ''}
            <td class="nowrap">${d.warranty_end ? (d.warranty_end < todayStr() ? `<span class="text-muted">${fmtDate(d.warranty_end)}</span>` : `<span class="text-green">${fmtDate(d.warranty_end)}</span>`) : ''}</td>
          </tr>`).join('')}</tbody>
        ${viewAll && data.rows.length ? `<tfoot><tr><td colspan="6">Tổng nguyên giá theo bộ lọc</td><td class="num">${fmtMoney(data.sum_price)}</td><td colspan="2"></td></tr></tfoot>` : ''}
      </table>${data.rows.length ? '' : '<div class="empty">Không có thiết bị nào phù hợp</div>'}</div>
      ${pager(data.total, data.page, data.pageSize)}`;
    bindPager(tbl, (p) => { Object.assign(q, p); load(); });
    $$('[data-sort]', tbl).forEach((th) => th.addEventListener('click', () => {
      const k = th.dataset.sort;
      q.order = q.sort === k && q.order === 'asc' ? 'desc' : 'asc';
      q.sort = k;
      load();
    }));
    $$('input[data-id]', tbl).forEach((c) => c.addEventListener('change', () => {
      const id = Number(c.dataset.id);
      c.checked ? selected.add(id) : selected.delete(id);
      c.closest('tr').classList.toggle('selected', c.checked);
      updateBulk();
    }));
    $('#chkAll', tbl).addEventListener('change', (e) => {
      $$('input[data-id]', tbl).forEach((c) => {
        c.checked = e.target.checked;
        const id = Number(c.dataset.id);
        e.target.checked ? selected.add(id) : selected.delete(id);
        c.closest('tr').classList.toggle('selected', c.checked);
      });
      updateBulk();
    });
  };

  const updateBulk = () => {
    $('#bulkBar', ctx.el).classList.toggle('hidden', !selected.size);
    $('#selCount', ctx.el).textContent = `Đã chọn ${selected.size} thiết bị:`;
  };

  const bindFilter = (id, key, ev = 'change') => {
    const el = $(id, ctx.el);
    if (!el) return;
    el.addEventListener(ev, () => { q[key] = el.value; q.page = 1; load(); });
  };
  $('#fQ', ctx.el).addEventListener('input', debounce(() => { q.q = $('#fQ', ctx.el).value; q.page = 1; load(); }, 350));
  bindFilter('#fCat', 'category_id');
  bindFilter('#fDept', 'department_id');
  bindFilter('#fStatus', 'status');
  bindFilter('#fWarranty', 'warranty');
  bindFilter('#fFund', 'funding_source_id');
  $('#btnReset', ctx.el).addEventListener('click', () => { history.replaceState(null, '', '#/devices'); list({ ...ctx, query: {} }); });
  $('#btnExport', ctx.el).addEventListener('click', () => api.download('/devices/export', { ...q, ids: selected.size ? [...selected].join(',') : '' }).catch(toastError));
  $('#btnImport', ctx.el)?.addEventListener('click', () => importDialog(load));
  $('#btnClearSel', ctx.el).addEventListener('click', () => { selected.clear(); updateBulk(); load(); });
  $('#btnLabels', ctx.el).addEventListener('click', async () => {
    const data = await api.get('/devices', { ids: [...selected].join(','), pageSize: 1000, include_disposed: 1, sort: 'asset_code', order: 'asc' });
    printLabels(data.rows);
  });
  $('#btnBulk', ctx.el)?.addEventListener('click', () => bulkDialog([...selected], load));
  $('#btnAlloc', ctx.el)?.addEventListener('click', () => navigate(`/allocations/new?ids=${[...selected].join(',')}`));
  $('#btnDispose', ctx.el)?.addEventListener('click', () => navigate(`/disposals/new?ids=${[...selected].join(',')}`));
  await load();
}

function bulkDialog(ids, reload) {
  formModal({
    title: `Cập nhật hàng loạt ${ids.length} thiết bị`,
    size: '',
    fields: [
      { type: 'html', html: '<div class="alert alert-info">Chỉ những trường được chọn giá trị mới được cập nhật. Để thay đổi phòng ban, hãy lập phiếu Cấp phát/Điều chuyển.</div>' },
      { name: 'status', label: 'Trạng thái', type: 'select', options: mapOptions(DEVICE_STATUS, '', '-- Giữ nguyên --'), col: 6 },
      { name: 'condition', label: 'Tình trạng', type: 'select', options: mapOptions(CONDITIONS, '', '-- Giữ nguyên --'), col: 6 },
      { name: 'category_id', label: 'Loại thiết bị', type: 'select', options: options(state.cat.categories, { empty: '-- Giữ nguyên --' }), col: 6 },
      { name: 'funding_source_id', label: 'Nguồn vốn', type: 'select', options: options(state.cat.funding, { empty: '-- Giữ nguyên --' }), col: 6 },
      { name: 'location', label: 'Vị trí đặt', placeholder: 'Để trống nếu giữ nguyên' },
    ],
    onSubmit: async (data) => {
      const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v != null && v !== ''));
      await api.post('/devices/bulk', { ids, data: clean });
      toast(`Đã cập nhật ${ids.length} thiết bị`);
      reload();
    },
  });
}

function importDialog(reload) {
  const m = modal({
    title: 'Nhập danh sách thiết bị từ Excel',
    size: 'lg',
    body: `
      <ol style="line-height:1.8;margin-top:0">
        <li>Tải <button class="link-btn" id="dlTpl">tệp mẫu Excel</button> và nhập dữ liệu theo đúng các cột.</li>
        <li>Chọn tệp đã nhập, bấm <b>Kiểm tra</b> để rà soát lỗi trước.</li>
        <li>Bấm <b>Nhập dữ liệu</b> để ghi vào hệ thống. Thiết bị có mã tài sản trùng sẽ được cập nhật.</li>
      </ol>
      <input type="file" id="impFile" accept=".xlsx">
      <div id="impResult" style="margin-top:12px"></div>`,
    footer: '<button class="btn" data-close>Đóng</button><button class="btn" id="impCheck">Kiểm tra</button><button class="btn btn-primary" id="impRun">Nhập dữ liệu</button>',
  });
  $('#dlTpl', m.el).addEventListener('click', () => api.download('/devices/import-template').catch(toastError));
  const run = async (dry) => {
    const f = $('#impFile', m.el).files[0];
    if (!f) return toast('Vui lòng chọn tệp Excel', 'warn');
    const res = $('#impResult', m.el);
    res.innerHTML = 'Đang xử lý...';
    try {
      const r = await api.upload(`/devices/import${dry ? '?dry_run=1' : ''}`, f);
      if (r.errors.length) {
        res.innerHTML = `<div class="alert alert-error"><b>Có ${r.errors.length} lỗi, chưa có dữ liệu nào được ghi:</b><ul style="margin:6px 0 0;max-height:220px;overflow:auto">${r.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
      } else if (dry) {
        res.innerHTML = `<div class="alert alert-info">Tệp hợp lệ: sẽ thêm mới <b>${r.created}</b> và cập nhật <b>${r.updated}</b> thiết bị.</div>`;
      } else {
        res.innerHTML = `<div class="alert alert-info">✅ Đã thêm mới <b>${r.created}</b> và cập nhật <b>${r.updated}</b> thiết bị.</div>`;
        toast('Nhập dữ liệu thành công');
        reload();
      }
    } catch (e) {
      res.innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`;
    }
  };
  $('#impCheck', m.el).addEventListener('click', () => run(true));
  $('#impRun', m.el).addEventListener('click', () => run(false));
}

/* =================== BIỂU MẪU =================== */
function deviceFields(isNew) {
  const c = state.cat;
  return [
    { type: 'section', label: 'Thông tin chung' },
    { name: 'asset_code', label: 'Mã tài sản', col: 3, placeholder: 'Tự sinh nếu để trống', help: isNew ? 'Theo tiền tố của loại thiết bị' : '' },
    { name: 'name', label: 'Tên thiết bị', required: true, col: 6 },
    { name: 'category_id', label: 'Loại thiết bị', type: 'select', options: c.categories, col: 3 },
    { name: 'brand', label: 'Hãng sản xuất', col: 3, list: 'brandList' },
    { name: 'model', label: 'Model', col: 3 },
    { name: 'serial_number', label: 'Số serial', col: 3 },
    { name: 'unit', label: 'Đơn vị tính', col: 3, default: 'Chiếc' },
    { name: 'origin', label: 'Xuất xứ', col: 3 },
    { name: 'manufacture_year', label: 'Năm sản xuất', type: 'number', col: 3 },
    ...(isNew ? [{ name: 'quantity', label: 'Số lượng (tạo nhiều bản ghi)', type: 'number', col: 3, default: 1, min: 1, help: 'Mỗi thiết bị một mã riêng' }] : [{ type: 'html', col: 3, html: '' }]),
    { type: 'html', col: 3, html: '' },
    { type: 'section', label: 'Cấu hình kỹ thuật & mạng' },
    { name: 'cpu', label: 'CPU', col: 3 },
    { name: 'ram', label: 'RAM', col: 3 },
    { name: 'storage', label: 'Ổ cứng', col: 3 },
    { name: 'os', label: 'Hệ điều hành', col: 3, list: 'osList' },
    { name: 'hostname', label: 'Tên máy (hostname)', col: 3 },
    { name: 'ip_address', label: 'Địa chỉ IP', col: 3 },
    { name: 'mac_address', label: 'Địa chỉ MAC', col: 3 },
    { name: 'parent_id', label: 'Thuộc thiết bị (bộ máy)', type: 'select', options: '', col: 3 },
    { name: 'specs', label: 'Thông số kỹ thuật khác', type: 'textarea', rows: 2 },
    { type: 'section', label: 'Mua sắm - Tài chính' },
    { name: 'supplier_id', label: 'Nhà cung cấp', type: 'select', options: c.suppliers, col: 6 },
    { name: 'funding_source_id', label: 'Nguồn vốn', type: 'select', options: c.funding, col: 6 },
    { name: 'contract_no', label: 'Số hợp đồng', col: 3 },
    { name: 'invoice_no', label: 'Số hóa đơn', col: 3 },
    { name: 'purchase_date', label: 'Ngày mua', type: 'date', col: 3 },
    { name: 'in_use_date', label: 'Ngày đưa vào sử dụng', type: 'date', col: 3 },
    { name: 'original_price', label: 'Nguyên giá (đồng)', type: 'money', col: 3 },
    { name: 'depreciation_years', label: 'Thời gian sử dụng (năm)', type: 'number', col: 3, step: '0.5', help: 'Để trống: theo loại thiết bị' },
    { name: 'warranty_months', label: 'Bảo hành (tháng)', type: 'number', col: 3 },
    { name: 'warranty_end', label: 'Hết hạn bảo hành', type: 'date', col: 3, help: 'Tự tính nếu để trống' },
    { type: 'section', label: 'Tình trạng sử dụng' },
    { name: 'status', label: 'Trạng thái', type: 'select', options: mapOptions(DEVICE_STATUS, 'in_stock'), col: 3 },
    { name: 'condition', label: 'Tình trạng', type: 'select', options: mapOptions(CONDITIONS, 'good'), col: 3 },
    { name: 'department_id', label: 'Phòng ban sử dụng', type: 'select', options: c.departments, empty: '— Kho (chưa cấp phát)', col: 6 },
    { name: 'assigned_to', label: 'Người sử dụng', col: 6, list: 'userList' },
    { name: 'location', label: 'Vị trí đặt (phòng)', col: 6 },
    { name: 'note', label: 'Ghi chú', type: 'textarea', rows: 2 },
  ];
}

async function form(ctx) {
  const id = ctx.params.id;
  const isNew = !id;
  if (!can(state.user, 'device.write')) throw new Error('Bạn không có quyền thêm/sửa thiết bị');
  let values = { status: 'in_stock', condition: 'good', unit: 'Chiếc', quantity: 1 };
  if (id) values = await api.get(`/devices/${id}`);
  else if (ctx.query.clone) {
    const src = await api.get(`/devices/${ctx.query.clone}`);
    values = { ...src, asset_code: '', serial_number: '', hostname: '', ip_address: '', mac_address: '', quantity: 1 };
  }
  ctx.setTitle(isNew ? 'Thêm thiết bị mới' : `Sửa thiết bị ${values.asset_code}`);
  const fields = deviceFields(isNew);
  const sel = (k, v) => (values[k] == null ? v : values[k]);
  const parents = await api.get('/devices/lookup', { q: '' }).catch(() => []);
  ctx.el.innerHTML = `
    <div class="page-head"><h2>${isNew ? (ctx.query.clone ? 'Nhân bản thiết bị' : 'Thêm thiết bị mới') : `Sửa thiết bị: ${esc(values.asset_code)}`}</h2>
      <a class="btn" href="${isNew ? '#/devices' : `#/devices/${id}`}">← Quay lại</a></div>
    <div class="card"><div class="card-body" id="formBox">${renderForm(fields, { ...values, status: sel('status', 'in_stock') })}</div>
    <div class="modal-footer"><a class="btn" href="${isNew ? '#/devices' : `#/devices/${id}`}">Hủy</a>
      ${isNew ? '<button class="btn" id="saveNew">Lưu & thêm tiếp</button>' : ''}<button class="btn btn-primary" id="save">💾 Lưu thiết bị</button></div></div>
    <datalist id="brandList">${['Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Apple', 'Canon', 'Epson', 'Brother', 'Samsung', 'LG', 'Cisco', 'Fortinet', 'TP-Link', 'Synology', 'APC', 'Santak', 'Hikvision', 'Panasonic', 'Fujitsu', 'Ricoh', 'Sony', 'ViewSonic'].map((b) => `<option value="${b}">`).join('')}</datalist>
    <datalist id="osList">${['Windows 11 Pro', 'Windows 10 Pro', 'Windows Server 2022', 'Windows Server 2019', 'Ubuntu Server 22.04', 'macOS', 'Linux'].map((b) => `<option value="${b}">`).join('')}</datalist>
    <datalist id="userList">${state.cat.users.map((u) => `<option value="${esc(u.full_name)}">`).join('')}</datalist>`;
  const f = $('form', ctx.el);
  bindForm(f);
  f.elements.parent_id.innerHTML = options(parents.filter((p) => String(p.id) !== String(id)), { label: (p) => `${p.asset_code} - ${p.name}`, selected: values.parent_id, empty: '— Không —' });
  if (values.parent_id && !parents.some((p) => p.id === values.parent_id)) {
    f.elements.parent_id.insertAdjacentHTML('beforeend', `<option value="${values.parent_id}" selected>${esc(values.parent_code || '')} - ${esc(values.parent_name || '')}</option>`);
  }
  // Khi chọn loại thiết bị: gợi ý mã tài sản và số năm sử dụng
  f.elements.category_id.addEventListener('change', async () => {
    const cat = state.cat.categories.find((c) => String(c.id) === f.elements.category_id.value);
    if (cat && !f.elements.depreciation_years.value) f.elements.depreciation_years.placeholder = `${cat.depreciation_years} (theo loại)`;
    if (isNew && f.elements.category_id.value) {
      const r = await api.get('/devices/next-code', { category_id: f.elements.category_id.value });
      f.elements.asset_code.placeholder = `Tự sinh: ${r.code}`;
    }
  });
  const save = async (again) => {
    try {
      const data = collectForm(f, fields);
      if (isNew) {
        const r = await api.post('/devices', data);
        toast(r.ids.length > 1 ? `Đã thêm ${r.ids.length} thiết bị` : 'Đã thêm thiết bị');
        if (again) { form({ ...ctx, query: { clone: r.id } }); return; }
        navigate(`/devices/${r.id}`);
      } else {
        await api.put(`/devices/${id}`, data);
        toast('Đã lưu thay đổi');
        navigate(`/devices/${id}`);
      }
    } catch (e) { toastError(e); }
  };
  $('#save', ctx.el).addEventListener('click', () => save(false));
  $('#saveNew', ctx.el)?.addEventListener('click', () => save(true));
  f.addEventListener('submit', (e) => { e.preventDefault(); save(false); });
}

/* =================== CHI TIẾT =================== */
async function detail(ctx, id) {
  const u = state.user;
  const d = await api.get(`/devices/${id}`);
  if (!ctx.isCurrent()) return;
  ctx.setTitle(`${d.asset_code} - ${d.name}`);
  const viewAll = can(u, 'view.all');
  const row = (l, v) => (v === '' || v == null ? '' : `<dt>${l}</dt><dd>${v}</dd>`);
  ctx.el.innerHTML = `
    <div class="page-head">
      <div style="flex:1"><h2>${esc(d.name)}</h2><div class="sub">Mã tài sản <b>${esc(d.asset_code)}</b> · ${esc(d.category_name || '')} ${statusBadge(d.status)}</div></div>
      <a class="btn" href="#/devices">← Danh sách</a>
      ${can(u, 'device.write') ? `<a class="btn" href="#/devices/${d.id}/edit">✏️ Sửa</a><a class="btn" href="#/devices/new?clone=${d.id}">⧉ Nhân bản</a>` : ''}
      ${can(u, 'repair.create') && !['disposed', 'lost'].includes(d.status) ? '<button class="btn" id="btnRepair">🛠️ Báo hỏng</button>' : ''}
      <button class="btn" id="btnCard">🖨️ In lý lịch</button>
      <button class="btn" id="btnLabel">🏷️ In tem</button>
      ${can(u, 'device.delete') ? '<button class="btn btn-danger" id="btnDel">Xóa</button>' : ''}
    </div>
    <div class="card">
      <div class="tabs" id="tabs">
        <button data-tab="info" class="active">Thông tin</button><button data-tab="history">Lịch sử</button>
        <button data-tab="repairs">Sửa chữa</button><button data-tab="maint">Bảo trì</button>
        ${viewAll ? '<button data-tab="alloc">Cấp phát</button><button data-tab="soft">Phần mềm</button>' : ''}
      </div>
      <div class="card-body" id="tabBody">
        <div style="display:flex;gap:24px;flex-wrap:wrap">
          <div class="detail-grid" style="flex:1;min-width:300px">
            <dl class="dl">
              ${row('Hãng / Model', esc([d.brand, d.model].filter(Boolean).join(' / ')))}${row('Số serial', esc(d.serial_number))}
              ${row('Xuất xứ', esc(d.origin))}${row('Năm sản xuất', esc(d.manufacture_year))}${row('Đơn vị tính', esc(d.unit))}
              ${row('CPU', esc(d.cpu))}${row('RAM', esc(d.ram))}${row('Ổ cứng', esc(d.storage))}${row('Hệ điều hành', esc(d.os))}
              ${row('Tên máy', esc(d.hostname))}${row('Địa chỉ IP', esc(d.ip_address))}${row('Địa chỉ MAC', esc(d.mac_address))}
              ${row('Thông số khác', esc(d.specs))}
              ${row('Thuộc bộ', d.parent_id ? `<a href="#/devices/${d.parent_id}">${esc(d.parent_code)} - ${esc(d.parent_name)}</a>` : '')}
              ${row('Thiết bị kèm theo', d.children.map((c) => `<a href="#/devices/${c.id}">${esc(c.asset_code)}</a> ${esc(c.name)}`).join('<br>'))}
            </dl>
            <dl class="dl">
              ${row('Phòng ban', esc(d.department_name || 'Kho (chưa cấp phát)'))}${row('Người sử dụng', esc(d.assigned_to))}${row('Vị trí', esc(d.location))}
              ${row('Tình trạng', esc(labelOf(CONDITIONS, d.condition)))}
              ${row('Nhà cung cấp', esc(d.supplier_name))}${row('Hợp đồng / Hóa đơn', esc([d.contract_no, d.invoice_no].filter(Boolean).join(' / ')))}
              ${row('Ngày mua', fmtDate(d.purchase_date))}${row('Ngày đưa vào SD', fmtDate(d.in_use_date))}
              ${row('Bảo hành', d.warranty_end ? `${d.warranty_months ? d.warranty_months + ' tháng, ' : ''}đến ${fmtDate(d.warranty_end)} ${d.warranty_end < todayStr() ? '<span class="badge badge-gray">Hết hạn</span>' : '<span class="badge badge-green">Còn hạn</span>'}` : '')}
              ${viewAll ? `${row('Nguồn vốn', esc(d.funding_name))}${row('Nguyên giá', `<b>${fmtMoney(d.original_price)} đ</b> ${d.is_fixed_asset ? '<span class="badge badge-blue">TSCĐ</span>' : '<span class="badge badge-gray">CCDC</span>'}`)}
              ${row('Thời gian SD / Tỷ lệ HM', d.depreciation_years ? `${d.depreciation_years} năm / ${Math.round(d.depreciation_rate * 100) / 100}% năm` : '')}
              ${row('Hao mòn lũy kế', fmtMoney(d.accumulated) + ' đ')}${row('Giá trị còn lại', `<b>${fmtMoney(d.remaining)} đ</b>`)}` : ''}
              ${row('Ghi chú', esc(d.note))}
              ${row('Cập nhật', fmtDateTime(d.updated_at))}
            </dl>
          </div>
          <div style="text-align:center"><img class="qr-img" src="${qrUrl(d)}" alt="QR"><div class="text-muted" style="font-size:12px">Quét mã để tra cứu</div></div>
        </div>
      </div>
    </div>`;
  const infoHtml = $('#tabBody', ctx.el).innerHTML;
  let related = null;
  const getRelated = async () => (related ??= await api.get(`/devices/${d.id}/related`));

  const tabs = {
    info: async () => infoHtml,
    history: async () => {
      const h = await api.get(`/devices/${d.id}/history`);
      return `<ul class="timeline">${h.map((x) => `<li><b>${esc(x.action)}</b><div>${esc(x.description || '')}</div><div class="t">${fmtDateTime(x.created_at)}${x.user_name ? ' · ' + esc(x.user_name) : ''}</div></li>`).join('') || '<div class="text-muted">Chưa có lịch sử</div>'}</ul>`;
    },
    repairs: async () => {
      const r = (await getRelated()).repairs;
      return table(['Số phiếu', 'Ngày báo', 'Hiện tượng', 'Người xử lý', 'Chi phí', 'Trạng thái'], r.map((x) => [
        `<a href="#/repairs/${x.id}">${esc(x.code)}</a>`, fmtDate(x.report_date), esc(x.problem), esc(x.technician_name || ''), `<span class="nowrap">${fmtMoney(x.cost)}</span>`, badge(REPAIR_STATUS, x.status)]),
      r.length ? `Tổng chi phí sửa chữa: <b>${fmtMoney(r.reduce((a, x) => a + (x.cost || 0), 0))} đ</b>` : '');
    },
    maint: async () => {
      const r = (await getRelated()).maintenances;
      return table(['Nội dung', 'Ngày dự kiến', 'Ngày thực hiện', 'Người thực hiện', 'Kết quả', 'Trạng thái'], r.map((x) => [
        esc(x.title), fmtDate(x.scheduled_date), fmtDate(x.done_date), esc(x.performer || ''), esc(x.result || x.content || ''), badge(MAINT_STATUS, x.status)]));
    },
    alloc: async () => {
      const r = (await getRelated()).allocations;
      return table(['Số phiếu', 'Loại', 'Ngày', 'Đến phòng ban', 'Người nhận'], r.map((x) => [
        `<a href="#/allocations/${x.id}">${esc(x.code)}</a>`, badge(ALLOCATION_TYPES, x.type), fmtDate(x.doc_date), esc(x.to_department_name || 'Kho'), esc(x.receiver_person || '')]));
    },
    soft: async () => {
      const r = (await getRelated()).licenses;
      return table(['Phần mềm', 'Loại bản quyền', 'Hết hạn', 'Ngày gán'], r.map((x) => [
        `<a href="#/licenses/${x.id}">${esc(x.name)} ${esc(x.version || '')}</a>`, esc(labelOf(LICENSE_TYPE, x.license_type)), fmtDate(x.expiry_date) || 'Không thời hạn', fmtDate(x.assigned_at)]));
    },
  };
  $$('#tabs button', ctx.el).forEach((b) => b.addEventListener('click', async () => {
    $$('#tabs button', ctx.el).forEach((x) => x.classList.toggle('active', x === b));
    $('#tabBody', ctx.el).innerHTML = '<div class="text-muted">Đang tải...</div>';
    try { $('#tabBody', ctx.el).innerHTML = await tabs[b.dataset.tab](); } catch (e) { toastError(e); }
  }));
  $('#btnCard', ctx.el).addEventListener('click', async () => printDeviceCard(d, await api.get(`/devices/${d.id}/history`)));
  $('#btnLabel', ctx.el).addEventListener('click', () => printLabels([d]));
  $('#btnRepair', ctx.el)?.addEventListener('click', async () => {
    const m = await import('./repairs.js');
    m.openReportForm(d);
  });
  $('#btnDel', ctx.el)?.addEventListener('click', async () => {
    if (!(await confirmDialog(`Xóa thiết bị <b>${esc(d.asset_code)} - ${esc(d.name)}</b>?<br><small class="text-muted">Thiết bị hết giá trị sử dụng nên dùng chức năng Thanh lý để lưu vết đầy đủ.</small>`, { danger: true, okText: 'Xóa' }))) return;
    try {
      await api.del(`/devices/${d.id}`);
      toast('Đã xóa thiết bị');
      navigate('/devices');
    } catch (e) { toastError(e); }
  });
}

function table(headers, rows, foot = '') {
  if (!rows.length) return '<div class="empty">Chưa có dữ liệu</div>';
  return `<div class="table-wrap"><table class="table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${foot ? `<p>${foot}</p>` : ''}`;
}

export { table };
