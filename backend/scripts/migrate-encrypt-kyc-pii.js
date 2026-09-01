#!/usr/bin/env node
/* eslint-env node */
/* global require, module, process */
/**
 * One-time migration: encrypts existing plaintext KYC PII (idNumber,
 * phoneNumber, address, city, postalCode) in place. Safe to re-run —
 * records already encrypted (models/kyc.js's isEncrypted()) are skipped,
 * so this can run again after an interrupted pass without double-
 * encrypting anything.
 *
 * Requires FIELD_ENCRYPTION_KEY and FIELD_BLIND_INDEX_KEY to already be set
 * in the environment (see .env.example) — these must be the SAME keys the
 * running application uses, or it won't be able to decrypt what this
 * script encrypts.
 *
 * Usage:
 *   node scripts/migrate-encrypt-kyc-pii.js            # dry run — reports what would change
 *   node scripts/migrate-encrypt-kyc-pii.js --apply    # actually writes the changes
 */
require('dotenv').config();
const mongoose = require('mongoose');
const KYC = require('../src/models/kyc');
const { isEncrypted } = require('../src/utils/fieldEncryption');
const { config } = require('../src/config');

const ENCRYPTED_FIELDS = ['idNumber', 'phoneNumber', 'address', 'city', 'postalCode'];
const APPLY = process.argv.includes('--apply');

async function main() {
  if (!config.secrets.fieldEncryptionKey || !config.secrets.fieldBlindIndexKey) {
    console.error('FIELD_ENCRYPTION_KEY and FIELD_BLIND_INDEX_KEY must be set before running this migration.');
    process.exit(1);
  }

  await mongoose.connect(config.mongoUri || process.env.MONGO_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY (writing changes)' : 'DRY RUN (no writes — pass --apply to write)'}`);

  const cursor = KYC.find({}).cursor();
  let scanned = 0;
  let alreadyEncrypted = 0;
  let migrated = 0;
  let failed = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const needsMigration = ENCRYPTED_FIELDS.some((f) => doc[f] != null && !isEncrypted(doc[f]));

    if (!needsMigration) {
      alreadyEncrypted += 1;
      continue;
    }

    if (!APPLY) {
      migrated += 1; // "would migrate" in dry-run
      continue;
    }

    try {
      for (const field of ENCRYPTED_FIELDS) {
        if (doc[field] != null && !isEncrypted(doc[field])) {
          doc.markModified(field); // force isModified() to see it even though the raw value assigned below looks like a no-op change
        }
      }
      // The model's own pre-save hook does the actual encryption — reuse
      // that single, tested code path rather than duplicating the logic here.
      await doc.save();
      migrated += 1;
    } catch (err) {
      failed += 1;
      console.error(`Failed to migrate KYC ${doc._id}:`, err.message || err);
    }
  }

  console.log('');
  console.log(`Scanned: ${scanned}`);
  console.log(`Already encrypted: ${alreadyEncrypted}`);
  console.log(`${APPLY ? 'Migrated' : 'Would migrate'}: ${migrated}`);
  if (failed) console.log(`Failed: ${failed}`);

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
