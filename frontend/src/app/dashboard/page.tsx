'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { LandingNav } from '@/components/LandingNav';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: number; username: string; email: string; role?: string; app_name?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/me').then((res) => {
      setLoading(false);
      if (res.ok && res.data?.user) {
        const u = res.data.user;
        // Redirect role-specific users to their own dashboards
        if (u.role === 'app_admin') { router.push('/app-admin'); return; }
        if (u.role === 'super_admin') { router.push('/admin'); return; }
        setUser(u);
      } else {
        router.push('/login');
        router.refresh();
      }
    });
  }, [router]);

  if (loading) {
    return (
      <div className="landing">
        <LandingNav />
        <section className="section">
          <div className="section-inner auth-page-inner">
            <div className="loading-placeholder">Loading…</div>
          </div>
        </section>
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="landing">
      <LandingNav />
      <section className="section">
        <div className="section-inner auth-page-inner">
          <div className="card">
          <h1>Welcome, {user.username}</h1>
          <p>You’re signed in with context-aware multi-factor verification.</p>
          <ul>
            <li><strong>What you know:</strong> password</li>
            <li><strong>What you have:</strong> OTP (email)</li>
            <li><strong>Who you are:</strong> facial recognition</li>
          </ul>
          <p className="muted" style={{ marginTop: '1rem' }}>
            From a new device or location we may ask for OTP and/or face verification.
          </p>
          </div>
        </div>
      </section>
    </div>
  );
}
