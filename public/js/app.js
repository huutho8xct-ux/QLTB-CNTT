import { api, auth, setUnauthorizedHandler } from './api.js';
import { ROLES, can } from './constants.js';
import { $, $$, esc, toastError, fmtDate } from './ui.js';

export const state = {
  user: null,
  settings: {},
  cat: { departments: [], categories: [], suppliers: [], funding: [], users: [] },
};

export async function loadCatalogs() {
  const [departments, categories, suppliers, funding, users] = await Promise.all([
    api.get('/catalogs/departments'), api.get('/catalogs/categories'), api.get('/catalogs/suppliers'),
    api.get('/catalogs/funding-sources'), api.get('/users/brief'),
  ]);
  Object.assign(state.cat, { departments, categories, suppliers, funding, users });
}

export async function loadSettings() {
  state.settings = await api.get('/system/settings');
}

const ROUTES = [
  ['/', 'dashboard'],
  ['/devices', 'devices', 'list'],
  ['/devices/new', 'devices', 'form'],
  ['/devices/code/:code', 'devices', 'byCode'],
  ['/devices/:id/edit', 'devices', 'form'],
  ['/devices/:id', 'devices', 'detail'],
  ['/allocations', 'allocations', 'list'],
  ['/allocations/new', 'allocations', 'form'],
  ['/allocations/:id', 'allocations', 'detail'],
  ['/repairs', 'repairs', 'list'],
  ['/repairs/:id', 'repairs', 'detail'],
  ['/maintenance', 'maintenance'],
  ['/inventories', 'inventories', 'list'],
  ['/inventories/:id', 'inventories', 'detail'],
  ['/disposals', 'disposals', 'list'],
  ['/disposals/new', 'disposals', 'form'],
  ['/disposals/:id', 'disposals', 'detail'],
  ['/licenses', 'licenses', 'list'],
  ['/licenses/:id', 'licenses', 'detail'],
  ['/reports', 'reports', 'list'],
  ['/reports/:key', 'reports', 'view'],
  ['/catalogs/:type', 'catalogs'],
  ['/users', 'users'],
  ['/audit', 'audit'],
  ['/settings', 'settings'],
  ['/profile', 'profile'],
];

const MENU = [
  { group: 'Tổng quan' },
  { href: '#/', ico: '📊', label: 'Bảng điều khiển' },
  { group: 'Quản lý thiết bị' },
  { href: '#/devices', ico: '🖥️', label: 'Danh sách thiết bị' },
  { href: '#/allocations', ico: '🔁', label: 'Cấp phát - Điều chuyển', perm: 'view.all' },
  { href: '#/repairs', ico: '🛠️', label: 'Sửa chữa - Báo hỏng', badge: 'repairs' },
  { href: '#/maintenance', ico: '🗓️', label: 'Bảo trì định kỳ', badge: 'maint' },
  { href: '#/inventories', ico: '📋', label: 'Kiểm kê', perm: 'view.all' },
  { href: '#/disposals', ico: '♻️', label: 'Thanh lý', perm: 'view.all' },
  { href: '#/licenses', ico: '🔑', label: 'Bản quyền phần mềm', perm: 'view.all' },
  { group: 'Báo cáo', perm: 'report.view' },
  { href: '#/reports', ico: '📑', label: 'Báo cáo - Thống kê', perm: 'report.view' },
  { group: 'Danh mục', perm: 'view.all' },
  { href: '#/catalogs/departments', ico: '🏢', label: 'Phòng ban', perm: 'view.all' },
  { href: '#/catalogs/categories', ico: '🗂️', label: 'Loại thiết bị', perm: 'view.all' },
  { href: '#/catalogs/suppliers', ico: '🚚', label: 'Nhà cung cấp', perm: 'view.all' },
  { href: '#/catalogs/funding-sources', ico: '💰', label: 'Nguồn vốn', perm: 'view.all' },
  { group: 'Hệ thống', perm: 'user.manage' },
  { href: '#/users', ico: '👥', label: 'Người dùng', perm: 'user.manage' },
  { href: '#/audit', ico: '📜', label: 'Nhật ký hệ thống', perm: 'audit.view' },
  { href: '#/settings', ico: '⚙️', label: 'Cấu hình - Sao lưu', perm: 'settings.write' },
];

