/**
 * SoundService — manages ambient background sounds and action-triggered SFX.
 * All sounds are user-toggleable and respect the prefers-reduced-motion media
 * query. Sounds are lazy-loaded to avoid blocking initial page load.
 *
 * Ambient sounds: soothing, looped background audio (e.g., soft pads, nature)
 * Action sounds: short, distinct SFX for UI feedback (click, success, error, etc.)
 */

type SoundAction =
  | 'click'
  | 'hover'
  | 'success'
  | 'error'
  | 'warning'
  | 'notification'
  | 'send'
  | 'receive'
  | 'confirm'
  | 'cancel';

type AmbientTrack = 'calm' | 'focus' | 'nature' | 'none';

interface SoundPreferences {
  enabled: boolean;
  ambientEnabled: boolean;
  ambientTrack: AmbientTrack;
  ambientVolume: number; // 0-1
  sfxEnabled: boolean;
  sfxVolume: number; // 0-1
}

const DEFAULT_PREFERENCES: SoundPreferences = {
  enabled: true,
  ambientEnabled: false,
  ambientTrack: 'calm',
  ambientVolume: 0.3,
  sfxEnabled: true,
  sfxVolume: 0.5,
};

const STORAGE_KEY = 'mallchain_sound_prefs';

// Sound file paths — these would be actual audio files in production
// For now, we'll use the Web Audio API to generate simple tones
const SOUND_PATHS: Record<SoundAction, string> = {
  click: '/sounds/click.mp3',
  hover: '/sounds/hover.mp3',
  success: '/sounds/success.mp3',
  error: '/sounds/error.mp3',
  warning: '/sounds/warning.mp3',
  notification: '/sounds/notification.mp3',
  send: '/sounds/send.mp3',
  receive: '/sounds/receive.mp3',
  confirm: '/sounds/confirm.mp3',
  cancel: '/sounds/cancel.mp3',
};

const AMBIENT_PATHS: Record<Exclude<AmbientTrack, 'none'>, string> = {
  calm: '/sounds/ambient-calm.mp3',
  focus: '/sounds/ambient-focus.mp3',
  nature: '/sounds/ambient-nature.mp3',
};

class SoundService {
  private preferences: SoundPreferences;
  private audioContext: AudioContext | null = null;
  private ambientAudio: HTMLAudioElement | null = null;
  private sfxCache: Map<SoundAction, HTMLAudioElement> = new Map();
  private initialized = false;

  constructor() {
    this.preferences = this.loadPreferences();
  }

  private loadPreferences(): SoundPreferences {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('Failed to load sound preferences', e);
    }
    return DEFAULT_PREFERENCES;
  }

  private savePreferences(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.preferences));
    } catch (e) {
      console.warn('Failed to save sound preferences', e);
    }
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioContext;
  }

  private shouldPlaySound(): boolean {
    // Respect prefers-reduced-motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return false;
    }
    return this.preferences.enabled;
  }

  // Generate a simple tone using Web Audio API (fallback when no audio files)
  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine'): void {
    if (!this.shouldPlaySound() || !this.preferences.sfxEnabled) return;

    try {
      const ctx = this.getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = type;

      gainNode.gain.setValueAtTime(this.preferences.sfxVolume * 0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Failed to play tone', e);
    }
  }

  // Play an action sound
  playAction(action: SoundAction): void {
    if (!this.shouldPlaySound() || !this.preferences.sfxEnabled) return;

    // Try to load and play the audio file first
    const audio = this.sfxCache.get(action);
    if (audio) {
      audio.currentTime = 0;
      audio.volume = this.preferences.sfxVolume;
      audio.play().catch(() => {
        // Fallback to tone if audio fails
        this.playFallbackTone(action);
      });
      return;
    }

    // If no cached audio, try to load it
    const path = SOUND_PATHS[action];
    const newAudio = new Audio(path);
    newAudio.preload = 'auto';
    this.sfxCache.set(action, newAudio);

    newAudio.addEventListener('canplaythrough', () => {
      newAudio.volume = this.preferences.sfxVolume;
      newAudio.play().catch(() => {
        this.playFallbackTone(action);
      });
    }, { once: true });

    newAudio.addEventListener('error', () => {
      // If audio file fails, use tone as fallback
      this.playFallbackTone(action);
    }, { once: true });

    // Try to play immediately (might fail if not loaded yet)
    newAudio.play().catch(() => {
      this.playFallbackTone(action);
    });
  }

  // Fallback tones for each action (used when audio files aren't available)
  private playFallbackTone(action: SoundAction): void {
    const tones: Record<SoundAction, [number, number, OscillatorType]> = {
      click: [800, 0.05, 'sine'],
      hover: [600, 0.03, 'sine'],
      success: [523.25, 0.2, 'sine'], // C5
      error: [200, 0.3, 'sawtooth'],
      warning: [400, 0.2, 'triangle'],
      notification: [659.25, 0.15, 'sine'], // E5
      send: [440, 0.1, 'sine'],
      receive: [554.37, 0.1, 'sine'], // C#5
      confirm: [698.46, 0.15, 'sine'], // F5
      cancel: [300, 0.15, 'triangle'],
    };

    const [freq, dur, type] = tones[action];
    this.playTone(freq, dur, type);
  }

  // Start ambient background sound
  startAmbient(track?: AmbientTrack): void {
    if (!this.shouldPlaySound() || !this.preferences.ambientEnabled) return;

    const selectedTrack = track || this.preferences.ambientTrack;
    if (selectedTrack === 'none') {
      this.stopAmbient();
      return;
    }

    // Stop current ambient if playing
    this.stopAmbient();

    const path = AMBIENT_PATHS[selectedTrack];
    this.ambientAudio = new Audio(path);
    this.ambientAudio.loop = true;
    this.ambientAudio.volume = this.preferences.ambientVolume;

    this.ambientAudio.play().catch((e) => {
      console.warn('Failed to play ambient sound', e);
    });
  }

  // Stop ambient background sound
  stopAmbient(): void {
    if (this.ambientAudio) {
      this.ambientAudio.pause();
      this.ambientAudio.currentTime = 0;
      this.ambientAudio = null;
    }
  }

  // Get current preferences
  getPreferences(): SoundPreferences {
    return { ...this.preferences };
  }

  // Update preferences
  updatePreferences(updates: Partial<SoundPreferences>): void {
    this.preferences = { ...this.preferences, ...updates };
    this.savePreferences();

    // Apply changes immediately
    if (this.ambientAudio) {
      this.ambientAudio.volume = this.preferences.ambientVolume;
    }

    // Restart ambient if track changed
    if (updates.ambientTrack || updates.ambientEnabled !== undefined) {
      if (this.preferences.ambientEnabled) {
        this.startAmbient();
      } else {
        this.stopAmbient();
      }
    }
  }

  // Enable/disable all sounds
  setEnabled(enabled: boolean): void {
    this.updatePreferences({ enabled });
    if (!enabled) {
      this.stopAmbient();
    }
  }

  // Initialize (must be called after user interaction due to browser autoplay policies)
  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Resume audio context if suspended
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }
  }
}

// Singleton instance
export const soundService = new SoundService();

// Export types for use in components
export type { SoundAction, AmbientTrack, SoundPreferences };
