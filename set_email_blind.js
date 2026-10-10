const mongoose = require('mongoose');
const crypto = require('crypto');

const MONGO_URI = 'mongodb://127.0.0.1:27020/marketplace';
const FIELD_BLIND_INDEX_KEY = process.env.FIELD_BLIND_INDEX_KEY || 'fe7786f133a451fe840771ba311426d65a6b7ac9059a41050d0e1473da89bbe2';

function blindIndex(plaintext) {
  if (!plaintext) return undefined;
  const keyBuf = Buffer.from(FIELD_BLIND_INDEX_KEY, 'hex');
  const hash = crypto.createHmac('sha256', keyBuf);
  hash.update(plaintext.toLowerCase().trim());
  return hash.digest('hex');
}

async function setEmailBlind() {
  try {
    const conn = await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const db = conn.connection.db;
    const usersCollection = db.collection('users');
    
    // Get all superadmins
    const admins = await usersCollection.find({role: 'superadmin'}).toArray();
    console.log(`Found ${admins.length} superadmins`);
    
    for (const admin of admins) {
      const emailBlind = blindIndex(admin.email);
      await usersCollection.updateOne(
        { _id: admin._id },
        { $set: { email_blind: emailBlind } }
      );
      console.log(`✓ Set email_blind for ${admin.email}`);
    }
    
    console.log(`\n✅ All admin accounts now have email_blind set`);
    await mongoose.disconnect();
    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

setEmailBlind();
