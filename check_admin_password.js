const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://127.0.0.1:27020/marketplace';

async function checkPassword() {
  try {
    const conn = await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const db = conn.connection.db;
    const usersCollection = db.collection('users');
    
    const admin = await usersCollection.findOne({email: 'admin@mallchain.com'});
    
    console.log('Email:', admin.email);
    console.log('Password exists:', !!admin.password);
    if (admin.password) {
      console.log('Password (first 50 chars):', admin.password.substring(0, 50));
      console.log('Password looks like bcrypt:', admin.password.startsWith('$2a$') || admin.password.startsWith('$2b$'));
    }
    
    await mongoose.disconnect();
    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkPassword();
