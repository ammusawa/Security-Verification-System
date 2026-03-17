'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { LandingNav } from '@/components/LandingNav';

type Plan = { id: string; label: string; interval: string; amount: number; currency: string; description: string };

/* ── Subscribe: plans (monthly/yearly) + account & payment + receipt ─── */
function SubscribeSection() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('monthly');
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '', payment_reference: '' });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/subscription-plans')
      .then((r) => r.json())
      .then((d) => { if (d.plans) setPlans(d.plans); })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const hasReceipt = receiptFile && receiptFile.size > 0;
      if (hasReceipt) {
        const fd = new FormData();
        fd.append('name', form.name);
        fd.append('email', form.email);
        if (form.company) fd.append('company', form.company);
        if (form.message) fd.append('message', form.message);
        fd.append('plan_type', selectedPlanId);
        if (form.payment_reference) fd.append('payment_reference', form.payment_reference);
        fd.append('receipt', receiptFile!);
        const res = await fetch('/api/subscription-request', { method: 'POST', body: fd });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) setSubmitted(true);
        else setError(data.error || 'Something went wrong. Please try again.');
      } else {
        const res = await fetch('/api/subscription-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            company: form.company || undefined,
            message: form.message || undefined,
            plan_type: selectedPlanId,
            payment_reference: form.payment_reference || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) setSubmitted(true);
        else setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  return (
    <section className="section section-alt" id="subscribe">
      <div className="section-inner">
        <p className="section-tag">Plans</p>
        <h2 className="section-title">Subscribe as an app admin</h2>
        <p className="section-desc">
          Choose a plan, add your account and payment details, and upload a receipt for validation. A system admin will review and approve your subscription.
        </p>

        {/* Plan selection: Monthly / Yearly */}
        {plans.length > 0 && (
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2rem' }}>
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlanId(plan.id)}
                className="role-card"
                style={{
                  minWidth: 200,
                  maxWidth: 260,
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: selectedPlanId === plan.id ? '2px solid var(--primary, #2563eb)' : '1px solid var(--border)',
                  background: selectedPlanId === plan.id ? 'var(--surface)' : undefined,
                }}
              >
                <div className="role-label">{plan.label}</div>
                <p style={{ margin: '0.5rem 0', fontSize: '1.5rem', fontWeight: 700 }}>
                  {plan.currency === 'NGN' ? '₦' : plan.currency + ' '}
                  {plan.currency === 'NGN' ? Number(plan.amount).toLocaleString('en-NG', { maximumFractionDigits: 0 }) : plan.amount.toFixed(2)}
                  <span className="muted" style={{ fontSize: '0.875rem', fontWeight: 400 }}>/{plan.interval === 'year' ? 'yr' : 'mo'}</span>
                </p>
                <p className="muted" style={{ fontSize: '0.8125rem', margin: 0 }}>{plan.description}</p>
              </button>
            ))}
          </div>
        )}

        {/* Account details + payment + receipt form */}
        <div className="demo-form-wrapper" id="subscribe-form">
          {submitted ? (
            <div className="demo-success">
              <div className="demo-success-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <h3>Request received</h3>
              <p>Your subscription request and payment details have been submitted. An admin will verify your receipt and approve. You&apos;ll receive login and app access by email once approved.</p>
            </div>
          ) : (
            <>
              <h3 style={{ marginBottom: '0.5rem', fontSize: '1.125rem' }}>Account &amp; payment details</h3>
              <p className="muted" style={{ marginBottom: '1.25rem', fontSize: '0.9375rem' }}>
                {selectedPlan && `Selected: ${selectedPlan.label} — ${selectedPlan.currency === 'NGN' ? '₦' : selectedPlan.currency + ' '}${selectedPlan.currency === 'NGN' ? Number(selectedPlan.amount).toLocaleString('en-NG', { maximumFractionDigits: 0 }) : selectedPlan.amount.toFixed(2)} ${selectedPlan.interval === 'year' ? '/ year' : '/ month'}. Add your payment reference and optionally upload a receipt for validation.`}
              </p>
              <form className="demo-form" onSubmit={handleSubmit}>
                {error && <p className="error" style={{ marginBottom: '1rem', textAlign: 'center' }}>{error}</p>}
                <div className="demo-form-grid">
                  <div className="formGroup">
                    <label htmlFor="sub-name">Full name</label>
                    <input
                      id="sub-name"
                      type="text"
                      placeholder="Jane Doe"
                      required
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="formGroup">
                    <label htmlFor="sub-email">Email</label>
                    <input
                      id="sub-email"
                      type="email"
                      placeholder="jane@company.com"
                      required
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                  <div className="formGroup">
                    <label htmlFor="sub-company">Company (optional)</label>
                    <input
                      id="sub-company"
                      type="text"
                      placeholder="Acme Inc."
                      value={form.company}
                      onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                    />
                  </div>
                  <div className="formGroup demo-full-width">
                    <label htmlFor="sub-message">Message (optional)</label>
                    <textarea
                      id="sub-message"
                      rows={2}
                      placeholder="Brief use case or team size..."
                      value={form.message}
                      onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                    />
                  </div>
                  <div className="formGroup">
                    <label htmlFor="sub-payment-ref">Payment reference / Invoice #</label>
                    <input
                      id="sub-payment-ref"
                      type="text"
                      placeholder="e.g. INV-12345 or bank transfer ref"
                      value={form.payment_reference}
                      onChange={(e) => setForm((f) => ({ ...f, payment_reference: e.target.value }))}
                    />
                  </div>
                  <div className="formGroup">
                    <label htmlFor="sub-receipt">Receipt (optional, for validation)</label>
                    <input
                      id="sub-receipt"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                      style={{ fontSize: '0.875rem' }}
                    />
                    <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>PDF, PNG, JPG, WebP — max 10 MB</p>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary btn-lg" disabled={sending}>
                  {sending ? 'Submitting...' : 'Submit subscription request'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/* ── Request Demo Form Component ───────────────────────────────────── */
function RequestDemoSection() {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setSubmitted(true);
      } else {
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="section section-alt" id="request-demo">
      <div className="section-inner">
        <p className="section-tag">Demo</p>
        <h2 className="section-title">See SecureAuth in action</h2>
        <p className="section-desc">
          Fill in the form below and our team will reach out to schedule a personalized walkthrough of the platform.
        </p>

        <div className="demo-form-wrapper">
          {submitted ? (
            <div className="demo-success">
              <div className="demo-success-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <h3>Thank you!</h3>
              <p>We have received your request. Our team will get back to you within 24 hours.</p>
            </div>
          ) : (
            <form className="demo-form" onSubmit={handleSubmit}>
              {error && <p className="error" style={{ marginBottom: '1rem', textAlign: 'center' }}>{error}</p>}
              <div className="demo-form-grid">
                <div className="formGroup">
                  <label htmlFor="demo-name">Full name</label>
                  <input
                    id="demo-name"
                    type="text"
                    placeholder="Jane Doe"
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="formGroup">
                  <label htmlFor="demo-email">Work email</label>
                  <input
                    id="demo-email"
                    type="email"
                    placeholder="jane@company.com"
                    required
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="formGroup">
                  <label htmlFor="demo-company">Company</label>
                  <input
                    id="demo-company"
                    type="text"
                    placeholder="Acme Inc."
                    required
                    value={form.company}
                    onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                  />
                </div>
                <div className="formGroup demo-full-width">
                  <label htmlFor="demo-message">How can we help?</label>
                  <textarea
                    id="demo-message"
                    rows={4}
                    placeholder="Tell us about your use case, team size, or any questions..."
                    value={form.message}
                    onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary btn-lg" disabled={sending}>
                {sending ? 'Sending...' : 'Request a demo'}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="landing">
      <LandingNav />

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-inner">
          <span className="hero-badge">Auth-as-a-Service</span>
          <h1>Identity verification<br />that adapts to risk</h1>
          <p className="hero-sub">
            Context-aware, multi-factor authentication combining <strong>passwords</strong>,
            <strong> email OTP</strong>, and <strong>facial recognition</strong> — all behind a single API.
            Protect your users without slowing them down.
          </p>
          <div className="hero-actions">
            <Link href="/register" className="btn btn-primary btn-lg">Create free account</Link>
            <a href="#subscribe" className="btn btn-secondary btn-lg">Request app access</a>
          </div>
          <div className="hero-stats">
            <div className="hero-stat"><span>3-Factor</span>Auth</div>
            <div className="hero-stat-sep" />
            <div className="hero-stat"><span>Context</span>Aware</div>
            <div className="hero-stat-sep" />
            <div className="hero-stat"><span>Real-time</span>Face ID</div>
            <div className="hero-stat-sep" />
            <div className="hero-stat"><span>REST</span>API</div>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────── */}
      <section className="section" id="features">
        <div className="section-inner">
          <p className="section-tag">Features</p>
          <h2 className="section-title">Everything you need to secure authentication</h2>
          <p className="section-desc">
            Built from the ground up for modern apps. One platform replaces passwords-only, SMS OTP services, and third-party face-ID SDKs.
          </p>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>
              </div>
              <h3>Adaptive MFA</h3>
              <p>Intelligently steps up verification — password only from trusted contexts, full 3-factor from new devices or locations.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <h3>Facial Recognition</h3>
              <p>Multi-pose face enrollment with real-time landmark detection. Works in-browser with no native SDK required.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              </div>
              <h3>Email OTP</h3>
              <p>Time-limited one-time codes delivered to the user's verified email. No SMS costs, no phone number required.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
              </div>
              <h3>Context-Aware</h3>
              <p>IP geolocation, device fingerprinting, and browser analysis. Trusted contexts reduce friction for returning users.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              </div>
              <h3>API Key Management</h3>
              <p>Generate, rotate, and revoke API keys per application. Hashed storage with prefix-based fast lookup.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 8h2m2 0h2"/></svg>
              </div>
              <h3>Multi-Tenant</h3>
              <p>Isolate user pools per application. Each tenant gets its own admin, users, keys, and activity dashboard.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────── */}
      <section className="section section-alt" id="how-it-works">
        <div className="section-inner">
          <p className="section-tag">How it works</p>
          <h2 className="section-title">Secure login in three steps</h2>
          <p className="section-desc">
            The verification level adapts automatically. Trusted users breeze through; unknown contexts trigger additional factors.
          </p>
          <div className="steps-row">
            <div className="step-card">
              <div className="step-num">1</div>
              <h3>Password</h3>
              <p>User enters their credentials. We capture context — IP, device, geolocation — and check against trusted history.</p>
            </div>
            <div className="step-arrow">&mdash;</div>
            <div className="step-card">
              <div className="step-num">2</div>
              <h3>Email OTP</h3>
              <p>If the context is unfamiliar, a time-limited verification code is sent to the user's registered email.</p>
            </div>
            <div className="step-arrow">&mdash;</div>
            <div className="step-card">
              <div className="step-num">3</div>
              <h3>Face Verification</h3>
              <p>For high-risk scenarios, the user verifies their identity with a quick face scan — matched against their enrolled data.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Integration ───────────────────────────────────────────────── */}
      <section className="section" id="integration">
        <div className="section-inner">
          <p className="section-tag">Integration</p>
          <h2 className="section-title">Add secure auth in minutes</h2>
          <p className="section-desc">
            A clean REST API with JWT tokens. Integrate with any stack — React, Vue, mobile, or server-to-server.
          </p>
          <div className="code-showcase">
            <div className="code-tabs">
              <span className="code-tab active">Start login</span>
              <span className="code-tab">Verify</span>
              <span className="code-tab">Get user</span>
            </div>
            <pre className="code-block">{`// Start a login session
const res = await fetch('https://your-domain/api/v1/login/start', {
  method: 'POST',
  headers: {
    'X-API-Key': 'sk_live_your_api_key',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ username: 'jane' }),
});

const { session_token, steps } = await res.json();
// steps → { password: true, otp: true, face: false }
// Proceed through each required step…`}</pre>
          </div>
          <div className="integration-features">
            <div className="int-feat">
              <strong>JWT Tokens</strong>
              <span>Access + refresh tokens, standard Bearer auth</span>
            </div>
            <div className="int-feat">
              <strong>Versioned API</strong>
              <span>/api/v1/* with full OpenAPI 3.0 spec</span>
            </div>
            <div className="int-feat">
              <strong>Rate Limiting</strong>
              <span>Built-in per-key rate limits to prevent abuse</span>
            </div>
            <div className="int-feat">
              <strong>Swagger Docs</strong>
              <span>Interactive documentation at /api/docs</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Roles ─────────────────────────────────────────────────────── */}
      <section className="section section-alt">
        <div className="section-inner">
          <p className="section-tag">Admin</p>
          <h2 className="section-title">Dashboards for every role</h2>
          <p className="section-desc">
            Super admins oversee the entire platform. App admins manage their own tenant — users, API keys, and activity — from a dedicated dashboard.
          </p>
          <div className="roles-grid">
            <div className="role-card">
              <div className="role-label">Super Admin</div>
              <ul>
                <li>Global overview &amp; analytics</li>
                <li>Create and manage tenant apps</li>
                <li>Provision app admins &amp; users</li>
                <li>Generate &amp; revoke API keys</li>
                <li>Monitor login activity across all tenants</li>
              </ul>
            </div>
            <div className="role-card">
              <div className="role-label">App Admin</div>
              <ul>
                <li>App-scoped dashboard &amp; stats</li>
                <li>Add users with face enrollment</li>
                <li>Manage API keys for their app</li>
                <li>View login activity &amp; trusted contexts</li>
                <li>Reset user face data</li>
              </ul>
            </div>
            <div className="role-card">
              <div className="role-label">End User</div>
              <ul>
                <li>Adaptive login experience</li>
                <li>Password + OTP + face when required</li>
                <li>Trusted device recognition</li>
                <li>Frictionless return visits</li>
                <li>Self-service face enrollment</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Subscribe (App Admin) ─────────────────────────────────────── */}
      <SubscribeSection />

      {/* ── Request Demo ─────────────────────────────────────────────── */}
      <RequestDemoSection />

      {/* ── CTA ───────────────────────────────────────────────────────── */}
      <section className="cta-section">
        <div className="section-inner" style={{ textAlign: 'center' }}>
          <h2>Ready to secure your application?</h2>
          <p>Get started for free. No credit card required.</p>
          <div className="hero-actions" style={{ justifyContent: 'center' }}>
            <Link href="/register" className="btn btn-primary btn-lg">Create an account</Link>
            <Link href="/login" className="btn btn-secondary btn-lg">Sign in</Link>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="footer-brand">
            <strong>SecureAuth</strong>
            <span>Context-aware multi-factor authentication as a service.</span>
          </div>
          <div className="footer-links">
            <div>
              <h4>Product</h4>
              <a href="#features">Features</a>
              <a href="#how-it-works">How it works</a>
              <a href="#integration">API Integration</a>
              <a href="#subscribe">Subscribe</a>
              <a href="#request-demo">Request Demo</a>
            </div>
            <div>
              <h4>Access</h4>
              <Link href="/login">Sign in</Link>
              <Link href="/register">Register</Link>
              <Link href="/admin">Admin</Link>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          &copy; {new Date().getFullYear()} SecureAuth. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
