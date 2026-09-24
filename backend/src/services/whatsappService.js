/**
 * WhatsApp Business API notification delivery — uses the official
 * Meta Cloud API (graph.facebook.com) to send template messages.
 * Best-effort: if unconfigured, sendWhatsApp no-ops with a warning
 * rather than throwing — matching the emailService/smsService pattern.
 *
 * Requires: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, and
 * optionally WHATSAPP_BUSINESS_ACCOUNT_ID in the environment.
 *
 * Template messages are the only way to initiate conversations with
 * users who haven't messaged the business in the last 24 hours (the
 * "24-hour customer care window"). Templates must be pre-approved by
 * Meta — see the template name constants below.
 */
const axios = require('axios');
const { config } = require('../config');
const logger = require('../utils/logger');

// Pre-approved Meta template names. These must exist in the WhatsApp
// Business Manager's template library before they can be sent.
const TEMPLATES = {
  // Generic notification template — used for most wallet events.
  TRANSACTION_ALERT: 'transaction_alert',
  // Security alert — login from new device, password change, etc.
  SECURITY_ALERT: 'security_alert',
  // KYC/AML review status update.
  REVIEW_UPDATE: 'review_update',
  // Withdrawal processed or requires action.
  WITHDRAWAL_UPDATE: 'withdrawal_update',
};

function isConfigured() {
  const { phoneNumberId, accessToken } = config.whatsapp.meta;
  return Boolean(phoneNumberId && accessToken);
}

let warnedOnce = false;

/**
 * Sends a WhatsApp template message to the given phone number.
 * @param {string} to - Recipient phone in E.164 format (e.g. "+254712345678")
 * @param {string} templateName - One of the TEMPLATES constants
 * @param {Array<{type: string, text?: string}>} components - Template components
 * @returns {boolean} true if sent, false if skipped or failed
 */
async function sendWhatsApp(to, templateName, components = []) {
  if (!to || !templateName) return false;

  if (!isConfigured()) {
    if (!warnedOnce) {
      warnedOnce = true;
      logger.warn('whatsappService', 'WhatsApp Business API not configured — WhatsApp notifications disabled (development mode)');
    }
    return false;
  }

  const { phoneNumberId, accessToken, apiVersion } = config.whatsapp.meta;
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to: to.replace(/^\+/, ''), // Meta expects phone without the leading +
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' },
    },
  };

  // Only attach components if provided — Meta rejects empty component arrays
  // on some template types.
  if (components.length > 0) {
    payload.template.components = components;
  }

  try {
    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    const messageId = res.data?.messages?.[0]?.id;
    if (!messageId) {
      logger.warn('whatsappService', 'Meta accepted the request but returned no message ID', { to, templateName, response: res.data });
    }
    return Boolean(messageId);
  } catch (err) {
    // Meta returns detailed error objects — log the relevant parts.
    const metaError = err.response?.data?.error;
    if (metaError) {
      logger.error('whatsappService', `Meta API error: ${metaError.message} (code ${metaError.code}, type ${metaError.type})`, { to, templateName });
    } else {
      logger.error('whatsappService', 'failed to send WhatsApp message', err, { to, templateName });
    }
    return false;
  }
}

/**
 * Convenience: send a simple text-based transaction alert.
 * Builds the template components from a title and body.
 */
async function sendTransactionAlert(to, title, body) {
  return sendWhatsApp(to, TEMPLATES.TRANSACTION_ALERT, [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: title },
        { type: 'text', text: body || '' },
      ],
    },
  ]);
}

/**
 * Convenience: send a security alert (login, password change, etc.).
 */
async function sendSecurityAlert(to, title, body) {
  return sendWhatsApp(to, TEMPLATES.SECURITY_ALERT, [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: title },
        { type: 'text', text: body || '' },
      ],
    },
  ]);
}

module.exports = {
  sendWhatsApp,
  sendTransactionAlert,
  sendSecurityAlert,
  isConfigured,
  TEMPLATES,
};
