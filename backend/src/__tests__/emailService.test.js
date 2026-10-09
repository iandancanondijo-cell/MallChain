jest.mock('../services/sendgridService', () => ({
  sendEmail: jest.fn(),
  isConfigured: jest.fn(),
}));
jest.mock('../services/twilioService', () => ({
  sendEmail: jest.fn(),
  sendSms: jest.fn(),
  isEmailConfigured: jest.fn(),
  isSmsConfigured: jest.fn(),
}));
jest.mock('../services/smtpService', () => ({
  sendEmail: jest.fn(),
  isConfigured: jest.fn(),
}));

// The dispatcher reads config.notifications.email.provider at module load,
// and config caches EMAIL_PROVIDER once. So every test sets its env var,
// resets the registry, then requires a fresh dispatcher + provider mock.
function load(provider) {
  if (provider === undefined) delete process.env.EMAIL_PROVIDER;
  else process.env.EMAIL_PROVIDER = provider;
  jest.resetModules();
  return {
    sendgrid: require('../services/sendgridService'),
    twilio: require('../services/twilioService'),
    smtp: require('../services/smtpService'),
    dispatcher: require('../services/emailService'),
  };
}

describe('emailService (dispatcher)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('routes to SendGrid by default', async () => {
    const { sendgrid, dispatcher } = load(undefined);
    sendgrid.sendEmail.mockResolvedValue(true);

    const result = await dispatcher.sendEmail('a@b.com', 'Subject', 'Body');
    expect(result).toBe(true);
    expect(sendgrid.sendEmail).toHaveBeenCalledWith('a@b.com', 'Subject', 'Body');
  });

  test('routes to Twilio when EMAIL_PROVIDER=twilio', async () => {
    const { twilio, dispatcher } = load('twilio');
    twilio.sendEmail.mockResolvedValue(true);

    const result = await dispatcher.sendEmail('a@b.com', 'Subject', 'Body');
    expect(result).toBe(true);
    expect(twilio.sendEmail).toHaveBeenCalledWith('a@b.com', 'Subject', 'Body');
  });

  test('routes to SMTP when EMAIL_PROVIDER=smtp', async () => {
    const { smtp, dispatcher } = load('smtp');
    smtp.sendEmail.mockResolvedValue(true);

    const result = await dispatcher.sendEmail('a@b.com', 'Subject', 'Body');
    expect(result).toBe(true);
    expect(smtp.sendEmail).toHaveBeenCalledWith('a@b.com', 'Subject', 'Body');
  });

  test('never throws even if the provider fails', async () => {
    const { sendgrid, dispatcher } = load(undefined);
    sendgrid.sendEmail.mockRejectedValue(new Error('provider down'));

    await expect(dispatcher.sendEmail('a@b.com', 'Subject', 'Body')).resolves.toBe(false);
  });

  test('no-ops when recipient or subject is missing', async () => {
    const { dispatcher } = load(undefined);
    await expect(dispatcher.sendEmail('', 'Subject', 'Body')).resolves.toBe(false);
    await expect(dispatcher.sendEmail('a@b.com', '', 'Body')).resolves.toBe(false);
  });

  test('isConfigured delegates to the selected provider', () => {
    const { sendgrid, dispatcher } = load(undefined);
    sendgrid.isConfigured.mockReturnValue(true);
    expect(dispatcher.isConfigured()).toBe(true);
  });
});
