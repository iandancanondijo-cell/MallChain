/**
 * Twilio provider — supports both SMS (Programmable Messaging REST API) and
 * email (SendGrid over SMTP, since Twilio owns SendGrid). Uses plain axios
 * calls matching this codebase's pattern for external providers. Best-effort:
 * if unconfigured, sendSms/sendEmail no-op with a warning rather than throwing.
 */
const axios = require('axios');
const { config } = require('../config');
const logger = require('../utils/logger');

let warnedOnce = false;

function isSmsConfigured() {
  const { accountSid, authToken, from } = config.notifications.sms.twilio;
  return Boolean(accountSid && authToken && from);
}

function isEmailConfigured() {
  const { accountSid, authToken, from } = config.notifications.email.twilio;
  return Boolean(accountSid && authToken && from);
}

/** Returns true if the SMS was actually sent, false if skipped (never throws). */
async function sendSms(phone, message) {
  if (!phone || !message) return false;

  if (!isSmsConfigured()) {
    if (!warnedOnce) {
      warnedOnce = true;
      logger.warn('twilioService', 'Twilio SMS not configured — SMS notifications disabled (development mode)');
    }
    return false;
  }

  const { accountSid, authToken, from, apiBaseUrl } = config.notifications.sms.twilio;

  try {
    const url = `${apiBaseUrl.replace(/\/$/, '')}/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({ To: phone, From: from, Body: message });

    const res = await axios.post(url, body.toString(), {
      auth: { username: accountSid, password: authToken },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    });

    if (res.status !== 201 || !res.data?.sid) {
      logger.warn('twilioService', 'Twilio accepted the request but returned unexpected response', { phone, status: res.status });
      return false;
    }
    return true;
  } catch (err) {
    logger.error('twilioService', 'failed to send SMS', err, { phone });
    return false;
  }
}

/** Returns true if the email was actually sent, false if skipped (never throws). */
async function sendEmail(to, subject, body) {
  if (!to || !subject) return false;

  if (!isEmailConfigured()) {
    if (!warnedOnce) {
      warnedOnce = true;
      logger.warn('twilioService', 'Twilio email (SendGrid SMTP) not configured — email notifications disabled (development mode)');
    }
    return false;
  }

  // Twilio email uses SendGrid's SMTP interface. For this implementation, we'll
  // use SendGrid's REST API as a proxy (same credentials under Twilio umbrella).
  const { from } = config.notifications.email.twilio;
  const { apiKey } = config.notifications.email.sendgrid;

  if (!apiKey) {
    if (!warnedOnce) {
      warnedOnce = true;
      logger.warn('twilioService', 'Twilio email requires SENDGRID_API_KEY — not configured');
    }
    return false;
  }

  try {
    const payload = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [{ type: 'text/plain', value: body }],
    };

    const res = await axios.post('https://api.sendgrid.com/v3/mail/send', payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    if (res.status !== 202) {
      logger.warn('twilioService', 'Twilio email accepted the request but returned non-202 status', { to, subject, status: res.status });
      return false;
    }
    return true;
  } catch (err) {
    logger.error('twilioService', 'failed to send email', err, { to, subject });
    return false;
  }
}

module.exports = { sendSms, sendEmail, isSmsConfigured, isEmailConfigured };
