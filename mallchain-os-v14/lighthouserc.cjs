// P1: Lighthouse CI config. lhci's built-in static server serves `dist/`
// directly — no need for the production nginx.conf here, this only checks
// the built assets themselves (bundle size, render performance,
// accessibility), not anything server-side.
//
// Run: npm run build && npx lhci autorun
module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      // No port here — lhci substitutes in whatever port its built-in
      // static server actually binds to. Hash-based routing (router.tsx)
      // means /#/landing is handled entirely client-side by index.html, so
      // no isSinglePageApplication server-fallback flag is needed either.
      url: ['http://localhost/#/landing'],
      numberOfRuns: 3,
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.7 }],
        'categories:accessibility': ['error', { minScore: 0.85 }],
        'categories:best-practices': ['warn', { minScore: 0.8 }],
        // The two large vendor chunks (@cosmjs, react, socket.io-client,
        // hash-wasm — see vite.config.ts's chunkSizeWarningLimit comment)
        // are a known, already-tracked cost — not re-litigated here as a
        // hard failure, just kept visible via the performance score above.
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
