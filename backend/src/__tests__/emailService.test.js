const mockSendMail = jest.fn();
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

describe('emailService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });

  test('no-ops without throwing when SMTP is not configured', async () => {
    const { sendEmail, isConfigured } = require('../services/emailService');
    expect(isConfigured()).toBe(false);
    await expect(sendEmail('a@b.com', 'Subject', 'Body')).resolves.toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('sends via nodemailer when SMTP is configured', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    mockSendMail.mockResolvedValue({});

    const { sendEmail, isConfigured } = require('../services/emailService');
    expect(isConfigured()).toBe(true);

    const result = await sendEmail('a@b.com', 'Subject', 'Body');
    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.com', subject: 'Subject', text: 'Body' }));
  });

  test('returns false (does not throw) when the transport rejects', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    mockSendMail.mockRejectedValue(new Error('smtp down'));

    const { sendEmail } = require('../services/emailService');
    await expect(sendEmail('a@b.com', 'Subject', 'Body')).resolves.toBe(false);
  });

  test('no-ops when recipient or subject is missing', async () => {
    const { sendEmail } = require('../services/emailService');
    await expect(sendEmail('', 'Subject', 'Body')).resolves.toBe(false);
    await expect(sendEmail('a@b.com', '', 'Body')).resolves.toBe(false);
  });
});
