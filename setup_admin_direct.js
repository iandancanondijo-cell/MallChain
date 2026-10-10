const mongoose = require('mongoose');
const bcryptjs = require('bcryptjs');
const crypto = require('crypto');

const MONGO_URI = 'mongodb://127.0.0.1:27020/marketplace';

// IMPORTANT: Must use same key as backend uses for blindIndex
const FIELD_BLIND_INDEX_KEY = process.env.FIELD_BLIND_INDEX_KEY || 'fe7786f133a451fe840771ba311426d65a6b7ac9059a41050d0e1473da89bbe2';

function blindIndex(plaintext) {
  if (!plaintext) return undefined;
  const keyBuf = Buffer.from(FIELD_BLIND_INDEX_KEY, 'hex');
  const hash = crypto.createHmac('sha256', keyBuf);
  hash.update(plaintext.toLowerCase().trim());
  return hash.digest('hex');
}

async function setupAdminDirect() {
  try {
    const conn = await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const db = conn.connection.db;
    const usersCollection = db.collection('users');

    // Admin accounts with the correct credentials
    const adminAccounts = [
      { email: 'admin@mallchain.com', password: 'Admin@mallchain1/2026' },
      { email: 'claudetestadmin@mines.mallchain.local', password: 'Admin@mallchain1/2026' },
      { email: 'enochbosire@mallchainadmin.com', password: 'Admin@mallchain1/2026' },
      { email: 'iandancan@mallchainadmin.com', password: 'Admin@mallchain1/2026' }
    ];

    for (const account of adminAccounts) {
      const email = account.email.toLowerCase().trim();
      const emailBlind = blindIndex(email);
      const hashedPassword = await bcryptjs.hash(account.password, 10);

      // Update or insert
      const result = await usersCollection.updateOne(
        { email_blind: emailBlind },
        {
          $set: {
            email_blind: emailBlind,
            password: hashedPassword,
            role: 'superadmin',
            email: email,
            username: email.split('@')[0],
            name: email.split('@')[0],
            updatedAt: new Date()
          },
          $setOnInsert: {
            createdAt: new Date(),
            walletAddress: null,
            mlpts_balance: 0,
            mallcoin_balance: 0,
            rank_points: 0,
            fraud_strikes: 0,
            fraud_status: 'clear',
            banned: false
          }
        },
        { upsert: true }
      );

      if (result.upsertedId) {
        console.log(`✓ Created ${email} (ID: ${result.upsertedId})`);
      } else {
        console.log(`✓ Updated ${email}`);
      }
    }

    console.log(`\n✅ All admin accounts configured`);
    console.log(`\n🔐 You can now login with:`);
    console.log(`  Email: admin@mallchain.com`);
    console.log(`  Password: Admin@mallchain1/2026`);
    console.log(`\n  OR`);
    console.log(`  Email: claudetestadmin@mines.mallchain.local`);
    console.log(`  Password: Admin@mallchain1/2026`);

    await mongoose.disconnect();
    console.log('\nDone!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

setupAdminDirect();
