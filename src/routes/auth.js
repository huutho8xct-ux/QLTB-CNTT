import { Router } from 'express';
import { get, run, getSetting } from '../db.js';
import { authenticate, verifyPassword, hashPassword, newToken, tokenHash, checkPasswordPolicy } from '../auth.js';
import { HttpError, audit } from '../util.js';

export const router = Router();

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

// Giới hạn số lần đăng nhập theo IP (chống dò mật khẩu)
const ipHits = new Map();
function ipLimited(ip) {
  const now = Date.now();
  const rec = ipHits.get(ip) || { n: 0, t: now };
  if (now - rec.t > 10 * 60 * 1000) { rec.n = 0; rec.t = now; }
  rec.n++;
  ipHits.set(ip, rec);
  return rec.n > 50;
}

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) throw new HttpError(400, 'Vui lòng nhập tên đăng nhập và mật khẩu');
  if (ipLimited(req.ip)) throw new HttpError(429, 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau ít phút.');
  const u = get('SELECT * FROM users WHERE username = ?', String(username).trim());
  if (u && u.locked_until && u.locked_until > new Date().toISOString()) {
    throw new HttpError(423, `Tài khoản tạm khóa do đăng nhập sai nhiều lần. Thử lại sau ${new Date(u.locked_until).toLocaleTimeString('vi-VN')}.`);
  }
  if (!u || !verifyPassword(password, u.password_hash)) {
    if (u) {
      const n = u.failed_attempts + 1;
      const lock = n >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
      run('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?', lock ? 0 : n, lock, u.id);
    }
    audit(req, 'Đăng nhập thất bại', 'user', u?.id, `Tên đăng nhập: ${username}`);
    throw new HttpError(401, 'Tên đăng nhập hoặc mật khẩu không đúng');
  }
  if (!u.active) throw new HttpError(403, 'Tài khoản đã bị vô hiệu hóa. Liên hệ quản trị hệ thống.');

  const token = newToken();
  const hours = Number(getSetting('session_hours')) || 12;
  run(
    'INSERT INTO sessions(token, user_id, ip, user_agent, expires_at) VALUES (?,?,?,?,?)',
    tokenHash(token), u.id, req.ip, String(req.headers['user-agent'] || '').slice(0, 200),
    new Date(Date.now() + hours * 3600000).toISOString()
  );
  run("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = datetime('now','localtime') WHERE id = ?", u.id);
  run('DELETE FROM sessions WHERE expires_at < ?', new Date().toISOString());
  req.user = u;
  audit(req, 'Đăng nhập', 'user', u.id);
  res.json({ token });
});

router.use(authenticate);

router.get('/me', (req, res) => {
  const { expires_at, active, ...user } = req.user;
  res.json(user);
});

router.post('/logout', (req, res) => {
  run('DELETE FROM sessions WHERE token = ?', req.tokenHash);
  audit(req, 'Đăng xuất', 'user', req.user.id);
  res.json({ ok: true });
});

router.post('/change-password', (req, res) => {
  const { old_password, new_password } = req.body || {};
  const u = get('SELECT password_hash FROM users WHERE id = ?', req.user.id);
  if (!verifyPassword(old_password || '', u.password_hash)) throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
  const err = checkPasswordPolicy(new_password);
  if (err) throw new HttpError(400, err);
  if (old_password === new_password) throw new HttpError(400, 'Mật khẩu mới phải khác mật khẩu cũ');
  run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', hashPassword(new_password), req.user.id);
  run('DELETE FROM sessions WHERE user_id = ? AND token <> ?', req.user.id, req.tokenHash);
  audit(req, 'Đổi mật khẩu', 'user', req.user.id);
  res.json({ ok: true });
});

router.put('/profile', (req, res) => {
  const { full_name, email, phone, position } = req.body || {};
  if (!full_name?.trim()) throw new HttpError(400, 'Vui lòng nhập họ tên');
  run('UPDATE users SET full_name = ?, email = ?, phone = ?, position = ? WHERE id = ?',
    full_name.trim(), email || null, phone || null, position || null, req.user.id);
  audit(req, 'Cập nhật hồ sơ cá nhân', 'user', req.user.id);
  res.json({ ok: true });
});
