import { api } from '../api.js';
import { state, navigate } from '../app.js';
import { LICENSE_TYPE, can, labelOf } from '../constants.js';
import { $, $$, esc, fmtDate, fmtMoney, toast, toastError, mapOptions, formModal, devicePicker, todayStr, confirmDialog, debounce } from '../ui.js';

const fields = () => [
  { name: 'name', label: 'Tên phần mềm', required: true, col: 8, placeholder: 'VD: Microsoft Office, Windows 11 Pro, Kaspersky Endpoint...' },
  { name: 'version', label: 'Phiên bản', col: 4 },
  { name: 'publisher', label: 'Nhà phát hành', col: 4 },
  { name: 'license_type', label: 'Loại bản quyền', type: 'select', options: mapOptions(LICENSE_TYPE, 'perpetual'), col: 4 },
  { name: 'seats', label: 'Số lượng (máy/người dùng)', type: 'number', col: 4, default: 1, min: 0 },
  { name: 'license_key', label: 'Khóa bản quyền / Mã kích hoạt', col: 12 },
  { name: 'purchase_date', label: 'Ngày mua', type: 'date', col: 4 },
  { name: 'expiry_date', label: 'Ngày hết hạn', type: 'date', col: 4, help: 'Để trống nếu vĩnh viễn' },
  { name: 'price', label: 'Giá trị (đồng)', type: 'money', col: 4 },
  { name: 'supplier_id', label: 'Nhà cung cấp', type: 'select', options: state.cat.suppliers, col: 4 },
  { name: 'funding_source_id', label: 'Nguồn vốn', type: 'select', options: state.cat.funding, col: 4 },
  { name: 'contract_no', label: 'Số hợp đồng', col: 4 },
  { name: 'note', label: 'Ghi chú', type: 'textarea', rows: 2 },
];

