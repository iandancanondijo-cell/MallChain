const mongoose = require('mongoose');

async function checkDatabase() {
  try {
    await mongoose.connect('mongodb://localhost:27020/mallchain', {
      serverSelectionTimeoutMS: 5000
    });

    const db = mongoose.connection.db;

    console.log('=== DATABASE INSPECTION ===\n');

    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('Collections in mallchain database:');
    collections.forEach(c => {
      console.log(`  - ${c.name}`);
    });

    console.log('\n=== DOCUMENT COUNTS ===\n');

    // Count documents in key collections
    const users = await db.collection('users').countDocuments();
    const mpa = await db.collection('mallpointaccounts').countDocuments();
    const campaigns = await db.collection('campaigns').countDocuments().catch(() => 0);
    const profiles = await db.collection('profiles').countDocuments().catch(() => 0);
    const wallets = await db.collection('wallets').countDocuments().catch(() => 0);

    console.log(`Users: ${users}`);
    console.log(`MallPointAccount: ${mpa}`);
    console.log(`Campaigns: ${campaigns}`);
    console.log(`Profiles: ${profiles}`);
    console.log(`Wallets: ${wallets}`);

    // Check if there's any data in users
    if (users > 0) {
      const sample = await db.collection('users').findOne({});
      console.log('\nSample User Document (first field keys):');
      console.log('  Keys:', Object.keys(sample || {}).slice(0, 20).join(', '));
      if (sample?.mlpts_balance !== undefined) {
        console.log(`  mlpts_balance: ${sample.mlpts_balance}`);
      }
    }

    await mongoose.connection.close();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkDatabase();
