/**
 * WhatsApp Business API webhook — receives delivery receipts,
 * incoming messages, and status updates from Meta's Cloud API.
 *
 * Meta requires a webhook URL to be configured in the WhatsApp Business
 * Manager. This route handles:
 *   - GET  /api/whatsapp/webhook — subscription verification challenge
 *   - POST /api/whatsapp/webhook — incoming events (messages, statuses)
 *
 * See: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */
const express = require('express');
const router = express.Router();
const { config } = require('../config');
const logger = require('../utils/logger');

// GET /api/whatsapp/webhook — Meta's subscription verification.
// When you configure the webhook URL in WhatsApp Business Manager, Meta
// sends a GET request with hub.mode, hub.verify_token, and hub.challenge.
// We must respond with the challenge value if the token matches.
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = config.whatsapp.meta.webhookVerifyToken;

  if (mode === 'subscribe' && token === expectedToken && challenge) {
    logger.info('whatsappWebhook', 'Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  logger.warn('whatsappWebhook', 'Webhook verification failed — token mismatch', { mode, token });
  return res.sendStatus(403);
});

// POST /api/whatsapp/webhook — incoming events from Meta.
// Meta sends a POST with a `body.entry[]` array containing changes.
// Each change has a `value` with `messages`, `statuses`, or other events.
// We acknowledge receipt immediately (Meta requires a 2xx within 20 seconds)
// and process events asynchronously.
router.post('/webhook', (req, res) => {
  // Always respond 200 immediately — Meta retries if it doesn't get a 2xx
  res.sendStatus(200);

  const body = req.body;
  if (body.object !== 'whatsapp_business_account') {
    return;
  }

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value) continue;

      // Handle incoming messages from users
      if (value.messages) {
        for (const message of value.messages) {
          handleIncomingMessage(message, value.metadata).catch((err) => {
            logger.error('whatsappWebhook', 'Failed to handle incoming message', err, { messageId: message.id });
          });
        }
      }

      // Handle delivery/status updates
      if (value.statuses) {
        for (const status of value.statuses) {
          handleStatusUpdate(status, value.metadata).catch((err) => {
            logger.error('whatsappWebhook', 'Failed to handle status update', err, { messageId: status.id });
          });
        }
      }
    }
  }
});

/**
 * Handle an incoming message from a WhatsApp user.
 * Currently logs — future: parse commands like STOP, HELP, etc.
 */
async function handleIncomingMessage(message, metadata) {
  const from = message.from;
  const type = message.type;
  const timestamp = new Date(Number(message.timestamp) * 1000);

  logger.info('whatsappWebhook', `Incoming ${type} message from ${from}`, {
    messageId: message.id,
    from,
    type,
    timestamp,
    phoneNumberId: metadata?.phone_number_id,
  });

  // Handle text messages — parse user commands
  if (type === 'text' && message.text?.body) {
    const body = message.text.body.trim().toUpperCase();

    if (body === 'STOP' || body === 'UNSUBSCRIBE') {
      // User wants to opt out — find and disable their WhatsApp notifications
      // This would require a lookup by phone number in UserSettings
      logger.info('whatsappWebhook', `User ${from} requested STOP — opt-out not yet automated`);
    } else if (body === 'HELP' || body === 'START') {
      logger.info('whatsappWebhook', `User ${from} requested HELP`);
    }
  }
}

/**
 * Handle a delivery status update for a message we sent.
 * Statuses: sent, delivered, read, failed.
 */
async function handleStatusUpdate(status, metadata) {
  const messageId = status.id;
  const statusValue = status.status;
  const recipientId = status.recipient_id;
  const timestamp = new Date(Number(status.timestamp) * 1000);

  logger.info('whatsappWebhook', `Message ${messageId} status: ${statusValue}`, {
    messageId,
    status: statusValue,
    recipientId,
    timestamp,
    phoneNumberId: metadata?.phone_number_id,
  });

  if (statusValue === 'failed') {
    const error = status.errors?.[0];
    logger.error('whatsappWebhook', `Message delivery failed: ${error?.title || 'unknown'}`, {
      messageId,
      errorCode: error?.code,
      errorTitle: error?.title,
      errorDetails: error?.message,
    });
  }
}

module.exports = router;
