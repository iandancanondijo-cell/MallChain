/**
 * useSound — React hook for playing sounds and managing sound preferences.
 * Provides methods to play action sounds and control ambient audio, plus
 * access to current preferences for building sound settings UI.
 */
import { useCallback, useEffect } from 'react';
import { soundService, type SoundAction, type AmbientTrack, type SoundPreferences } from '../services/soundService';

export function useSound() {
  // Initialize sound service on first user interaction
  useEffect(() => {
    const handleInteraction = () => {
      soundService.initialize();
      // Remove listeners after first interaction
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };

    window.addEventListener('click', handleInteraction, { once: true });
    window.addEventListener('keydown', handleInteraction, { once: true });

    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  // Play an action sound
  const playSound = useCallback((action: SoundAction) => {
    soundService.playAction(action);
  }, []);

  // Start ambient background sound
  const startAmbient = useCallback((track?: AmbientTrack) => {
    soundService.startAmbient(track);
  }, []);

  // Stop ambient background sound
  const stopAmbient = useCallback(() => {
    soundService.stopAmbient();
  }, []);

  // Get current preferences
  const getPreferences = useCallback((): SoundPreferences => {
    return soundService.getPreferences();
  }, []);

  // Update preferences
  const updatePreferences = useCallback((updates: Partial<SoundPreferences>) => {
    soundService.updatePreferences(updates);
  }, []);

  // Enable/disable all sounds
  const setEnabled = useCallback((enabled: boolean) => {
    soundService.setEnabled(enabled);
  }, []);

  return {
    playSound,
    startAmbient,
    stopAmbient,
    getPreferences,
    updatePreferences,
    setEnabled,
  };
}

// Convenience hooks for common actions
export function useClickSound() {
  const { playSound } = useSound();
  return useCallback(() => playSound('click'), [playSound]);
}

export function useSuccessSound() {
  const { playSound } = useSound();
  return useCallback(() => playSound('success'), [playSound]);
}

export function useErrorSound() {
  const { playSound } = useSound();
  return useCallback(() => playSound('error'), [playSound]);
}

export function useNotificationSound() {
  const { playSound } = useSound();
  return useCallback(() => playSound('notification'), [playSound]);
}
