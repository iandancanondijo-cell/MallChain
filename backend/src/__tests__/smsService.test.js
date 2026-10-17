const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('brevoService - SMS', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_SMS_SENDER;
  });

  test('returns success:false when BREVO_API_KEY is not configured', async () => {
    const { sendSMS } = require('../services/brevoService');
    const result = await sendSMS('+254700000000', 'hi');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Brevo not configured');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('sends via Brevo API when configured', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.BREVO_SMS_SENDER = 'Mallchain';
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ reference: 'ref123' }),
    });

    const { sendSMS } = require('../services/brevoService');
    const result = await sendSMS('+254700000000', 'hi');
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('ref123');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/transactionalSMS/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'api-key': 'xkeysib-test' }),
      }),
    );
  });

  test('returns error when Brevo API responds with non-ok status', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'Invalid phone' }),
    });

    const { sendSMS } = require('../services/brevoService');
    const result = await sendSMS('+254700000000', 'hi');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid phone');
  });

  test('returns error (does not throw) when fetch rejects', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    mockFetch.mockRejectedValue(new Error('network down'));

    const { sendSMS } = require('../services/brevoService');
    const result = await sendSMS('+254700000000', 'hi');
    expect(result.success).toBe(false);
    expect(result.error).toBe('network down');
  });

  test('returns error when phone or message is missing', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    const { sendSMS } = require('../services/brevoService');
    const r1 = await sendSMS('', 'hi');
    expect(r1.success).toBe(false);
    const r2 = await sendSMS('+254700000000', '');
    expect(r2.success).toBe(false);
  });

  test('returns error when message exceeds 765 character limit', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    const { sendSMS } = require('../services/brevoService');
    const longMsg = 'a'.repeat(766);
    const result = await sendSMS('+254700000000', longMsg);
    expect(result.success).toBe(false);
    expect(result.error).toContain('765');
  });
});
