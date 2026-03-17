'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { LandingNav } from '@/components/LandingNav';
import { FaceLandmarkOverlay } from '@/components/FaceLandmarkOverlay';

interface DemoData {
  name: string;
  subject: string;
  content: string;
  sent_at: string | null;
}

type WalkthroughStep = 'intro' | 'dashboard' | 'users' | 'api-keys' | 'auth-password' | 'auth-otp' | 'auth-face' | 'api' | 'finish';

function generateOtp(): string {
  return Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join('');
}

/* ========================================================================== */
/*  Page                                                                      */
/* ========================================================================== */

export default function DemoViewerPage() {
  const params = useParams();
  const token = params.token as string;
  const [demo, setDemo] = useState<DemoData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/demo/${token}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) setDemo(data);
        else setError(data.error || 'Demo not found.');
      })
      .catch(() => setError('Could not load demo.'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="landing">
      <LandingNav />
      <section className="section" style={{ minHeight: '60vh' }}>
        <div className="section-inner" style={{ maxWidth: 780 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '4rem 0' }}><p className="muted">Loading your demo...</p></div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '4rem 0' }}>
              <div className="demo-error-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
              </div>
              <h2 style={{ marginTop: '1rem' }}>{error}</h2>
              <p className="muted" style={{ marginBottom: '2rem' }}>This demo may not be available yet or the link may have expired.</p>
              <Link href="/#request-demo" className="btn btn-primary btn-lg">Request a new demo</Link>
            </div>
          ) : demo ? (
            <Walkthrough demo={demo} />
          ) : null}
        </div>
      </section>
      <footer className="landing-footer">
        <div className="footer-bottom">&copy; {new Date().getFullYear()} SecureAuth. All rights reserved.</div>
      </footer>
    </div>
  );
}

/* ========================================================================== */
/*  Walkthrough                                                               */
/* ========================================================================== */

const ALL_STEPS: { id: WalkthroughStep; label: string; group: string }[] = [
  { id: 'dashboard',     label: 'Dashboard',      group: 'Your Admin Panel' },
  { id: 'users',         label: 'User Management', group: 'Your Admin Panel' },
  { id: 'api-keys',      label: 'API Keys',       group: 'Your Admin Panel' },
  { id: 'auth-password',  label: 'Password',       group: 'User Auth Flow' },
  { id: 'auth-otp',       label: 'Email OTP',      group: 'User Auth Flow' },
  { id: 'auth-face',      label: 'Face Verify',    group: 'User Auth Flow' },
  { id: 'api',            label: 'API Integration', group: 'Developer' },
  { id: 'finish',         label: 'Get Started',    group: '' },
];

