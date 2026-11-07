import { api } from './api.js';
import { DEVICE_STATUS, labelOf } from './constants.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const fmtMoney = (n) => (n === null || n === undefined || n === '' ? '' : Math.round(Number(n)).toLocaleString('vi-VN'));
export const fmtNum = (n) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 }));
export const fmtDate = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');
export const fmtDateTime = (s) => (s ? `${fmtDate(s)} ${String(s).slice(11, 16)}` : '');
export const todayStr = () => new Date().toLocaleDateString('sv-SE');
export const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

export function badge(map, key) {
  if (!key) return '';
  const v = map[key];
  const label = labelOf(map, key);
  const color = v && typeof v === 'object' ? v.color : 'gray';
  return `<span class="badge badge-${color}">${esc(label)}</span>`;
}

export const statusBadge = (s) => badge(DEVICE_STATUS, s);

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function toast(msg, type = 'success', ms = 3500) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function toastError(e) {
  toast(e?.message || String(e), 'error', 5000);
}

/** Hộp thoại chung */
export function modal({ title, body = '', footer, size = '', onClose, dismissible = true }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true">
      <div class="modal-header"><h3>${esc(title)}</h3><button class="close-x" data-close aria-label="Đóng">&times;</button></div>
      <div class="modal-body">${body}</div>
      ${footer === false ? '' : `<div class="modal-footer">${footer ?? '<button class="btn" data-close>Đóng</button>'}</div>`}
    </div>`;
  const close = () => {
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape' && dismissible) close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });
  $('#modals').appendChild(wrap);
  const first = wrap.querySelector('.modal-body input:not([type=hidden]):not([readonly]), .modal-body select, .modal-body textarea');
  first?.focus();
  return { el: wrap, body: wrap.querySelector('.modal-body'), close };
}

export function confirmDialog(message, { title = 'Xác nhận', okText = 'Đồng ý', danger = false } = {}) {
  return new Promise((resolve) => {
    let ok = false;
    const m = modal({
      title,
      size: 'sm',
      body: `<p style="margin:0;line-height:1.6">${message}</p>`,
      footer: `<button class="btn" data-close>Hủy</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okText)}</button>`,
      onClose: () => resolve(ok),
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { ok = true; m.close(); });
    m.el.querySelector('[data-ok]').focus();
  });
}

export function options(list, { value = 'id', label = 'name', selected, empty } = {}) {
  let html = empty !== undefined ? `<option value="">${esc(empty)}</option>` : '';
  for (const it of list) {
    const v = typeof it === 'object' ? it[value] : it;
    const l = typeof it === 'object' ? (typeof label === 'function' ? label(it) : it[label]) : it;
    html += `<option value="${esc(v)}"${String(v) === String(selected ?? '') ? ' selected' : ''}>${esc(l)}</option>`;
  }
  return html;
}

export function mapOptions(map, selected, empty) {
  return options(Object.entries(map).map(([k, v]) => ({ id: k, name: typeof v === 'string' ? v : v.label })), { selected, empty });
}

/* ---------- Biểu mẫu ---------- */

function moneyFormat(input) {
  const digits = input.value.replace(/\D/g, '');
  input.value = digits ? Number(digits).toLocaleString('vi-VN') : '';
}

export function renderField(f, value) {
  const v = value ?? f.default ?? '';
  const id = `f_${f.name}_${Math.random().toString(36).slice(2, 7)}`;
  const req = f.required ? ' required' : '';
  const attrs = `id="${id}" name="${f.name}"${req}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}${f.readonly ? ' readonly' : ''}${f.disabled ? ' disabled' : ''}`;
  let input;
  switch (f.type) {
    case 'section':
      return `<div class="form-section">${esc(f.label)}</div>`;
    case 'select':
      {
        let opts = typeof f.options === 'string' ? f.options : options(f.options || [], { selected: v, empty: f.empty ?? '-- Chọn --', label: f.optionLabel || 'name' });
        if (typeof f.options === 'string' && v !== '' && v != null) {
          opts = opts.replace(/ selected/g, '').replace(`value="${esc(v)}"`, `value="${esc(v)}" selected`);
        }
        input = `<select ${attrs}>${opts}</select>`;
      }
      break;
    case 'textarea':
      input = `<textarea ${attrs} rows="${f.rows || 3}">${esc(v)}</textarea>`;
      break;
    case 'checkbox':
      return `<div class="${'c' + (f.col || 12)}"><label class="check"><input type="checkbox" ${attrs} ${v && v !== '0' ? 'checked' : ''}> ${esc(f.label)}</label>${f.help ? `<small class="help">${esc(f.help)}</small>` : ''}</div>`;
    case 'money':
      input = `<input type="text" inputmode="numeric" data-money ${attrs} value="${v === '' || v == null ? '' : fmtMoney(v)}">`;
      break;
    case 'html':
      return `<div class="c${f.col || 12}">${f.html}</div>`;
    default:
      input = `<input type="${f.type || 'text'}" ${attrs} value="${esc(v)}"${f.min != null ? ` min="${f.min}"` : ''}${f.step ? ` step="${f.step}"` : ''}${f.list ? ` list="${f.list}"` : ''}>`;
  }
  return `<label class="field c${f.col || 12}" for="${id}"><span>${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</span>${input}${f.help ? `<small class="help">${esc(f.help)}</small>` : ''}</label>`;
}

export function renderForm(fields, values = {}) {
  return `<form class="form-grid" novalidate>${fields.map((f) => renderField(f, values[f.name])).join('')}<button type="submit" hidden></button></form>`;
}

export function bindForm(root) {
  $$('[data-money]', root).forEach((i) => i.addEventListener('input', () => moneyFormat(i)));
}

export function collectForm(form, fields) {
  const out = {};
  for (const f of fields) {
    if (!f.name || ['section', 'html'].includes(f.type)) continue;
    const el = form.elements[f.name];
    if (!el) continue;
    if (f.type === 'checkbox') out[f.name] = el.checked ? 1 : 0;
    else if (f.type === 'money') out[f.name] = el.value ? Number(el.value.replace(/\D/g, '')) : null;
    else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
    else out[f.name] = el.value.trim() === '' ? null : el.value.trim();
  }
  for (const f of fields) {
    if (f.required && (out[f.name] === null || out[f.name] === '')) throw new Error(`Vui lòng nhập: ${f.label}`);
  }
  return out;
}

/** Hộp thoại biểu mẫu: onSubmit trả về Promise; lỗi sẽ hiển thị và giữ hộp thoại */
export function formModal({ title, fields, values = {}, onSubmit, size = 'lg', submitText = 'Lưu', extraFooter = '' }) {
  const m = modal({
    title,
    size,
    body: renderForm(fields, values),
    footer: `${extraFooter}<button class="btn" data-close>Hủy</button><button class="btn btn-primary" data-submit>${esc(submitText)}</button>`,
  });
  const form = m.el.querySelector('form');
  bindForm(form);
  const submit = async () => {
    const btn = m.el.querySelector('[data-submit]');
    try {
      const data = collectForm(form, fields);
      btn.disabled = true;
      await onSubmit(data, m);
      m.close();
    } catch (e) {
      toastError(e);
    } finally {
      btn.disabled = false;
    }
  };
  m.el.querySelector('[data-submit]').addEventListener('click', submit);
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  return m;
}

/* ---------- Phân trang ---------- */
export function pager(total, page, pageSize) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  const btns = [];
  const add = (p, label = p, active = false, disabled = false) =>
    btns.push(`<button class="btn btn-sm ${active ? 'btn-primary' : ''}" data-page="${p}" ${disabled ? 'disabled' : ''}>${label}</button>`);
  add(page - 1, '‹', false, page <= 1);
  const set = new Set([1, pages, page - 1, page, page + 1, page - 2, page + 2].filter((p) => p >= 1 && p <= pages));
  let prev = 0;
  [...set].sort((a, b) => a - b).forEach((p) => {
    if (p - prev > 1) btns.push('<span class="text-muted">…</span>');
    add(p, p, p === page);
    prev = p;
  });
  add(page + 1, '›', false, page >= pages);
  return `<div class="pager"><div class="info">Hiển thị ${from}-${to} / ${total.toLocaleString('vi-VN')} bản ghi</div>
    <select data-pagesize>${[10, 20, 50, 100, 200].map((n) => `<option ${n === pageSize ? 'selected' : ''} value="${n}">${n} / trang</option>`).join('')}</select>
    ${btns.join('')}</div>`;
}

export function bindPager(root, onChange) {
  $$('[data-page]', root).forEach((b) => b.addEventListener('click', () => onChange({ page: Number(b.dataset.page) })));
  $('[data-pagesize]', root)?.addEventListener('change', (e) => onChange({ page: 1, pageSize: Number(e.target.value) }));
}

/* ---------- Ô chọn thiết bị (tìm kiếm) ---------- */
export function devicePicker(container, { onPick, params = {}, placeholder = 'Gõ mã tài sản, tên, serial để tìm thiết bị...' }) {
  container.innerHTML = `<div class="picker"><input type="text" placeholder="${esc(placeholder)}" autocomplete="off"><div class="picker-results"></div></div>`;
  const input = $('input', container);
  const box = $('.picker-results', container);
  let items = [];
  let hl = -1;
  const render = () => {
    box.innerHTML = items.length
      ? items.map((d, i) => `<div class="opt ${i === hl ? 'hl' : ''}" data-i="${i}"><b>${esc(d.asset_code)}</b> - ${esc(d.name)} ${statusBadge(d.status)}<br>
          <small>${esc([d.serial_number && 'SN: ' + d.serial_number, d.department_name || 'Kho', d.assigned_to].filter(Boolean).join(' · '))}</small></div>`).join('')
      : '<div class="opt text-muted">Không tìm thấy thiết bị phù hợp</div>';
    box.classList.add('open');
  };
  const search = debounce(async () => {
    try {
      items = await api.get('/devices/lookup', { q: input.value, ...(typeof params === 'function' ? params() : params) });
      hl = items.length ? 0 : -1;
      render();
    } catch (e) { toastError(e); }
  }, 250);
  const pick = (i) => {
    if (!items[i]) return;
    onPick(items[i]);
    input.value = '';
    box.classList.remove('open');
    input.focus();
  };
  input.addEventListener('input', search);
  input.addEventListener('focus', search);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { hl = Math.min(items.length - 1, hl + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { hl = Math.max(0, hl - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(hl); }
    else if (e.key === 'Escape') box.classList.remove('open');
  });
  box.addEventListener('mousedown', (e) => {
    const o = e.target.closest('[data-i]');
    if (o) { e.preventDefault(); pick(Number(o.dataset.i)); }
  });
  input.addEventListener('blur', () => setTimeout(() => box.classList.remove('open'), 150));
  return { focus: () => input.focus() };
}

/** Đọc số tiền thành chữ (tiếng Việt) */
export function moneyToWords(n) {
  n = Math.round(Number(n) || 0);
  if (n === 0) return 'Không đồng';
  const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const units = ['', ' nghìn', ' triệu', ' tỷ', ' nghìn tỷ', ' triệu tỷ'];
  const read3 = (num, full) => {
    const h = Math.floor(num / 100), t = Math.floor((num % 100) / 10), u = num % 10;
    let s = '';
    if (full || h) s += digits[h] + ' trăm';
    if (t > 1) s += ' ' + digits[t] + ' mươi';
    else if (t === 1) s += ' mười';
    else if ((full || h) && u) s += ' linh';
    if (u === 1 && t > 1) s += ' mốt';
    else if (u === 5 && t >= 1) s += ' lăm';
    else if (u === 4 && t > 1) s += ' tư';
    else if (u) s += ' ' + digits[u];
    return s.trim();
  };
  const groups = [];
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  let out = '';
  for (let i = groups.length - 1; i >= 0; i--) {
    if (!groups[i]) continue;
    out += ' ' + read3(groups[i], i < groups.length - 1) + units[i];
  }
  out = out.trim();
  return out.charAt(0).toUpperCase() + out.slice(1) + ' đồng';
}
