// Tạo dữ liệu mẫu để dùng thử phần mềm: npm run seed:demo
import { openDb, closeDb, all, get, run, tx } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
import { insert, addMonths, nextAssetCode, nextCode } from '../src/util.js';

openDb();
if (get('SELECT COUNT(*) AS n FROM devices').n > 0 && !process.argv.includes('--force')) {
  console.log('Cơ sở dữ liệu đã có thiết bị. Dùng "npm run seed:demo -- --force" nếu vẫn muốn thêm dữ liệu mẫu.');
  closeDb();
  process.exit(0);
}

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pickOne = (arr) => arr[Math.floor(rnd() * arr.length)];
const date = (y1, y2) => {
  const y = y1 + Math.floor(rnd() * (y2 - y1 + 1));
  const m = 1 + Math.floor(rnd() * 12);
  const d = 1 + Math.floor(rnd() * 28);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};
const cat = (code) => get('SELECT * FROM categories WHERE code = ?', code);
const dept = () => pickOne(all('SELECT id, name FROM departments'));

tx(() => {
  const suppliers = [
    ['Công ty TNHH Tin học Sao Việt', '0301234567', 'Nguyễn Minh Tâm', '0909 123 456'],
    ['Công ty CP Công nghệ Phương Nam', '0312345678', 'Trần Thu Hà', '0918 234 567'],
    ['Công ty TNHH Giải pháp mạng An Phát', '0323456789', 'Lê Văn Phúc', '0937 345 678'],
  ].map(([name, tax, contact, phone]) => insert('suppliers', { name, tax_code: tax, contact_person: contact, phone }));

  const users = [
    ['quanly', 'Nguyễn Thị Lan', 'manager', 'Chuyên viên quản lý tài sản', 'KHTC'],
    ['kythuat', 'Trần Văn Hùng', 'technician', 'Kỹ thuật viên CNTT', 'CNTT'],
    ['lanhdao', 'Phạm Quốc Bảo', 'leader', 'Phó Giám đốc', 'BGD'],
    ['nhanvien', 'Lê Thị Mai', 'user', 'Chuyên viên', 'CMNV'],
  ];
  for (const [username, full_name, role, position, d] of users) {
    if (get('SELECT 1 FROM users WHERE username = ?', username)) continue;
    insert('users', {
      username, full_name, role, position, password_hash: hashPassword('Demo@1234'),
      department_id: get('SELECT id FROM departments WHERE code = ?', d)?.id ?? null,
    });
  }

  const models = [
    ['MTDB', 'Máy tính để bàn', [['Dell', 'OptiPlex 7010', 'Intel Core i5-13500', '16GB', 'SSD 512GB'], ['HP', 'ProDesk 400 G9', 'Intel Core i5-12500', '8GB', 'SSD 256GB'], ['Lenovo', 'ThinkCentre M70s', 'Intel Core i3-10100', '8GB', 'HDD 1TB']], 14_000_000, 20_000_000, 26],
    ['MTXT', 'Máy tính xách tay', [['Dell', 'Latitude 5440', 'Intel Core i5-1335U', '16GB', 'SSD 512GB'], ['HP', 'ProBook 450 G10', 'Intel Core i7-1355U', '16GB', 'SSD 512GB']], 18_000_000, 28_000_000, 8],
    ['MH', 'Màn hình', [['Dell', 'P2422H'], ['LG', '24MP400'], ['Samsung', 'LS24C310']], 2_800_000, 4_500_000, 10],
    ['MI', 'Máy in', [['Canon', 'LBP 2900'], ['HP', 'LaserJet Pro M404dn'], ['Brother', 'HL-L2321D']], 3_500_000, 9_000_000, 8],
    ['MPT', 'Máy photocopy', [['Ricoh', 'MP 3055'], ['Fujifilm', 'Apeos 2560']], 45_000_000, 85_000_000, 2],
    ['MC', 'Máy chủ', [['Dell', 'PowerEdge R650', 'Intel Xeon Silver 4314', '64GB', 'SSD 2x960GB RAID1']], 180_000_000, 260_000_000, 2],
    ['TBM', 'Thiết bị mạng', [['Cisco', 'Catalyst 1000-24T'], ['TP-Link', 'Omada EAP245'], ['Fortinet', 'FortiGate 60F']], 3_000_000, 35_000_000, 6],
    ['UPS', 'Bộ lưu điện', [['APC', 'Smart-UPS 1500VA'], ['Santak', 'Blazer 1000 Pro']], 2_500_000, 12_000_000, 5],
    ['MCH', 'Máy chiếu', [['Epson', 'EB-X51'], ['ViewSonic', 'PA503X']], 11_000_000, 16_000_000, 3],
    ['CAM', 'Camera giám sát', [['Hikvision', 'DS-2CD1023G0E-I']], 1_200_000, 2_000_000, 6],
  ];
  const statuses = ['in_use', 'in_use', 'in_use', 'in_use', 'in_use', 'in_stock', 'broken', 'repairing'];
  const people = ['Nguyễn Văn An', 'Trần Thị Bích', 'Lê Hoàng Cường', 'Phạm Thị Dung', 'Hoàng Minh Đức', 'Võ Thị Hạnh', 'Đặng Quốc Khánh', 'Bùi Thu Trang', 'Ngô Thanh Sơn', 'Đỗ Thị Yến'];
  const funds = all('SELECT id FROM funding_sources').map((f) => f.id);
  let ip = 20;
  const deviceIds = [];
  for (const [code, label, variants, pMin, pMax, count] of models) {
    const c = cat(code);
    for (let i = 0; i < count; i++) {
      const v = pickOne(variants);
      const purchase = date(2017, 2025);
      const status = pickOne(statuses);
      const d = status === 'in_stock' ? null : dept();
      const price = Math.round((pMin + rnd() * (pMax - pMin)) / 100000) * 100000;
      const id = insert('devices', {
        asset_code: nextAssetCode(c.prefix), name: `${label} ${v[0]} ${v[1]}`, category_id: c.id, brand: v[0], model: v[1],
        serial_number: Math.floor(rnd() * 1e10).toString(36).toUpperCase().padStart(8, 'X'),
        cpu: v[2] || null, ram: v[3] || null, storage: v[4] || null,
        os: ['MTDB', 'MTXT'].includes(code) ? pickOne(['Windows 11 Pro', 'Windows 10 Pro']) : code === 'MC' ? 'Windows Server 2022' : null,
        ip_address: ['MTDB', 'MTXT', 'MI', 'MC', 'TBM', 'CAM'].includes(code) ? `192.168.1.${ip++}` : null,
        hostname: ['MTDB', 'MTXT'].includes(code) ? `PC-${String(ip).padStart(3, '0')}` : null,
        supplier_id: pickOne(suppliers), funding_source_id: pickOne(funds.slice(0, 3)),
        purchase_date: purchase, in_use_date: status === 'in_stock' ? null : purchase,
        original_price: price, depreciation_years: c.depreciation_years, warranty_months: pickOne([12, 24, 36]),
        warranty_end: null, status, condition: status === 'broken' ? 'broken' : pickOne(['good', 'good', 'fair', 'average']),
        department_id: d?.id ?? null, assigned_to: d && ['MTDB', 'MTXT'].includes(code) ? pickOne(people) : null,
        location: d ? `Phòng ${100 + Math.floor(rnd() * 4) * 100 + Math.floor(rnd() * 10)}` : 'Kho',
        contract_no: `${Math.floor(rnd() * 90) + 10}/${purchase.slice(0, 4)}/HĐMB`, unit: code === 'MTDB' ? 'Bộ' : 'Chiếc', origin: pickOne(['Trung Quốc', 'Việt Nam', 'Malaysia', 'Thái Lan']),
      });
      run('UPDATE devices SET warranty_end = ? WHERE id = ?', addMonths(purchase, get('SELECT warranty_months FROM devices WHERE id = ?', id).warranty_months), id);
      run("INSERT INTO device_history(device_id, action, description, user_name, created_at) VALUES (?, 'Tạo mới', 'Ghi tăng thiết bị (dữ liệu mẫu)', 'Hệ thống', ?)", id, purchase + ' 08:00:00');
      deviceIds.push({ id, status, code });
    }
  }

  // Sửa chữa
  const tech = get("SELECT id FROM users WHERE username = 'kythuat'")?.id;
  for (const d of deviceIds.filter((x) => ['broken', 'repairing'].includes(x.status)).slice(0, 8)) {
    const rd = date(2026, 2026);
    insert('repairs', {
      code: nextCode('repairs', 'SC', rd), device_id: d.id, reporter_name: pickOne(people), report_date: rd > new Date().toISOString().slice(0, 10) ? new Date().toISOString().slice(0, 10) : rd,
      problem: pickOne(['Máy không lên nguồn', 'Màn hình xanh khi khởi động Windows', 'Máy in kẹt giấy liên tục, in bị mờ', 'Ổ cứng phát ra tiếng kêu, chạy rất chậm', 'Mất kết nối mạng', 'UPS báo lỗi ắc quy']),
      priority: pickOne(['normal', 'high', 'urgent', 'low']), status: d.status === 'repairing' ? 'in_progress' : 'pending',
      technician_id: d.status === 'repairing' ? tech : null, prev_device_status: 'in_use', repair_type: d.status === 'repairing' ? 'internal' : null,
    });
  }
  // Bảo trì
  const t = new Date();
  for (const d of deviceIds.filter((x) => ['MC', 'UPS', 'TBM'].includes(x.code))) {
    const dd = new Date(t.getTime() + (Math.floor(rnd() * 60) - 15) * 86400000).toISOString().slice(0, 10);
    insert('maintenances', { title: pickOne(['Kiểm tra, vệ sinh định kỳ', 'Kiểm tra ắc quy, cập nhật firmware', 'Sao lưu cấu hình, kiểm tra log']), device_id: d.id, scheduled_date: dd, interval_months: 6, assignee_id: tech });
  }
  // Bản quyền
  insert('licenses', { name: 'Microsoft Office LTSC Standard', version: '2021', publisher: 'Microsoft', license_type: 'volume', seats: 30, purchase_date: '2023-05-10', price: 125_000_000 });
  insert('licenses', { name: 'Kaspersky Endpoint Security for Business', version: '12', publisher: 'Kaspersky', license_type: 'subscription', seats: 40, purchase_date: '2025-12-01', expiry_date: addMonths(new Date().toISOString().slice(0, 10), 1), price: 28_000_000 });
  insert('licenses', { name: 'Windows 11 Pro', publisher: 'Microsoft', license_type: 'oem', seats: 0, note: 'Bản quyền OEM đi kèm máy' });
});

console.log('✔ Đã tạo dữ liệu mẫu.');
console.log('  Tài khoản dùng thử (mật khẩu Demo@1234): quanly, kythuat, lanhdao, nhanvien');
closeDb();
