import { describe, expect, test, vi, afterEach } from 'vitest';

vi.mock('./config', () => ({ config: { apiBaseUrl: '' } }));

import { config } from './config';
import { resolveSocketOrigin } from './socket';

/**
 * §9.5 of the integration handoff is a deployment requirement (the proxy must
 * answer wss:// and CORS must name this origin), but half of it is client code:
 * a secure page must never dial `ws://`, because the browser kills that
 * handshake and realtime stays "Disconnected" while REST works — the shape a
 * user reports as "the live panels do not work in production".
 */
function onLocation(origin: string, protocol: string) {
  vi.stubGlobal('window', { location: { origin, protocol } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(config).apiBaseUrl = '';
});

describe('resolveSocketOrigin', () => {
  test('keeps a configured origin as-is over an insecure page', () => {
    onLocation('http://localhost:5173', 'http:');
    vi.mocked(config).apiBaseUrl = 'http://localhost:4000';
    expect(resolveSocketOrigin()).toBe('http://localhost:4000');
  });

  test('upgrades an http API origin when the page itself is https', () => {
    onLocation('https://mallchain.network', 'https:');
    vi.mocked(config).apiBaseUrl = 'http://api.mallchain.network';
    expect(resolveSocketOrigin()).toBe('https://api.mallchain.network');
  });

  test('leaves an already-secure origin untouched', () => {
    onLocation('https://mallchain.network', 'https:');
    vi.mocked(config).apiBaseUrl = 'https://api.mallchain.network';
    expect(resolveSocketOrigin()).toBe('https://api.mallchain.network');
  });

  test('falls back to the page origin when no API base is configured', () => {
    onLocation('https://mallchain.network', 'https:');
    expect(resolveSocketOrigin()).toBe('https://mallchain.network');
  });

  test('an explicit url wins, and is still upgraded for a secure page', () => {
    onLocation('https://mallchain.network', 'https:');
    expect(resolveSocketOrigin('http://127.0.0.1:4000')).toBe('https://127.0.0.1:4000');
  });
});