function Walkthrough({ demo }: { demo: DemoData }) {
  const [step, setStep] = useState<WalkthroughStep>('intro');
  const idx = ALL_STEPS.findIndex((s) => s.id === step);

  const goNext = () => {
    if (step === 'intro') { setStep('dashboard'); return; }
    if (idx < ALL_STEPS.length - 1) setStep(ALL_STEPS[idx + 1].id);
  };
  const goPrev = () => {
    if (idx > 0) setStep(ALL_STEPS[idx - 1].id);
    else setStep('intro');
  };

  return (
    <div>
      {/* Header */}
      <div className="demo-viewer-header">
        <span className="hero-badge" style={{ marginBottom: '1rem' }}>Product Walkthrough</span>
        <h1 style={{ fontSize: 'clamp(1.5rem, 3.5vw, 2rem)', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 0.5rem' }}>
          {demo.subject}
        </h1>
        <p className="muted" style={{ fontSize: '1rem' }}>
          Prepared for <strong style={{ color: 'var(--text)' }}>{demo.name}</strong>
          {demo.sent_at && <> &middot; {new Date(demo.sent_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</>}
        </p>
      </div>

      {/* Progress */}
      {step !== 'intro' && <StepProgress current={step} onJump={setStep} />}

      {/* Steps */}
      {step === 'intro'        && <IntroStep demo={demo} onStart={goNext} />}
      {step === 'dashboard'    && <DashboardStep onNext={goNext} onPrev={goPrev} name={demo.name} />}
      {step === 'users'        && <UsersStep onNext={goNext} onPrev={goPrev} />}
      {step === 'api-keys'     && <ApiKeysStep onNext={goNext} onPrev={goPrev} />}
      {step === 'auth-password' && <AuthPasswordStep onNext={goNext} onPrev={goPrev} name={demo.name} />}
      {step === 'auth-otp'     && <AuthOtpStep onNext={goNext} onPrev={goPrev} name={demo.name} />}
      {step === 'auth-face'    && <AuthFaceStep onNext={goNext} onPrev={goPrev} />}
      {step === 'api'          && <ApiStep onNext={goNext} onPrev={goPrev} />}
      {step === 'finish'       && <FinishStep name={demo.name} onPrev={goPrev} />}
    </div>
  );
}

/* ── Progress ───────────────────────────────────────────────────────── */

function StepProgress({ current, onJump }: { current: WalkthroughStep; onJump: (s: WalkthroughStep) => void }) {
  const idx = ALL_STEPS.findIndex((s) => s.id === current);
  let lastGroup = '';
  return (
    <div className="demo-wt-progress">
      {ALL_STEPS.map((s, i) => {
        const showGroup = s.group && s.group !== lastGroup;
        lastGroup = s.group;
        return (
          <div key={s.id} style={{ display: 'contents' }}>
            {showGroup && <div className="demo-wt-group-label">{s.group}</div>}
            <button
              className={`demo-wt-pip ${i < idx ? 'done' : i === idx ? 'active' : ''}`}
              onClick={() => onJump(s.id)}
              title={s.label}
            >
              <span className="demo-wt-pip-dot">{i < idx ? '\u2713' : i + 1}</span>
              <span className="demo-wt-pip-label">{s.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ── Navigation buttons helper ──────────────────────────────────────── */

function NavButtons({ onPrev, onNext, nextLabel = 'Next' }: { onPrev?: () => void; onNext?: () => void; nextLabel?: string }) {
  return (
    <div className="demo-wt-nav">
      {onPrev ? <button className="btn btn-secondary" onClick={onPrev}>&larr; Back</button> : <span />}
      {onNext && <button className="btn btn-primary" onClick={onNext}>{nextLabel} &rarr;</button>}
    </div>
  );
}

/* ========================================================================== */
/*  INTRO                                                                     */
/* ========================================================================== */

function IntroStep({ demo, onStart }: { demo: DemoData; onStart: () => void }) {
  return (
    <div className="demo-sim-card">
      <div className="demo-sim-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" /></svg>
      </div>
      <h2>Welcome to your SecureAuth walkthrough</h2>
      {demo.content && (
        <div className="demo-viewer-content" style={{ textAlign: 'left', padding: '1rem 0' }} dangerouslySetInnerHTML={{ __html: demo.content }} />
      )}
      <p className="muted" style={{ margin: '0.75rem 0 0.25rem' }}>This interactive demo will walk you through:</p>
      <div className="demo-wt-checklist">
        <div><strong>Your App Admin Dashboard</strong> — Overview, user management, and API key generation</div>
        <div><strong>End-User Authentication</strong> — The 3-step login your users will experience</div>
        <div><strong>API Integration</strong> — How to connect SecureAuth to your application</div>
      </div>
      <button className="btn btn-primary btn-lg" onClick={onStart} style={{ marginTop: '1.5rem' }}>
        Start walkthrough
      </button>
    </div>
  );
}

/* ========================================================================== */
/*  ADMIN PANEL: Dashboard                                                    */
/* ========================================================================== */

function DashboardStep({ onNext, onPrev, name }: { onNext: () => void; onPrev: () => void; name: string }) {
  const company = name.split(' ')[0] + "'s App";
  return (
    <div className="demo-sim-card" style={{ textAlign: 'left' }}>
      <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
        <div className="demo-sim-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
        </div>
        <h2>Your App Admin Dashboard</h2>
        <p className="muted">When you subscribe, you get a dedicated admin panel for your application. Here is what it looks like.</p>
      </div>

      {/* Simulated dashboard */}
      <div className="demo-wt-panel">
        <div className="demo-wt-panel-nav">
          <span className="demo-wt-panel-brand">SecureAuth</span>
          <span className="badge badge-accent">App Admin</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.8125rem' }}>{company}</span>
        </div>
        <div className="demo-wt-panel-tabs">
          <span className="active">Overview</span>
          <span>Users</span>
          <span>API Keys</span>
          <span>Activity</span>
        </div>
        <div className="demo-wt-panel-body">
          <div className="demo-wt-stats">
            <div className="demo-wt-stat"><div className="stat-value">124</div><div className="stat-label">Total Users</div></div>
            <div className="demo-wt-stat"><div className="stat-value">89</div><div className="stat-label">Faces Enrolled</div></div>
            <div className="demo-wt-stat"><div className="stat-value">3</div><div className="stat-label">Active API Keys</div></div>
            <div className="demo-wt-stat"><div className="stat-value">47</div><div className="stat-label">Logins (24h)</div></div>
          </div>
          <div className="demo-wt-note">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
            This is your dedicated dashboard — fully scoped to your application. You manage your own users, API keys, and see login activity.
          </div>
        </div>
      </div>
      <NavButtons onPrev={onPrev} onNext={onNext} nextLabel="User Management" />
    </div>
  );
}

/* ========================================================================== */
/*  ADMIN PANEL: Users                                                        */
/* ========================================================================== */

function UsersStep({ onNext, onPrev }: { onNext: () => void; onPrev: () => void }) {
  return (
    <div className="demo-sim-card" style={{ textAlign: 'left' }}>
      <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
        <div className="demo-sim-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
        </div>
        <h2>User Management</h2>
        <p className="muted">Add users, enroll their faces, and manage access — all from your dashboard.</p>
      </div>

      <div className="demo-wt-panel">
        <div className="demo-wt-panel-tabs">
          <span>Overview</span>
          <span className="active">Users</span>
          <span>API Keys</span>
          <span>Activity</span>
        </div>
        <div className="demo-wt-panel-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <strong>All Users (124)</strong>
            <span className="badge badge-accent" style={{ cursor: 'default' }}>+ New User</span>
          </div>
          <table className="demo-wt-table">
            <thead><tr><th>Username</th><th>Email</th><th>Face</th><th>Registered</th></tr></thead>
            <tbody>
              <tr><td style={{ fontWeight: 500 }}>sarah_jones</td><td>sarah@company.com</td><td><span className="badge badge-success">Enrolled</span></td><td>Jan 15, 2026</td></tr>
              <tr><td style={{ fontWeight: 500 }}>mike_chen</td><td>mike@company.com</td><td><span className="badge badge-success">Enrolled</span></td><td>Jan 18, 2026</td></tr>
              <tr><td style={{ fontWeight: 500 }}>lisa_kumar</td><td>lisa@company.com</td><td><span className="badge badge-muted">Pending</span></td><td>Feb 02, 2026</td></tr>
              <tr><td style={{ fontWeight: 500 }}>john_doe</td><td>john@company.com</td><td><span className="badge badge-success">Enrolled</span></td><td>Feb 05, 2026</td></tr>
            </tbody>
          </table>
          <div className="demo-wt-note">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
            Create users with a guided face enrollment flow. Users who haven't enrolled their face will be prompted to do so on first login.
          </div>
        </div>
      </div>
      <NavButtons onPrev={onPrev} onNext={onNext} nextLabel="API Keys" />
    </div>
  );
}

/* ========================================================================== */
/*  ADMIN PANEL: API Keys                                                     */
/* ========================================================================== */

function ApiKeysStep({ onNext, onPrev }: { onNext: () => void; onPrev: () => void }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="demo-sim-card" style={{ textAlign: 'left' }}>
      <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
        <div className="demo-sim-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
        </div>
        <h2>API Key Management</h2>
        <p className="muted">Generate API keys to integrate SecureAuth into your application. Keys are hashed — shown only once on creation.</p>
      </div>

      <div className="demo-wt-panel">
        <div className="demo-wt-panel-tabs">
          <span>Overview</span>
          <span>Users</span>
          <span className="active">API Keys</span>
          <span>Activity</span>
        </div>
        <div className="demo-wt-panel-body">
          <table className="demo-wt-table">
            <thead><tr><th>Prefix</th><th>Label</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              <tr><td><code>sk_live_</code></td><td>Production</td><td><span className="badge badge-success">Active</span></td><td>Jan 12, 2026</td></tr>
              <tr><td><code>sk_live_</code></td><td>Staging</td><td><span className="badge badge-success">Active</span></td><td>Jan 20, 2026</td></tr>
              <tr><td><code>sk_live_</code></td><td>Old key</td><td><span className="badge badge-error">Revoked</span></td><td>Dec 01, 2025</td></tr>
            </tbody>
          </table>

          {/* Simulated key generation */}
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            {!revealed ? (
              <button className="btn btn-sm btn-primary" onClick={() => setRevealed(true)}>
                + Generate New Key (try it)
              </button>
            ) : (
              <div style={{ padding: '0.75rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginTop: '0.5rem' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 600, margin: '0 0 0.35rem' }}>New API Key (copy now — shown once):</p>
                <code style={{ fontSize: '0.8125rem', wordBreak: 'break-all', color: 'var(--accent)' }}>sk_live_dEm0kEy_xR4nD0mV4Lu3sH3r3...</code>
              </div>
            )}
          </div>

          <div className="demo-wt-note" style={{ marginTop: '1rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
            API keys authenticate requests to the SecureAuth REST API. Use them server-side — never expose in client code.
          </div>
        </div>
      </div>
      <NavButtons onPrev={onPrev} onNext={onNext} nextLabel="See User Auth Flow" />
    </div>
  );
}

/* ========================================================================== */
/*  AUTH FLOW: Password                                                       */
/* ========================================================================== */

function AuthPasswordStep({ onNext, onPrev, name }: { onNext: () => void; onPrev: () => void; name: string }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const [hint, setHint] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) { setHint('Please enter both fields.'); return; }
    setChecking(true); setHint('');
    setTimeout(() => { setChecking(false); onNext(); }, 1200);
  };

  return (
    <div className="demo-sim-card">
      <div className="demo-wt-section-label">User Authentication Flow</div>
      <div className="demo-sim-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /><circle cx="12" cy="16" r="1" /></svg>
      </div>
      <h2>Step 1: Password Verification</h2>
      <p className="muted" style={{ margin: '0.5rem 0 0.25rem' }}>
        Your users sign in with their credentials. SecureAuth captures the login context — IP, device, location — and calculates a risk level to decide which additional factors are needed.
      </p>
      <p className="muted" style={{ fontSize: '0.8125rem', marginBottom: '1.25rem' }}>Try it below — enter any username and password.</p>

      <form onSubmit={handleSubmit} style={{ maxWidth: 360, margin: '0 auto', textAlign: 'left' }}>
        <div className="formGroup">
          <label htmlFor="demo-user">Username</label>
          <input id="demo-user" type="text" placeholder={name.split(' ')[0].toLowerCase() || 'janedoe'} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="formGroup">
          <label htmlFor="demo-pass">Password</label>
          <input id="demo-pass" type="password" placeholder="Enter any password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {hint && <p className="error" style={{ fontSize: '0.875rem' }}>{hint}</p>}
        <button type="submit" className="btn btn-primary btnBlock" disabled={checking}>
          {checking ? 'Verifying credentials...' : 'Sign in'}
        </button>
      </form>

      <div className="demo-sim-context">
        <p style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.35rem' }}>Context captured automatically:</p>
        <div className="demo-sim-context-grid">
          <span>IP</span><span>192.168.1.x</span>
          <span>Device</span><span>{typeof navigator !== 'undefined' ? (navigator.userAgent.includes('Windows') ? 'Windows PC' : navigator.userAgent.includes('Mac') ? 'MacOS' : 'Desktop') : 'Desktop'}</span>
          <span>Risk</span><span style={{ color: 'var(--accent)' }}>Medium — new device detected</span>
        </div>
      </div>
      <NavButtons onPrev={onPrev} />
    </div>
  );
}

/* ========================================================================== */
/*  AUTH FLOW: OTP                                                            */
/* ========================================================================== */

function AuthOtpStep({ onNext, onPrev, name }: { onNext: () => void; onPrev: () => void; name: string }) {
  const [otp] = useState(() => generateOtp());
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [hint, setHint] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() !== otp) { setHint(`Incorrect. The code is ${otp} (shown above).`); return; }
    setChecking(true); setHint('');
    setTimeout(() => { setChecking(false); onNext(); }, 1000);
  };

  return (
    <div className="demo-sim-card">
      <div className="demo-wt-section-label">User Authentication Flow</div>
      <div className="demo-sim-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
      </div>
      <h2>Step 2: Email OTP Verification</h2>
      <p className="muted" style={{ margin: '0.5rem 0 1rem' }}>
        Because this device isn't trusted, SecureAuth sends a time-limited one-time code to the user's email. No SMS costs, no phone number needed.
      </p>

      <div className="demo-sim-email">
        <div className="demo-sim-email-header">
          <strong>From:</strong> noreply@secureauth.io<br />
          <strong>To:</strong> {name.split(' ')[0].toLowerCase()}@company.com<br />
          <strong>Subject:</strong> Your login verification code
        </div>
        <div className="demo-sim-email-body">
          <p>Hello {name.split(' ')[0]},</p>
          <p>Your one-time verification code is:</p>
          <div className="demo-sim-otp-display">{otp}</div>
          <p className="muted" style={{ fontSize: '0.8125rem' }}>This code expires in 10 minutes.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: 320, margin: '1.25rem auto 0', textAlign: 'left' }}>
        <div className="formGroup">
          <label htmlFor="demo-otp">Enter the code above</label>
          <input id="demo-otp" type="text" maxLength={6} placeholder="6-digit code" value={input}
            onChange={(e) => setInput(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus
            style={{ textAlign: 'center', fontSize: '1.25rem', letterSpacing: '0.3em' }} />
        </div>
        {hint && <p className="error" style={{ fontSize: '0.875rem' }}>{hint}</p>}
        <button type="submit" className="btn btn-primary btnBlock" disabled={checking}>
          {checking ? 'Verifying...' : 'Verify code'}
        </button>
      </form>
      <NavButtons onPrev={onPrev} />
    </div>
  );
}

/* ========================================================================== */
/*  AUTH FLOW: Face                                                           */
/* ========================================================================== */

function AuthFaceStep({ onNext, onPrev }: { onNext: () => void; onPrev: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camReady, setCamReady] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [verified, setVerified] = useState(false);
  const consecutiveRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.onloadedmetadata = () => setCamReady(true); }
      }).catch(() => {});
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const handleFaceDetected = useCallback((detected: boolean) => {
    if (verified) return;
    if (!detected) { consecutiveRef.current = 0; setDetecting(false); return; }
    consecutiveRef.current += 1;
    if (consecutiveRef.current > 5) setDetecting(true);
    if (consecutiveRef.current >= 25) {
      setVerified(true);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setTimeout(onNext, 1500);
    }
  }, [verified, onNext]);

  return (
    <div className="demo-sim-card">
      <div className="demo-wt-section-label">User Authentication Flow</div>
      <div className="demo-sim-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
      </div>
      <h2>Step 3: Facial Verification</h2>
      <p className="muted" style={{ margin: '0.5rem 0 1.25rem' }}>
        For high-risk contexts, SecureAuth activates the camera and matches the user's face against their enrolled data using real-time landmarks. Look at the camera — the green overlay shows live detection.
      </p>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', display: 'inline-block', borderRadius: 'var(--radius)', overflow: 'hidden', border: verified ? '3px solid var(--success, #16a34a)' : '3px solid var(--border)' }}>
          <video ref={videoRef} width={320} height={240} autoPlay playsInline muted style={{ display: 'block' }} />
          <FaceLandmarkOverlay videoRef={videoRef} active={camReady && !verified} onFaceDetected={handleFaceDetected} />
          {verified && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
              <span style={{ marginTop: '0.5rem', fontWeight: 700, fontSize: '1.125rem' }}>Face verified</span>
            </div>
          )}
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: '1rem' }}>
        {!camReady && !verified && <p className="muted">Starting camera...</p>}
        {camReady && !verified && !detecting && <p className="muted">Position your face in the frame...</p>}
        {camReady && !verified && detecting && <p style={{ color: 'var(--accent)', fontWeight: 600 }}>Face detected — verifying...</p>}
        {verified && <p style={{ color: 'var(--success, #16a34a)', fontWeight: 600 }}>Identity confirmed!</p>}
      </div>
      {!verified && (
        <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
          <button type="button" className="btn-link muted" onClick={onNext} style={{ fontSize: '0.8125rem' }}>Skip (camera not available)</button>
        </div>
      )}
      {!verified && <NavButtons onPrev={onPrev} />}
    </div>
  );
}

/* ========================================================================== */
/*  API Integration                                                           */
/* ========================================================================== */

function ApiStep({ onNext, onPrev }: { onNext: () => void; onPrev: () => void }) {
  return (
    <div className="demo-sim-card" style={{ textAlign: 'left' }}>
      <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
        <div className="demo-sim-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
        </div>
        <h2>API Integration</h2>
        <p className="muted">Integrate SecureAuth into any stack with our REST API. Here's how a typical login flow looks in code.</p>
      </div>

      <div className="demo-wt-code-block">
        <div className="demo-wt-code-title">1. Start a login session</div>
        <pre>{`POST /api/v1/login/start
Headers: { "X-API-Key": "sk_live_your_key" }
Body:    { "username": "sarah_jones" }

Response: {
  "session_token": "tok_abc123...",
  "steps": { "password": true, "otp": true, "face": false }
}`}</pre>
      </div>

      <div className="demo-wt-code-block">
        <div className="demo-wt-code-title">2. Verify each required step</div>
        <pre>{`POST /api/v1/login/verify-password
Body: { "session_token": "tok_abc123...", "password": "..." }

POST /api/v1/login/verify-otp
Body: { "session_token": "tok_abc123...", "code": "482917" }`}</pre>
      </div>

      <div className="demo-wt-code-block">
        <div className="demo-wt-code-title">3. Complete login and receive JWT</div>
        <pre>{`POST /api/v1/login/complete
Body: { "session_token": "tok_abc123..." }

Response: {
  "access_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci...",
  "user": { "id": 42, "username": "sarah_jones" }
}`}</pre>
      </div>

      <div className="demo-wt-note">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
        Full OpenAPI 3.0 docs are available at <code>/api/docs</code>. Supports JWT access + refresh tokens, rate limiting, and versioned endpoints.
      </div>
      <NavButtons onPrev={onPrev} onNext={onNext} nextLabel="Finish" />
    </div>
  );
}

/* ========================================================================== */
/*  Finish                                                                    */
/* ========================================================================== */

function FinishStep({ name, onPrev }: { name: string; onPrev: () => void }) {
  return (
    <div className="demo-sim-card" style={{ textAlign: 'center' }}>
      <div className="demo-sim-success-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
      </div>
      <h2 style={{ margin: '1rem 0 0.5rem' }}>That's SecureAuth</h2>
      <p className="muted" style={{ margin: '0 0 1.5rem', maxWidth: 500, marginInline: 'auto' }}>
        {name}, you've just experienced everything your team and users will get: a dedicated admin dashboard, multi-factor authentication with facial recognition, and a clean REST API to integrate it all.
      </p>

      <div className="demo-wt-summary">
        <div className="demo-wt-summary-item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
          <div><strong>App Admin Dashboard</strong><span>Manage users, keys, and activity</span></div>
        </div>
        <div className="demo-wt-summary-item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          <div><strong>3-Factor Auth</strong><span>Password + OTP + Face verification</span></div>
        </div>
        <div className="demo-wt-summary-item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
          <div><strong>REST API</strong><span>JWT tokens, versioned, rate-limited</span></div>
        </div>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>Ready to secure your application?</h3>
        <p className="muted" style={{ marginBottom: '1.25rem' }}>Get started in minutes. No credit card required.</p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/register" className="btn btn-primary btn-lg">Create free account</Link>
          <Link href="/#integration" className="btn btn-secondary btn-lg">View API docs</Link>
        </div>
      </div>
      <NavButtons onPrev={onPrev} />
    </div>
  );
}
