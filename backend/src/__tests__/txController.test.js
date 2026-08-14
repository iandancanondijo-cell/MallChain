const axios = require('axios');

jest.mock('axios');
jest.mock('../mallwallet/queue/transactionQueue', () => ({
  getTransactionQueue: jest.fn(),
}));
jest.mock('../models/transaction', () => ({
  find: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
}));

const Tx = require('../models/transaction');
const { getTransactionQueue } = require('../mallwallet/queue/transactionQueue');
const txController = require('../controllers/txController');

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('txController.relay', () => {
  beforeEach(() => jest.resetAllMocks());

  test('rejects a payload missing required fields', async () => {
    const req = { body: { creator: 'mall1a' } };
    const res = mockRes();

    await txController.relay(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'invalid_payload' })
    );
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('forwards a valid signed payload to the chain REST gateway', async () => {
    axios.post.mockResolvedValue({ data: { tx_response: { code: 0 } } });
    const req = {
      body: {
        creator: 'mall1a',
        to: 'mall1b',
        amount: 100,
        signature: 'sig',
        public_key: 'pub',
      },
    };
    const res = mockRes();

    await txController.relay(req, res);

    expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/transfer'), req.body);
    expect(res.json).toHaveBeenCalledWith({ forwarded: true, resp: { tx_response: { code: 0 } } });
  });

  test('returns 502 when the chain gateway rejects the relay', async () => {
    axios.post.mockRejectedValue(new Error('gateway unreachable'));
    const req = {
      body: {
        creator: 'mall1a',
        to: 'mall1b',
        amount: 100,
        signature: 'sig',
        public_key: 'pub',
      },
    };
    const res = mockRes();

    await txController.relay(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'relay_failed', detail: 'gateway unreachable' })
    );
  });
});

describe('txController.create', () => {
  beforeEach(() => jest.resetAllMocks());

  test('rejects a payload missing required fields', async () => {
    const req = { body: { from: 'mall1a' } };
    const res = mockRes();

    await txController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Tx.create).not.toHaveBeenCalled();
  });

  test('persists the tx and enqueues it for relay', async () => {
    Tx.create.mockResolvedValue({ _id: 'tx-1' });
    const addMock = jest.fn().mockResolvedValue(undefined);
    getTransactionQueue.mockReturnValue({ add: addMock });

    const req = {
      body: { from: 'mall1a', to: 'mall1b', amount: 100, signedTx: 'deadbeef' },
    };
    const res = mockRes();

    await txController.create(req, res);

    expect(Tx.create).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'mall1a', to: 'mall1b', amount: 100, status: 'queued' })
    );
    expect(addMock).toHaveBeenCalledWith(
      'tx-relay',
      expect.objectContaining({ txId: 'tx-1', signedTx: 'deadbeef' }),
      expect.objectContaining({ attempts: 3 })
    );
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ id: 'tx-1', status: 'queued' });
  });
});

describe('txController.get', () => {
  beforeEach(() => jest.resetAllMocks());

  test('returns 404 when the tx does not exist', async () => {
    Tx.findById.mockResolvedValue(null);
    const req = { params: { id: 'missing' } };
    const res = mockRes();

    await txController.get(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns the tx when found', async () => {
    Tx.findById.mockResolvedValue({ _id: 'tx-1', status: 'confirmed' });
    const req = { params: { id: 'tx-1' } };
    const res = mockRes();

    await txController.get(req, res);

    expect(res.json).toHaveBeenCalledWith({ _id: 'tx-1', status: 'confirmed' });
  });
});
