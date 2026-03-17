'use client';

import Link from 'next/link';
import { LandingNav } from '@/components/LandingNav';

export type ResetPasswordVariant = 'success' | 'invalid' | 'form';

export interface ResetPasswordViewProps {
  variant: ResetPasswordVariant;
  error?: string;
  password?: string;
  confirm?: string;
  loading?: boolean;
  onPasswordChange?: (v: string) => void;
  onConfirmChange?: (v: string) => void;
  onSubmit?: (e: React.FormEvent) => void;
}

export function ResetPasswordView(props: ResetPasswordViewProps) {
  const { variant, error = '', password = '', confirm = '', loading = false, onPasswordChange, onConfirmChange, onSubmit } = props;

  return (
    <div className="landing">
      <LandingNav />
      <section className="section">
        <div className="section-inner auth-page-inner">
          {variant === 'success' && (
            <div className="card">
              <h1>Password updated</h1>
              <p>Your password has been reset. You can now sign in with your new password.</p>
              <div className="form-actions" style={{ marginTop: '1rem' }}>
                <Link href="/login" className="btn btn-primary btnBlock">Sign in</Link>
              </div>
            </div>
          )}
          {variant === 'invalid' && (
            <div className="card">
              <h1>Invalid reset link</h1>
              <p className="error">{error}</p>
              <p className="page-footer" style={{ marginTop: '1rem' }}>
                <Link href="/forgot-password">Request a new reset link</Link>
                <span style={{ margin: '0 0.5rem' }}>·</span>
                <Link href="/login">Sign in</Link>
              </p>
            </div>
          )}
          {variant === 'form' && (
            <div>
              <div className="card">
                <h1>Set new password</h1>
                <p>Enter and confirm your new password.</p>
                <form onSubmit={onSubmit}>
                  <div className="formGroup">
                    <label htmlFor="password">New password</label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => onPasswordChange?.(e.target.value)}
                      autoComplete="new-password"
                      minLength={6}
                    />
                  </div>
                  <div className="formGroup">
                    <label htmlFor="confirm">Confirm password</label>
                    <input
                      id="confirm"
                      type="password"
                      value={confirm}
                      onChange={(e) => onConfirmChange?.(e.target.value)}
                      autoComplete="new-password"
                      minLength={6}
                    />
                  </div>
                  {error && <p className="error">{error}</p>}
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary btnBlock" disabled={loading}>
                      {loading ? 'Updating…' : 'Update password'}
                    </button>
                  </div>
                </form>
              </div>
              <p className="page-footer">
                <Link href="/login">Back to sign in</Link>
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
