import test from "node:test";
import assert from "node:assert/strict";
import { createNotification, dispatchNotification, renderTemplate } from "../src/engine.js";
import { templateByEvent } from "../src/catalogue.js";
import type { DeliveryAdapter, NotificationEvent, NotificationPreferences, NotificationRepository, PreferenceProvider } from "../src/types.js";

function deps() {
  const sent: string[] = [];
  const seen = new Set<string>();
  const adapter: DeliveryAdapter = { async deliver(_recipient, message) {
    sent.push(message.channel + ":" + message.title);
    return {channel:message.channel,status:"queued"};
  }};
  const preferences: PreferenceProvider = {async getPreferences(_id): Promise<NotificationPreferences> {
    return {in_app:true,email:true,sms:false,push:false};
  }};
  const repository: NotificationRepository = {
    async hasProcessed(key) { return seen.has(key); },
    async record(_event, _results) {},
    async markProcessed(key) { seen.add(key); }
  };
  return {sent, adapter, preferences, repository};
}

test("renders confirmed deposit with correct values", () => {
  const event = createNotification({
    eventId:"e1",eventType:"wallet.deposit_confirmed",
    recipient:{userId:"u1"},category:"wallet",severity:"success",
    data:{amount:"12",asset:"MLCNS",available_balance:"44",tx_hash_short:"abc"}
  });
  const def = templateByEvent.get(event.eventType)!;
  const rendered = renderTemplate(def,event);
  assert.match(rendered.body,/12 MLCNS/);
  assert.match(rendered.body,/44 MLCNS/);
});

test("fails closed when required data is missing", () => {
  const event = createNotification({
    eventId:"e2",eventType:"wallet.deposit_confirmed",
    recipient:{userId:"u1"},category:"wallet",severity:"success",
    data:{amount:"12",asset:"MLCNS"}
  });
  assert.throws(() => renderTemplate(templateByEvent.get(event.eventType)!,event), /Missing required field/);
});

test("dispatches to configured channels and deduplicates", async () => {
  const d = deps();
  const event = createNotification({
    eventId:"e3",eventType:"wallet.deposit_confirmed",
    recipient:{userId:"u1",email:"u@example.invalid"},category:"wallet",severity:"success",
    data:{amount:"12",asset:"MLCNS",available_balance:"44",tx_hash_short:"abc"}
  });
  const first = await dispatchNotification(event,d);
  assert.equal(first.filter(x=>x.status==="queued").length,2);
  const second = await dispatchNotification(event,d);
  assert.equal(second[0]?.reason,"duplicate_event");
  assert.equal(d.sent.length,2);
});
