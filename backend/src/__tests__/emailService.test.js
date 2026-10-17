const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('brevoService - Email', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_FROM_EMAIL;
    delete process.env.BREVO_FROM_NAME;
  });

  test('returns success:false when BREVO_API_KEY is not configured', async () => {
    const { sendEmail } = require('../services/brevoService');
    const result = await sendEmail('a@b.com', 'Subject', '<p>Body</p>');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Brevo not configured');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('sends via Brevo SMTP API when configured', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.BREVO_FROM_EMAIL = 'test@mallchain.network';
    process.env.BREVO_FROM_NAME = 'Test';
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: 'msg-123' }),
    });

    const { sendEmail } = require('../services/brevoService');
    const result = await sendEmail('a@b.com', 'Subject', '<p>Body</p>');
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-123');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/smtp/email',
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
      json: () => Promise.resolve({ message: 'Invalid email' }),
    });

    const { sendEmail } = require('../services/brevoService');
    const result = await sendEmail('a@b.com', 'Subject', '<p>Body</p>');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid email');
  });

  test('returns error (does not throw) when fetch rejects', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    mockFetch.mockRejectedValue(new Error('network down'));

    const { sendEmail } = require('../services/brevoService');
    const result = await sendEmail('a@b.com', 'Subject', '<p>Body</p>');
    expect(result.success).toBe(false);
    expect(result.error).toBe('network down');
  });

  test('returns error when recipient, subject, or html is missing', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    const { sendEmail } = require('../services/brevoService');
    const r1 = await sendEmail('', 'Subject', '<p>Body</p>');
    expect(r1.success).toBe(false);
    const r2 = await sendEmail('a@b.com', '', '<p>Body</p>');
    expect(r2.success).toBe(false);
    const r3 = await sendEmail('a@b.com', 'Subject', '');
    expect(r3.success).toBe(false);
  });

  test('includes plain text fallback when options.text is provided', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: 'msg-456' }),
    });

    const { sendEmail } = require('../services/brevoService');
    await sendEmail('a@b.com', 'Subject', '<p>HTML</p>', { text: 'Plain text' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.textContent).toBe('Plain text');
  });
});
