import { api } from '../api.js';
import { state, navigate, setQuery } from '../app.js';
import { ALLOCATION_TYPES, CONDITIONS, can, labelOf } from '../constants.js';
import { $, $$, esc, fmtDate, badge, toast, toastError, options, mapOptions, pager, bindPager, debounce, devicePicker, todayStr, statusBadge } from '../ui.js';
import { printAllocation } from '../print.js';

export default async function allocations(ctx) {
  if (ctx.view === 'form') return form(ctx);
  if (ctx.view === 'detail') return detail(ctx);
  return list(ctx);
}

async function list(ctx) {
  ctx.setTitle('Cấp phát - Điều chuyển - Thu hồi');
  const q = { page: 1, pageSize: 20, ...ctx.query };
  q.page = Number(q.page); q.pageSize = Number(q.pageSize);
  const w = can(state.user, 'allocation.write');
  ctx.el.innerHTML = `
    <div class="page-head"><h2>Cấp phát - Điều chuyển - Thu hồi</h2>
      ${w ? `<a class="btn btn-primary" href="#/allocations/new?type=allocate">＋ Cấp phát</a>
      <a class="btn" href="#/allocations/new?type=transfer">🔁 Điều chuyển</a><a class="btn" href="#/allocations/new?type=recall">↩️ Thu hồi</a>` : ''}</div>
    <div class="card"><div class="card-body" style="padding-bottom:0"><div class="toolbar">
      <input class="search" type="search" id="fQ" placeholder="🔍 Số phiếu, người nhận, mã thiết bị..." value="${esc(q.q || '')}">
      <select id="fType">${mapOptions(ALLOCATION_TYPES, q.type, 'Tất cả loại phiếu')}</select>
      <select id="fDept">${options(state.cat.departments, { selected: q.department_id, empty: 'Tất cả phòng ban' })}</select>
      <label>Từ <input type="date" id="fFrom" value="${esc(q.from || '')}"></label><label>Đến <input type="date" id="fTo" value="${esc(q.to || '')}"></label>
    </div></div><div id="tbl"></div></div>`;
  const load = async () => {
    setQuery({ ...q, page: q.page > 1 ? q.page : '', pageSize: q.pageSize !== 20 ? q.pageSize : '' });
    const data = await api.get('/allocations', q);
    if (!ctx.isCurrent()) return;
    $('#tbl', ctx.el).innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Số phiếu</th><th>Loại</th><th>Ngày</th><th>Từ</th><th>Đến</th><th>Người nhận</th><th class="center">Số TB</th><th>Lý do</th><th>Người lập</th></tr></thead>
      <tbody>${data.rows.map((a) => `<tr><td><a href="#/allocations/${a.id}"><b>${esc(a.code)}</b></a></td><td>${badge(ALLOCATION_TYPES, a.type)}</td>
        <td class="nowrap">${fmtDate(a.doc_date)}</td><td>${esc(a.from_department_name || 'Kho')}</td><td>${esc(a.to_department_name || 'Kho')}</td>
        <td>${esc(a.receiver_person || '')}</td><td class="center">${a.item_count}</td><td>${esc(a.reason || '')}</td><td class="muted">${esc(a.created_by_name || '')}</td></tr>`).join('')}</tbody>
      </table>${data.rows.length ? '' : '<div class="empty">Chưa có phiếu nào</div>'}</div>${pager(data.total, data.page, data.pageSize)}`;
    bindPager($('#tbl', ctx.el), (p) => { Object.assign(q, p); load(); });
  };
  $('#fQ', ctx.el).addEventListener('input', debounce(() => { q.q = $('#fQ', ctx.el).value; q.page = 1; load(); }));
  [['#fType', 'type'], ['#fDept', 'department_id'], ['#fFrom', 'from'], ['#fTo', 'to']].forEach(([s, k]) =>
    $(s, ctx.el).addEventListener('change', (e) => { q[k] = e.target.value; q.page = 1; load(); }));
  await load();
}

async function form(ctx) {
  if (!can(state.user, 'allocation.write')) throw new Error('Bạn không có quyền lập phiếu');
  let type = ALLOCATION_TYPES[ctx.query.type] ? ctx.query.type : 'allocate';
  const items = [];
  if (ctx.query.ids) {
    const r = await api.get('/devices', { ids: ctx.query.ids, pageSize: 500 });
    items.push(...r.rows);
    if (items.length && items.every((d) => d.status === 'in_stock' && !d.department_id)) type = 'allocate';
    else if (items.length && !ctx.query.type) type = 'transfer';
  }
  ctx.setTitle('Lập phiếu ' + labelOf(ALLOCATION_TYPES, type).toLowerCase());
  ctx.el.innerHTML = `
    <div class="page-head"><h2>Lập phiếu</h2>
      <div class="chips" id="typeChips">${Object.entries(ALLOCATION_TYPES).map(([k, v]) => `<span class="chip ${k === type ? 'active' : ''}" data-type="${k}">${v.label}</span>`).join('')}</div>
      <a class="btn" href="#/allocations">← Quay lại</a></div>
    <div class="card mb"><div class="card-header"><h3 id="hdr"></h3></div><div class="card-body">
      <form class="form-grid" id="f">
        <label class="field c3"><span>Ngày chứng từ <span class="req">*</span></span><input type="date" name="doc_date" value="${todayStr()}"></label>
        <label class="field c3" id="fromBox"><span>Từ phòng ban</span><select name="from_department_id">${options(state.cat.departments, { empty: '— Kho' })}</select></label>
        <label class="field c3" id="toBox"><span>Phòng ban nhận <span class="req">*</span></span><select name="to_department_id">${options(state.cat.departments, { empty: '-- Chọn phòng ban --' })}</select></label>
        <label class="field c3"><span>Số quyết định / căn cứ</span><input name="decision_no" placeholder="VD: QĐ số 12/QĐ-..."></label>
        <label class="field c3"><span>Người giao</span><input name="handover_person" list="uList" value="${esc(state.user.full_name)}"></label>
        <label class="field c3"><span id="recvLbl">Người nhận / sử dụng</span><input name="receiver_person" list="uList"></label>
        <label class="field c3"><span>Chức vụ người nhận</span><input name="receiver_position"></label>
        <label class="field c3"><span>Vị trí đặt</span><input name="location" placeholder="VD: Phòng 203"></label>
        <label class="field c12"><span>Lý do</span><input name="reason"></label>
        <label class="check c12" id="assignBox"><input type="checkbox" name="assign_user" checked> Cập nhật người nhận làm người sử dụng thiết bị</label>
      </form>
    </div></div>
    <div class="card"><div class="card-header"><h3>Danh sách thiết bị</h3><div style="flex:2" id="picker"></div></div>
      <div id="items"></div>
      <div class="modal-footer"><a class="btn" href="#/allocations">Hủy</a><button class="btn btn-primary" id="save">💾 Lưu phiếu</button></div>
    </div>
    <datalist id="uList">${state.cat.users.map((u) => `<option value="${esc(u.full_name)}">`).join('')}</datalist>`;
  const f = $('#f', ctx.el);

  const applyType = () => {
    $$('#typeChips .chip', ctx.el).forEach((c) => c.classList.toggle('active', c.dataset.type === type));
    $('#hdr', ctx.el).textContent = { allocate: 'Phiếu cấp phát thiết bị từ kho cho phòng ban', transfer: 'Phiếu điều chuyển thiết bị giữa các phòng ban / người sử dụng', recall: 'Phiếu thu hồi thiết bị về kho' }[type];
    $('#toBox', ctx.el).classList.toggle('hidden', type === 'recall');
    $('#fromBox', ctx.el).classList.toggle('hidden', type === 'allocate');
    $('#assignBox', ctx.el).classList.toggle('hidden', type === 'recall');
    $('#recvLbl', ctx.el).textContent = type === 'recall' ? 'Người nhận lại (kho)' : 'Người nhận / sử dụng';
    ctx.setTitle('Lập phiếu ' + labelOf(ALLOCATION_TYPES, type).toLowerCase());
  };
  $$('#typeChips .chip', ctx.el).forEach((c) => c.addEventListener('click', () => { type = c.dataset.type; applyType(); renderItems(); }));

  const renderItems = () => {
    $('#items', ctx.el).innerHTML = items.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>#</th><th>Mã TS</th><th>Tên thiết bị</th><th>Hiện tại</th><th>Tình trạng bàn giao</th><th>Ghi chú</th><th></th></tr></thead>
      <tbody>${items.map((d, i) => `<tr><td>${i + 1}</td><td><b>${esc(d.asset_code)}</b></td><td>${esc(d.name)}<div class="muted">${esc(d.serial_number || '')}</div></td>
        <td>${esc(d.department_name || 'Kho')} ${statusBadge(d.status)}<div class="muted">${esc(d.assigned_to || '')}</div></td>
        <td><select data-cond="${i}">${mapOptions(CONDITIONS, d._cond || d.condition || 'good')}</select></td>
        <td><input data-note="${i}" value="${esc(d._note || '')}"></td>
        <td><button class="link-btn danger" data-rm="${i}">Bỏ</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">Chưa có thiết bị. Tìm và chọn thiết bị ở ô tìm kiếm phía trên.</div>';
    $$('[data-rm]', ctx.el).forEach((b) => b.addEventListener('click', () => { items.splice(Number(b.dataset.rm), 1); renderItems(); }));
    $$('[data-cond]', ctx.el).forEach((s) => s.addEventListener('change', () => { items[Number(s.dataset.cond)]._cond = s.value; }));
    $$('[data-note]', ctx.el).forEach((s) => s.addEventListener('input', () => { items[Number(s.dataset.note)]._note = s.value; }));
  };
  devicePicker($('#picker', ctx.el), {
    params: () => ({
      status: type === 'allocate' ? 'in_stock' : 'in_use,in_stock,repairing,broken',
      department_id: type !== 'allocate' && f.from_department_id.value ? f.from_department_id.value : '',
    }),
    onPick: (d) => {
      if (items.some((x) => x.id === d.id)) return toast('Thiết bị đã có trong danh sách', 'warn');
      items.push(d);
      if (type !== 'allocate' && !f.from_department_id.value && d.department_id) f.from_department_id.value = d.department_id;
      renderItems();
    },
  });
  if (items.length && items[0].department_id) f.from_department_id.value = items[0].department_id;
  applyType();
  renderItems();

  $('#save', ctx.el).addEventListener('click', async () => {
    const btn = $('#save', ctx.el);
    try {
      const fd = Object.fromEntries(new FormData(f));
      const body = {
        ...fd, type, assign_user: f.assign_user.checked,
        from_department_id: type === 'allocate' ? null : fd.from_department_id || null,
        items: items.map((d) => ({ device_id: d.id, condition: d._cond || d.condition, note: d._note || null })),
      };
      btn.disabled = true;
      const r = await api.post('/allocations', body);
      toast(`Đã lập phiếu ${r.code}`);
      navigate(`/allocations/${r.id}`);
    } catch (e) { toastError(e); } finally { btn.disabled = false; }
  });
}

