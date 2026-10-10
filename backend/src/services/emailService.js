/**
 * Email notification service using SendGrid API.
 *
 * Environment variables:
 *   SENDGRID_API_KEY      - SendGrid API key (SG.xxx)
 *   SENDGRID_FROM_EMAIL   - From address (e.g., noreply@mallchain.network)
 *   SENDGRID_FROM_NAME    - From name (default: "Mallchain")
 *
 * If SENDGRID_API_KEY is not set, emails are logged but not sent (dev mode).
 */

const logger = require('../utils/logger');

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';

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
 * Send a plain HTML email.
 *
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML body
 * @param {Object} [options] - Optional: text (plain text fallback)
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendEmail(to, subject, html, options = {}) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@mallchain.network';
  const fromName = process.env.SENDGRID_FROM_NAME || 'Mallchain';

  if (!apiKey) {
    logger.warn('emailService', 'SENDGRID_API_KEY not set — email logged but not sent', {
      to,
      subject,
    });
    return { success: false, error: 'SendGrid not configured' };
  }

  if (!to || !subject || !html) {
    return { success: false, error: 'Missing required fields: to, subject, html' };
  }

  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: fromEmail, name: fromName },
    subject,
    content: [
      { type: 'text/html', value: html },
    ],
  };

  if (options.text) {
    payload.content.unshift({ type: 'text/plain', value: options.text });
  }

  try {
    const response = await fetch(SENDGRID_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('emailService', 'SendGrid API error', {
        status: response.status,
        error: errorText,
        to,
        subject,
      });
      return { success: false, error: `SendGrid error: ${response.status}` };
    }

    const messageId = response.headers.get('X-Message-Id');
    logger.info('emailService', 'Email sent', { to, subject, messageId });
    return { success: true, messageId };
  } catch (error) {
    logger.error('emailService', 'Failed to send email', { error: error.message, to, subject });
    return { success: false, error: error.message };
  }
}

/**
 * Send a transactional email using a SendGrid dynamic template.
 *
 * @param {string} to - Recipient email
 * @param {string} templateId - SendGrid template ID (e.g., d-xxx)
 * @param {Object} dynamicData - Template data object
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendTemplate(to, templateId, dynamicData) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@mallchain.network';
  const fromName = process.env.SENDGRID_FROM_NAME || 'Mallchain';

  if (!apiKey) {
    logger.warn('emailService', 'SENDGRID_API_KEY not set — template email logged but not sent', {
      to,
      templateId,
    });
    return { success: false, error: 'SendGrid not configured' };
  }

  if (!to || !templateId) {
    return { success: false, error: 'Missing required fields: to, templateId' };
  }

  const payload = {
    personalizations: [{
      to: [{ email: to }],
      dynamic_template_data: dynamicData,
    }],
    from: { email: fromEmail, name: fromName },
    template_id: templateId,
  };

  try {
    const response = await fetch(SENDGRID_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('emailService', 'SendGrid template API error', {
        status: response.status,
        error: errorText,
        to,
        templateId,
      });
      return { success: false, error: `SendGrid error: ${response.status}` };
    }

    const messageId = response.headers.get('X-Message-Id');
    logger.info('emailService', 'Template email sent', { to, templateId, messageId });
    return { success: true, messageId };
  } catch (error) {
    logger.error('emailService', 'Failed to send template email', { error: error.message, to, templateId });
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendEmail,
  sendTemplate,
  complianceFooter,
};
