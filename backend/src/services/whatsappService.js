/**
 * WhatsApp service — Meta WhatsApp Business Cloud API (Facebook for
 * Developers → WhatsApp Business Platform). The "developer
 * facebook=====Green app" channel from the notification spec.
 *
 * Meta only permits free-form `text` messages inside a 24-hour customer
 * service window (after the user messages the business). Business-initiated
 * notifications — badge alerts, tx confirmations, withdrawal updates — are
 * cold outbound and MUST use a pre-approved message template
 * (`type: 'template'`), or Meta rejects them with error 131047. So the
 * default path sends a template; plain text is used only when no template is
 * configured (dev/local) or when the caller explicitly opts into session text.
 *
 * Best-effort: if unconfigured, sendWhatsApp no-ops with a warning rather
 * than throwing.
 */
const axios = require('axios');
const { config } = require('../config');
const logger = require('../utils/logger');

function isConfigured() {
  const { accessToken, phoneNumberId } = config.notifications.whatsapp.meta;
  return Boolean(accessToken && phoneNumberId);
}

let warnedOnce = false;

function warnOnce(msg) {
  if (!warnedOnce) {
    warnedOnce = true;
    logger.warn('whatsappService', msg);
  }
}

/**
 * Send a WhatsApp message.
 *
 * @param {string} phone      recipient (any format; normalized to digits)
 * @param {string} message    human-readable text (body for text, or the single
 *                            body parameter substituted into the template)
 * @param {object} [opts]
 * @param {boolean} [opts.forceText] send free-form text even if a template is
 *                            configured (use only inside a 24h session window)
 * @param {object} [opts.template] override template: { name, language, bodyParams }
 * @returns {Promise<boolean>} true if sent, false if skipped/failed (never throws)
 */
async function sendWhatsApp(phone, message, opts = {}) {
  if (!phone || !message) return false;

  if (!isConfigured()) {
    warnOnce('WhatsApp (Meta Cloud API) not configured — WhatsApp notifications disabled (development mode)');
    return false;
  }

  const { accessToken, phoneNumberId, apiVersion, apiBaseUrl, templateName, templateLanguage } =
    config.notifications.whatsapp.meta;

  // Strip WhatsApp-specific prefix / non-digits; Meta wants bare digits.
  const to = phone.replace(/^whatsapp:/i, '').replace(/\D/g, '');

  // Decide template vs text. A configured template (env or per-call) wins
  // unless the caller forces session text.
  const template = opts.template || (templateName && !opts.forceText
    ? { name: templateName, language: templateLanguage || 'en', bodyParams: [message] }
    : null);

  let payload;
  if (template) {
    payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language || 'en' },
        components: template.bodyParams?.length
          ? [{ type: 'body', parameters: template.bodyParams.map((p) => ({ type: 'text', text: String(p) })) }]
          : undefined,
      },
    };
  } else {
    // No template configured (local/dev) or forced text — free-form. Only
    // deliverable inside a 24h customer-service window in production.
    payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message },
    };
  }

  try {
    const url = `${apiBaseUrl.replace(/\/$/, '')}/${apiVersion}/${phoneNumberId}/messages`;
    const res = await axios.post(url, payload, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      timeout: 10000,
    });

    if (res.status !== 200 || !res.data?.messages?.length) {
      logger.warn('whatsappService', 'WhatsApp accepted the request but returned unexpected response', { phone, status: res.status });
      return false;
    }
    return true;
  } catch (err) {
    // Surface Meta's error body — 131047 (template required / outside window)
    // and 131026 (undeliverable number) are the two operators actually hit.
    const metaError = err.response?.data?.error;
    logger.error('whatsappService', 'failed to send WhatsApp message', err, {
      phone,
      type: payload.type,
      metaCode: metaError?.code,
      metaMessage: metaError?.message,
    });
    return false;
  }
}

module.exports = { sendWhatsApp, isConfigured };
