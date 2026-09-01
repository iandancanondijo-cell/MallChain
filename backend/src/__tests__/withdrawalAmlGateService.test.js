jest.mock('../models/WithdrawalRequest', () => ({
  find: jest.fn(),
}));
jest.mock('../models/WithdrawalAmlReview', () => ({
  findOne: jest.fn(),
}));
jest.mock('../models/WithdrawalStructuringFlag', () => ({
  findOneAndUpdate: jest.fn(),
}));

const WithdrawalRequest = require('../models/WithdrawalRequest');
const WithdrawalAmlReview = require('../models/WithdrawalAmlReview');
const WithdrawalStructuringFlag = require('../models/WithdrawalStructuringFlag');
const {
  requireApprovedAmlReview,
  checkAndFlagStructuring,
  AML_WITHDRAWAL_THRESHOLD_KES,
} = require('../services/withdrawalAmlGateService');

describe('withdrawalAmlGateService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requireApprovedAmlReview', () => {
    test('defaults the threshold to KES 2500', () => {
      expect(AML_WITHDRAWAL_THRESHOLD_KES).toBe(2500);
    });

    test('does not require a review below the threshold', async () => {
      const result = await requireApprovedAmlReview('mall1address', 2000);
      expect(result.ok).toBe(true);
      expect(result.required).toBe(false);
      expect(WithdrawalAmlReview.findOne).not.toHaveBeenCalled();
    });

    test('passes at exactly the threshold when an approved unconsumed review exists', async () => {
      const sortMock = jest.fn().mockResolvedValue({ _id: 'rev1', status: 'approved' });
      WithdrawalAmlReview.findOne.mockReturnValueOnce({ sort: sortMock });

      const result = await requireApprovedAmlReview('mall1address', 2500);
      expect(result.ok).toBe(true);
      expect(result.required).toBe(true);
      expect(result.reviewId).toBe('rev1');
      expect(WithdrawalAmlReview.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ walletAddress: 'mall1address', status: 'approved', consumedByWithdrawalId: null })
      );
    });

    test('blocks above the threshold with no approved review on file', async () => {
      const approvedSort = jest.fn().mockResolvedValue(null);
      const latestSort = jest.fn().mockResolvedValue(null);
      WithdrawalAmlReview.findOne
        .mockReturnValueOnce({ sort: approvedSort })
        .mockReturnValueOnce({ sort: latestSort });

      const result = await requireApprovedAmlReview('mall1address', 3000);
      expect(result.ok).toBe(false);
      expect(result.required).toBe(true);
      expect(result.reviewStatus).toBe('none');
    });

    test('reports a pending review distinctly from no review at all', async () => {
      const approvedSort = jest.fn().mockResolvedValue(null);
      const latestSort = jest.fn().mockResolvedValue({ _id: 'rev2', status: 'pending' });
      WithdrawalAmlReview.findOne
        .mockReturnValueOnce({ sort: approvedSort })
        .mockReturnValueOnce({ sort: latestSort });

      const result = await requireApprovedAmlReview('mall1address', 3000);
      expect(result.ok).toBe(false);
      expect(result.reviewStatus).toBe('pending');
      expect(result.reviewId).toBe('rev2');
    });
  });

  describe('checkAndFlagStructuring', () => {
    test('does nothing when cumulative completed withdrawals are below the threshold', async () => {
      WithdrawalRequest.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ _id: 'w1', amountKes: 1000 }, { _id: 'w2', amountKes: 500 }]),
      });

      const result = await checkAndFlagStructuring('mall1address');
      expect(result).toBeNull();
      expect(WithdrawalStructuringFlag.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('flags when cumulative completed withdrawals reach the threshold with no single one crossing it', async () => {
      WithdrawalRequest.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          { _id: 'w1', amountKes: 1000 },
          { _id: 'w2', amountKes: 900 },
          { _id: 'w3', amountKes: 800 },
        ]),
      });
      WithdrawalStructuringFlag.findOneAndUpdate.mockResolvedValue({ _id: 'flag1', cumulativeKes: 2700 });

      const result = await checkAndFlagStructuring('mall1address');
      expect(result).toEqual({ _id: 'flag1', cumulativeKes: 2700 });
      expect(WithdrawalStructuringFlag.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ walletAddress: 'mall1address' }),
        expect.objectContaining({ $set: expect.objectContaining({ cumulativeKes: 2700 }) }),
        expect.objectContaining({ upsert: true })
      );
    });

    test('never throws — returns null on a DB error instead, since this must not block the withdrawal path', async () => {
      WithdrawalRequest.find.mockImplementation(() => { throw new Error('db down'); });
      const result = await checkAndFlagStructuring('mall1address');
      expect(result).toBeNull();
    });
  });
});
