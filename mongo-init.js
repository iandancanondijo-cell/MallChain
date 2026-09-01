// MongoDB initialization script for Mallchain
// Creates application user with readWrite access to marketplace database
// Run by scripts/mongo-rs-init.sh (docker-compose's mongo-init service),
// not docker-entrypoint-initdb.d — see that script's comment for why.

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

// Idempotent — this now runs from scripts/mongo-rs-init.sh on every
// container (re)start rather than only once via docker-entrypoint-initdb.d
// (see that script's comment for why), so re-creating an already-existing
// user must not be a fatal error.
const existingAppUser = db.getUser('mallchain');
if (existingAppUser) {
  print('Application user "mallchain" already exists — skipping.');
} else {
  // readWrite alone already covers everyday operations the app needs —
  // including createIndex/dropIndex/createCollection on its own collections
  // (Mongoose's autoIndex relies on this). dbAdmin additionally grants
  // dropDatabase, renameCollection, reIndex, compact, etc., which the
  // runtime application has no legitimate use for; a compromised app
  // process shouldn't be able to drop the database. Schema/index
  // migrations that genuinely need broader privileges should run under a
  // separate, CI-scoped user, not this one.
  db.createUser({
    user: 'mallchain',
    pwd: appPassword,
    roles: [
      { role: 'readWrite', db: 'marketplace' }
    ]
  });
  print('Application user "mallchain" created with readWrite-only access to marketplace database.');
}
