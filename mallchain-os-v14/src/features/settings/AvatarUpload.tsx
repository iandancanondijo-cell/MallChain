import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { createPreviewUrl, resolveAssetUrl, revokePreviewUrl } from '../../services/assets';
import './AvatarUpload.css';

/**
 * The avatar control on Profile & Settings.
 *
 * What it replaces: a generic multi-purpose uploader that built an XMLHttpRequest
 * for a progress bar, never called .open()/.send() on it, fired the request with
 * fetch anyway, and reported "File uploaded successfully!" — while the parent
 * dropped the returned URL into local state and the <img> pointed at a path the
 * dev server could not serve. So the honest failure was invisible.
 *
 * What it does now: one endpoint, one state machine (pick → validate → upload →
 * confirm), and the picture is only shown as saved once the server has said so.
 * The preview of a file that has not landed yet is a local object URL, and it is
 * given back — on replace, on unmount, and on any refusal — so a file the server
 * said no to cannot sit there looking like the account's picture.
 */

/** backend/src/routes/upload.js — avatarStorage rejects anything else, and multer
 *  truncates the request at 2MB, so the client must not promise otherwise. */
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;

export interface AvatarPickerProps {
  /** The path the account document holds, e.g. '/uploads/avatars/…' — or null. */
  storedUrl: string | null;
  /** Display name / initial used when there is no picture. */
  name: string;
  initial: string;
  hasBadge?: boolean;
  email?: string;
  /** Called with the value the server confirmed, so the page can mirror it. */
  onStored: (stored: string | null) => void;
}

type Phase = 'idle' | 'uploading' | 'saved' | 'failed';

const MAX_SAVED_PING_MS = 4000;

function deriveInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function AvatarPicker({ storedUrl, name, initial, hasBadge, email, onStored }: AvatarPickerProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState<string>('');
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // The path the account holds is not a promise that the bytes are still there:
  // a deleted file or a host that serves no /uploads answers 404, and a circle
  // with a broken image in it reads as "this is your picture". Until it loads,
  // render the initials and say the picture could not be read.
  const [unreadable, setUnreadable] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const pingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [seenUrl, setSeenUrl] = useState(storedUrl);
  if (seenUrl !== storedUrl) {
    setSeenUrl(storedUrl);
    setUnreadable(false);
  }

  const setPreviewSafe = useCallback((next: string | null) => {
    if (previewRef.current) revokePreviewUrl(previewRef.current);
    previewRef.current = next;
    setPreview(next);
  }, []);

  useEffect(() => () => {
    if (previewRef.current) revokePreviewUrl(previewRef.current);
    if (pingRef.current) clearTimeout(pingRef.current);
  }, []);

  const settleSaved = useCallback(() => {
    setPhase('saved');
    if (pingRef.current) clearTimeout(pingRef.current);
    pingRef.current = setTimeout(() => {
      setPhase('idle');
      setStatus('');
    }, MAX_SAVED_PING_MS);
  }, []);

  /**
   * A failed upload always ends with the picture back to what the account
   * holds: a preview that survives a refusal keeps offering "Use this" for a
   * file the server said no to.
   */
  const fail = useCallback((reason: string) => {
    setPreviewSafe(null);
    setPhase('failed');
    setStatus(reason);
  }, [setPreviewSafe]);

  const upload = useCallback(async (file: File) => {
    setPreviewSafe(createPreviewUrl(file));

    // Client-side mirror of the server's rules, so the common miss (a 6MB
    // screenshot, a HEIC) is caught before a round trip — not instead of it.
    if (!ACCEPTED.includes(file.type)) {
      fail('That file type is not accepted. Use a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      fail(`Too large — ${(file.size / 1048576).toFixed(1)}MB. The limit is 2MB.`);
      return;
    }

    setPhase('uploading');
    setStatus('');

    const form = new FormData();
    form.append('file', file);

    try {
      const res = await fetch('/api/upload/avatar', {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      const payload = await res.json().catch(() => ({} as { url?: string; error?: string }));

      if (!res.ok || !payload.url) {
        // multer's own message is the useful one ("Only JPG, PNG, or WebP…",
        // "Avatar image must be 2MB or smaller"), so it goes through when the
        // server has one.
        fail(payload.error || `Upload failed (HTTP ${res.status}). Nothing was saved.`);
        return;
      }

      const stored = payload.url;
      // Confirm against the account record rather than trusting the response
      // alone: this is the value every later page load will render.
      const me = await api.get<{ user?: { avatarUrl?: string | null } }>('/api/auth/me');
      const confirmed = me.ok ? (me.data?.user?.avatarUrl ?? null) : null;
      const shown = me.ok ? confirmed : stored;

      if (me.ok && confirmed === null) {
        fail('The file uploaded, but the account record still shows no picture. Try again, or use another image.');
        return;
      }
      if (shown) onStored(shown);
      settleSaved();
      setStatus(
        me.ok && confirmed && confirmed !== stored
          ? `Saved as ${confirmed}`
          : 'Your picture is up. It shows in the menu bar and on your profile.',
      );
      setPreviewSafe(null);
    } catch {
      // No response at all: the network or the server went away mid-request.
      fail('Could not reach the server, so nothing was saved. Check your connection and try again.');
    }
  }, [fail, onStored, setPreviewSafe, settleSaved]);

  const pick = () => inputRef.current?.click();

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void upload(file);
  };

  const shown = preview ? { url: preview } : (unreadable ? null : resolveAssetUrl(storedUrl));
  const busy = phase === 'uploading';

  return (
    <div className="ps-avatar-row">
      <div
        className="ps-avatar-stage"
        data-drag={dragging ? 'true' : 'false'}
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        }}
      >
        <button
          type="button"
          className="ps-avatar-button"
          onClick={pick}
          disabled={busy}
          aria-label={storedUrl || preview ? 'Change profile picture' : 'Upload a profile picture'}
        >
          <span className="ps-avatar-ring" data-pending={preview ? 'true' : 'false'}>
            {shown ? (
              <img
                src={shown.url}
                alt=""
                onError={() => {
                  if (preview) setPreviewSafe(null);
                  else setUnreadable(true);
                }}
              />
            ) : (
              <span>{deriveInitials(name) || initial || '?'}</span>
            )}
          </span>
          <span className="ps-avatar-overlay">{busy ? 'Uploading…' : 'Change'}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="ps-avatar-input"
          onChange={(e) => { onFiles(e.currentTarget.files); e.currentTarget.value = ''; }}
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>

      <div className="ps-avatar-actions">
        <div className="ps-avatar-name">
          {name}
          {hasBadge && <span className="chip" style={{ color: 'var(--green)' }}>✓ Badge</span>}
        </div>
        {email && <div className="ps-avatar-status">{email}</div>}

        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={pick} disabled={busy}>
            {busy ? 'Uploading…' : storedUrl ? 'Choose another picture' : 'Choose a picture'}
          </button>
        </div>

        <p
          className="ps-avatar-status"
          data-tone={phase === 'failed' ? 'bad' : phase === 'saved' ? 'ok' : unreadable ? 'warn' : undefined}
          role={phase === 'failed' ? 'alert' : 'status'}
        >
          {status || (unreadable
            ? 'The picture stored on your account could not be loaded, so your initials are shown. Choose another picture to replace it.'
            : 'JPG, PNG or WebP, up to 2MB. Square pictures crop best. Drag a file onto the circle instead of clicking, if you prefer.')}
        </p>
      </div>
    </div>
  );
}

export default AvatarPicker;
