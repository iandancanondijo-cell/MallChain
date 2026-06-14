import { useEffect } from 'react';
import { useUserStore } from '../store/userStore';

/**
 * Hook to apply user theme preferences to the document
 */
export function useTheme() {
    const { user } = useUserStore();

    useEffect(() => {
        if (!user?.preferences) return;

        const { theme, accentColor, fontSize, reducedMotion } = user.preferences;

        // Apply theme mode
        if (theme) {
            const root = document.documentElement;

            if (theme === 'auto') {
                // Use system preference
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                root.classList.toggle('dark', prefersDark);
                root.classList.toggle('light', !prefersDark);
            } else {
                root.classList.toggle('dark', theme === 'dark');
                root.classList.toggle('light', theme === 'light');
            }
        }

        // Apply accent color via CSS variable
        if (accentColor) {
            document.documentElement.style.setProperty('--accent-color', accentColor);
        }

        // Apply font size
        if (fontSize) {
            const fontSizeMap = {
                small: '14px',
                medium: '16px',
                large: '18px'
            };
            document.documentElement.style.setProperty('--base-font-size', fontSizeMap[fontSize]);
        }

        // Apply reduced motion
        if (reducedMotion !== undefined) {
            document.documentElement.classList.toggle('reduce-motion', reducedMotion);
        }

        console.log('[THEME] Applied preferences:', user.preferences);
    }, [user?.preferences]);
}
