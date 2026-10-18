import { templateByEvent, type TemplateDefinition } from "./catalogue.js";
import type {
  Channel, DeliveryAdapter, DeliveryResult, NotificationEvent,
  NotificationPreferences, NotificationRepository, PreferenceProvider,
  Recipient, RenderedMessage
} from "./types.js";

const TOKEN = /\{\{([a-zA-Z0-9_]+)\}\}/g;

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function valueToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  throw new Error("Template variables must be primitive values");
}

function renderText(template: string, data: Record<string, unknown>): string {
  return template.replace(TOKEN, (_match, key: string) => {
    if (!(key in data)) throw new Error(`Missing required template variable: ${key}`);
    return valueToString(data[key]);
  });
}

export function renderTemplate(definition: TemplateDefinition, event: NotificationEvent): RenderedMessage {
  for (const key of definition.required) {
    if (!(key in event.data) || event.data[key] === undefined || event.data[key] === null) {
      throw new Error(`Missing required field "${key}" for ${definition.eventType}`);
    }
  }
  const data = {...event.data, network_name: event.network ?? "unknown"};
  const rendered: RenderedMessage = {
    templateId: definition.id,
    version: definition.version,
    channel: "in_app",
    title: renderText(definition.title, data),
    body: renderText(definition.body, data),
    severity: definition.severity,
    category: definition.category,
    occurredAt: event.occurredAt,
    ...(event.referenceId ? {referenceId: event.referenceId} : {}),
    ...(definition.subject ? {subject: renderText(definition.subject, data)} : {})
  };
  // HTML output is escaped at the final rendering boundary by adapters that create HTML.
  return rendered;
}

export function renderHtmlBody(message: RenderedMessage): string {
  return `<h2>${escapeHtml(message.title)}</h2><p>${escapeHtml(message.body).replaceAll("\n", "<br>")}</p>`;
}

export function createNotification(input: Omit<NotificationEvent, "occurredAt"> & {occurredAt?: string}): NotificationEvent {
  return {
    ...input,
    occurredAt: input.occurredAt ?? new Date().toISOString()
  };
}

function enabled(preferences: NotificationPreferences, channel: Channel): boolean {
  if (channel === "in_app") return preferences.in_app !== false;
  if (channel === "email") return preferences.email !== false;
  if (channel === "sms") return preferences.sms === true;
  if (channel === "push") return preferences.push === true;
  return false;
}

export async function dispatchNotification(
  event: NotificationEvent,
  deps: {
    adapter: DeliveryAdapter;
    preferences: PreferenceProvider;
    repository: NotificationRepository;
  }
): Promise<DeliveryResult[]> {
  const key = `${event.eventType}:${event.eventId}:${event.recipient.userId}`;
  if (await deps.repository.hasProcessed(key)) {
    return [{channel:"in_app", status:"skipped", reason:"duplicate_event"}];
  }

  const definition = templateByEvent.get(event.eventType);
  if (!definition) throw new Error(`No notification template registered for event type: ${event.eventType}`);
  const preferences = await deps.preferences.getPreferences(event.recipient.userId);
  const base = renderTemplate(definition, event);
  const results: DeliveryResult[] = [];

  for (const channel of definition.channels) {
    if (!enabled(preferences, channel)) {
      results.push({channel, status:"skipped", reason:"disabled_or_not_configured"});
      continue;
    }
    if (channel === "email" && !event.recipient.email) {
      results.push({channel, status:"skipped", reason:"missing_email"});
      continue;
    }
    if (channel === "sms" && !event.recipient.phone) {
      results.push({channel, status:"skipped", reason:"missing_phone"});
      continue;
    }
    if (channel === "push" && !event.recipient.pushEnabled) {
      results.push({channel, status:"skipped", reason:"push_not_enabled"});
      continue;
    }
    try {
      results.push(await deps.adapter.deliver(event.recipient, {...base, channel}));
    } catch {
      results.push({channel, status:"failed", reason:"provider_error"});
    }
  }

  await deps.repository.record(event, results);
  await deps.repository.markProcessed(key);
  return results;
}
