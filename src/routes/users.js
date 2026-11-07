import { Router } from 'express';
import { all, get, run } from '../db.js';
import { requirePerm, hashPassword, checkPasswordPolicy } from '../auth.js';
import { ROLES } from '../../public/js/constants.js';
import { HttpError, pick, required, insert, update, audit } from '../util.js';

export const router = Router();

const FIELDS = ['username', 'full_name', 'position', 'email', 'phone', 'role', 'department_id', 'active'];

// Danh sách rút gọn (dùng cho chọn kỹ thuật viên, người nhận...) — mọi người dùng đăng nhập đều xem được
router.get('/brief', (_req, res) => {
  res.json(all(`SELECT u.id, u.full_name, u.role, u.position, u.department_id, d.name AS department_name
                  FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.active = 1 ORDER BY u.full_name`));
});

router.use(requirePerm('user.manage'));

router.get('/', (_req, res) => {
  res.json(all(`SELECT u.id, u.username, u.full_name, u.position, u.email, u.phone, u.role, u.department_id, u.active,
                       u.last_login, u.created_at, u.locked_until, d.name AS department_name
                  FROM users u LEFT JOIN departments d ON d.id = u.department_id ORDER BY u.role, u.full_name`));
});

function validate(data) {
  if (data.role && !ROLES[data.role]) throw new HttpError(400, 'Vai trò không hợp lệ');
  if (data.username && !/^[a-zA-Z0-9._-]{3,50}$/.test(data.username)) throw new HttpError(400, 'Tên đăng nhập chỉ gồm chữ, số, dấu chấm, gạch dưới (3-50 ký tự)');
}

router.post('/', (req, res) => {
  const data = pick(req.body, FIELDS);
  required(data, { username: 'Tên đăng nhập', full_name: 'Họ tên', role: 'Vai trò' });
  validate(data);
  const pwErr = checkPasswordPolicy(req.body.password);
  if (pwErr) throw new HttpError(400, pwErr);
  if (get('SELECT 1 FROM users WHERE username = ?', data.username)) throw new HttpError(400, 'Tên đăng nhập đã tồn tại');
  const id = insert('users', { ...data, password_hash: hashPassword(req.body.password), must_change_password: req.body.must_change_password ? 1 : 0 });
  audit(req, 'Thêm người dùng', 'user', id, `${data.username} (${ROLES[data.role]})`);
  res.json({ id });
});

router.put('/:id', (req, res) => {
  const data = pick(req.body, FIELDS);
  validate(data);
  const id = Number(req.params.id);
  if (id === req.user.id && (data.active === 0 || data.active === false || (data.role && data.role !== 'admin'))) {
    throw new HttpError(400, 'Không thể tự khóa hoặc hạ quyền tài khoản đang đăng nhập');
  }
  if (data.username && get('SELECT 1 FROM users WHERE username = ? AND id <> ?', data.username, id)) throw new HttpError(400, 'Tên đăng nhập đã tồn tại');
  update('users', id, data);
  if (data.active === 0 || data.active === false) run('DELETE FROM sessions WHERE user_id = ?', id);
  audit(req, 'Sửa người dùng', 'user', id, data.username);
  res.json({ ok: true });
});

router.post('/:id/reset-password', (req, res) => {
  const pwErr = checkPasswordPolicy(req.body.password);
  if (pwErr) throw new HttpError(400, pwErr);
  run('UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL WHERE id = ?', hashPassword(req.body.password), req.params.id);
  run('DELETE FROM sessions WHERE user_id = ?', req.params.id);
  audit(req, 'Đặt lại mật khẩu', 'user', req.params.id);
  res.json({ ok: true });
});

router.post('/:id/unlock', (req, res) => {
  run('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', req.params.id);
  audit(req, 'Mở khóa tài khoản', 'user', req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) throw new HttpError(400, 'Không thể xóa tài khoản đang đăng nhập');
  const u = get('SELECT username FROM users WHERE id = ?', id);
  if (!u) throw new HttpError(404, 'Không tìm thấy người dùng');
  const used = get('SELECT (SELECT COUNT(*) FROM repairs WHERE reporter_id = ? OR technician_id = ?) AS n', id, id).n;
  if (used) {
    run('UPDATE users SET active = 0 WHERE id = ?', id);
    run('DELETE FROM sessions WHERE user_id = ?', id);
    audit(req, 'Vô hiệu hóa người dùng', 'user', id, u.username);
    return res.json({ ok: true, deactivated: true });
  }
  run('DELETE FROM users WHERE id = ?', id);
  audit(req, 'Xóa người dùng', 'user', id, u.username);
  res.json({ ok: true });
});
