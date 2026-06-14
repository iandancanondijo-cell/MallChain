// MongoDB initialization script for Mallchain
// Creates application user with readWrite access to marketplace database
// Run automatically on first container start via docker-entrypoint-initdb.d

db = db.getSiblingDB('admin');

// Verify root user was created via environment variables
const rootUser = db.getUser('admin');
if (!rootUser) {
  print('WARNING: Root user "admin" not found. Ensure MONGO_INITDB_ROOT_USERNAME and MONGO_INITDB_ROOT_PASSWORD are set.');
} else {
  print('Root user "admin" verified.');
}

// Create application user with scoped permissions
db = db.getSiblingDB('marketplace');

const appPassword = process.env.MONGO_APP_PASSWORD;
if (!appPassword) {
  print('ERROR: MONGO_APP_PASSWORD environment variable not set. Application user not created.');
  quit(1);
}

db.createUser({
  user: 'mallchain',
  pwd: appPassword,
  roles: [
    { role: 'readWrite', db: 'marketplace' },
    { role: 'dbAdmin', db: 'marketplace' }
  ]
});

print('Application user "mallchain" created with readWrite access to marketplace database.');
