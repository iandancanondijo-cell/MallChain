/**
 * SoundSettings — UI for configuring sound preferences. Allows users to
 * toggle sounds on/off, adjust volumes, and select ambient tracks.
 */
import { useState, useEffect } from 'react';
import { useSound } from '../hooks/useSound';
import type { AmbientTrack, SoundPreferences } from '../services/soundService';

const AMBIENT_TRACKS: { value: AmbientTrack; label: string; description: string }[] = [
  { value: 'none', label: 'None', description: 'No ambient sound' },
  { value: 'calm', label: 'Calm', description: 'Soft, soothing pads' },
  { value: 'focus', label: 'Focus', description: 'Gentle concentration aid' },
  { value: 'nature', label: 'Nature', description: 'Ambient nature sounds' },
];

export default function SoundSettings() {
  const { getPreferences, updatePreferences, startAmbient, stopAmbient } = useSound();
  const [prefs, setPrefs] = useState<SoundPreferences>(getPreferences());

  // Sync with service when component mounts
  useEffect(() => {
    setPrefs(getPreferences());
  }, [getPreferences]);

  const handleToggleEnabled = () => {
    const newEnabled = !prefs.enabled;
    updatePreferences({ enabled: newEnabled });
    setPrefs({ ...prefs, enabled: newEnabled });
    if (!newEnabled) {
      stopAmbient();
    }
  };

  const handleToggleAmbient = () => {
    const newAmbientEnabled = !prefs.ambientEnabled;
    updatePreferences({ ambientEnabled: newAmbientEnabled });
    setPrefs({ ...prefs, ambientEnabled: newAmbientEnabled });
    if (newAmbientEnabled) {
      startAmbient();
    } else {
      stopAmbient();
    }
  };

  const handleToggleSfx = () => {
    const newSfxEnabled = !prefs.sfxEnabled;
    updatePreferences({ sfxEnabled: newSfxEnabled });
    setPrefs({ ...prefs, sfxEnabled: newSfxEnabled });
  };

  const handleAmbientVolume = (value: number) => {
    updatePreferences({ ambientVolume: value });
    setPrefs({ ...prefs, ambientVolume: value });
  };

  const handleSfxVolume = (value: number) => {
    updatePreferences({ sfxVolume: value });
    setPrefs({ ...prefs, sfxVolume: value });
  };

  const handleTrackChange = (track: AmbientTrack) => {
    updatePreferences({ ambientTrack: track });
    setPrefs({ ...prefs, ambientTrack: track });
    if (track !== 'none' && prefs.ambientEnabled) {
      startAmbient(track);
    }
  };

  return (
    <div className="card" style={{ padding: '20px' }}>
      <h2 style={{ marginBottom: '20px', fontSize: '18px' }}>Sound Settings</h2>

      {/* Master toggle */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={prefs.enabled}
            onChange={handleToggleEnabled}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
          <div>
            <div style={{ fontWeight: 600 }}>Enable Sounds</div>
            <div className="tiny" style={{ color: 'var(--txt-2)' }}>
              Master toggle for all sounds
            </div>
          </div>
        </label>
      </div>

      {prefs.enabled && (
        <>
          {/* Ambient sound settings */}
          <div style={{ marginBottom: '24px', paddingTop: '20px', borderTop: '1px solid var(--line-1)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={prefs.ambientEnabled}
                onChange={handleToggleAmbient}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontWeight: 600 }}>Ambient Background Sound</div>
                <div className="tiny" style={{ color: 'var(--txt-2)' }}>
                  Soothing background audio
                </div>
              </div>
            </label>

            {prefs.ambientEnabled && (
              <div style={{ marginLeft: '30px' }}>
                {/* Track selection */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', marginBottom: '8px', color: 'var(--txt-2)' }}>Track</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {AMBIENT_TRACKS.filter(t => t.value !== 'none').map((track) => (
                      <label key={track.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="ambient-track"
                          value={track.value}
                          checked={prefs.ambientTrack === track.value}
                          onChange={() => handleTrackChange(track.value)}
                          style={{ cursor: 'pointer' }}
                        />
                        <div>
                          <div style={{ fontSize: '14px' }}>{track.label}</div>
                          <div className="tiny" style={{ color: 'var(--txt-3)' }}>{track.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Volume slider */}
                <div>
                  <div style={{ fontSize: '13px', marginBottom: '8px', color: 'var(--txt-2)' }}>
                    Volume: {Math.round(prefs.ambientVolume * 100)}%
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={prefs.ambientVolume}
                    onChange={(e) => handleAmbientVolume(parseFloat(e.target.value))}
                    style={{ width: '100%', cursor: 'pointer' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* SFX settings */}
          <div style={{ paddingTop: '20px', borderTop: '1px solid var(--line-1)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={prefs.sfxEnabled}
                onChange={handleToggleSfx}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontWeight: 600 }}>Action Sounds</div>
                <div className="tiny" style={{ color: 'var(--txt-2)' }}>
                  Feedback sounds for UI actions
                </div>
              </div>
            </label>

            {prefs.sfxEnabled && (
              <div style={{ marginLeft: '30px' }}>
                <div style={{ fontSize: '13px', marginBottom: '8px', color: 'var(--txt-2)' }}>
                  Volume: {Math.round(prefs.sfxVolume * 100)}%
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={prefs.sfxVolume}
                  onChange={(e) => handleSfxVolume(parseFloat(e.target.value))}
                  style={{ width: '100%', cursor: 'pointer' }}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
