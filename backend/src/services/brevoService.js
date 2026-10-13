/**
 * Unified notification service using Brevo API (email, SMS, WhatsApp).
 *
 * Brevo (formerly Sendinblue) provides a single API for all communication channels.
 *
 * Environment variables:
 *   BREVO_API_KEY          - Brevo API key (xkeysib-xxx)
 *   BREVO_FROM_EMAIL       - From email address (e.g., noreply@mallchain.network)
 *   BREVO_FROM_NAME        - From name (default: "Mallchain")
 *   BREVO_SMS_SENDER       - SMS sender name (alphanumeric, max 11 chars)
 *   BREVO_WHATSAPP_SENDER  - WhatsApp sender phone (international format, e.g., +254712345678)
 *
 * If BREVO_API_KEY is not set, messages are logged but not sent (dev mode).
 *
 * API endpoints:
 *   Email:     POST /v3/smtp/email
 *   SMS:       POST /v3/transactionalSMS/send
 *   WhatsApp:  POST /v3/whatsapp/sendMessage
 */

const logger = require('../utils/logger');

const BREVO_API_BASE = 'https://api.brevo.com/v3';

const PHYSICAL_ADDRESS = 'Mallchain Technologies, P.O. Box 00100, Nairobi, Kenya';
const UNSUBSCRIBE_URL = 'https://mallchain.network/settings/notifications';

function complianceFooter() {
  return `
    <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
    <p style="font-size: 11px; color: #999; line-height: 1.5;">
      You are receiving this email because you have a Mallchain account.
      <a href="${UNSUBSCRIBE_URL}" style="color: #06b6d4;">Unsubscribe</a> or
      <a href="${UNSUBSCRIBE_URL}" style="color: #06b6d4;">manage your notification preferences</a>.
    </p>
    <p style="font-size: 11px; color: #999;">${PHYSICAL_ADDRESS}</p>
  `;
}

