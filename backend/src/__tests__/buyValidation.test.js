const { schemas } = require('../middleware/validation');

// routes/buy.js's /reserve, /mpesa, and /credit handlers were all validated
// against schemas.payment (amount/phone/userId only). Combined with
// stripUnknown: true, every field those handlers actually read (fiat,
// currency, walletAddress, quoteId, description, idempotencyKey) was
// silently deleted before the handler ever saw it. These tests lock in the
// dedicated schemas that now match each handler's real field usage.

const VALID_ADDRESS = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';
const VALID_PHONE = '254712345678';

describe('schemas.buyReserve (POST /api/buy/reserve)', () => {
  test('retains fiat, currency, and walletAddress instead of stripping them', () => {
    const { error, value } = schemas.buyReserve.validate({
      amount: 100,
      fiat: '4200 KES',
      currency: 'KES',
      walletAddress: VALID_ADDRESS,
      phone: VALID_PHONE,
    }, { stripUnknown: true });

    expect(error).toBeUndefined();
    expect(value.fiat).toBe('4200 KES');
    expect(value.currency).toBe('KES');
    expect(value.walletAddress).toBe(VALID_ADDRESS);
  });

  test('rejects a request missing walletAddress', () => {
    const { error } = schemas.buyReserve.validate({
      amount: 100,
      fiat: 4200,
      phone: VALID_PHONE,
    });
    expect(error).toBeDefined();
  });
});

describe('schemas.buyMpesaInitiate (POST /api/buy/mpesa)', () => {
  test('retains quoteId and description instead of stripping them', () => {
    const { error, value } = schemas.buyMpesaInitiate.validate({
      quoteId: 'abc123quote',
      phone: VALID_PHONE,
      amount: 100,
      description: 'Buy 100 MLCNS',
    }, { stripUnknown: true });

    expect(error).toBeUndefined();
    expect(value.quoteId).toBe('abc123quote');
    expect(value.description).toBe('Buy 100 MLCNS');
  });

  test('rejects a request missing quoteId', () => {
    const { error } = schemas.buyMpesaInitiate.validate({ phone: VALID_PHONE, amount: 100 });
    expect(error).toBeDefined();
  });
});

describe('schemas.buyCredit (POST /api/buy/credit)', () => {
  test('retains quoteId and idempotencyKey for the reserved-credit path', () => {
    const { error, value } = schemas.buyCredit.validate({
      quoteId: 'abc123quote',
      idempotencyKey: 'idem-1',
    }, { stripUnknown: true });

    expect(error).toBeUndefined();
    expect(value.quoteId).toBe('abc123quote');
    expect(value.idempotencyKey).toBe('idem-1');
  });

  test('retains walletAddress and amount for the standalone-credit path', () => {
    const { error, value } = schemas.buyCredit.validate({
      walletAddress: VALID_ADDRESS,
      amount: 500,
    }, { stripUnknown: true });

    expect(error).toBeUndefined();
    expect(value.walletAddress).toBe(VALID_ADDRESS);
    expect(value.amount).toBe(500);
  });

  test('rejects a request with neither quoteId nor walletAddress', () => {
    const { error } = schemas.buyCredit.validate({ amount: 500 });
    expect(error).toBeDefined();
  });
});
