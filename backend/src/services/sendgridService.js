/**
 * SendGrid email provider — uses the SendGrid v3 REST API via axios (matching
 * this codebase's pattern for external providers rather than pulling in the
 * SendGrid SDK). Best-effort: if unconfigured, sendEmail no-ops with a warning
 * rather than throwing — a notification failing to send must never take down
 * the request/job that triggered it.
 */
const axios = require('axios');
const { config } = require('../config');
const logger = require('../utils/logger');

function isConfigured() {
  const { apiKey } = config.notifications.email.sendgrid;
  return Boolean(apiKey);
}

let warnedOnce = false;

/** Returns true if the email was actually sent, false if skipped (never throws). */
async function sendEmail(to, subject, body) {
  if (!to || !subject) return false;

  if (!isConfigured()) {
    if (!warnedOnce) {
      warnedOnce = true;
      logger.warn('sendgridService', 'SendGrid API key not configured — email notifications disabled (development mode)');
    }
    return false;
  }

  const { apiKey, from, replyTo } = config.notifications.email.sendgrid;

  try {
    const payload = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [{ type: 'text/plain', value: body }],
    };
    if (replyTo) payload.reply_to = { email: replyTo };

    const res = await axios.post('https://api.sendgrid.com/v3/mail/send', payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    // SendGrid returns 202 Accepted on success.
    if (res.status !== 202) {
      logger.warn('sendgridService', 'SendGrid accepted the request but returned non-202 status', { to, subject, status: res.status });
      return false;
    }
    return true;
  } catch (err) {
    logger.error('sendgridService', 'failed to send email', err, { to, subject });
    return false;
  }
}

module.exports = { sendEmail, isConfigured };
