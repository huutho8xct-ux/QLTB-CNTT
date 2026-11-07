import { api } from '../api.js';
import { state, loadCatalogs } from '../app.js';
import { ROLES, PERMS } from '../constants.js';
import { $, $$, esc, fmtDateTime, toast, toastError, formModal, confirmDialog, mapOptions, modal } from '../ui.js';

const PERM_LABELS = {
  'view.all': 'Xem thiết bị toàn đơn vị', 'device.write': 'Thêm/sửa thiết bị', 'device.delete': 'Xóa thiết bị',
  'allocation.write': 'Cấp phát, điều chuyển, thu hồi', 'repair.create': 'Báo hỏng', 'repair.manage': 'Xử lý sửa chữa',
  'maintenance.write': 'Lập & thực hiện bảo trì', 'inventory.write': 'Tạo/hoàn thành kiểm kê', 'inventory.check': 'Kiểm đếm',
  'disposal.write': 'Lập hồ sơ thanh lý', 'disposal.approve': 'Phê duyệt thanh lý', 'license.write': 'Quản lý bản quyền',
  'catalog.write': 'Quản lý danh mục', 'report.view': 'Xem báo cáo', 'user.manage': 'Quản lý người dùng',
  'settings.write': 'Cấu hình hệ thống', 'audit.view': 'Xem nhật ký', backup: 'Sao lưu / phục hồi',
};