export default async function licenses(ctx) {
  if (ctx.view === 'detail') return detail(ctx);
  ctx.setTitle('Bản quyền phần mềm');
  const w = can(state.user, 'license.write');
  const q = { ...ctx.query };
  ctx.el.innerHTML = `
    <div class="page-head"><h2>Bản quyền phần mềm</h2>${w ? '<button class="btn btn-primary" id="btnNew">＋ Thêm bản quyền</button>' : ''}</div>
    <div class="card"><div class="card-body" style="padding-bottom:0"><div class="toolbar">
      <input class="search" type="search" id="fQ" placeholder="🔍 Tên phần mềm, nhà phát hành, hợp đồng...">
      <select id="fType">${mapOptions(LICENSE_TYPE, q.license_type, 'Tất cả loại')}</select></div></div><div id="tbl"></div></div>`;
  const t = todayStr();
  const load = async () => {
    const rows = await api.get('/licenses', q);
    if (!ctx.isCurrent()) return;
    $('#tbl', ctx.el).innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Phần mềm</th><th>Loại</th><th class="center">Đã dùng / Tổng</th><th>Ngày mua</th><th>Hết hạn</th><th class="num">Giá trị</th><th>Nhà cung cấp</th></tr></thead>
      <tbody>${rows.map((l) => {
    const exp = l.expiry_date && l.expiry_date < t;
    const soon = l.expiry_date && !exp && l.expiry_date <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    return `<tr><td><a href="#/licenses/${l.id}"><b>${esc(l.name)}</b></a> ${esc(l.version || '')}<div class="muted">${esc(l.publisher || '')}</div></td>
      <td>${esc(labelOf(LICENSE_TYPE, l.license_type))}</td>
      <td class="center ${l.seats && l.used > l.seats ? 'text-red' : ''}">${l.used} / ${l.seats || '∞'}</td><td>${fmtDate(l.purchase_date)}</td>
      <td class="nowrap">${l.expiry_date ? `${fmtDate(l.expiry_date)} ${exp ? '<span class="badge badge-red">Hết hạn</span>' : soon ? '<span class="badge badge-orange">Sắp hết</span>' : ''}` : '<span class="text-muted">Vĩnh viễn</span>'}</td>
      <td class="num">${fmtMoney(l.price)}</td><td>${esc(l.supplier_name || '')}</td></tr>`;
  }).join('')}</tbody></table>${rows.length ? '' : '<div class="empty">Chưa có bản quyền phần mềm</div>'}</div>`;
  };
  $('#fQ', ctx.el).addEventListener('input', debounce((e) => { q.q = e.target.value; load(); }));
  $('#fType', ctx.el).addEventListener('change', (e) => { q.license_type = e.target.value; load(); });
  $('#btnNew', ctx.el)?.addEventListener('click', () => formModal({
    title: 'Thêm bản quyền phần mềm', fields: fields(), values: { license_type: 'perpetual', seats: 1 },
    onSubmit: async (d) => { const r = await api.post('/licenses', d); toast('Đã thêm'); navigate(`/licenses/${r.id}`); },
  }));
  await load();
}

async function detail(ctx) {
  const l = await api.get(`/licenses/${ctx.params.id}`);
  if (!ctx.isCurrent()) return;
  ctx.setTitle(l.name);
  const w = can(state.user, 'license.write');
  ctx.el.innerHTML = `
    <div class="page-head"><div style="flex:1"><h2>${esc(l.name)} ${esc(l.version || '')}</h2><div class="sub">${esc(labelOf(LICENSE_TYPE, l.license_type))} · Đã sử dụng ${l.devices.length}/${l.seats || '∞'}</div></div>
      <a class="btn" href="#/licenses">← Danh sách</a>${w ? '<button class="btn" id="bEdit">✏️ Sửa</button><button class="btn btn-danger" id="bDel">Xóa</button>' : ''}</div>
    <div class="grid-2">
      <div class="card"><div class="card-body"><dl class="dl">
        <dt>Nhà phát hành</dt><dd>${esc(l.publisher || '')}</dd><dt>Khóa bản quyền</dt><dd style="font-family:monospace">${esc(l.license_key || '')}</dd>
        <dt>Ngày mua</dt><dd>${fmtDate(l.purchase_date)}</dd><dt>Hết hạn</dt><dd>${l.expiry_date ? fmtDate(l.expiry_date) : 'Vĩnh viễn'}</dd>
        <dt>Giá trị</dt><dd>${fmtMoney(l.price)} đ</dd><dt>Nhà cung cấp</dt><dd>${esc(l.supplier_name || '')}</dd><dt>Nguồn vốn</dt><dd>${esc(l.funding_name || '')}</dd>
        <dt>Hợp đồng</dt><dd>${esc(l.contract_no || '')}</dd><dt>Ghi chú</dt><dd>${esc(l.note || '')}</dd>
      </dl></div></div>
      <div class="card"><div class="card-header"><h3>Thiết bị được cài đặt (${l.devices.length})</h3>${w ? '<div style="flex:2" id="picker"></div>' : ''}</div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Mã TS</th><th>Thiết bị</th><th>Phòng ban</th><th>Ngày gán</th><th></th></tr></thead>
        <tbody>${l.devices.map((d) => `<tr><td><a href="#/devices/${d.id}">${esc(d.asset_code)}</a></td><td>${esc(d.name)}<div class="muted">${esc(d.assigned_to || '')}</div></td>
          <td>${esc(d.department_name || 'Kho')}</td><td>${fmtDate(d.assigned_at)}</td><td>${w ? `<button class="link-btn danger" data-rm="${d.id}">Gỡ</button>` : ''}</td></tr>`).join('')}</tbody></table>
        ${l.devices.length ? '' : '<div class="empty">Chưa gán cho thiết bị nào</div>'}</div></div>
    </div>`;
  if (!w) return;
  devicePicker($('#picker', ctx.el), {
    params: { status: 'in_use,in_stock,repairing' },
    placeholder: 'Tìm thiết bị để gán bản quyền...',
    onPick: async (d) => {
      try { await api.post(`/licenses/${l.id}/assign`, { device_id: d.id }); toast(`Đã gán cho ${d.asset_code}`); detail(ctx); } catch (e) { toastError(e); }
    },
  });
  $$('[data-rm]', ctx.el).forEach((b) => b.addEventListener('click', async () => {
    try { await api.del(`/licenses/${l.id}/assign/${b.dataset.rm}`); toast('Đã gỡ'); detail(ctx); } catch (e) { toastError(e); }
  }));
  $('#bEdit', ctx.el).addEventListener('click', () => formModal({
    title: 'Sửa bản quyền', fields: fields(), values: l,
    onSubmit: async (d) => { await api.put(`/licenses/${l.id}`, d); toast('Đã lưu'); detail(ctx); },
  }));
  $('#bDel', ctx.el).addEventListener('click', async () => {
    if (!(await confirmDialog(`Xóa bản quyền <b>${esc(l.name)}</b>?`, { danger: true, okText: 'Xóa' }))) return;
    try { await api.del(`/licenses/${l.id}`); toast('Đã xóa'); navigate('/licenses'); } catch (e) { toastError(e); }
  });
}
