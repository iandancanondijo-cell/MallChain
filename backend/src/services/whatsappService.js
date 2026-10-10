/**
 * WhatsApp notification service using Twilio WhatsApp API.
 *
 * Environment variables:
 *   TWILIO_ACCOUNT_SID       - Twilio Account SID (same as SMS)
 *   TWILIO_AUTH_TOKEN        - Twilio Auth Token (same as SMS)
 *   TWILIO_WHATSAPP_NUMBER   - Twilio WhatsApp number (e.g., +14155238886 for sandbox)
 *
 * If TWILIO_ACCOUNT_SID is not set, messages are logged but not sent (dev mode).
 *
 * Note: With Twilio sandbox, recipients must opt-in by sending "join <keyword>" to the sandbox number.
 * For production, you'll need a dedicated Twilio WhatsApp number and pre-approved templates.
 */

const logger = require('../utils/logger');

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

/**
 * Send a WhatsApp message via Twilio.
 *
 * @param {string} to - Recipient phone number in international format (e.g., +254712345678)
 * @param {string} message - Text message body
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendWhatsApp(to, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!accountSid || !authToken || !whatsappNumber) {
    logger.warn('whatsappService', 'WhatsApp not configured — message logged but not sent', {
      to,
      message: message.substring(0, 100),
    });
    return { success: false, error: 'WhatsApp not configured' };
  }

  if (!to || !message) {
    return { success: false, error: 'Missing required fields: to, message' };
  }

  const url = `${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`;

  const payload = new URLSearchParams({
    From: `whatsapp:${whatsappNumber}`,
    To: `whatsapp:${to}`,
    Body: message,
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('whatsappService', 'WhatsApp API error', {
        status: response.status,
        error: errorData,
        to,
      });
      return { success: false, error: `WhatsApp error: ${errorData.message || response.status}` };
    }

    const data = await response.json();
    logger.info('whatsappService', 'WhatsApp message sent', { to, messageId: data.sid });
    return { success: true, messageId: data.sid };
  } catch (error) {
    logger.error('whatsappService', 'Failed to send WhatsApp message', { error: error.message, to });
    return { success: false, error: error.message };
  }
}

/**
 * Send a template message via Twilio WhatsApp.
 * Note: Twilio handles templates differently - you create them in the Twilio Console.
 * For now, this sends a formatted message. For production, use Twilio's Content Templates.
 *
 * @param {string} to - Recipient phone number (e.g., +254712345678)
 * @param {string} templateName - Template identifier (for logging)
 * @param {Object} params - Template parameters: { header: [], body: [], buttons: [] }
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendTemplate(to, templateName, params = {}) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!accountSid || !authToken || !whatsappNumber) {
    logger.warn('whatsappService', 'WhatsApp not configured — template message logged but not sent', {
      to,
      templateName,
    });
    return { success: false, error: 'WhatsApp not configured' };
  }

  if (!to || !templateName) {
    return { success: false, error: 'Missing required fields: to, templateName' };
  }

  let message = `[${templateName}]\n`;
  if (params.body && params.body.length > 0) {
    message += params.body.join('\n');
  } else {
    message += 'Notification';
  }

  const url = `${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`;

  const payload = new URLSearchParams({
    From: `whatsapp:${whatsappNumber}`,
    To: `whatsapp:${to}`,
    Body: message,
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('whatsappService', 'WhatsApp template API error', {
        status: response.status,
        error: errorData,
        to,
        templateName,
      });
      return { success: false, error: `WhatsApp error: ${errorData.message || response.status}` };
    }

    const data = await response.json();
    logger.info('whatsappService', 'WhatsApp template sent', { to, templateName, messageId: data.sid });
    return { success: true, messageId: data.sid };
  } catch (error) {
    logger.error('whatsappService', 'Failed to send WhatsApp template', { error: error.message, to, templateName });
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendWhatsApp,
  sendTemplate,
};
