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

async function fixAdminCredentials() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const User = require('./backend/src/models/user');

    // Get all superadmins
    const admins = await User.find({ role: 'superadmin' });
    console.log(`Found ${admins.length} superadmins in database`);

    // The password we want to set for them
    const newPassword = 'Admin@mallchain1/2026';
    const hashedPassword = await bcryptjs.hash(newPassword, 10);
    console.log(`New password hash: ${hashedPassword.substring(0, 30)}...`);

    for (const admin of admins) {
      console.log(`\n Admin ID: ${admin._id}`);
      console.log(`  email_blind: ${admin.email_blind}`);
      
      // Update with new password
      admin.password = hashedPassword;
      await admin.save();
      console.log(`  ✓ Password updated`);
    }

    console.log(`\n✓ Updated ${admins.length} admin accounts with new password`);
    console.log(`\n Credentials to use for login:`);
    console.log(`  Email: admin@mallchain.com`);
    console.log(`  Password: ${newPassword}`);
    console.log(`  Email: claudetestadmin@mines.mallchain.local`);
    console.log(`  Password: ${newPassword}`);

    await mongoose.disconnect();
    console.log('\nDone!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

fixAdminCredentials();
