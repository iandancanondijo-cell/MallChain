import { api } from './api';

export interface NotificationPreferences {
  _id: string;
  userId: string;
  enableNotifications: boolean;
  frequency: {
    transactions: 'immediate' | 'daily' | 'weekly' | 'disabled';
    campaigns: 'immediate' | 'daily' | 'weekly' | 'disabled';
    governance: 'immediate' | 'daily' | 'weekly' | 'disabled';
    security: 'immediate' | 'daily' | 'weekly' | 'disabled';
    marketing: 'immediate' | 'daily' | 'weekly' | 'disabled';
    badgeAlerts: 'immediate' | 'daily' | 'weekly' | 'disabled';
  };
  doNotDisturb: {
    enabled: boolean;
    startTime: string;
    endTime: string;
    timezone: string;
    days: string[];
  };
  channels: {
    email: boolean;
    push: boolean;
    sms: boolean;
    whatsapp: boolean;
    inApp: boolean;
  };
  unsubscribedCategories: string[];
  createdAt: string;
  updatedAt: string;
}

export type NotificationFrequencyValue = 'immediate' | 'daily' | 'weekly' | 'disabled';

/** The four columns the per-category matrix renders. `push` is the in-app
 *  column: NotificationPreferences has both a `push` and an `inApp` boolean and
 *  the only one any dispatcher reads is `inApp`. */
export type NotificationMatrixColumn = 'email' | 'push' | 'sms' | 'whatsapp';

/** What each column is called in the product, named once so the grid header and
 *  the toast that confirms a cell cannot drift apart. */
export const COLUMN_LABEL: Record<NotificationMatrixColumn, string> = {
  email: 'Email',
  // The in-app column. `push` is the key the per-category document uses; the
  // per-channel document's own `push` field is read by nothing and is not
  // offered here — that is the switch that used to sit under "Notification
  // Channels" and change no behaviour.
  push: 'In-app',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
};

export interface NotificationCell {
  /** Whether that channel may carry that category right now. */
  on: boolean;
  /** The per-channel switch, as stored. null = no NotificationPreferences row. */
  master: boolean | null;
  /** The per-category cell, as stored. null = the settings document has no opinion. */
  cell: boolean | null;
  /** Which switch is responsible for `on`. null = on, nothing is blocking it. */
  decidedBy: 'channel' | 'category' | 'both' | 'default' | null;
}

/**
 * What the two preference documents add up to, computed by
 * backend/src/services/notificationPolicy.js — the same function the
 * dispatchers call. Panels render their state from here, not from the document
 * they happen to edit, so a switch cannot advertise an effect the server does
 * not have.
 */
export interface EffectiveNotifications {
  globalEnabled: boolean;
  dnd: {
    enabled: boolean;
    /** True inside the quiet window as the server clocks it, not just "enabled". */
    active: boolean;
    startTime: string | null;
    endTime: string | null;
    timezone: string;
    days: string[];
  };
  unsubscribedCategories: string[];
  channels: Record<NotificationMatrixColumn, {
    /** The field of `channels` this column's header switch edits. */
    key: keyof NotificationPreferences['channels'];
    /** 'gate' = ANDed with every cell in the column; 'override' = decides alone. */
    mode: 'gate' | 'override';
    master: boolean | null;
  }>;
  /** `channels` as the document stores them — send this back with one key
   *  changed. Null when no NotificationPreferences row exists yet. */
  preferenceChannels: NotificationPreferences['channels'] | null;
  matrix: Array<{
    category: string;
    frequency: NotificationFrequencyValue;
    /** 'frequency' | 'unsubscribed' — reasons the whole row cannot deliver. */
    blockedBy: string[];
    cells: Record<NotificationMatrixColumn, NotificationCell>;
  }>;
  gates: {
    emailOnFile: boolean | null;
    phoneOnFile: boolean;
    phoneVerified: boolean;
    whatsappOptIn: boolean;
  };
  hasPreferenceDocument: boolean;
  hasSettingsDocument: boolean;
}

/**
 * A partial payload here used to blank out `frequency`/`channels` and crash the
 * whole Settings section on `prefs.frequency[cat]`, so every response is merged
 * over the defaults before any caller sees it.
 */
const DEFAULT_PREFS: NotificationPreferences = {
  _id: '',
  userId: '',
  enableNotifications: true,
  frequency: {
    transactions: 'immediate',
    campaigns: 'immediate',
    governance: 'immediate',
    security: 'immediate',
    marketing: 'daily',
    badgeAlerts: 'immediate',
  },
  doNotDisturb: { enabled: false, startTime: '22:00', endTime: '07:00', timezone: 'UTC', days: [] },
  channels: { email: true, push: true, sms: false, whatsapp: false, inApp: true },
  unsubscribedCategories: [],
  createdAt: '',
  updatedAt: '',
};

