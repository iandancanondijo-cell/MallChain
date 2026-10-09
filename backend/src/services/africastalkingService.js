/**
 * SMS sending via Africa's Talking's REST API — plain axios call, matching
 * this codebase's existing pattern for external providers (see buy.js's
 * Safaricom calls) rather than pulling in another SDK. Best-effort: if
 * unconfigured, sendSms no-ops with a warning rather than throwing.
 */
const axios = require('axios');
const { config } = require('../config');
const logger = require('../utils/logger');

function isConfigured() {
  const { apiKey, username } = config.notifications.sms.africastalking;
  return Boolean(apiKey && username);
}

let warnedOnce = false;

/** Returns true if the SMS was actually sent, false if skipped (never throws). */
async function sendSms(phone, message) {
  if (!phone || !message) return false;

  if (!isConfigured()) {
    if (!warnedOnce) {
      warnedOnce = true;
      logger.warn('africastalkingService', 'Africa\'s Talking not configured — SMS notifications disabled (development mode)');
    }
    return false;
  }

  const { apiKey, username, senderId, apiBaseUrl } = config.notifications.sms.africastalking;

  try {
    const body = new URLSearchParams({ username, to: phone, message });
    if (senderId) body.set('from', senderId);

    const res = await axios.post(`${apiBaseUrl.replace(/\/$/, '')}/version1/messaging`, body.toString(), {
      headers: {
        apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      timeout: 10000,
    });

    const recipients = res.data?.SMSMessageData?.Recipients || [];
    const ok = recipients.some((r) => String(r.status || '').toLowerCase().includes('success'));
    if (!ok) {
      logger.warn('africastalkingService', 'Africa\'s Talking accepted the request but reported no successful recipient', { phone, recipients });
    }
    return ok;
  } catch (err) {
    logger.error('africastalkingService', 'failed to send SMS', err, { phone });
    return false;
  }
}

module.exports = { sendSms, isConfigured };
