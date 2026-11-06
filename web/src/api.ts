let token: string | null = null;
export const setToken = (t: string | null) => { token = t; };

export class ApiError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

const raw = (path: string, method: string, body?: unknown) =>
  fetch('/api' + path, {
    method, credentials: 'include', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });

/** Uses the refresh cookie to get a new access token. Returns the user, or null if not logged in. */
export async function refresh() {
  const r = await raw('/auth/refresh', 'POST');
  if (!r.ok) { setToken(null); return null; }
  const d = await r.json();
  setToken(d.accessToken);
  return d.user;
}

export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res = await raw(path, method, body);
  if (res.status === 401 && !path.startsWith('/auth/') && (await refresh())) res = await raw(path, method, body);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error?.code ?? 'ERROR', data?.error?.message ?? 'Request failed');
  return data;
}
