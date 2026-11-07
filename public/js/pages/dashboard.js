import { api } from '../api.js';
import { state } from '../app.js';
import { can, REPAIR_PRIORITY } from '../constants.js';
import { esc, fmtMoney, fmtDate, fmtDateTime, badge } from '../ui.js';

const COLORS = ['#1d4f91', '#16803c', '#e08a00', '#c0262d', '#7036b8', '#0e9aa7', '#6b7280', '#d9468f', '#5b8c00', '#8a5a00', '#3b82f6', '#14b8a6'];
const STATUS_COLORS = { in_use: '#16803c', in_stock: '#1d5fc4', repairing: '#e08a00', broken: '#c0262d', pending_disposal: '#7036b8', lost: '#374151' };

const charts = [];
function chart(canvas, cfg) {
  if (!window.Chart || !canvas) return;
  charts.push(new window.Chart(canvas, cfg));
}

const short = (n) => {
  if (n >= 1e9) return (n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
  if (n >= 1e6) return (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tr';
  return fmtMoney(n);
};

export default async function dashboard(ctx) {
  ctx.setTitle('Bảng điều khiển');
  charts.splice(0).forEach((c) => c.destroy());
  const d = await api.get('/dashboard');
  if (!ctx.isCurrent()) return;
  const t = d.totals;
  const a = d.alerts;
  const u = state.user;
  const stat = (ico, bg, val, lbl, sub, href) => `
    <a class="card stat" ${href ? `href="${href}"` : ''} style="color:inherit;text-decoration:none">
      <div class="ico" style="background:${bg}">${ico}</div>
      <div><div class="val">${val}</div><div class="lbl">${lbl}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
    </a>`;

  ctx.el.innerHTML = `
    <div class="page-head"><div><h2>Xin chào, ${esc(u.full_name)}</h2><div class="sub">${esc(state.settings.org_name || '')} · Hôm nay ${new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</div></div>
      ${can(u, 'device.write') ? '<a class="btn btn-primary" href="#/devices/new">＋ Thêm thiết bị</a>' : ''}
      <button class="btn" id="reportBroken">🛠️ Báo hỏng thiết bị</button>
    </div>
    <div class="stats">
      ${stat('🖥️', '#eaf1fb', t.devices.toLocaleString('vi-VN'), 'Tổng số thiết bị', `${t.in_use} đang dùng · ${t.in_stock} trong kho`, '#/devices')}
      ${can(u, 'view.all') ? stat('💰', '#e3f6ea', short(t.value), 'Tổng nguyên giá (đ)', `Giá trị còn lại: ${short(t.remaining)}`, can(u, 'report.view') ? '#/reports/asset-register' : '') : ''}
      ${stat('🛠️', '#fdf0dc', t.broken, 'Đang hỏng / sửa chữa', `${t.repairs_year} yêu cầu sửa chữa năm nay`, '#/repairs')}
      ${stat('🛡️', '#e5efff', t.in_warranty, 'Còn bảo hành', `${a.warranty_expiring.length} thiết bị sắp hết hạn`, '#/devices?warranty=expiring')}
      ${can(u, 'view.all') ? stat('⏳', '#fde6e7', t.old_devices, 'Sử dụng ≥ 5 năm', `${t.fully_depreciated} TS đã hết hao mòn`, can(u, 'report.view') ? '#/reports/aging?min_years=5' : '') : ''}
      ${can(u, 'view.all') ? stat('🧾', '#f0e8fb', short(t.repair_cost_year), 'Chi phí sửa chữa năm nay', '', can(u, 'report.view') ? '#/reports/repairs' : '') : ''}
    </div>
    <div class="grid-2 mb">
      <div class="card"><div class="card-header"><h3>Thiết bị theo trạng thái</h3></div><div class="card-body"><div class="chart-box"><canvas id="cStatus"></canvas></div></div></div>
      <div class="card"><div class="card-header"><h3>Thiết bị theo loại</h3></div><div class="card-body"><div class="chart-box"><canvas id="cCat"></canvas></div></div></div>
    </div>
    <div class="grid-2 mb">
      <div class="card"><div class="card-header"><h3>Phân bổ theo phòng ban</h3></div><div class="card-body"><div class="chart-box"><canvas id="cDept"></canvas></div></div></div>
      <div class="card"><div class="card-header"><h3>Giá trị đầu tư theo năm (triệu đồng)</h3></div><div class="card-body"><div class="chart-box"><canvas id="cYear"></canvas></div></div></div>
    </div>
    <div class="grid-3">
      <div class="card">
        <div class="card-header"><h3>Việc cần xử lý</h3></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Loại</th><th>Nội dung</th><th>Ngày</th></tr></thead>
          <tbody>
            ${a.repairs_open.map((r) => `<tr><td>${badge(REPAIR_PRIORITY, r.priority)}</td><td><a href="#/repairs/${r.id}">${esc(r.code)}</a> · ${esc(r.asset_code)} ${esc(r.device_name)}</td><td class="nowrap">${fmtDate(r.report_date)}</td></tr>`).join('')}
            ${a.maintenance_overdue.map((m) => `<tr><td><span class="badge badge-red">Bảo trì quá hạn</span></td><td><a href="#/maintenance?status=overdue">${esc(m.title)}</a> · ${esc(m.asset_code || '')}</td><td class="nowrap text-red">${fmtDate(m.scheduled_date)}</td></tr>`).join('')}
            ${a.maintenance_upcoming.map((m) => `<tr><td><span class="badge badge-blue">Bảo trì sắp tới</span></td><td><a href="#/maintenance?status=upcoming">${esc(m.title)}</a> · ${esc(m.asset_code || '')}</td><td class="nowrap">${fmtDate(m.scheduled_date)}</td></tr>`).join('')}
            ${a.warranty_expiring.map((w) => `<tr><td><span class="badge badge-orange">Sắp hết BH</span></td><td><a href="#/devices/${w.id}">${esc(w.asset_code)}</a> ${esc(w.name)}</td><td class="nowrap">${fmtDate(w.warranty_end)}</td></tr>`).join('')}
            ${a.licenses_expiring.map((l) => `<tr><td><span class="badge badge-purple">Bản quyền</span></td><td><a href="#/licenses/${l.id}">${esc(l.name)}</a> ${l.expiry_date < new Date().toISOString().slice(0, 10) ? '<span class="text-red">(đã hết hạn)</span>' : ''}</td><td class="nowrap">${fmtDate(l.expiry_date)}</td></tr>`).join('')}
          </tbody>
        </table>
        ${!a.repairs_open.length && !a.maintenance_overdue.length && !a.maintenance_upcoming.length && !a.warranty_expiring.length && !a.licenses_expiring.length ? '<div class="empty">Không có việc tồn đọng 🎉</div>' : ''}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Hoạt động gần đây</h3></div>
        <div class="card-body">
          <ul class="timeline">${d.recent.map((h) => `<li><div><b>${esc(h.action)}</b> · <a href="#/devices/${h.device_id}">${esc(h.asset_code)}</a></div>
            <div class="text-muted" style="font-size:13px">${esc(h.description || '')}</div><div class="t">${fmtDateTime(h.created_at)}${h.user_name ? ' · ' + esc(h.user_name) : ''}</div></li>`).join('') || '<div class="text-muted">Chưa có hoạt động</div>'}</ul>
        </div>
      </div>
    </div>`;

  ctx.el.querySelector('#reportBroken').addEventListener('click', async () => {
    const m = await import('./repairs.js');
    m.openReportForm();
  });

  const legendBottom = { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } }, maintainAspectRatio: false };
  chart(ctx.el.querySelector('#cStatus'), {
    type: 'doughnut',
    data: { labels: d.byStatus.map((s) => `${s.label} (${s.n})`), datasets: [{ data: d.byStatus.map((s) => s.n), backgroundColor: d.byStatus.map((s) => STATUS_COLORS[s.status] || '#999') }] },
    options: { ...legendBottom, cutout: '60%' },
  });
  chart(ctx.el.querySelector('#cCat'), {
    type: 'bar',
    data: { labels: d.byCategory.map((c) => c.label), datasets: [{ label: 'Số lượng', data: d.byCategory.map((c) => c.n), backgroundColor: '#1d4f91', borderRadius: 4 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 } } } },
  });
  chart(ctx.el.querySelector('#cDept'), {
    type: 'pie',
    data: { labels: d.byDepartment.map((c) => `${c.label} (${c.n})`), datasets: [{ data: d.byDepartment.map((c) => c.n), backgroundColor: COLORS }] },
    options: legendBottom,
  });
  chart(ctx.el.querySelector('#cYear'), {
    type: 'bar',
    data: {
      labels: d.byYear.map((y) => y.label),
      datasets: [
        { label: 'Giá trị (triệu đ)', data: d.byYear.map((y) => Math.round(y.value / 1e5) / 10), backgroundColor: '#16803c', borderRadius: 4, yAxisID: 'y' },
        { label: 'Số lượng', data: d.byYear.map((y) => y.n), type: 'line', borderColor: '#e08a00', backgroundColor: '#e08a00', yAxisID: 'y1' },
      ],
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true }, y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { precision: 0 } } } },
  });
}
