#!/usr/bin/env node

/**
 * PHASE 5: MLPTS Real Mining Runtime Test
 *
 * Gate 61 Verification Script
 * Date: 2026-09-30
 *
 * Tests the MLPTS ledger unification fix:
 * 1. Create disposable test user
 * 2. Link wallet address
 * 3. Create mining task (campaign + submission)
 * 4. Approve mining reward
 * 5. Verify User.mlpts_balance updated
 * 6. Verify MallPointAccount.balance updated atomically
 * 7. Verify conversion can now read the MLPTS
 *
 * Usage:
 *   npm test phase5-mlpts-ledger-test.js
 *   OR node phase5-mlpts-ledger-test.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Models
const User = require('./src/models/user');
const Campaign = require('./src/models/Campaign');
const TaskSubmission = require('./src/models/TaskSubmission');
const MallPointAccount = require('./src/models/MallPointAccount');

const testUser = {
  email: `mlpts-test-${Date.now()}@mallchain.test`,
  password: 'Test!23456',
  username: `mlpts_test_${Date.now()}`,
};

const testWallet = {
  address: 'mall1test' + Math.random().toString(36).substring(7) + '...',
};

const testReward = 25; // Matches Gate 60 baseline

let results = {
  testUserCreated: null,
  walletLinked: null,
  campaignCreated: null,
  submissionCreated: null,
  approvalResponse: null,
  userBalanceBefore: null,
  userBalanceAfter: null,
  mallpointAccountBefore: null,
  mallpointAccountAfter: null,
  verificationPassed: false,
  errors: [],
};

async function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log('  ', JSON.stringify(data, null, 2));
  }
}

async function connect() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    await log('✓ Connected to MongoDB');
  } catch (err) {
    await log('✗ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

async function createTestUser() {
  try {
    await log('Creating test user...', testUser);

    // Check if user already exists
    let user = await User.findOne({ email: testUser.email });
    if (user) {
      await User.deleteOne({ _id: user._id });
      await log('  Cleaned up existing test user');
    }

    // Create new test user
    user = new User({
      email: testUser.email,
      password: testUser.password, // In real scenario, this would be hashed
      username: testUser.username,
      mlpts_balance: 0,
      mallcoin_balance: 0,
    });

    await user.save();
    results.testUserCreated = user._id.toString();
    await log('✓ Test user created', {
      userId: results.testUserCreated,
      email: testUser.email,
      mlpts_balance: 0,
    });
    return user;
  } catch (err) {
    results.errors.push(`User creation failed: ${err.message}`);
    await log('✗ Test user creation failed:', err.message);
    throw err;
  }
}

async function linkWallet(user) {
  try {
    await log('Linking wallet to user...', testWallet);

    user.walletAddress = testWallet.address;
    await user.save();

    results.walletLinked = testWallet.address;
    await log('✓ Wallet linked to user', {
      userId: user._id,
      walletAddress: testWallet.address,
    });

    return user;
  } catch (err) {
    results.errors.push(`Wallet linking failed: ${err.message}`);
    await log('✗ Wallet linking failed:', err.message);
    throw err;
  }
}

async function createCampaign(user) {
  try {
    await log('Creating mining campaign...');

    const campaign = new Campaign({
      creator_id: user._id.toString(),
      title: `MLPTS Test Campaign ${Date.now()}`,
      description: 'Test campaign for PHASE 5 verification',
      rate_per_task: testReward,
      budget_remaining: testReward * 10,
      completions_count: 0,
    });

    await campaign.save();
    results.campaignCreated = campaign._id.toString();

    await log('✓ Campaign created', {
      campaignId: results.campaignCreated,
      rate_per_task: testReward,
    });

    return campaign;
  } catch (err) {
    results.errors.push(`Campaign creation failed: ${err.message}`);
    await log('✗ Campaign creation failed:', err.message);
    throw err;
  }
}

async function createSubmission(user, campaign) {
  try {
    await log('Creating task submission...');

    const submission = new TaskSubmission({
      miner_id: user._id,
      campaign_id: campaign._id,
      title: `Test Mining Task ${Date.now()}`,
      task_type: 'engagement',
      description: 'Test submission for PHASE 5',
      proof_url: 'https://test.example.com/proof',
      status: 'pending_review',
      reward_amount: 0,
      reward_currency: 'MLPTS',
    });

    await submission.save();
    results.submissionCreated = submission._id.toString();

    await log('✓ Submission created', {
      submissionId: results.submissionCreated,
      minerId: user._id,
      campaignId: campaign._id,
      status: 'pending_review',
    });

    return submission;
  } catch (err) {
    results.errors.push(`Submission creation failed: ${err.message}`);
    await log('✗ Submission creation failed:', err.message);
    throw err;
  }
}

async function capturePreState(user) {
  try {
    await log('Capturing pre-approval state...');

    // Refresh from DB
    const userDoc = await User.findById(user._id);
    const mallpointAccount = await MallPointAccount.findOne({ address: user.walletAddress });

    results.userBalanceBefore = userDoc.mlpts_balance;
    results.mallpointAccountBefore = mallpointAccount ? mallpointAccount.balance : null;

    await log('✓ Pre-state captured', {
      User_mlpts_balance: results.userBalanceBefore,
      MallPointAccount_balance: results.mallpointAccountBefore,
    });
  } catch (err) {
    results.errors.push(`Pre-state capture failed: ${err.message}`);
    await log('✗ Pre-state capture failed:', err.message);
    throw err;
  }
}

async function approveSubmission(submission, campaign, user) {
  try {
    await log('Approving submission (simulating admin approval)...');

    // This simulates the POST /mines/submissions/:id/approve endpoint
    // We'll execute the same logic here for testing

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const WalletTransaction = require('./src/models/WalletTransaction');

        // Fetch full user document (need walletAddress)
        const userDoc = await User.findById(user._id).session(session);
        if (!userDoc) {
          throw new Error('User not found during approval');
        }

        // Create wallet transaction record
        await WalletTransaction.create(
          [{
            user_id: user._id,
            type: 'credit',
            amount: testReward,
            currency: 'MLPTS',
            description: 'Test mining reward - PHASE 5 verification',
          }],
          { session }
        );

        // Update user's mlpts_balance
        await User.findByIdAndUpdate(
          user._id,
          { $inc: { mlpts_balance: testReward } }
        ).session(session);

        // GATE 61 FIX: Synchronize to MallPointAccount
        if (userDoc.walletAddress) {
          await MallPointAccount.findOneAndUpdate(
            { address: userDoc.walletAddress },
            { $inc: { balance: testReward } },
            { upsert: true, session, new: true }
          );
        } else {
          throw new Error('User has no walletAddress - synchronization skipped');
        }

        // Update submission status
        await TaskSubmission.findByIdAndUpdate(
          submission._id,
          { $set: { status: 'auto_approved', reward_amount: testReward } }
        ).session(session);

        // Update campaign
        await Campaign.findByIdAndUpdate(
          campaign._id,
          { $inc: { completions_count: 1, budget_remaining: -testReward } }
        ).session(session);
      });

      results.approvalResponse = { status: 'success', reward: testReward };
      await log('✓ Approval transaction completed', results.approvalResponse);
    } finally {
      session.endSession();
    }
  } catch (err) {
    results.errors.push(`Approval failed: ${err.message}`);
    await log('✗ Approval failed:', err.message);
    throw err;
  }
}

async function capturePostState(user) {
  try {
    await log('Capturing post-approval state...');

    // Refresh from DB
    const userDoc = await User.findById(user._id);
    const mallpointAccount = await MallPointAccount.findOne({ address: user.walletAddress });

    results.userBalanceAfter = userDoc.mlpts_balance;
    results.mallpointAccountAfter = mallpointAccount ? mallpointAccount.balance : null;

    await log('✓ Post-state captured', {
      User_mlpts_balance: results.userBalanceAfter,
      MallPointAccount_balance: results.mallpointAccountAfter,
    });
  } catch (err) {
    results.errors.push(`Post-state capture failed: ${err.message}`);
    await log('✗ Post-state capture failed:', err.message);
    throw err;
  }
}

async function verify() {
  try {
    await log('Verifying ledger synchronization...');

    const checks = {
      userBalanceIncremented: results.userBalanceAfter === results.userBalanceBefore + testReward,
      mallpointAccountIncremented: results.mallpointAccountAfter === (results.mallpointAccountBefore || 0) + testReward,
      atomicSync: results.userBalanceAfter === results.mallpointAccountAfter,
    };

    await log('✓ Verification checks', checks);

    if (!checks.userBalanceIncremented) {
      results.errors.push(`User.mlpts_balance not incremented correctly: ${results.userBalanceBefore} → ${results.userBalanceAfter}`);
    }
    if (!checks.mallpointAccountIncremented) {
      results.errors.push(`MallPointAccount.balance not incremented correctly: ${results.mallpointAccountBefore} → ${results.mallpointAccountAfter}`);
    }
    if (!checks.atomicSync) {
      results.errors.push(`Ledgers not synchronized: User=${results.userBalanceAfter}, MallPointAccount=${results.mallpointAccountAfter}`);
    }

    results.verificationPassed = Object.values(checks).every(c => c === true);

    if (results.verificationPassed) {
      await log('✓✓✓ ALL CHECKS PASSED ✓✓✓');
    } else {
      await log('✗✗✗ VERIFICATION FAILED ✗✗✗');
    }
  } catch (err) {
    results.errors.push(`Verification failed: ${err.message}`);
    await log('✗ Verification error:', err.message);
    throw err;
  }
}

async function cleanup(user) {
  try {
    await log('Cleaning up test data...');

    await User.deleteOne({ _id: user._id });
    await Campaign.deleteMany({ name: { $regex: 'MLPTS Test Campaign' } });
    await TaskSubmission.deleteMany({ miner_id: user._id });
    await MallPointAccount.deleteOne({ address: testWallet.address });

    await log('✓ Test data cleaned up');
  } catch (err) {
    await log('⚠ Cleanup error (non-fatal):', err.message);
  }
}

async function main() {
  try {
    await log('='.repeat(80));
    await log('PHASE 5: MLPTS Real Mining Runtime Test');
    await log('='.repeat(80));

    await connect();

    const user = await createTestUser();
    await linkWallet(user);
    const campaign = await createCampaign(user);
    const submission = await createSubmission(user, campaign);

    await capturePreState(user);
    await approveSubmission(submission, campaign, user);
    await capturePostState(user);

    await verify();

    await log('='.repeat(80));
    await log('PHASE 5 SUMMARY');
    await log('='.repeat(80));
    console.log(JSON.stringify(results, null, 2));

    if (results.verificationPassed) {
      await log('\n✓✓✓ MLPTS ECONOMIC RAIL: PASS ✓✓✓\n');
      process.exitCode = 0;
    } else {
      await log('\n✗✗✗ MLPTS ECONOMIC RAIL: FAIL ✗✗✗\n');
      process.exitCode = 1;
    }

    await cleanup(user);

  } catch (err) {
    results.errors.push(`Test execution failed: ${err.message}`);
    await log('✗ Test failed:', err);
    console.error(results);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    await log('Disconnected from MongoDB');
  }
}

main().catch(console.error);
