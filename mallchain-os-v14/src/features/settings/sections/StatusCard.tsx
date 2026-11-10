import { useEffect, useState } from 'react';
import { store } from '../../../store/store';
import { toast } from '../../../components/ui';
import { authService } from '../../../services/auth';
import { badgeApi, type BadgeConfig } from '../../../services/badgeApi';
import { useWalletGate, reportLinkFailure, linkAttemptGuard } from '../../wallet/walletGate';
import { Card, InfoRow } from './Shell';
import { kycChip } from './status';
import type { SettingsData } from '../hooks/useSettingsData';
import { BuyBadgeModal } from './BuyBadgeModal';

/**
 * Step 02 — what is actually confirmed, in one table.
 *
 * This used to be two cards ("Verification status" and "Account") that each
 * restated KYC and the wallet in different words, so the same fact could
 * disagree with itself on the same screen. One row per fact, one place to fix
 * it, and the four chips all come from a server answer rather than from local
 * state that could be left over from the previous sign-in.
 */

export function StatusCard({ data, onOpenSecurityPage }: { data: SettingsData; onOpenSecurityPage: () => void }) {
  const st = store.state;
  const { gate, refresh: refreshGate } = useWalletGate();
  const [badgeConfig, setBadgeConfig] = useState<BadgeConfig | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    badgeApi.getConfig().then((r) => { if (r.ok && r.data) setBadgeConfig(r.data); });
  }, []);

  const linkWalletNow = async () => {
    if (!st.wallet.address || linking) return;
    const refused = linkAttemptGuard(gate, st.wallet.address);
    if (refused) { toast(refused, false); return; }
    setLinking(true);
    const res = await authService.linkWallet(st.wallet.address);
    setLinking(false);
    if (res.ok) {
      toast('Wallet linked to your account');
      // The verdict that just changed is server-side, so the row re-reads it
      // rather than assuming the link is now visible everywhere.
      void refreshGate();
    } else {
      reportLinkFailure(res.reason);
    }
  };

  const twoFactor = data.settings?.security.twoFactorEnabled ?? null;
  const kyc = kycChip(data.kyc?.status);

  return (
    <Card
      title="Verification status"
      hint="Four separate confirmations. Each one is answered by the server, so an absent row means the read failed — not that you are unverified."
      missing={data.has('settings') && data.has('kyc') ? undefined : 'the settings document and the identity record'}
      onRetry={data.reload}
      busy={data.loading}
    >
      <InfoRow
        label="Identity"
        note="checked against the documents you submitted"
        value={data.has('kyc') ? kyc.label : '—'}
        tone={data.has('kyc') ? undefined : 'muted'}
      />
      <InfoRow
        label="Two-factor authentication"
        note="an authenticator app at sign-in"
        value={twoFactor === null ? '—' : twoFactor ? '✓ On' : 'Not enabled'}
        tone={twoFactor ? 'ok' : twoFactor === null ? 'muted' : 'default'}
      />
      <InfoRow
        label="Wallet"
        note={st.wallet.address ? `${st.wallet.address.slice(0, 12)}… on this device` : 'no address on this device'}
        value={
          st.wallet.linkedOnServer ? '✓ Connected'
            : !gate.allowed ? <a className="link-btn" href="#/kyc" title="A wallet is attached to an account only after its identity is verified">
              {gate.state === 'checking' ? 'Checking…' : 'Verify identity first'}
            </a>
              : st.wallet.address ? (
                <button className="link-btn" onClick={linkWalletNow} disabled={linking}>
                  {linking ? 'Linking…' : 'Link wallet'}
                </button>
              ) : <span className="link-btn" onClick={onOpenSecurityPage}>Create or import one</span>
        }
        tone={st.wallet.linkedOnServer ? 'ok' : 'default'}
      />
      <InfoRow
        label="Mallchain badge"
        note="a 7-day activity streak, or bought with M-Pesa"
        value={
          st.user.hasBadge ? '✓ Active'
            : st.wallet.address ? (
              <span className="row" style={{ gap: 8 }}>
                <span className="chip">Not earned</span>
                <button className="btn btn-primary btn-sm" onClick={() => setBuyOpen(true)}>
                  Buy for KSh {badgeConfig?.priceKes ?? 17}
                </button>
              </span>
            ) : <span className="chip">Connect a wallet to buy</span>
        }
        tone={st.user.hasBadge ? 'ok' : 'default'}
      />

      {buyOpen && st.wallet.address && (
        <BuyBadgeModal
          walletAddress={st.wallet.address}
          priceKes={badgeConfig?.priceKes ?? 17}
          stkConfigured={badgeConfig?.providerMode === 'live'}
          onClose={() => setBuyOpen(false)}
          onIssued={() => {
            st.user.hasBadge = true;
            store.commit();
            setBuyOpen(false);
            toast('Badge issued — it now appears beside your name.');
          }}
        />
      )}
    </Card>
  );
}
