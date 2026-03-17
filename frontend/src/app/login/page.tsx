'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { LoginPageView, type LoginStep } from './LoginPageView';

function getBrowserGeo(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60000 }
    );
  });
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<LoginStep>('username');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [steps, setSteps] = useState<{ password: boolean; otp: boolean; face: boolean }>({ password: true, otp: false, face: false });
  const [context, setContext] = useState<{ ip_address?: string; user_agent?: string; geo?: any; location_display?: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const consecutiveFaceRef = useRef(0);
  const lastVerifyTimeRef = useRef(0);
  const verifyInProgressRef = useRef(false);
  const loadingRef = useRef(false);
  const FACE_STABLE_FRAMES = 18;
  const FACE_VERIFY_COOLDOWN_MS = 2500;

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    if (step !== 'face' || !navigator.mediaDevices?.getUserMedia) return;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      .then((stream) => { if (videoRef.current) videoRef.current.srcObject = stream; })
      .catch(() => setError('Camera not available'));
  }, [step]);

  const startLogin = useCallback(async () => {
    if (!username.trim()) return;
    setError('');
    setLoading(true);
    const geo = await getBrowserGeo();
    const res = await api('/login/start', { method: 'POST', body: { username: username.trim(), geo: geo || undefined } });
    setLoading(false);
    if (!res.ok) {
      setError(res.data?.error || 'Login start failed');
      return;
    }
    setSessionToken(res.data.session_token);
    setSteps(res.data.steps || { password: true, otp: false, face: false });
    setContext(res.data.context || null);
    setStep('password');
  }, [username]);

  const verifyPassword = useCallback(async () => {
    if (!password || !sessionToken) return;
    setError('');
    setLoading(true);
    const res = await api('/login/verify-password', { method: 'POST', body: { session_token: sessionToken, password } });
    setLoading(false);
    if (!res.ok) {
      setError(res.data?.error || 'Invalid password');
      return;
    }
    if (res.data?.message) setModalMessage(res.data.message);
    if (res.data?.next_step === 'completed') {
      await completeLogin();
      return;
    }
    if (res.data?.require_otp) setStep('otp');
    else if (res.data?.require_face) setStep('face');
    else await completeLogin();
  }, [password, sessionToken]);

  const verifyOtp = useCallback(async () => {
    if (!otp.trim() || !sessionToken) return;
    setError('');
    setLoading(true);
    const res = await api('/login/verify-otp', { method: 'POST', body: { session_token: sessionToken, otp: otp.trim() } });
    setLoading(false);
    if (!res.ok) {
      setError(res.data?.error || 'Invalid OTP');
      return;
    }
    if (res.data?.next_step === 'completed') await completeLogin();
    else if (res.data?.require_face) setStep('face');
    else await completeLogin();
  }, [otp, sessionToken]);

  const completeLogin = useCallback(async () => {
    if (!sessionToken) return;
    const res = await api('/login/complete', { method: 'POST', body: { session_token: sessionToken } });
    if (res.ok && res.data?.redirect) {
      router.push(res.data?.redirect);
      router.refresh();
    } else {
      setError(res.data?.error || 'Could not complete login');
    }
  }, [sessionToken, router]);

  const verifyFace = useCallback(async () => {
    if (!sessionToken || !videoRef.current || !canvasRef.current || verifyInProgressRef.current) return;
    verifyInProgressRef.current = true;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) {
      verifyInProgressRef.current = false;
      return;
    }
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    setLoading(true);
    setError('');
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) {
        setLoading(false);
        verifyInProgressRef.current = false;
        return;
      }
      const fd = new FormData();
      fd.append('image', blob, 'face.jpg');
      const res = await fetch('/api/login/verify-face', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Session-Token': sessionToken },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      setLoading(false);
      verifyInProgressRef.current = false;
      if (res.ok && data.ok) {
        await completeLogin();
      } else {
        setError(data?.error || 'Face verification failed');
      }
    }, 'image/jpeg', 0.9);
  }, [sessionToken, completeLogin]);

  const handleFaceDetected = useCallback((detected: boolean) => {
    if (step !== 'face') return;
    if (loadingRef.current || verifyInProgressRef.current) return;
    if (Date.now() - lastVerifyTimeRef.current < FACE_VERIFY_COOLDOWN_MS) return;
    if (!detected) {
      consecutiveFaceRef.current = 0;
      return;
    }
    consecutiveFaceRef.current += 1;
    if (consecutiveFaceRef.current >= FACE_STABLE_FRAMES) {
      consecutiveFaceRef.current = 0;
      lastVerifyTimeRef.current = Date.now();
      verifyFace();
    }
  }, [step, verifyFace]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (step === 'username') startLogin();
    else if (step === 'password') verifyPassword();
    else if (step === 'otp') verifyOtp();
    else if (step === 'face') verifyFace();
  };

  const handleStepBack = () => {
    if (step === 'password') setStep('username');
    else if (step === 'otp') setStep('password');
    else if (step === 'face') setStep('otp');
    else setStep('password');
  };

  const loc = context?.location_display ?? (context?.geo ? [context.geo.city, context.geo.state, context.geo.country].filter(Boolean).join(', ') || '\u2014' : '\u2014');
  const browserFriendly = (() => {
    const ua = context?.user_agent || '';
    if (!ua) return '\u2014';
    const s = ua.toLowerCase();
    const browser = s.includes('edg/') ? 'Edge' : s.includes('opr/') || s.includes('opera') ? 'Opera' : s.includes('chrome') && !s.includes('chromium') ? 'Chrome' : s.includes('firefox') ? 'Firefox' : s.includes('safari') && !s.includes('chrome') ? 'Safari' : null;
    const os = s.includes('windows nt 10') ? 'Windows 10/11' : s.includes('windows nt 11') ? 'Windows 11' : s.includes('windows') ? 'Windows' : s.includes('mac os x') ? 'macOS' : s.includes('linux') ? 'Linux' : null;
    if (browser && os) return `${browser} on ${os}`;
    if (browser) return browser;
    if (os) return os;
    return ua.slice(0, 50) + (ua.length > 50 ? '\u2026' : '');
  })();

  return (
    <LoginPageView
      step={step}
      username={username}
      password={password}
      otp={otp}
      error={error}
      loading={loading}
      modalMessage={modalMessage}
      context={context}
      loc={loc}
      browserFriendly={browserFriendly}
      videoRef={videoRef}
      canvasRef={canvasRef}
      onUsernameChange={setUsername}
      onPasswordChange={setPassword}
      onOtpChange={setOtp}
      onModalClose={() => setModalMessage(null)}
      onSubmit={handleSubmit}
      onStepBack={handleStepBack}
      onFaceDetected={handleFaceDetected}
    />
  );
}
