import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.js';

// Mặc định: thư mục data nằm cạnh mã nguồn (không phụ thuộc thư mục đang đứng khi chạy)
export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.resolve(APP_DIR, process.env.DATA_DIR || 'data');
export const DB_PATH = path.join(DATA_DIR, 'qltb.db');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');

let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  manager_name TEXT,
  phone TEXT,
  location TEXT,
  note TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  position TEXT,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip TEXT,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  prefix TEXT,
  depreciation_years REAL DEFAULT 5,
  maintenance_months INTEGER DEFAULT 6,
  is_it INTEGER DEFAULT 1,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tax_code TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  contact_person TEXT,
  website TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS funding_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  brand TEXT,
  model TEXT,
  serial_number TEXT,
  origin TEXT,
  manufacture_year INTEGER,
  unit TEXT DEFAULT 'Chiếc',
  cpu TEXT,
  ram TEXT,
  storage TEXT,
  os TEXT,
  hostname TEXT,
  ip_address TEXT,
  mac_address TEXT,
  specs TEXT,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  funding_source_id INTEGER REFERENCES funding_sources(id) ON DELETE SET NULL,
  invoice_no TEXT,
  contract_no TEXT,
  purchase_date TEXT,
  in_use_date TEXT,
  original_price REAL DEFAULT 0,
  depreciation_years REAL,
  warranty_months INTEGER,
  warranty_end TEXT,
  status TEXT NOT NULL DEFAULT 'in_stock',
  condition TEXT DEFAULT 'good',
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  assigned_to TEXT,
  location TEXT,
  parent_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  note TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_dept ON devices(department_id);
CREATE INDEX IF NOT EXISTS idx_devices_cat ON devices(category_id);

CREATE TABLE IF NOT EXISTS device_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  description TEXT,
  ref_type TEXT,
  ref_id INTEGER,
  user_id INTEGER,
  user_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_history_device ON device_history(device_id);

CREATE TABLE IF NOT EXISTS allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  doc_date TEXT NOT NULL,
  from_department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  to_department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  handover_person TEXT,
  receiver_person TEXT,
  receiver_position TEXT,
  location TEXT,
  reason TEXT,
  decision_no TEXT,
  note TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS allocation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  allocation_id INTEGER NOT NULL REFERENCES allocations(id) ON DELETE CASCADE,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  condition TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS repairs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reporter_name TEXT,
  reporter_phone TEXT,
  report_date TEXT NOT NULL,
  problem TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending',
  repair_type TEXT,
  technician_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  vendor TEXT,
  diagnosis TEXT,
  solution TEXT,
  parts_replaced TEXT,
  cost REAL DEFAULT 0,
  start_date TEXT,
  finish_date TEXT,
  prev_device_status TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS maintenances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  scheduled_date TEXT NOT NULL,
  interval_months INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned',
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  done_date TEXT,
  performer TEXT,
  content TEXT,
  result TEXT,
  cost REAL DEFAULT 0,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS inventories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  inventory_date TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  committee TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  conclusion TEXT,
  note TEXT,
  created_by INTEGER,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  book_status TEXT,
  book_department_id INTEGER,
  found INTEGER,
  is_extra INTEGER DEFAULT 0,
  actual_condition TEXT,
  actual_location TEXT,
  note TEXT,
  checked_by TEXT,
  checked_at TEXT,
  UNIQUE(inventory_id, device_id)
);

