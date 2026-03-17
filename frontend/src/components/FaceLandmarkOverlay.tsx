'use client';

import { useEffect, useRef, useState } from 'react';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
/** Keep showing last landmarks for this many frames when detection misses (reduces flicker). */
const PERSIST_FRAMES = 10;
/** Blend new landmarks with previous (0 = no smooth, 1 = no update). */
const SMOOTHING = 0.4;

type FaceLandmarkOverlayProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
  className?: string;
  /** Called each frame with whether a face was detected (for auto-capture flows). */
  onFaceDetected?: (detected: boolean) => void;
};

export function FaceLandmarkOverlay({ videoRef, active, className = '', onFaceDetected }: FaceLandmarkOverlayProps) {
  const onFaceDetectedRef = useRef(onFaceDetected);
  onFaceDetectedRef.current = onFaceDetected;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(-1);
  const frameCountRef = useRef<number>(0);
  const faceLandmarkerRef = useRef<{
    detectForVideo: (video: HTMLVideoElement, timeMs: number) => { faceLandmarks: Array<Array<{ x: number; y: number; z?: number }>> };
  } | null>(null);
  const faceOvalConnectionsRef = useRef<Array<{ start: number; end: number }>>([]);
  const lastLandmarksRef = useRef<Array<{ x: number; y: number; z?: number }> | null>(null);
  const smoothedLandmarksRef = useRef<Array<{ x: number; y: number; z?: number }> | null>(null);
  const persistCountRef = useRef<number>(0);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    async function init() {
      try {
        const vision = await import('@mediapipe/tasks-vision');
        const { FaceLandmarker, FilesetResolver } = vision;

        const wasm = await FilesetResolver.forVisionTasks(WASM_URL);
        const faceLandmarker = await FaceLandmarker.createFromOptions(wasm, {
          baseOptions: { modelAssetPath: MODEL_URL },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
        });
        if (cancelled) return;
        faceLandmarkerRef.current = faceLandmarker as unknown as typeof faceLandmarkerRef.current;
        faceOvalConnectionsRef.current = (FaceLandmarker as unknown as { FACE_LANDMARKS_FACE_OVAL: Array<{ start: number; end: number }> }).FACE_LANDMARKS_FACE_OVAL ?? [];
        setReady(true);
      } catch (e) {
        console.warn('Face landmarker init failed:', e);
      }
    }

    init();
    return () => {
      cancelled = true;
      faceLandmarkerRef.current = null;
      setReady(false);
    };
  }, [active]);

  useEffect(() => {
    if (!active || !ready || !videoRef.current || !canvasRef.current || !faceLandmarkerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() {
      if (!videoRef.current || !canvasRef.current) return;
      const v = videoRef.current;
      let w = v.videoWidth;
      let h = v.videoHeight;
      if (!w || !h) {
        w = v.clientWidth || 320;
        h = v.clientHeight || 240;
      }
      if (w && h) {
        canvasRef.current!.width = w;
        canvasRef.current!.height = h;
      }
    }

    function drawLandmarks(
      landmarks: Array<{ x: number; y: number; z?: number }>,
      width: number,
      height: number
    ) {
      if (!ctx) return;
      const connections = faceOvalConnectionsRef.current;
      if (connections.length > 0) {
        ctx.strokeStyle = 'rgba(0, 200, 120, 0.6)';
        ctx.lineWidth = 1.5;
        for (const conn of connections) {
          const a = landmarks[conn.start];
          const b = landmarks[conn.end];
          if (a && b) {
            ctx.beginPath();
            ctx.moveTo(a.x * width, a.y * height);
            ctx.lineTo(b.x * width, b.y * height);
            ctx.stroke();
          }
        }
      }
      ctx.strokeStyle = 'rgba(0, 200, 120, 0.85)';
      ctx.fillStyle = 'rgba(0, 220, 130, 0.7)';
      ctx.lineWidth = 1.5;
      for (const pt of landmarks) {
        const x = pt.x * width;
        const y = pt.y * height;
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    function render() {
      if (!videoRef.current || !canvasRef.current || !faceLandmarkerRef.current) return;
      const v = videoRef.current;
      const c = canvasRef.current;
      if (v.readyState < 2) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      resize();
      const w = c.width;
      const h = c.height;
      if (!w || !h) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      frameCountRef.current += 1;
      const timeMs = v.currentTime > 0 ? v.currentTime * 1000 : frameCountRef.current * (1000 / 30);
      const isNewFrame = timeMs !== lastTimeRef.current;
      lastTimeRef.current = timeMs;

      if (isNewFrame) {
        try {
          const result = faceLandmarkerRef.current.detectForVideo(v, timeMs);
          const detected = !!(result.faceLandmarks && result.faceLandmarks.length > 0);
          onFaceDetectedRef.current?.(detected);
          let toDraw: Array<{ x: number; y: number; z?: number }> | null = null;
          if (result.faceLandmarks && result.faceLandmarks.length > 0) {
            const raw = result.faceLandmarks[0];
            persistCountRef.current = PERSIST_FRAMES;
            lastLandmarksRef.current = raw;
            if (!smoothedLandmarksRef.current || smoothedLandmarksRef.current.length !== raw.length) {
              smoothedLandmarksRef.current = raw.map((p) => ({ x: p.x, y: p.y, z: p.z }));
            } else {
              smoothedLandmarksRef.current = raw.map((p, i) => {
                const s = smoothedLandmarksRef.current![i];
                return {
                  x: s.x + (p.x - s.x) * (1 - SMOOTHING),
                  y: s.y + (p.y - s.y) * (1 - SMOOTHING),
                  z: p.z,
                };
              });
            }
            toDraw = smoothedLandmarksRef.current;
          } else {
            if (persistCountRef.current > 0 && lastLandmarksRef.current) {
              persistCountRef.current -= 1;
              toDraw = smoothedLandmarksRef.current ?? lastLandmarksRef.current;
            } else {
              lastLandmarksRef.current = null;
              smoothedLandmarksRef.current = null;
            }
          }
          ctx.clearRect(0, 0, w, h);
          if (toDraw && toDraw.length > 0) {
            drawLandmarks(toDraw, w, h);
          }
        } catch {
          ctx.clearRect(0, 0, w, h);
        }
      }

      rafRef.current = requestAnimationFrame(render);
    }

    rafRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [active, ready]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
      }}
      aria-hidden
    />
  );
}
