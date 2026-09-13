# Dead-Letter Outbox Runbook

## Overview

The Mallchain backend operates three BullMQ dead-letter / retry queues:

| Queue                  | Redis key prefix      | Purpose                                                                                                                                                              | Attempts | Backoff          | Worker file                                                |
| ------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------- | ------------------------------------------------------ |
| `transactions`           | `bull:transactions` | Blockchain transaction broadcast queue — on-chain send/marketplace/sign transactions enqueued after DB insert                                                                                | 3        | exponential 5000ms | [transactionWorker.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/mallwallet/workers/transactionWorker.js) |
| `payment-callbacks`     | `bull:payment-callbacks` | Safaricom M-Pesa C2B confirmation callbacks + B2C payout result callbacks that couldn't be processed inline                                                                    | 5        | exponential 3000ms | [paymentCallbackWorker.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/mallwallet/workers/paymentCallbackWorker.js) |
| `convert-liquidity-dlq` | `bull:convert-liquidity-dlq` | Mallpoints → MLCNS convert step that completed the on-chain burn but failed the post-convert liquidity-add step (addLiquidityToPool failed)                                   | 3        | exponential 2000ms | [convertLiquidityWorker.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/mallwallet/workers/convertLiquidityWorker.js) |

Prometheus metrics (scrape `/metrics` with an X-API-Key matching `MONITORING_API_KEY`):

* `marketplace_queue_depth{queue, state}` — queue depth for each queue × (active / wait / delayed / failed / completed / paused)
* `marketplace_tx_job_status_total{status}` — tx-queue lifecycle
* `backend_errors_total{code, status_code}`

Alerts:
* `marketplace_queue_depth{state="failed"} > 0 for 2 minutes on ANY queue → investigate immediately (webhook to Slack/PagerDuty via ALERT_WEBHOOK_URL)
* tx/payment/convert job final-exhaustion → logger.error fires ALERT_WEBHOOK_URL webhook (one-per-site 60s dedup via `logger.error automatically, `ALERT_WEBHOOK_MIN_INTERVAL_MS` default 60000)

## Investigation flow

1. **Open `/metrics` scrape:
   ```
   curl -H "X-API-Key: $MONITORING_API_KEY" https://api.mallchain.example/metrics \
     | grep 'marketplace_queue_depth'
   ```

2. **Inspect failed set via BullArena or ioredis CLI:
   ```
   redis-cli -h redis-host llen bull:transactions:failed
   ```
   Or via the BullMQ script:
   ```
   node -e "
   const { Queue } = require('bullmq');
   const q = new Queue('transactions', { connection: { host: 'redis-host', port: 6379 }});
   q.getJobs(['failed'], 0, 100).then(j => { console.log(j.map(x=>({id:x.id,name:x.name,data:x.data,failedReason:x.failedReason,attemptsMade:x.attemptsMade})); process.exit(0)});
   "
   ```

3. **Payment callback DLQ: same pattern with queue `payment-callbacks`.

4. **Convert DLQ: Mongo collection `convert_dead_letters` persists a second durable record after BullMQ exhaustion. Query:
   ```js
   db.convert_dead_letters.find({status:'dead_letter', remediated:false}).sort({createdAt:1})
   ```

## Remediation by queue

### 1. transactions queue (on-chain broadcasts)

*Failure modes:* chain REST offline → Explorer circuit breaker opened → rpc/node down, wrong chain-id or sequence mismatch.

First check chain health on `CHAIN_REST`. If chain REST is reachable, the usual fix is to **replay the failed jobs individually**, which re-signs nothing:

```bash
# Replay ALL failed tx queue jobs
node -e "
const { Queue } = require('bullmq');
(async ()=>{
  const q = new Queue('transactions', { connection: { host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 } });
  const failed = await q.getJobs('failed', 0, -1);
  for (const j of failed) { console.log('retry', j.id, j.data.txId); await j.retry(); }
  await q.close();
})();
"
```

Single replay:
```bash
node -e "(async()=>{const {Queue}=require('bullmq'); const q=new Queue('transactions',{connection:{host:process.env.REDIS_HOST,port:6379}}); await (await q.getJob(process.argv[2])).retry(); await q.close(); process.exit(0)})()" <jobId>
```

If a Tx document shows `tx.status` already completed on chain (query `db.transactions.find({_id: ObjectId('...')}) `) but the on-chain lookup also says success and the hash present), don't replay. Mark `j.remove(); await Tx.updateOne({_id:txId},{$set:{status:'completed'}})` to avoid double-send.

### 2. payment-callbacks queue

Safaricom C2B/B2C callbacks; both `processMpesaCallback` + `handlePayoutCallback` are **idempotent** (they check the LiquidityPayout/Transaction records for existing confirmation already). Simply replay the whole failed set blindly and a prior-successful simply becomes a no-op.

```bash
node -e "
const { Queue } = require('bullmq');
(async ()=>{
  const q = new Queue('payment-callbacks', { connection: { host: process.env.REDIS_HOST, port: 6379 }});
  const failed = await q.getJobs('failed',0,-1);
  for (const j of failed) await j.retry();
  await q.close();
})();
"
```

After replay, re-check Mongo `LiquidityPayout` + `Transaction` records.

### 3. convert-liquidity-dlq

After job exhausts all BullMQ retries → a permanent record is inserted into Mongo `convert_dead_letters`. Operator remediates:

```bash
# 1. Inspect payload
mongosh mallchain-production --eval 'db.convert_dead_letters.find({remediated:false}).pretty()'

# 2. Manual liquidity add (calls same function the worker calls)
node -e "
require('dotenv').config();
const mongoose = require('mongoose');
const { addLiquidityToPool } = require('./controllers/liquidityController');
const { recordLiquidityActivity } = require('./services/liquidityActivityService');
(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const doc = await mongoose.connection.collection('convert_dead_letters').findOne({_id: process.env.DOC_ID});
  const res = await addLiquidityToPool({poolId: doc.payload.poolId || 2, amount0: doc.payload.mlcoins, amount1: doc.payload.kesValue, userAddress: doc.payload.address});
  await mongoose.connection.collection('convert_dead_letters').updateOne({_id: doc._id}, {\$set: {remediated: true, remediation: 'manual addLiquidityToPool runbook', status: 'remediated', remediatedAt: new Date()}});
  console.log('LP tokens minted:', res);
  process.exit(0);
})();
"
```

Or, simpler: if pool already added liquidity record was correctly, mark remediated.

## Emergency clear-all button: Purge failed after replay

```bash
# If Redis command — clean up orphaned queue contents when everything remediated
node -e "
(async()=>{
  const {Queue} = require('bullmq');
  for (const name of ['transactions','payment-callbacks','convert-liquidity-dlq']) {
    const q = new Queue(name, {connection:process.env.REDIS_HOST ? {host: process.env.REDIS_HOST, port: 6379} : undefined});
    await q.clean(0, 'failed'); await q.clean(0, 'completed'); console.log('cleaned', name); await q.close();
  }
})();
"
```

## Verification

After any above, verify the Prometheus gauge, re-scrape `marketplace_queue_depth{state='failed'}==0` for all queues, and no new `logger.error` ALERT_WEBHOOK in 10-minute window.
