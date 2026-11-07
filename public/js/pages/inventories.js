import { api } from '../api.js';
import { state, navigate } from '../app.js';
import { INVENTORY_STATUS, CONDITIONS, DEVICE_STATUS, can, labelOf } from '../constants.js';
import { $, $$, esc, fmtDate, fmtMoney, fmtDateTime, badge, toast, toastError, formModal, todayStr, confirmDialog, mapOptions, modal } from '../ui.js';
import { printInventory } from '../print.js';

export default async function inventories(ctx) {
  if (ctx.view === 'detail') return detail(ctx);
  return list(ctx);
}

async function list(ctx) {
  ctx.setTitle('Kiểm kê thiết bị');
  const w = can(state.user, 'inventory.write');
  const rows = await api.get('/inventories');
  ctx.el.innerHTML = `
    <div class="page-head"><h2>Kiểm kê thiết bị</h2>${w ? '<button class="btn btn-primary" id="btnNew">＋ Tạo đợt kiểm kê</button>' : ''}</div>
    <div class="alert alert-info">Quy trình: Tạo đợt kiểm kê (hệ thống chốt danh sách theo sổ sách) → Ban kiểm kê quét mã QR / nhập mã tài sản hoặc đánh dấu từng thiết bị → Hoàn thành và in biên bản kiểm kê.</div>
    <div class="card"><div class="table-wrap"><table class="table">
      <thead><tr><th>Số</th><th>Tên đợt kiểm kê</th><th>Ngày</th><th>Phạm vi</th><th>Tiến độ</th><th class="center">Thiếu</th><th class="center">Thừa</th><th>Trạng thái</th></tr></thead>
      <tbody>${rows.map((i) => {
    const pct = i.total ? Math.round((i.checked / (i.total + i.extra)) * 100) : 0;
    return `<tr><td><a href="#/inventories/${i.id}"><b>${esc(i.code)}</b></a></td><td><a href="#/inventories/${i.id}" style="color:inherit">${esc(i.name)}</a></td>
      <td class="nowrap">${fmtDate(i.inventory_date)}</td><td>${esc(i.department_name || 'Toàn đơn vị')}</td>
      <td style="min-width:140px"><div class="progress"><div style="width:${pct}%"></div></div><small class="text-muted">${i.checked}/${i.total + i.extra} (${pct}%)</small></td>
      <td class="center ${i.missing ? 'text-red' : ''}">${i.missing}</td><td class="center">${i.extra}</td><td>${badge(INVENTORY_STATUS, i.status)}</td></tr>`;
  }).join('')}</tbody></table>${rows.length ? '' : '<div class="empty">Chưa có đợt kiểm kê nào</div>'}</div></div>`;
  $('#btnNew', ctx.el)?.addEventListener('click', () => formModal({
    title: 'Tạo đợt kiểm kê',
    fields: [
      { name: 'name', label: 'Tên đợt kiểm kê', required: true, default: `Kiểm kê thiết bị CNTT năm ${new Date().getFullYear()}` },
      { name: 'inventory_date', label: 'Thời điểm kiểm kê', type: 'date', default: todayStr(), col: 6, required: true },
      { name: 'department_id', label: 'Phạm vi', type: 'select', options: state.cat.departments, empty: 'Toàn đơn vị', col: 6 },
      { name: 'committee', label: 'Thành phần Ban kiểm kê', type: 'textarea', rows: 4, placeholder: '1. Ông/Bà ... - Chức vụ ... - Trưởng ban\n2. Ông/Bà ... - Kế toán - Thành viên\n3. ...' },
      { name: 'note', label: 'Ghi chú', type: 'textarea', rows: 2 },
    ],
    submitText: 'Tạo đợt kiểm kê',
    onSubmit: async (d) => {
      const r = await api.post('/inventories', d);
      toast(`Đã tạo đợt kiểm kê ${r.code} với ${r.count} thiết bị`);
      navigate(`/inventories/${r.id}`);
    },
  }));
}

