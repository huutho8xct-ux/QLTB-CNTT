import { state } from './app.js';
import { esc, fmtDate, fmtMoney, moneyToWords, toast } from './ui.js';
import { CONDITIONS, DEVICE_STATUS, ALLOCATION_TYPES, REPAIR_STATUS, REPAIR_TYPE, DISPOSAL_METHOD, labelOf } from './constants.js';

const CSS = `
  @page { size: A4; margin: 15mm 15mm 15mm 20mm; }
  body { font-family: "Times New Roman", Times, serif; font-size: 13pt; color: #000; margin: 0; line-height: 1.4; }
  .hdr { display: flex; justify-content: space-between; text-align: center; margin-bottom: 14px; }
  .hdr > div { width: 48%; }
  .hdr .l1 { font-size: 12pt; }
  .hdr b { display: block; }
  .hdr u { text-decoration: none; border-bottom: 1px solid #000; padding-bottom: 1px; }
  .hdr .no { margin-top: 6px; font-size: 12pt; }
  .hdr .date { font-style: italic; margin-top: 6px; font-size: 12pt; }
  h1 { text-align: center; font-size: 15pt; margin: 18px 0 4px; text-transform: uppercase; }
  .subtitle { text-align: center; font-style: italic; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11.5pt; }
  th, td { border: 1px solid #000; padding: 4px 5px; vertical-align: top; }
  th { text-align: center; font-weight: bold; }
  td.num { text-align: right; white-space: nowrap; } td.center { text-align: center; }
  tfoot td { font-weight: bold; }
  .sign { display: flex; justify-content: space-around; text-align: center; margin-top: 24px; page-break-inside: avoid; }
  .sign > div { flex: 1; }
  .sign b { display: block; }
  .sign i { font-size: 11pt; }
  .sign .space { height: 80px; }
  p { margin: 4px 0; text-align: justify; }
  .landscape { }
  .labels { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; font-family: Arial, sans-serif; }
  .label { border: 1px dashed #555; padding: 3mm; display: flex; gap: 3mm; align-items: center; page-break-inside: avoid; height: 32mm; overflow: hidden; }
  .label img { width: 26mm; height: 26mm; flex-shrink: 0; }
  .label .t { font-size: 7.5pt; line-height: 1.25; }
  .label .t b { font-size: 9.5pt; display: block; }
  .label .t .org { font-size: 6.5pt; text-transform: uppercase; color: #333; }
  .dl td:first-child { width: 32%; }
  @media screen { body { padding: 20px; background: #888; } .page { background: #fff; padding: 20mm; max-width: 210mm; margin: auto; box-shadow: 0 0 10px rgba(0,0,0,.4); } .page.wide { max-width: 297mm; } }
`;

function header(docNo) {
  const s = state.settings;
  const d = new Date();
  return `<div class="hdr">
    <div><div class="l1">${esc((s.org_parent || '').toUpperCase())}</div><b><u>${esc((s.org_name || '').toUpperCase())}</u></b>${docNo ? `<div class="no">Số: ${esc(docNo)}</div>` : ''}</div>
    <div><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><b><u>Độc lập - Tự do - Hạnh phúc</u></b>
    <div class="date">${esc(s.org_city || '')}, ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}</div></div>
  </div>`;
}

function dateWords(str) {
  if (!str) return '';
  const [y, m, d] = str.slice(0, 10).split('-');
  return `ngày ${Number(d)} tháng ${Number(m)} năm ${y}`;
}

function signs(list) {
  return `<div class="sign">${list.map(([title, name, note]) => `<div><b>${esc(title)}</b><i>${esc(note || '(Ký, ghi rõ họ tên)')}</i><div class="space"></div><b>${esc(name || '')}</b></div>`).join('')}</div>`;
}

