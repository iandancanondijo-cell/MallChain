# Transaction Hash Quick Reference

## Real Transaction Example

**TX Hash**: `64C6A52DD077366C3B851618019520F6574252990E304D7E71732E6F4E1468CA`

This is a **SHA256 hash** of the transaction data, NOT a sequential ID like "TX-12".

---

## View This Transaction

### 1. Via REST API
```bash
curl http://localhost:1317/cosmos/tx/v1beta1/txs/64C6A52DD077366C3B851618019520F6574252990E304D7E71732E6F4E1468CA
```

### 2. Via RPC
```bash
curl "http://localhost:26657/tx?hash=0x64C6A52DD077366C3B851618019520F6574252990E304D7E71732E6F4E1468CA"
```

### 3. Via Frontend
- Go to http://localhost:5173
- Click "Explorer" or search
- Paste the hash
- View full details

---

## Transaction Structure

```json
{
  "hash": "64C6A52DD...",           // SHA256 hash
  "height": "31993",                // Block number
  "index": 0,                       // Position in block
  "tx_result": {
    "code": 0,                      // 0 = success
    "gas_used": "81292",            // Actual gas
    "gas_wanted": "200000",         // Gas limit
    "events": [...]                 // State changes
  },
  "tx": {
    "body": {
      "messages": [{
        "from_address": "mall1msa...",
        "to_address": "mall1x9v...",
        "amount": [{"denom": "stake", "amount": "100000"}]
      }],
      "memo": "Real P2P transfer"
    }
  }
}
```

---

## Why SHA256 Hash (Not "TX-12")

| Feature | SHA256 Hash | Sequential ID |
|---------|-----------|--------------|
| Unique per transaction | ✅ Yes | ✅ Yes |
| Tamper-proof | ✅ Yes | ❌ No |
| Independently verifiable | ✅ Yes | ❌ No |
| Works decentralized | ✅ Yes | ❌ No |
| Standard in blockchain | ✅ Yes (Bitcoin, Ethereum) | ❌ No |

---

## Create Your Own Transaction

```bash
# Run from project root
node create_real_tx.js
```

You'll get output like:
```
TX Hash: 64C6A52DD077366C3B851618019520F6574252990E304D7E71732E6F4E1468CA
Block Height: 31993
Status: SUCCESS
```

---

## Transaction Types on Mallchain

| Type | Hash Format | Blockchain | Example |
|------|-------------|-----------|---------|
| Send (Bank) | SHA256 | ✅ On-chain | 64C6A52DD... |
| Stake (Staking) | SHA256 | ✅ On-chain | Real tx hash |
| Convert (Conversion) | SHA256 | ✅ On-chain | Real tx hash |
| Marketplace | SHA256 | ✅ On-chain | Real tx hash |

All transactions use **real transaction hashes** derived from their content.

---

**Note**: If you see "TX-12" in the UI during development, it's demo data used for UI testing. Real user transactions always get real SHA256 hashes like `64C6A52DD...`.
