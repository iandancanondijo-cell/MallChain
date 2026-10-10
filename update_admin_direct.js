const mongoose = require('mongoose');
const bcryptjs = require('bcryptjs');

const MONGO_URI = 'mongodb://127.0.0.1:27020/marketplace';

async function updateAdminDirect() {
  try {
    const conn = await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const db = conn.connection.db;
    const usersCollection = db.collection('users');

    // The password we want for all admins
    const password = 'Admin@mallchain1/2026';
    const hashedPassword = await bcryptjs.hash(password, 10);

    // Update all admins with the new password
    const result = await usersCollection.updateMany(
      { role: 'superadmin' },
      {
        $set: {
          password: hashedPassword,
          updatedAt: new Date()
        }
      }
    );

    console.log(`✓ Updated ${result.modifiedCount} admin accounts with new password`);

    // Get all admins to show their details
    const admins = await usersCollection.find({ role: 'superadmin' }).toArray();
    console.log(`\n✅ Found ${admins.length} superadmin accounts:`);
    admins.forEach(admin => {
      console.log(`  - ${admin.email} (ID: ${admin._id})`);
    });

    console.log(`\n🔐 You can now login with:`);
    admins.forEach((admin, idx) => {
      console.log(`  Option ${idx + 1}: Email: ${admin.email}`);
    });
    console.log(`  Password: ${password}`);

    await mongoose.disconnect();
    console.log('\nDone!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

updateAdminDirect();
