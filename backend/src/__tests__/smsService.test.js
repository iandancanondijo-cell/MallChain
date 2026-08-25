const mockPost = jest.fn();
jest.mock('axios', () => ({ post: (...args) => mockPost(...args) }));

describe('smsService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.AFRICASTALKING_API_KEY;
    delete process.env.AFRICASTALKING_USERNAME;
  });

  test('no-ops without throwing when Africa\'s Talking is not configured', async () => {
    const { sendSms, isConfigured } = require('../services/smsService');
    expect(isConfigured()).toBe(false);
    await expect(sendSms('254700000000', 'hi')).resolves.toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('sends via Africa\'s Talking when configured and reports success', async () => {
    process.env.AFRICASTALKING_API_KEY = 'key';
    process.env.AFRICASTALKING_USERNAME = 'user';
    mockPost.mockResolvedValue({
      data: { SMSMessageData: { Recipients: [{ status: 'Success' }] } },
    });

    const { sendSms, isConfigured } = require('../services/smsService');
    expect(isConfigured()).toBe(true);

    const result = await sendSms('254700000000', 'hi');
    expect(result).toBe(true);
    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining('/version1/messaging'),
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ apiKey: 'key' }) })
    );
  });

  test('returns false when the provider reports no successful recipient', async () => {
    process.env.AFRICASTALKING_API_KEY = 'key';
    process.env.AFRICASTALKING_USERNAME = 'user';
    mockPost.mockResolvedValue({
      data: { SMSMessageData: { Recipients: [{ status: 'InvalidPhoneNumber' }] } },
    });

    const { sendSms } = require('../services/smsService');
    await expect(sendSms('not-a-phone', 'hi')).resolves.toBe(false);
  });

  test('returns false (does not throw) when the request itself fails', async () => {
    process.env.AFRICASTALKING_API_KEY = 'key';
    process.env.AFRICASTALKING_USERNAME = 'user';
    mockPost.mockRejectedValue(new Error('network down'));

    const { sendSms } = require('../services/smsService');
    await expect(sendSms('254700000000', 'hi')).resolves.toBe(false);
  });

  test('no-ops when phone or message is missing', async () => {
    const { sendSms } = require('../services/smsService');
    await expect(sendSms('', 'hi')).resolves.toBe(false);
    await expect(sendSms('254700000000', '')).resolves.toBe(false);
  });
});
