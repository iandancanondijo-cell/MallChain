// Coverage for services/amlProvider.js's provenance contract.
//
// The rule these tests hold the file to: `screened` says whether a sanctions /
// PEP / adverse-media / watchlist list was actually consulted. A KYC record is
// a compliance audit trail, so a path that consults nothing must not report a
// finding — not "no hits" (which kycController would read as low risk) and not
// a fabricated hit either (which is what the production safeguard used to do).
jest.mock('axios', () => ({ post: jest.fn(), get: jest.fn() }));

const axios = require('axios');

const {
  UnscreenedAmlProvider,
  SafeguardAmlProvider,
  ChainalysisProvider,
  TrmLabsProvider,
  ComplyAdvantageProvider,
  HttpAmlProvider,
  getAmlProvider,
  screenAml,
  resetAmlProvider,
} = require('../services/amlProvider');

const KYC = { firstName: 'Jane', lastName: 'Doe', politicalExposure: true };

afterEach(() => {
  delete process.env.AML_PROVIDER_TYPE;
  delete process.env.AML_PROVIDER_API_KEY;
  delete process.env.AML_PROVIDER_URL;
  delete process.env.AML_CHAINALYSIS_ENDPOINT;
  resetAmlProvider();
  jest.resetAllMocks();
});

describe('the screened flag', () => {
  test('an un-screened submission reports no findings of any kind', async () => {
    const result = await new UnscreenedAmlProvider().screen(KYC);

    expect(result.screened).toBe(false);
    expect(result).toMatchObject({ sanctions: false, pep: false, adverseMedia: false, watchlist: false });
    // Nothing was measured, so no risk level is claimed for it.
    expect(result.riskLevel).toBe('unknown');
    expect(result.provider).toBe('none');
    expect(result.warning).toMatch(/No AML screening vendor is configured/);
  });

  test("the applicant's PEP declaration is kept as a declaration, never as a pep hit", async () => {
    const result = await new UnscreenedAmlProvider().screen(KYC);
    expect(result.pep).toBe(false);
    expect(result.raw.declaredPoliticalExposure).toBe(true);
  });

  test('the production safeguard holds submissions without inventing a sanctions hit', async () => {
    const result = await new SafeguardAmlProvider().screen(KYC);

    expect(result.screened).toBe(false);
    expect(result.provider).toBe('safeguard');
    expect(result.sanctions).toBe(false);
    expect(result.warning).toMatch(/production has no real AML provider configured/);
  });

  test('every provider answers the same shape, screened included', async () => {
    axios.post.mockResolvedValue({ data: {} });

    const instances = [
      ['none', new UnscreenedAmlProvider()],
      ['safeguard', new SafeguardAmlProvider()],
      ['chainalysis', new ChainalysisProvider({ apiKey: 'k' })],
      ['trm', new TrmLabsProvider({ apiKey: 'k' })],
      ['complyadvantage', new ComplyAdvantageProvider({ apiKey: 'k' })],
      ['http', new HttpAmlProvider({ apiKey: 'k', url: 'https://screening.example/v1' })],
    ];

    for (const [expectedProvider, provider] of instances) {
      const result = await provider.screen(KYC);
      expect(typeof result.screened).toBe('boolean');
      for (const flag of ['sanctions', 'pep', 'adverseMedia', 'watchlist']) {
        expect(typeof result[flag]).toBe('boolean');
      }
      expect(result.provider).toBe(expectedProvider);
      // The one invariant: only a real vendor call may claim screening
      // happened, and a real vendor call always claims it.
      expect(result.screened).toBe(!['none', 'safeguard'].includes(expectedProvider));
    }
    expect(instances).toHaveLength(6);
  });
});

