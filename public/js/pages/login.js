import { api, auth } from '../api.js';
import { $, esc } from '../ui.js';

export default function login({ onLogin }) {
  document.title = 'Đăng nhập - QLTB-CNTT';
  $('#app').innerHTML = `
    <div class="login-page">
      <div class="login-hero">
        <h1>Phần mềm Quản lý<br>Thiết bị Công nghệ thông tin</h1>
        <p>Giải pháp quản lý toàn diện vòng đời tài sản, thiết bị CNTT dành cho đơn vị sự nghiệp công lập.</p>
        <ul>
          <li>Quản lý hồ sơ, cấu hình, mã QR từng thiết bị</li>
          <li>Cấp phát, điều chuyển, thu hồi có biên bản bàn giao</li>
          <li>Tiếp nhận báo hỏng, sửa chữa, bảo trì định kỳ</li>
          <li>Kiểm kê, thanh lý, tính hao mòn tài sản cố định</li>
          <li>Báo cáo thống kê, xuất Excel, in ấn theo mẫu</li>
        </ul>
      </div>
      <div class="login-form">
        <form class="box" id="loginForm">
          <h2>Đăng nhập hệ thống</h2>
          <div class="org">Vui lòng đăng nhập bằng tài khoản được cấp</div>
          <div id="loginErr"></div>
          <label class="field"><span>Tên đăng nhập</span><input name="username" autocomplete="username" required autofocus></label>
          <label class="field"><span>Mật khẩu</span><input name="password" type="password" autocomplete="current-password" required></label>
          <button class="btn btn-primary" type="submit">Đăng nhập</button>
          <p class="text-muted" style="font-size:12px;margin-top:20px;text-align:center">Quên mật khẩu? Liên hệ quản trị hệ thống của đơn vị để được cấp lại.</p>
        </form>
      </div>
    </div>`;
  const form = $('#loginForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    $('#loginErr').innerHTML = '';
    try {
      const { token } = await api.post('/auth/login', { username: form.username.value.trim(), password: form.password.value }, { noRedirect: true });
      auth.token = token;
      if (!location.hash || location.hash === '#') location.hash = '#/';
      await onLogin();
    } catch (err) {
      $('#loginErr').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
      form.password.select();
    } finally {
      btn.disabled = false;
    }
  });
}

export function forceChangePassword(onDone) {
  $('#app').innerHTML = `
    <div class="login-form" style="min-height:100vh">
      <form class="box card" style="padding:24px" id="cpForm">
        <h2>Đổi mật khẩu</h2>
        <div class="alert alert-warn" style="margin-top:12px">Bạn cần đổi mật khẩu trước khi sử dụng hệ thống (lần đăng nhập đầu tiên hoặc mật khẩu vừa được cấp lại).</div>
        <div id="cpErr"></div>
        <label class="field"><span>Mật khẩu hiện tại</span><input name="old_password" type="password" required autocomplete="current-password"></label>
        <label class="field"><span>Mật khẩu mới</span><input name="new_password" type="password" required autocomplete="new-password"><small class="help">Tối thiểu 8 ký tự, gồm cả chữ và số</small></label>
        <label class="field"><span>Nhập lại mật khẩu mới</span><input name="confirm" type="password" required autocomplete="new-password"></label>
        <button class="btn btn-primary" type="submit">Cập nhật mật khẩu</button>
      </form>
    </div>`;
  const form = $('#cpForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      if (form.new_password.value !== form.confirm.value) throw new Error('Mật khẩu nhập lại không khớp');
      await api.post('/auth/change-password', { old_password: form.old_password.value, new_password: form.new_password.value });
      await onDone();
    } catch (err) {
      $('#cpErr').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
    }
  });
}