/**
 * Send an email via Brevo.
 *
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML body
 * @param {Object} [options] - Optional: text (plain text fallback)
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendEmail(to, subject, html, options = {}) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL || 'noreply@mallchain.network';
  const fromName = process.env.BREVO_FROM_NAME || 'Mallchain';

  if (!apiKey) {
    logger.warn('brevoService', 'BREVO_API_KEY not set — email logged but not sent', {
      to,
      subject,
    });
    return { success: false, error: 'Brevo not configured' };
  }

  if (!to || !subject || !html) {
    return { success: false, error: 'Missing required fields: to, subject, html' };
  }

  const payload = {
    sender: { name: fromName, email: fromEmail },
    to: [{ email: to, name: to.split('@')[0] }],
    subject,
    htmlContent: html,
  };

  if (options.text) {
    payload.textContent = options.text;
  }

  try {
    const response = await fetch(`${BREVO_API_BASE}/smtp/email`, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('brevoService', 'Email API error', {
        status: response.status,
        error: errorData,
        to,
        subject,
      });
      return { success: false, error: `Brevo email error: ${errorData.message || response.status}` };
    }

    const data = await response.json();
    logger.info('brevoService', 'Email sent', { to, subject, messageId: data.messageId });
    return { success: true, messageId: data.messageId };
  } catch (error) {
    logger.error('brevoService', 'Failed to send email', { error: error.message, to, subject });
    return { success: false, error: error.message };
  }
}

/**
 * Send a transactional email using a Brevo template.
 *
 * @param {string} to - Recipient email
 * @param {number} templateId - Brevo template ID (numeric)
 * @param {Object} params - Template parameters
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendTemplate(to, templateId, params = {}) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL || 'noreply@mallchain.network';
  const fromName = process.env.BREVO_FROM_NAME || 'Mallchain';

  if (!apiKey) {
    logger.warn('brevoService', 'BREVO_API_KEY not set — template email logged but not sent', {
      to,
      templateId,
    });
    return { success: false, error: 'Brevo not configured' };
  }

  if (!to || !templateId) {
    return { success: false, error: 'Missing required fields: to, templateId' };
  }

  const payload = {
    sender: { name: fromName, email: fromEmail },
    to: [{ email: to, name: to.split('@')[0] }],
    templateId,
    params,
  };

  try {
    const response = await fetch(`${BREVO_API_BASE}/smtp/email`, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('brevoService', 'Template email API error', {
        status: response.status,
        error: errorData,
        to,
        templateId,
      });
      return { success: false, error: `Brevo template error: ${errorData.message || response.status}` };
    }

    const data = await response.json();
    logger.info('brevoService', 'Template email sent', { to, templateId, messageId: data.messageId });
    return { success: true, messageId: data.messageId };
  } catch (error) {
    logger.error('brevoService', 'Failed to send template email', { error: error.message, to, templateId });
    return { success: false, error: error.message };
  }
}

/**
 * Send an SMS via Brevo.
 *
 * @param {string} to - Recipient phone number in international format (e.g., +254712345678)
 * @param {string} message - SMS body (max 765 characters for Unicode, 1120 for GSM)
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendSMS(to, message) {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SMS_SENDER || 'Mallchain';

  if (!apiKey) {
    logger.warn('brevoService', 'BREVO_API_KEY not set — SMS logged but not sent', {
      to,
      message: message.substring(0, 100),
    });
    return { success: false, error: 'Brevo not configured' };
  }

  if (!to || !message) {
    return { success: false, error: 'Missing required fields: to, message' };
  }

  if (message.length > 765) {
    return { success: false, error: 'SMS message exceeds 765 character limit (Unicode)' };
  }

  const payload = {
    sender,
    recipient: to,
    content: message,
    type: 'transactional',
  };

  try {
    const response = await fetch(`${BREVO_API_BASE}/transactionalSMS/send`, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('brevoService', 'SMS API error', {
        status: response.status,
        error: errorData,
        to,
      });
      return { success: false, error: `Brevo SMS error: ${errorData.message || response.status}` };
    }

    const data = await response.json();
    logger.info('brevoService', 'SMS sent', { to, reference: data.reference });
    return { success: true, messageId: data.reference };
  } catch (error) {
    logger.error('brevoService', 'Failed to send SMS', { error: error.message, to });
    return { success: false, error: error.message };
  }
}

/**
 * Send a WhatsApp message via Brevo.
 *
 * Note: Brevo WhatsApp requires pre-approved templates for most use cases.
 * For transactional messages, you may need to use template-based sending.
 *
 * @param {string} to - Recipient phone number in international format (e.g., +254712345678)
 * @param {string} message - Text message body
 * @param {Object} [options] - Optional: templateId, templateParams
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendWhatsApp(to, message, options = {}) {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_WHATSAPP_SENDER;

  if (!apiKey) {
    logger.warn('brevoService', 'BREVO_API_KEY not set — WhatsApp logged but not sent', {
      to,
      message: message.substring(0, 100),
    });
    return { success: false, error: 'Brevo not configured' };
  }

  if (!sender) {
    logger.warn('brevoService', 'BREVO_WHATSAPP_SENDER not set — WhatsApp logged but not sent', {
      to,
    });
    return { success: false, error: 'WhatsApp sender not configured' };
  }

  if (!to || !message) {
    return { success: false, error: 'Missing required fields: to, message' };
  }

  const payload = {
    senderNumber: sender,
    contactNumber: to,
    message,
  };

  if (options.templateId) {
    payload.templateId = options.templateId;
    if (options.templateParams) {
      payload.placeholders = options.templateParams;
    }
  }

  try {
    const response = await fetch(`${BREVO_API_BASE}/whatsapp/sendMessage`, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('brevoService', 'WhatsApp API error', {
        status: response.status,
        error: errorData,
        to,
      });
      return { success: false, error: `Brevo WhatsApp error: ${errorData.message || response.status}` };
    }

    const data = await response.json();
    logger.info('brevoService', 'WhatsApp message sent', { to, messageId: data.messageId });
    return { success: true, messageId: data.messageId };
  } catch (error) {
    logger.error('brevoService', 'Failed to send WhatsApp message', { error: error.message, to });
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendEmail,
  sendTemplate,
  sendSMS,
  sendWhatsApp,
  complianceFooter,
};
