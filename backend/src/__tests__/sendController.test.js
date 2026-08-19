const express = require('express');
const request = require('supertest');

jest.mock('axios');
jest.mock('../services/mallcoinService');
// sendController pulls in mallcoinTxBuilder -> @cosmjs/proto-signing, whose
// @cosmjs/crypto@0.39 argon2 support drags in an ESM-only transitive dep
// Jest's CJS resolver can't parse. Factory-mock (not auto-mock) so that
// module tree is never actually loaded — see mallcoinTxBuilder.test.js.
jest.mock('@cosmjs/proto-signing', () => ({
  DirectSecp256k1Wallet: { fromKey: jest.fn() },
  DirectSecp256k1HdWallet: { fromMnemonic: jest.fn() },
}));
jest.mock('@cosmjs/stargate', () => ({
  SigningStargateClient: { connectWithSigner: jest.fn() },
  GasPrice: { fromString: jest.fn(() => ({})) },
  calculateFee: jest.fn((gas) => ({ amount: [{ denom: 'stake', amount: '1000' }], gas: String(gas) })),
}));
jest.mock('../services/mlcoinProto', () => ({
  MSG_TRANSFER_MALLCOIN: '/marketplace.mlcoin.v1.MsgTransferMallcoin',
  createMlcoinRegistry: jest.fn(() => ({})),
}));

const axios = require('axios');
const mallcoinService = require('../services/mallcoinService');
const { errorHandler } = require('../utils/errorHandler');
const sendRoutes = require('../routes/send');

// Real, checksum-valid mall1... bech32 addresses — addressSchema
// (utils/validationSchemas.js) now does a real bech32 decode, not a regex,
// so fixtures must be genuinely valid addresses. ADDR_A is a real genesis
// wallet address (see routes/economy.js WALLET_ADDRESSES.founder); ADDR_B
// used to be ADDR_A with a couple of characters hand-edited to "look"
// different, which broke its checksum — exactly the class of typo bech32
// checksums exist to catch, and exactly what the new validation now rejects
// (see the checksum-rejection test below). Replaced with a second real,
// independently-generated address.
const ADDR_A = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';
const ADDR_B = 'mall1dqd2t5avk0hfu5mmaq2dgmgydvlv8qhxffymaw';
const VALID_TX_BYTES = Buffer.from('signed-tx-payload').toString('base64');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/send', sendRoutes);
  app.use(errorHandler());
  return app;
}

