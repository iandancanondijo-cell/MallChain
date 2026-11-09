/**
 * The notice a door shows when the KYC gate refuses it. One component so the
 * dashboard, wallet hub, send, Mallpoints and the signup wizard all say the same
 * sentence in the same colours — the palette matches the KYC verdict container in
 * the dashboard (green allowed, gold with a reviewer, red refused, grey unknown).
 *
 * `checking` renders a real line rather than nothing: a wallet button that
 * appears a second later reads as a bug, and a button that never appears reads as
 * the account being broken. Saying which it is costs one line.
 */
import type { UseWalletGate } from './walletGate';
import './WalletGateNotice.css';

const HEADINGS: Record<string, string> = {
  signed_out: 'Sign in first',
  kyc_required: 'Verify your identity first',
  kyc_pending: 'Your verification is with a reviewer',
  kyc_rejected: 'Your verification was rejected',
  kyc_unreachable: 'Verification status unavailable',
};

const ICONS: Record<string, string> = {
  kyc_required: '🪪',
  kyc_pending: '⏳',
  kyc_rejected: '✕',
  kyc_unreachable: '？',
  signed_out: '🔐',
};

export default function WalletGateNotice({ gate, onRetry }: { gate: UseWalletGate['gate']; onRetry: () => void }) {
  if (gate.allowed) return null;

  if (gate.state === 'checking') {
    return (
      <div className="wgn wgn-checking" role="status">
        <span className="wgn-msg">{gate.message}</span>
      </div>
    );
  }

  const retry = gate.action?.href === '';

  return (
    <div className={`wgn wgn-${gate.state}`} role="status">
      <span className="wgn-ico" aria-hidden="true">{ICONS[gate.state] || '🪪'}</span>
      <div className="wgn-body">
        <div className="wgn-title">{HEADINGS[gate.state] || 'Verification required'}</div>
        <p className="wgn-msg">{gate.message}</p>
      </div>
      {gate.action && (
        retry ? (
          <button className="btn btn-ghost btn-sm wgn-action" onClick={onRetry}>{gate.action.label}</button>
        ) : (
          <a className="btn btn-primary btn-sm wgn-action" href={gate.action.href}>{gate.action.label}</a>
        )
      )}
    </div>
  );
}
