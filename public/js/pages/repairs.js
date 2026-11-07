import { api } from '../api.js';
import { state, navigate, setQuery, refreshAlerts } from '../app.js';
import { REPAIR_STATUS, REPAIR_PRIORITY, REPAIR_TYPE, can } from '../constants.js';
import {
  $, $$, esc, fmtDate, fmtMoney, fmtDateTime, badge, toast, toastError, options, mapOptions, pager, bindPager, debounce,
  devicePicker, modal, formModal, todayStr, confirmDialog,
} from '../ui.js';
import { printRepair } from '../print.js';

export default async function repairs(ctx) {
  if (ctx.view === 'detail') return detail(ctx);
  return list(ctx);
}

/** Hộp thoại báo hỏng (dùng ở nhiều nơi) */
export function openReportForm(device, onDone) {
  let picked = device || null;
  const m = modal({
    title: 'Báo hỏng / Yêu cầu sửa chữa thiết bị',
    size: 'lg',
    body: `<form class="form-grid" id="rf">
      <div class="c12"><label class="field"><span>Thiết bị <span class="req">*</span></span></label><div id="pk"></div><div id="pkSel" style="margin-top:6px"></div></div>
      <label class="field c12"><span>Mô tả hiện tượng hư hỏng <span class="req">*</span></span><textarea name="problem" rows="4" placeholder="VD: Máy không lên nguồn, màn hình xanh khi khởi động, máy in kẹt giấy..."></textarea></label>
      <label class="field c4"><span>Mức độ ưu tiên</span><select name="priority">${mapOptions(REPAIR_PRIORITY, 'normal')}</select></label>
      <label class="field c4"><span>Người báo</span><input name="reporter_name" value="${esc(state.user.full_name)}"></label>
      <label class="field c4"><span>Số điện thoại liên hệ</span><input name="reporter_phone" value="${esc(state.user.phone || '')}"></label>
    </form>`,
    footer: '<button class="btn" data-close>Hủy</button><button class="btn btn-primary" id="rSend">Gửi yêu cầu</button>',
  });
  const showSel = () => {
    $('#pkSel', m.el).innerHTML = picked ? `<div class="alert alert-info" style="margin:0">Đã chọn: <b>${esc(picked.asset_code)}</b> - ${esc(picked.name)} ${picked.department_name ? '(' + esc(picked.department_name) + ')' : ''}</div>` : '';
  };
  devicePicker($('#pk', m.el), { params: { status: 'in_use,in_stock,broken,repairing' }, onPick: (d) => { picked = d; showSel(); } });
  showSel();
  $('#rSend', m.el).addEventListener('click', async () => {
    const f = $('#rf', m.el);
    try {
      if (!picked) throw new Error('Vui lòng chọn thiết bị');
      const r = await api.post('/repairs', { device_id: picked.id, ...Object.fromEntries(new FormData(f)) });
      toast(`Đã gửi yêu cầu ${r.code}. Bộ phận CNTT sẽ xử lý sớm.`);
      m.close();
      refreshAlerts();
      onDone ? onDone(r) : navigate(`/repairs/${r.id}`);
    } catch (e) { toastError(e); }
  });
}

