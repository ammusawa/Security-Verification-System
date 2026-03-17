'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FaceLandmarkOverlay } from '@/components/FaceLandmarkOverlay';

const POSE_STEPS = [
  { id: 'center', title: 'Look at the camera', instruction: 'Face the camera directly. We’ll capture automatically when your face is detected.', label: '1' },
  { id: 'left', title: 'Turn your head left', instruction: 'Slowly turn your head left. Hold still — we’ll capture automatically.', label: '2' },
  { id: 'right', title: 'Turn your head right', instruction: 'Slowly turn your head right. Hold still — we’ll capture automatically.', label: '3' },
] as const;

const STABLE_FRAMES = 18;
const COOLDOWN_MS = 2200;

const isAlreadyRegisteredError = (msg: string) =>
  typeof msg === 'string' && (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already registered to another'));

export default function SetupMfaPage() {
  const params = useParams();
  const userId = params.userId as string;
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [warningModal, setWarningModal] = useState<{ show: boolean; message: string }>({ show: false, message: '' });
  const [videoReady, setVideoReady] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [capturedBlobs, setCapturedBlobs] = useState<Blob[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const consecutiveFaceRef = useRef(0);
  const lastCaptureTimeRef = useRef(0);
  const loadingRef = useRef(false);
  const captureInProgressRef = useRef(false);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    if (!userId || !navigator.mediaDevices?.getUserMedia) return;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 } })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setVideoReady(true);
          if (videoRef.current.readyState >= 1) setVideoReady(true);
        }
      })
      .catch(() => setStatus('Camera access denied. You can register your face later.'));
  }, [userId]);

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve((r.result as string).split(',')[1] ?? '');
      r.onerror = reject;
      r.readAsDataURL(blob);
    });

  const capturePose = async () => {
    if (!videoRef.current || !canvasRef.current || captureInProgressRef.current) return;
    captureInProgressRef.current = true;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) {
      captureInProgressRef.current = false;
      return;
    }
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvasRef.current!.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
    });
    if (!blob) {
      setStatus('Failed to capture image');
      captureInProgressRef.current = false;
      return;
    }
    setStatus('Checking…');
    setLoading(true);
    try {
      const b64 = await blobToBase64(blob);
      const res = await fetch('/api/check-face', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: b64 }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.face_detected) {
        setCapturedBlobs((prev) => [...prev, blob]);
        setStepIndex((i) => Math.min(i + 1, POSE_STEPS.length));
        setStatus('');
      } else {
        setStatus('Face not detected. Please ensure your face is in the frame.');
      }
    } catch {
      setStatus('Could not verify face. Please try again.');
    } finally {
      setLoading(false);
      captureInProgressRef.current = false;
    }
  };

  const handleFaceDetected = (detected: boolean) => {
    if (capturedBlobs.length >= POSE_STEPS.length) return;
    if (loadingRef.current || captureInProgressRef.current) return;
    if (Date.now() - lastCaptureTimeRef.current < COOLDOWN_MS) return;
    if (!detected) {
      consecutiveFaceRef.current = 0;
      return;
    }
    consecutiveFaceRef.current += 1;
    if (consecutiveFaceRef.current >= STABLE_FRAMES) {
      consecutiveFaceRef.current = 0;
      lastCaptureTimeRef.current = Date.now();
      capturePose();
    }
  };

  const finishRegistration = async () => {
    if (capturedBlobs.length === 0 || !userId) return;
    setLoading(true);
    setStatus('Registering…');
    try {
      const images = await Promise.all(capturedBlobs.map((b) => blobToBase64(b)));
      const res = await fetch('/api/setup/face/multi', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, images }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setStatus('Face registered successfully. You can sign in now.');
      } else {
        const errMsg = data?.error || `Registration failed (${res.status})`;
        if (isAlreadyRegisteredError(errMsg)) {
          setWarningModal({ show: true, message: errMsg });
          setStatus('');
        } else {
          setStatus(errMsg);
        }
        setCapturedBlobs([]);
        setStepIndex(0);
      }
    } catch {
      setStatus('Network error. Please try again.');
      setCapturedBlobs([]);
      setStepIndex(0);
    } finally {
      setLoading(false);
    }
  };

  const currentStep = POSE_STEPS[stepIndex];
  const allCaptured = capturedBlobs.length >= POSE_STEPS.length;
  const canCaptureMore = stepIndex < POSE_STEPS.length && !allCaptured;

  return (
    <div className="app-shell">
      <div className="main">
        <nav className="nav">
          <Link href="/" className="brand">SecureAuth</Link>
          <div className="nav-links">
            <Link href="/login">Login</Link>
            <Link href="/register">Register</Link>
          </div>
        </nav>
        <div className="card">
          <h1>Complete setup</h1>
          <p>We’ll capture your face from a few angles so sign-in works reliably. OTP will be sent to your email when you sign in from a new device or location.</p>
          <h2>Face registration</h2>

          <div style={{ marginBottom: '1rem' }}>
            <div className="muted" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              Step {Math.min(stepIndex + 1, POSE_STEPS.length)} of {POSE_STEPS.length}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {POSE_STEPS.map((step, i) => (
                <div
                  key={step.id}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    background: i < capturedBlobs.length ? 'var(--accent)' : 'var(--border)',
                  }}
                  aria-hidden
                />
              ))}
            </div>
            {currentStep && (
              <div style={{ padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: 'var(--radius)', marginBottom: '1rem' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '1.75rem', height: '1.75rem', borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: '0.8125rem', fontWeight: 700, marginRight: '0.5rem' }}>{currentStep.label}</span>
                <strong>{currentStep.title}</strong>
                <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.875rem' }}>{currentStep.instruction}</p>
              </div>
            )}
          </div>

          <div style={{ position: 'relative', display: 'inline-block' }}>
            <video ref={videoRef} width={320} height={240} autoPlay playsInline muted className="face-capture" />
            <FaceLandmarkOverlay videoRef={videoRef} active={videoReady && canCaptureMore} onFaceDetected={handleFaceDetected} />
          </div>
          <canvas ref={canvasRef} width={320} height={240} style={{ display: 'none' }} />

          <div className="form-actions" style={{ marginTop: '1rem' }}>
            {canCaptureMore && (
              <>
                <p className="muted" style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                  Hold still — we’ll capture when your face is detected.
                </p>
                <button type="button" className="btn btn-secondary" onClick={capturePose} disabled={loading} style={{ marginTop: '0.25rem' }}>
                  Capture manually
                </button>
              </>
            )}
            {allCaptured && (
              <button type="button" className="btn btn-primary" onClick={finishRegistration} disabled={loading}>
                {loading ? 'Registering…' : 'Finish registration'}
              </button>
            )}
            {capturedBlobs.length > 0 && capturedBlobs.length < POSE_STEPS.length && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setCapturedBlobs((prev) => prev.slice(0, -1)); setStepIndex(capturedBlobs.length - 1); }}
                disabled={loading}
              >
                Redo last
              </button>
            )}
          </div>
          {status && (
            <p
              className={status.startsWith('Face not detected') || status.startsWith('Could not verify') ? 'error' : 'muted'}
              style={{ marginTop: '0.75rem' }}
            >
              {status}
            </p>
          )}

          {warningModal.show && (
            <div
              className="face-warning-modal-overlay"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="face-warning-modal-title-setup"
              onClick={() => setWarningModal({ show: false, message: '' })}
            >
              <div className="face-warning-modal" onClick={(e) => e.stopPropagation()}>
                <div className="face-warning-modal-icon" aria-hidden>⚠</div>
                <h2 id="face-warning-modal-title-setup" className="face-warning-modal-title">Face already registered</h2>
                <p className="face-warning-modal-message">{warningModal.message}</p>
                <button type="button" className="btn btn-primary" onClick={() => setWarningModal({ show: false, message: '' })}>
                  OK
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="page-footer">
          <Link href="/login">Go to sign in</Link>
        </p>
      </div>
    </div>
  );
}
