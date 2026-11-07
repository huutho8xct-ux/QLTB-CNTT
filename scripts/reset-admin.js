// Khôi phục quyền truy cập khi quên mật khẩu quản trị: npm run reset-admin [-- MậtKhẩuMới]
import { openDb, closeDb, get, run } from '../src/db.js';
import { hashPassword, checkPasswordPolicy } from '../src/auth.js';

openDb();
const pw = process.argv[2] || 'admin@123';
const err = checkPasswordPolicy(pw);
if (err) {
  console.error('✕', err);
  process.exit(1);
}
const u = get("SELECT id FROM users WHERE username = 'admin'");
if (u) {
  run("UPDATE users SET password_hash = ?, active = 1, role = 'admin', must_change_password = 1, failed_attempts = 0, locked_until = NULL WHERE id = ?", hashPassword(pw), u.id);
  run('DELETE FROM sessions WHERE user_id = ?', u.id);
} else {
  run("INSERT INTO users(username, password_hash, full_name, role, must_change_password) VALUES ('admin', ?, 'Quản trị hệ thống', 'admin', 1)", hashPassword(pw));
}
console.log(`✔ Đã đặt lại tài khoản admin với mật khẩu: ${pw} (bắt buộc đổi khi đăng nhập)`);
closeDb();
