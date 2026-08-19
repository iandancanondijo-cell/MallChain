// Regression coverage for reconciling ValidatorApplication's admin-set
// isActiveValidator (an off-chain mines-review-eligibility flag) against
// real on-chain validator bonding: getMyApplication now also reports
// onChainBonded, queried directly from the chain, independent of the
// application's own status/isActiveValidator bookkeeping.

jest.mock('axios');
jest.mock('../models/ValidatorApplication', () => ({
  findOne: jest.fn(),
}));

const axios = require('axios');
const ValidatorApplication = require('../models/ValidatorApplication');
const validatorController = require('../controllers/validatorController');

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function mockFindOne(result) {
  ValidatorApplication.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(result) });
}

describe('validatorController.getMyApplication — onChainBonded reconciliation', () => {
  beforeEach(() => jest.resetAllMocks());

  test('reports onChainBonded:true when the chain says the validator is bonded, regardless of admin approval status', async () => {
    mockFindOne({
      applicantAddress: 'mall1buyer',
      validatorAddress: 'mallvaloper1abc',
      status: 'pending',
      isActiveValidator: false,
    });
    axios.get.mockResolvedValue({ data: { validator: { status: 'BOND_STATUS_BONDED' } } });

    const req = { query: { address: 'mall1buyer' } };
    const res = mockRes();
    await validatorController.getMyApplication(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, onChainBonded: true })
    );
  });

  test('reports onChainBonded:false when the application was admin-approved but the address never actually bonded on-chain', async () => {
    mockFindOne({
      applicantAddress: 'mall1buyer',
      validatorAddress: 'mallvaloper1abc',
      status: 'approved',
      isActiveValidator: true,
    });
    const notFound = new Error('not found');
    notFound.response = { status: 404 };
    axios.get.mockRejectedValue(notFound);

    const req = { query: { address: 'mall1buyer' } };
    const res = mockRes();
    await validatorController.getMyApplication(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, onChainBonded: false })
    );
  });

  test('does not query the chain when there is no application on file', async () => {
    mockFindOne(null);

    const req = { query: { address: 'mall1nobody' } };
    const res = mockRes();
    await validatorController.getMyApplication(req, res);

    expect(axios.get).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, application: null });
  });
});
