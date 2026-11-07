import { api } from '../api.js';
import { setQuery } from '../app.js';
import { $, esc, fmtDateTime, pager, bindPager, debounce } from '../ui.js';

export default async function audit(ctx) {
  ctx.setTitle('Nhật ký hệ thống');
  const q = { page: 1, pageSize: 50, ...ctx.query };
  q.page = Number(q.page); q.pageSize = Number(q.pageSize);
  ctx.el.innerHTML = `
    <div class="page-head"><h2>Nhật ký hệ thống</h2><div class="sub">Ghi nhận toàn bộ thao tác đăng nhập, thêm, sửa, xóa dữ liệu</div></div>
    <div class="card"><div class="card-body" style="padding-bottom:0"><div class="toolbar">
      <input class="search" type="search" id="fQ" placeholder="🔍 Người dùng, thao tác, nội dung..." value="${esc(q.q || '')}">
      <label>Từ <input type="date" id="fFrom" value="${esc(q.from || '')}"></label><label>Đến <input type="date" id="fTo" value="${esc(q.to || '')}"></label>
    </div></div><div id="tbl"></div></div>`;
  const load = async () => {
    setQuery({ ...q, page: q.page > 1 ? q.page : '', pageSize: q.pageSize !== 50 ? q.pageSize : '' });
    const data = await api.get('/system/audit-logs', q);
    if (!ctx.isCurrent()) return;
    $('#tbl', ctx.el).innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Thời gian</th><th>Người dùng</th><th>Thao tác</th><th>Đối tượng</th><th>Chi tiết</th><th>IP</th></tr></thead>
      <tbody>${data.rows.map((r) => `<tr><td class="nowrap">${fmtDateTime(r.created_at)}</td><td>${esc(r.username || '')}</td>
        <td><b class="${/thất bại|Xóa/i.test(r.action) ? 'text-red' : ''}">${esc(r.action)}</b></td><td class="muted">${esc(r.entity || '')}${r.entity_id ? ' #' + r.entity_id : ''}</td>
        <td style="max-width:480px;word-break:break-word">${esc(r.detail || '')}</td><td class="muted">${esc(r.ip || '')}</td></tr>`).join('')}</tbody></table></div>
      ${pager(data.total, data.page, data.pageSize)}`;
    bindPager($('#tbl', ctx.el), (p) => { Object.assign(q, p); load(); });
  };
  $('#fQ', ctx.el).addEventListener('input', debounce(() => { q.q = $('#fQ', ctx.el).value; q.page = 1; load(); }));
  [['#fFrom', 'from'], ['#fTo', 'to']].forEach(([s, k]) => $(s, ctx.el).addEventListener('change', (e) => { q[k] = e.target.value; q.page = 1; load(); }));
  await load();
}
