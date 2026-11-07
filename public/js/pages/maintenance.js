import { api } from '../api.js';
import { state, setQuery, refreshAlerts } from '../app.js';
import { MAINT_STATUS, can } from '../constants.js';
import { $, $$, esc, fmtDate, fmtMoney, badge, toast, toastError, options, pager, bindPager, debounce, formModal, devicePicker, todayStr, confirmDialog } from '../ui.js';

export default async function maintenance(ctx) {
  ctx.setTitle('Bảo trì định kỳ');
  const w = can(state.user, 'maintenance.write');
  const q = { page: 1, pageSize: 20, status: 'planned', ...ctx.query };
  q.page = Number(q.page); q.pageSize = Number(q.pageSize);
  const techs = state.cat.users.filter((x) => ['admin', 'manager', 'technician'].includes(x.role));
  ctx.el.innerHTML = `
    <div class="page-head"><h2>Bảo trì định kỳ</h2>${w ? '<button class="btn btn-primary" id="btnNew">＋ Lập kế hoạch bảo trì</button>' : ''}</div>
    <div class="card"><div class="card-body" style="padding-bottom:0">
      <div class="chips mb" id="quick">
        <span class="chip" data-st="planned">Kế hoạch</span><span class="chip" data-st="overdue">Quá hạn</span><span class="chip" data-st="upcoming">Sắp đến hạn</span>
        <span class="chip" data-st="done">Đã thực hiện</span><span class="chip" data-st="skipped">Bỏ qua</span><span class="chip" data-st="all">Tất cả</span>
      </div>
      <div class="toolbar"><input class="search" type="search" id="fQ" placeholder="🔍 Nội dung, mã thiết bị..." value="${esc(q.q || '')}">
        <select id="fDept">${options(state.cat.departments, { selected: q.department_id, empty: 'Tất cả phòng ban' })}</select>
        <label>Từ <input type="date" id="fFrom" value="${esc(q.from || '')}"></label><label>Đến <input type="date" id="fTo" value="${esc(q.to || '')}"></label></div>
    </div><div id="tbl"></div></div>`;
  const t = todayStr();
  const load = async () => {
    $$('#quick .chip', ctx.el).forEach((c) => c.classList.toggle('active', c.dataset.st === q.status));
    setQuery({ ...q, page: q.page > 1 ? q.page : '' });
    const data = await api.get('/maintenances', { ...q, status: q.status === 'all' ? '' : q.status });
    if (!ctx.isCurrent()) return;
    $('#tbl', ctx.el).innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Nội dung bảo trì</th><th>Thiết bị</th><th>Ngày dự kiến</th><th>Chu kỳ</th><th>Phụ trách</th><th>Thực hiện</th><th class="num">Chi phí</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>${data.rows.map((m) => {
    const overdue = m.status === 'planned' && m.scheduled_date < t;
    return `<tr><td><b>${esc(m.title)}</b>${m.note ? `<div class="muted">${esc(m.note)}</div>` : ''}</td>
        <td>${m.device_id ? `<a href="#/devices/${m.device_id}">${esc(m.asset_code)}</a> ${esc(m.device_name)}<div class="muted">${esc(m.department_name || 'Kho')}</div>` : '<span class="text-muted">Chung</span>'}</td>
        <td class="nowrap ${overdue ? 'text-red' : ''}">${fmtDate(m.scheduled_date)}${overdue ? ' ⚠️' : ''}</td>
        <td>${m.interval_months ? `${m.interval_months} tháng` : 'Một lần'}</td><td>${esc(m.assignee_name || '')}</td>
        <td>${m.done_date ? `${fmtDate(m.done_date)} · ${esc(m.performer || '')}<div class="muted">${esc(m.result || m.content || '')}</div>` : ''}</td>
        <td class="num">${m.cost ? fmtMoney(m.cost) : ''}</td><td>${badge(MAINT_STATUS, m.status)}</td>
        <td class="nowrap">${w && m.status === 'planned' ? `<button class="btn btn-sm btn-success" data-done="${m.id}">✔ Thực hiện</button> <button class="link-btn" data-skip="${m.id}">Bỏ qua</button> ` : ''}
          ${w ? `<button class="link-btn" data-edit="${m.id}">Sửa</button> <button class="link-btn danger" data-del="${m.id}">Xóa</button>` : ''}</td></tr>`;
  }).join('')}</tbody></table>${data.rows.length ? '' : '<div class="empty">Không có lịch bảo trì</div>'}</div>${pager(data.total, data.page, data.pageSize)}`;
    bindPager($('#tbl', ctx.el), (p) => { Object.assign(q, p); load(); });
    const find = (id) => data.rows.find((x) => x.id === Number(id));
    $$('[data-done]', ctx.el).forEach((b) => b.addEventListener('click', () => complete(find(b.dataset.done))));
    $$('[data-skip]', ctx.el).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmDialog('Bỏ qua lần bảo trì này? Nếu có chu kỳ, hệ thống sẽ tự tạo lịch kỳ tiếp theo.'))) return;
      try { await api.post(`/maintenances/${b.dataset.skip}/complete`, { skip: true }); toast('Đã bỏ qua'); refreshAlerts(); load(); } catch (e) { toastError(e); }
    }));
    $$('[data-edit]', ctx.el).forEach((b) => b.addEventListener('click', () => edit(find(b.dataset.edit))));
    $$('[data-del]', ctx.el).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmDialog('Xóa lịch bảo trì này?', { danger: true, okText: 'Xóa' }))) return;
      try { await api.del(`/maintenances/${b.dataset.del}`); toast('Đã xóa'); load(); } catch (e) { toastError(e); }
    }));
  };

  const complete = (m) => formModal({
    title: `Ghi nhận thực hiện: ${m.title}`,
    fields: [
      { name: 'done_date', label: 'Ngày thực hiện', type: 'date', default: todayStr(), col: 6, required: true },
      { name: 'performer', label: 'Người thực hiện', default: state.user.full_name, col: 6 },
      { name: 'content', label: 'Nội dung công việc', type: 'textarea', default: m.title },
      { name: 'result', label: 'Kết quả / tình trạng sau bảo trì', col: 8 },
      { name: 'cost', label: 'Chi phí (đồng)', type: 'money', col: 4 },
      ...(m.interval_months ? [{ type: 'html', html: `<div class="alert alert-info" style="margin:0">Hệ thống sẽ tự tạo lịch bảo trì kỳ tiếp theo sau ${m.interval_months} tháng.</div>` }] : []),
    ],
    submitText: 'Hoàn thành',
    onSubmit: async (d) => { await api.post(`/maintenances/${m.id}/complete`, d); toast('Đã ghi nhận bảo trì'); refreshAlerts(); load(); },
  });

  const edit = (m) => formModal({
    title: 'Sửa lịch bảo trì',
    fields: [
      { name: 'title', label: 'Nội dung', required: true },
      { name: 'scheduled_date', label: 'Ngày dự kiến', type: 'date', col: 4, required: true },
      { name: 'interval_months', label: 'Chu kỳ (tháng, 0 = một lần)', type: 'number', col: 4 },
      { name: 'assignee_id', label: 'Người phụ trách', type: 'select', options: options(techs, { label: 'full_name', selected: m.assignee_id, empty: '--' }), col: 4 },
      { name: 'note', label: 'Ghi chú', type: 'textarea' },
    ],
    values: m,
    onSubmit: async (d) => { await api.put(`/maintenances/${m.id}`, d); toast('Đã lưu'); load(); },
  });

  $('#btnNew', ctx.el)?.addEventListener('click', () => {
    const picked = [];
    const m = formModal({
      title: 'Lập kế hoạch bảo trì',
      fields: [
        { name: 'title', label: 'Nội dung bảo trì', required: true, placeholder: 'VD: Vệ sinh máy tính, kiểm tra ắc quy UPS, cập nhật firmware...' },
        { name: 'scheduled_date', label: 'Ngày dự kiến', type: 'date', required: true, default: todayStr(), col: 4 },
        { name: 'interval_months', label: 'Lặp lại sau (tháng)', type: 'number', default: 6, col: 4, help: '0 = chỉ thực hiện một lần' },
        { name: 'assignee_id', label: 'Người phụ trách', type: 'select', options: options(techs, { label: 'full_name', selected: state.user.id, empty: '--' }), col: 4 },
        { type: 'section', label: 'Phạm vi áp dụng' },
        { name: 'scope', label: 'Áp dụng cho', type: 'select', options: options([{ id: 'devices', name: 'Các thiết bị được chọn' }, { id: 'filter', name: 'Tất cả thiết bị theo loại / phòng ban' }, { id: 'none', name: 'Công việc chung (không gắn thiết bị)' }], { selected: 'devices' }), col: 4 },
        { name: 'category_id', label: 'Loại thiết bị', type: 'select', options: state.cat.categories, empty: 'Tất cả', col: 4 },
        { name: 'department_id', label: 'Phòng ban', type: 'select', options: state.cat.departments, empty: 'Tất cả', col: 4 },
        { type: 'html', html: '<div id="mPick"></div><div id="mList" class="chips" style="margin-top:8px"></div>' },
        { name: 'note', label: 'Ghi chú', type: 'textarea', rows: 2 },
      ],
      submitText: 'Lập kế hoạch',
      onSubmit: async (d) => {
        const body = { title: d.title, scheduled_date: d.scheduled_date, interval_months: d.interval_months || 0, assignee_id: d.assignee_id, note: d.note };
        if (d.scope === 'devices') {
          if (!picked.length) throw new Error('Vui lòng chọn ít nhất một thiết bị');
          body.device_ids = picked.map((x) => x.id);
        } else if (d.scope === 'filter') {
          if (!d.category_id && !d.department_id) throw new Error('Vui lòng chọn loại thiết bị hoặc phòng ban');
          body.category_id = d.category_id; body.department_id = d.department_id;
        }
        const r = await api.post('/maintenances', body);
        toast(`Đã lập ${r.count} lịch bảo trì`);
        refreshAlerts();
        load();
      },
    });
    const renderPicked = () => {
      $('#mList', m.el).innerHTML = picked.map((d, i) => `<span class="chip" data-i="${i}" title="Bấm để bỏ">${esc(d.asset_code)} ✕</span>`).join('');
      $$('#mList .chip', m.el).forEach((c) => c.addEventListener('click', () => { picked.splice(Number(c.dataset.i), 1); renderPicked(); }));
    };
    devicePicker($('#mPick', m.el), { onPick: (d) => { if (!picked.some((x) => x.id === d.id)) picked.push(d); renderPicked(); } });
    const f = $('form', m.el);
    const sync = () => {
      const s = f.elements.scope.value;
      $('#mPick', m.el).parentElement.classList.toggle('hidden', s !== 'devices');
      f.elements.category_id.closest('label').classList.toggle('hidden', s !== 'filter');
      f.elements.department_id.closest('label').classList.toggle('hidden', s !== 'filter');
    };
    f.elements.scope.addEventListener('change', sync);
    sync();
  });

  $$('#quick .chip', ctx.el).forEach((c) => c.addEventListener('click', () => { q.status = c.dataset.st; q.page = 1; load(); }));
  $('#fQ', ctx.el).addEventListener('input', debounce(() => { q.q = $('#fQ', ctx.el).value; q.page = 1; load(); }));
  [['#fDept', 'department_id'], ['#fFrom', 'from'], ['#fTo', 'to']].forEach(([s, k]) => $(s, ctx.el).addEventListener('change', (e) => { q[k] = e.target.value; q.page = 1; load(); }));
  await load();
}
