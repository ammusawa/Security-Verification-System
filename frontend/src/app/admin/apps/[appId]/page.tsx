'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  adminApi, getSecret, setSecret, clearSecret,
  fmtDate, levelLabel, stepLabel,
  type AppDetail, type KeyRow, type UserRow, type ActivityRow, type UserDetail,
} from '@/lib/admin';
import { ConfirmModal } from '@/components/ConfirmModal';

/* -------------------------------------------------------------------------- */
/*  Sub-tab type                                                              */
/* -------------------------------------------------------------------------- */
type SubTab = 'overview' | 'users' | 'keys' | 'activity';

/* -------------------------------------------------------------------------- */
/*  Page component                                                            */
/* -------------------------------------------------------------------------- */
export default function AppDetailPage() {
  const params = useParams();
  const router = useRouter();
  const appId = Number(params.appId);

  const [authed, setAuthed] = useState(false);
  const [secretInput, setSecretInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [app, setApp] = useState<AppDetail | null>(null);
  const [stats, setStats] = useState<{ user_count: number; login_attempts_24h: number; active_api_keys: number } | null>(null);
  const [tab, setTab] = useState<SubTab>('overview');

  /* --- Auth gate --------------------------------------------------------- */
  const doLogin = async () => {
    setSecret(secretInput);
    const r = await adminApi(`/apps/${appId}`);
    if (r.ok) {
      setAuthed(true);
      setAuthError('');
    } else {
      setAuthError('Invalid admin secret.');
      clearSecret();
    }
  };

  useEffect(() => {
    if (getSecret()) {
      adminApi(`/apps/${appId}`).then((r) => {
        if (r.ok) setAuthed(true);
        else clearSecret();
      });
    }
  }, [appId]);

  /* --- Load app data ----------------------------------------------------- */
  const loadApp = useCallback(async () => {
    const [appRes, statsRes] = await Promise.all([
      adminApi(`/apps/${appId}`),
      adminApi(`/apps/${appId}/stats`),
    ]);
    if (appRes.ok) setApp(appRes.data.app as AppDetail);
    if (statsRes.ok) setStats(statsRes.data);
  }, [appId]);

  useEffect(() => {
    if (authed) loadApp();
  }, [authed, loadApp]);

  /* --- Auth gate UI ------------------------------------------------------ */
  if (!authed) {
    return (
      <div className="app-shell">
        <nav className="nav">
          <Link href="/" className="brand">SecureAuth</Link>
          <div className="nav-links"><Link href="/admin">Admin</Link></div>
        </nav>
        <div className="main">
          <div className="card" style={{ maxWidth: 400, margin: '2rem auto' }}>
            <h1>Admin Login</h1>
            <p>Enter the admin secret to continue.</p>
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

  if (!app) return <div className="app-shell"><div className="main-wide"><div className="loading-placeholder">Loading app…</div></div></div>;

  return (
    <div className="app-shell">
      <nav className="nav">
        <Link href="/" className="brand">SecureAuth</Link>
        <div className="nav-links">
          <Link href="/admin">Admin</Link>
          <button type="button" className="btn-link" onClick={() => { clearSecret(); setAuthed(false); }}>Log out</button>
        </div>
      </nav>

      <div className="main-wide">
        {/* Breadcrumb */}
        <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          <Link href="/admin" style={{ color: 'var(--text-muted)' }}>Admin</Link>
          <span style={{ margin: '0 0.5rem', color: 'var(--border)' }}>/</span>
          <Link href="/admin" onClick={() => {}} style={{ color: 'var(--text-muted)' }}>Apps</Link>
          <span style={{ margin: '0 0.5rem', color: 'var(--border)' }}>/</span>
          <span style={{ fontWeight: 500 }}>{app.name}</span>
        </div>

        {/* App header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{app.name}</h1>
          <span className={`badge ${app.is_active ? 'badge-success' : 'badge-error'}`}>
            {app.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <p className="muted" style={{ marginBottom: '1.5rem' }}>
          Owner: {app.owner_email} &middot; Created {fmtDate(app.created_at)}
        </p>

        {/* Stat cards */}
        {stats && (
          <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="stat-card">
              <div className="stat-value">{stats.user_count}</div>
              <div className="stat-label">Users</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.active_api_keys}</div>
              <div className="stat-label">Active API Keys</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.login_attempts_24h}</div>
              <div className="stat-label">Logins (24h)</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="tabs">
          {(['overview', 'users', 'keys', 'activity'] as SubTab[]).map((t) => (
            <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'keys' ? 'API Keys' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'overview' && <AppOverviewSection app={app} />}
        {tab === 'users' && <AppUsersSection appId={appId} />}
        {tab === 'keys' && <AppKeysSection appId={appId} appName={app.name} onKeyChange={loadApp} />}
        {tab === 'activity' && <AppActivitySection appId={appId} />}
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Overview section                                                          */
/* ========================================================================== */

function AppOverviewSection({ app }: { app: AppDetail }) {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>App Details</h2>
      <table style={{ fontSize: '0.9375rem', lineHeight: '2' }}>
        <tbody>
          <tr><td style={{ fontWeight: 500, paddingRight: '1.5rem', color: 'var(--text-muted)' }}>ID</td><td>{app.id}</td></tr>
          <tr><td style={{ fontWeight: 500, paddingRight: '1.5rem', color: 'var(--text-muted)' }}>Name</td><td>{app.name}</td></tr>
          <tr><td style={{ fontWeight: 500, paddingRight: '1.5rem', color: 'var(--text-muted)' }}>Owner</td><td>{app.owner_email}</td></tr>
          <tr><td style={{ fontWeight: 500, paddingRight: '1.5rem', color: 'var(--text-muted)' }}>Status</td><td><span className={`badge ${app.is_active ? 'badge-success' : 'badge-error'}`}>{app.is_active ? 'Active' : 'Inactive'}</span></td></tr>
          <tr><td style={{ fontWeight: 500, paddingRight: '1.5rem', color: 'var(--text-muted)' }}>Created</td><td>{fmtDate(app.created_at)}</td></tr>
          <tr><td style={{ fontWeight: 500, paddingRight: '1.5rem', color: 'var(--text-muted)' }}>Users</td><td>{app.user_count}</td></tr>
          <tr><td style={{ fontWeight: 500, paddingRight: '1.5rem', color: 'var(--text-muted)' }}>API Keys</td><td>{app.keys?.length ?? 0} ({app.keys?.filter(k => k.is_active).length ?? 0} active)</td></tr>
        </tbody>
      </table>
    </div>
  );
}

/* ========================================================================== */
/*  Users section                                                             */
/* ========================================================================== */

function AppUsersSection({ appId }: { appId: number }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p = 1, q = search) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), per_page: '15', app_id: String(appId) });
    if (q) params.set('search', q);
    const r = await adminApi(`/users?${params}`);
    if (r.ok) {
      setUsers(r.data.users);
      setTotal(r.data.total);
      setPage(r.data.page);
      setPages(r.data.pages);
    }
    setLoading(false);
  }, [search, appId]);

  useEffect(() => { load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const viewUser = async (id: number) => {
    const r = await adminApi(`/users/${id}`);
    if (r.ok) setSelected(r.data as UserDetail);
  };

  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; confirmLabel: string; variant?: 'danger' | 'primary'; onConfirm: () => void } | null>(null);

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

  /* --- User detail --- */
  if (selected) {
    const u = selected.user;
    return (
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
          </div>
          <p className="muted" style={{ fontSize: '0.8125rem' }}>Registered {fmtDate(u.created_at)}</p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
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
              <thead><tr><th>Date</th><th>Status</th><th>Level</th><th>IP</th><th>Browser</th></tr></thead>
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
              <thead><tr><th>Date</th><th>IP</th><th>Location</th><th>Browser</th></tr></thead>
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
    </div>
    );
  }

  /* --- User list --- */
  return (
    <div>
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
      <div className="search-bar">
        <input
          placeholder="Search users by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(1, search)}
        />
        <button className="btn btn-sm btn-primary" onClick={() => load(1, search)}>Search</button>
      </div>

      {loading ? (
        <div className="loading-placeholder">Loading users…</div>
      ) : users.length === 0 ? (
        <div className="empty-state">No users found for this app.</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Email</th>
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
                      <span className={`badge ${u.has_face ? 'badge-success' : 'badge-muted'}`}>
                        {u.has_face ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(u.created_at)}</td>
                    <td><button className="btn-outline" onClick={() => viewUser(u.id)}>View</button></td>
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
    </div>
  );
}

/* ========================================================================== */
/*  Keys section                                                              */
/* ========================================================================== */

function AppKeysSection({ appId, appName, onKeyChange }: { appId: number; appName: string; onKeyChange: () => void }) {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');

  const loadKeys = useCallback(async () => {
    setLoading(true);
    const r = await adminApi(`/apps/${appId}/keys`);
    if (r.ok) setKeys(r.data.keys);
    setLoading(false);
  }, [appId]);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const generateKey = async () => {
    const r = await adminApi(`/apps/${appId}/keys`, {
      method: 'POST',
      body: { label: newLabel.trim() || 'Generated from dashboard' },
    });
    if (r.ok) {
      setGeneratedKey(r.data.key);
      setNewLabel('');
      loadKeys();
      onKeyChange();
    }
  };

  const [keyConfirmModal, setKeyConfirmModal] = useState<{ prefix: string; onConfirm: () => void } | null>(null);

  const revokeKey = (prefix: string) => {
    setKeyConfirmModal({
      prefix,
      onConfirm: async () => {
        const r = await adminApi(`/apps/${appId}/keys/${prefix}`, { method: 'DELETE' });
        if (r.ok) { loadKeys(); onKeyChange(); }
      },
    });
  };

  return (
    <div>
      {keyConfirmModal && (
        <ConfirmModal
          open
          title="Revoke API key"
          message={`Revoke API key ${keyConfirmModal.prefix}…? This cannot be undone.`}
          confirmLabel="Revoke"
          variant="danger"
          onConfirm={() => { keyConfirmModal.onConfirm(); setKeyConfirmModal(null); }}
          onCancel={() => setKeyConfirmModal(null)}
        />
      )}
      {/* Key display modal */}
      {generatedKey && (
        <div className="modal-backdrop" onClick={() => setGeneratedKey(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>API Key Generated</h2>
            <p>Copy this key now. It will not be shown again.</p>
            <div className="key-display">{generatedKey}</div>
            <p className="muted" style={{ fontSize: '0.8125rem' }}>App: {appName}</p>
            <button
              className="btn btn-primary btnBlock"
              onClick={() => { navigator.clipboard.writeText(generatedKey); setGeneratedKey(null); }}
            >
              Copy &amp; close
            </button>
          </div>
        </div>
      )}

      {/* Generate new key */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ marginTop: 0 }}>Generate New Key</h2>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="formGroup" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
            <label>Label (optional)</label>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Production key"
              onKeyDown={(e) => e.key === 'Enter' && generateKey()}
            />
          </div>
          <button className="btn btn-sm btn-primary" onClick={generateKey} style={{ height: 'fit-content' }}>
            Generate Key
          </button>
        </div>
      </div>

      {/* Keys table */}
      {loading ? (
        <div className="loading-placeholder">Loading keys…</div>
      ) : keys.length === 0 ? (
        <div className="empty-state">No API keys. Generate one above.</div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Prefix</th>
                <th>Label</th>
                <th>Status</th>
                <th>Created</th>
                <th>Revoked</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k, i) => (
                <tr key={`${k.prefix}-${i}`}>
                  <td><code style={{ fontSize: '0.8125rem' }}>{k.prefix}…</code></td>
                  <td>{k.label || <span className="muted">—</span>}</td>
                  <td>
                    <span className={`badge ${k.is_active ? 'badge-success' : 'badge-error'}`}>
                      {k.is_active ? 'Active' : 'Revoked'}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(k.created_at)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{k.revoked_at ? fmtDate(k.revoked_at) : '—'}</td>
                  <td>
                    {k.is_active && (
                      <button className="btn-outline" style={{ color: 'var(--error)' }} onClick={() => revokeKey(k.prefix)}>
                        Revoke
                      </button>
                    )}
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
/*  Activity section                                                          */
/* ========================================================================== */

function AppActivitySection({ appId }: { appId: number }) {
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    const r = await adminApi(`/apps/${appId}/activity?page=${p}&per_page=20`);
    if (r.ok) {
      setActivity(r.data.activity);
      setTotal(r.data.total);
      setPage(r.data.page);
      setPages(r.data.pages);
    }
    setLoading(false);
  }, [appId]);

  useEffect(() => { load(1); }, [load]);

  if (loading) return <div className="loading-placeholder">Loading activity…</div>;

  return (
    <div>
      <div className="section-header">
        <h2>Login Activity</h2>
        <span className="muted">{total} total</span>
      </div>

      {activity.length === 0 ? (
        <div className="empty-state">No login activity for this app yet.</div>
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
