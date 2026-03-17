'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { FaceLandmarkOverlay } from './FaceLandmarkOverlay';

const POSE_STEPS = [
  { id: 'center', title: 'Look at the camera', instruction: 'Face the camera directly. We will capture automatically when the face is detected.', label: '1' },
  { id: 'left', title: 'Turn head left', instruction: 'Slowly turn left. Hold still — we will capture automatically.', label: '2' },
  { id: 'right', title: 'Turn head right', instruction: 'Slowly turn right. Hold still — we will capture automatically.', label: '3' },
] as const;

const STABLE_FRAMES = 18;
const COOLDOWN_MS = 2200;

interface FaceRegistrationFlowProps {
  userId: number;
  onComplete: () => void;
  onSkip?: () => void;
}

/**
 * Reusable multi-pose face registration component.
 * Captures 3 poses, sends to /api/setup/face/multi, then calls onComplete.
 */
const isAlreadyRegisteredError = (msg: string) =>
  typeof msg === 'string' && (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already registered to another'));

export function FaceRegistrationFlow({ userId, onComplete, onSkip }: FaceRegistrationFlowProps) {
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [capturedBlobs, setCapturedBlobs] = useState<Blob[]>([]);
  const [done, setDone] = useState(false);
  const [warningModal, setWarningModal] = useState<{ show: boolean; message: string }>({ show: false, message: '' });
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const consecutiveFaceRef = useRef(0);
  const lastCaptureTimeRef = useRef(0);
  const loadingRef = useRef(false);
  const captureInProgressRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => { loadingRef.current = loading; }, [loading]);

  /* Start camera */
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Camera not available on this device.');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setVideoReady(true);
          if (videoRef.current.readyState >= 1) setVideoReady(true);
        }
      })
      .catch(() => setStatus('Camera access denied.'));

    return () => {
      // Stop camera on unmount
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve((r.result as string).split(',')[1] ?? '');
      r.onerror = reject;
      r.readAsDataURL(blob);
    });

  const capturePose = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || captureInProgressRef.current) return;
    captureInProgressRef.current = true;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) { captureInProgressRef.current = false; return; }
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvasRef.current!.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
    });
    if (!blob) { setStatus('Failed to capture image'); captureInProgressRef.current = false; return; }
    setStatus('Checking…');
    setLoading(true);
    try {
      const b64 = await blobToBase64(blob);
      const res = await fetch('/api/check-face', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: b64 }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.face_detected) {
        setCapturedBlobs((prev) => [...prev, blob]);
        setStepIndex((i) => Math.min(i + 1, POSE_STEPS.length));
        setStatus('');
      } else {
        setStatus('Face not detected. Please ensure the face is in the frame.');
      }
    } catch {
      setStatus('Could not verify face. Please try again.');
    } finally {
      setLoading(false);
      captureInProgressRef.current = false;
    }
  }, []);

  const handleFaceDetected = useCallback((detected: boolean) => {
    if (captureInProgressRef.current || loadingRef.current) return;
    if (Date.now() - lastCaptureTimeRef.current < COOLDOWN_MS) return;
    if (!detected) { consecutiveFaceRef.current = 0; return; }
    consecutiveFaceRef.current += 1;
    if (consecutiveFaceRef.current >= STABLE_FRAMES) {
      consecutiveFaceRef.current = 0;
      lastCaptureTimeRef.current = Date.now();
      capturePose();
    }
  }, [capturePose]);

  const finishRegistration = async () => {
    if (capturedBlobs.length === 0) return;
    setLoading(true);
    setStatus('Registering face…');
    try {
      const images = await Promise.all(capturedBlobs.map((b) => blobToBase64(b)));
      const res = await fetch('/api/setup/face/multi', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: String(userId), images }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setStatus('Face registered successfully!');
        setDone(true);
        // Stop camera
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } else {
        const errMsg = data?.error || `Registration failed (${res.status})`;
        if (isAlreadyRegisteredError(errMsg)) {
          setWarningModal({ show: true, message: errMsg });
          setStatus('');
        } else {
          setStatus(errMsg);
        }
        setCapturedBlobs([]); setStepIndex(0);
      }
    } catch {
      setStatus('Network error. Please try again.');
      setCapturedBlobs([]); setStepIndex(0);
    } finally {
      setLoading(false);
    }
  };

  const currentStep = POSE_STEPS[stepIndex];
  const allCaptured = capturedBlobs.length >= POSE_STEPS.length;
  const canCaptureMore = stepIndex < POSE_STEPS.length && !allCaptured && !done;

  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '3rem', height: '3rem', borderRadius: '50%', background: 'var(--success-muted)', color: 'var(--success)', fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>OK</div>
        <p style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Face registered successfully!</p>
        <button className="btn btn-primary" onClick={onComplete}>Done</button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <div className="muted" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
          Step {Math.min(stepIndex + 1, POSE_STEPS.length)} of {POSE_STEPS.length}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {POSE_STEPS.map((step, i) => (
            <div key={step.id} style={{ flex: 1, height: 4, borderRadius: 2, background: i < capturedBlobs.length ? 'var(--accent)' : 'var(--border)' }} />
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
              Hold still — we'll capture when the face is detected.
            </p>
            <button type="button" className="btn btn-secondary" onClick={capturePose} disabled={loading} style={{ marginTop: '0.25rem' }}>
              Capture manually
            </button>
          </>
        )}
        {allCaptured && !done && (
          <button type="button" className="btn btn-primary" onClick={finishRegistration} disabled={loading}>
            {loading ? 'Registering…' : 'Register face'}
          </button>
        )}
        {capturedBlobs.length > 0 && capturedBlobs.length < POSE_STEPS.length && (
          <button type="button" className="btn btn-secondary" onClick={() => { setCapturedBlobs((prev) => prev.slice(0, -1)); setStepIndex(capturedBlobs.length - 1); }} disabled={loading}>
            Redo last
          </button>
        )}
      </div>

      {onSkip && !allCaptured && (
        <div style={{ marginTop: '0.75rem' }}>
          <button type="button" className="btn-link muted" onClick={onSkip} style={{ fontSize: '0.8125rem' }}>
            Skip face registration
          </button>
        </div>
      )}

      {status && (
        <p className={
          status.startsWith('Face not detected') ||
          status.startsWith('Could not verify') ||
          status.includes('different person') ||
          status.toLowerCase().includes('failed')
            ? 'error'
            : 'muted'
        } style={{ marginTop: '0.75rem' }}>
          {status}
        </p>
      )}

      {warningModal.show && (
        <div
          className="face-warning-modal-overlay"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="face-warning-modal-title"
          onClick={() => setWarningModal({ show: false, message: '' })}
        >
          <div
            className="face-warning-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="face-warning-modal-icon" aria-hidden>⚠</div>
            <h2 id="face-warning-modal-title" className="face-warning-modal-title">Face already registered</h2>
            <p className="face-warning-modal-message">{warningModal.message}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setWarningModal({ show: false, message: '' })}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
