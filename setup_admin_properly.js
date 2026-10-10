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

async function setupAdminProperly() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const User = require('./backend/src/models/user');

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

      // Try to find by email_blind
      let user = await User.findOne({ email_blind: emailBlind });
      
      if (user) {
        // Update existing
        user.password = hashedPassword;
        await user.save();
        console.log(`✓ Updated ${email} (ID: ${user._id})`);
      } else {
        // Create new
        user = await User.create({
          email_blind: emailBlind,
          password: hashedPassword,
          role: 'superadmin',
          username: email.split('@')[0],
          name: email.split('@')[0]
        });
        console.log(`✓ Created ${email} (ID: ${user._id})`);
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

setupAdminProperly();
