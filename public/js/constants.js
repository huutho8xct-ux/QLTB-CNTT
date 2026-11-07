// Hằng số dùng chung cho cả máy chủ (Node.js) và giao diện (trình duyệt)

export const DEVICE_STATUS = {
  in_use: { label: 'Đang sử dụng', color: 'green' },
  in_stock: { label: 'Trong kho', color: 'blue' },
  repairing: { label: 'Đang sửa chữa', color: 'orange' },
  broken: { label: 'Hỏng', color: 'red' },
  pending_disposal: { label: 'Chờ thanh lý', color: 'purple' },
  disposed: { label: 'Đã thanh lý', color: 'gray' },
  lost: { label: 'Mất / Thất lạc', color: 'dark' },
};

export const CONDITIONS = {
  new: 'Mới',
  good: 'Tốt',
  fair: 'Khá',
  average: 'Trung bình',
  poor: 'Kém',
  broken: 'Hỏng',
};

export const ROLES = {
  admin: 'Quản trị hệ thống',
  manager: 'Cán bộ quản lý tài sản',
  technician: 'Kỹ thuật viên CNTT',
  leader: 'Lãnh đạo đơn vị',
  user: 'Viên chức / Nhân viên',
};

export const ALLOCATION_TYPES = {
  allocate: { label: 'Cấp phát', prefix: 'CP', color: 'green' },
  transfer: { label: 'Điều chuyển', prefix: 'DC', color: 'blue' },
  recall: { label: 'Thu hồi', prefix: 'TH', color: 'orange' },
};

export const REPAIR_STATUS = {
  pending: { label: 'Chờ xử lý', color: 'orange' },
  in_progress: { label: 'Đang xử lý', color: 'blue' },
  warranty: { label: 'Gửi bảo hành', color: 'purple' },
  done: { label: 'Hoàn thành', color: 'green' },
  unrepairable: { label: 'Không sửa được', color: 'red' },
  cancelled: { label: 'Đã hủy', color: 'gray' },
};

export const REPAIR_PRIORITY = {
  low: { label: 'Thấp', color: 'gray' },
  normal: { label: 'Bình thường', color: 'blue' },
  high: { label: 'Cao', color: 'orange' },
  urgent: { label: 'Khẩn cấp', color: 'red' },
};

export const REPAIR_TYPE = {
  internal: 'Tự sửa chữa (nội bộ)',
  outsource: 'Thuê đơn vị ngoài',
  warranty: 'Bảo hành của nhà cung cấp',
};

export const MAINT_STATUS = {
  planned: { label: 'Kế hoạch', color: 'blue' },
  done: { label: 'Đã thực hiện', color: 'green' },
  skipped: { label: 'Bỏ qua', color: 'gray' },
};

export const INVENTORY_STATUS = {
  open: { label: 'Đang kiểm kê', color: 'orange' },
  completed: { label: 'Đã hoàn thành', color: 'green' },
};

export const DISPOSAL_STATUS = {
  proposed: { label: 'Đề xuất', color: 'orange' },
  approved: { label: 'Đã phê duyệt', color: 'blue' },
  completed: { label: 'Đã thanh lý', color: 'green' },
  rejected: { label: 'Không phê duyệt', color: 'red' },
};

export const DISPOSAL_METHOD = {
  sell: 'Thanh lý theo hình thức bán',
  demolish: 'Thanh lý theo hình thức phá dỡ, hủy bỏ',
  transfer: 'Điều chuyển cho đơn vị khác',
  destroy: 'Tiêu hủy',
  other: 'Hình thức khác',
};

export const LICENSE_TYPE = {
  perpetual: 'Vĩnh viễn',
  subscription: 'Thuê bao (có thời hạn)',
  oem: 'OEM (theo máy)',
  volume: 'Bản quyền số lượng lớn',
  open_source: 'Mã nguồn mở / Miễn phí',
};

export const DEPRECIATION_METHOD = {
  month: 'Tính theo số tháng sử dụng',
  year: 'Tính tròn năm (năm đưa vào sử dụng tính đủ năm)',
};

// Ma trận phân quyền
export const PERMS = {
  'view.all': ['admin', 'manager', 'technician', 'leader'],
  'device.write': ['admin', 'manager'],
  'device.delete': ['admin', 'manager'],
  'allocation.write': ['admin', 'manager'],
  'repair.create': ['admin', 'manager', 'technician', 'leader', 'user'],
  'repair.manage': ['admin', 'manager', 'technician'],
  'maintenance.write': ['admin', 'manager', 'technician'],
  'inventory.write': ['admin', 'manager'],
  'inventory.check': ['admin', 'manager', 'technician'],
  'disposal.write': ['admin', 'manager'],
  'disposal.approve': ['admin', 'leader'],
  'license.write': ['admin', 'manager', 'technician'],
  'catalog.write': ['admin', 'manager'],
  'report.view': ['admin', 'manager', 'technician', 'leader'],
  'user.manage': ['admin'],
  'settings.write': ['admin'],
  'audit.view': ['admin'],
  'backup': ['admin'],
};

export function can(user, perm) {
  return !!user && (PERMS[perm] || []).includes(user.role);
}

export function labelOf(map, key) {
  if (key == null || key === '') return '';
  const v = map[key];
  if (v == null) return key;
  return typeof v === 'string' ? v : v.label;
}

/**
 * Tính hao mòn tài sản.
 * - method 'month': hao mòn lũy kế = nguyên giá / (số năm * 12) * số tháng đã sử dụng
 * - method 'year' : hao mòn lũy kế = nguyên giá / số năm * số năm (tính cả năm đưa vào sử dụng)
 * asOf: chuỗi 'YYYY-MM-DD' hoặc Date
 */
export function calcDepreciation(dev, asOf, method = 'month') {
  const price = Number(dev.original_price) || 0;
  const years = Number(dev.depreciation_years) || 0;
  const start = dev.in_use_date || dev.purchase_date;
  const base = { rate: years ? 100 / years : 0, annual: years ? price / years : 0, accumulated: 0, remaining: price, months: 0 };
  if (!price || !years || !start) return base;
  const s = new Date(start + 'T00:00:00');
  const a = asOf instanceof Date ? asOf : new Date((asOf || new Date().toISOString().slice(0, 10)) + 'T00:00:00');
  if (isNaN(s) || isNaN(a) || a < s) return base;
  const annual = price / years;
  let accumulated;
  const months = (a.getFullYear() - s.getFullYear()) * 12 + (a.getMonth() - s.getMonth()) + 1;
  if (method === 'year') {
    const n = a.getFullYear() - s.getFullYear() + 1;
    accumulated = annual * Math.min(n, years);
  } else {
    accumulated = (annual / 12) * Math.min(months, years * 12);
  }
  accumulated = Math.min(price, Math.round(accumulated));
  return { rate: 100 / years, annual: Math.round(annual), accumulated, remaining: price - accumulated, months };
}
