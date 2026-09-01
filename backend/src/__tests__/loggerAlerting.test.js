// O2: logger.error() can fire a webhook/Slack alert (a PagerDuty-free
// notification path) — this locks in the throttle (so a hot error loop
// can't turn into an alert storm) and the two payload shapes (generic JSON
// vs. Slack's {text: ...}).
jest.mock('axios', () => ({ post: jest.fn().mockResolvedValue({}) }));
jest.mock('pino', () => {
  const mockLoggerInstance = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const pinoFn = jest.fn(() => mockLoggerInstance);
  pinoFn.destination = jest.fn(() => ({}));
  pinoFn.multistream = jest.fn(() => ({}));
  return pinoFn;
});

describe('logger error-alerting webhook', () => {
  const ORIGINAL_ENV = process.env;

  // jest.resetModules() re-invokes the axios mock factory too, so a stale
  // top-level `require('axios')` would end up pointing at a DIFFERENT mock
  // instance than the one logger.js (freshly required per test) actually
  // calls — both must be re-required together, inside each test.
  function freshLoggerAndAxios() {
    jest.resetModules();
    const axios = require('axios');
    const logger = require('../utils/logger');
    return { axios, logger };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, ALERT_WEBHOOK_URL: 'https://example.com/hook' };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('does nothing when ALERT_WEBHOOK_URL is not set', () => {
    process.env.ALERT_WEBHOOK_URL = '';
    const { axios, logger } = freshLoggerAndAxios();

    logger.error('ctx', 'boom', new Error('x'));

    expect(axios.post).not.toHaveBeenCalled();
  });

  test('posts a generic JSON payload by default', () => {
    const { axios, logger } = freshLoggerAndAxios();

    logger.error('ctx', 'boom', new Error('x'));

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, payload] = axios.post.mock.calls[0];
    expect(url).toBe('https://example.com/hook');
    expect(payload).toEqual(expect.objectContaining({ context: 'ctx', message: 'boom' }));
  });

  test('posts a Slack-shaped {text} payload when ALERT_WEBHOOK_FORMAT=slack', () => {
    process.env.ALERT_WEBHOOK_FORMAT = 'slack';
    const { axios, logger } = freshLoggerAndAxios();

    logger.error('ctx', 'boom', new Error('x'));

    const [, payload] = axios.post.mock.calls[0];
    expect(payload).toEqual(expect.objectContaining({ text: expect.stringContaining('boom') }));
  });

  test('throttles repeated alerts for the same context+message', () => {
    const { axios, logger } = freshLoggerAndAxios();

    logger.error('ctx', 'boom', new Error('x'));
    logger.error('ctx', 'boom', new Error('x'));
    logger.error('ctx', 'boom', new Error('x'));

    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('does not throttle a different message from the same context', () => {
    const { axios, logger } = freshLoggerAndAxios();

    logger.error('ctx', 'boom', new Error('x'));
    logger.error('ctx', 'a different problem', new Error('x'));

    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  test('never alerts on info/warn, only on error', () => {
    const { axios, logger } = freshLoggerAndAxios();

    logger.info('ctx', 'all good');
    logger.warn('ctx', 'careful');

    expect(axios.post).not.toHaveBeenCalled();
  });
});