function match(path) {
  for (const [pattern, page, view] of ROUTES) {
    const pp = pattern.split('/');
    const sp = path.split('/');
    if (pp.length !== sp.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pp.length; i++) {
      if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(sp[i]);
      else if (pp[i] !== sp[i]) { ok = false; break; }
    }
    if (ok) return { page, view, params };
  }
  return null;
}

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, q = ''] = h.split('?');
  return { path: path.replace(/\/+$/, '') || '/', query: Object.fromEntries(new URLSearchParams(q)) };
}

export function navigate(path) {
  location.hash = '#' + path;
}

export function setQuery(query, replace = true) {
  const { path } = parseHash();
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const url = `#${path}${p.toString() ? '?' + p : ''}`;
  if (replace) history.replaceState(null, '', url);
  else location.hash = url;
}

function renderLayout() {
  const u = state.user;
  const items = MENU.filter((m) => !m.perm || can(u, m.perm));
  // Bỏ nhóm không có mục con
  const menu = items.filter((m, i) => !m.group || (items[i + 1] && !items[i + 1].group));
  $('#app').innerHTML = `
    <div class="layout">
      <aside class="sidebar" id="sidebar">
        <div class="brand"><img src="favicon.svg" alt=""><div><b>QLTB-CNTT</b><small>${esc(state.settings.org_name || 'Quản lý thiết bị CNTT')}</small></div></div>
        <nav class="nav">
          ${menu.map((m) => (m.group ? `<div class="nav-group">${esc(m.group)}</div>`
    : `<a href="${m.href}" data-href="${m.href}"><span class="ico">${m.ico}</span>${esc(m.label)}${m.badge ? `<span class="count hidden" data-badge="${m.badge}"></span>` : ''}</a>`)).join('')}
        </nav>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="btn btn-ghost menu-btn" id="menuBtn" aria-label="Menu">☰</button>
          <div class="title" id="pageTitle"></div>
          <div style="position:relative">
            <div class="bell" id="bell" title="Cảnh báo">🔔<span class="dot hidden" id="bellDot"></span></div>
            <div class="dropdown alerts-panel" id="alertsPanel"></div>
          </div>
          <div class="user-chip" id="userChip">
            <div class="avatar">${esc(((u.full_name || '?').trim().split(/\s+/).pop()[0] || '?').toUpperCase())}</div>
            <div class="info"><div>${esc(u.full_name)}</div><small>${esc(ROLES[u.role] || u.role)}</small></div>
            <div class="dropdown" id="userMenu">
              <div style="padding:8px 10px" class="text-muted">${esc(u.username)}${u.department_name ? ' · ' + esc(u.department_name) : ''}</div>
              <a href="#/profile">👤 Hồ sơ cá nhân / Đổi mật khẩu</a>
              <button id="logoutBtn">🚪 Đăng xuất</button>
            </div>
          </div>
        </header>
        <main class="content" id="content"></main>
      </div>
    </div>`;
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#userChip').addEventListener('click', (e) => {
    if (e.target.closest('a,button')) return;
    $('#userMenu').classList.toggle('open');
    $('#alertsPanel').classList.remove('open');
  });
  $('#bell').addEventListener('click', () => {
    $('#alertsPanel').classList.toggle('open');
    $('#userMenu').classList.remove('open');
  });
  $('#logoutBtn').addEventListener('click', logout);
  refreshAlerts();
}

