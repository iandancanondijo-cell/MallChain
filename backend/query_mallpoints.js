const mongoose = require('mongoose');

async function getMallPointsSupply() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27020/mallchain', {
      serverSelectionTimeoutMS: 5000
    });

    const db = mongoose.connection.db;

    console.log('=== MALLPOINTS SUPPLY ANALYSIS ===\n');

    // 1. MallPointAccount Collection (off-chain holding)
    const mpaCollection = db.collection('mallpointaccounts');
    const mpaCount = await mpaCollection.countDocuments();
    const mpaSumResult = await mpaCollection.aggregate([
      { $group: { _id: null, total: { $sum: '$balance' } } }
    ]).toArray();
    const mpaTotal = mpaSumResult[0]?.total || 0;

    console.log('MALLPOINTACCOUNT COLLECTION (Off-chain Holding):');
    console.log(`  Accounts: ${mpaCount}`);
    console.log(`  Total Balance: ${mpaTotal.toLocaleString()} MLPTS\n`);

    // 2. User Collection (mlpts_balance)
    const userCollection = db.collection('users');
    const usersWithPoints = await userCollection.countDocuments({ mlpts_balance: { $gt: 0 } });
    const userSumResult = await userCollection.aggregate([
      { $group: { _id: null, total: { $sum: '$mlpts_balance' } } }
    ]).toArray();
    const userTotal = userSumResult[0]?.total || 0;

    console.log('USER COLLECTION (mlpts_balance):');
    console.log(`  Users with points: ${usersWithPoints}`);
    console.log(`  Total Balance: ${userTotal.toLocaleString()} MLPTS\n`);

    // 3. Combined off-chain total
    const offChainTotal = mpaTotal + userTotal;
    console.log('COMBINED OFF-CHAIN TOTAL:');
    console.log(`  ${offChainTotal.toLocaleString()} MLPTS\n`);

    // 4. Monthly distribution by user creation date
    const monthlyStats = await userCollection.aggregate([
      { $match: { mlpts_balance: { $gt: 0 }, createdAt: { $exists: true } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 },
          totalPoints: { $sum: '$mlpts_balance' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]).toArray();

    console.log('MONTHLY DISTRIBUTION (by User Creation Date):');
    if (monthlyStats.length > 0) {
      monthlyStats.forEach(m => {
        const dateStr = `${m._id.year}-${String(m._id.month).padStart(2, '0')}`;
        console.log(`  ${dateStr}: ${m.totalPoints.toLocaleString()} MLPTS (${m.count} users)`);
      });
    } else {
      console.log('  No monthly data available');
    }

    // 5. Distribution by tier/source (if available)
    const sourceStats = await userCollection.aggregate([
      { $match: { mlpts_balance: { $gt: 0 } } },
      {
        $bucket: {
          groupBy: '$mlpts_balance',
          boundaries: [0, 100, 1000, 10000, 100000, 1000000],
          default: '1000000+',
          output: {
            count: { $sum: 1 },
            totalPoints: { $sum: '$mlpts_balance' },
            avgBalance: { $avg: '$mlpts_balance' }
          }
        }
      }
    ]).toArray();

    console.log('\nDISTRIBUTION BY USER BALANCE TIER:');
    sourceStats.forEach(tier => {
      const tierLabel = Array.isArray(tier._id) ? `${tier._id[0]}-${tier._id[1]}` : String(tier._id);
      console.log(`  ${tierLabel}: ${tier.count} users, ${tier.totalPoints.toLocaleString()} MLPTS (avg: ${Math.round(tier.avgBalance)})`);
    });

    console.log('\n=== SUMMARY ===');
    console.log(`Total MLPTS in system: ${offChainTotal.toLocaleString()} MLPTS`);
    console.log(`  - MallPointAccount (conversion-ready): ${mpaTotal.toLocaleString()}`);
    console.log(`  - User balances (earned/awarded): ${userTotal.toLocaleString()}`);

    await mongoose.connection.close();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

getMallPointsSupply();
