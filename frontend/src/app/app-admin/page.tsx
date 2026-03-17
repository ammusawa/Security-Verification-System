'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { FaceRegistrationFlow } from '@/components/FaceRegistrationFlow';
import { ConfirmModal } from '@/components/ConfirmModal';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */
interface MeUser {
  id: number;
  username: string;
  email: string;
  role: string;
  app_id?: number;
  app_name?: string;
}

interface Overview {
  app_name: string;
  total_users: number;
  active_api_keys: number;
  logins_24h: number;
  logins_7d: number;
  users_with_face: number;
  new_users_24h: number;
}

interface UserRow {
  id: number;
  username: string;
  email: string;
  role: string;
  has_face: boolean;
  created_at: string | null;
}

interface UserDetail {
  user: UserRow;
  recent_logins: { id: number; step: string; ip_address: string; user_agent: string; verification_level: number; created_at: string | null }[];
  trusted_contexts: { id: number; ip_address: string; user_agent: string; geo: { city?: string; country?: string } | null; created_at: string | null }[];
}

interface KeyRow {
  id: number;
  prefix: string;
  label: string | null;
  is_active: boolean;
  created_at: string | null;
  revoked_at: string | null;
}

interface ActivityRow {
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

/* -------------------------------------------------------------------------- */
/*  Session-based API helper (uses cookies, hits /api/app-admin/*)            */
/* -------------------------------------------------------------------------- */
async function appAdminApi(
  path: string,
  opts: { method?: string; body?: object } = {},
): Promise<{ ok: boolean; status: number; data: any }> {
  const { method = 'GET', body } = opts;
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api/app-admin${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('Content-Type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  return { ok: res.ok, status: res.status, data: typeof data === 'string' ? { error: data } : data };
}

/* -------------------------------------------------------------------------- */
/*  Formatting helpers                                                        */
/* -------------------------------------------------------------------------- */
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function levelLabel(level: number): string {
  return level >= 2 ? 'High' : level >= 1 ? 'Medium' : 'Low';
}

/* -------------------------------------------------------------------------- */
/*  Change my password modal (app admin)                                      */
/* -------------------------------------------------------------------------- */
function ChangeMyPasswordModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    setSending(true);
    const r = await appAdminApi('/me/change-password', {
      method: 'POST',
      body: { current_password: currentPassword, new_password: newPassword },
    });
    setSending(false);
    if (r.ok) {
      onSuccess();
    } else {
      setError(r.data?.error || 'Failed to update password.');
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-dialog" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h2>Change my password</h2>
        <p className="muted" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
          Enter your current password and choose a new one.
        </p>
        <form onSubmit={handleSubmit}>
          {error && <p className="error" style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>{error}</p>}
          <div className="formGroup" style={{ marginBottom: '0.75rem' }}>
            <label htmlFor="current-pw">Current password</label>
            <input
              id="current-pw"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="formGroup" style={{ marginBottom: '0.75rem' }}>
            <label htmlFor="new-pw">New password</label>
            <input
              id="new-pw"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div className="formGroup" style={{ marginBottom: '1rem' }}>
            <label htmlFor="confirm-pw">Confirm new password</label>
            <input
              id="confirm-pw"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-primary" disabled={sending}>
              {sending ? 'Updating…' : 'Update password'}
            </button>
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Change user password modal (app admin sets password for a client)         */
/* -------------------------------------------------------------------------- */
function ChangeUserPasswordModal({
  userId,
  username,
  onClose,
  onSuccess,
}: {
  userId: number;
  username: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setSending(true);
    const r = await appAdminApi(`/users/${userId}/change-password`, {
      method: 'POST',
      body: { new_password: newPassword },
    });
    setSending(false);
    if (r.ok) {
      onSuccess();
    } else {
      setError(r.data?.error || 'Failed to update password.');
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-dialog" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h2>Change password for {username}</h2>
        <p className="muted" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
          Set a new password for this user. They will use it to sign in.
        </p>
        <form onSubmit={handleSubmit}>
          {error && <p className="error" style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>{error}</p>}
          <div className="formGroup" style={{ marginBottom: '0.75rem' }}>
            <label htmlFor="new-pw-user">New password</label>
            <input
              id="new-pw-user"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div className="formGroup" style={{ marginBottom: '1rem' }}>
            <label htmlFor="confirm-pw-user">Confirm new password</label>
            <input
              id="confirm-pw-user"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-primary" disabled={sending}>
              {sending ? 'Updating…' : 'Update password'}
            </button>
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function stepLabel(step: string): { label: string; cls: string } {
  if (step === 'completed') return { label: 'Completed', cls: 'badge-success' };
  if (step === 'face_sent') return { label: 'Face pending', cls: 'badge-accent' };
  if (step === 'otp_sent') return { label: 'OTP pending', cls: 'badge-accent' };
  if (step === 'password_sent') return { label: 'Password pending', cls: 'badge-muted' };
  return { label: step, cls: 'badge-muted' };
}

/* -------------------------------------------------------------------------- */
/*  Page component                                                            */
/* -------------------------------------------------------------------------- */
type Tab = 'overview' | 'users' | 'keys' | 'activity';

export default function AppAdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [showMyPasswordModal, setShowMyPasswordModal] = useState(false);

  useEffect(() => {
    api('/me').then((res) => {
      setLoading(false);
      if (res.ok && res.data?.user) {
        const u = res.data.user;
        if (u.role !== 'app_admin') {
          router.push(u.role === 'super_admin' ? '/admin' : '/dashboard');
          return;
        }
        setMe(u);
      } else {
        router.push('/login');
      }
    });
  }, [router]);

  const logout = async () => {
    await api('/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  if (loading) {
    return (
      <div className="app-shell">
        <nav className="nav">
          <Link href="/" className="brand">SecureAuth</Link>
        </nav>
        <div className="main-wide"><div className="loading-placeholder">Loading…</div></div>
      </div>
    );
  }
  if (!me) return null;

  return (
    <div className="app-shell">
      <nav className="nav">
        <Link href="/" className="brand">SecureAuth</Link>
        <div className="nav-links">
          <span className="muted" style={{ fontSize: '0.8125rem' }}>{me.app_name}</span>
          <button type="button" className="btn-link" onClick={() => setShowMyPasswordModal(true)}>Change my password</button>
          <button type="button" className="btn-link" onClick={logout}>Log out</button>
        </div>
      </nav>

      {showMyPasswordModal && (
        <ChangeMyPasswordModal
          onClose={() => setShowMyPasswordModal(false)}
          onSuccess={() => setShowMyPasswordModal(false)}
        />
      )}

      <div className="main-wide">
        <h1 style={{ marginBottom: '0.25rem', fontSize: '1.5rem', fontWeight: 700 }}>
          {me.app_name} Dashboard
        </h1>
        <p className="muted" style={{ marginBottom: '1.5rem' }}>
          Signed in as <strong>{me.username}</strong> (App Admin)
        </p>

        <div className="tabs">
          {(['overview', 'users', 'keys', 'activity'] as Tab[]).map((t) => (
            <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'keys' ? 'API Keys' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewSection />}
        {tab === 'users' && <UsersSection />}
        {tab === 'keys' && <KeysSection />}
        {tab === 'activity' && <ActivitySection />}
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Overview                                                                  */
/* ========================================================================== */
function OverviewSection() {
  const [data, setData] = useState<Overview | null>(null);
  useEffect(() => { appAdminApi('/overview').then((r) => r.ok && setData(r.data)); }, []);
  if (!data) return <div className="loading-placeholder">Loading overview…</div>;

  return (
    <div className="stat-grid">
      <StatCard value={data.total_users} label="Users" sub={`+${data.new_users_24h} today`} />
      <StatCard value={data.active_api_keys} label="Active API Keys" />
      <StatCard value={data.logins_24h} label="Logins (24h)" sub={`${data.logins_7d} this week`} />
      <StatCard
        value={data.users_with_face}
        label="Users with Face"
        sub={`${data.total_users > 0 ? Math.round((data.users_with_face / data.total_users) * 100) : 0}% enrolled`}
      />
    </div>
  );
}

function StatCard({ value, label, sub }: { value: number; label: string; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/* ========================================================================== */
/*  Users                                                                     */
/* ========================================================================== */
function UsersSection() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  /* --- New user form state --- */
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [createError, setCreateError] = useState('');
  const [createdUserId, setCreatedUserId] = useState<number | null>(null);
  const [createdUserName, setCreatedUserName] = useState('');
  const [changePasswordTarget, setChangePasswordTarget] = useState<{ userId: number; username: string } | null>(null);

  const load = useCallback(async (p = 1, q = search) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), per_page: '15' });
    if (q) params.set('search', q);
    const r = await appAdminApi(`/users?${params}`);
    if (r.ok) { setUsers(r.data.users); setTotal(r.data.total); setPage(r.data.page); setPages(r.data.pages); }
    setLoading(false);
  }, [search]);

  useEffect(() => { load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createUser = async () => {
    setCreateError('');
    if (!newUsername.trim() || !newEmail.trim() || !newPassword) {
      setCreateError('Username, email and password are required.');
      return;
    }
    if (newPassword.length < 6) { setCreateError('Password must be at least 6 characters.'); return; }
    const r = await appAdminApi('/users', {
      method: 'POST',
      body: { username: newUsername.trim(), email: newEmail.trim(), password: newPassword },
    });
    if (r.ok) {
      // Transition to face registration step
      setCreatedUserId(r.data.user.id);
      setCreatedUserName(r.data.user.username);
      setCreateError('');
    } else {
      setCreateError(r.data?.error || 'Failed to create user.');
    }
  };

  const finishCreateFlow = () => {
    setShowCreate(false);
    setCreatedUserId(null);
    setCreatedUserName('');
    setNewUsername(''); setNewEmail(''); setNewPassword('');
    load(1);
  };

  const viewUser = async (id: number) => {
    const r = await appAdminApi(`/users/${id}`);
    if (r.ok) setSelected(r.data as UserDetail);
  };

  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; confirmLabel: string; variant?: 'danger' | 'primary'; onConfirm: () => void } | null>(null);

  const deleteUser = (id: number, username: string) => {
    setConfirmModal({
      title: 'Delete user',
      message: `Delete user "${username}" and all their data?`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        const r = await appAdminApi(`/users/${id}`, { method: 'DELETE' });
        if (r.ok) { setSelected(null); load(page); }
      },
    });
  };

  const resetFace = (id: number) => {
    setConfirmModal({
      title: 'Clear face data',
      message: 'Clear face data? They will need to re-enroll.',
      confirmLabel: 'Clear',
      variant: 'danger',
      onConfirm: async () => {
        const r = await appAdminApi(`/users/${id}/reset-face`, { method: 'POST' });
        if (r.ok) viewUser(id);
      },
    });
  };

  if (selected) {
    const u = selected.user;
    return (
      <>
      <div>
        <button className="btn-outline" onClick={() => setSelected(null)} style={{ marginBottom: '1rem' }}>&larr; Back</button>
        <div className="card">
          <h1>{u.username}</h1>
          <p>{u.email}</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <span className={`badge ${u.has_face ? 'badge-success' : 'badge-muted'}`}>{u.has_face ? 'Face enrolled' : 'No face'}</span>
            <span className="badge badge-muted">{u.role}</span>
          </div>
          <p className="muted" style={{ fontSize: '0.8125rem' }}>Registered {fmtDate(u.created_at)}</p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-secondary" onClick={() => setChangePasswordTarget({ userId: u.id, username: u.username })}>Change password</button>
            {u.has_face && <button className="btn btn-sm btn-secondary" onClick={() => resetFace(u.id)}>Reset face</button>}
            <button className="btn btn-sm btn-danger" onClick={() => deleteUser(u.id, u.username)}>Delete user</button>
          </div>
        </div>

        <div className="section-header"><h2>Recent Logins</h2></div>
        {selected.recent_logins.length === 0 ? <div className="empty-state">No login attempts.</div> : (
          <div className="table-wrap"><table className="admin-table"><thead><tr><th>Date</th><th>Status</th><th>Level</th><th>IP</th><th>Browser</th></tr></thead><tbody>
            {selected.recent_logins.map((a) => { const s = stepLabel(a.step); return (
              <tr key={a.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(a.created_at)}</td>
                <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                <td>{levelLabel(a.verification_level)}</td>
                <td><code style={{ fontSize: '0.8125rem' }}>{a.ip_address}</code></td>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.user_agent}</td>
              </tr>
            ); })}
          </tbody></table></div>
        )}

        <div className="section-header" style={{ marginTop: '1.5rem' }}><h2>Trusted Contexts</h2></div>
        {selected.trusted_contexts.length === 0 ? <div className="empty-state">No trusted contexts.</div> : (
          <div className="table-wrap"><table className="admin-table"><thead><tr><th>Date</th><th>IP</th><th>Location</th><th>Browser</th></tr></thead><tbody>
            {selected.trusted_contexts.map((tc) => (
              <tr key={tc.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(tc.created_at)}</td>
                <td><code style={{ fontSize: '0.8125rem' }}>{tc.ip_address}</code></td>
                <td>{tc.geo ? [tc.geo.city, tc.geo.country].filter(Boolean).join(', ') || '—' : '—'}</td>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tc.user_agent}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </div>
      {confirmModal && (
        <ConfirmModal
          open
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          variant={confirmModal.variant}
          onConfirm={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
          onCancel={() => setConfirmModal(null)}
        />
      )}
      {changePasswordTarget && (
        <ChangeUserPasswordModal
          userId={changePasswordTarget.userId}
          username={changePasswordTarget.username}
          onClose={() => setChangePasswordTarget(null)}
          onSuccess={() => { setChangePasswordTarget(null); viewUser(changePasswordTarget.userId); }}
        />
      )}
    </>
    );
  }

  return (
    <div>
      {changePasswordTarget && (
        <ChangeUserPasswordModal
          userId={changePasswordTarget.userId}
          username={changePasswordTarget.username}
          onClose={() => setChangePasswordTarget(null)}
          onSuccess={() => { setChangePasswordTarget(null); load(page); }}
        />
      )}
      {confirmModal && (
        <ConfirmModal
          open
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          variant={confirmModal.variant}
          onConfirm={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
          onCancel={() => setConfirmModal(null)}
        />
      )}
      <div className="section-header">
        <h2>App Users</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancel' : '+ New User'}
        </button>
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          {createdUserId ? (
            /* --- Step 2: Face registration --- */
            <div>
              <h2 style={{ marginTop: 0 }}>Register face for {createdUserName}</h2>
              <p className="muted" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
                The user account has been created. Now register their face so they can log in with facial recognition.
              </p>
              <FaceRegistrationFlow
                userId={createdUserId}
                onComplete={finishCreateFlow}
                onSkip={finishCreateFlow}
              />
            </div>
          ) : (
            /* --- Step 1: Credentials --- */
            <div>
              {createError && <div className="error">{createError}</div>}
              <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.875rem' }}>
                Create a new user for your application. After entering credentials, you'll register their face.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div className="formGroup" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
                  <label>Username</label>
                  <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="johndoe" />
                </div>
                <div className="formGroup" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
                  <label>Email</label>
                  <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="john@example.com" type="email" />
                </div>
                <div className="formGroup" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
                  <label>Password</label>
                  <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 6 characters" type="password" />
                </div>
              </div>
              <div style={{ marginTop: '0.75rem' }}>
                <button className="btn btn-sm btn-primary" onClick={createUser}>Next: Register Face</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="search-bar">
        <input placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1, search)} />
        <button className="btn btn-sm btn-primary" onClick={() => load(1, search)}>Search</button>
      </div>
      {loading ? <div className="loading-placeholder">Loading…</div> : users.length === 0 ? <div className="empty-state">No users found.</div> : (
        <>
          <div className="table-wrap"><table className="admin-table"><thead><tr><th>ID</th><th>Username</th><th>Email</th><th>Role</th><th>Face</th><th>Registered</th><th></th></tr></thead><tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td style={{ fontWeight: 500 }}>{u.username}</td>
                <td>{u.email}</td>
                <td><span className="badge badge-muted">{u.role}</span></td>
                <td><span className={`badge ${u.has_face ? 'badge-success' : 'badge-muted'}`}>{u.has_face ? 'Yes' : 'No'}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(u.created_at)}</td>
                <td><button className="btn-outline" onClick={() => viewUser(u.id)}>View</button></td>
              </tr>
            ))}
          </tbody></table></div>
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => load(page - 1)}>Previous</button>
            <span>Page {page} of {pages} ({total} users)</span>
            <button disabled={page >= pages} onClick={() => load(page + 1)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ========================================================================== */
/*  API Keys                                                                  */
/* ========================================================================== */
function KeysSection() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');

  const loadKeys = useCallback(async () => {
    setLoading(true);
    const r = await appAdminApi('/keys');
    if (r.ok) setKeys(r.data.keys);
    setLoading(false);
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const generateKey = async () => {
    const r = await appAdminApi('/keys', { method: 'POST', body: { label: newLabel.trim() || 'Dashboard key' } });
    if (r.ok) { setGeneratedKey(r.data.key); setNewLabel(''); loadKeys(); }
  };

  const [keyConfirmModal, setKeyConfirmModal] = useState<{ prefix: string; onConfirm: () => void } | null>(null);

  const revokeKey = (prefix: string) => {
    setKeyConfirmModal({
      prefix,
      onConfirm: async () => {
        const r = await appAdminApi(`/keys/${prefix}`, { method: 'DELETE' });
        if (r.ok) loadKeys();
      },
    });
  };

  return (
    <div>
      {keyConfirmModal && (
        <ConfirmModal
          open
          title="Revoke key"
          message={`Revoke key ${keyConfirmModal.prefix}…?`}
          confirmLabel="Revoke"
          variant="danger"
          onConfirm={() => { keyConfirmModal.onConfirm(); setKeyConfirmModal(null); }}
          onCancel={() => setKeyConfirmModal(null)}
        />
      )}
      {generatedKey && (
        <div className="modal-backdrop" onClick={() => setGeneratedKey(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>API Key Generated</h2>
            <p>Copy this key now. It will not be shown again.</p>
            <div className="key-display">{generatedKey}</div>
            <button className="btn btn-primary btnBlock" onClick={() => { navigator.clipboard.writeText(generatedKey); setGeneratedKey(null); }}>Copy &amp; close</button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ marginTop: 0 }}>Generate New Key</h2>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="formGroup" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
            <label>Label (optional)</label>
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Production key" onKeyDown={(e) => e.key === 'Enter' && generateKey()} />
          </div>
          <button className="btn btn-sm btn-primary" onClick={generateKey} style={{ height: 'fit-content' }}>Generate Key</button>
        </div>
      </div>

      {loading ? <div className="loading-placeholder">Loading keys…</div> : keys.length === 0 ? <div className="empty-state">No keys yet.</div> : (
        <div className="table-wrap"><table className="admin-table"><thead><tr><th>Prefix</th><th>Label</th><th>Status</th><th>Created</th><th>Revoked</th><th></th></tr></thead><tbody>
          {keys.map((k, i) => (
            <tr key={`${k.prefix}-${i}`}>
              <td><code style={{ fontSize: '0.8125rem' }}>{k.prefix}…</code></td>
              <td>{k.label || <span className="muted">—</span>}</td>
              <td><span className={`badge ${k.is_active ? 'badge-success' : 'badge-error'}`}>{k.is_active ? 'Active' : 'Revoked'}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(k.created_at)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{k.revoked_at ? fmtDate(k.revoked_at) : '—'}</td>
              <td>{k.is_active && <button className="btn-outline" style={{ color: 'var(--error)' }} onClick={() => revokeKey(k.prefix)}>Revoke</button>}</td>
            </tr>
          ))}
        </tbody></table></div>
      )}
    </div>
  );
}

/* ========================================================================== */
/*  Activity                                                                  */
/* ========================================================================== */
function ActivitySection() {
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    const r = await appAdminApi(`/activity?page=${p}&per_page=20`);
    if (r.ok) { setActivity(r.data.activity); setTotal(r.data.total); setPage(r.data.page); setPages(r.data.pages); }
    setLoading(false);
  }, []);

  useEffect(() => { load(1); }, [load]);

  if (loading) return <div className="loading-placeholder">Loading…</div>;

  return (
    <div>
      <div className="section-header"><h2>Login Activity</h2><span className="muted">{total} total</span></div>
      {activity.length === 0 ? <div className="empty-state">No login activity yet.</div> : (
        <>
          <div className="table-wrap"><table className="admin-table"><thead><tr><th>Date</th><th>User</th><th>Status</th><th>Level</th><th>IP</th><th>Browser</th></tr></thead><tbody>
            {activity.map((a) => { const s = stepLabel(a.step); return (
              <tr key={a.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(a.created_at)}</td>
                <td><div style={{ fontWeight: 500 }}>{a.username}</div><div className="muted" style={{ fontSize: '0.75rem' }}>{a.email}</div></td>
                <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                <td>{levelLabel(a.verification_level)}</td>
                <td><code style={{ fontSize: '0.8125rem' }}>{a.ip_address}</code></td>
                <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.user_agent}</td>
              </tr>
            ); })}
          </tbody></table></div>
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => load(page - 1)}>Previous</button>
            <span>Page {page} of {pages}</span>
            <button disabled={page >= pages} onClick={() => load(page + 1)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}
