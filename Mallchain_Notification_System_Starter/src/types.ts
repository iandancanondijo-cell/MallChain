export type Channel = "in_app" | "email" | "sms" | "push";
export type Severity = "info" | "success" | "warning" | "critical";
export type Network = "mainnet" | "testnet" | "unknown";

export interface Recipient {
  userId: string;
  email?: string;
  phone?: string;
  pushEnabled?: boolean;
}

export interface NotificationPreferences {
  in_app?: boolean;
  email?: boolean;
  sms?: boolean;
  push?: boolean;
  marketing?: boolean;
}

export interface NotificationEvent<T extends Record<string, unknown> = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  occurredAt: string;
  recipient: Recipient;
  category: string;
  severity: Severity;
  network?: Network;
  referenceId?: string;
  data: T;
}

export interface RenderedMessage {
  templateId: string;
  version: number;
  channel: Channel;
  subject?: string;
  title: string;
  body: string;
  severity: Severity;
  category: string;
  referenceId?: string;
  occurredAt: string;
}

export interface DeliveryResult {
  channel: Channel;
  status: "sent" | "queued" | "skipped" | "failed";
  providerMessageId?: string;
  reason?: string;
}

export interface DeliveryAdapter {
  deliver(recipient: Recipient, message: RenderedMessage): Promise<DeliveryResult>;
}

export interface PreferenceProvider {
  getPreferences(userId: string): Promise<NotificationPreferences>;
}

export interface NotificationRepository {
  hasProcessed(idempotencyKey: string): Promise<boolean>;
  record(event: NotificationEvent, result: DeliveryResult[]): Promise<void>;
  markProcessed(idempotencyKey: string): Promise<void>;
}

export interface NotificationQueue {
  enqueue(event: NotificationEvent): Promise<void>;
}
