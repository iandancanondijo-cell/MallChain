jest.mock('../services/twilioService', () => ({
  sendSms: jest.fn(),
  isSmsConfigured: jest.fn(),
}));
jest.mock('../services/africastalkingService', () => ({
  sendSms: jest.fn(),
  isConfigured: jest.fn(),
}));

// The dispatcher reads config.notifications.sms.provider at module load, and
// config caches SMS_PROVIDER once. So every test sets its env var, resets the
// registry, then requires a fresh dispatcher + provider mock.
function load(provider) {
  if (provider === undefined) delete process.env.SMS_PROVIDER;
  else process.env.SMS_PROVIDER = provider;
  jest.resetModules();
  return {
    twilio: require('../services/twilioService'),
    africastalking: require('../services/africastalkingService'),
    dispatcher: require('../services/smsService'),
  };
}

describe('smsService (dispatcher)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('routes to Twilio by default', async () => {
    const { twilio, dispatcher } = load(undefined);
    twilio.sendSms.mockResolvedValue(true);

    const result = await dispatcher.sendSms('+254700000000', 'hi');
    expect(result).toBe(true);
    expect(twilio.sendSms).toHaveBeenCalledWith('+254700000000', 'hi');
  });

  test('routes to Africa\'s Talking when SMS_PROVIDER=africastalking', async () => {
    const { africastalking, dispatcher } = load('africastalking');
    africastalking.sendSms.mockResolvedValue(true);

    const result = await dispatcher.sendSms('254700000000', 'hi');
    expect(result).toBe(true);
    expect(africastalking.sendSms).toHaveBeenCalledWith('254700000000', 'hi');
  });

  test('never throws even if the provider fails', async () => {
    const { twilio, dispatcher } = load(undefined);
    twilio.sendSms.mockRejectedValue(new Error('provider down'));

    await expect(dispatcher.sendSms('+254700000000', 'hi')).resolves.toBe(false);
  });

  test('no-ops when phone or message is missing', async () => {
    const { dispatcher } = load(undefined);
    await expect(dispatcher.sendSms('', 'hi')).resolves.toBe(false);
    await expect(dispatcher.sendSms('+254700000000', '')).resolves.toBe(false);
  });

  test('isConfigured delegates to the selected provider', () => {
    const { twilio, dispatcher } = load(undefined);
    twilio.isSmsConfigured.mockReturnValue(true);
    expect(dispatcher.isConfigured()).toBe(true);
  });
});
