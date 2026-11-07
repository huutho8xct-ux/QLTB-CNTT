import { api } from '../api.js';
import { state } from '../app.js';
import { ROLES } from '../constants.js';
import { $, esc, toast, toastError, renderForm, collectForm } from '../ui.js';

export default async function profile(ctx) {
  ctx.setTitle('Hồ sơ cá nhân');
  const u = state.user;
  const pf = [
    { name: 'full_name', label: 'Họ và tên', required: true, col: 6 }, { name: 'position', label: 'Chức vụ', col: 6 },
    { name: 'email', label: 'Email', type: 'email', col: 6 }, { name: 'phone', label: 'Điện thoại', col: 6 },
  ];
  const pw = [
    { name: 'old_password', label: 'Mật khẩu hiện tại', type: 'password', required: true },
    { name: 'new_password', label: 'Mật khẩu mới', type: 'password', required: true, help: 'Tối thiểu 8 ký tự, gồm chữ và số' },
    { name: 'confirm', label: 'Nhập lại mật khẩu mới', type: 'password', required: true },
  ];
  ctx.el.innerHTML = `
    <div class="page-head"><h2>Hồ sơ cá nhân</h2></div>
    <div class="grid-2">
      <div class="card"><div class="card-header"><h3>Thông tin tài khoản</h3></div><div class="card-body">
        <p class="text-muted">Tên đăng nhập: <b>${esc(u.username)}</b> · Vai trò: <b>${esc(ROLES[u.role])}</b>${u.department_name ? ` · Phòng ban: <b>${esc(u.department_name)}</b>` : ''}</p>
        <div id="pf">${renderForm(pf, u)}</div></div>
        <div class="modal-footer"><button class="btn btn-primary" id="savePf">Lưu thông tin</button></div></div>
      <div class="card"><div class="card-header"><h3>Đổi mật khẩu</h3></div><div class="card-body"><div id="pw">${renderForm(pw)}</div></div>
        <div class="modal-footer"><button class="btn btn-primary" id="savePw">Đổi mật khẩu</button></div></div>
    </div>`;
  $('#savePf', ctx.el).addEventListener('click', async () => {
    try {
      const d = collectForm($('#pf form', ctx.el), pf);
      await api.put('/auth/profile', d);
      Object.assign(state.user, d);
      toast('Đã cập nhật thông tin');
    } catch (e) { toastError(e); }
  });
  $('#savePw', ctx.el).addEventListener('click', async () => {
    try {
      const f = $('#pw form', ctx.el);
      const d = collectForm(f, pw);
      if (d.new_password !== d.confirm) throw new Error('Mật khẩu nhập lại không khớp');
      await api.post('/auth/change-password', d);
      f.reset();
      toast('Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.');
    } catch (e) { toastError(e); }
  });
}
