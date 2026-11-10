import { config } from '../../../services/config';
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
  const ttl = data.settings?.security.sessionTimeout;

  return (
    <Card
      title="This device"
      hint="Settings that belong to the browser you are in, and the one control that clears it."
    >
      <InfoRow
        label="Network"
        note={config.network === 'mainnet' ? 'the live Mallchain network' : 'test network — value here is not real'}
        value={config.network}
        tone={config.network === 'mainnet' ? 'default' : 'warn'}
      />
      <InfoRow
        label="Session length"
        note="counted from signing in, not from your last click"
        value={
          data.has('settings')
            ? ttl === null || ttl === undefined ? 'Service default' : `${ttl} minutes`
            : '—'
        }
        tone={data.has('settings') ? 'default' : 'muted'}
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
