// Authenticated REST calls from the admin panel (the session token is kept in localStorage).

const token = () => {
  try {
    return localStorage.getItem('qflow_token') || '';
  } catch {
    return '';
  }
};

export const authFetch = (path: string, init: RequestInit = {}) => fetch(path, {
  ...init,
  headers: { ...(init.headers || {}), Authorization: `Bearer ${token()}` },
});

export const authJson = async <T = any>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T }> => {
  const res = await authFetch(path, {
    ...init,
    headers: { ...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};

// Downloads a protected file (backup, CSV export) through the browser.
export const downloadFile = async (path: string, filename: string) => {
  const res = await authFetch(path);
  if (!res.ok) throw new Error(`download_failed_${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
