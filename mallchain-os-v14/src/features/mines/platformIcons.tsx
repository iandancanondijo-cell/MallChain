import {
  Music2, Instagram, Youtube, MessageCircle, Send, Facebook, AtSign, Twitter,
  Ghost, MessageSquare, Gamepad2, Linkedin, Pin, Twitch, Disc3, Newspaper,
  type LucideIcon,
} from 'lucide-react';

/**
 * lucide-react doesn't ship every platform's brand mark (no TikTok, no X
 * wordmark, no WhatsApp, etc), so several of these are the closest available
 * generic stand-in rather than the literal logo. Keyed by the same platform
 * key the backend rate table uses (backend/src/config/socialRewardRates.js).
 */
export const PLATFORM_ICONS: Record<string, LucideIcon> = {
  tiktok: Music2,
  instagram: Instagram,
  youtube: Youtube,
  whatsapp: MessageCircle,
  telegram: Send,
  facebook: Facebook,
  threads: AtSign,
  x: Twitter,
  snapchat: Ghost,
  reddit: MessageSquare,
  discord: Gamepad2,
  linkedin: Linkedin,
  pinterest: Pin,
  twitch: Twitch,
  spotify: Disc3,
  medium: Newspaper,
};

export function PlatformIcon({ platform, size = 18 }: { platform: string; size?: number }) {
  const Icon = PLATFORM_ICONS[platform];
  if (!Icon) return null;
  return <Icon size={size} />;
}
