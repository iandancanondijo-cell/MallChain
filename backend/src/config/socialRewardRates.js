/**
 * Base MLPTS reward rates for verified social-campaign activities.
 *
 * Economic baseline: 1 MLPTS = KSh 2.00, 1 MLCNS ~= KSh 0.60-0.62, so
 * 1 MLCNS ~= 0.30-0.31 MLPTS. These are intentionally tiny fractions of an
 * MLPTS for high-frequency actions (view/like/etc) so the emission rate
 * stays sane — see DAILY_CAP_MLPTS below.
 *
 * Each activity's `rate` (or `min`/`max` for ranged activities like "complete
 * campaign") is a *base* reward. The actual per-campaign payout is
 * Base Reward x Campaign Multiplier x Verification Factor — see
 * services/rewardEngineService.js. Verification is handled by the existing
 * validator-vote flow (services/minesReviewService.js settle()), not a
 * separate flag here.
 *
 * Tiers (for reference/UI grouping only, not used in the payout formula):
 *  A = micro actions (view/impression/like/save)      ~0.05-1 MLPTS
 *  B = engagement (comment/share/repost/bookmark)      ~0.5-3 MLPTS
 *  C = acquisition (follow/subscribe/join)             ~1-17 MLPTS
 *  D = high-value campaign actions (complete/mission)  2-25+ MLPTS
 *  E = Mallchain-native activities (mining, governance, validator,
 *      dev contributions, bug bounty, marketplace, referrals) — these are
 *      NOT social-platform activities and are not enumerated here; they're
 *      rewarded directly by their own on-chain/off-chain flows.
 */

