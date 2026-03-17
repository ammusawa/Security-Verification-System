/**
 * Shared helpers for admin pages: API client, types, formatters.
 */

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface Overview {
  total_users: number;
  total_apps: number;
  total_active_keys: number;
  logins_24h: number;
  logins_7d: number;
  users_with_face: number;
  new_users_24h: number;
  new_users_7d: number;
}

export interface UserRow {
  id: number;
  username: string;
  email: string;
  role: string;
  app_id: number | null;
  app_name: string;
  has_face: boolean;
  has_totp: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface AppRow {
  id: number;
  name: string;
  owner_email: string;
  is_active: boolean;
  created_at: string;
  user_count: number;
  key_count: number;
}

export interface AppDetail {
  id: number;
  name: string;
  owner_email: string;
  is_active: boolean;
  created_at: string;
  user_count: number;
  keys: KeyRow[];
}

export interface KeyRow {
  id?: number;
  prefix: string;
  label: string | null;
  is_active: boolean;
  created_at: string | null;
  revoked_at: string | null;
}

export interface ActivityRow {
  id: number;
  username: string;
  email: string;
  step: string;
  ip_address: string;
  user_agent: string;
  verification_level: number;
  created_at: string | null;
  completed: boolean;
}

export interface DemoRequestRow {
  id: number;
  name: string;
  email: string;
  company: string | null;
  message: string | null;
  status: string;
  created_at: string | null;
  sent_at: string | null;
  viewed_at: string | null;
}

export interface DemoRequestDetail extends DemoRequestRow {
  demo_token: string;
  demo_subject: string | null;
  demo_content: string | null;
}

export interface SubscriptionRequestRow {
  id: number;
  name: string;
  email: string;
  company: string | null;
  message: string | null;
  plan_type: string;
  amount: number | null;
  currency: string | null;
  payment_reference: string | null;
  receipt_filename: string | null;
  payment_status: string;
  status: string;
  created_at: string | null;
  reviewed_at: string | null;
  app_id: number | null;
}

export interface SubscriptionRequestDetail extends SubscriptionRequestRow {
  app: { id: number; name: string; owner_email: string } | null;
  app_admin: { id: number; username: string; email: string } | null;
}

export interface UserDetail {
  user: UserRow & { has_totp: boolean };
  recent_logins: {
    id: number;
    step: string;
    ip_address: string;
    user_agent: string;
    verification_level: number;
    created_at: string | null;
  }[];
  trusted_contexts: {
    id: number;
    ip_address: string;
    user_agent: string;
    geo: { city?: string; country?: string } | null;
    created_at: string | null;
  }[];
}

/* -------------------------------------------------------------------------- */
/*  Admin API client                                                          */
/* -------------------------------------------------------------------------- */

const ADMIN_SECRET_KEY = 'svs_admin_secret';

export function getSecret(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(ADMIN_SECRET_KEY) || '';
  }
  return '';
}

export function setSecret(value: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(ADMIN_SECRET_KEY, value);
  }
}

export function clearSecret(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(ADMIN_SECRET_KEY);
  }
}

export async function adminApi(
  path: string,
  opts: { method?: string; body?: object } = {},
): Promise<{ ok: boolean; status: number; data: any }> {
  const { method = 'GET', body } = opts;
  const headers: Record<string, string> = {
    'X-Admin-Secret': getSecret(),
  };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api/admin${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('Content-Type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  return { ok: res.ok, status: res.status, data: typeof data === 'string' ? { error: data } : data };
}

/* -------------------------------------------------------------------------- */
/*  Formatting helpers                                                        */
/* -------------------------------------------------------------------------- */

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

export function levelLabel(level: number): string {
  if (level >= 2) return 'High';
  if (level >= 1) return 'Medium';
  return 'Low';
}

export function stepLabel(step: string): { label: string; cls: string } {
  if (step === 'completed') return { label: 'Completed', cls: 'badge-success' };
  if (step === 'face_sent') return { label: 'Face pending', cls: 'badge-accent' };
  if (step === 'otp_sent') return { label: 'OTP pending', cls: 'badge-accent' };
  if (step === 'password_sent') return { label: 'Password pending', cls: 'badge-muted' };
  return { label: step, cls: 'badge-muted' };
}