export default async function users(ctx) {
  ctx.setTitle('Quản lý người dùng');
  let rows = await api.get('/users');
  ctx.el.innerHTML = `
    <div class="page-head"><h2>Người dùng</h2><button class="btn" id="btnPerm">🔐 Bảng phân quyền</button><button class="btn btn-primary" id="btnNew">＋ Thêm người dùng</button></div>
    <div class="card"><div class="card-body" style="padding-bottom:0"><div class="toolbar"><input class="search" type="search" id="fQ" placeholder="🔍 Tìm kiếm..."></div></div><div id="tbl"></div></div>`;
  let search = '';
  const render = () => {
    const list = rows.filter((u) => !search || `${u.username} ${u.full_name} ${u.email || ''} ${u.department_name || ''}`.toLowerCase().includes(search));
    $('#tbl', ctx.el).innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Tên đăng nhập</th><th>Họ tên</th><th>Chức vụ</th><th>Phòng ban</th><th>Vai trò</th><th>Liên hệ</th><th>Đăng nhập gần nhất</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>${list.map((u) => `<tr><td><b>${esc(u.username)}</b></td><td>${esc(u.full_name)}</td><td>${esc(u.position || '')}</td><td>${esc(u.department_name || '')}</td>
        <td><span class="badge badge-${u.role === 'admin' ? 'red' : u.role === 'manager' ? 'blue' : u.role === 'technician' ? 'orange' : u.role === 'leader' ? 'purple' : 'gray'}">${esc(ROLES[u.role])}</span></td>
        <td class="muted">${esc([u.email, u.phone].filter(Boolean).join(' · '))}</td><td class="muted">${fmtDateTime(u.last_login)}</td>
        <td>${u.active ? '<span class="badge badge-green">Hoạt động</span>' : '<span class="badge badge-gray">Khóa</span>'}${u.locked_until && u.locked_until > new Date().toISOString() ? ' <span class="badge badge-red">Tạm khóa</span>' : ''}</td>
        <td class="nowrap"><button class="link-btn" data-edit="${u.id}">Sửa</button> · <button class="link-btn" data-pw="${u.id}">Đặt lại MK</button>
          ${u.locked_until ? ` · <button class="link-btn" data-unlock="${u.id}">Mở khóa</button>` : ''}
          ${u.id !== state.user.id ? ` · <button class="link-btn danger" data-del="${u.id}">Xóa</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
    const find = (id) => rows.find((u) => u.id === Number(id));
    $$('[data-edit]', ctx.el).forEach((b) => b.addEventListener('click', () => edit(find(b.dataset.edit))));
    $$('[data-pw]', ctx.el).forEach((b) => b.addEventListener('click', () => {
      const u = find(b.dataset.pw);
      formModal({
        title: `Đặt lại mật khẩu: ${u.username}`, size: 'sm',
        fields: [{ name: 'password', label: 'Mật khẩu mới', required: true, help: 'Người dùng sẽ phải đổi mật khẩu ở lần đăng nhập tiếp theo' }],
        values: { password: genPassword() },
        onSubmit: async (d) => { await api.post(`/users/${u.id}/reset-password`, d); toast(`Đã đặt lại mật khẩu cho ${u.username}`); },
      });
    }));
    $$('[data-unlock]', ctx.el).forEach((b) => b.addEventListener('click', async () => {
      try { await api.post(`/users/${b.dataset.unlock}/unlock`); toast('Đã mở khóa'); await reload(); } catch (e) { toastError(e); }
    }));
    $$('[data-del]', ctx.el).forEach((b) => b.addEventListener('click', async () => {
      const u = find(b.dataset.del);
      if (!(await confirmDialog(`Xóa tài khoản <b>${esc(u.username)}</b>? Nếu tài khoản đã phát sinh dữ liệu, hệ thống sẽ chuyển sang trạng thái khóa.`, { danger: true, okText: 'Xóa' }))) return;
      try { const r = await api.del(`/users/${u.id}`); toast(r.deactivated ? 'Tài khoản đã được khóa' : 'Đã xóa'); await reload(); } catch (e) { toastError(e); }
    }));
  };
  const reload = async () => { rows = await api.get('/users'); await loadCatalogs(); render(); };
  const edit = (u) => formModal({
    title: u ? `Sửa người dùng: ${u.username}` : 'Thêm người dùng',
    fields: [
      { name: 'username', label: 'Tên đăng nhập', required: true, col: 6 },
      ...(u ? [] : [{ name: 'password', label: 'Mật khẩu', required: true, col: 6, help: 'Tối thiểu 8 ký tự, có chữ và số' }]),
      { name: 'full_name', label: 'Họ và tên', required: true, col: 6 },
      { name: 'position', label: 'Chức vụ', col: 6 },
      { name: 'role', label: 'Vai trò', type: 'select', options: mapOptions(ROLES, u?.role || 'user'), col: 6, required: true },
      { name: 'department_id', label: 'Phòng ban', type: 'select', options: state.cat.departments, col: 6, help: 'Viên chức chỉ xem được thiết bị của phòng ban mình' },
      { name: 'email', label: 'Email', type: 'email', col: 6 }, { name: 'phone', label: 'Điện thoại', col: 6 },
      { name: 'active', label: 'Đang hoạt động', type: 'checkbox', col: 6 },
      ...(u ? [] : [{ name: 'must_change_password', label: 'Bắt buộc đổi mật khẩu khi đăng nhập lần đầu', type: 'checkbox', col: 6 }]),
    ],
    values: u || { active: 1, role: 'user', must_change_password: 1, password: genPassword() },
    onSubmit: async (d) => {
      if (u) await api.put(`/users/${u.id}`, d); else await api.post('/users', d);
      toast('Đã lưu');
      await reload();
    },
  });
  $('#btnNew', ctx.el).addEventListener('click', () => edit(null));
  $('#fQ', ctx.el).addEventListener('input', (e) => { search = e.target.value.toLowerCase(); render(); });
  $('#btnPerm', ctx.el).addEventListener('click', () => {
    const roles = Object.keys(ROLES);
    modal({
      title: 'Bảng phân quyền theo vai trò', size: 'xl',
      body: `<div class="table-wrap"><table class="table"><thead><tr><th>Chức năng</th>${roles.map((r) => `<th class="center">${esc(ROLES[r])}</th>`).join('')}</tr></thead>
        <tbody>${Object.entries(PERMS).map(([p, rs]) => `<tr><td>${esc(PERM_LABELS[p] || p)}</td>${roles.map((r) => `<td class="center">${rs.includes(r) ? '✔' : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
    });
  });
  render();
}

function genPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const arr = new Uint32Array(10);
  crypto.getRandomValues(arr);
  let s = '';
  for (let i = 0; i < 7; i++) s += chars[arr[i] % chars.length];
  return s + String(arr[8] % 900 + 100);
}
