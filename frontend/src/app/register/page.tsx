'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { LandingNav } from '@/components/LandingNav';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !email.trim() || !password) {
      setError('Username, email and password are required.');
      return;
    }
    setLoading(true);
    const res = await api('/register', { method: 'POST', body: { username: username.trim(), email: email.trim(), password } });
    setLoading(false);
    if (!res.ok) {
      setError(res.data?.error || 'Registration failed');
      return;
    }
    router.push(`/setup-mfa/${res.data.user_id}`);
    router.refresh();
  };

  return (
    <div className="landing">
      <LandingNav />
      <section className="section">
        <div className="section-inner auth-page-inner">
          <div className="card">
          <h1>Create account</h1>
          <p>Register with username, email, and password. You’ll complete security setup next.</p>
          <form onSubmit={handleSubmit}>
            <div className="formGroup">
              <label htmlFor="username">Username</label>
              <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </div>
            <div className="formGroup">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="formGroup">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </div>
            {error && <p className="error">{error}</p>}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary btnBlock" disabled={loading}>Create account</button>
            </div>
          </form>
          </div>
          <p className="page-footer">
            <Link href="/login">Already have an account? Sign in</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
