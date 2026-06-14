# Transaction Recording System

## Overview
The marketplace blockchain now records all Mallcoin transactions on-chain with unique, sequential transaction IDs. Every transaction is stored permanently and can be queried by anyone.

## Transaction Format
Each transaction is recorded with the following fields:
- **tx_id**: Unique sequential ID in format `TX-{number}` (e.g., TX-0, TX-1, TX-2)
- **from**: Sender address (or "system" for mints)
- **to**: Recipient address
- **amount**: Amount of Mallcoins transferred (in microcoins)
- **tx_type**: Type of transaction ("mint", "transfer", "burn", etc.)
- **timestamp**: Unix timestamp when transaction occurred
- **block_height**: Block number when transaction was recorded
- **memo**: Human-readable description

## Transaction Types

### 1. Mint Transactions
Generated when:
- Converting Mallpoints to Mallcoins
- System rewards

Example:
```yaml
tx_id: TX-0
from: system
to: cosmos1mvgdey8mnmvwlk5wwp2jya7psddvtmr87grc9g
amount: "10000"
tx_type: mint
memo: Minted from conversion or reward
```

### 2. Transfer Transactions
Generated when:
- P2P transfers between users
- Marketplace payments

Example:
```yaml
tx_id: TX-1
from: cosmos1mvgdey8mnmvwlk5wwp2jya7psddvtmr87grc9g
to: cosmos1r4k53lf2umynqsrgshj7pmsxqp2d0y3ran9s24
amount: "2500"
tx_type: transfer
memo: P2P transfer
```

## Query Commands

### List All Transactions
```bash
marketplaced query mlcoin list-transactions
```

Returns all transactions with pagination support.

### Get Transaction by ID
```bash
marketplaced query mlcoin get-transaction --tx-id TX-1
```

Returns a specific transaction by its unique ID.

### Get Transactions by Address
```bash
marketplaced query mlcoin get-transactions-by-address --address cosmos1...
```

Returns all transactions where the address is either sender or recipient.

## REST API Endpoints

When API server is enabled (`enable = true` in `app.toml`):

- **List all transactions**: `GET /tmp/marketplace/mlcoin/v1/transactions`
- **Get transaction by ID**: `GET /tmp/marketplace/mlcoin/v1/transaction/{tx_id}`
- **Get transactions by address**: `GET /tmp/marketplace/mlcoin/v1/transactions/address/{address}`

## Testing Examples

### Example 1: Award points, convert to Mallcoins, check transaction
```bash
# Get addresses
ALICE_ADDR=$(marketplaced keys show alice -a --keyring-backend test)

# Issue badge (required for conversion)
marketplaced tx badge issue-badge $ALICE_ADDR gold \
  --from alice --keyring-backend test --chain-id marketplace --fees 5000stake --yes

# Award points
marketplaced tx mallpoints award-points $ALICE_ADDR 50000 "test reward" \
  --from alice --keyring-backend test --chain-id marketplace --fees 5000stake --yes

# Convert to Mallcoins (creates TX-0 mint transaction)
marketplaced tx mallpoints convert-to-mallcoin 10000 \
  --from alice --keyring-backend test --chain-id marketplace --fees 5000stake --yes

# Check transaction was recorded
marketplaced query mlcoin get-transaction --tx-id TX-0
```

### Example 2: Transfer Mallcoins
```bash
ALICE_ADDR=$(marketplaced keys show alice -a --keyring-backend test)
BOB_ADDR=$(marketplaced keys show bob -a --keyring-backend test)

# Transfer (creates TX-1 transfer transaction)
marketplaced tx mlcoin transfer-mallcoin 2500 $BOB_ADDR \
  --from alice --keyring-backend test --chain-id marketplace --fees 5000stake --yes

# Query all transactions for Bob
marketplaced query mlcoin get-transactions-by-address --address $BOB_ADDR
```

## Implementation Details

### Storage
- Transactions are stored in `collections.Map[string, Transaction]`
- Transaction IDs are generated using `collections.Sequence`
- Both are persisted in the blockchain state

### Genesis State
The genesis state includes:
```protobuf
repeated Transaction transaction_map = 5;
uint64 transaction_count = 6;
```

### Code Locations
- **Proto definition**: `proto/marketplace/mlcoin/v1/transaction.proto`
- **Recording logic**: `x/mlcoin/keeper/transaction.go`
- **Query handlers**: `x/mlcoin/keeper/query_transaction.go`
- **Integration points**:
  - `x/mlcoin/keeper/mint.go` (conversion/rewards)
  - `x/mlcoin/keeper/msg_server_transfer_mallcoin.go` (P2P transfers)

## Verified Test Results

✅ **TX-0**: Mint from conversion (system → Alice, 10000 MLCN)
✅ **TX-1**: P2P transfer (Alice → Bob, 2500 MLCN)
✅ **TX-2**: P2P transfer (Alice → Bob, 500 MLCN)

All transactions:
- Generate unique sequential IDs
- Store complete metadata (addresses, amounts, timestamps, block heights)
- Are queryable by ID, by address, or as complete list
- Are accessible to anyone on the network
- Are permanently recorded on the blockchain
