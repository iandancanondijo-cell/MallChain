/**
 * Email provider dispatcher — routes to the configured provider based on
 * EMAIL_PROVIDER env var. Supports:
 * - 'sendgrid' — SendGrid REST API (default)
 * - 'twilio' — Twilio/SendGrid SMTP (requires SENDGRID_API_KEY)
 * - 'smtp' — Generic SMTP via nodemailer (legacy fallback)
 *
 * Best-effort: if the selected provider is unconfigured, sendEmail no-ops with
 * a warning rather than throwing — a notification failing to send must never
 * take down the request/job that triggered it.
 */
const { config } = require('../config');
const logger = require('../utils/logger');

/**
 * Send via the configured email provider.
 * @returns {Promise<boolean>} true if sent, false if skipped/failed (never throws)
 */
async function sendEmail(to, subject, body) {
  if (!to || !subject) return false;

  const provider = config.notifications.email.provider;

  try {
    if (provider === 'twilio') {
      const { sendEmail: twilioSendEmail } = require('./twilioService');
      return await twilioSendEmail(to, subject, body);
    } else if (provider === 'smtp') {
      const { sendEmail: smtpSendEmail } = require('./smtpService');
      return await smtpSendEmail(to, subject, body);
    } else {
      // Default: SendGrid
      const { sendEmail: sendgridSendEmail } = require('./sendgridService');
      return await sendgridSendEmail(to, subject, body);
    }
  } catch (err) {
    logger.error('emailService', `failed to send email via ${provider}`, err, { to, subject });
    return false;
  }
}

function isConfigured() {
  const provider = config.notifications.email.provider;

  try {
    if (provider === 'twilio') {
      return require('./twilioService').isEmailConfigured();
    } else if (provider === 'smtp') {
      return require('./smtpService').isConfigured();
    } else {
      return require('./sendgridService').isConfigured();
    }
  } catch {
    return false;
  }
}

module.exports = { sendEmail, isConfigured };
