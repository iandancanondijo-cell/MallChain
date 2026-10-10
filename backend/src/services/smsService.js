/**
 * SMS notification service using Twilio API.
 *
 * Environment variables:
 *   TWILIO_ACCOUNT_SID    - Twilio account SID
 *   TWILIO_AUTH_TOKEN     - Twilio auth token
 *   TWILIO_PHONE_NUMBER   - Twilio phone number (e.g., +1234567890)
 *
 * If TWILIO_ACCOUNT_SID is not set, SMS messages are logged but not sent (dev mode).
 */

const logger = require('../utils/logger');

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

/**
 * Send an SMS message.
 *
 * @param {string} to - Recipient phone number in international format (e.g., +254712345678)
 * @param {string} message - SMS body (max 1600 characters)
 * @returns {Promise<{success: boolean, sid?: string, error?: string}>}
 */
async function sendSMS(to, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    logger.warn('smsService', 'Twilio not configured — SMS logged but not sent', {
      to,
      message: message.substring(0, 100),
    });
    return { success: false, error: 'Twilio not configured' };
  }

  if (!to || !message) {
    return { success: false, error: 'Missing required fields: to, message' };
  }

  if (message.length > 1600) {
    return { success: false, error: 'SMS message exceeds 1600 character limit' };
  }

  const url = `${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`;

  const params = new URLSearchParams();
  params.append('To', to);
  params.append('From', fromNumber);
  params.append('Body', message);

  const authString = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('smsService', 'Twilio API error', {
        status: response.status,
        error: errorData,
        to,
      });
      return { success: false, error: `Twilio error: ${errorData.message || response.status}` };
    }

    const data = await response.json();
    logger.info('smsService', 'SMS sent', { to, sid: data.sid, status: data.status });
    return { success: true, sid: data.sid };
  } catch (error) {
    logger.error('smsService', 'Failed to send SMS', { error: error.message, to });
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendSMS,
};
