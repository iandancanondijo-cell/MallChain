/**
 * MongoDB Indexes Configuration
 * Defines all indexes required for optimal query performance
 * 
 * Purpose:
 * - Explicit index documentation
 * - Automated index creation on startup
 * - Performance tuning reference
 * 
 * Naming convention: {collection}_{fields}_{type}
 */

const logger = require('../utils/logger');

/**
 * All required indexes with rationale
 */
const INDEXES = {
  users: [
    {
      fields: { email: 1 },
      options: { unique: true, sparse: true },
      rationale: 'Email lookups and uniqueness constraint',
    },
    {
      fields: { phone: 1 },
      options: { unique: true, sparse: true },
      rationale: 'Phone number lookups and uniqueness constraint',
    },
    {
      fields: { referralCode: 1 },
      options: { unique: true, sparse: true },
      rationale: 'Referral code lookups',
    },
    {
      fields: { createdAt: -1 },
      options: {},
      rationale: 'Sorting users by creation date',
    },
    {
      fields: { status: 1, createdAt: -1 },
      options: {},
      rationale: 'Filter users by status with date sorting',
    },
  ],

  wallets: [
    {
      fields: { userId: 1 },
      options: {},
      rationale: 'Find wallets by user',
    },
    {
      fields: { address: 1 },
      options: { unique: true },
      rationale: 'Blockchain address lookups and uniqueness',
    },
    {
      fields: { address: 1, network: 1 },
      options: { unique: true },
      rationale: 'Multi-chain wallet uniqueness',
    },
    {
      fields: { userId: 1, status: 1 },
      options: {},
      rationale: 'Find active wallets by user',
    },
  ],

  transactions: [
    {
      fields: { txHash: 1 },
      options: { unique: true, sparse: true },
      rationale: 'Blockchain transaction hash lookups',
    },
    {
      fields: { fromAddress: 1, createdAt: -1 },
      options: {},
      rationale: 'User outgoing transactions with chronological sorting',
    },
    {
      fields: { toAddress: 1, createdAt: -1 },
      options: {},
      rationale: 'User incoming transactions with chronological sorting',
    },
    {
      fields: { status: 1, createdAt: -1 },
      options: {},
      rationale: 'Filter by status (pending/confirmed/failed) with date',
    },
    {
      fields: { userId: 1, createdAt: -1 },
      options: {},
      rationale: 'User transaction history',
    },
    {
      fields: { createdAt: -1 },
      options: { expireAfterSeconds: 86400 },
      rationale: 'TTL index: auto-delete old logs after 24 hours',
    },
  ],

  market: [
    {
      fields: { productId: 1 },
      options: {},
      rationale: 'Product lookups',
    },
    {
      fields: { sellerId: 1, status: 1 },
      options: {},
      rationale: 'Seller product listings',
    },
    {
      fields: { category: 1, price: 1 },
      options: {},
      rationale: 'Category browsing with price filtering',
    },
    {
      fields: { createdAt: -1 },
      options: {},
      rationale: 'Recent listings',
    },
    {
      fields: { name: 'text', description: 'text' },
      options: {},
      rationale: 'Full-text search on product name and description',
    },
  ],

  orders: [
    {
      fields: { userId: 1, createdAt: -1 },
      options: {},
      rationale: 'User order history',
    },
    {
      fields: { status: 1, createdAt: -1 },
      options: {},
      rationale: 'Order status tracking with date',
    },
    {
      fields: { orderId: 1 },
      options: { unique: true },
      rationale: 'Order lookups',
    },
    {
      fields: { paymentStatus: 1, updatedAt: -1 },
      options: {},
      rationale: 'Pending payment tracking',
    },
  ],

  balances: [
    {
      fields: { userId: 1, currency: 1 },
      options: { unique: true },
      rationale: 'User balance lookups (one per currency)',
    },
    {
      fields: { userId: 1 },
      options: {},
      rationale: 'Find all balances for a user',
    },
    {
      fields: { currency: 1 },
      options: {},
      rationale: 'Global currency statistics',
    },
  ],

  liquidityPool: [
    {
      fields: { status: 1, createdAt: -1 },
      options: {},
      rationale: 'Filter by status with chronological sorting',
    },
    {
      fields: { userId: 1, status: 1 },
      options: {},
      rationale: 'User liquidity pool participation',
    },
    {
      fields: { poolId: 1 },
      options: {},
      rationale: 'Pool lookups',
    },
  ],

  kyc: [
    {
      fields: { userId: 1 },
      options: { unique: true },
      rationale: 'One KYC per user',
    },
    {
      fields: { status: 1 },
      options: {},
      rationale: 'KYC review queue',
    },
    {
      fields: { approvedAt: 1 },
      options: { sparse: true },
      rationale: 'Track verification completion',
    },
  ],

  notifications: [
    {
      fields: { userId: 1, createdAt: -1 },
      options: {},
      rationale: 'User notification feed',
    },
    {
      fields: { userId: 1, read: 1 },
      options: {},
      rationale: 'Unread notification count',
    },
    {
      fields: { createdAt: -1 },
      options: { expireAfterSeconds: 2592000 },
      rationale: 'TTL index: auto-delete after 30 days',
    },
  ],

  vaults: [
    {
      fields: { userId: 1 },
      options: { unique: true },
      rationale: 'One vault per user',
    },
    {
      fields: { encryptionKey: 1 },
      options: { sparse: true },
      rationale: 'Vault lookups by encryption key',
    },
  ],

  conversations: [
    {
      fields: { participants: 1 },
      options: {},
      rationale: 'Find conversations by participants',
    },
    {
      fields: { createdAt: -1 },
      options: {},
      rationale: 'Recent conversations',
    },
    {
      fields: { lastMessageAt: -1 },
      options: {},
      rationale: 'Sort by most recent activity',
    },
  ],

  messages: [
    {
      fields: { conversationId: 1, createdAt: -1 },
      options: {},
      rationale: 'Message history for a conversation',
    },
    {
      fields: { senderId: 1, createdAt: -1 },
      options: {},
      rationale: 'User sent messages',
    },
  ],

  referrals: [
    {
      fields: { referrerId: 1 },
      options: {},
      rationale: 'Find referrals made by a user',
    },
    {
      fields: { refereeId: 1 },
      options: { unique: true },
      rationale: 'Find who referred a user (one referrer per referee)',
    },
    {
      fields: { status: 1, createdAt: -1 },
      options: {},
      rationale: 'Track referral status with date',
    },
  ],

  staking: [
    {
      fields: { userId: 1 },
      options: {},
      rationale: 'User staking positions',
    },
    {
      fields: { status: 1, createdAt: -1 },
      options: {},
      rationale: 'Active staking positions',
    },
    {
      fields: { validatorAddress: 1 },
      options: {},
      rationale: 'Staking on a validator',
    },
  ],

  mallpoints: [
    {
      fields: { userId: 1, type: 1 },
      options: {},
      rationale: 'User mallpoint ledger by type',
    },
    {
      fields: { createdAt: -1 },
      options: {},
      rationale: 'Recent mallpoint transactions',
    },
  ],

  badges: [
    {
      fields: { userId: 1 },
      options: {},
      rationale: 'User badges',
    },
    {
      fields: { badgeType: 1 },
      options: {},
      rationale: 'Badge statistics',
    },
  ],

  amlReview: [
    {
      fields: { status: 1, createdAt: -1 },
      options: {},
      rationale: 'AML review queue',
    },
    {
      fields: { userId: 1 },
      options: {},
      rationale: 'User AML history',
    },
    {
      fields: { reviewedAt: 1 },
      options: { sparse: true },
      rationale: 'Track reviewed items',
    },
  ],

  activityLog: [
    {
      fields: { userId: 1, createdAt: -1 },
      options: {},
      rationale: 'User activity timeline',
    },
    {
      fields: { action: 1, createdAt: -1 },
      options: {},
      rationale: 'Global action statistics',
    },
    {
      fields: { createdAt: -1 },
      options: { expireAfterSeconds: 2592000 },
      rationale: 'TTL index: auto-delete after 30 days',
    },
  ],
};

