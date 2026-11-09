export interface NetSignal {
  tone: 'green' | 'yellow' | 'orange';
  label: string;
  /**
   * null while the first probe is still in flight. A status light that dims
   * before it has measured anything tells the user their node is down when all
   * that is true is that the page just opened, so unknown gets its own state.
   */
  ok: boolean | null;
}

function word(ok: boolean | null): string {
  return ok === null ? 'checking' : ok ? 'live' : 'not responding';
}

/**
 * The three glowing squares that replaced the old "Network: mainnet" chip.
 * They are a status readout, not decoration: each one is a different signal
 * (chain node, price feed, account↔wallet link) and a dead signal dims its
 * square instead of staying lit. Hover names the signal; the chain's real
 * name is printed beside them by the caller.
 */
export default function NetworkDots({ signals }: { signals: NetSignal[] }) {
  const summary = signals.map((s) => `${s.label}: ${word(s.ok)}`).join(' · ');
  return (
    <span className="net-dots" role="img" aria-label={summary}>
      {signals.map((s) => (
        <span
          key={s.tone}
          className={`net-dot net-dot-${s.tone}${s.ok === null ? ' is-check' : s.ok ? ' is-on' : ' is-off'}`}
          title={`${s.label} — ${word(s.ok)}`}
        />
      ))}
      <span className="sr-only">{summary}</span>
    </span>
  );
}