async function detail(ctx) {
  const a = await api.get(`/allocations/${ctx.params.id}`);
  ctx.setTitle(`Phiếu ${a.code}`);
  ctx.el.innerHTML = `
    <div class="page-head"><div style="flex:1"><h2>Phiếu ${labelOf(ALLOCATION_TYPES, a.type).toLowerCase()} ${esc(a.code)}</h2><div class="sub">${badge(ALLOCATION_TYPES, a.type)} · Ngày ${fmtDate(a.doc_date)} · Người lập: ${esc(a.created_by_name || '')}</div></div>
      <a class="btn" href="#/allocations">← Danh sách</a><button class="btn btn-primary" id="print">🖨️ In biên bản</button></div>
    <div class="card mb"><div class="card-body"><dl class="dl">
      <dt>Từ</dt><dd>${esc(a.from_department_name || 'Kho')}</dd><dt>Đến</dt><dd>${esc(a.to_department_name || 'Kho')}</dd>
      <dt>Người giao</dt><dd>${esc(a.handover_person || '')}</dd><dt>Người nhận</dt><dd>${esc(a.receiver_person || '')} ${a.receiver_position ? '- ' + esc(a.receiver_position) : ''}</dd>
      <dt>Vị trí</dt><dd>${esc(a.location || '')}</dd><dt>Căn cứ</dt><dd>${esc(a.decision_no || '')}</dd><dt>Lý do</dt><dd>${esc(a.reason || '')}</dd>
    </dl></div></div>
    <div class="card"><div class="card-header"><h3>Thiết bị (${a.items.length})</h3></div><div class="table-wrap"><table class="table">
      <thead><tr><th>#</th><th>Mã TS</th><th>Tên thiết bị</th><th>Loại</th><th>Model / Serial</th><th>Tình trạng</th><th>Ghi chú</th></tr></thead>
      <tbody>${a.items.map((i, k) => `<tr><td>${k + 1}</td><td><a href="#/devices/${i.device_id}">${esc(i.asset_code)}</a></td><td>${esc(i.name)}</td><td>${esc(i.category_name || '')}</td>
        <td>${esc([i.model, i.serial_number].filter(Boolean).join(' / '))}</td><td>${esc(labelOf(CONDITIONS, i.condition))}</td><td>${esc(i.note || '')}</td></tr>`).join('')}</tbody>
    </table></div></div>`;
  $('#print', ctx.el).addEventListener('click', () => printAllocation(a));
}