export function printHtml(title, body, { wide = false } = {}) {
  const w = window.open('', '_blank');
  if (!w) {
    toast('Trình duyệt đã chặn cửa sổ in. Vui lòng cho phép cửa sổ bật lên (pop-up).', 'warn');
    return;
  }
  w.document.open();
  w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}${wide ? '@page { size: A4 landscape; }' : ''}</style></head>
    <body><div class="page ${wide ? 'wide' : ''}">${body}</div></body></html>`);
  w.document.close();
  const imgs = [...w.document.images];
  Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))).then(() => {
    setTimeout(() => { w.focus(); w.print(); }, 200);
  });
}

/* ---------- Biên bản bàn giao / điều chuyển / thu hồi ---------- */
export function printAllocation(a) {
  const t = labelOf(ALLOCATION_TYPES, a.type);
  const s = state.settings;
  const title = a.type === 'recall' ? 'BIÊN BẢN THU HỒI THIẾT BỊ' : a.type === 'transfer' ? 'BIÊN BẢN ĐIỀU CHUYỂN THIẾT BỊ' : 'BIÊN BẢN BÀN GIAO THIẾT BỊ';
  const giao = a.type === 'allocate' ? (s.org_name ? `Bộ phận quản lý tài sản - ${s.org_name}` : 'Bộ phận quản lý tài sản') : a.from_department_name || 'Kho';
  const nhan = a.type === 'recall' ? 'Bộ phận quản lý tài sản (nhập kho)' : a.to_department_name || '';
  const body = `${header(a.code)}
    <h1>${title}</h1>
    <div class="subtitle">${a.decision_no ? `Căn cứ ${esc(a.decision_no)}` : ''}</div>
    <p>Hôm nay, ${dateWords(a.doc_date)}, tại ${esc(s.org_name || '')}, chúng tôi gồm:</p>
    <p><b>Bên giao:</b> ${esc(giao)}</p>
    <p style="padding-left:20px">Đại diện: ${esc(a.handover_person || '.................................................')}</p>
    <p><b>Bên nhận:</b> ${esc(nhan)}</p>
    <p style="padding-left:20px">Đại diện: ${esc(a.receiver_person || '.................................................')}${a.receiver_position ? ` - Chức vụ: ${esc(a.receiver_position)}` : ''}</p>
    <p>Hai bên thống nhất ${t.toLowerCase()} các thiết bị sau:${a.reason ? ` (Lý do: ${esc(a.reason)})` : ''}</p>
    <table><thead><tr><th>STT</th><th>Mã TS</th><th>Tên thiết bị</th><th>Model / Serial</th><th>ĐVT</th><th>SL</th><th>Tình trạng</th><th>Ghi chú</th></tr></thead>
    <tbody>${a.items.map((i, k) => `<tr><td class="center">${k + 1}</td><td>${esc(i.asset_code)}</td><td>${esc(i.name)}</td>
      <td>${esc([i.model, i.serial_number].filter(Boolean).join(' / '))}</td><td class="center">${esc(i.unit || 'Chiếc')}</td><td class="center">1</td>
      <td>${esc(labelOf(CONDITIONS, i.condition))}</td><td>${esc(i.note || '')}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="5" class="center">Tổng cộng</td><td class="center">${a.items.length}</td><td colspan="2"></td></tr></tfoot></table>
    ${a.location ? `<p>Vị trí lắp đặt/sử dụng: ${esc(a.location)}</p>` : ''}
    <p>Bên nhận có trách nhiệm quản lý, sử dụng thiết bị đúng mục đích, bảo quản theo quy định của đơn vị. Khi thiết bị hư hỏng phải báo ngay cho bộ phận CNTT.</p>
    <p>Biên bản được lập thành 02 bản, mỗi bên giữ 01 bản có giá trị pháp lý như nhau.</p>
    ${signs([['ĐẠI DIỆN BÊN GIAO', a.handover_person], ['ĐẠI DIỆN BÊN NHẬN', a.receiver_person], ['THỦ TRƯỞNG ĐƠN VỊ', s.director_name, '(Ký, đóng dấu)']])}`;
  printHtml(title, body);
}

/* ---------- Phiếu sửa chữa ---------- */
export function printRepair(r) {
  const s = state.settings;
  const body = `${header(r.code)}
    <h1>PHIẾU YÊU CẦU VÀ NGHIỆM THU SỬA CHỮA THIẾT BỊ</h1>
    <div class="subtitle">Ngày yêu cầu: ${fmtDate(r.report_date)}</div>
    <table class="dl">
      <tr><td>Thiết bị</td><td><b>${esc(r.asset_code)}</b> - ${esc(r.device_name)}</td></tr>
      <tr><td>Model / Serial</td><td>${esc([r.model, r.serial_number].filter(Boolean).join(' / '))}</td></tr>
      <tr><td>Phòng ban / Người sử dụng</td><td>${esc(r.department_name || 'Kho')}${r.assigned_to ? ' - ' + esc(r.assigned_to) : ''}</td></tr>
      <tr><td>Người báo hỏng</td><td>${esc(r.reporter_name || '')}${r.reporter_phone ? ' - ĐT: ' + esc(r.reporter_phone) : ''}</td></tr>
      <tr><td>Hiện tượng hư hỏng</td><td>${esc(r.problem)}</td></tr>
      <tr><td>Bảo hành đến</td><td>${r.warranty_end ? fmtDate(r.warranty_end) + (r.warranty_end >= new Date().toISOString().slice(0, 10) ? ' (còn bảo hành)' : ' (hết bảo hành)') : 'Không có thông tin'}</td></tr>
      <tr><td>Kết quả kiểm tra, chẩn đoán</td><td>${esc(r.diagnosis || '')}</td></tr>
      <tr><td>Hình thức sửa chữa</td><td>${esc(labelOf(REPAIR_TYPE, r.repair_type))}${r.vendor ? ' - ' + esc(r.vendor) : ''}</td></tr>
      <tr><td>Biện pháp khắc phục</td><td>${esc(r.solution || '')}</td></tr>
      <tr><td>Linh kiện thay thế</td><td>${esc(r.parts_replaced || '')}</td></tr>
      <tr><td>Chi phí</td><td>${r.cost ? fmtMoney(r.cost) + ' đồng (' + moneyToWords(r.cost) + ')' : ''}</td></tr>
      <tr><td>Thời gian</td><td>${r.start_date ? 'Từ ' + fmtDate(r.start_date) : ''} ${r.finish_date ? 'đến ' + fmtDate(r.finish_date) : ''}</td></tr>
      <tr><td>Kết quả</td><td>${esc(labelOf(REPAIR_STATUS, r.status))}</td></tr>
    </table>
    ${signs([['NGƯỜI YÊU CẦU', r.reporter_name], ['NGƯỜI SỬA CHỮA', r.technician_name || r.vendor], ['XÁC NHẬN CỦA LÃNH ĐẠO', s.director_name]])}`;
  printHtml('Phiếu sửa chữa ' + r.code, body);
}

/* ---------- Biên bản kiểm kê ---------- */
export function printInventory(inv) {
  const s = state.settings;
  const items = inv.items;
  const ok = items.filter((i) => i.found === 1 && !i.is_extra).length;
  const missing = items.filter((i) => i.found === 0).length;
  const extra = items.filter((i) => i.is_extra).length;
  const totalPrice = items.filter((i) => !i.is_extra).reduce((a, i) => a + (i.original_price || 0), 0);
  const totalRemain = items.filter((i) => !i.is_extra).reduce((a, i) => a + (i.remaining || 0), 0);
  const body = `${header(inv.code)}
    <h1>BIÊN BẢN KIỂM KÊ THIẾT BỊ CÔNG NGHỆ THÔNG TIN</h1>
    <div class="subtitle">${esc(inv.name)} - Thời điểm kiểm kê: ${dateWords(inv.inventory_date)}${inv.department_name ? '<br>Phạm vi: ' + esc(inv.department_name) : ''}</div>
    <p><b>Thành phần Ban kiểm kê:</b></p><p style="white-space:pre-line;padding-left:20px">${esc(inv.committee || '.......................................................')}</p>
    <p><b>Kết quả kiểm kê:</b> Tổng số theo sổ sách: <b>${items.filter((i) => !i.is_extra).length}</b> thiết bị; khớp đúng: <b>${ok}</b>; thiếu: <b>${missing}</b>; thừa: <b>${extra}</b>.</p>
    <p>Tổng nguyên giá theo sổ sách: <b>${fmtMoney(totalPrice)}</b> đồng; giá trị còn lại: <b>${fmtMoney(totalRemain)}</b> đồng.</p>
    <table><thead><tr><th rowspan="2">STT</th><th rowspan="2">Mã TS</th><th rowspan="2">Tên thiết bị</th><th rowspan="2">Nguyên giá</th><th rowspan="2">GT còn lại</th>
      <th colspan="2">Số lượng</th><th rowspan="2">Chênh lệch</th><th rowspan="2">Tình trạng thực tế</th><th rowspan="2">Ghi chú</th></tr>
      <tr><th>Sổ sách</th><th>Thực tế</th></tr></thead>
    <tbody>${items.map((i, k) => {
    const book = i.is_extra ? 0 : 1, act = i.found ? 1 : 0;
    return `<tr><td class="center">${k + 1}</td><td>${esc(i.asset_code)}</td><td>${esc(i.name)}<br><small>${esc(i.book_department_name || '')}</small></td>
      <td class="num">${fmtMoney(i.original_price)}</td><td class="num">${fmtMoney(i.remaining)}</td><td class="center">${book}</td><td class="center">${i.found == null ? '?' : act}</td>
      <td class="center">${i.found == null ? '' : act - book || ''}</td><td>${esc(labelOf(CONDITIONS, i.actual_condition))}</td><td>${esc(i.note || '')}</td></tr>`;
  }).join('')}</tbody></table>
    <p><b>Kết luận, kiến nghị:</b></p><p style="white-space:pre-line">${esc(inv.conclusion || '.......................................................................................................................')}</p>
    ${signs([['NGƯỜI LẬP BIỂU', s.asset_manager_name], ['KẾ TOÁN', s.accountant_name], ['TRƯỞNG BAN KIỂM KÊ', ''], [(s.director_title || 'THỦ TRƯỞNG ĐƠN VỊ').toUpperCase(), s.director_name, '(Ký, đóng dấu)']])}`;
  printHtml('Biên bản kiểm kê ' + inv.code, body, { wide: true });
}

/* ---------- Hồ sơ thanh lý ---------- */
export function printDisposal(x) {
  const s = state.settings;
  const tp = x.items.reduce((a, i) => a + (i.original_price || 0), 0);
  const tr = x.items.reduce((a, i) => a + (i.remaining_value || 0), 0);
  const body = `${header(x.code)}
    <h1>${x.status === 'completed' ? 'BIÊN BẢN THANH LÝ TÀI SẢN, THIẾT BỊ CNTT' : 'DANH MỤC TÀI SẢN, THIẾT BỊ CNTT ĐỀ NGHỊ THANH LÝ'}</h1>
    <div class="subtitle">${x.decision_no ? `Kèm theo Quyết định số ${esc(x.decision_no)}${x.decision_date ? ' ' + dateWords(x.decision_date) : ''}` : `(Kèm theo Tờ trình ${dateWords(x.doc_date)})`}</div>
    <p><b>Lý do thanh lý:</b> ${esc(x.reason || '')}</p>
    <p><b>Hình thức thanh lý:</b> ${esc(labelOf(DISPOSAL_METHOD, x.method))}</p>
    <table><thead><tr><th>STT</th><th>Mã TS</th><th>Tên tài sản</th><th>Model / Serial</th><th>Năm SD</th><th>Nguyên giá</th><th>Giá trị còn lại</th><th>Tình trạng</th></tr></thead>
    <tbody>${x.items.map((i, k) => `<tr><td class="center">${k + 1}</td><td>${esc(i.asset_code)}</td><td>${esc(i.name)}</td><td>${esc([i.model, i.serial_number].filter(Boolean).join(' / '))}</td>
      <td class="center">${esc((i.in_use_date || i.purchase_date || '').slice(0, 4))}</td><td class="num">${fmtMoney(i.original_price)}</td><td class="num">${fmtMoney(i.remaining_value)}</td><td>${esc(labelOf(CONDITIONS, i.condition))}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="5" class="center">Tổng cộng (${x.items.length} tài sản)</td><td class="num">${fmtMoney(tp)}</td><td class="num">${fmtMoney(tr)}</td><td></td></tr></tfoot></table>
    <p><i>Tổng nguyên giá bằng chữ: ${moneyToWords(tp)}.</i></p>
    ${x.status === 'completed' ? `<p>Ngày hoàn thành thanh lý: ${fmtDate(x.completed_date)}. Số tiền thu được: <b>${fmtMoney(x.revenue)}</b> đồng; chi phí thanh lý: <b>${fmtMoney(x.expense)}</b> đồng.</p>` : ''}
    ${signs([['NGƯỜI LẬP', s.asset_manager_name], ['KẾ TOÁN', s.accountant_name], [(s.director_title || 'THỦ TRƯỞNG ĐƠN VỊ').toUpperCase(), s.director_name, '(Ký, đóng dấu)']])}`;
  printHtml('Thanh lý ' + x.code, body);
}

/* ---------- Lý lịch thiết bị ---------- */
export function printDeviceCard(d, history = []) {
  const s = state.settings;
  const row = (l, v) => `<tr><td>${l}</td><td>${v ?? ''}</td></tr>`;
  const body = `${header()}
    <h1>LÝ LỊCH THIẾT BỊ CÔNG NGHỆ THÔNG TIN</h1>
    <div class="subtitle">Mã tài sản: <b>${esc(d.asset_code)}</b></div>
    <div style="display:flex;gap:16px;align-items:flex-start">
    <table class="dl" style="flex:1">
      ${row('Tên thiết bị', `<b>${esc(d.name)}</b>`)}${row('Loại', esc(d.category_name))}${row('Hãng / Model', esc([d.brand, d.model].filter(Boolean).join(' / ')))}
      ${row('Số serial', esc(d.serial_number))}${row('Xuất xứ / Năm SX', esc([d.origin, d.manufacture_year].filter(Boolean).join(' / ')))}
      ${row('Cấu hình', esc([d.cpu, d.ram, d.storage, d.os].filter(Boolean).join(' | ')))}${d.specs ? row('Thông số khác', esc(d.specs)) : ''}
      ${row('Nhà cung cấp', esc(d.supplier_name))}${row('Hóa đơn / Hợp đồng', esc([d.invoice_no, d.contract_no].filter(Boolean).join(' / ')))}
      ${row('Ngày mua / Đưa vào SD', `${fmtDate(d.purchase_date)} / ${fmtDate(d.in_use_date)}`)}${row('Nguồn vốn', esc(d.funding_name))}
      ${row('Nguyên giá', fmtMoney(d.original_price) + ' đồng')}${row('Hao mòn lũy kế / Còn lại', `${fmtMoney(d.accumulated)} / ${fmtMoney(d.remaining)} đồng`)}
      ${row('Bảo hành đến', fmtDate(d.warranty_end))}${row('Phòng ban / Người SD', esc([d.department_name || 'Kho', d.assigned_to].filter(Boolean).join(' - ')))}
      ${row('Vị trí', esc(d.location))}${row('Trạng thái / Tình trạng', `${esc(labelOf(DEVICE_STATUS, d.status))} / ${esc(labelOf(CONDITIONS, d.condition))}`)}
    </table>
    <img src="${qrUrl(d)}" style="width:35mm;height:35mm">
    </div>
    <h3 style="margin-top:16px">QUÁ TRÌNH SỬ DỤNG, SỬA CHỮA</h3>
    <table><thead><tr><th>Thời gian</th><th>Nội dung</th><th>Diễn giải</th><th>Người thực hiện</th></tr></thead>
    <tbody>${history.map((h) => `<tr><td class="nowrap">${fmtDate(h.created_at)}</td><td>${esc(h.action)}</td><td>${esc(h.description || '')}</td><td>${esc(h.user_name || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="center">Chưa có</td></tr>'}</tbody></table>
    ${signs([['NGƯỜI LẬP', s.asset_manager_name], [(s.director_title || 'THỦ TRƯỞNG ĐƠN VỊ').toUpperCase(), s.director_name, '(Ký, đóng dấu)']])}`;
  printHtml('Lý lịch thiết bị ' + d.asset_code, body);
}

export function qrUrl(d) {
  const base = location.origin + location.pathname;
  return new URL(`api/qr?text=${encodeURIComponent(`${base}#/devices/code/${d.asset_code}`)}`, location.href).href;
}

/* ---------- In tem QR ---------- */
export function printLabels(devices) {
  const org = state.settings.org_name || '';
  const body = `<div class="labels">${devices.map((d) => `<div class="label"><img src="${qrUrl(d)}">
    <div class="t"><div class="org">${esc(org)}</div><b>${esc(d.asset_code)}</b>${esc(d.name)}<br>${d.serial_number ? 'SN: ' + esc(d.serial_number) + '<br>' : ''}${d.purchase_date ? 'Năm: ' + esc(d.purchase_date.slice(0, 4)) : ''}${d.department_name ? '<br>' + esc(d.department_name) : ''}</div></div>`).join('')}</div>`;
  printHtml('Tem thiết bị', body);
}

/* ---------- In báo cáo dạng bảng ---------- */
export function printReport(rep) {
  const s = state.settings;
  const cell = (c, v) => {
    if (v == null || v === '') return '<td></td>';
    if (c.type === 'money') return `<td class="num">${fmtMoney(v)}</td>`;
    if (c.type === 'number') return `<td class="num">${Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}</td>`;
    if (c.type === 'date') return `<td class="center">${fmtDate(v)}</td>`;
    return `<td>${esc(v)}</td>`;
  };
  const body = `${header()}
    <h1>${esc(rep.title)}</h1><div class="subtitle">${esc(rep.subtitle || '')}</div>
    <table><thead><tr><th>STT</th>${rep.columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rep.rows.map((r, i) => `<tr><td class="center">${i + 1}</td>${rep.columns.map((c) => cell(c, r[c.key])).join('')}</tr>`).join('')}</tbody>
    ${rep.totals ? `<tfoot><tr><td></td>${rep.columns.map((c, i) => (i === 0 ? '<td>TỔNG CỘNG</td>' : rep.totals[c.key] != null ? cell(c, rep.totals[c.key]) : '<td></td>')).join('')}</tr></tfoot>` : ''}
    </table>
    ${signs([['NGƯỜI LẬP BIỂU', s.asset_manager_name], ['KẾ TOÁN TRƯỞNG', s.accountant_name], [(s.director_title || 'THỦ TRƯỞNG ĐƠN VỊ').toUpperCase(), s.director_name, '(Ký, đóng dấu)']])}`;
  printHtml(rep.title, body, { wide: rep.columns.length > 7 });
}
