const TOKEN_KEY = 'qltb_token';

export const auth = {
  get token() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set token(v) {
    try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  },
};

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export function qs(params = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function request(method, url, body, opts = {}) {
  const headers = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  let payload;
  if (body instanceof Blob || body instanceof ArrayBuffer) {
    headers['Content-Type'] = 'application/octet-stream';
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`api${url}`, { method, headers, body: payload });
  } catch {
    throw new Error('Không kết nối được máy chủ. Vui lòng kiểm tra mạng.');
  }
  if (res.status === 401 && !opts.noRedirect) {
    onUnauthorized();
  }
  if (opts.raw) {
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `Lỗi ${res.status}`);
    }
    return res;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}

export const api = {
  get: (url, params) => request('GET', url + qs(params)),
  post: (url, body, opts) => request('POST', url, body ?? {}, opts),
  put: (url, body) => request('PUT', url, body ?? {}),
  del: (url) => request('DELETE', url),
  upload: (url, file) => request('POST', url, file),
  /** Tải tệp (Excel, sao lưu...) có kèm xác thực */
  async download(url, params, fallbackName = 'tai-ve') {
    const res = await request('GET', url + qs(params), undefined, { raw: true });
    const cd = res.headers.get('Content-Disposition') || '';
    let name = fallbackName;
    const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
    if (m) name = decodeURIComponent(m[1]);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  },
};
