const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

const store = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};
export { store };

const headers = () => ({ 'Content-Type': 'application/json' });

async function send(path, opts) {
  try {
    return await fetch(BASE + path, opts);
  } catch {
    throw new Error('Cannot reach the RDS Lead Finder server. Check that the backend is running and VITE_API_URL is correct.');
  }
}

async function fail(res, path) {
  let msg = `Request failed (${res.status}).`;
  try { const j = await res.json(); if (j.detail) msg = typeof j.detail === 'string' ? j.detail : 'Check the form values and try again.'; } catch { /* not json */ }
  if (res.status === 401 && path !== '/api/auth/login') {
    dispatchEvent(new CustomEvent('rds:unauthorized'));
    msg = 'Your session expired. Sign in again.';
  }
  const err = new Error(msg);
  err.status = res.status;
  throw err;
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await send(path, { method, credentials: 'include', headers: headers(), body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) await fail(res, path);
  return res.json();
}

export async function downloadExport({ format, scope, place_ids = [] }) {
  const path = '/api/export';
  const res = await send(path, { method: 'POST', credentials: 'include', headers: headers(), body: JSON.stringify({ format, scope, place_ids }) });
  if (!res.ok) await fail(res, path);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `rds-leads-${scope}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
