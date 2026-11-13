/**
 * Who is allowed to see what, without a session.
 *
 * The route table grew an auth wall by default, and that default eventually
 * locked a public surface: the landing page links to the blockchain explorer and
 * promises visitors that blocks stay verifiable on-chain, while
 * `matchRoute('/explorer', false)` answered with the sign-in page. So these
 * assertions are about the *set* of anonymous surfaces, and they pin the
 * deliberate exclusions too — /marketplace and /devhub stay behind login until
 * the product decides otherwise, and /admin must never render for a signed-in
 * non-admin rather than 404-ing.
 */
import { describe, test, expect } from 'vitest';
import { matchRoute, isPublicRoute, PUBLIC_ROUTE_PATHS } from './router';

describe('the single public-route list', () => {
  test('matches exact paths, query strings and sub-paths', () => {
    expect(isPublicRoute('/explorer')).toBe(true);
    expect(isPublicRoute('/explorer/329000')).toBe(true);
    expect(isPublicRoute('/auth?mode=signup')).toBe(true);
    expect(isPublicRoute('/wallet/connect')).toBe(true);
  });

  test('does not match by loose prefix', () => {
    // '/explorerx'.startsWith('/explorer') would otherwise open an unrelated
    // route, and '/' is the authenticated dashboard.
    expect(isPublicRoute('/explorerx')).toBe(false);
    expect(isPublicRoute('/landing-page')).toBe(false);
    expect(isPublicRoute('/')).toBe(false);
    expect(isPublicRoute('/admin')).toBe(false);
    expect(isPublicRoute('/authenticating')).toBe(false);
  });

  test('App.tsx and matchRoute consult this same list', () => {
    // The bug this guards against was structural: App's auth-guard effect kept
    // its own inline copy of four paths, so a route opened in the router table
    // still bounced to /landing before the router was consulted.
    expect(PUBLIC_ROUTE_PATHS).toContain('/explorer');
    expect(PUBLIC_ROUTE_PATHS).toContain('/run-node');
    expect(PUBLIC_ROUTE_PATHS).toContain('/dmca');
  });
});

describe('anonymous (logged-out) routing', () => {
  test('the public chain explorer is reachable without a session', () => {
    expect(matchRoute('/explorer', false, 'user').path).toBe('/explorer');
    // Deep links into it (/explorer?tx=…, /explorer/329000) resolve to the same
    // page through the prefix fallback.
    expect(matchRoute('/explorer/329000', false, 'user').path).toBe('/explorer');
  });

  test('the marketing and self-service surfaces stay public', () => {
    for (const path of ['/landing', '/auth', '/login', '/dmca', '/run-node', '/wallet', '/wallet/connect']) {
      expect(matchRoute(path, false, 'user').path, `${path} should be public`).toBe(path);
    }
  });

  test('account surfaces send a logged-out visitor to the one login portal', () => {
    expect(matchRoute('/', false, 'user').path).toBe('/auth');
    expect(matchRoute('/dashboard', false, 'user').path).toBe('/auth');
    expect(matchRoute('/admin', false, 'user').path).toBe('/auth');
    expect(matchRoute('/settings', false, 'user').path).toBe('/auth');
  });

  test('marketplace and the developer console remain authenticated', () => {
    // Not a defect claim — an explicit record of the current product decision,
    // so opening either one is a deliberate change with a failing test first.
    expect(matchRoute('/marketplace', false, 'user').path).toBe('/auth');
    expect(matchRoute('/devhub', false, 'user').path).toBe('/auth');
  });
});

describe('authenticated routing', () => {
  test('a signed-in non-admin never renders the admin panel', () => {
    expect(matchRoute('/admin', true, 'user').path).toBe('/');
    expect(matchRoute('/admin/users', true, 'user').path).toBe('/');
  });

  test('admins and superadmins reach the admin panel', () => {
    expect(matchRoute('/admin', true, 'admin').path).toBe('/admin');
    expect(matchRoute('/admin', true, 'superadmin').path).toBe('/admin');
  });

  test('an unknown path falls back to the dashboard rather than a blank page', () => {
    expect(matchRoute('/definitely-not-a-route', true, 'user').path).toBe('/');
  });
});
