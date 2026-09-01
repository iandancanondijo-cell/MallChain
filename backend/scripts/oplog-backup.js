#!/usr/bin/env node
/* eslint-env node */
/* global require, module, process */
/**
 * Continuous point-in-time-recovery approximation for self-hosted MongoDB
 * (production-readiness D1) — a periodic `mongodump` (scripts/backup.sh)
 * only ever restores to the instant it was taken; anything written after
 * the last dump and before a failure is unrecoverable no matter how often
 * dumps run. This script watches every change to the database via a
 * Change Stream (built on the oplog — requires a replica set, which
 * docker-compose.yml's mongo service now runs as) and appends each change
 * event to a rotating append-only log, with its resume token persisted so
 * a restart resumes exactly where it left off rather than missing or
 * duplicating events.
 *
 * To restore to a point in time between two full dumps: restore the last
 * dump before the target time, then replay this log's events (ordered by
 * clusterTime) from that dump's timestamp up to the target time. This is
 * the standard "poor man's PITR" pattern for a self-hosted MongoDB without
 * Atlas's managed continuous backup — not equivalent to a managed service's
 * SLA, but a real, working point-in-time recovery capability where there
 * was none at all before.
 *
 * Usage:
 *   node scripts/oplog-backup.js
 *   OPLOG_BACKUP_DIR=/var/backups/oplog node scripts/oplog-backup.js
 *
 * Run this as a long-lived process (systemd unit / k8s Deployment) — it's
 * not a one-shot script like migrate-encrypt-kyc-pii.js.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { config } = require('../src/config');

const BACKUP_DIR = process.env.OPLOG_BACKUP_DIR || path.join(__dirname, '..', '..', 'backups', 'oplog');
const RESUME_TOKEN_FILE = path.join(BACKUP_DIR, '.resume-token.json');

function currentLogFile() {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD — one file per day, simple to prune/archive
  return path.join(BACKUP_DIR, `${day}.jsonl`);
}

function loadResumeToken() {
  try {
    const raw = fs.readFileSync(RESUME_TOKEN_FILE, 'utf8');
    return JSON.parse(raw).resumeToken;
  } catch {
    return null; // first run, or file doesn't exist yet — start from "now"
  }
}

function saveResumeToken(token) {
  fs.writeFileSync(RESUME_TOKEN_FILE, JSON.stringify({ resumeToken: token, savedAt: new Date().toISOString() }));
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const client = new MongoClient(config.mongoUri);
  await client.connect();
  console.log(`[oplog-backup] Connected. Writing change events to ${BACKUP_DIR}`);

  const db = client.db();
  const resumeToken = loadResumeToken();
  const changeStream = db.watch([], {
    fullDocument: 'updateLookup', // include the full document on updates, not just the changed fields — needed to actually replay a change, not just know something changed
    ...(resumeToken ? { resumeAfter: resumeToken } : {}),
  });

  console.log(resumeToken ? '[oplog-backup] Resuming from saved token.' : '[oplog-backup] No saved resume token — starting from the current oplog position.');

  let eventsSinceLastSave = 0;

  changeStream.on('change', (event) => {
    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(currentLogFile(), line);
    saveResumeToken(event._id);

    eventsSinceLastSave += 1;
    if (eventsSinceLastSave % 100 === 0) {
      console.log(`[oplog-backup] ${eventsSinceLastSave} events captured so far this run.`);
    }
  });

  changeStream.on('error', (err) => {
    // A resume token can expire if this process is down longer than the
    // replica set's oplog retention window — when that happens, the only
    // safe recovery is a fresh full mongodump (this script can't invent
    // data that already rolled off the oplog), so fail loudly rather than
    // silently resetting and creating a gap this log doesn't reflect.
    console.error('[oplog-backup] Change stream error:', err.message || err);
    console.error('[oplog-backup] If this is a resume-token-expired error, take a fresh mongodump (scripts/backup.sh) and delete the resume-token file to start over.');
    process.exit(1);
  });

  process.on('SIGINT', async () => {
    console.log('\n[oplog-backup] Shutting down...');
    await changeStream.close();
    await client.close();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await changeStream.close();
    await client.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[oplog-backup] Fatal error:', err);
  process.exit(1);
});
