/**
 * Generic-SMTP email sending (nodemailer) — no vendor lock-in, works with
 * any SMTP provider (SendGrid/SES/Mailgun's SMTP interface, or a real
 * mailserver). Best-effort: if unconfigured, sendEmail no-ops with a
 * warning rather than throwing — a badge notification failing to send must
 * never take down the request/job that triggered it.
 */
const nodemailer = require('nodemailer');
const { config } = require('../config');
const logger = require('../utils/logger');

let transporter = null;
let warnedOnce = false;

function isConfigured() {
  const { host, user, pass } = config.email.smtp;
  return Boolean(host && user && pass);
}

function getTransporter() {
  if (!transporter && isConfigured()) {
    transporter = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.secure,
      auth: { user: config.email.smtp.user, pass: config.email.smtp.pass },
    });
  }
  return transporter;
}

/** Returns true if an email was actually sent, false if skipped (never throws). */
async function sendEmail(to, subject, body) {
  if (!to || !subject) return false;

  if (!isConfigured()) {
    if (!warnedOnce) {
      warnedOnce = true;
      logger.warn('emailService', 'SMTP not configured — email notifications disabled (development mode)');
    }
    return false;
  }

  try {
    await getTransporter().sendMail({
      from: config.email.smtp.from,
      to,
      subject,
      text: body,
    });
    return true;
  } catch (err) {
    logger.error('emailService', 'failed to send email', err, { to, subject });
    return false;
  }
}

module.exports = { sendEmail, isConfigured };
