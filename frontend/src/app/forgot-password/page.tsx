'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { LandingNav } from '@/components/LandingNav';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Enter your email address.');
      return;
    }
    setLoading(true);
    const res = await api('/forgot-password', { method: 'POST', body: { email: email.trim() } });
    setLoading(false);
    if (!res.ok) {
      setError(res.data?.error || 'Request failed');
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="landing">
        <LandingNav />
        <section className="section">
          <div className="section-inner auth-page-inner">
            <div className="card">
              <h1>Check your email</h1>
              <p>If an account exists for that email, we sent a password reset link. It expires in 1 hour.</p>
              <p className="muted">Didn’t get it? Check spam or <button type="button" className="btn-link" onClick={() => { setSent(false); setEmail(''); }}>try again</button>.</p>
            </div>
            <p className="page-footer">
              <Link href="/login">Back to sign in</Link>
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="landing">
      <LandingNav />
      <section className="section">
        <div className="section-inner auth-page-inner">
          <div className="card">
            <h1>Forgot password</h1>
            <p>Enter the email for your account and we’ll send a reset link.</p>
            <form onSubmit={handleSubmit}>
              <div className="formGroup">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </div>
              {error && <p className="error">{error}</p>}
              <div className="form-actions">
                <button type="submit" className="btn btn-primary btnBlock" disabled={loading}>
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </div>
            </form>
          </div>
          <p className="page-footer">
            <Link href="/login">Back to sign in</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