function withDefaults(data: NotificationPreferences): NotificationPreferences {
  return {
    ...DEFAULT_PREFS,
    ...data,
    frequency: { ...DEFAULT_PREFS.frequency, ...data.frequency },
    doNotDisturb: { ...DEFAULT_PREFS.doNotDisturb, ...data.doNotDisturb },
    channels: { ...DEFAULT_PREFS.channels, ...data.channels },
  };
}

function prefResponse<T extends { data?: NotificationPreferences }>(res: T): T {
  return res.data ? { ...res, data: withDefaults(res.data) } : res;
}

const MATRIX_COLUMNS: NotificationMatrixColumn[] = ['email', 'push', 'sms', 'whatsapp'];

/**
 * Same reasoning as withDefaults, one layer up: the panel reads
 * `eff.channels[col].key` and maps `eff.matrix` while rendering, so a response
 * that omits a column, a row or the gates object would blank the whole Settings
 * section instead of showing one incomplete card.
 */
function withEffectiveDefaults(data: EffectiveNotifications): EffectiveNotifications {
  const channels = { ...data.channels };
  for (const col of MATRIX_COLUMNS) {
    channels[col] ??= {
      key: col === 'push' ? 'inApp' : col,
      mode: col === 'push' ? 'override' : 'gate',
      master: null,
    };
  }
  const dnd: Partial<EffectiveNotifications['dnd']> = data.dnd ?? {};
  const gates: Partial<EffectiveNotifications['gates']> = data.gates ?? {};
  return {
    ...data,
    globalEnabled: data.globalEnabled !== false,
    unsubscribedCategories: Array.isArray(data.unsubscribedCategories) ? data.unsubscribedCategories : [],
    channels,
    matrix: Array.isArray(data.matrix)
      ? data.matrix.map((row) => ({ ...row, blockedBy: Array.isArray(row.blockedBy) ? row.blockedBy : [], cells: { ...row.cells } }))
      : [],
    dnd: {
      enabled: dnd.enabled === true,
      active: dnd.active === true,
      startTime: dnd.startTime ?? null,
      endTime: dnd.endTime ?? null,
      timezone: dnd.timezone ?? 'Africa/Nairobi',
      days: Array.isArray(dnd.days) ? dnd.days : [],
    },
    gates: {
      emailOnFile: typeof gates.emailOnFile === 'boolean' ? gates.emailOnFile : null,
      phoneOnFile: gates.phoneOnFile === true,
      phoneVerified: gates.phoneVerified === true,
      whatsappOptIn: gates.whatsappOptIn === true,
    },
  };
}

export const notificationPreferencesApi = {
  /**
   * Get user's notification preferences
   */
  async getPreferences() {
    return prefResponse(await api.get<NotificationPreferences>('/api/notification-preferences'));
  },

  /**
   * Both preference documents resolved into what delivery will actually do.
   * `getPreferences()` alone cannot render a switch honestly: it is one of the
   * two documents that decide.
   */
  async getEffective() {
    const res = await api.get<EffectiveNotifications>('/api/notification-preferences/effective');
    return res.ok && res.data ? { ...res, data: withEffectiveDefaults(res.data) } : res;
  },

  /**
   * Update notification frequency settings
   */
  async updateFrequency(frequency: NotificationPreferences['frequency']) {
    return prefResponse(await api.patch<NotificationPreferences>('/api/notification-preferences/frequency', {
      frequency,
    }));
  },

  /**
   * Update do-not-disturb settings
   */
  async updateDoNotDisturb(doNotDisturb: NotificationPreferences['doNotDisturb']) {
    return prefResponse(await api.patch<NotificationPreferences>('/api/notification-preferences/do-not-disturb', {
      doNotDisturb,
    }));
  },

  /**
   * Update notification channels
   */
  async updateChannels(channels: NotificationPreferences['channels']) {
    return prefResponse(await api.patch<NotificationPreferences>('/api/notification-preferences/channels', {
      channels,
    }));
  },

  /**
   * Toggle all notifications on/off
   */
  async toggleGlobal(enableNotifications: boolean) {
    return prefResponse(await api.patch<NotificationPreferences>('/api/notification-preferences/global-toggle', {
      enableNotifications,
    }));
  },

  /**
   * Unsubscribe from a notification category
   */
  async unsubscribe(category: string) {
    return api.post<NotificationPreferences>('/api/notification-preferences/unsubscribe', {
      category,
    });
  },

  /**
   * Resubscribe to a notification category
   */
  async resubscribe(category: string) {
    return api.post<NotificationPreferences>('/api/notification-preferences/resubscribe', {
      category,
    });
  },
};
