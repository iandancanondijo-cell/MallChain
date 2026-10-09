const mockPost = jest.fn();
jest.mock('axios', () => ({ post: (...args) => mockPost(...args) }));

describe('twilioService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_PHONE_FROM;
  });

  describe('sendSms', () => {
    test('no-ops without throwing when Twilio SMS is not configured', async () => {
      const { sendSms, isSmsConfigured } = require('../services/twilioService');
      expect(isSmsConfigured()).toBe(false);
      await expect(sendSms('+254700000000', 'hi')).resolves.toBe(false);
      expect(mockPost).not.toHaveBeenCalled();
    });

    test('sends via Twilio REST API when configured and receives 201', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'AC123';
      process.env.TWILIO_AUTH_TOKEN = 'token';
      process.env.TWILIO_PHONE_FROM = '+254700000001';
      mockPost.mockResolvedValue({ status: 201, data: { sid: 'SM123' } });

      const { sendSms, isSmsConfigured } = require('../services/twilioService');
      expect(isSmsConfigured()).toBe(true);

      const result = await sendSms('+254700000000', 'hi');
      expect(result).toBe(true);
      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining('/2010-04-01/Accounts/AC123/Messages.json'),
        expect.any(String),
        expect.objectContaining({
          auth: { username: 'AC123', password: 'token' },
        })
      );
    });

    test('returns false when Twilio returns non-201 status', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'AC123';
      process.env.TWILIO_AUTH_TOKEN = 'token';
      process.env.TWILIO_PHONE_FROM = '+254700000001';
      mockPost.mockResolvedValue({ status: 400 });

      const { sendSms } = require('../services/twilioService');
      await expect(sendSms('+254700000000', 'hi')).resolves.toBe(false);
    });

    test('returns false (does not throw) when the request itself fails', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'AC123';
      process.env.TWILIO_AUTH_TOKEN = 'token';
      process.env.TWILIO_PHONE_FROM = '+254700000001';
      mockPost.mockRejectedValue(new Error('network down'));

      const { sendSms } = require('../services/twilioService');
      await expect(sendSms('+254700000000', 'hi')).resolves.toBe(false);
    });

    test('no-ops when phone or message is missing', async () => {
      const { sendSms } = require('../services/twilioService');
      await expect(sendSms('', 'hi')).resolves.toBe(false);
      await expect(sendSms('+254700000000', '')).resolves.toBe(false);
    });
  });
});