async function detail(ctx) {
  const inv = await api.get(`/inventories/${ctx.params.id}`);
  if (!ctx.isCurrent()) return;
  ctx.setTitle(`Kiểm kê ${inv.code}`);
  const u = state.user;
  const open = inv.status === 'open';
  const canCheck = open && can(u, 'inventory.check');
  let filter = 'all';
  let search = '';

  ctx.el.innerHTML = `
    <div class="page-head"><div style="flex:1"><h2>${esc(inv.name)}</h2><div class="sub">${esc(inv.code)} · ${fmtDate(inv.inventory_date)} · ${esc(inv.department_name || 'Toàn đơn vị')} ${badge(INVENTORY_STATUS, inv.status)}</div></div>
      <a class="btn" href="#/inventories">← Danh sách</a>
      ${can(u, 'inventory.write') ? '<button class="btn" id="bEdit">✏️ Thông tin</button>' : ''}
      <button class="btn" id="bExcel">⬇️ Excel</button><button class="btn" id="bPrint">🖨️ In biên bản</button>
      ${open && can(u, 'inventory.write') ? '<button class="btn btn-success" id="bDone">✔ Hoàn thành kiểm kê</button>' : ''}
      ${can(u, 'inventory.write') && (open || u.role === 'admin') ? '<button class="btn btn-danger" id="bDel">Xóa</button>' : ''}
    </div>
    <div class="stats" id="stats"></div>
    ${canCheck ? `<div class="card mb"><div class="card-body">
      <label class="field"><span>Quét mã QR / mã vạch hoặc nhập mã tài sản rồi nhấn Enter</span></label>
      <div class="scan-box"><input id="scan" placeholder="VD: PC.00012 hoặc quét tem QR" autofocus>
        <select id="scanCond" style="max-width:160px">${mapOptions(CONDITIONS, '', 'Giữ tình trạng')}</select>
        <input id="scanLoc" placeholder="Vị trí thực tế (tùy chọn)" style="max-width:220px"></div>
      <div id="scanMsg" style="margin-top:8px"></div>
    </div></div>` : ''}
    <div class="card"><div class="card-body" style="padding-bottom:0"><div class="toolbar">
      <input class="search" type="search" id="fQ" placeholder="🔍 Lọc theo mã, tên...">
      <div class="chips" id="fChips">${[['all', 'Tất cả'], ['unchecked', 'Chưa kiểm'], ['found', 'Có mặt'], ['missing', 'Không thấy'], ['extra', 'Thừa'], ['changed', 'Thay đổi tình trạng']].map(([k, l]) => `<span class="chip ${k === 'all' ? 'active' : ''}" data-f="${k}">${l}</span>`).join('')}</div>
      ${canCheck ? '<span class="spacer"></span><button class="btn btn-sm" id="bAllFound">Đánh dấu tất cả chưa kiểm là "Có mặt"</button>' : ''}
    </div></div><div id="tbl"></div></div>`;

  const renderStats = () => {
    const it = inv.items;
    const book = it.filter((i) => !i.is_extra);
    const s = (v, l, c) => `<div class="card stat"><div><div class="val ${c || ''}">${v}</div><div class="lbl">${l}</div></div></div>`;
    $('#stats', ctx.el).innerHTML = s(book.length, 'Theo sổ sách') + s(it.filter((i) => i.found != null).length, 'Đã kiểm đếm')
      + s(it.filter((i) => i.found === 1 && !i.is_extra).length, 'Khớp (có mặt)', 'text-green') + s(it.filter((i) => i.found === 0).length, 'Thiếu (không thấy)', 'text-red')
      + s(it.filter((i) => i.is_extra).length, 'Thừa (ngoài sổ sách)', 'text-orange') + s(fmtMoney(book.reduce((a, i) => a + (i.original_price || 0), 0)), 'Tổng nguyên giá (đ)');
  };

  const match = (i) => {
    if (search && !`${i.asset_code} ${i.name} ${i.serial_number || ''}`.toLowerCase().includes(search)) return false;
    if (filter === 'unchecked') return i.found == null;
    if (filter === 'found') return i.found === 1;
    if (filter === 'missing') return i.found === 0;
    if (filter === 'extra') return !!i.is_extra;
    if (filter === 'changed') return i.found === 1 && i.actual_condition && i.actual_condition !== i.book_condition;
    return true;
  };

  const renderTable = () => {
    const rows = inv.items.filter(match);
    $('#tbl', ctx.el).innerHTML = `<div class="table-wrap" style="max-height:65vh"><table class="table">
      <thead><tr><th>Mã TS</th><th>Tên thiết bị</th><th>Theo sổ sách</th><th class="num">Nguyên giá</th><th>Kết quả</th><th>Tình trạng thực tế</th><th>Vị trí / Ghi chú</th>${canCheck ? '<th>Kiểm đếm</th>' : ''}</tr></thead>
      <tbody>${rows.map((i) => `<tr data-row="${i.id}">
        <td class="nowrap"><a href="#/devices/${i.device_id}">${esc(i.asset_code)}</a></td>
        <td>${esc(i.name)}<div class="muted">${esc(i.serial_number || '')}</div></td>
        <td>${esc(i.book_department_name || 'Kho')}<div class="muted">${esc([labelOf(DEVICE_STATUS, i.book_status), i.book_location, i.assigned_to].filter(Boolean).join(' · '))}</div></td>
        <td class="num">${fmtMoney(i.original_price)}</td>
        <td>${i.found == null ? '<span class="badge badge-gray">Chưa kiểm</span>' : i.found ? (i.is_extra ? '<span class="badge badge-orange">Thừa</span>' : '<span class="badge badge-green">Có mặt</span>') : '<span class="badge badge-red">Không thấy</span>'}
          ${i.checked_at ? `<div class="muted">${esc(i.checked_by || '')} ${fmtDateTime(i.checked_at)}</div>` : ''}</td>
        <td>${canCheck && i.found === 1 ? `<select data-cond="${i.id}">${mapOptions(CONDITIONS, i.actual_condition)}</select>` : esc(labelOf(CONDITIONS, i.actual_condition))}</td>
        <td>${canCheck ? `<input data-note="${i.id}" value="${esc(i.note || '')}" placeholder="Ghi chú">` : esc([i.actual_location, i.note].filter(Boolean).join(' · '))}</td>
        ${canCheck ? `<td class="nowrap"><button class="btn btn-sm ${i.found === 1 ? 'btn-success' : ''}" data-found="${i.id}">✔ Có</button> <button class="btn btn-sm ${i.found === 0 ? 'btn-danger' : ''}" data-missing="${i.id}">✕ Không</button>${i.found != null ? ` <button class="link-btn" data-reset="${i.id}">↺</button>` : ''}</td>` : ''}
      </tr>`).join('')}</tbody></table>${rows.length ? '' : '<div class="empty">Không có thiết bị</div>'}</div>`;
    const upd = async (id, body) => {
      try {
        const r = await api.post(`/inventories/${inv.id}/check`, { item_id: Number(id), ...body });
        const idx = inv.items.findIndex((x) => x.id === r.id);
        inv.items[idx] = r;
        renderStats();
        renderTable();
      } catch (e) { toastError(e); }
    };
    $$('[data-found]', ctx.el).forEach((b) => b.addEventListener('click', () => upd(b.dataset.found, { found: 1 })));
    $$('[data-missing]', ctx.el).forEach((b) => b.addEventListener('click', () => upd(b.dataset.missing, { found: 0 })));
    $$('[data-reset]', ctx.el).forEach((b) => b.addEventListener('click', () => upd(b.dataset.reset, { found: null })));
    $$('[data-cond]', ctx.el).forEach((s) => s.addEventListener('change', () => upd(s.dataset.cond, { found: 1, actual_condition: s.value })));
    $$('[data-note]', ctx.el).forEach((s) => s.addEventListener('change', () => {
      const it = inv.items.find((x) => x.id === Number(s.dataset.note));
      upd(s.dataset.note, { found: it.found ?? 1, note: s.value });
    }));
  };

  renderStats();
  renderTable();

  const scan = $('#scan', ctx.el);
  scan?.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    let code = scan.value.trim();
    // Hỗ trợ quét tem QR chứa đường dẫn .../#/devices/code/MÃ
    const m = code.match(/devices\/code\/([^/?#]+)/);
    if (m) code = decodeURIComponent(m[1]);
    if (!code) return;
    const msg = $('#scanMsg', ctx.el);
    try {
      const r = await api.post(`/inventories/${inv.id}/check`, { asset_code: code, found: 1, actual_condition: $('#scanCond', ctx.el).value || undefined, actual_location: $('#scanLoc', ctx.el).value || undefined });
      const idx = inv.items.findIndex((x) => x.id === r.id);
      if (idx >= 0) inv.items[idx] = r; else inv.items.push(r);
      msg.innerHTML = `<div class="alert ${r.is_extra ? 'alert-warn' : 'alert-info'}" style="margin:0">✔ ${esc(r.asset_code)} - ${esc(r.name)} ${r.is_extra ? '<b>(THỪA - không thuộc danh sách sổ sách của đợt kiểm kê)</b>' : ''}</div>`;
      renderStats();
      renderTable();
    } catch (err) {
      msg.innerHTML = `<div class="alert alert-error" style="margin:0">✕ ${esc(err.message)}</div>`;
    }
    scan.value = '';
    scan.focus();
  });

  $('#fQ', ctx.el).addEventListener('input', (e) => { search = e.target.value.toLowerCase().trim(); renderTable(); });
  $$('#fChips .chip', ctx.el).forEach((c) => c.addEventListener('click', () => {
    filter = c.dataset.f;
    $$('#fChips .chip', ctx.el).forEach((x) => x.classList.toggle('active', x === c));
    renderTable();
  }));
  $('#bAllFound', ctx.el)?.addEventListener('click', async () => {
    const list = inv.items.filter((i) => i.found == null);
    if (!list.length) return toast('Không còn thiết bị chưa kiểm', 'warn');
    if (!(await confirmDialog(`Đánh dấu ${list.length} thiết bị chưa kiểm là "Có mặt"?`))) return;
    for (const i of list) {
      try {
        const r = await api.post(`/inventories/${inv.id}/check`, { item_id: i.id, found: 1 });
        inv.items[inv.items.findIndex((x) => x.id === r.id)] = r;
      } catch (e) { toastError(e); break; }
    }
    renderStats();
    renderTable();
  });
  $('#bPrint', ctx.el).addEventListener('click', () => printInventory(inv));
  $('#bExcel', ctx.el).addEventListener('click', () => api.download(`/inventories/${inv.id}/export`).catch(toastError));
  $('#bEdit', ctx.el)?.addEventListener('click', () => formModal({
    title: 'Thông tin đợt kiểm kê',
    fields: [
      { name: 'name', label: 'Tên đợt kiểm kê', required: true },
      { name: 'inventory_date', label: 'Thời điểm kiểm kê', type: 'date', col: 6 },
      { name: 'committee', label: 'Thành phần Ban kiểm kê', type: 'textarea', rows: 4 },
      { name: 'conclusion', label: 'Kết luận, kiến nghị', type: 'textarea', rows: 4 },
      { name: 'note', label: 'Ghi chú', type: 'textarea', rows: 2 },
    ],
    values: inv,
    onSubmit: async (d) => { await api.put(`/inventories/${inv.id}`, d); toast('Đã lưu'); detail(ctx); },
  }));
  $('#bDone', ctx.el)?.addEventListener('click', () => {
    const unchecked = inv.items.filter((i) => i.found == null).length;
    const m = modal({
      title: 'Hoàn thành kiểm kê',
      body: `${unchecked ? `<div class="alert alert-warn">Còn <b>${unchecked}</b> thiết bị chưa kiểm đếm. Các thiết bị này sẽ giữ nguyên, không ghi nhận kết quả.</div>` : ''}
        <label class="field"><span>Kết luận, kiến nghị của Ban kiểm kê</span><textarea id="concl" rows="4">${esc(inv.conclusion || '')}</textarea></label>
        <label class="check" style="margin-top:10px"><input type="checkbox" id="apply" checked> Cập nhật tình trạng, vị trí thực tế vào hồ sơ thiết bị</label>
        <label class="check" style="margin-top:6px"><input type="checkbox" id="lost"> Chuyển các thiết bị "Không thấy" sang trạng thái <b>Mất / Thất lạc</b></label>`,
      footer: '<button class="btn" data-close>Hủy</button><button class="btn btn-success" id="ok">Hoàn thành</button>',
    });
    $('#ok', m.el).addEventListener('click', async () => {
      try {
        await api.post(`/inventories/${inv.id}/complete`, { conclusion: $('#concl', m.el).value, apply_results: $('#apply', m.el).checked, mark_missing_lost: $('#lost', m.el).checked, force: true });
        m.close();
        toast('Đã hoàn thành đợt kiểm kê');
        detail(ctx);
      } catch (e) { toastError(e); }
    });
  });
  $('#bDel', ctx.el)?.addEventListener('click', async () => {
    if (!(await confirmDialog(`Xóa đợt kiểm kê ${esc(inv.code)} và toàn bộ kết quả kiểm đếm?`, { danger: true, okText: 'Xóa' }))) return;
    try { await api.del(`/inventories/${inv.id}`); toast('Đã xóa'); navigate('/inventories'); } catch (e) { toastError(e); }
  });
}
