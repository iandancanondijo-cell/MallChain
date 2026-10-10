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
  hash.update(plaintext);
  return hash.digest('hex');
}

function normalizeEmail(email) {
  return email ? email.toLowerCase().trim() : email;
}

async function recreateAdmins() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Get the User model from backend
    const User = require('./backend/src/models/user');

    // Check existing admins
    const existingAdmins = await User.find({ role: 'superadmin' });
    console.log(`Found ${existingAdmins.length} existing admins:`, existingAdmins.map(a => a.email || 'encrypted'));

    // Admin credentials
    const admins = [
      { email: 'enochbosire@mallchainadmin.com', password: 'Admin@mallchain1/2026' },
      { email: 'iandancan@mallchainadmin.com', password: 'Admin@mallchain1/2026' }
    ];

    for (const admin of admins) {
      const normalizedEmail = normalizeEmail(admin.email);
      const emailBlind = blindIndex(normalizedEmail);
      
      // Check if exists
      let user = await User.findOne({ email_blind: emailBlind });
      
      if (user) {
        console.log(`✓ Admin ${admin.email} already exists`);
      } else {
        // Hash password with bcryptjs (10 rounds like backend does)
        const hashedPassword = await bcryptjs.hash(admin.password, 10);
        
        // Create admin with blind index
        user = await User.create({
          email_blind: emailBlind,
          password: hashedPassword,
          role: 'superadmin',
          username: normalizedEmail.split('@')[0],
          name: normalizedEmail.split('@')[0]
        });
        
        console.log(`✓ Created admin: ${admin.email}`);
      }
    }

    // Verify creation
    const allAdmins = await User.find({ role: 'superadmin' });
    console.log(`\n✓ Total admins in database: ${allAdmins.length}`);

    await mongoose.disconnect();
    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

recreateAdmins();
