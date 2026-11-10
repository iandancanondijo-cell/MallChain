import { toast } from '../../../components/ui';
import { Card, ToggleRow } from './Shell';
import type { SettingsData } from '../hooks/useSettingsData';

/**
 * Step 10 — what other people can see.
 *
 * Every switch here writes immediately and shows the server's answer: the old
 * page flipped the switch, dropped the PUT response, and left "Show my balance
 * to others" pointing at a setting nobody saved. A refused write reverts the
 * switch in front of you.
 */

const ROWS = [
  {
    key: 'showBalance' as const,
    label: 'Show my balance to others',
    note: 'Marketplace and profile pages read this. Turning it off hides the figure, not the account.',
  },
  {
    key: 'showActivity' as const,
    label: 'Show my activity',
    note: 'Mining streaks and completed tasks in the leaderboard views.',
  },
  {
    key: 'allowMessages' as const,
    label: 'Allow direct messages',
    note: 'Whether somebody who is not on your contact list can start a thread with you.',
  },
  {
    key: 'dataSharing' as const,
    label: 'Share usage data for improvements',
    note: 'Aggregated app behaviour only. Wallet addresses, balances and documents are never part of it.',
  },
];

export function PrivacyCard({ data }: { data: SettingsData }) {
  const privacy = data.settings?.privacy;

  const set = async (key: keyof NonNullable<typeof privacy>, value: boolean | string) => {
    if (!privacy) return;
    const res = await data.save({ privacy: { ...privacy, [key]: value } }, 'Privacy setting');
    toast(res.message, res.ok);
  };

  return (
    <Card
      title="Privacy"
      hint="Each switch saves the moment you move it, and shows what the account ended up storing."
      missing={data.has('settings') ? undefined : 'the privacy section of your settings'}
      onRetry={data.reload}
      busy={data.loading}
    >
      {ROWS.map((row) => (
        <ToggleRow
          key={row.key}
          label={row.label}
          note={row.note}
          checked={Boolean(privacy?.[row.key])}
          onChange={(next) => void set(row.key, next)}
        />
      ))}

      <div className="ps-sub">Who can find this profile</div>
      <div className="field" style={{ maxWidth: 320 }}>
        <label htmlFor="ps-visibility">Profile visibility</label>
        <select
          id="ps-visibility"
          className="input"
          value={privacy?.profileVisibility || 'public'}
          onChange={(e) => void set('profileVisibility', e.target.value)}
        >
          <option value="public">Public — anyone with the link</option>
          <option value="contacts">Contacts only</option>
          <option value="private">Private — only you</option>
        </select>
        <div className="ps-note">Controls the profile page itself. The switches above control what on it.</div>
      </div>
    </Card>
  );
}
