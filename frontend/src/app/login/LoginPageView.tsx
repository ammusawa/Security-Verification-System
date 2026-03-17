'use client';

import Link from 'next/link';
import { FaceLandmarkOverlay } from '@/components/FaceLandmarkOverlay';
import { LandingNav } from '@/components/LandingNav';

export type LoginStep = 'username' | 'password' | 'otp' | 'face';

export interface LoginPageViewProps {
  step: LoginStep;
  username: string;
  password: string;
  otp: string;
  error: string;
  loading: boolean;
  modalMessage: string | null;
  context: { ip_address?: string; user_agent?: string; geo?: any; location_display?: string } | null;
  loc: string;
  browserFriendly: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onUsernameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onOtpChange: (v: string) => void;
  onModalClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onStepBack: () => void;
  onFaceDetected: (detected: boolean) => void;
}

export function LoginPageView(props: LoginPageViewProps) {
  const {
    step,
    username,
    password,
    otp,
    error,
    loading,
    modalMessage,
    context,
    loc,
    browserFriendly,
    videoRef,
    canvasRef,
    onUsernameChange,
    onPasswordChange,
    onOtpChange,
    onModalClose,
    onSubmit,
    onStepBack,
    onFaceDetected,
  } = props;

  return (
    <div className="landing">
      {modalMessage && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={onModalClose}
        >
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2 id="modal-title">Check your email</h2>
            <p>{modalMessage}</p>
            <button type="button" className="btn btn-primary btnBlock" onClick={onModalClose}>
              OK
            </button>
          </div>
        </div>
      )}
      <LandingNav />
      <section className="section">
        <div className="section-inner auth-page-inner">
          <div className="card">
            <h1>Sign in</h1>
            <p>Context-aware verification: password, then OTP (email) or face when required by device or location.</p>
            {context && (
              <div className="context-strip">
                <strong>Context</strong>
                <span className="sep">·</span>
                <span>IP {context.ip_address || '—'}</span>
                <span className="sep">·</span>
                <span>Location {loc}</span>
                <span className="sep">·</span>
                <span title={context.user_agent || undefined}>Browser {browserFriendly}</span>
              </div>
            )}
            <form onSubmit={onSubmit}>
              {step === 'username' && (
                <div className="formGroup">
                  <label htmlFor="username">Username</label>
                  <input id="username" type="text" value={username} onChange={(e) => onUsernameChange(e.target.value)} autoComplete="username" required />
                </div>
              )}
              {step === 'password' && (
                <div className="formGroup">
                  <label htmlFor="password">Password</label>
                  <input id="password" type="password" value={password} onChange={(e) => onPasswordChange(e.target.value)} autoComplete="current-password" />
                </div>
              )}
              {step === 'otp' && (
                <div className="formGroup">
                  <label htmlFor="otp">Verification code (check your email)</label>
                  <input id="otp" type="text" value={otp} onChange={(e) => onOtpChange(e.target.value)} placeholder="6 digits" maxLength={8} autoComplete="one-time-code" />
                </div>
              )}
              {step === 'face' && (
                <div>
                  <p className="muted" style={{ marginBottom: '0.5rem' }}>Look at the camera. We&apos;ll verify automatically when your face is detected.</p>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <video ref={videoRef} width={320} height={240} autoPlay playsInline muted className="face-capture" />
                    <FaceLandmarkOverlay videoRef={videoRef} active={true} onFaceDetected={onFaceDetected} />
                  </div>
                  <canvas ref={canvasRef} width={320} height={240} style={{ display: 'none' }} />
                </div>
              )}
              {error && <p className="error">{error}</p>}
              <div className="form-actions">
                {step === 'face' && (
                  <p className="muted" style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>Hold still — verifying automatically.</p>
                )}
                <button type="submit" className="btn btn-primary btnBlock" disabled={loading}>
                  {step === 'username' ? 'Continue' : step === 'face' ? 'Verify manually' : 'Verify'}
                </button>
                {step !== 'username' && (
                  <button type="button" className="btn btn-secondary btnBlock" onClick={onStepBack}>
                    Back
                  </button>
                )}
              </div>
            </form>
          </div>
          <p className="page-footer">
            <Link href="/forgot-password">Forgot password?</Link>
            <span style={{ margin: '0 0.5rem' }}>·</span>
            <Link href="/register">Create account</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
