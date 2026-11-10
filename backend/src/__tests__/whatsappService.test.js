const mockPost = jest.fn();
jest.mock('axios', () => ({ post: (...args) => mockPost(...args) }));

describe('whatsappService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_TEMPLATE_NAME;
  });

  test('no-ops without throwing when WhatsApp (Meta Cloud API) is not configured', async () => {
    const { sendWhatsApp, isConfigured } = require('../services/whatsappService');
    expect(isConfigured()).toBe(false);
    await expect(sendWhatsApp('254700000000', 'hi')).resolves.toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('sends free-form text when no template is configured', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
    mockPost.mockResolvedValue({ status: 200, data: { messages: [{ id: 'wamid.1' }] } });

    const { sendWhatsApp } = require('../services/whatsappService');
    const result = await sendWhatsApp('254700000000', 'hi');
    expect(result).toBe(true);
    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining('/v21.0/123456/messages'),
      expect.objectContaining({
        messaging_product: 'whatsapp',
        to: '254700000000',
        type: 'text',
        text: { body: 'hi' },
      }),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) })
    );
  });

  test('sends a template message when WHATSAPP_TEMPLATE_NAME is configured', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
    process.env.WHATSAPP_TEMPLATE_NAME = 'mallchain_alert';
    mockPost.mockResolvedValue({ status: 200, data: { messages: [{ id: 'wamid.1' }] } });

    const { sendWhatsApp } = require('../services/whatsappService');
    const result = await sendWhatsApp('254700000000', 'Badge earned');
    expect(result).toBe(true);
    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        type: 'template',
        template: {
          name: 'mallchain_alert',
          language: { code: 'en' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: 'Badge earned' }] },
          ],
        },
      }),
      expect.any(Object)
    );
  });

  test('forceText bypasses the configured template (session-window sends)', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
    process.env.WHATSAPP_TEMPLATE_NAME = 'mallchain_alert';
    mockPost.mockResolvedValue({ status: 200, data: { messages: [{ id: 'wamid.1' }] } });

    const { sendWhatsApp } = require('../services/whatsappService');
    await sendWhatsApp('254700000000', 'hi', { forceText: true });
    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: 'text' }),
      expect.any(Object)
    );
  });

  test('per-call template override wins over env config', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
    mockPost.mockResolvedValue({ status: 200, data: { messages: [{ id: 'wamid.1' }] } });

    const { sendWhatsApp } = require('../services/whatsappService');
    await sendWhatsApp('254700000000', 'ignored', {
      template: { name: 'custom_tpl', language: 'sw', bodyParams: ['a', 'b'] },
    });
    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        type: 'template',
        template: {
          name: 'custom_tpl',
          language: { code: 'sw' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
          ],
        },
      }),
      expect.any(Object)
    );
  });

  test('strips whatsapp: prefix and non-digits from phone number', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
    mockPost.mockResolvedValue({ status: 200, data: { messages: [{ id: 'wamid.1' }] } });

    const { sendWhatsApp } = require('../services/whatsappService');
    await sendWhatsApp('whatsapp:+254-700-000000', 'hi');
    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ to: '254700000000' }),
      expect.any(Object)
    );
  });

  test('returns false when Meta returns non-200 status', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
    mockPost.mockResolvedValue({ status: 400 });

    const { sendWhatsApp } = require('../services/whatsappService');
    await expect(sendWhatsApp('254700000000', 'hi')).resolves.toBe(false);
  });

  test('returns false (does not throw) when the request itself fails', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
    mockPost.mockRejectedValue(new Error('network down'));

    const { sendWhatsApp } = require('../services/whatsappService');
    await expect(sendWhatsApp('254700000000', 'hi')).resolves.toBe(false);
  });

  test('no-ops when phone or message is missing', async () => {
    const { sendWhatsApp } = require('../services/whatsappService');
    await expect(sendWhatsApp('', 'hi')).resolves.toBe(false);
    await expect(sendWhatsApp('254700000000', '')).resolves.toBe(false);
  });
});
