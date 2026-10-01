const mongoose = require('mongoose');
const User = require('../models/user');
const WalletTransaction = require('../models/WalletTransaction');
const EduInteraction = require('../models/EduInteraction');
const EduResource = require('../models/EduResource');
const { requireWalletAddress, syncMallPointAccount } = require('./mallpointsService');
const logger = require('../utils/logger');

const MALLPOINT_PRICE_KES = Number(process.env.MALLPOINT_PRICE_KES) || 2;
const VIEW_REWARD_KES = 7;
const DOWNLOAD_REWARD_KES = 13;
const VIEW_REWARD_MLPTS = VIEW_REWARD_KES / MALLPOINT_PRICE_KES;
const DOWNLOAD_REWARD_MLPTS = DOWNLOAD_REWARD_KES / MALLPOINT_PRICE_KES;

async function rewardForInteraction({ resourceId, viewerId, type }) {
  const rewardMlpts = type === 'view' ? VIEW_REWARD_MLPTS : DOWNLOAD_REWARD_MLPTS;
  const rewardKes = type === 'view' ? VIEW_REWARD_KES : DOWNLOAD_REWARD_KES;

  const resource = await EduResource.findOne({ _id: resourceId, status: 'published' });
  if (!resource) {
    const err = new Error('Resource not found');
    err.code = 'RESOURCE_NOT_FOUND';
    throw err;
  }

  if (String(resource.authorId) === String(viewerId)) {
    const err = new Error('You cannot earn rewards from your own content');
    err.code = 'SELF_REWARD_BLOCKED';
    throw err;
  }

  const existing = await EduInteraction.findOne({ resourceId, userId: String(viewerId), type });
  if (existing) {
    return {
      rewarded: false,
      reason: 'already_rewarded',
      interaction: existing,
    };
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const author = await User.findById(resource.authorId).session(session);
      if (!author) {
        throw new Error('Author not found');
      }

      requireWalletAddress(author, { userId: resource.authorId, flow: `edu_${type}_reward` });

      const interaction = await EduInteraction.create([{
        resourceId,
        userId: String(viewerId),
        type,
        rewardMlpts,
        authorId: String(resource.authorId),
      }], { session });

      await WalletTransaction.create([{
        user_id: resource.authorId,
        type: 'credit',
        amount: rewardMlpts,
        currency: 'MLPTS',
        description: `Education ${type} reward: ${rewardKes} KES for ${resource.title}`,
        reference_id: String(resourceId),
        reference_type: `edu_${type}`,
      }], { session });

      await User.findByIdAndUpdate(resource.authorId, {
        $inc: { mlpts_balance: rewardMlpts },
      }).session(session);

      await syncMallPointAccount(author.walletAddress, rewardMlpts, session, {
        userId: resource.authorId,
        flow: `edu_${type}_reward`,
      });

      const incField = type === 'view' ? { viewCount: 1 } : { downloadCount: 1 };
      await EduResource.findByIdAndUpdate(resourceId, { $inc: incField }).session(session);

      result = {
        rewarded: true,
        interaction: interaction[0],
        rewardMlpts,
        rewardKes,
        authorNewBalance: (author.mlpts_balance || 0) + rewardMlpts,
      };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

function getRewardRates() {
  return {
    viewRewardKes: VIEW_REWARD_KES,
    viewRewardMlpts: VIEW_REWARD_MLPTS,
    downloadRewardKes: DOWNLOAD_REWARD_KES,
    downloadRewardMlpts: DOWNLOAD_REWARD_MLPTS,
    mallpointPriceKes: MALLPOINT_PRICE_KES,
  };
}

module.exports = {
  rewardForInteraction,
  getRewardRates,
  VIEW_REWARD_KES,
  VIEW_REWARD_MLPTS,
  DOWNLOAD_REWARD_KES,
  DOWNLOAD_REWARD_MLPTS,
};
