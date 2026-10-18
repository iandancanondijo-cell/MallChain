require('dotenv').config({ path: './backend/.env' });

const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/marketplace');

const db = mongoose.connection;

db.on('connected', async () => {
  try {
    console.log('📌 Connected to MongoDB\n');
    
    const User = require('./backend/src/models/user');
    const { blindIndex } = require('./backend/src/utils/fieldEncryption');
    
    const testEmail = 'smstest@mallchain.test';
    const phoneNumber = '+254708199147';
    
    console.log('Setting up test user with phone number...\n');
    
    const testUser = new User({
      email: testEmail,
      phone: phoneNumber,
      password: '$2a$10$dummyhash',
      role: 'user',
    });
    
    let savedUser;
    try {
      savedUser = await testUser.save();
      console.log('✅ Test user created:', savedUser._id);
      console.log('   Email:', testEmail);
      console.log('   Phone: '+phoneNumber);
    } catch (err) {
      if (err.code === 11000) {
        console.log('User exists, updating phone...');
        const found = await User.findOne({ email_blind: blindIndex(testEmail) });
        if (found) {
          found.phone = phoneNumber;
          savedUser = await found.save();
          console.log('✅ User updated with phone:', phoneNumber);
          console.log('   User ID:', savedUser._id);
        }
      } else {
        throw err;
      }
    }
    
    console.log('\n✅ Database ready for SMS/WhatsApp test!');
    console.log('   User email: '+testEmail);
    console.log('   Phone: '+phoneNumber);
    console.log('\nNext: Run node test_sms_whatsapp_final.js\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
});

db.on('error', (err) => {
  console.error('❌ Database connection error:', err);
  process.exit(1);
});
