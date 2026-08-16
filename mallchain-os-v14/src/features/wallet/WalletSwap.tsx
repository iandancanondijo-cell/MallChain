/**
 * Swap — no real swap/DEX backend exists yet (no endpoint anywhere in
 * backend/src/routes, confirmed via search). This used to fabricate
 * exchange rates and execute the "swap" purely locally via store.applyTx —
 * real-looking, but not real. Shown honestly disabled until a real backend
 * exists, rather than faking execution.
 */
export default function WalletSwap() {
  return (
    <div>
      <div className="view-head"><h1>Swap</h1><span className="sub">not available yet</span></div>
      <div className="card" style={{ maxWidth: 520 }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 40 }}>🔄</div>
          <h2 style={{ margin: '8px 0' }}>Swap isn't available yet</h2>
          <p className="muted">
            Token swaps need a real exchange backend, which hasn't been built yet.
            There's no live pricing or execution behind this feature — it isn't wired up rather than pretending to work.
          </p>
        </div>
      </div>
    </div>
  );
}
