import crypto from 'node:crypto';
import { can } from '../public/js/constants.js';
import { HttpError } from './util.js';
import { get } from './db.js';

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltHex, hashHex] = stored.split('$');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

/** Chính sách mật khẩu: tối thiểu 8 ký tự, có chữ và số */
export function checkPasswordPolicy(pw) {
  pw = String(pw || '');
  if (pw.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Mật khẩu phải bao gồm cả chữ và số';
  return null;
}

export function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function authenticate(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  if (!token) return next(new HttpError(401, 'Chưa đăng nhập'));
  const row = get(
    `SELECT u.id, u.username, u.full_name, u.role, u.department_id, u.email, u.phone, u.position,
            u.must_change_password, u.active, s.expires_at, d.name AS department_name
       FROM sessions s JOIN users u ON u.id = s.user_id
       LEFT JOIN departments d ON d.id = u.department_id
      WHERE s.token = ?`,
    tokenHash(token)
  );
  if (!row || !row.active || row.expires_at < new Date().toISOString()) {
    return next(new HttpError(401, 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại'));
  }
  req.user = { ...row };
  req.tokenHash = tokenHash(token);
  next();
}

export function requirePerm(perm) {
  return (req, _res, next) => {
    if (!can(req.user, perm)) return next(new HttpError(403, 'Bạn không có quyền thực hiện chức năng này'));
    next();
  };
}