const PLATFORMS = {
  tiktok: {
    label: 'TikTok',
    icon: 'tiktok',
    dailyCapMlpts: 15,
    activities: {
      view: { rate: 0.08, tier: 'A' },
      like: { rate: 0.10, tier: 'A' },
      comment: { rate: 0.23, tier: 'B' },
      follow: { rate: 0.35, tier: 'C' },
      share: { rate: 0.30, tier: 'B' },
      save: { rate: 0.18, tier: 'A' },
      profile_visit: { rate: 0.05, tier: 'A' },
      complete_campaign: { min: 1, max: 5, tier: 'D' },
    },
  },
  instagram: {
    label: 'Instagram',
    icon: 'instagram',
    activities: {
      view: { rate: 0.28, tier: 'A' },
      like: { rate: 0.391, tier: 'A' },
      comment: { rate: 0.51, tier: 'B' },
      follow: { rate: 3, tier: 'C' },
      save: { rate: 0.75, tier: 'A' },
      share: { rate: 0.90, tier: 'B' },
      story_view: { rate: 0.20, tier: 'A' },
      profile_visit: { rate: 0.12, tier: 'A' },
    },
  },
  youtube: {
    label: 'YouTube',
    icon: 'youtube',
    activities: {
      view: { rate: 0.80, tier: 'A' },
      like: { rate: 1, tier: 'B' },
      comment: { rate: 1.40, tier: 'B' },
      subscribe: { rate: 4, tier: 'C' },
      share: { rate: 1.50, tier: 'B' },
      save_to_playlist: { rate: 1, tier: 'B' },
      watch_campaign_video: { rate: 1.5, tier: 'D' },
    },
  },
  whatsapp: {
    label: 'WhatsApp',
    icon: 'whatsapp',
    activities: {
      join_group: { rate: 3, tier: 'C' },
      join_community: { rate: 7, tier: 'C' },
      participate_in_campaign: { rate: 5, tier: 'D' },
      verified_campaign_interaction: { rate: 2, tier: 'B' },
      share_campaign: { rate: 3, tier: 'B' },
    },
  },
  telegram: {
    label: 'Telegram',
    icon: 'telegram',
    activities: {
      join_channel: { rate: 5, tier: 'C' },
      join_group: { rate: 6, tier: 'C' },
      join_community: { rate: 8, tier: 'C' },
      complete_verified_campaign: { rate: 10, tier: 'D' },
      link_interaction: { rate: 2, tier: 'B' },
      share_campaign: { rate: 4, tier: 'B' },
    },
  },
  facebook: {
    // Follows Instagram's rates per spec.
    label: 'Facebook',
    icon: 'facebook',
    activities: {
      view: { rate: 0.28, tier: 'A' },
      like: { rate: 0.391, tier: 'A' },
      comment: { rate: 0.51, tier: 'B' },
      follow: { rate: 3, tier: 'C' },
      save: { rate: 0.75, tier: 'A' },
      share: { rate: 0.90, tier: 'B' },
    },
  },
  threads: {
    // Same baseline as Instagram, plus repost.
    label: 'Threads',
    icon: 'threads',
    activities: {
      view: { rate: 0.28, tier: 'A' },
      like: { rate: 0.391, tier: 'A' },
      comment: { rate: 0.51, tier: 'B' },
      follow: { rate: 3, tier: 'C' },
      repost: { rate: 0.90, tier: 'B' },
      share: { rate: 0.90, tier: 'B' },
    },
  },
  x: {
    label: 'X',
    icon: 'x',
    // 9 MLPTS/impression is only for specifically sponsored/qualified
    // impressions (verified via the campaign vote flow), never ordinary
    // scrolling impressions — enforced by requiring campaign_id + reviewer
    // approval for every rewarded action, same as every other platform here.
    activities: {
      impression: { rate: 9, tier: 'B', note: 'campaign-qualified impressions only' },
      like: { rate: 11, tier: 'B' },
      comment: { rate: 13, tier: 'B' },
      repost: { rate: 17, tier: 'B' },
      follow: { rate: 15, tier: 'C' },
      bookmark: { rate: 8, tier: 'B' },
    },
  },
  snapchat: {
    label: 'Snapchat',
    icon: 'snapchat',
    activities: {
      story_view: { rate: 0.25, tier: 'A' },
      spotlight_view: { rate: 0.30, tier: 'A' },
      like: { rate: 0.45, tier: 'A' },
      follow: { rate: 2.5, tier: 'C' },
      share: { rate: 0.75, tier: 'B' },
      complete_campaign: { min: 1, max: 4, tier: 'D' },
    },
  },
  reddit: {
    label: 'Reddit',
    icon: 'reddit',
    activities: {
      view: { rate: 0.20, tier: 'A' },
      upvote: { rate: 0.35, tier: 'A' },
      comment: { rate: 0.60, tier: 'B' },
      follow_community: { rate: 1.5, tier: 'C' },
      join_community: { rate: 2, tier: 'C' },
      campaign_participation: { min: 2, max: 5, tier: 'D' },
    },
  },
  discord: {
    label: 'Discord',
    icon: 'discord',
    activities: {
      join_server: { rate: 3, tier: 'C' },
      verify_membership: { rate: 2, tier: 'B' },
      join_campaign_channel: { rate: 1, tier: 'B' },
      participate_in_verified_event: { rate: 5, tier: 'D' },
      complete_community_task: { min: 3, max: 10, tier: 'D' },
      // Developer/community contribution reward is set per-contribution by
      // an admin, not a flat base rate — see Tier E note above.
    },
  },
  linkedin: {
    label: 'LinkedIn',
    icon: 'linkedin',
    activities: {
      view: { rate: 0.50, tier: 'A' },
      like: { rate: 0.75, tier: 'A' },
      comment: { rate: 1.50, tier: 'B' },
      follow: { rate: 3, tier: 'C' },
      repost: { rate: 2, tier: 'B' },
      share: { rate: 2, tier: 'B' },
      campaign_completion: { min: 2, max: 6, tier: 'D' },
    },
  },
  pinterest: {
    label: 'Pinterest',
    icon: 'pinterest',
    activities: {
      pin_view: { rate: 0.20, tier: 'A' },
      like: { rate: 0.30, tier: 'A' },
      save_pin: { rate: 0.50, tier: 'A' },
      follow: { rate: 2, tier: 'C' },
      share: { rate: 0.60, tier: 'B' },
    },
  },
  twitch: {
    label: 'Twitch',
    icon: 'twitch',
    activities: {
      stream_view: { rate: 0.50, tier: 'A' },
      follow: { rate: 2, tier: 'C' },
      clip_view: { rate: 0.30, tier: 'A' },
      clip_interaction: { rate: 0.50, tier: 'B' },
      verified_campaign_participation: { min: 2, max: 5, tier: 'D' },
    },
  },
  spotify: {
    label: 'Spotify',
    icon: 'spotify',
    activities: {
      campaign_track_listen: { rate: 0.50, tier: 'A' },
      playlist_follow: { rate: 1.5, tier: 'C' },
      artist_follow: { rate: 2, tier: 'C' },
      campaign_playlist_save: { rate: 1, tier: 'B' },
      verified_campaign_completion: { min: 2, max: 5, tier: 'D' },
    },
  },
  medium: {
    label: 'Medium / Blog',
    icon: 'medium',
    activities: {
      article_read: { rate: 0.50, tier: 'A' },
      follow_author: { rate: 1.5, tier: 'C' },
      like_recommend: { rate: 0.75, tier: 'A' },
      comment: { rate: 1.25, tier: 'B' },
      complete_article_campaign: { rate: 2, tier: 'D' },
    },
  },
};

// Fallback daily MLPTS-earning cap (per user, across all campaign activity
// on a platform) for any platform without an explicit cap set above. Keeps
// emission bounded even for platforms where a per-platform cap wasn't
// specified — see the X-impression math in the module docstring above for
// why unrestricted high-frequency rewards are dangerous at this scale.
const DEFAULT_DAILY_CAP_MLPTS = 20;

// Campaign creators can scale a platform/activity's base rate by this much
// in either direction (0.5x-5x) when funding a campaign.
const MIN_CAMPAIGN_MULTIPLIER = 0.5;
const MAX_CAMPAIGN_MULTIPLIER = 5;

function getPlatform(platformKey) {
  return PLATFORMS[platformKey] || null;
}

function getActivity(platformKey, activityKey) {
  const platform = getPlatform(platformKey);
  return platform?.activities?.[activityKey] || null;
}

function getDailyCapMlpts(platformKey) {
  return getPlatform(platformKey)?.dailyCapMlpts ?? DEFAULT_DAILY_CAP_MLPTS;
}

module.exports = {
  PLATFORMS,
  DEFAULT_DAILY_CAP_MLPTS,
  MIN_CAMPAIGN_MULTIPLIER,
  MAX_CAMPAIGN_MULTIPLIER,
  getPlatform,
  getActivity,
  getDailyCapMlpts,
};