export async function refreshAlerts() {
  try {
    const a = await api.get('/alerts');
    const dot = $('#bellDot');
    if (!dot) return;
    dot.textContent = a.count;
    dot.classList.toggle('hidden', !a.count);
    const setBadge = (k, n) => {
      const el = $(`[data-badge="${k}"]`);
      if (el) { el.textContent = n; el.classList.toggle('hidden', !n); }
    };
    setBadge('repairs', a.repairs_open.filter((r) => r.status === 'pending').length);
    setBadge('maint', a.maintenance_overdue.length);
    const sec = (title, list, fn) => (list.length ? `<div class="item" style="background:#f7f9fc"><b>${title} (${list.length})</b></div>${list.slice(0, 6).map(fn).join('')}` : '');
    const html = [
      sec('⚠️ Yêu cầu sửa chữa chờ xử lý', a.repairs_open.filter((r) => r.status === 'pending'), (r) => `<div class="item"><a href="#/repairs/${r.id}">${esc(r.code)}</a> · ${esc(r.asset_code)} ${esc(r.device_name)}</div>`),
      sec('⏰ Bảo trì quá hạn', a.maintenance_overdue, (m) => `<div class="item">${esc(m.title)} · ${esc(m.asset_code || '')} <span class="text-red">(${fmtDate(m.scheduled_date)})</span></div>`),
      sec('🗓️ Bảo trì sắp đến hạn', a.maintenance_upcoming, (m) => `<div class="item">${esc(m.title)} · ${esc(m.asset_code || '')} (${fmtDate(m.scheduled_date)})</div>`),
      sec('🛡️ Sắp hết bảo hành', a.warranty_expiring, (d) => `<div class="item"><a href="#/devices/${d.id}">${esc(d.asset_code)}</a> ${esc(d.name)} (${fmtDate(d.warranty_end)})</div>`),
      sec('🔑 Bản quyền sắp/đã hết hạn', a.licenses_expiring, (l) => `<div class="item"><a href="#/licenses/${l.id}">${esc(l.name)}</a> (${fmtDate(l.expiry_date)})</div>`),
    ].join('');
    $('#alertsPanel').innerHTML = html || '<div class="item text-muted">Không có cảnh báo nào 🎉</div>';
  } catch { /* bỏ qua */ }
}

let renderSeq = 0;
async function route() {
  if (!state.user) return;
  const { path, query } = parseHash();
  const m = match(path);
  $$('.nav a').forEach((a) => {
    const href = a.dataset.href.slice(1);
    a.classList.toggle('active', href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
  });
  $('#sidebar')?.classList.remove('open');
  const el = $('#content');
  if (!m) {
    el.innerHTML = '<div class="card empty">Không tìm thấy trang. <a href="#/">Về trang chủ</a></div>';
    return;
  }
  const seq = ++renderSeq;
  el.innerHTML = '<div class="empty">Đang tải...</div>';
  try {
    const mod = await import(`./pages/${m.page}.js`);
    if (seq !== renderSeq) return;
    const ctx = {
      el, params: m.params, query, view: m.view,
      setTitle: (t) => { $('#pageTitle').textContent = t; document.title = `${t} - QLTB-CNTT`; },
      isCurrent: () => seq === renderSeq,
    };
    await mod.default(ctx);
  } catch (e) {
    if (seq !== renderSeq) return;
    el.innerHTML = `<div class="card"><div class="card-body"><div class="alert alert-error">${esc(e.message)}</div><a href="#/">Về trang chủ</a></div></div>`;
  }
}

async function logout() {
  try { await api.post('/auth/logout'); } catch { /* ignore */ }
  auth.token = null;
  state.user = null;
  showLogin();
}

async function showLogin() {
  const mod = await import('./pages/login.js');
  mod.default({ onLogin: start });
}

export async function start() {
  try {
    state.user = await api.get('/auth/me');
  } catch {
    auth.token = null;
    return showLogin();
  }
  await Promise.all([loadSettings(), loadCatalogs()]);
  if (state.user.must_change_password) {
    const mod = await import('./pages/login.js');
    return mod.forceChangePassword(start);
  }
  renderLayout();
  route();
}

setUnauthorizedHandler(() => {
  if (state.user) {
    state.user = null;
    auth.token = null;
    showLogin();
  }
});

window.addEventListener('hashchange', route);
document.addEventListener('click', (e) => {
  if (!e.target.closest('#userChip')) $('#userMenu')?.classList.remove('open');
  if (!e.target.closest('#bell') && !e.target.closest('#alertsPanel')) $('#alertsPanel')?.classList.remove('open');
});
setInterval(() => state.user && refreshAlerts(), 5 * 60 * 1000);

if (auth.token) start();
else showLogin();
