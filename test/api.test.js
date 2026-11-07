import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qltb-test-'));
process.env.DATA_DIR = dir;

const { openDb, closeDb } = await import('../src/db.js');
const { createApp } = await import('../server.js');
const { calcDepreciation } = await import('../public/js/constants.js');

let server, base, token;

async function call(method, url, body, tk = token) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

before(async () => {
  openDb();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => {
  server.close();
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('tính hao mòn theo tháng và theo năm', () => {
  const d = { original_price: 12_000_000, depreciation_years: 5, in_use_date: '2024-01-15' };
  assert.equal(calcDepreciation(d, '2024-12-31', 'month').accumulated, 2_400_000);
  assert.equal(calcDepreciation(d, '2024-06-30', 'month').accumulated, 1_200_000);
  assert.equal(calcDepreciation(d, '2024-06-30', 'year').accumulated, 2_400_000);
  assert.equal(calcDepreciation(d, '2035-01-01', 'month').remaining, 0);
  assert.equal(calcDepreciation(d, '2023-01-01', 'month').accumulated, 0);
});

test('đăng nhập sai bị từ chối, đúng thì nhận token', async () => {
  assert.equal((await call('POST', '/auth/login', { username: 'admin', password: 'sai' }, null)).status, 401);
  const r = await call('POST', '/auth/login', { username: 'admin', password: 'admin@123' }, null);
  assert.equal(r.status, 200);
  token = r.data.token;
  const me = await call('GET', '/auth/me');
  assert.equal(me.data.role, 'admin');
  assert.equal(me.data.must_change_password, 1);
});

test('chưa đăng nhập không truy cập được dữ liệu', async () => {
  assert.equal((await call('GET', '/devices', null, null)).status, 401);
});

test('vòng đời thiết bị: thêm → cấp phát → báo hỏng → sửa xong → thanh lý', async () => {
  const cats = (await call('GET', '/catalogs/categories')).data;
  const depts = (await call('GET', '/catalogs/departments')).data;
  const pc = cats.find((c) => c.code === 'MTDB');

  const created = await call('POST', '/devices', { name: 'Máy tính Dell', category_id: pc.id, original_price: 15_000_000, purchase_date: '2023-02-01', warranty_months: 24, quantity: 2 });
  assert.equal(created.status, 200);
  assert.equal(created.data.ids.length, 2);
  const id = created.data.id;
  const dev = (await call('GET', `/devices/${id}`)).data;
  assert.equal(dev.asset_code, 'PC.00001');
  assert.equal(dev.depreciation_years, 5);
  assert.equal(dev.warranty_end, '2025-02-01');
  assert.equal(dev.status, 'in_stock');

  const alloc = await call('POST', '/allocations', { type: 'allocate', to_department_id: depts[1].id, receiver_person: 'Nguyễn Văn A', items: [{ device_id: id }] });
  assert.equal(alloc.status, 200, JSON.stringify(alloc.data));
  assert.match(alloc.data.code, /^CP-\d{4}-0001$/);
  let d2 = (await call('GET', `/devices/${id}`)).data;
  assert.equal(d2.status, 'in_use');
  assert.equal(d2.department_id, depts[1].id);
  assert.equal(d2.assigned_to, 'Nguyễn Văn A');

  // Không cấp phát lại thiết bị đang dùng
  assert.equal((await call('POST', '/allocations', { type: 'allocate', to_department_id: depts[2].id, items: [{ device_id: id }] })).status, 400);

  const rep = await call('POST', '/repairs', { device_id: id, problem: 'Không lên nguồn' });
  assert.equal(rep.status, 200);
  assert.equal((await call('POST', '/repairs', { device_id: id, problem: 'Trùng' })).status, 400);
  await call('PUT', `/repairs/${rep.data.id}`, { status: 'in_progress' });
  assert.equal((await call('GET', `/devices/${id}`)).data.status, 'repairing');
  await call('PUT', `/repairs/${rep.data.id}`, { status: 'done', cost: 500000, solution: 'Thay nguồn' });
  assert.equal((await call('GET', `/devices/${id}`)).data.status, 'in_use');

  const disp = await call('POST', '/disposals', { reason: 'Hết thời gian sử dụng', method: 'sell', device_ids: [id] });
  assert.equal(disp.status, 200);
  assert.equal((await call('GET', `/devices/${id}`)).data.status, 'pending_disposal');
  assert.equal((await call('POST', `/disposals/${disp.data.id}/complete`, {})).status, 400);
  assert.equal((await call('POST', `/disposals/${disp.data.id}/approve`, { decision_no: '01/QĐ' })).status, 200);
  assert.equal((await call('POST', `/disposals/${disp.data.id}/complete`, { revenue: 1000000 })).status, 200);
  assert.equal((await call('GET', `/devices/${id}`)).data.status, 'disposed');

  const hist = (await call('GET', `/devices/${id}/history`)).data;
  assert.ok(hist.length >= 6);
});

test('kiểm kê: quét mã, thiết bị thiếu, hoàn thành', async () => {
  await call('POST', '/devices', { name: 'Máy in Canon' });
  const list = (await call('GET', '/devices')).data.rows;
  const inv = await call('POST', '/inventories', { name: 'Kiểm kê thử' });
  assert.equal(inv.status, 200);
  assert.equal(inv.data.count, list.length);
  const ok = await call('POST', `/inventories/${inv.data.id}/check`, { asset_code: list[0].asset_code });
  assert.equal(ok.data.found, 1);
  assert.equal((await call('POST', `/inventories/${inv.data.id}/check`, { asset_code: 'KHONG-CO' })).status, 404);
  assert.equal((await call('POST', `/inventories/${inv.data.id}/complete`, {})).status, 400);
  assert.equal((await call('POST', `/inventories/${inv.data.id}/complete`, { force: true })).status, 200);
});

test('phân quyền: viên chức chỉ thấy thiết bị phòng mình và không được thêm thiết bị', async () => {
  const depts = (await call('GET', '/catalogs/departments')).data;
  const u = await call('POST', '/users', { username: 'nv01', full_name: 'Nhân viên', role: 'user', department_id: depts[3].id, password: 'Matkhau123', active: 1 });
  assert.equal(u.status, 200);
  const tk = (await call('POST', '/auth/login', { username: 'nv01', password: 'Matkhau123' }, null)).data.token;
  assert.equal((await call('GET', '/devices', null, tk)).data.total, 0);
  assert.equal((await call('POST', '/devices', { name: 'X' }, tk)).status, 403);
  assert.equal((await call('GET', '/users', null, tk)).status, 403);
  assert.equal((await call('GET', '/reports/asset-register', null, tk)).status, 403);
});

test('báo cáo và bảng điều khiển trả dữ liệu', async () => {
  const dash = await call('GET', '/dashboard');
  assert.equal(dash.status, 200);
  assert.ok(dash.data.totals.devices >= 1);
  for (const key of ['asset-register', 'depreciation', 'by-department', 'by-category', 'by-funding', 'increase', 'repairs', 'warranty', 'aging', 'allocations', 'network']) {
    const r = await call('GET', `/reports/${key}`);
    assert.equal(r.status, 200, key);
    assert.ok(Array.isArray(r.data.rows), key);
  }
  const x = await fetch(`${base}/reports/by-category?format=xlsx`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(x.status, 200);
  assert.match(x.headers.get('content-type'), /spreadsheetml/);
});

test('sao lưu dữ liệu', async () => {
  const r = await call('POST', '/system/backups');
  assert.equal(r.status, 200);
  const list = (await call('GET', '/system/backups')).data;
  assert.ok(list.some((b) => b.name === r.data.name));
});
