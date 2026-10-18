import { createNotification, dispatchNotification } from "./engine.js";
import type { DeliveryAdapter, NotificationEvent, NotificationPreferences, NotificationRepository, PreferenceProvider } from "./types.js";

const adapter: DeliveryAdapter = {
  async deliver(_recipient, message) {
    console.log(`[DEMO ${message.channel.toUpperCase()}] ${message.title}: ${message.body}`);
    return {channel: message.channel, status:"queued"};
  }
};
const preferences: PreferenceProvider = {
  async getPreferences(_userId): Promise<NotificationPreferences> {
    return {in_app:true, email:true, sms:false, push:false};
  }
};
const seen = new Set<string>();
const repository: NotificationRepository = {
  async hasProcessed(key) { return seen.has(key); },
  async record(event: NotificationEvent, results) { console.log("Recorded event", event.eventId, results); },
  async markProcessed(key) { seen.add(key); }
};

const event = createNotification({
  eventId: "demo-evt-001",
  eventType: "wallet.deposit_confirmed",
  recipient: {userId:"demo-user", email:"demo@example.invalid"},
  category:"wallet",
  severity:"success",
  network:"testnet",
  referenceId:"demo-reference",
  data:{amount:"25.00",asset:"MLCNS",available_balance:"125.00",tx_hash_short:"abc123…"}
});
await dispatchNotification(event, {adapter, preferences, repository});
