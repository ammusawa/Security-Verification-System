'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { ResetPasswordView, type ResetPasswordVariant } from './ResetPasswordView';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) setError('Missing reset link. Request a new one from the login page.');
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token) return;
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const res = await api('/reset-password', { method: 'POST', body: { token, new_password: password } });
    setLoading(false);
    if (!res.ok) {
      setError(res.data?.error || 'Reset failed');
      return;
    }
    setSuccess(true);
  };

  let variant: ResetPasswordVariant = 'form';
  if (success) variant = 'success';
  else if (!token) variant = 'invalid';

  return (
    <ResetPasswordView
      variant={variant}
      error={error}
      password={password}
      confirm={confirm}
      loading={loading}
      onPasswordChange={setPassword}
      onConfirmChange={setConfirm}
      onSubmit={handleSubmit}
    />
  );
}
