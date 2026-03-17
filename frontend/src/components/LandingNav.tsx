'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export function LandingNav() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: number; username: string; email: string; role?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/me').then((res) => {
      setLoading(false);
      if (res.ok && res.data?.user) {
        setUser(res.data.user);
      } else {
        setUser(null);
      }
    });
  }, []);

  const logout = async () => {
    await api('/logout', { method: 'POST' });
    setUser(null);
    router.push('/');
    router.refresh();
  };

  return (
    <nav className="landing-nav">
      <div className="landing-nav-inner">
        <Link href="/" className="brand">SecureAuth</Link>
        <div className="landing-nav-links">
          <a href="/#features">Features</a>
          <a href="/#how-it-works">How it works</a>
          <a href="/#integration">Integrate</a>
          <a href="/#request-demo">Request Demo</a>
          {loading ? (
            <span className="landing-nav-placeholder" />
          ) : user ? (
            <>
              {user.role === 'super_admin' && <Link href="/admin">Admin</Link>}
              {user.role === 'app_admin' && <Link href="/app-admin">Dashboard</Link>}
              {user.role === 'user' && <Link href="/dashboard">Dashboard</Link>}
              <button type="button" className="btn btn-sm btn-secondary" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-sm btn-secondary">Sign in</Link>
              <Link href="/register" className="btn btn-sm btn-primary">Get started</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