/**
 * Create all indexes on database startup
 * @param {object} mongoose - Mongoose connection
 */
async function ensureIndexes(mongoose) {
  try {
    const db = mongoose.connection;
    const collections = Object.keys(INDEXES);

    logger.info('database', 'Starting index creation', { collectionCount: collections.length });

    for (const collectionName of collections) {
      try {
        const collection = db.collection(collectionName);
        const indexes = INDEXES[collectionName];

        for (const indexSpec of indexes) {
          try {
            // Create index with options
            await collection.createIndex(indexSpec.fields, indexSpec.options);
            logger.debug('database', `Index created: ${collectionName}`, {
              collection: collectionName,
              fields: Object.keys(indexSpec.fields),
              rationale: indexSpec.rationale,
            });
          } catch (err) {
            if (err.code === 85) {
              // Index already exists — this is fine
              logger.debug('database', `Index already exists: ${collectionName}`, {
                fields: Object.keys(indexSpec.fields),
              });
            } else {
              logger.warn('database', `Index creation warning: ${collectionName}`, {
                fields: Object.keys(indexSpec.fields),
                error: err.message,
              });
            }
          }
        }
      } catch (err) {
        logger.error('database', `Failed to ensure indexes for collection: ${collectionName}`, err);
      }
    }

    logger.info('database', 'Index creation completed');
    return true;
  } catch (err) {
    logger.error('database', 'Index creation failed', err);
    return false;
  }
}

/**
 * Get index statistics from MongoDB
 */
async function getIndexStats(mongoose) {
  try {
    const db = mongoose.connection;
    const collections = Object.keys(INDEXES);
    const stats = {};

    for (const collectionName of collections) {
      const collection = db.collection(collectionName);
      const indexInfo = await collection.getIndexes();
      stats[collectionName] = {
        indexes: Object.keys(indexInfo),
        count: Object.keys(indexInfo).length,
      };
    }

    return stats;
  } catch (err) {
    logger.error('database', 'Failed to get index statistics', err);
    return null;
  }
}

/**
 * Analyze index usage (requires database admin access and profiling enabled)
 */
async function analyzeIndexUsage(mongoose) {
  try {
    const db = mongoose.connection;
    const profileCollection = db.collection('system.profile');

    // Get queries that didn't use indexes (full collection scans)
    const unindexedQueries = await profileCollection
      .find({ 'planSummary': { $regex: 'COLLSCAN' } })
      .limit(10)
      .toArray();

    return {
      count: unindexedQueries.length,
      samples: unindexedQueries.map(q => ({
        namespace: q.ns,
        operation: q.op,
        query: q.command,
        millis: q.millis,
      })),
    };
  } catch (err) {
    logger.error('database', 'Failed to analyze index usage', err);
    return null;
  }
}

module.exports = {
  INDEXES,
  ensureIndexes,
  getIndexStats,
  analyzeIndexUsage,
};
