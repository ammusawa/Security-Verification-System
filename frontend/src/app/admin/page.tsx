'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  adminApi, getSecret, setSecret, clearSecret,
  fmtDate, levelLabel, stepLabel,
  type Overview, type UserRow, type AppRow, type ActivityRow, type UserDetail,
  type DemoRequestRow, type DemoRequestDetail,
  type SubscriptionRequestRow, type SubscriptionRequestDetail,
} from '@/lib/admin';
import { FaceRegistrationFlow } from '@/components/FaceRegistrationFlow';
import { ConfirmModal } from '@/components/ConfirmModal';

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

type Tab = 'overview' | 'users' | 'apps' | 'activity' | 'demos' | 'subscriptions';

export default function AdminPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [secretInput, setSecretInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');

  /* --- Auth gate --------------------------------------------------------- */
  const doLogin = async () => {
    setSecret(secretInput);
    const r = await adminApi('/overview');
    if (r.ok) {
      setAuthed(true);
      setAuthError('');
    } else {
      setAuthError('Invalid admin secret.');
      clearSecret();
    }
  };

  useEffect(() => {
    const stored = getSecret();
    if (stored) {
      adminApi('/overview').then((r) => {
        if (r.ok) setAuthed(true);
        else clearSecret();
      });
    }
  }, []);

  if (!authed) {
    return (
      <div className="app-shell">
        <nav className="nav">
          <Link href="/" className="brand">SecureAuth</Link>
          <div className="nav-links"><Link href="/dashboard">Dashboard</Link></div>
        </nav>
        <div className="main">
          <div className="card" style={{ maxWidth: 400, margin: '2rem auto' }}>
            <h1>Admin Login</h1>
            <p>Enter the admin secret to access the management dashboard.</p>
            {authError && <div className="error">{authError}</div>}
            <div className="formGroup">
              <label htmlFor="secret">Admin Secret</label>
              <input
                id="secret"
                type="password"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doLogin()}
                placeholder="Enter admin secret"
                autoFocus
              />
            </div>
            <div className="form-actions">
              <button className="btn btn-primary btnBlock" onClick={doLogin}>Sign in</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <nav className="nav">
        <Link href="/" className="brand">SecureAuth</Link>
        <div className="nav-links">
          <Link href="/dashboard">Dashboard</Link>
          <button
            type="button"
            className="btn-link"
            onClick={() => { clearSecret(); setAuthed(false); }}
          >
            Log out
          </button>
        </div>
      </nav>

      <div className="main-wide">
        <h1 style={{ marginBottom: '0.25rem', fontSize: '1.5rem', fontWeight: 700 }}>Admin Dashboard</h1>
        <p className="muted" style={{ marginBottom: '1.5rem' }}>
          Manage users, apps, API keys, and monitor activity.
        </p>

        <div className="tabs">
          {(['overview', 'users', 'apps', 'activity', 'demos', 'subscriptions'] as Tab[]).map((t) => (
            <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'demos' ? 'Demo Requests' : t === 'subscriptions' ? 'Subscriptions' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'apps' && <AppsTab />}
        {tab === 'activity' && <ActivityTab />}
        {tab === 'demos' && <DemoRequestsTab />}
        {tab === 'subscriptions' && <SubscriptionRequestsTab />}
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Overview Tab                                                              */
/* ========================================================================== */

function OverviewTab() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    adminApi('/overview').then((r) => r.ok && setData(r.data));
  }, []);

  if (!data) return <div className="loading-placeholder">Loading overview…</div>;

  return (
    <div className="stat-grid">
      <StatCard value={data.total_users} label="Total Users" sub={`+${data.new_users_24h} today / +${data.new_users_7d} this week`} />
      <StatCard value={data.total_apps} label="Tenant Apps" />
      <StatCard value={data.total_active_keys} label="Active API Keys" />
      <StatCard value={data.logins_24h} label="Logins (24h)" sub={`${data.logins_7d} this week`} />
      <StatCard value={data.users_with_face} label="Users with Face" sub={`${data.total_users > 0 ? Math.round((data.users_with_face / data.total_users) * 100) : 0}% enrolled`} />
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
/*  Users Tab                                                                 */
/* ========================================================================== */

function UsersTab() {
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
  const [newRole, setNewRole] = useState('user');
  const [newAppId, setNewAppId] = useState('');
  const [apps, setApps] = useState<AppRow[]>([]);
  const [createError, setCreateError] = useState('');
  const [createdUserId, setCreatedUserId] = useState<number | null>(null);
  const [createdUserName, setCreatedUserName] = useState('');
  const [createdUserRole, setCreatedUserRole] = useState('');

  const load = useCallback(async (p = 1, q = search) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), per_page: '15' });
    if (q) params.set('search', q);
    const r = await adminApi(`/users?${params}`);
    if (r.ok) {
      setUsers(r.data.users);
      setTotal(r.data.total);
      setPage(r.data.page);
      setPages(r.data.pages);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Load apps list for the role dropdown */
  useEffect(() => {
    if (showCreate && apps.length === 0) {
      adminApi('/apps').then((r) => { if (r.ok) setApps(r.data.apps); });
    }
  }, [showCreate, apps.length]);

  const handleSearch = () => load(1, search);

  const createUser = async () => {
    setCreateError('');
    if (!newUsername.trim() || !newEmail.trim() || !newPassword) {
      setCreateError('Username, email and password are required.');
      return;
    }
    if (newPassword.length < 6) { setCreateError('Password must be at least 6 characters.'); return; }
    if (newRole === 'app_admin' && !newAppId) { setCreateError('App admin must be linked to an app.'); return; }

    const body: Record<string, unknown> = {
      username: newUsername.trim(),
      email: newEmail.trim(),
      password: newPassword,
      role: newRole,
    };
    if (newAppId) body.app_id = Number(newAppId);

    const r = await adminApi('/users', { method: 'POST', body });
    if (r.ok) {
      const role = r.data.user.role;
      // app_admin users skip face — finish immediately
      if (role === 'app_admin') {
        setShowCreate(false);
        setNewUsername(''); setNewEmail(''); setNewPassword(''); setNewRole('user'); setNewAppId('');
        load(1);
      } else {
        // Transition to face registration step
        setCreatedUserId(r.data.user.id);
        setCreatedUserName(r.data.user.username);
        setCreatedUserRole(role);
        setCreateError('');
      }
    } else {
      setCreateError(r.data?.error || 'Failed to create user.');
    }
  };

  const finishCreateFlow = () => {
    setShowCreate(false);
    setCreatedUserId(null);
    setCreatedUserName('');
    setCreatedUserRole('');
    setNewUsername(''); setNewEmail(''); setNewPassword(''); setNewRole('user'); setNewAppId('');
    load(1);
  };

  const viewUser = async (id: number) => {
    const r = await adminApi(`/users/${id}`);
    if (r.ok) setSelected(r.data as UserDetail);
  };

  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; confirmLabel: string; variant?: 'danger' | 'primary'; onConfirm: () => void } | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<{ id: number; username: string } | null>(null);
  const [resetPasswordNew, setResetPasswordNew] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);

  const submitResetPassword = async () => {
    if (!resetPasswordUser) return;
    setResetPasswordError('');
    if (!resetPasswordNew || resetPasswordNew.length < 6) {
      setResetPasswordError('Password must be at least 6 characters');
      return;
    }
    if (resetPasswordNew !== resetPasswordConfirm) {
      setResetPasswordError('Passwords do not match');
      return;
    }
    setResetPasswordLoading(true);
    const r = await adminApi(`/users/${resetPasswordUser.id}/reset-password`, { method: 'POST', body: { new_password: resetPasswordNew } });
    setResetPasswordLoading(false);
    if (r.ok) {
      setResetPasswordUser(null);
      setResetPasswordNew('');
      setResetPasswordConfirm('');
      if (selected?.user.id === resetPasswordUser.id) viewUser(resetPasswordUser.id);
    } else {
      setResetPasswordError(r.data?.error || 'Failed to update password');
    }
  };

  const deleteUser = (id: number, username: string) => {
    setConfirmModal({
      title: 'Delete user',
      message: `Delete user "${username}" and all their data? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        const r = await adminApi(`/users/${id}`, { method: 'DELETE' });
        if (r.ok) { setSelected(null); load(page); }
      },
    });
  };

  const resetFace = (id: number) => {
    setConfirmModal({
      title: 'Clear face data',
      message: 'Clear face data for this user? They will need to re-enroll.',
      confirmLabel: 'Clear',
      variant: 'danger',
      onConfirm: async () => {
        const r = await adminApi(`/users/${id}/reset-face`, { method: 'POST' });
        if (r.ok) viewUser(id);
      },
    });
  };

  /* --- User detail modal --- */
  if (selected) {
    const u = selected.user;
    return (
      <>
      <div>
        <button className="btn-outline" onClick={() => setSelected(null)} style={{ marginBottom: '1rem' }}>
          &larr; Back to users
        </button>
        <div className="card">
          <h1>{u.username}</h1>
          <p>{u.email}</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <span className={`badge ${u.has_face ? 'badge-success' : 'badge-muted'}`}>
              {u.has_face ? 'Face enrolled' : 'No face'}
            </span>
            <span className="badge badge-muted">{u.app_name}</span>
          </div>
          <p className="muted" style={{ fontSize: '0.8125rem' }}>Registered {fmtDate(u.created_at)}</p>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button className="btn btn-sm btn-secondary" onClick={() => setResetPasswordUser({ id: u.id, username: u.username })}>Reset password</button>
            {u.has_face && (
              <button className="btn btn-sm btn-secondary" onClick={() => resetFace(u.id)}>Reset face data</button>
            )}
            <button className="btn btn-sm btn-danger" onClick={() => deleteUser(u.id, u.username)}>Delete user</button>
          </div>
        </div>

        <div className="section-header"><h2>Recent Login Attempts</h2></div>
        {selected.recent_logins.length === 0 ? (
          <div className="empty-state">No login attempts.</div>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Level</th>
                  <th>IP</th>
                  <th>Browser</th>
                </tr>
              </thead>
              <tbody>
                {selected.recent_logins.map((a) => {
                  const s = stepLabel(a.step);
                  return (
                    <tr key={a.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(a.created_at)}</td>
                      <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                      <td>{levelLabel(a.verification_level)}</td>
                      <td><code style={{ fontSize: '0.8125rem' }}>{a.ip_address}</code></td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.user_agent}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="section-header" style={{ marginTop: '1.5rem' }}><h2>Trusted Contexts</h2></div>
        {selected.trusted_contexts.length === 0 ? (
          <div className="empty-state">No trusted contexts.</div>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Date</th><th>IP</th><th>Location</th><th>Browser</th></tr>
              </thead>
              <tbody>
                {selected.trusted_contexts.map((tc) => (
                  <tr key={tc.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(tc.created_at)}</td>
                    <td><code style={{ fontSize: '0.8125rem' }}>{tc.ip_address}</code></td>
                    <td>{tc.geo ? [tc.geo.city, tc.geo.country].filter(Boolean).join(', ') || '—' : '—'}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tc.user_agent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
      {resetPasswordUser && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => !resetPasswordLoading && setResetPasswordUser(null)}>
          <div className="modal-dialog" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <h2>Reset password</h2>
            <p className="muted">Set a new password for {resetPasswordUser.username}.</p>
            <div className="formGroup">
              <label htmlFor="admin-reset-new">New password</label>
              <input
                id="admin-reset-new"
                type="password"
                value={resetPasswordNew}
                onChange={(e) => setResetPasswordNew(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                placeholder="At least 6 characters"
              />
            </div>
            <div className="formGroup">
              <label htmlFor="admin-reset-confirm">Confirm password</label>
              <input
                id="admin-reset-confirm"
                type="password"
                value={resetPasswordConfirm}
                onChange={(e) => setResetPasswordConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={6}
              />
            </div>
            {resetPasswordError && <p className="error">{resetPasswordError}</p>}
            <div className="form-actions">
              <button type="button" className="btn btn-primary btnBlock" disabled={resetPasswordLoading} onClick={submitResetPassword}>
                {resetPasswordLoading ? 'Updating…' : 'Update password'}
              </button>
              <button type="button" className="btn btn-secondary btnBlock" disabled={resetPasswordLoading} onClick={() => setResetPasswordUser(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
    );
  }

  /* --- User list --- */
  return (
    <>
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
        <h2>All Users</h2>
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
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
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
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="formGroup" style={{ minWidth: 140, marginBottom: 0 }}>
                  <label>Role</label>
                  <select value={newRole} onChange={(e) => { setNewRole(e.target.value); if (e.target.value !== 'app_admin') setNewAppId(''); }}>
                    <option value="user">User</option>
                    <option value="app_admin">App Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>
                {(newRole === 'app_admin' || newRole === 'user') && (
                  <div className="formGroup" style={{ minWidth: 160, marginBottom: 0 }}>
                    <label>App {newRole === 'app_admin' ? '(required)' : '(optional)'}</label>
                    <select value={newAppId} onChange={(e) => setNewAppId(e.target.value)}>
                      <option value="">— None (Internal) —</option>
                      {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                )}
                <button className="btn btn-sm btn-primary" onClick={createUser} style={{ height: 'fit-content' }}>
                  {newRole === 'app_admin' ? 'Create User' : 'Next: Register Face'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="search-bar">
        <input
          placeholder="Search users by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button className="btn btn-sm btn-primary" onClick={handleSearch}>Search</button>
      </div>

      {loading ? (
        <div className="loading-placeholder">Loading users…</div>
      ) : users.length === 0 ? (
        <div className="empty-state">No users found.</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>App</th>
                  <th>Face</th>
                  <th>Registered</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td style={{ fontWeight: 500 }}>{u.username}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`badge ${u.role === 'app_admin' ? 'badge-accent' : u.role === 'super_admin' ? 'badge-success' : 'badge-muted'}`}>
                        {u.role === 'app_admin' ? 'App Admin' : u.role === 'super_admin' ? 'Super Admin' : 'User'}
                      </span>
                    </td>
                    <td><span className="badge badge-muted">{u.app_name}</span></td>
                    <td>
                      <span className={`badge ${u.has_face ? 'badge-success' : 'badge-muted'}`}>
                        {u.has_face ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(u.created_at)}</td>
                    <td>
                      <button className="btn-outline" onClick={() => viewUser(u.id)}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => load(page - 1)}>Previous</button>
            <span>Page {page} of {pages} ({total} users)</span>
            <button disabled={page >= pages} onClick={() => load(page + 1)}>Next</button>
          </div>
        </>
      )}
    </>
  );
}

/* ========================================================================== */
/*  Apps Tab                                                                  */
/* ========================================================================== */

function AppsTab() {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [createError, setCreateError] = useState('');
  const [createdAdmin, setCreatedAdmin] = useState<{ username: string; email: string } | null>(null);
  const [generatedKey, setGeneratedKey] = useState<{ appName: string; key: string } | null>(null);

  const loadApps = async () => {
    setLoading(true);
    const r = await adminApi('/apps');
    if (r.ok) setApps(r.data.apps);
    setLoading(false);
  };

  useEffect(() => { loadApps(); }, []);

  const createApp = async () => {
    setCreateError('');
    if (!newName.trim() || !newEmail.trim()) { setCreateError('App name and owner email are required.'); return; }
    if (!adminUsername.trim() || !adminPassword) { setCreateError('Admin username and password are required.'); return; }
    if (adminPassword.length < 6) { setCreateError('Admin password must be at least 6 characters.'); return; }
    const r = await adminApi('/apps', {
      method: 'POST',
      body: {
        name: newName.trim(),
        owner_email: newEmail.trim(),
        admin_username: adminUsername.trim(),
        admin_password: adminPassword,
      },
    });
    if (r.ok) {
      setShowCreate(false);
      setNewName('');
      setNewEmail('');
      setAdminUsername('');
      setAdminPassword('');
      if (r.data.app_admin) {
        setCreatedAdmin({ username: r.data.app_admin.username, email: r.data.app_admin.email });
      }
      loadApps();
    } else {
      setCreateError(r.data?.error || 'Failed to create app.');
    }
  };

  const generateKey = async (appId: number, appName: string) => {
    const r = await adminApi(`/apps/${appId}/keys`, { method: 'POST', body: { label: 'Generated from dashboard' } });
    if (r.ok) setGeneratedKey({ appName, key: r.data.key });
  };

  const toggleApp = async (appId: number, active: boolean) => {
    await adminApi(`/apps/${appId}`, { method: 'PATCH', body: { is_active: !active } });
    loadApps();
  };

  return (
    <div>
      {/* Key display modal */}
      {generatedKey && (
        <div className="modal-backdrop" onClick={() => setGeneratedKey(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>API Key Generated</h2>
            <p>Copy this key now. It will not be shown again.</p>
            <div className="key-display">{generatedKey.key}</div>
            <p className="muted" style={{ fontSize: '0.8125rem' }}>App: {generatedKey.appName}</p>
            <button
              className="btn btn-primary btnBlock"
              onClick={() => { navigator.clipboard.writeText(generatedKey.key); setGeneratedKey(null); loadApps(); }}
            >
              Copy &amp; close
            </button>
          </div>
        </div>
      )}

      {/* Created admin modal */}
      {createdAdmin && (
        <div className="modal-backdrop" onClick={() => setCreatedAdmin(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>App Created Successfully</h2>
            <p>An app admin account has been created. They can log in at the regular login page.</p>
            <div style={{ margin: '0.75rem 0', fontSize: '0.9375rem', lineHeight: 1.8 }}>
              <div><strong>Username:</strong> {createdAdmin.username}</div>
              <div><strong>Email:</strong> {createdAdmin.email}</div>
              <div><strong>Role:</strong> App Admin</div>
            </div>
            <button className="btn btn-primary btnBlock" onClick={() => setCreatedAdmin(null)}>Done</button>
          </div>
        </div>
      )}

      <div className="section-header">
        <h2>Tenant Applications</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancel' : '+ New App'}
        </button>
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          {createError && <div className="error">{createError}</div>}
          <p className="muted" style={{ margin: '0 0 1rem', fontSize: '0.875rem' }}>
            Create a new tenant app with an admin account. The admin can log in and manage their app's users and API keys.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <div className="formGroup" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
              <label>App Name</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My SaaS App" />
            </div>
            <div className="formGroup" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
              <label>Owner Email</label>
              <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="owner@example.com" type="email" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div className="formGroup" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
              <label>Admin Username</label>
              <input value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} placeholder="appadmin" />
            </div>
            <div className="formGroup" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
              <label>Admin Password</label>
              <input value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Secure password" type="password" />
            </div>
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <button className="btn btn-sm btn-primary" onClick={createApp}>Create App &amp; Admin</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-placeholder">Loading apps…</div>
      ) : apps.length === 0 ? (
        <div className="empty-state">No apps yet. Create one to get started.</div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Owner</th>
                <th>Users</th>
                <th>Keys</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td style={{ fontWeight: 500 }}>{a.name}</td>
                  <td>{a.owner_email}</td>
                  <td>{a.user_count}</td>
                  <td>{a.key_count}</td>
                  <td>
                    <span className={`badge ${a.is_active ? 'badge-success' : 'badge-error'}`}>
                      {a.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(a.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <Link href={`/admin/apps/${a.id}`} className="btn-outline" style={{ textDecoration: 'none' }}>Manage</Link>
                      <button className="btn-outline" onClick={() => generateKey(a.id, a.name)}>+ Key</button>
                      <button
                        className="btn-outline"
                        onClick={() => toggleApp(a.id, a.is_active)}
                      >
                        {a.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/*  Activity Tab                                                              */
/* ========================================================================== */

function ActivityTab() {
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    const r = await adminApi(`/activity?page=${p}&per_page=20`);
    if (r.ok) {
      setActivity(r.data.activity);
      setTotal(r.data.total);
      setPage(r.data.page);
      setPages(r.data.pages);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(1); }, [load]);

  if (loading) return <div className="loading-placeholder">Loading activity…</div>;

  return (
    <div>
      <div className="section-header">
        <h2>Recent Login Attempts</h2>
        <span className="muted">{total} total</span>
      </div>

      {activity.length === 0 ? (
        <div className="empty-state">No login activity recorded yet.</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>User</th>
                  <th>Status</th>
                  <th>Level</th>
                  <th>IP</th>
                  <th>Browser</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a) => {
                  const s = stepLabel(a.step);
                  return (
                    <tr key={a.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(a.created_at)}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{a.username}</div>
                        <div className="muted" style={{ fontSize: '0.75rem' }}>{a.email}</div>
                      </td>
                      <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                      <td>{levelLabel(a.verification_level)}</td>
                      <td><code style={{ fontSize: '0.8125rem' }}>{a.ip_address}</code></td>
                      <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.user_agent}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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

/* ========================================================================== */
/*  Demo Requests Tab                                                         */
/* ========================================================================== */

function DemoRequestsTab() {
  const [requests, setRequests] = useState<DemoRequestRow[]>([]);
  const [stats, setStats] = useState({ pending: 0, sent: 0, viewed: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  // Detail / compose view
  const [selected, setSelected] = useState<DemoRequestDetail | null>(null);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeContent, setComposeContent] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState('');

  const load = useCallback(async (p = 1, status = filter) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), per_page: '15' });
    if (status) params.set('status', status);
    const r = await adminApi(`/demo-requests?${params}`);
    if (r.ok) {
      setRequests(r.data.demo_requests);
      setStats(r.data.stats);
      setTotal(r.data.total);
      setPage(r.data.page);
      setPages(r.data.pages);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const viewRequest = async (id: number) => {
    const r = await adminApi(`/demo-requests/${id}`);
    if (r.ok) {
      const d = r.data.demo_request as DemoRequestDetail;
      setSelected(d);
      setComposeSubject(d.demo_subject || 'Your SecureAuth Demo is Ready');
      setComposeContent(d.demo_content || '');
      setSendResult('');
    }
  };

  const sendDemo = async () => {
    if (!selected) return;
    if (!composeSubject.trim() || !composeContent.trim()) {
      setSendResult('Subject and content are required.');
      return;
    }
    setSending(true);
    setSendResult('');
    const r = await adminApi(`/demo-requests/${selected.id}/send`, {
      method: 'POST',
      body: { subject: composeSubject.trim(), content: composeContent.trim() },
    });
    setSending(false);
    if (r.ok) {
      setSendResult(`Sent! Demo URL: ${r.data.demo_url}`);
      // Refresh the detail
      viewRequest(selected.id);
      load(page);
    } else {
      setSendResult(r.data?.error || 'Failed to send.');
    }
  };

  const [demoConfirmModal, setDemoConfirmModal] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null);

  const deleteRequest = (id: number) => {
    setDemoConfirmModal({
      title: 'Delete demo request',
      message: 'Delete this demo request?',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        const r = await adminApi(`/demo-requests/${id}`, { method: 'DELETE' });
        if (r.ok) { setSelected(null); load(page); }
      },
    });
  };

  const statusBadge = (s: string) => {
    if (s === 'viewed') return <span className="badge badge-success">Viewed</span>;
    if (s === 'sent') return <span className="badge badge-accent">Sent</span>;
    return <span className="badge badge-muted">Pending</span>;
  };

  /* --- Detail / compose view --- */
  if (selected) {
    return (
      <>
      <div>
        <button className="btn-outline" onClick={() => setSelected(null)} style={{ marginBottom: '1rem' }}>
          &larr; Back to requests
        </button>

        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.25rem' }}>{selected.name}</h2>
              <p style={{ margin: 0 }}>{selected.email}</p>
              {selected.company && <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>Company: {selected.company}</p>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {statusBadge(selected.status)}
              <button className="btn btn-sm btn-danger" onClick={() => deleteRequest(selected.id)}>Delete</button>
            </div>
          </div>
          {selected.message && (
            <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <p className="muted" style={{ fontSize: '0.75rem', margin: '0 0 0.35rem', fontWeight: 600 }}>Their message:</p>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{selected.message}</p>
            </div>
          )}
          <p className="muted" style={{ fontSize: '0.8125rem', marginTop: '0.75rem' }}>
            Requested {fmtDate(selected.created_at)}
            {selected.sent_at && <> &middot; Sent {fmtDate(selected.sent_at)}</>}
            {selected.viewed_at && <> &middot; Viewed {fmtDate(selected.viewed_at)}</>}
          </p>
        </div>

        {/* Compose / Edit demo */}
        <div className="card">
          <h3 style={{ margin: '0 0 0.75rem' }}>
            {selected.status === 'pending' ? 'Compose Demo' : 'Edit & Resend Demo'}
          </h3>
          <p className="muted" style={{ fontSize: '0.875rem', margin: '0 0 1rem' }}>
            Write the demo content below. The recipient will receive an email with this content and a link to view it on a dedicated page.
          </p>
          <div className="formGroup" style={{ marginBottom: '0.75rem' }}>
            <label>Email Subject</label>
            <input
              value={composeSubject}
              onChange={(e) => setComposeSubject(e.target.value)}
              placeholder="Your SecureAuth Demo is Ready"
            />
          </div>
          <div className="formGroup" style={{ marginBottom: '0.75rem' }}>
            <label>Demo Content (HTML supported)</label>
            <textarea
              rows={10}
              value={composeContent}
              onChange={(e) => setComposeContent(e.target.value)}
              placeholder="Write your demo walkthrough here. You can use HTML for formatting.&#10;&#10;Example:&#10;<h3>Welcome to SecureAuth</h3>&#10;<p>Here's what our platform can do for your team...</p>&#10;<ul>&#10;  <li>Adaptive multi-factor authentication</li>&#10;  <li>Facial recognition enrollment</li>&#10;  <li>Context-aware risk scoring</li>&#10;</ul>"
              style={{ fontFamily: 'monospace', fontSize: '0.875rem', minHeight: 200, width: '100%', padding: '0.65rem 0.85rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)', color: 'var(--text)', resize: 'vertical' }}
            />
          </div>
          {sendResult && (
            <p className={sendResult.startsWith('Sent') ? 'muted' : 'error'} style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>
              {sendResult}
            </p>
          )}
          <button className="btn btn-primary" onClick={sendDemo} disabled={sending}>
            {sending ? 'Sending…' : selected.status === 'pending' ? 'Send Demo' : 'Resend Demo'}
          </button>
        </div>
      </div>
      {demoConfirmModal && (
        <ConfirmModal
          open
          title={demoConfirmModal.title}
          message={demoConfirmModal.message}
          confirmLabel={demoConfirmModal.confirmLabel}
          variant="danger"
          onConfirm={() => { demoConfirmModal.onConfirm(); setDemoConfirmModal(null); }}
          onCancel={() => setDemoConfirmModal(null)}
        />
      )}
    </>
    );
  }

  /* --- List view --- */
  return (
    <div>
      {demoConfirmModal && (
        <ConfirmModal
          open
          title={demoConfirmModal.title}
          message={demoConfirmModal.message}
          confirmLabel={demoConfirmModal.confirmLabel}
          variant="danger"
          onConfirm={() => { demoConfirmModal.onConfirm(); setDemoConfirmModal(null); }}
          onCancel={() => setDemoConfirmModal(null)}
        />
      )}
      <div className="section-header">
        <h2>Demo Requests</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="badge badge-muted">{stats.pending} pending</span>
          <span className="badge badge-accent">{stats.sent} sent</span>
          <span className="badge badge-success">{stats.viewed} viewed</span>
        </div>
      </div>

      <div className="search-bar" style={{ marginBottom: '1rem' }}>
        <select
          value={filter}
          onChange={(e) => { setFilter(e.target.value); load(1, e.target.value); }}
          style={{ padding: '0.4rem 0.65rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.875rem' }}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="sent">Sent</option>
          <option value="viewed">Viewed</option>
        </select>
      </div>

      {loading ? (
        <div className="loading-placeholder">Loading demo requests…</div>
      ) : requests.length === 0 ? (
        <div className="empty-state">No demo requests yet.</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td>{r.email}</td>
                    <td>{r.company || '—'}</td>
                    <td>{statusBadge(r.status)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button className="btn-outline" onClick={() => viewRequest(r.id)}>
                          {r.status === 'pending' ? 'Compose' : 'View'}
                        </button>
                        <button className="btn-outline" onClick={() => deleteRequest(r.id)} style={{ color: 'var(--error, #dc2626)' }}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => load(page - 1)}>Previous</button>
            <span>Page {page} of {pages} ({total} requests)</span>
            <button disabled={page >= pages} onClick={() => load(page + 1)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ========================================================================== */
/*  Subscription Requests Tab                                                 */
/* ========================================================================== */

function SubscriptionRequestsTab() {
  const [requests, setRequests] = useState<SubscriptionRequestRow[]>([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, revoked: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPagesCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<SubscriptionRequestDetail | null>(null);
  const [approveResult, setApproveResult] = useState<{
    app: { id: number; name: string; owner_email: string };
    app_admin: { username: string; email: string };
    temp_password: string;
    login_url: string;
    email_sent: boolean;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (p = 1, status = filter) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), per_page: '15' });
    if (status) params.set('status', status);
    const r = await adminApi(`/subscription-requests?${params}`);
    if (r.ok) {
      setRequests(r.data.subscription_requests);
      setStats(r.data.stats);
      setTotal(r.data.total);
      setPage(r.data.page);
      setPagesCount(r.data.pages);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const viewRequest = async (id: number) => {
    setApproveResult(null);
    setError('');
    const r = await adminApi(`/subscription-requests/${id}`);
    if (r.ok) {
      setSelected(r.data.subscription_request as SubscriptionRequestDetail);
    }
  };

  const approveRequest = async (id: number) => {
    setActionLoading(true);
    setError('');
    setApproveResult(null);
    const r = await adminApi(`/subscription-requests/${id}/approve`, { method: 'POST', body: {} });
    setActionLoading(false);
    if (r.ok) {
      setApproveResult({
        app: r.data.app,
        app_admin: r.data.app_admin,
        temp_password: r.data.temp_password,
        login_url: r.data.login_url || '',
        email_sent: r.data.email_sent === true,
      });
      viewRequest(id);
      load(page);
    } else {
      setError(r.data?.error || 'Failed to approve.');
    }
  };

  const [subConfirmModal, setSubConfirmModal] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null);

  const rejectRequest = (id: number) => {
    setSubConfirmModal({
      title: 'Reject subscription request',
      message: 'Reject this subscription request?',
      confirmLabel: 'Reject',
      onConfirm: async () => {
        setActionLoading(true);
        setError('');
        const r = await adminApi(`/subscription-requests/${id}/reject`, { method: 'POST' });
        setActionLoading(false);
        if (r.ok) { setSelected(null); setApproveResult(null); load(page); }
        else setError(r.data?.error || 'Failed to reject.');
      },
    });
  };

  const verifyPayment = async (id: number) => {
    setActionLoading(true);
    setError('');
    const r = await adminApi(`/subscription-requests/${id}/verify-payment`, { method: 'POST' });
    setActionLoading(false);
    if (r.ok) {
      viewRequest(id);
      load(page);
    } else {
      setError(r.data?.error || 'Failed to verify payment.');
    }
  };

  const unverifyPayment = async (id: number) => {
    setActionLoading(true);
    setError('');
    const r = await adminApi(`/subscription-requests/${id}/unverify-payment`, { method: 'POST' });
    setActionLoading(false);
    if (r.ok) {
      viewRequest(id);
      load(page);
    } else {
      setError(r.data?.error || 'Failed to unverify payment.');
    }
  };

  const revokeRequest = (id: number) => {
    setSubConfirmModal({
      title: 'Revoke subscription',
      message: 'Revoke this approved subscription? The app will be deactivated and the app admin will no longer have access.',
      confirmLabel: 'Revoke',
      onConfirm: async () => {
        setActionLoading(true);
        setError('');
        const r = await adminApi(`/subscription-requests/${id}/revoke`, { method: 'POST' });
        setActionLoading(false);
        if (r.ok) {
          viewRequest(id);
          load(page);
        } else {
          setError(r.data?.error || 'Failed to revoke.');
        }
      },
    });
  };

  const viewReceipt = async (id: number, filename: string) => {
    const r = await fetch(`/api/admin/subscription-requests/${id}/receipt`, {
      headers: { 'X-Admin-Secret': getSecret() },
    });
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (w) w.document.title = filename || 'Receipt';
    else URL.revokeObjectURL(url);
  };

  const statusBadge = (s: string) => {
    if (s === 'approved') return <span className="badge badge-success">Approved</span>;
    if (s === 'rejected') return <span className="badge badge-danger">Rejected</span>;
    if (s === 'revoked') return <span className="badge badge-danger">Revoked</span>;
    return <span className="badge badge-muted">Pending</span>;
  };

  const paymentStatusBadge = (s: string) => {
    if (s === 'verified') return <span className="badge badge-success">Verified</span>;
    if (s === 'failed') return <span className="badge badge-danger">Failed</span>;
    return <span className="badge badge-muted">Pending</span>;
  };

  const closeDetail = () => {
    setSelected(null);
    setApproveResult(null);
    setError('');
  };

  if (selected) {
    return (
      <>
      <div>
        <button className="btn-outline" onClick={closeDetail} style={{ marginBottom: '1rem' }}>
          &larr; Back to subscription requests
        </button>

        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.125rem' }}>Review subscription request</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ margin: '0 0 0.25rem', fontWeight: 600 }}>{selected.name}</h3>
              <p style={{ margin: 0 }}>{selected.email}</p>
              {selected.company && <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>Company: {selected.company}</p>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {statusBadge(selected.status)}
              {selected.status === 'pending' && (
                <>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => approveRequest(selected.id)}
                    disabled={actionLoading}
                  >
                    {actionLoading ? 'Approving…' : 'Approve'}
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => rejectRequest(selected.id)}
                    disabled={actionLoading}
                  >
                    Reject
                  </button>
                </>
              )}
              {selected.status === 'approved' && (
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => revokeRequest(selected.id)}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Revoking…' : 'Revoke subscription'}
                </button>
              )}
            </div>
          </div>
          {/* Review plan & payment */}
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <p className="muted" style={{ fontSize: '0.75rem', margin: '0 0 0.35rem', fontWeight: 600 }}>Review plan &amp; payment</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
              <span><strong>Plan:</strong> {(selected.plan_type || 'monthly').charAt(0).toUpperCase() + (selected.plan_type || 'monthly').slice(1)}</span>
              {selected.amount != null && <span><strong>Amount:</strong> {selected.currency === 'NGN' ? '₦' : (selected.currency || '') + ' '}{selected.currency === 'NGN' ? Number(selected.amount).toLocaleString('en-NG', { maximumFractionDigits: 0 }) : selected.amount.toFixed(2)}</span>}
              {selected.payment_reference && <span><strong>Reference:</strong> {selected.payment_reference}</span>}
              {paymentStatusBadge(selected.payment_status || 'pending')}
              {selected.receipt_filename && (
                <button type="button" className="btn-outline btn-sm" onClick={() => viewReceipt(selected.id, selected.receipt_filename || 'receipt')}>
                  View receipt
                </button>
              )}
              {selected.status === 'pending' && selected.payment_status !== 'verified' && (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => verifyPayment(selected.id)} disabled={actionLoading}>
                  Mark payment verified
                </button>
              )}
              {selected.status === 'pending' && selected.payment_status === 'verified' && (
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => unverifyPayment(selected.id)} disabled={actionLoading}>
                  Unverify payment
                </button>
              )}
            </div>
          </div>
          {selected.message && (
            <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <p className="muted" style={{ fontSize: '0.75rem', margin: '0 0 0.35rem', fontWeight: 600 }}>Message:</p>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{selected.message}</p>
            </div>
          )}
          <p className="muted" style={{ fontSize: '0.8125rem', marginTop: '0.75rem' }}>
            Requested {fmtDate(selected.created_at)}
            {selected.reviewed_at && <> &middot; Reviewed {fmtDate(selected.reviewed_at)}</>}
            {selected.app && <> &middot; App: {selected.app.name}</>}
          </p>

          {/* Review approved app admin (when status is approved) */}
          {selected.status === 'approved' && (selected.app || selected.app_admin) && (
            <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--success, #16a34a)' }}>
              <p className="muted" style={{ fontSize: '0.75rem', margin: '0 0 0.35rem', fontWeight: 600, color: 'var(--success, #16a34a)' }}>Approved app admin — review</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                {selected.app && (
                  <>
                    <span><strong>App:</strong> {selected.app.name} (ID: {selected.app.id})</span>
                    <span><strong>Owner email:</strong> {selected.app.owner_email}</span>
                  </>
                )}
                {selected.app_admin && (
                  <>
                    <span><strong>App admin username:</strong> {selected.app_admin.username}</span>
                    <span><strong>App admin email:</strong> {selected.app_admin.email}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {error && <p className="error" style={{ marginBottom: '1rem' }}>{error}</p>}

        {approveResult && (
          <div className="card" style={{ border: '2px solid var(--success, #16a34a)', background: 'var(--surface)' }}>
            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--success, #16a34a)' }}>Approved — app admin can sign in</h3>
            <p className="muted" style={{ fontSize: '0.875rem', margin: '0 0 0.75rem' }}>
              {approveResult.email_sent
                ? 'Login details were sent by email. They sign in at the login URL with username and temporary password, then change password after first login.'
                : 'Email could not be sent. Share the login URL and credentials below with the applicant so they can sign in.'}
            </p>
            <div style={{ display: 'grid', gap: '0.5rem', fontFamily: 'monospace', fontSize: '0.875rem' }}>
              <div>
                <strong>Login URL:</strong>{' '}
                <a href={approveResult.login_url} target="_blank" rel="noopener noreferrer" style={{ wordBreak: 'break-all' }}>{approveResult.login_url}</a>
                {approveResult.login_url && (
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    style={{ marginLeft: '0.5rem' }}
                    onClick={() => navigator.clipboard.writeText(approveResult.login_url)}
                  >
                    Copy
                  </button>
                )}
              </div>
              <div><strong>App:</strong> {approveResult.app.name} (ID: {approveResult.app.id})</div>
              <div><strong>Username:</strong> {approveResult.app_admin.username}</div>
              <div><strong>Email:</strong> {approveResult.app_admin.email}</div>
              <div style={{ marginTop: '0.5rem' }}>
                <strong>Temporary password:</strong>{' '}
                <code style={{ padding: '0.2rem 0.4rem', background: 'var(--bg)', borderRadius: 'var(--radius)', userSelect: 'all' }}>
                  {approveResult.temp_password}
                </code>
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  style={{ marginLeft: '0.5rem' }}
                  onClick={() => navigator.clipboard.writeText(approveResult.temp_password)}
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {subConfirmModal && (
        <ConfirmModal
          open
          title={subConfirmModal.title}
          message={subConfirmModal.message}
          confirmLabel={subConfirmModal.confirmLabel}
          variant="danger"
          onConfirm={() => { subConfirmModal.onConfirm(); setSubConfirmModal(null); }}
          onCancel={() => setSubConfirmModal(null)}
        />
      )}
    </>
    );
  }

  return (
    <div>
      {subConfirmModal && (
        <ConfirmModal
          open
          title={subConfirmModal.title}
          message={subConfirmModal.message}
          confirmLabel={subConfirmModal.confirmLabel}
          variant="danger"
          onConfirm={() => { subConfirmModal.onConfirm(); setSubConfirmModal(null); }}
          onCancel={() => setSubConfirmModal(null)}
        />
      )}
      <div className="section-header">
        <h2>Subscription Requests</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="badge badge-muted">{stats.pending} pending</span>
          <span className="badge badge-success">{stats.approved} approved</span>
          <span className="badge badge-danger">{stats.rejected} rejected</span>
          <span className="badge badge-danger">{stats.revoked ?? 0} revoked</span>
        </div>
      </div>

      <div className="search-bar" style={{ marginBottom: '1rem' }}>
        <select
          value={filter}
          onChange={(e) => { setFilter(e.target.value); load(1, e.target.value); }}
          style={{ padding: '0.4rem 0.65rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.875rem' }}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="revoked">Revoked</option>
        </select>
      </div>

      {loading ? (
        <div className="loading-placeholder">Loading subscription requests…</div>
      ) : requests.length === 0 ? (
        <div className="empty-state">No subscription requests yet.</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td>{r.email}</td>
                    <td>{(r.plan_type || 'monthly').charAt(0).toUpperCase() + (r.plan_type || 'monthly').slice(1)}</td>
                    <td>{r.amount != null ? (r.currency === 'NGN' ? '₦' + Number(r.amount).toLocaleString('en-NG', { maximumFractionDigits: 0 }) : `${r.currency || ''} ${r.amount.toFixed(2)}`) : '—'}</td>
                    <td>{paymentStatusBadge(r.payment_status || 'pending')}</td>
                    <td>{statusBadge(r.status)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                    <td>
                      <button className="btn-outline" onClick={() => viewRequest(r.id)}>
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => load(page - 1)}>Previous</button>
            <span>Page {page} of {pages} ({total} requests)</span>
            <button disabled={page >= pages} onClick={() => load(page + 1)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}
