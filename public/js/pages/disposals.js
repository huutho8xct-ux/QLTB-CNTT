import { api } from '../api.js';
import { state, navigate } from '../app.js';
import { DISPOSAL_STATUS, DISPOSAL_METHOD, CONDITIONS, can, labelOf, calcDepreciation } from '../constants.js';
import { $, $$, esc, fmtDate, fmtMoney, badge, toast, toastError, mapOptions, devicePicker, todayStr, confirmDialog, formModal, statusBadge } from '../ui.js';
import { printDisposal } from '../print.js';

export default async function disposals(ctx) {
  if (ctx.view === 'form') return form(ctx);
  if (ctx.view === 'detail') return detail(ctx);
  return list(ctx);
}

async function list(ctx) {
  ctx.setTitle('Thanh lý tài sản');
  const rows = await api.get('/disposals');
  ctx.el.innerHTML = `
    <div class="page-head"><h2>Thanh lý tài sản, thiết bị</h2>${can(state.user, 'disposal.write') ? '<a class="btn btn-primary" href="#/disposals/new">＋ Lập hồ sơ thanh lý</a>' : ''}</div>
    <div class="alert alert-info">Quy trình: Lập hồ sơ đề nghị thanh lý → Lãnh đạo phê duyệt (ghi số quyết định) → Tổ chức thanh lý và ghi nhận kết quả (ghi giảm tài sản).</div>
    <div class="card"><div class="table-wrap"><table class="table">
      <thead><tr><th>Số hồ sơ</th><th>Ngày lập</th><th>Hình thức</th><th>Lý do</th><th class="center">Số TS</th><th class="num">Nguyên giá</th><th class="num">GT còn lại</th><th>Quyết định</th><th>Trạng thái</th></tr></thead>
      <tbody>${rows.map((x) => `<tr><td><a href="#/disposals/${x.id}"><b>${esc(x.code)}</b></a></td><td class="nowrap">${fmtDate(x.doc_date)}</td>
        <td>${esc(labelOf(DISPOSAL_METHOD, x.method))}</td><td>${esc(x.reason || '')}</td><td class="center">${x.item_count}</td>
        <td class="num">${fmtMoney(x.total_original)}</td><td class="num">${fmtMoney(x.total_remaining)}</td><td>${esc(x.decision_no || '')}</td><td>${badge(DISPOSAL_STATUS, x.status)}</td></tr>`).join('')}</tbody>
    </table>${rows.length ? '' : '<div class="empty">Chưa có hồ sơ thanh lý</div>'}</div></div>`;
}