describe('sendController — real mall1... address flow (regression for a81288e)', () => {
  let app;

  beforeEach(() => {
    jest.resetAllMocks();
    app = buildApp();
  });

  describe('POST /api/send/mallcoins', () => {
    test('accepts real mall1... from/to addresses and broadcasts the pre-signed tx', async () => {
      axios.post.mockResolvedValue({
        data: { tx_response: { txhash: 'ABC123', code: 0 } },
      });

      const res = await request(app).post('/api/send/mallcoins').send({
        from: ADDR_A,
        to: ADDR_B,
        amount: 100,
        txBytes: VALID_TX_BYTES,
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, txHash: 'ABC123', from: ADDR_A, to: ADDR_B });
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/cosmos/tx/v1beta1/txs'),
        expect.objectContaining({ tx_bytes: VALID_TX_BYTES }),
        expect.any(Object)
      );
    });

    test('rejects addresses that are not mall1... bech32 (e.g. legacy 0x-style)', async () => {
      const res = await request(app).post('/api/send/mallcoins').send({
        from: '0x1234567890abcdef1234567890abcdef12345678',
        to: ADDR_B,
        amount: 100,
        txBytes: VALID_TX_BYTES,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_failed');
      expect(axios.post).not.toHaveBeenCalled();
    });

    test('rejects a well-formed-but-typo\'d address (valid prefix/length, invalid checksum)', async () => {
      // Same shape as ADDR_A with two characters swapped — exactly the class
      // of error bech32's checksum exists to catch, and what a prefix/length
      // regex would have silently accepted.
      const typoed = 'mall1z9f39uylkjv956xeltkdtsel5y6xu36xh2m6qh';
      const res = await request(app).post('/api/send/mallcoins').send({
        from: ADDR_A,
        to: typoed,
        amount: 100,
        txBytes: VALID_TX_BYTES,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_failed');
      expect(axios.post).not.toHaveBeenCalled();
    });

    test('surfaces a chain-side rejection (non-zero code) as a 400 with the raw log', async () => {
      axios.post.mockResolvedValue({
        data: { tx_response: { txhash: 'DEAD', code: 5, raw_log: 'insufficient funds' } },
      });

      const res = await request(app).post('/api/send/mallcoins').send({
        from: ADDR_A,
        to: ADDR_B,
        amount: 100,
        txBytes: VALID_TX_BYTES,
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_TRANSACTION');
      expect(res.body.error.details).toMatchObject({ code: 5, errorLog: 'insufficient funds' });
    });

    test('maps a refused chain connection to BLOCKCHAIN_UNAVAILABLE (503)', async () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:1317');
      err.code = 'ECONNREFUSED';
      axios.post.mockRejectedValue(err);

      const res = await request(app).post('/api/send/mallcoins').send({
        from: ADDR_A,
        to: ADDR_B,
        amount: 100,
        txBytes: VALID_TX_BYTES,
      });

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('BLOCKCHAIN_UNAVAILABLE');
    });
  });

  describe('GET /api/send/account/:address (account_number/sequence for client-side signing)', () => {
    test('parses the flat account_info shape (fixes the accounts/:address 500 on non-BaseAccount types)', async () => {
      axios.get.mockResolvedValue({
        status: 200,
        data: { info: { account_number: '42', sequence: '7', pub_key: { key: 'abc' } } },
      });

      const res = await request(app).get(`/api/send/account/${ADDR_A}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, accountNumber: 42, sequence: 7, notFound: false });
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining(`/cosmos/auth/v1beta1/account_info/${ADDR_A}`),
        expect.any(Object)
      );
      // Regression guard: must not fall back to the old endpoint that 500s
      // for treasury/faucet-style non-BaseAccount types.
      expect(axios.get).not.toHaveBeenCalledWith(
        expect.stringContaining('/cosmos/auth/v1beta1/accounts/'),
        expect.any(Object)
      );
    });

    test('returns notFound with zeroed sequence for a brand-new address instead of throwing', async () => {
      axios.get.mockResolvedValue({ status: 404, data: {} });

      const res = await request(app).get(`/api/send/account/${ADDR_A}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, accountNumber: 0, sequence: 0, notFound: true });
    });
  });

  describe('POST /api/send/payment (regression: schema previously stripped every field the handler reads)', () => {
    test('reaches processPayment with buyerAddress/sellerAddress/amountKES/txBytes intact', async () => {
      axios.get.mockResolvedValue({ data: { market_price: { buy_price: 0.6 } } });
      axios.post.mockResolvedValue({ data: { tx_response: { txhash: 'PAY1', code: 0 } } });

      const res = await request(app).post('/api/send/payment').send({
        buyerAddress: ADDR_A,
        sellerAddress: ADDR_B,
        amountKES: 500,
        txBytes: VALID_TX_BYTES,
        description: 'Order #42',
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        txHash: 'PAY1',
        buyer: ADDR_A,
        seller: ADDR_B,
        amountKES: 500,
        description: 'Order #42',
      });
    });

    test('rejects an invalid sellerAddress instead of silently stripping it', async () => {
      const res = await request(app).post('/api/send/payment').send({
        buyerAddress: ADDR_A,
        sellerAddress: 'not-a-real-address',
        amountKES: 500,
        txBytes: VALID_TX_BYTES,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_failed');
      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/send/status/:txHash', () => {
    test('reports confirmed for a code-0 tx', async () => {
      axios.get.mockResolvedValue({ data: { tx_response: { code: 0, height: '100', gas_used: '50000' } } });

      const res = await request(app).get('/api/send/status/ABC123ABC123ABC123ABC123ABC123ABC123ABC1');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, status: 'confirmed' });
    });

    test('reports pending (not an error) when the chain has not indexed the tx yet', async () => {
      const err = new Error('Not Found');
      err.response = { status: 404 };
      axios.get.mockRejectedValue(err);

      const res = await request(app).get('/api/send/status/ABC123ABC123ABC123ABC123ABC123ABC123ABC1');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: false, status: 'pending' });
    });
  });

  describe('POST /api/send/mlcns/transfer', () => {
    test('rejects a malformed address at the route schema layer', async () => {
      const res = await request(app).post('/api/send/mlcns/transfer').send({
        from: 'bad',
        to: ADDR_B,
        amountMlcns: 10,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_failed');
      expect(mallcoinService.getWalletBalance).not.toHaveBeenCalled();
    });

    test('rejects a schema-valid address that fails the controller-level isValidAddress check (defense in depth)', async () => {
      mallcoinService.isValidAddress.mockReturnValue(false);

      const res = await request(app).post('/api/send/mlcns/transfer').send({
        from: ADDR_A,
        to: ADDR_B,
        amountMlcns: 10,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_mall_address');
      expect(mallcoinService.getWalletBalance).not.toHaveBeenCalled();
    });

    test('rejects insufficient balance before forwarding to broadcast', async () => {
      mallcoinService.isValidAddress.mockReturnValue(true);
      mallcoinService.getWalletBalance.mockResolvedValue({ availableDisplay: 1 });

      const res = await request(app).post('/api/send/mlcns/transfer').send({
        from: ADDR_A,
        to: ADDR_B,
        amountMlcns: 100,
        txBytes: VALID_TX_BYTES,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('insufficient_mlcns');
      expect(axios.post).not.toHaveBeenCalled();
    });

    test('with sufficient balance and txBytes, delegates to the broadcast path', async () => {
      mallcoinService.isValidAddress.mockReturnValue(true);
      mallcoinService.getWalletBalance.mockResolvedValue({ availableDisplay: 1000 });
      axios.post.mockResolvedValue({ data: { tx_response: { txhash: 'MLCNS1', code: 0 } } });

      const res = await request(app).post('/api/send/mlcns/transfer').send({
        from: ADDR_A,
        to: ADDR_B,
        amountMlcns: 100,
        txBytes: VALID_TX_BYTES,
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, txHash: 'MLCNS1' });
    });

    test('rejects a private-key sign-on-server request (removed for security)', async () => {
      mallcoinService.isValidAddress.mockReturnValue(true);
      mallcoinService.getWalletBalance.mockResolvedValue({ availableDisplay: 1000 });

      const res = await request(app).post('/api/send/mlcns/transfer').send({
        from: ADDR_A,
        to: ADDR_B,
        amountMlcns: 100,
        privateKey: 'deadbeef',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('txBytes_required');
    });
  });
});
