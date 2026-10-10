import React, { useState, useEffect } from 'react';
import { 
  Mail, MessageCircle, Send, Share2, Code, 
  Play, Radio, User, Music, Heart
} from 'lucide-react';
import { toast } from '../../../components/ui';
import { settingsApi } from '../../../services/settingsApi';
import './SocialAccounts.css';

export interface SocialAccount {
  platform: string;
  handle?: string;
  connected: boolean;
  url?: string;
  lastConnected?: string;
}

interface SocialAccountsProps {
  onUpdate?: () => void;
}

// Icon mapping using available lucide-react icons
const ICON_MAP: Record<string, React.ReactNode> = {
  twitter: <Mail size={24} />,
  discord: <MessageCircle size={24} />,
  telegram: <Send size={24} />,
  reddit: <Share2 size={24} />,
  github: <Code size={24} />,
  youtube: <Play size={24} />,
  twitch: <Radio size={24} />,
  linkedin: <User size={24} />,
  tiktok: <Music size={24} />,
  instagram: <Heart size={24} />,
};

const SOCIAL_PLATFORMS = [
  { id: 'twitter', name: 'Twitter/X', icon: ICON_MAP.twitter, color: '#1DA1F2' },
  { id: 'discord', name: 'Discord', icon: ICON_MAP.discord, color: '#5865F2' },
  { id: 'telegram', name: 'Telegram', icon: ICON_MAP.telegram, color: '#0088cc' },
  { id: 'reddit', name: 'Reddit', icon: ICON_MAP.reddit, color: '#FF4500' },
  { id: 'github', name: 'GitHub', icon: ICON_MAP.github, color: '#ffffff' },
  { id: 'youtube', name: 'YouTube', icon: ICON_MAP.youtube, color: '#FF0000' },
  { id: 'twitch', name: 'Twitch', icon: ICON_MAP.twitch, color: '#9146FF' },
  { id: 'linkedin', name: 'LinkedIn', icon: ICON_MAP.linkedin, color: '#0A66C2' },
  { id: 'tiktok', name: 'TikTok', icon: ICON_MAP.tiktok, color: '#000000' },
  { id: 'instagram', name: 'Instagram', icon: ICON_MAP.instagram, color: '#E4405F' },
];

export function SocialAccounts({ onUpdate }: SocialAccountsProps) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [editingPlatform, setEditingPlatform] = useState<string | null>(null);
  const [editHandle, setEditHandle] = useState('');

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await settingsApi.getSocialAccounts();
      if (res.ok && res.data) {
        setAccounts(res.data);
      }
    } catch (error) {
      console.error('Failed to load social accounts:', error);
    }
    setLoading(false);
  };

  const handleConnect = async (platformId: string) => {
    setConnecting(platformId);
    try {
      // For now, open a simple modal to enter handle
      setEditingPlatform(platformId);
      setEditHandle('');
    } catch (error) {
      toast('Failed to connect account', false);
    }
    setConnecting(null);
  };

  const handleSaveHandle = async (platformId: string) => {
    if (!editHandle.trim()) {
      toast('Please enter a valid handle', false);
      return;
    }

    try {
      const res = await settingsApi.updateSocialAccount(platformId, editHandle.trim());
      if (res.ok) {
        toast(`${getPlatformName(platformId)} account linked`);
        setEditingPlatform(null);
        setEditHandle('');
        await loadAccounts();
        onUpdate?.();
      } else {
        toast(res.error || 'Failed to link account', false);
      }
    } catch (error) {
      toast('Error linking account', false);
    }
  };

  const handleDisconnect = async (platformId: string) => {
    if (!confirm('Remove this account?')) return;

    try {
      const res = await settingsApi.removeSocialAccount(platformId);
      if (res.ok) {
        toast(`${getPlatformName(platformId)} account removed`);
        await loadAccounts();
        onUpdate?.();
      } else {
        toast(res.error || 'Failed to remove account', false);
      }
    } catch (error) {
      toast('Error removing account', false);
    }
  };

  const getPlatformName = (platformId: string) => {
    return SOCIAL_PLATFORMS.find(p => p.id === platformId)?.name || platformId;
  };

  const getConnectedAccount = (platformId: string) => {
    return accounts.find(a => a.platform === platformId);
  };

  return (
    <div className="social-accounts">
      <div className="sec-title">
        <h2>Social Accounts</h2>
        <span className="tiny">Link your social media profiles for content creation and publishing</span>
      </div>

      {loading ? (
        <div className="loading">Loading social accounts...</div>
      ) : (
        <div className="social-grid">
          {SOCIAL_PLATFORMS.map((platform) => {
            const connected = getConnectedAccount(platform.id);

            return (
              <div key={platform.id} className="social-card">
                <div className="social-header">
                  <div 
                    className="social-icon" 
                    style={{ 
                      backgroundColor: platform.color,
                      color: platform.id === 'github' ? '#000' : '#fff'
                    }}
                  >
                    {platform.icon}
                  </div>
                  <div className="social-info">
                    <div className="social-name">{platform.name}</div>
                    <div className="social-status">
                      {connected ? (
                        <span className="connected-badge">
                          ✓ Connected
                        </span>
                      ) : (
                        <span className="disconnected-badge">Not connected</span>
                      )}
                    </div>
                  </div>
                </div>

                {connected && (
                  <div className="social-handle">
                    <div className="tiny">Handle</div>
                    <div className="handle-value">{connected.handle}</div>
                  </div>
                )}

                <div className="social-actions">
                  {editingPlatform === platform.id ? (
                    <div className="edit-mode">
                      <input
                        className="input input-sm"
                        type="text"
                        placeholder="Enter your handle or username"
                        value={editHandle}
                        onChange={(e) => setEditHandle(e.target.value)}
                        autoFocus
                      />
                      <div className="action-buttons">
                        <button 
                          className="btn btn-primary btn-sm"
                          onClick={() => handleSaveHandle(platform.id)}
                        >
                          Save
                        </button>
                        <button 
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setEditingPlatform(null);
                            setEditHandle('');
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {connected ? (
                        <>
                          <button 
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setEditingPlatform(platform.id);
                              setEditHandle(connected.handle || '');
                            }}
                          >
                            Edit
                          </button>
                          <button 
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--error)' }}
                            onClick={() => handleDisconnect(platform.id)}
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <button 
                          className="btn btn-primary btn-sm"
                          onClick={() => handleConnect(platform.id)}
                          disabled={connecting === platform.id}
                        >
                          {connecting === platform.id ? 'Connecting...' : 'Connect'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SocialAccounts;