CREATE TABLE IF NOT EXISTS disposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  doc_date TEXT NOT NULL,
  method TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  decision_no TEXT,
  decision_date TEXT,
  approved_by TEXT,
  completed_date TEXT,
  revenue REAL DEFAULT 0,
  expense REAL DEFAULT 0,
  note TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS disposal_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  disposal_id INTEGER NOT NULL REFERENCES disposals(id) ON DELETE CASCADE,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  original_price REAL,
  remaining_value REAL,
  prev_status TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS licenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  publisher TEXT,
  version TEXT,
  license_type TEXT DEFAULT 'perpetual',
  license_key TEXT,
  seats INTEGER DEFAULT 1,
  purchase_date TEXT,
  expiry_date TEXT,
  price REAL DEFAULT 0,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  funding_source_id INTEGER REFERENCES funding_sources(id) ON DELETE SET NULL,
  contract_no TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS license_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  assigned_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(license_id, device_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  detail TEXT,
  ip TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
`;

const DEFAULT_SETTINGS = {
  org_parent: 'UBND TỈNH / SỞ ...',
  org_name: 'ĐƠN VỊ SỰ NGHIỆP CÔNG LẬP',
  org_address: '',
  org_phone: '',
  org_email: '',
  org_tax_code: '',
  org_city: 'Hà Nội',
  director_name: '',
  director_title: 'Thủ trưởng đơn vị',
  accountant_name: '',
  asset_manager_name: '',
  depreciation_method: 'month',
  fixed_asset_threshold: '10000000',
  warranty_alert_days: '30',
  license_alert_days: '30',
  maintenance_alert_days: '7',
  auto_backup: '1',
  backup_keep: '30',
  session_hours: '12',
};

const DEFAULT_CATEGORIES = [
  ['MTDB', 'Máy tính để bàn', 'PC', 5, 6],
  ['MTXT', 'Máy tính xách tay', 'LT', 5, 6],
  ['MC', 'Máy chủ (Server)', 'SV', 5, 3],
  ['MH', 'Màn hình', 'MH', 5, 12],
  ['MI', 'Máy in', 'MI', 5, 6],
  ['MPT', 'Máy photocopy', 'PT', 5, 3],
  ['MSC', 'Máy quét (Scanner)', 'SC', 5, 12],
  ['MCH', 'Máy chiếu', 'MCH', 5, 6],
  ['TBM', 'Thiết bị mạng (Switch, Router, Wifi)', 'NW', 5, 6],
  ['TBLT', 'Thiết bị lưu trữ (NAS, SAN)', 'ST', 5, 6],
  ['TBBM', 'Thiết bị bảo mật (Firewall)', 'FW', 5, 6],
  ['UPS', 'Bộ lưu điện (UPS)', 'UPS', 5, 6],
  ['CAM', 'Camera giám sát', 'CAM', 5, 12],
  ['DT', 'Điện thoại / Tổng đài IP', 'DT', 5, 12],
  ['TBHN', 'Thiết bị hội nghị truyền hình', 'HN', 5, 6],
  ['PK', 'Linh kiện, phụ kiện', 'PK', 3, 0],
  ['KHAC', 'Thiết bị CNTT khác', 'TB', 5, 12],
];

const DEFAULT_FUNDING = [
  ['NSNN', 'Ngân sách nhà nước cấp'],
  ['NTSN', 'Nguồn thu hoạt động sự nghiệp'],
  ['QPTSN', 'Quỹ phát triển hoạt động sự nghiệp'],
  ['VTTT', 'Nguồn viện trợ, tài trợ, biếu tặng'],
  ['ODA', 'Nguồn vốn ODA, vay ưu đãi'],
  ['KHAC', 'Nguồn khác'],
];

const DEFAULT_DEPARTMENTS = [
  ['BGD', 'Ban Giám đốc'],
  ['TCHC', 'Phòng Tổ chức - Hành chính'],
  ['KHTC', 'Phòng Kế hoạch - Tài chính'],
  ['CMNV', 'Phòng Chuyên môn - Nghiệp vụ'],
  ['CNTT', 'Tổ Công nghệ thông tin'],
];

/** Chuẩn hóa tham số: undefined -> null, boolean -> 0/1 */
function norm(params) {
  return params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
}

export function getDb() {
  if (!db) throw new Error('Cơ sở dữ liệu chưa được mở');
  return db;
}

export const all = (sql, ...p) => getDb().prepare(sql).all(...norm(p));
export const get = (sql, ...p) => getDb().prepare(sql).get(...norm(p));
export const run = (sql, ...p) => getDb().prepare(sql).run(...norm(p));

let txDepth = 0;
export function tx(fn) {
  const d = getDb();
  if (txDepth > 0) return fn();
  d.exec('BEGIN IMMEDIATE');
  txDepth++;
  try {
    const r = fn();
    d.exec('COMMIT');
    return r;
  } catch (e) {
    try { d.exec('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  } finally {
    txDepth--;
  }
}

export function getSetting(key) {
  const r = get('SELECT value FROM settings WHERE key = ?', key);
  return r ? r.value : DEFAULT_SETTINGS[key];
}

export function getSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of all('SELECT key, value FROM settings')) out[r.key] = r.value;
  return out;
}

function seed() {
  const ins = getDb().prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);

  if (!get('SELECT 1 FROM categories LIMIT 1')) {
    for (const [code, name, prefix, years, mm] of DEFAULT_CATEGORIES) {
      run('INSERT INTO categories(code, name, prefix, depreciation_years, maintenance_months) VALUES (?,?,?,?,?)', code, name, prefix, years, mm);
    }
  }
  if (!get('SELECT 1 FROM funding_sources LIMIT 1')) {
    for (const [code, name] of DEFAULT_FUNDING) run('INSERT INTO funding_sources(code, name) VALUES (?,?)', code, name);
  }
  if (!get('SELECT 1 FROM departments LIMIT 1')) {
    DEFAULT_DEPARTMENTS.forEach(([code, name], i) => run('INSERT INTO departments(code, name, sort_order) VALUES (?,?,?)', code, name, i));
  }
  if (!get('SELECT 1 FROM users LIMIT 1')) {
    run(
      `INSERT INTO users(username, password_hash, full_name, role, must_change_password) VALUES (?,?,?,?,1)`,
      'admin', hashPassword('admin@123'), 'Quản trị hệ thống', 'admin'
    );
  }
}

/** Các thay đổi cấu trúc cho phiên bản sau (giữ tương thích dữ liệu cũ) */
function migrate() {
  const d = getDb();
  d.exec(SCHEMA);
  const ver = get('PRAGMA user_version').user_version;
  if (ver < 1) d.exec('PRAGMA user_version = 1');
}

export function openDb(file = DB_PATH) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate();
  seed();
  return db;
}

export function closeDb() {
  if (db) {
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }
    db.close();
    db = null;
  }
}