async function list(ctx) {
  ctx.setTitle('Sửa chữa - Báo hỏng');
  const u = state.user;
  const q = { page: 1, pageSize: 20, ...ctx.query };
  q.page = Number(q.page); q.pageSize = Number(q.pageSize);
  const manage = can(u, 'repair.manage');
  ctx.el.innerHTML = `
    <div class="page-head"><h2>Sửa chữa - Báo hỏng</h2>
      <button class="btn btn-primary" id="btnNew">＋ Báo hỏng thiết bị</button>
      ${manage ? '<button class="btn" id="btnExport">⬇️ Xuất Excel</button>' : ''}</div>
    <div class="card"><div class="card-body" style="padding-bottom:0">
      <div class="chips mb" id="quick">
        <span class="chip" data-st="">Tất cả</span><span class="chip" data-st="open">Chưa hoàn thành</span>
        ${Object.entries(REPAIR_STATUS).map(([k, v]) => `<span class="chip" data-st="${k}">${v.label}</span>`).join('')}
        ${u.role !== 'user' ? '<span class="chip" data-st="mine">Tôi báo</span>' : ''}
      </div>
      <div class="toolbar">
        <input class="search" type="search" id="fQ" placeholder="🔍 Số phiếu, mã thiết bị, nội dung..." value="${esc(q.q || '')}">
        <select id="fPri">${mapOptions(REPAIR_PRIORITY, q.priority, 'Tất cả mức độ')}</select>
        ${manage ? `<select id="fTech">${options(state.cat.users.filter((x) => ['admin', 'manager', 'technician'].includes(x.role)), { label: 'full_name', selected: q.technician_id, empty: 'Tất cả người xử lý' })}</select>` : ''}
        <label>Từ <input type="date" id="fFrom" value="${esc(q.from || '')}"></label><label>Đến <input type="date" id="fTo" value="${esc(q.to || '')}"></label>
      </div></div><div id="tbl"></div></div>`;
  const quickVal = () => (q.open === '1' ? 'open' : q.mine === '1' ? 'mine' : q.status || '');
  const markQuick = () => $$('#quick .chip', ctx.el).forEach((c) => c.classList.toggle('active', c.dataset.st === quickVal()));
  const load = async () => {
    markQuick();
    setQuery({ ...q, page: q.page > 1 ? q.page : '', pageSize: q.pageSize !== 20 ? q.pageSize : '' });
    const data = await api.get('/repairs', q);
    if (!ctx.isCurrent()) return;
    $('#tbl', ctx.el).innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Số phiếu</th><th>Ngày báo</th><th>Thiết bị</th><th>Hiện tượng</th><th>Mức độ</th><th>Người báo</th><th>Người xử lý</th><th class="num">Chi phí</th><th>Trạng thái</th></tr></thead>
      <tbody>${data.rows.map((r) => `<tr><td class="nowrap"><a href="#/repairs/${r.id}"><b>${esc(r.code)}</b></a></td><td class="nowrap">${fmtDate(r.report_date)}</td>
        <td><a href="#/devices/${r.device_id}">${esc(r.asset_code)}</a> ${esc(r.device_name)}<div class="muted">${esc(r.department_name || 'Kho')}</div></td>
        <td>${esc(r.problem.length > 80 ? r.problem.slice(0, 80) + '…' : r.problem)}</td><td>${badge(REPAIR_PRIORITY, r.priority)}</td>
        <td>${esc(r.reporter_name || '')}</td><td>${esc(r.technician_name || r.vendor || '')}</td><td class="num">${fmtMoney(r.cost) || ''}</td><td>${badge(REPAIR_STATUS, r.status)}</td></tr>`).join('')}</tbody>
      ${data.rows.length && manage ? `<tfoot><tr><td colspan="7">Tổng chi phí theo bộ lọc</td><td class="num">${fmtMoney(data.sum_cost)}</td><td></td></tr></tfoot>` : ''}
      </table>${data.rows.length ? '' : '<div class="empty">Không có yêu cầu sửa chữa</div>'}</div>${pager(data.total, data.page, data.pageSize)}`;
    bindPager($('#tbl', ctx.el), (p) => { Object.assign(q, p); load(); });
  };
  $$('#quick .chip', ctx.el).forEach((c) => c.addEventListener('click', () => {
    const v = c.dataset.st;
    q.open = v === 'open' ? '1' : '';
    q.mine = v === 'mine' ? '1' : '';
    q.status = !['open', 'mine'].includes(v) ? v : '';
    q.page = 1;
    load();
  }));
  $('#fQ', ctx.el).addEventListener('input', debounce(() => { q.q = $('#fQ', ctx.el).value; q.page = 1; load(); }));
  [['#fPri', 'priority'], ['#fTech', 'technician_id'], ['#fFrom', 'from'], ['#fTo', 'to']].forEach(([s, k]) =>
    $(s, ctx.el)?.addEventListener('change', (e) => { q[k] = e.target.value; q.page = 1; load(); }));
  $('#btnNew', ctx.el).addEventListener('click', () => openReportForm(null));
  $('#btnExport', ctx.el)?.addEventListener('click', () => api.download('/repairs/export', q).catch(toastError));
  await load();
}

async function detail(ctx) {
  const r = await api.get(`/repairs/${ctx.params.id}`);
  if (!ctx.isCurrent()) return;
  ctx.setTitle(`Phiếu sửa chữa ${r.code}`);
  const manage = can(state.user, 'repair.manage');
  const open = ['pending', 'in_progress', 'warranty'].includes(r.status);
  const techs = state.cat.users.filter((x) => ['admin', 'manager', 'technician'].includes(x.role));
  const steps = [
    ['Tiếp nhận', r.report_date, true],
    ['Đang xử lý', r.start_date, !!r.start_date],
    ['Hoàn thành', r.finish_date, ['done', 'unrepairable'].includes(r.status)],
  ];
  ctx.el.innerHTML = `
    <div class="page-head"><div style="flex:1"><h2>Phiếu sửa chữa ${esc(r.code)}</h2><div class="sub">${badge(REPAIR_STATUS, r.status)} ${badge(REPAIR_PRIORITY, r.priority)} · Báo ngày ${fmtDate(r.report_date)}</div></div>
      <a class="btn" href="#/repairs">← Danh sách</a>
      ${manage && r.status === 'pending' ? '<button class="btn btn-primary" id="bStart">▶ Tiếp nhận xử lý</button>' : ''}
      ${manage && open ? '<button class="btn btn-success" id="bDone">✔ Cập nhật kết quả</button>' : ''}
      ${manage ? '<button class="btn" id="bEdit">✏️ Sửa</button>' : ''}
      <button class="btn" id="bPrint">🖨️ In phiếu</button>
      ${manage && ['pending', 'cancelled'].includes(r.status) ? '<button class="btn btn-danger" id="bDel">Xóa</button>' : ''}
    </div>
    <div class="grid-3">
      <div class="card"><div class="card-body"><dl class="dl">
        <dt>Thiết bị</dt><dd><a href="#/devices/${r.device_id}">${esc(r.asset_code)}</a> - ${esc(r.device_name)}</dd>
        <dt>Model / Serial</dt><dd>${esc([r.model, r.serial_number].filter(Boolean).join(' / '))}</dd>
        <dt>Phòng ban / Người SD</dt><dd>${esc(r.department_name || 'Kho')}${r.assigned_to ? ' - ' + esc(r.assigned_to) : ''}</dd>
        <dt>Bảo hành</dt><dd>${r.warranty_end ? `${fmtDate(r.warranty_end)} ${r.warranty_end >= todayStr() ? '<span class="badge badge-green">Còn bảo hành</span>' : '<span class="badge badge-gray">Hết bảo hành</span>'}` : 'Không có thông tin'}</dd>
        <dt>Người báo</dt><dd>${esc(r.reporter_name || '')} ${r.reporter_phone ? '· ' + esc(r.reporter_phone) : ''}</dd>
        <dt>Hiện tượng</dt><dd style="white-space:pre-line">${esc(r.problem)}</dd>
        <dt>Người xử lý</dt><dd>${esc(r.technician_name || '')}</dd>
        <dt>Hình thức</dt><dd>${esc(REPAIR_TYPE[r.repair_type] || '')}${r.vendor ? ' - ' + esc(r.vendor) : ''}</dd>
        <dt>Chẩn đoán</dt><dd style="white-space:pre-line">${esc(r.diagnosis || '')}</dd>
        <dt>Biện pháp khắc phục</dt><dd style="white-space:pre-line">${esc(r.solution || '')}</dd>
        <dt>Linh kiện thay thế</dt><dd>${esc(r.parts_replaced || '')}</dd>
        <dt>Chi phí</dt><dd><b>${fmtMoney(r.cost)} đ</b></dd>
        <dt>Ghi chú</dt><dd>${esc(r.note || '')}</dd>
      </dl></div></div>
      <div class="card"><div class="card-header"><h3>Tiến độ</h3></div><div class="card-body"><ul class="timeline">
        ${steps.map(([l, d, done]) => `<li style="${done ? '' : 'opacity:.45'}"><b>${l}</b><div class="t">${d ? fmtDate(d) : 'Chưa thực hiện'}</div></li>`).join('')}
      </ul><p class="text-muted" style="font-size:12px">Cập nhật lần cuối: ${fmtDateTime(r.updated_at)}</p></div></div>
    </div>`;

  const reload = () => { refreshAlerts(); detail(ctx); };
  $('#bPrint', ctx.el).addEventListener('click', () => printRepair(r));
  $('#bStart', ctx.el)?.addEventListener('click', () => formModal({
    title: 'Tiếp nhận xử lý', size: '',
    fields: [
      { name: 'technician_id', label: 'Người xử lý', type: 'select', options: options(techs, { label: 'full_name', selected: r.technician_id || state.user.id }), col: 6 },
      { name: 'repair_type', label: 'Hình thức', type: 'select', options: mapOptions(REPAIR_TYPE, r.warranty_end >= todayStr() ? 'warranty' : 'internal'), col: 6 },
      { name: 'vendor', label: 'Đơn vị sửa chữa / bảo hành (nếu thuê ngoài)' },
      { name: 'diagnosis', label: 'Chẩn đoán ban đầu', type: 'textarea' },
    ],
    submitText: 'Bắt đầu xử lý',
    onSubmit: async (d) => {
      await api.put(`/repairs/${r.id}`, { ...d, status: d.repair_type === 'warranty' ? 'warranty' : 'in_progress' });
      toast('Đã tiếp nhận yêu cầu');
      reload();
    },
  }));
  $('#bDone', ctx.el)?.addEventListener('click', () => formModal({
    title: 'Cập nhật kết quả sửa chữa',
    fields: [
      { name: 'status', label: 'Kết quả', type: 'select', options: mapOptions({ done: REPAIR_STATUS.done, unrepairable: REPAIR_STATUS.unrepairable, in_progress: REPAIR_STATUS.in_progress, warranty: REPAIR_STATUS.warranty, cancelled: REPAIR_STATUS.cancelled }, 'done'), col: 6 },
      { name: 'finish_date', label: 'Ngày hoàn thành', type: 'date', default: todayStr(), col: 6 },
      { name: 'diagnosis', label: 'Nguyên nhân / chẩn đoán', type: 'textarea' },
      { name: 'solution', label: 'Biện pháp khắc phục', type: 'textarea' },
      { name: 'parts_replaced', label: 'Linh kiện thay thế', col: 8 },
      { name: 'cost', label: 'Chi phí (đồng)', type: 'money', col: 4 },
    ],
    values: r,
    submitText: 'Lưu kết quả',
    onSubmit: async (d) => {
      if (!['done', 'unrepairable'].includes(d.status)) d.finish_date = null;
      await api.put(`/repairs/${r.id}`, d);
      toast('Đã cập nhật kết quả');
      reload();
    },
  }));
  $('#bEdit', ctx.el)?.addEventListener('click', () => formModal({
    title: 'Sửa phiếu sửa chữa',
    fields: [
      { name: 'problem', label: 'Hiện tượng', type: 'textarea', required: true },
      { name: 'priority', label: 'Mức độ', type: 'select', options: mapOptions(REPAIR_PRIORITY, r.priority), col: 4 },
      { name: 'technician_id', label: 'Người xử lý', type: 'select', options: options(techs, { label: 'full_name', selected: r.technician_id, empty: '--' }), col: 4 },
      { name: 'repair_type', label: 'Hình thức', type: 'select', options: mapOptions(REPAIR_TYPE, r.repair_type, '--'), col: 4 },
      { name: 'vendor', label: 'Đơn vị sửa chữa', col: 6 },
      { name: 'cost', label: 'Chi phí (đồng)', type: 'money', col: 6 },
      { name: 'start_date', label: 'Ngày bắt đầu', type: 'date', col: 6 },
      { name: 'finish_date', label: 'Ngày hoàn thành', type: 'date', col: 6 },
      { name: 'diagnosis', label: 'Chẩn đoán', type: 'textarea' },
      { name: 'solution', label: 'Biện pháp khắc phục', type: 'textarea' },
      { name: 'parts_replaced', label: 'Linh kiện thay thế' },
      { name: 'note', label: 'Ghi chú', type: 'textarea' },
    ],
    values: r,
    onSubmit: async (d) => { await api.put(`/repairs/${r.id}`, d); toast('Đã lưu'); reload(); },
  }));
  $('#bDel', ctx.el)?.addEventListener('click', async () => {
    if (!(await confirmDialog(`Xóa phiếu ${esc(r.code)}?`, { danger: true, okText: 'Xóa' }))) return;
    try { await api.del(`/repairs/${r.id}`); toast('Đã xóa'); navigate('/repairs'); } catch (e) { toastError(e); }
  });
}
