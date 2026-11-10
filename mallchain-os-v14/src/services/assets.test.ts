import { describe, expect, test } from 'vitest';
import { config } from './config';
import { resolveAssetUrl } from './assets';

/**
 * The two rules that decide whether an <img> is allowed to render a value the
 * account document holds. Both have been broken in production-shaped code:
 * a stored '/uploads/avatars/…' resolved against the page origin (404 under the
 * dev proxy, which forwards only /api), and an unvalidated string reached a src
 * attribute at all — the same class already fixed once for proof_url.
 */

const url = (stored: string | null | undefined) => resolveAssetUrl(stored)?.url ?? null;

describe('resolveAssetUrl', () => {
  test('a stored uploads path is rewritten onto the /api prefix', () => {
    const got = resolveAssetUrl('/uploads/avatars/ada-1-me.png');
    expect(got?.url).toBe(`${config.apiBaseUrl}/api/uploads/avatars/ada-1-me.png`);
    // `stored` stays the raw database value, because that is what a re-read of
    // /api/auth/me is compared against.
    expect(got?.stored).toBe('/uploads/avatars/ada-1-me.png');
  });

  test('a path that already carries /api is not prefixed twice', () => {
    expect(url('/api/uploads/avatars/ada-1-me.png'))
      .toBe(`${config.apiBaseUrl}/api/uploads/avatars/ada-1-me.png`);
  });

  test('an absolute http(s) URL is used as given', () => {
    expect(url('https://cdn.example.com/a/b.png')).toBe('https://cdn.example.com/a/b.png');
  });

  test('nothing to show resolves to null, not to an empty src', () => {
    for (const value of [null, undefined, '', '   ']) expect(url(value)).toBeNull();
  });

  test('only the kinds the server writes are accepted', () => {
    expect(url('/uploads/avatars/x.png')).not.toBeNull();
    expect(url('/uploads/products/x.png')).not.toBeNull();
    expect(url('/uploads/documents/x.pdf')).not.toBeNull();
    expect(url('/uploads/anything-else/x.png')).toBeNull();
    expect(url('/etc/passwd')).toBeNull();
    expect(url('/uploads')).toBeNull();
  });

  test('a relative path without a leading slash is not guessed at', () => {
    expect(url('uploads/avatars/x.png')).toBeNull();
  });

  test('a traversal in the path never escapes the uploads tree', () => {
    expect(url('/uploads/avatars/../../secrets/env')).toBeNull();
    expect(url('/uploads/..%2f..%2fenv')).toBeNull();
  });

  test('a scheme that is not http(s) never becomes a src', () => {
    for (const value of [
      'javascript:alert(document.cookie)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'blob:http://localhost/abcdef',
      '//evil.example/x.png',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
    ]) {
      expect(url(value)).toBeNull();
    }
  });
});
