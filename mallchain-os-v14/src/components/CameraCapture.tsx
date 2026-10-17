/**
 * CameraCapture — a one-shot camera capture widget for KYC document
 * uploads. Lets the user either take a live photo of the ID (front or
 * back, depending on `side`) with their phone or laptop camera, or fall
 * back to a regular file picker when no camera is available, the user
 * declines permission, or the captured image is unreadable.
 *
 * Why a dedicated component instead of inline in KycSession: the camera
 * lifecycle (getUserMedia stream, canvas snapshot, stream cleanup on
 * unmount, retry with a fresh stream on "Retake") is enough bookkeeping
 * that duplicating it for front + back would double the chance of
 * leaving a camera indicator on after navigation. Keeping it here means
 * the stream starts/stops on mount/unmount exactly once per side.
 *
 * Output is always a `File`, not a data URL — that matches what
 * /api/kyc/document already accepts, and lets the existing upload path
 * do MIME-byte-level validation server-side instead of trusting a base64
 * string that round-trips through TextEncoder.
 *
 * Browser caveats:
 *   - getUserMedia is only available in secure contexts (HTTPS or
 *     localhost). Production frontend is HTTPS; localhost dev works.
 *   - Permission state is "denied" after the first refusal until the user
 *     changes it in browser settings; we surface this so the file fallback
 *     is obvious instead of silently looping back to the permission
 *     prompt.
 *   - iOS Safari may report camera as "environment" only on specific OS
 *     versions; we try environment first then fall back to any camera
 *     rather than crashing if "environment" is unsupported.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, RefreshCw, Upload, X } from 'lucide-react';
import './CameraCapture.css';

type CaptureMode = 'idle' | 'streaming' | 'captured' | 'upload-fallback';

export interface CameraCaptureProps {
  /** Which ID side this slot is for — drives default camera facing and
   *  the label shown above the preview. */
  side: 'front' | 'back';
  /** A user-supplied file (from the file-picker fallback) — kept separate
   *  from the captured-blob path so review can show provenance. */
  file: File | null;
  /** A captured photo Blob (from the camera path) — non-null implies the
   *  user pressed the shutter rather than picked a file. */
  capturedBlob: Blob | null;
  /** Whether the upload widget should show its loading spinner. */
  uploading?: boolean;
  /** Inline error message (validation/upload failure, permission denied). */
  error?: string;
  /** Short caption explaining what the camera should see. */
  hint?: string;
  /** Whether the slot has been completed (already uploaded, name known). */
  fileName?: string;
  onCapture: (blob: Blob, fileName: string) => void;
  onFile: (file: File) => void;
  onClear: () => void;
  /** Disable interactions while the parent is sending the upload. */
  disabled?: boolean;
}

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];

function blobToFile(blob: Blob, name: string): File {
  // Camera snapshots are always PNG by canvas.toBlob default; renaming
  // matters for the multer fileFilter + the user-facing "what did I
  // upload?" label later in the wizard summary.
  return new File([blob], name, { type: blob.type || 'image/png' });
}

