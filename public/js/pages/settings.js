import { api } from '../api.js';
import { loadSettings } from '../app.js';
import { DEPRECIATION_METHOD } from '../constants.js';
import { $, $$, esc, fmtDateTime, fmtSize, toast, toastError, renderForm, bindForm, collectForm, mapOptions, confirmDialog } from '../ui.js';

const FIELDS = [
  { type: 'section', label: 'Thông tin đơn vị (hiển thị trên biên bản, báo cáo)' },
  { name: 'org_parent', label: 'Cơ quan chủ quản', col: 6, placeholder: 'VD: UBND TỈNH ... / SỞ ...' },
  { name: 'org_name', label: 'Tên đơn vị', col: 6, required: true },
  { name: 'org_address', label: 'Địa chỉ', col: 8 }, { name: 'org_city', label: 'Địa danh (ghi ngày tháng)', col: 4, placeholder: 'VD: Cần Thơ' },
  { name: 'org_phone', label: 'Điện thoại', col: 4 }, { name: 'org_email', label: 'Email', col: 4 }, { name: 'org_tax_code', label: 'Mã số thuế / Mã ĐVQHNS', col: 4 },
  { name: 'director_title', label: 'Chức danh thủ trưởng', col: 4 }, { name: 'director_name', label: 'Họ tên thủ trưởng', col: 4 },
  { name: 'accountant_name', label: 'Kế toán trưởng / Phụ trách kế toán', col: 4 },
  { name: 'asset_manager_name', label: 'Cán bộ quản lý tài sản', col: 4 },
  { type: 'section', label: 'Tham số nghiệp vụ' },
  { name: 'depreciation_method', label: 'Phương pháp tính hao mòn', type: 'select', options: '', col: 6, help: 'Áp dụng theo quy định chế độ quản lý, tính hao mòn TSCĐ hiện hành tại đơn vị' },
  { name: 'fixed_asset_threshold', label: 'Ngưỡng nguyên giá TSCĐ (đồng)', type: 'money', col: 6, help: 'Thiết bị có nguyên giá từ mức này trở lên được xác định là TSCĐ' },
  { name: 'warranty_alert_days', label: 'Cảnh báo hết bảo hành trước (ngày)', type: 'number', col: 4 },
  { name: 'license_alert_days', label: 'Cảnh báo hết hạn bản quyền trước (ngày)', type: 'number', col: 4 },
  { name: 'maintenance_alert_days', label: 'Nhắc bảo trì trước (ngày)', type: 'number', col: 4 },
  { type: 'section', label: 'Bảo mật & sao lưu' },
  { name: 'session_hours', label: 'Thời gian phiên đăng nhập (giờ)', type: 'number', col: 4 },
  { name: 'auto_backup', label: 'Tự động sao lưu hằng ngày', type: 'checkbox', col: 4 },
  { name: 'backup_keep', label: 'Số bản sao lưu tự động giữ lại', type: 'number', col: 4 },
];

