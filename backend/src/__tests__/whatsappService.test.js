// Tests for services/whatsappService.js as it exists on this line.
//
// Which WhatsApp sender the product should use is an open owner decision
// ("pending sender"), and the 2026-11-11 history merge is a live example of
// why the tests follow the code rather than the other way round: this file's
// predecessor arrived with the October snapshot and described a Meta Cloud API
// implementation — axios against graph.facebook.com, pre-approved template
// payloads, an isConfigured() export, config.notifications.whatsapp.meta, and
// a boolean `false` when unconfigured. The service that the merge actually
// kept is the product line's Twilio version (8ab83c87, 2026-10-10, one day
// after the snapshot): global fetch against api.twilio.com, form-encoded
// Messages.json, `whatsapp:<number>` addressing, and a
// { success, messageId | error } result object with no isConfigured().
//
// Rewriting the service to match the old test would have silently switched
// the digest job's outbound provider, so the test was rewritten instead. If
// the owner decides on Meta, this file and the service change together —
// and note that the Twilio path here performs no phone-number normalisation
// (the caller's string is sent verbatim as `whatsapp:${to}`), unlike the Meta
// version, which stripped `whatsapp:` and non-digits.

function configureTwilio(env) {
  env.TWILIO_ACCOUNT_SID = 'ACtest';
  env.TWILIO_AUTH_TOKEN = 'authtoken';
  env.TWILIO_WHATSAPP_NUMBER = '+14155238886';
}

function clearTwilio(env) {
  delete env.TWILIO_ACCOUNT_SID;
  delete env.TWILIO_AUTH_TOKEN;
  delete env.TWILIO_WHATSAPP_NUMBER;
}

describe('whatsappService', () => {
  let fetchMock;

  beforeEach(() => {
    jest.resetModules();
    clearTwilio(process.env);
    fetchMock = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('no-ops without throwing when Twilio WhatsApp is not configured', async () => {
    const { sendWhatsApp } = require('../services/whatsappService');

    await expect(sendWhatsApp('254700000000', 'hi')).resolves.toMatchObject({
      success: false,
      error: 'WhatsApp not configured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('sends via the Twilio Messages API and returns the sid', async () => {
    configureTwilio(process.env);
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: 'SM123' }) });

    const { sendWhatsApp } = require('../services/whatsappService');
    const result = await sendWhatsApp('254700000000', 'Your badge is live');

    expect(result).toEqual({ success: true, messageId: 'SM123' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from('ACtest:authtoken').toString('base64')}`,
    );
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    const body = new URLSearchParams(init.body);
    expect(body.get('From')).toBe('whatsapp:+14155238886');
    expect(body.get('To')).toBe('whatsapp:254700000000');
    expect(body.get('Body')).toBe('Your badge is live');
  });

  test('returns the API error message when Twilio answers non-2xx', async () => {
    configureTwilio(process.env);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'The number is not a WhatsApp number' }),
    });

    const { sendWhatsApp } = require('../services/whatsappService');
    await expect(sendWhatsApp('254700000000', 'hi')).resolves.toMatchObject({
      success: false,
      error: 'WhatsApp error: The number is not a WhatsApp number',
    });
  });

  test('returns false-shaped error (does not throw) when the request itself fails', async () => {
    configureTwilio(process.env);
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));

    const { sendWhatsApp } = require('../services/whatsappService');
    await expect(sendWhatsApp('254700000000', 'hi')).resolves.toEqual({
      success: false,
      error: 'ECONNRESET',
    });
  });

  test('rejects a missing recipient or body before touching the network', async () => {
    configureTwilio(process.env);
    const { sendWhatsApp } = require('../services/whatsappService');

    await expect(sendWhatsApp('', 'hi')).resolves.toMatchObject({
      success: false,
      error: 'Missing required fields: to, message',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('sendTemplate', () => {
    test('no-ops without configuration', async () => {
      const { sendTemplate } = require('../services/whatsappService');

      await expect(sendTemplate('254700000000', 'order_shipped', { body: ['ORD-1'] }))
        .resolves.toMatchObject({ success: false, error: 'WhatsApp not configured' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test('renders the template name and body parameters into the message', async () => {
      configureTwilio(process.env);
      fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: 'SM9' }) });

      const { sendTemplate } = require('../services/whatsappService');
      // Twilio-side templates are console-authored; this path flattens the
      // parameters into the text body, which is what the service documents.
      await expect(sendTemplate('254700000000', 'order_shipped', { body: ['ORD-1', 'KSh 500'] }))
        .resolves.toEqual({ success: true, messageId: 'SM9' });

      const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
      expect(body.get('Body')).toBe('[order_shipped]\nORD-1\nKSh 500');
    });

    test('requires a template name', async () => {
      configureTwilio(process.env);
      const { sendTemplate } = require('../services/whatsappService');

      await expect(sendTemplate('254700000000', '')).resolves.toMatchObject({
        success: false,
        error: 'Missing required fields: to, templateName',
      });
    });
  });
});
