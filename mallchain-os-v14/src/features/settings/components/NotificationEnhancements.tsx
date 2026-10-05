import { useEffect, useState, useCallback } from 'react';
import { notificationPreferencesApi, type NotificationPreferences } from '../../../services/notificationPreferencesApi';
import { useStoreVersion, toast } from '../../../components/ui';

/**
 * NotificationEnhancements Component
 * Manages notification preferences including frequency, channels, and do-not-disturb
 */
export function NotificationEnhancements() {
  useStoreVersion();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * Load preferences
   */
  const loadPreferences = useCallback(async () => {
    setLoading(true);
    const res = await notificationPreferencesApi.getPreferences();
    if (res.ok && res.data) {
      setPrefs(res.data);
    } else {
      toast(res.error || 'Failed to load preferences', false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const updateFrequency = async (category: keyof NotificationPreferences['frequency'], value: string) => {
    if (!prefs) return;
    setSaving(true);
    const newFreq = { ...prefs.frequency, [category]: value };
    const res = await notificationPreferencesApi.updateFrequency(newFreq);
    setSaving(false);
    if (res.ok && res.data) {
      setPrefs(res.data);
    } else {
      toast(res.error || 'Failed to update', false);
    }
  };

  const toggleChannel = async (channel: keyof NotificationPreferences['channels']) => {
    if (!prefs) return;
    setSaving(true);
    const newChannels = { ...prefs.channels, [channel]: !prefs.channels[channel] };
    const res = await notificationPreferencesApi.updateChannels(newChannels);
    setSaving(false);
    if (res.ok && res.data) {
      setPrefs(res.data);
    } else {
      toast(res.error || 'Failed to update', false);
    }
  };

  const toggleDoNotDisturb = async () => {
    if (!prefs) return;
    setSaving(true);
    const newDND = { ...prefs.doNotDisturb, enabled: !prefs.doNotDisturb.enabled };
    const res = await notificationPreferencesApi.updateDoNotDisturb(newDND);
    setSaving(false);
    if (res.ok && res.data) {
      setPrefs(res.data);
    } else {
      toast(res.error || 'Failed to update', false);
    }
  };

  const toggleGlobal = async () => {
    if (!prefs) return;
    setSaving(true);
    const res = await notificationPreferencesApi.toggleGlobal(!prefs.enableNotifications);
    setSaving(false);
    if (res.ok && res.data) {
      setPrefs(res.data);
      toast(res.data.enableNotifications ? 'Notifications enabled' : 'Notifications disabled');
    } else {
      toast(res.error || 'Failed to update', false);
    }
  };

  if (loading) {
    return <div className="tiny">Loading notification preferences…</div>;
  }

  if (!prefs) return null;

  return (
    <div className="card mb">
      <div className="sec-title"><h2>Notification Settings</h2></div>

      {/* Global Toggle */}
      <div style={{ marginBottom: 16, padding: 12, backgroundColor: 'var(--surface-alt)', borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>All Notifications</div>
            <div className="tiny" style={{ color: 'var(--txt-3)', marginTop: 2 }}>
              Master switch for all notifications
            </div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={prefs.enableNotifications}
              onChange={toggleGlobal}
              disabled={saving}
            />
            <span className="track" />
            <span className="knob" />
          </label>
        </div>
      </div>

      {/* Notification Frequency */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>📬 Frequency Preferences</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {(['transactions', 'campaigns', 'governance', 'security', 'marketing', 'badgeAlerts'] as const).map((cat) => (
            <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10, border: '1px solid var(--outline)', borderRadius: 6 }}>
              <div className="tiny" style={{ textTransform: 'capitalize' }}>{cat.replace(/([A-Z])/g, ' $1').trim()}</div>
              <select
                className="input"
                style={{ width: '120px', fontSize: 12 }}
                value={prefs.frequency[cat]}
                onChange={(e) => updateFrequency(cat, e.target.value)}
                disabled={saving}
              >
                <option value="immediate">Immediate</option>
                <option value="daily">Daily Digest</option>
                <option value="weekly">Weekly</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Notification Channels */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>📱 Notification Channels</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {(['email', 'push', 'sms', 'whatsapp', 'inApp'] as const).map((channel) => (
            <div key={channel} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10, border: '1px solid var(--outline)', borderRadius: 6 }}>
              <div className="tiny" style={{ textTransform: 'capitalize' }}>{channel}</div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={prefs.channels[channel]}
                  onChange={() => toggleChannel(channel)}
                  disabled={saving}
                />
                <span className="track" />
                <span className="knob" />
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Do Not Disturb */}
      <div style={{ marginBottom: 16, padding: 12, backgroundColor: 'var(--surface-alt)', borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>🔕 Do Not Disturb</div>
          <label className="switch">
            <input
              type="checkbox"
              checked={prefs.doNotDisturb.enabled}
              onChange={toggleDoNotDisturb}
              disabled={saving}
            />
            <span className="track" />
            <span className="knob" />
          </label>
        </div>
        {prefs.doNotDisturb.enabled && (
          <div className="tiny" style={{ color: 'var(--txt-3)' }}>
            Quiet hours: {prefs.doNotDisturb.startTime} - {prefs.doNotDisturb.endTime}
          </div>
        )}
      </div>

      {/* Help Text */}
      <div className="tiny" style={{ padding: 10, backgroundColor: 'var(--surface-alt)', borderRadius: 6, color: 'var(--txt-3)' }}>
        <strong>💡 Tip:</strong> Adjust frequency and channels to manage notification overload. Use do-not-disturb for uninterrupted focus time.
      </div>
    </div>
  );
}