export default async function settings(ctx) {
  ctx.setTitle('Cấu hình - Sao lưu');
  const [s, info] = await Promise.all([api.get('/system/settings'), api.get('/system/system-info')]);
  const fields = FIELDS.map((f) => (f.name === 'depreciation_method' ? { ...f, options: mapOptions(DEPRECIATION_METHOD, s.depreciation_method) } : f));
  ctx.el.innerHTML = `
    <div class="page-head"><h2>Cấu hình hệ thống</h2></div>
    <div class="card mb"><div class="card-body">${renderForm(fields, { ...s, auto_backup: s.auto_backup === '1' ? 1 : 0 })}</div>
      <div class="modal-footer"><button class="btn btn-primary" id="save">💾 Lưu cấu hình</button></div></div>
    <div class="grid-2">
      <div class="card"><div class="card-header"><h3>Sao lưu & phục hồi dữ liệu</h3>
        <button class="btn btn-primary btn-sm" id="bBackup">＋ Sao lưu ngay</button>
        <label class="btn btn-sm">⬆️ Phục hồi từ tệp<input type="file" id="fRestore" accept=".db" hidden></label></div>
        <div class="card-body" style="padding:0"><div class="alert alert-warn" style="margin:12px">Phục hồi sẽ ghi đè toàn bộ dữ liệu hiện tại. Hệ thống tự tạo một bản sao lưu an toàn trước khi phục hồi.</div>
        <div id="bk"></div></div></div>
      <div class="card"><div class="card-header"><h3>Thông tin hệ thống</h3></div><div class="card-body"><dl class="dl">
        <dt>Phiên bản Node.js</dt><dd>${esc(info.node)}</dd><dt>Hệ điều hành</dt><dd>${esc(info.platform)}</dd><dt>Máy chủ</dt><dd>${esc(info.hostname)}</dd>
        <dt>Thời gian chạy</dt><dd>${Math.floor(info.uptime / 3600)} giờ ${Math.floor((info.uptime % 3600) / 60)} phút</dd>
        <dt>Thư mục dữ liệu</dt><dd style="font-family:monospace">${esc(info.data_dir)}</dd><dt>Dung lượng CSDL</dt><dd>${fmtSize(info.db_size)}</dd>
        <dt>Số liệu</dt><dd>${info.counts.devices} thiết bị · ${info.counts.users} người dùng · ${info.counts.repairs} phiếu sửa chữa · ${info.counts.allocations} phiếu bàn giao · ${info.counts.audit_logs} bản ghi nhật ký</dd>
      </dl></div></div>
    </div>`;
  const form = $('form', ctx.el);
  bindForm(form);
  $('#save', ctx.el).addEventListener('click', async () => {
    try {
      const d = collectForm(form, fields);
      d.auto_backup = d.auto_backup ? '1' : '0';
      await api.put('/system/settings', d);
      await loadSettings();
      toast('Đã lưu cấu hình');
    } catch (e) { toastError(e); }
  });

  const loadBackups = async () => {
    const list = await api.get('/system/backups');
    $('#bk', ctx.el).innerHTML = list.length ? `<div class="table-wrap" style="max-height:360px"><table class="table"><thead><tr><th>Tệp sao lưu</th><th>Thời gian</th><th class="num">Dung lượng</th><th></th></tr></thead>
      <tbody>${list.map((b) => `<tr><td style="font-family:monospace;font-size:12px">${esc(b.name)}</td><td class="nowrap">${fmtDateTime(new Date(b.created_at).toLocaleString('sv-SE'))}</td><td class="num">${fmtSize(b.size)}</td>
        <td class="nowrap"><button class="link-btn" data-dl="${esc(b.name)}">Tải về</button> · <button class="link-btn" data-restore="${esc(b.name)}">Phục hồi</button> · <button class="link-btn danger" data-del="${esc(b.name)}">Xóa</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">Chưa có bản sao lưu</div>';
    $$('[data-dl]', ctx.el).forEach((b) => b.addEventListener('click', () => api.download(`/system/backups/${encodeURIComponent(b.dataset.dl)}/download`).catch(toastError)));
    $$('[data-del]', ctx.el).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmDialog(`Xóa tệp sao lưu ${esc(b.dataset.del)}?`, { danger: true, okText: 'Xóa' }))) return;
      try { await api.del(`/system/backups/${encodeURIComponent(b.dataset.del)}`); loadBackups(); } catch (e) { toastError(e); }
    }));
    $$('[data-restore]', ctx.el).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmDialog(`Phục hồi dữ liệu từ <b>${esc(b.dataset.restore)}</b>?<br>Toàn bộ dữ liệu hiện tại sẽ được thay thế.`, { danger: true, okText: 'Phục hồi' }))) return;
      try { await api.post(`/system/backups/${encodeURIComponent(b.dataset.restore)}/restore`); toast('Đã phục hồi dữ liệu. Hệ thống sẽ tải lại.'); setTimeout(() => location.reload(), 1200); } catch (e) { toastError(e); }
    }));
  };
  $('#bBackup', ctx.el).addEventListener('click', async () => {
    try { const r = await api.post('/system/backups'); toast(`Đã sao lưu: ${r.name}`); loadBackups(); } catch (e) { toastError(e); }
  });
  $('#fRestore', ctx.el).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!(await confirmDialog(`Phục hồi dữ liệu từ tệp <b>${esc(f.name)}</b>?<br>Toàn bộ dữ liệu hiện tại sẽ được thay thế.`, { danger: true, okText: 'Phục hồi' }))) return;
    try { await api.upload('/system/restore-upload', f); toast('Đã phục hồi dữ liệu. Hệ thống sẽ tải lại.'); setTimeout(() => location.reload(), 1200); } catch (err) { toastError(err); }
  });
  loadBackups();
}
