import {
  SiTiktok, SiInstagram, SiYoutube, SiWhatsapp, SiTelegram, SiFacebook, SiThreads, SiX,
  SiSnapchat, SiReddit, SiDiscord, SiPinterest, SiTwitch, SiSpotify, SiMedium,
} from 'react-icons/si';
import { FaLinkedin } from 'react-icons/fa6';
import type { IconType } from 'react-icons';

/**
 * Real brand marks (react-icons' Simple Icons set, Font Awesome for LinkedIn
 * — Simple Icons dropped it) instead of generic lucide-react stand-ins.
 * `bg` is each platform's real brand color, `fg` is the glyph color chosen
 * for contrast against that specific background (not the app's theme) so
 * these read correctly as brand badges regardless of light/dark mode.
 * Keyed by the same platform key the backend rate table uses
 * (backend/src/config/socialRewardRates.js).
 */
export const PLATFORM_BRAND: Record<string, { Icon: IconType; label: string; bg: string; fg: string }> = {
  tiktok: { Icon: SiTiktok, label: 'TikTok', bg: '#000000', fg: '#ffffff' },
  instagram: { Icon: SiInstagram, label: 'Instagram', bg: '#E4405F', fg: '#ffffff' },
  youtube: { Icon: SiYoutube, label: 'YouTube', bg: '#FF0000', fg: '#ffffff' },
  whatsapp: { Icon: SiWhatsapp, label: 'WhatsApp', bg: '#25D366', fg: '#ffffff' },
  telegram: { Icon: SiTelegram, label: 'Telegram', bg: '#26A5E4', fg: '#ffffff' },
  facebook: { Icon: SiFacebook, label: 'Facebook', bg: '#1877F2', fg: '#ffffff' },
  threads: { Icon: SiThreads, label: 'Threads', bg: '#000000', fg: '#ffffff' },
  x: { Icon: SiX, label: 'X', bg: '#000000', fg: '#ffffff' },
  snapchat: { Icon: SiSnapchat, label: 'Snapchat', bg: '#FFFC00', fg: '#000000' },
  reddit: { Icon: SiReddit, label: 'Reddit', bg: '#FF4500', fg: '#ffffff' },
  discord: { Icon: SiDiscord, label: 'Discord', bg: '#5865F2', fg: '#ffffff' },
  linkedin: { Icon: FaLinkedin, label: 'LinkedIn', bg: '#0A66C2', fg: '#ffffff' },
  pinterest: { Icon: SiPinterest, label: 'Pinterest', bg: '#E60023', fg: '#ffffff' },
  twitch: { Icon: SiTwitch, label: 'Twitch', bg: '#9146FF', fg: '#ffffff' },
  spotify: { Icon: SiSpotify, label: 'Spotify', bg: '#1DB954', fg: '#000000' },
  medium: { Icon: SiMedium, label: 'Medium / Blog', bg: '#000000', fg: '#ffffff' },
};

/** Bare glyph, inherits surrounding text color — for inline/compact use (lists, chips). */
export function PlatformIcon({ platform, size = 18 }: { platform: string; size?: number }) {
  const brand = PLATFORM_BRAND[platform];
  if (!brand) return null;
  const { Icon } = brand;
  return <Icon size={size} />;
}

/** Real brand color badge (circular, platform color + contrast-matched glyph) — for the platform picker. */
export function PlatformBadge({ platform, size = 40 }: { platform: string; size?: number }) {
  const brand = PLATFORM_BRAND[platform];
  if (!brand) return null;
  const { Icon, bg, fg } = brand;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Icon size={Math.round(size * 0.52)} color={fg} />
    </div>
  );
}
