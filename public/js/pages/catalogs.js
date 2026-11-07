import { api } from '../api.js';
import { state, loadCatalogs } from '../app.js';
import { can } from '../constants.js';
import { $, $$, esc, toast, toastError, formModal, confirmDialog, options } from '../ui.js';

const CONFIG = {
  departments: {
    title: 'Phòng ban / Bộ phận',
    columns: [['code', 'Mã'], ['name', 'Tên phòng ban'], ['parent_name', 'Trực thuộc'], ['manager_name', 'Trưởng phòng'], ['phone', 'Điện thoại'], ['location', 'Địa điểm'], ['device_count', 'Số thiết bị', 'center'], ['user_count', 'Số tài khoản', 'center']],
    fields: (rows, v) => [
      { name: 'code', label: 'Mã', col: 4 }, { name: 'name', label: 'Tên phòng ban', required: true, col: 8 },
      { name: 'parent_id', label: 'Trực thuộc', type: 'select', options: options(rows.filter((r) => r.id !== v?.id), { selected: v?.parent_id, empty: '— Không —' }), col: 6 },
      { name: 'manager_name', label: 'Trưởng phòng / Phụ trách', col: 6 },
      { name: 'phone', label: 'Điện thoại', col: 4 }, { name: 'location', label: 'Địa điểm làm việc', col: 5 }, { name: 'sort_order', label: 'Thứ tự', type: 'number', col: 3 },
      { name: 'note', label: 'Ghi chú', type: 'textarea', rows: 2 },
    ],
  },
  categories: {
    title: 'Loại thiết bị',
    columns: [['code', 'Mã'], ['name', 'Tên loại'], ['prefix', 'Tiền tố mã TS'], ['depreciation_years', 'Thời gian SD (năm)', 'center'], ['maintenance_months', 'Chu kỳ bảo trì (tháng)', 'center'], ['device_count', 'Số thiết bị', 'center']],
    fields: () => [
      { name: 'code', label: 'Mã', col: 4 }, { name: 'name', label: 'Tên loại thiết bị', required: true, col: 8 },
      { name: 'prefix', label: 'Tiền tố mã tài sản', col: 4, help: 'VD: PC → PC.00001' },
      { name: 'depreciation_years', label: 'Thời gian sử dụng tính hao mòn (năm)', type: 'number', col: 4, step: '0.5' },
      { name: 'maintenance_months', label: 'Chu kỳ bảo trì đề xuất (tháng)', type: 'number', col: 4 },
      { name: 'description', label: 'Mô tả', type: 'textarea', rows: 2 },
    ],
  },
  suppliers: {
    title: 'Nhà cung cấp',
    columns: [['name', 'Tên nhà cung cấp'], ['tax_code', 'Mã số thuế'], ['contact_person', 'Người liên hệ'], ['phone', 'Điện thoại'], ['email', 'Email'], ['address', 'Địa chỉ'], ['device_count', 'Số thiết bị', 'center']],
    fields: () => [
      { name: 'name', label: 'Tên nhà cung cấp', required: true, col: 8 }, { name: 'tax_code', label: 'Mã số thuế', col: 4 },
      { name: 'contact_person', label: 'Người liên hệ', col: 4 }, { name: 'phone', label: 'Điện thoại', col: 4 }, { name: 'email', label: 'Email', type: 'email', col: 4 },
      { name: 'address', label: 'Địa chỉ', col: 8 }, { name: 'website', label: 'Website', col: 4 },
      { name: 'note', label: 'Ghi chú (đầu mối bảo hành...)', type: 'textarea', rows: 2 },
    ],
  },
  'funding-sources': {
    title: 'Nguồn vốn',
    columns: [['code', 'Mã'], ['name', 'Tên nguồn vốn'], ['note', 'Ghi chú'], ['device_count', 'Số thiết bị', 'center']],
    fields: () => [{ name: 'code', label: 'Mã', col: 4 }, { name: 'name', label: 'Tên nguồn vốn', required: true, col: 8 }, { name: 'note', label: 'Ghi chú', type: 'textarea', rows: 2 }],
  },
};

export default async function catalogs(ctx) {
  const type = ctx.params.type;
  const cfg = CONFIG[type];
  if (!cfg) throw new Error('Danh mục không tồn tại');
  ctx.setTitle(`Danh mục: ${cfg.title}`);
  const w = can(state.user, 'catalog.write');
  let rows = await api.get(`/catalogs/${type}`);
  let search = '';
  ctx.el.innerHTML = `
    <div class="page-head"><h2>${esc(cfg.title)}</h2>${w ? '<button class="btn btn-primary" id="btnNew">＋ Thêm mới</button>' : ''}</div>
    <div class="card"><div class="card-body" style="padding-bottom:0"><div class="toolbar"><input class="search" type="search" id="fQ" placeholder="🔍 Tìm kiếm..."></div></div><div id="tbl"></div></div>`;
  const render = () => {
    const list = rows.filter((r) => !search || JSON.stringify(Object.values(r)).toLowerCase().includes(search));
    $('#tbl', ctx.el).innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr>${cfg.columns.map(([, l, c]) => `<th class="${c || ''}">${esc(l)}</th>`).join('')}${w ? '<th></th>' : ''}</tr></thead>
      <tbody>${list.map((r) => `<tr>${cfg.columns.map(([k, , c]) => {
    let v = esc(r[k] ?? '');
    if (k === 'device_count' && r[k] && type !== 'suppliers') {
      const param = { departments: 'department_id', categories: 'category_id', 'funding-sources': 'funding_source_id' }[type];
      v = `<a href="#/devices?${param}=${r.id}">${r[k]}</a>`;
    }
    return `<td class="${c || ''}">${k === 'name' ? `<b>${v}</b>` : v}</td>`;
  }).join('')}
        ${w ? `<td class="nowrap"><button class="link-btn" data-edit="${r.id}">Sửa</button> · <button class="link-btn danger" data-del="${r.id}">Xóa</button></td>` : ''}</tr>`).join('')}</tbody>
      </table>${list.length ? '' : '<div class="empty">Chưa có dữ liệu</div>'}</div>`;
    $$('[data-edit]', ctx.el).forEach((b) => b.addEventListener('click', () => edit(rows.find((r) => r.id === Number(b.dataset.edit)))));
    $$('[data-del]', ctx.el).forEach((b) => b.addEventListener('click', async () => {
      const r = rows.find((x) => x.id === Number(b.dataset.del));
      if (!(await confirmDialog(`Xóa <b>${esc(r.name)}</b>?`, { danger: true, okText: 'Xóa' }))) return;
      try { await api.del(`/catalogs/${type}/${r.id}`); toast('Đã xóa'); await reload(); } catch (e) { toastError(e); }
    }));
  };
  const reload = async () => { rows = await api.get(`/catalogs/${type}`); await loadCatalogs(); render(); };
  const edit = (v) => formModal({
    title: v ? `Sửa: ${v.name}` : `Thêm ${cfg.title.toLowerCase()}`,
    fields: cfg.fields(rows, v),
    values: v || {},
    onSubmit: async (d) => {
      if (v) await api.put(`/catalogs/${type}/${v.id}`, d); else await api.post(`/catalogs/${type}`, d);
      toast('Đã lưu');
      await reload();
    },
  });
  $('#btnNew', ctx.el)?.addEventListener('click', () => edit(null));
  $('#fQ', ctx.el).addEventListener('input', (e) => { search = e.target.value.toLowerCase(); render(); });
  render();
}
