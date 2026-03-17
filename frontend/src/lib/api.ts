const API = '/api';

type ApiOpts = RequestInit & { body?: object };

export async function api(path: string, opts: ApiOpts = {}): Promise<{ ok: boolean; status: number; data: any }> {
  const { body, ...init } = opts;
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (body && typeof body === 'object') {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(API + path, {
    ...init,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : init.body,
  });
  const contentType = res.headers.get('Content-Type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  return { ok: res.ok, status: res.status, data: typeof data === 'string' ? { error: data } : data };
}
