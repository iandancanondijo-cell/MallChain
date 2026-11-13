import { networkLabel, useNetworkSnapshot } from '../../../hooks/useNetworkIdentity';
import { Card, InfoRow } from './Shell';
import type { SettingsData } from '../hooks/useSettingsData';

/**
 * The last step — the things that are true of this device, not of the account.
 *
 * The two-minute wait for a session to end and the wallet cipher are the
 * account's and the device's respectively, and both used to be reachable only
 * from a second page nobody linked here. This card states which is which, and
 * what "reset local data" actually destroys: it is the only destructive control
 * on the page, and it does not delete anything on the server.
 */

export function DeviceCard({ data, onOpenSecurityPage }: { data: SettingsData; onOpenSecurityPage: () => void }) {
  const storedTtl = data.settings?.security.sessionTimeout;
  // The lifetime the server signs tokens with, not the number sitting in the
  // account document. utils/sessionPolicy.js caps the stored preference at the
  // operator's SESSION_TTL_MIN and ignores anything below 1 minute, so the
  // preference alone is not an answer — legacy documents carry a 120 that every
  // account here gets shortened to 30.
  const policy = data.sessionPolicy;
  // The chain the node says it is, not the flag this bundle was compiled with —
  // a settings page that reports the build flag invites people to believe the
  // wrong thing about where their money is.
  const net = useNetworkSnapshot();
  const label = networkLabel(net);

  const capped = Boolean(policy && Number.isFinite(Number(storedTtl)) && Number(storedTtl) > policy.ttlMinutes);
  const endsAt = policy?.endsAt ? new Date(policy.endsAt) : null;
  const endsIn = endsAt && !Number.isNaN(endsAt.getTime()) ? Math.round((endsAt.getTime() - Date.now()) / 60000) : null;

  return (
    <Card
      title="This device"
      hint="Settings that belong to the browser you are in, and the one control that clears it."
    >
      <InfoRow
        label="Network"
        note={
          label === 'mainnet'
            ? 'the live Mallchain network, as reported by the node'
            : label === 'checking…'
              ? 'reading the chain id from the node'
              : 'not the live network — value here is not real'
        }
        value={label}
        tone={label === 'mainnet' ? 'default' : 'warn'}
      />
      <InfoRow
        label="Session length"
        note={
          policy
            ? capped
              ? `Your saved preference is ${storedTtl} minutes, but this service caps every session at ${policy.ttlMinutes}. It is counted from signing in, not from your last click.`
              : 'counted from signing in, not from your last click' +
                (endsIn !== null && endsIn > 0 ? ` · this sign-in ends in about ${endsIn} min` : '')
            : data.has('settings')
              ? 'read from your account, because the server policy could not be reached'
              : 'not loaded'
        }
        value={
          policy
            ? `${policy.ttlMinutes} minutes`
            : !data.has('settings')
              ? '—'
              : storedTtl === null || storedTtl === undefined
                ? 'Service default'
                : `${storedTtl} minutes (unconfirmed)`
        }
        tone={!data.has('settings') && !policy ? 'muted' : capped || !policy ? 'warn' : 'default'}
      />
      <InfoRow
        label="Wallet cipher, key backup, export"
        note="held on this device, so they are managed apart from account sign-in"
        value={<button className="link-btn" onClick={onOpenSecurityPage}>Open security settings</button>}
      />
      <InfoRow
        label="Local store"
        note="mallchain_os_v1_v14 in this browser’s localStorage"
        value={
          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
              if (window.confirm('Clear everything this browser remembers — including the wallet stored on this device? Your account on the server is not touched.')) {
                localStorage.removeItem('mallchain_os_v1_v14');
                window.location.reload();
              }
            }}
          >
            Reset local data
          </button>
        }
      />
      <p className="ps-note">
        Resetting signs this browser out of the local copy and reloads the app. Balances, tasks, KYC
        records and settings all live on the server, so they come back on the next sign-in — but a
        wallet whose cipher was held only here cannot be recovered without its backup phrase.
      </p>
    </Card>
  );
}