describe('vendor responses', () => {
  test('a clean answer from a real vendor reports screening happened', async () => {
    axios.post.mockResolvedValue({ data: {} });
    const result = await new ChainalysisProvider({ apiKey: 'k' }).screen(KYC);
    expect(result).toMatchObject({ screened: true, sanctions: false, provider: 'chainalysis' });
  });

  test('a hit is reported as a hit', async () => {
    axios.post.mockResolvedValue({ data: { sanctions: { hit: true } } });
    const result = await new ChainalysisProvider({ apiKey: 'k' }).screen(KYC);
    expect(result).toMatchObject({ screened: true, sanctions: true, riskLevel: 'critical' });
  });

  test('a 200 that carries no screening payload is refused, not read as clean', async () => {
    // An intercepting proxy or error page answering 200 with a body that is
    // not a JSON object would otherwise become "screened, no hits".
    axios.post.mockResolvedValue({ data: '<html>error</html>' });
    await expect(new ChainalysisProvider({ apiKey: 'k' }).screen(KYC)).rejects.toThrow(/no readable screening payload/);

    axios.post.mockResolvedValue({ data: undefined });
    await expect(new HttpAmlProvider({ apiKey: 'k', url: 'https://screening.example/v1' }).screen(KYC))
      .rejects.toThrow(/no readable screening payload/);
  });

  test('a failing call surfaces as an error so the caller can fail closed', async () => {
    axios.post.mockRejectedValue(Object.assign(new Error('Cloudflare 530'), { response: { status: 530 } }));
    await expect(new ChainalysisProvider({ apiKey: 'k' }).screen(KYC)).rejects.toThrow(/Chainalysis AML screening failed/);
  });
});

describe('provider selection', () => {
  test('without a configured vendor the selected provider screens nobody', async () => {
    resetAmlProvider();
    const provider = getAmlProvider();
    expect(provider).toBeInstanceOf(UnscreenedAmlProvider);
    expect((await provider.screen(KYC)).screened).toBe(false);
  });

  test('a vendor type with a key selects that vendor, and a key without a type selects the HTTP provider', () => {
    process.env.AML_PROVIDER_TYPE = 'trm';
    process.env.AML_PROVIDER_API_KEY = 'secret';
    resetAmlProvider();
    expect(getAmlProvider()).toBeInstanceOf(TrmLabsProvider);

    delete process.env.AML_PROVIDER_TYPE;
    process.env.AML_PROVIDER_URL = 'https://screening.example/v1';
    resetAmlProvider();
    expect(getAmlProvider()).toBeInstanceOf(HttpAmlProvider);
  });

  test('a named vendor without a key does not silently select a screening provider', async () => {
    process.env.AML_PROVIDER_TYPE = 'chainalysis';
    delete process.env.AML_PROVIDER_API_KEY;
    resetAmlProvider();

    const result = await screenAml(KYC);
    // The point is that the misconfiguration cannot read as a clean screening:
    // whatever is selected, nothing was screened and the record says so.
    expect(result.screened).toBe(false);
    expect(['none', 'safeguard']).toContain(result.provider);
  });

  test('sample-env boilerplate in the key is not treated as a configured vendor', async () => {
    // `AML_PROVIDER_API_KEY=YOUR_CHAINALYSIS_API_KEY` is what this repo's own
    // .env carries. Read as a configured vendor it meant every submission
    // spent the full axios timeout dialling api.chainalysis.com, then reported
    // "unavailable" — an outage that never happened — in the audit trail.
    process.env.AML_PROVIDER_TYPE = 'chainalysis';
    process.env.AML_PROVIDER_API_KEY = 'YOUR_CHAINALYSIS_API_KEY';
    resetAmlProvider();
    axios.post.mockResolvedValue({ data: {} });

    const result = await screenAml(KYC);

    expect(axios.post).not.toHaveBeenCalled();
    expect(result.screened).toBe(false);
    expect(result.provider).toBe('none');
  });

  test('the selection is cached until resetAmlProvider re-reads the environment', () => {
    resetAmlProvider();
    expect(getAmlProvider()).toBeInstanceOf(UnscreenedAmlProvider);

    process.env.AML_PROVIDER_TYPE = 'complyadvantage';
    process.env.AML_PROVIDER_API_KEY = 'secret';
    // Still the boot-time choice — the cache is process-wide on purpose, so a
    // running process does not change providers mid-request.
    expect(getAmlProvider()).toBeInstanceOf(UnscreenedAmlProvider);

    resetAmlProvider();
    expect(getAmlProvider()).toBeInstanceOf(ComplyAdvantageProvider);
  });
});