async function form(ctx) {
  if (!can(state.user, 'disposal.write')) throw new Error('Bạn không có quyền lập hồ sơ thanh lý');
  ctx.setTitle('Lập hồ sơ thanh lý');
  const items = [];
  if (ctx.query.ids) {
    const r = await api.get('/devices', { ids: ctx.query.ids, pageSize: 500 });
    items.push(...r.rows.filter((d) => !['disposed', 'pending_disposal'].includes(d.status)));
  }
  ctx.el.innerHTML = `
    <div class="page-head"><h2>Lập hồ sơ đề nghị thanh lý</h2><a class="btn" href="#/disposals">← Quay lại</a></div>
    <div class="card mb"><div class="card-body"><form class="form-grid" id="f">
      <label class="field c3"><span>Ngày lập</span><input type="date" name="doc_date" value="${todayStr()}"></label>
      <label class="field c5"><span>Hình thức thanh lý</span><select name="method">${mapOptions(DISPOSAL_METHOD, 'sell')}</select></label>
      <label class="field c12"><span>Lý do thanh lý <span class="req">*</span></span><textarea name="reason" rows="2" placeholder="VD: Thiết bị đã hết thời gian sử dụng theo quy định, hư hỏng không thể sửa chữa hoặc chi phí sửa chữa lớn..."></textarea></label>
      <label class="field c12"><span>Ghi chú</span><input name="note"></label>
    </form></div></div>
    <div class="card"><div class="card-header"><h3>Tài sản đề nghị thanh lý</h3><div style="flex:2" id="picker"></div></div><div id="items"></div>
      <div class="modal-footer"><a class="btn" href="#/disposals">Hủy</a><button class="btn btn-primary" id="save">💾 Lưu hồ sơ</button></div></div>`;
  const render = () => {
    const t = todayStr();
    let tp = 0, tr = 0;
    const rows = items.map((d, i) => {
      const rem = calcDepreciation(d, t, state.settings.depreciation_method).remaining;
      tp += d.original_price || 0; tr += rem;
      return `<tr><td>${i + 1}</td><td><b>${esc(d.asset_code)}</b></td><td>${esc(d.name)}</td><td>${esc(d.department_name || 'Kho')}</td><td>${statusBadge(d.status)}</td>
        <td>${esc(labelOf(CONDITIONS, d.condition))}</td><td class="num">${fmtMoney(d.original_price)}</td><td class="num">${fmtMoney(rem)}</td><td><button class="link-btn danger" data-rm="${i}">Bỏ</button></td></tr>`;
    });
    $('#items', ctx.el).innerHTML = items.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Mã TS</th><th>Tên</th><th>Phòng ban</th><th>Trạng thái</th><th>Tình trạng</th><th class="num">Nguyên giá</th><th class="num">GT còn lại (ước tính)</th><th></th></tr></thead>
      <tbody>${rows.join('')}</tbody><tfoot><tr><td colspan="6">Tổng cộng</td><td class="num">${fmtMoney(tp)}</td><td class="num">${fmtMoney(tr)}</td><td></td></tr></tfoot></table></div>`
      : '<div class="empty">Tìm và chọn thiết bị cần thanh lý (thường là thiết bị Hỏng hoặc hết thời gian sử dụng)</div>';
    $$('[data-rm]', ctx.el).forEach((b) => b.addEventListener('click', () => { items.splice(Number(b.dataset.rm), 1); render(); }));
  };
  devicePicker($('#picker', ctx.el), {
    params: { status: 'in_use,in_stock,broken,repairing,lost' },
    onPick: (d) => { if (!items.some((x) => x.id === d.id)) items.push(d); render(); },
  });
  render();
  $('#save', ctx.el).addEventListener('click', async () => {
    try {
      const fd = Object.fromEntries(new FormData($('#f', ctx.el)));
      const r = await api.post('/disposals', { ...fd, device_ids: items.map((d) => d.id) });
      toast(`Đã lập hồ sơ ${r.code}`);
      navigate(`/disposals/${r.id}`);
    } catch (e) { toastError(e); }
  });
}

async function detail(ctx) {
  const x = await api.get(`/disposals/${ctx.params.id}`);
  if (!ctx.isCurrent()) return;
  ctx.setTitle(`Hồ sơ thanh lý ${x.code}`);
  const u = state.user;
  const tp = x.items.reduce((a, i) => a + (i.original_price || 0), 0);
  const tr = x.items.reduce((a, i) => a + (i.remaining_value || 0), 0);
  ctx.el.innerHTML = `
    <div class="page-head"><div style="flex:1"><h2>Hồ sơ thanh lý ${esc(x.code)}</h2><div class="sub">${badge(DISPOSAL_STATUS, x.status)} · Lập ngày ${fmtDate(x.doc_date)} bởi ${esc(x.created_by_name || '')}</div></div>
      <a class="btn" href="#/disposals">← Danh sách</a>
      ${x.status === 'proposed' && can(u, 'disposal.approve') ? '<button class="btn btn-success" id="bApprove">✔ Phê duyệt</button><button class="btn btn-danger" id="bReject">✕ Không duyệt</button>' : ''}
      ${x.status === 'approved' && can(u, 'disposal.write') ? '<button class="btn btn-success" id="bComplete">✔ Hoàn thành thanh lý</button>' : ''}
      ${can(u, 'disposal.write') && x.status !== 'completed' ? '<button class="btn" id="bEdit">✏️ Sửa</button>' : ''}
      <button class="btn" id="bPrint">🖨️ In</button>
      ${can(u, 'disposal.write') && ['proposed', 'rejected'].includes(x.status) ? '<button class="btn btn-danger" id="bDel">Xóa</button>' : ''}
    </div>
    <div class="card mb"><div class="card-body"><dl class="dl">
      <dt>Hình thức</dt><dd>${esc(labelOf(DISPOSAL_METHOD, x.method))}</dd><dt>Lý do</dt><dd>${esc(x.reason || '')}</dd>
      <dt>Quyết định</dt><dd>${esc(x.decision_no || '')} ${x.decision_date ? 'ngày ' + fmtDate(x.decision_date) : ''} ${x.approved_by ? '· ' + esc(x.approved_by) : ''}</dd>
      ${x.status === 'completed' ? `<dt>Ngày thanh lý</dt><dd>${fmtDate(x.completed_date)}</dd><dt>Số tiền thu được</dt><dd>${fmtMoney(x.revenue)} đ</dd><dt>Chi phí thanh lý</dt><dd>${fmtMoney(x.expense)} đ</dd>` : ''}
      <dt>Ghi chú</dt><dd>${esc(x.note || '')}</dd>
    </dl></div></div>
    <div class="card"><div class="card-header"><h3>Danh mục tài sản (${x.items.length})</h3></div><div class="table-wrap"><table class="table">
      <thead><tr><th>#</th><th>Mã TS</th><th>Tên</th><th>Loại</th><th>Năm SD</th><th>Tình trạng</th><th class="num">Nguyên giá</th><th class="num">GT còn lại</th></tr></thead>
      <tbody>${x.items.map((i, k) => `<tr><td>${k + 1}</td><td><a href="#/devices/${i.device_id}">${esc(i.asset_code)}</a></td><td>${esc(i.name)}</td><td>${esc(i.category_name || '')}</td>
        <td>${esc((i.in_use_date || i.purchase_date || '').slice(0, 4))}</td><td>${esc(labelOf(CONDITIONS, i.condition))}</td><td class="num">${fmtMoney(i.original_price)}</td><td class="num">${fmtMoney(i.remaining_value)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="6">Tổng cộng</td><td class="num">${fmtMoney(tp)}</td><td class="num">${fmtMoney(tr)}</td></tr></tfoot>
    </table></div></div>`;
  const reload = () => detail(ctx);
  $('#bPrint', ctx.el).addEventListener('click', () => printDisposal(x));
  $('#bApprove', ctx.el)?.addEventListener('click', () => formModal({
    title: 'Phê duyệt thanh lý', size: '',
    fields: [{ name: 'decision_no', label: 'Số quyết định', placeholder: 'VD: 25/QĐ-...', col: 6 }, { name: 'decision_date', label: 'Ngày quyết định', type: 'date', default: todayStr(), col: 6 }, { name: 'note', label: 'Ý kiến', type: 'textarea' }],
    values: x, submitText: 'Phê duyệt',
    onSubmit: async (d) => { await api.post(`/disposals/${x.id}/approve`, { ...d, approve: true }); toast('Đã phê duyệt'); reload(); },
  }));
  $('#bReject', ctx.el)?.addEventListener('click', () => formModal({
    title: 'Không phê duyệt thanh lý', size: '',
    fields: [{ name: 'note', label: 'Lý do không phê duyệt', type: 'textarea', required: true }],
    submitText: 'Xác nhận',
    onSubmit: async (d) => { await api.post(`/disposals/${x.id}/approve`, { ...d, approve: false }); toast('Đã cập nhật'); reload(); },
  }));
  $('#bComplete', ctx.el)?.addEventListener('click', () => formModal({
    title: 'Hoàn thành thanh lý (ghi giảm tài sản)', size: '',
    fields: [
      { type: 'html', html: '<div class="alert alert-warn" style="margin:0">Sau khi hoàn thành, các thiết bị sẽ chuyển sang trạng thái <b>Đã thanh lý</b> và không còn trong danh sách đang quản lý.</div>' },
      { name: 'completed_date', label: 'Ngày thanh lý', type: 'date', default: todayStr(), col: 4 },
      { name: 'revenue', label: 'Số tiền thu được (đồng)', type: 'money', col: 4 },
      { name: 'expense', label: 'Chi phí thanh lý (đồng)', type: 'money', col: 4 },
    ],
    submitText: 'Hoàn thành',
    onSubmit: async (d) => { await api.post(`/disposals/${x.id}/complete`, d); toast('Đã hoàn thành thanh lý'); reload(); },
  }));
  $('#bEdit', ctx.el)?.addEventListener('click', () => formModal({
    title: 'Sửa hồ sơ thanh lý',
    fields: [
      { name: 'doc_date', label: 'Ngày lập', type: 'date', col: 4 },
      { name: 'method', label: 'Hình thức', type: 'select', options: mapOptions(DISPOSAL_METHOD, x.method), col: 8 },
      { name: 'reason', label: 'Lý do', type: 'textarea', required: true },
      { name: 'decision_no', label: 'Số quyết định', col: 6 }, { name: 'decision_date', label: 'Ngày quyết định', type: 'date', col: 6 },
      { name: 'note', label: 'Ghi chú', type: 'textarea' },
    ],
    values: x,
    onSubmit: async (d) => { await api.put(`/disposals/${x.id}`, d); toast('Đã lưu'); reload(); },
  }));
  $('#bDel', ctx.el)?.addEventListener('click', async () => {
    if (!(await confirmDialog(`Xóa hồ sơ ${esc(x.code)}? Các thiết bị sẽ trở lại trạng thái trước khi đề nghị thanh lý.`, { danger: true, okText: 'Xóa' }))) return;
    try { await api.del(`/disposals/${x.id}`); toast('Đã xóa'); navigate('/disposals'); } catch (e) { toastError(e); }
  });
}
