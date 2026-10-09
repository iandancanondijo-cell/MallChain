const mockPost = jest.fn();
jest.mock('axios', () => ({ post: (...args) => mockPost(...args) }));

describe('sendgridService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.SENDGRID_API_KEY;
  });

  test('no-ops without throwing when SendGrid is not configured', async () => {
    const { sendEmail, isConfigured } = require('../services/sendgridService');
    expect(isConfigured()).toBe(false);
    await expect(sendEmail('a@b.com', 'Subject', 'Body')).resolves.toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('sends via SendGrid REST API when configured and receives 202', async () => {
    process.env.SENDGRID_API_KEY = 'key';
    mockPost.mockResolvedValue({ status: 202 });

    const { sendEmail, isConfigured } = require('../services/sendgridService');
    expect(isConfigured()).toBe(true);

    const result = await sendEmail('a@b.com', 'Subject', 'Body');
    expect(result).toBe(true);
    expect(mockPost).toHaveBeenCalledWith(
      'https://api.sendgrid.com/v3/mail/send',
      expect.objectContaining({
        personalizations: expect.arrayContaining([
          expect.objectContaining({
            to: [{ email: 'a@b.com' }],
          }),
        ]),
        subject: 'Subject',
        content: [{ type: 'text/plain', value: 'Body' }],
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer key',
        }),
      })
    );
  });

  test('returns false when SendGrid returns non-202 status', async () => {
    process.env.SENDGRID_API_KEY = 'key';
    mockPost.mockResolvedValue({ status: 400 });

    const { sendEmail } = require('../services/sendgridService');
    await expect(sendEmail('a@b.com', 'Subject', 'Body')).resolves.toBe(false);
  });

  test('returns false (does not throw) when the request itself fails', async () => {
    process.env.SENDGRID_API_KEY = 'key';
    mockPost.mockRejectedValue(new Error('network down'));

    const { sendEmail } = require('../services/sendgridService');
    await expect(sendEmail('a@b.com', 'Subject', 'Body')).resolves.toBe(false);
  });

  test('no-ops when recipient or subject is missing', async () => {
    const { sendEmail } = require('../services/sendgridService');
    await expect(sendEmail('', 'Subject', 'Body')).resolves.toBe(false);
    await expect(sendEmail('a@b.com', '', 'Body')).resolves.toBe(false);
  });
});
