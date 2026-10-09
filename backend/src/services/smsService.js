/**
 * SMS provider dispatcher — routes to the configured provider based on
 * SMS_PROVIDER env var. Supports:
 * - 'twilio' — Twilio Programmable Messaging (default)
 * - 'africastalking' — Africa's Talking REST API
 *
 * Best-effort: if the selected provider is unconfigured, sendSms no-ops with a
 * warning rather than throwing.
 */
const { config } = require('../config');
const logger = require('../utils/logger');

async function sendSms(phone, message) {
  if (!phone || !message) return false;

  const provider = config.notifications.sms.provider;

  try {
    if (provider === 'africastalking') {
      const { sendSms: atSendSms } = require('./africastalkingService');
      return await atSendSms(phone, message);
    }
    // Default: Twilio
    const { sendSms: twilioSendSms } = require('./twilioService');
    return await twilioSendSms(phone, message);
  } catch (err) {
    logger.error('smsService', `failed to send SMS via ${provider}`, err, { phone });
    return false;
  }
}

function isConfigured() {
  const provider = config.notifications.sms.provider;
  try {
    if (provider === 'africastalking') {
      return require('./africastalkingService').isConfigured();
    }
    return require('./twilioService').isSmsConfigured();
  } catch {
    return false;
  }
}

module.exports = { sendSms, isConfigured };