function todayStamp(): string {
  // YYYYMMDD-HHmmss in local time — fine for a user-facing filename,
  // collisions across seconds during one wizard are unlikely.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export default function CameraCapture({
  side,
  file,
  capturedBlob,
  uploading,
  error,
  hint,
  fileName,
  onCapture,
  onFile,
  onClear,
  disabled,
}: CameraCaptureProps) {
  const [mode, setMode] = useState<CaptureMode>(capturedBlob || file ? 'upload-fallback' : 'idle');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Tear down the stream on unmount OR when transitioning away from
  // 'streaming' — leaving a getUserMedia stream alive past component
  // unmount leaves the camera indicator light stuck on the OS. The
  // dependency on `mode` is what catches the "user just captured an
  // image" transition.
  useEffect(() => () => stopStream(), [stopStream]);
  useEffect(() => {
    if (mode !== 'streaming') stopStream();
  }, [mode, stopStream]);

  const startStream = useCallback(async () => {
    setStreamError(null);
    setPermissionDenied(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setStreamError('This browser does not support camera capture — use the upload option below.');
      setMode('upload-fallback');
      return;
    }
    try {
      // Prefer the rear camera on phones (the one you'd use to photograph
      // a physical ID). On laptops the spec just returns the built-in
      // webcam. Falling back to the user camera is what keeps iOS Safari
      // happy when it refuses "environment".
      const constraints: MediaStreamConstraints = {
        video: { facingMode: { ideal: side === 'back' ? 'environment' : 'environment' } },
        audio: false,
      };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setMode('streaming');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/Permission|NotAllowed/i.test(msg)) {
        setPermissionDenied(true);
        setStreamError('Camera permission was denied. You can still upload a saved photo or scan.');
      } else {
        setStreamError(`Camera unavailable: ${msg}. You can still upload a saved photo or scan.`);
      }
      setMode('upload-fallback');
    }
  }, [side]);

  const snap = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      setStreamError('Camera frame not ready — try again in a moment.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setStreamError('Could not capture the frame — try again or upload a file instead.');
      return;
    }
    ctx.drawImage(video, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png', 0.92)
    );
    if (!blob) {
      setStreamError('Capture failed — try again or upload a file instead.');
      return;
    }
    if (blob.size > MAX_BYTES) {
      setStreamError(`Image is too large (${Math.round(blob.size / 1024 / 1024)} MB) — keep each ID photo under 10 MB.`);
      return;
    }
    const file = blobToFile(blob, `id-${side}-${todayStamp()}.png`);
    onCapture(blob, file.name);
    setMode('captured');
  }, [onCapture, side]);

  const previewUrl = useMemo(() => {
    if (mode === 'captured' && capturedBlob) return URL.createObjectURL(capturedBlob);
    if (mode === 'upload-fallback' && capturedBlob) return URL.createObjectURL(capturedBlob);
    return null;
  }, [mode, capturedBlob]);

  // Revoke the object URL when it changes so we don't leak — important
  // because each retake creates a fresh blob, and the wizard captures
  // both front and back, so without this we'd leak 2+ URLs per wizard.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const openPicker = () => fileInputRef.current?.click();

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (!ALLOWED_TYPES.includes(f.type)) {
      setStreamError('Unsupported format — upload a PNG, JPG, or PDF.');
      return;
    }
    if (f.size > MAX_BYTES) {
      setStreamError(`That file is larger than 10 MB — try a smaller copy.`);
      return;
    }
    setStreamError(null);
    onFile(f);
    setMode('upload-fallback');
  };

  const retake = () => {
    onClear();
    setMode('idle');
    setStreamError(null);
  };

  const fileChosen = !!(file || capturedBlob);
  const placeholderLabel = side === 'front' ? 'Front of ID' : 'Back of ID';

  return (
    <div className={`cam-cap${error ? ' has-error' : ''}${disabled ? ' is-disabled' : ''}`} aria-busy={uploading ? 'true' : undefined}>
      <div className="cam-cap-head">
        <span className="cam-cap-label">
          <Camera size={14} aria-hidden="true" />
          {placeholderLabel}
        </span>
        {fileChosen && !uploading && (
          <button type="button" className="cam-cap-clear" onClick={retake} aria-label={`Replace ${placeholderLabel.toLowerCase()}`}>
            <RefreshCw size={12} aria-hidden="true" /> Replace
          </button>
        )}
      </div>

      <div className="cam-cap-stage">
        {mode === 'streaming' && (
          <video
            ref={videoRef}
            className="cam-cap-video"
            playsInline
            autoPlay
            muted
            aria-label="Live camera preview"
          />
        )}

        {mode !== 'streaming' && fileChosen && previewUrl && (
          <img className="cam-cap-preview" src={previewUrl} alt={`Captured ${placeholderLabel.toLowerCase()} preview`} />
        )}

        {mode !== 'streaming' && !fileChosen && (
          <div className="cam-cap-empty">
            <Camera size={28} aria-hidden="true" />
            <span className="cam-cap-empty-text">{hint || `Tap below to capture the ${placeholderLabel.toLowerCase()} of your ID, or upload a saved photo or scan.`}</span>
          </div>
        )}

        {uploading && (
          <div className="cam-cap-loading" role="status">
            <span className="cam-cap-loading-text">Uploading…</span>
          </div>
        )}
      </div>

      {streamError && (
        <div className="cam-cap-error" role="alert">
          {streamError}
        </div>
      )}

      {error && (
        <div className="cam-cap-error" role="alert">
          {error}
        </div>
      )}

      {!disabled && (
        <div className="cam-cap-actions">
          {mode === 'idle' && (
            <>
              <button type="button" className="cam-cap-btn cam-cap-btn-primary" onClick={startStream}>
                <Camera size={14} aria-hidden="true" /> Open camera
              </button>
              <button type="button" className="cam-cap-btn" onClick={openPicker}>
                <Upload size={14} aria-hidden="true" /> Upload image
              </button>
            </>
          )}

          {mode === 'streaming' && (
            <>
              <button type="button" className="cam-cap-btn cam-cap-btn-primary" onClick={snap}>
                <Camera size={14} aria-hidden="true" /> Capture
              </button>
              <button type="button" className="cam-cap-btn" onClick={() => { stopStream(); setMode('upload-fallback'); }}>
                <Upload size={14} aria-hidden="true" /> Upload instead
              </button>
              <button type="button" className="cam-cap-btn cam-cap-btn-icon" onClick={() => { stopStream(); setMode('idle'); }} aria-label="Cancel camera">
                <X size={14} aria-hidden="true" />
              </button>
            </>
          )}

          {(mode === 'captured' || mode === 'upload-fallback') && fileChosen && (
            <>
              {fileName && <span className="cam-cap-filename" title={fileName}>{fileName}</span>}
              <button type="button" className="cam-cap-btn" onClick={permissionDenied ? openPicker : startStream}>
                <Camera size={14} aria-hidden="true" /> {permissionDenied ? 'Try upload again' : `Retake ${placeholderLabel.toLowerCase()}`}
              </button>
              <button type="button" className="cam-cap-btn" onClick={openPicker}>
                <Upload size={14} aria-hidden="true" /> Choose different file
              </button>
            </>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,application/pdf"
        className="cam-cap-hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
