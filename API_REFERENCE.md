# Mallchain Advanced API Reference

## Transaction Flows

### 1. Peer-to-Peer Transfer
```
User A initiates: TransferMallcoin(to: B, amount: 100)
└─ Validate addresses (Bech32 format)
│
├─ Check sender balance: A.WalletBalance >= 100 ✓
│
├─ Deduct: A.WalletBalance -= 100
├─ Add: B.WalletBalance += 100
│
├─ Record transaction: TX-{id}
│  ├─ From: A, To: B, Amount: 100
│  ├─ Type: "transfer"
│  ├─ BlockHeight, Timestamp
│  └─ Memo: "P2P transfer"
│
├─ Record activity: total_transactions++, total_volume += 100
│
├─ Accumulate fees: fees.transaction_fees += 1 MLCN (1%)
│
└─ Response: {TxId: "TX-{id}"}

Query result:
marketplacecli query mlcoin wallet-balance B
→ Balance: 100 MLCN
```

### 2. Marketplace Buy
```
Buyer initiates: BuyMallcoin(buyer: A, mlcn_amount: 50)
└─ Get current market price (default: 62 KES per MLCN)
│
├─ Calculate KES required: 50 × 62 = 3100 KES
│
├─ Check buyer's KES balance: A.KESBalance >= 3100 ✓
│
├─ Deduct KES: A.KESBalance -= 3100
│
├─ Mint MLCN: A.WalletBalance += 50
│  ├─ Check: Circulating + 50 <= 670M ✓
│  ├─ Check: 50 <= Daily Limit (8.3K) ✓
│  └─ Update: Circulating += 50
│
├─ Update market price:
│  ├─ price_change = 50 / 1000 = 0 (minimum 1)
│  ├─ BuyPrice: 62 + 1 = 63 KES
│  ├─ SellPrice: 58 + 1 = 59 KES
│  └─ TotalBuyVolume += 50
│
├─ Record trade:
│  ├─ TradeID: "TR-{id}"
│  ├─ Type: "buy"
│  ├─ Price at trade: 63 KES
│  └─ Timestamp, BlockHeight
│
├─ Record transaction: TX-{id}
│  ├─ Type: "buy"
│  ├─ Amount: 50 MLCN
│  └─ Memo: "Bought from marketplace"
│
├─ Record activity:
│  ├─ total_transactions++
│  ├─ total_volume += 50
│  ├─ active_users++ (if new)
│  └─ Engagement score recalculated
│
├─ Accumulate fees:
│  └─ fees.trading_fees += 0.5 MLCN (1% of 50)
│
└─ Response: {TradeId: "TR-{id}", KesPaid: 3100, Price: 63}

Query results:
marketplacecli query mlcoin market-price
→ BuyPrice: 63 KES, SellPrice: 59 KES, TotalBuyVolume: 50 MLCN
```

### 3. Mallpoints to Mallcoin Conversion (With Badge)

**Scenario: Badge holder on 15th of month**

```
User initiates: ConvertToMallcoin(creator: A, amount: 100)
└─ Check current date: Today is 15th ✓
│  └─ Badge holder: YES ✓
│
├─ Validate conversion window:
│  ├─ hasBadge(A) = true ✓
│  ├─ dayOfMonth == 15 ✓
│  └─ conversionAllowed = true
│
├─ Get user's points: A.UserPoints = 500
│
├─ Check sufficient points: 500 >= 100 ✓
│
├─ Deduct points: A.UserPoints -= 100 → 400 points remaining
│
├─ Mint Mallcoins (1:1 conversion):
│  ├─ A.WalletBalance += 100 MLCN
│  ├─ Check supply: Circulating + 100 <= 670M ✓
│  ├─ Circulating += 100
│  └─ Record mint transaction
│
├─ Record conversion transaction: TX-{id}
│  ├─ From: "system", To: A
│  ├─ Amount: 100 MLCN
│  ├─ Type: "conversion"
│  └─ Memo: "Points to Mallcoin conversion"
│
├─ Accumulate fees:
│  └─ fees.conversion_fees += 1 MLCN (1% of 100)
│
└─ Response: Success

Query results:
marketplacecli query mallpoints user-points A
→ Points: 400 remaining

marketplacecli query mlcoin wallet-balance A
→ Balance: 100 MLCN (just minted)
```

### 4. Staking with 6-Month Lock

```
User initiates: Stake(address: A, amount: 500)
└─ Get wallet balance: A.WalletBalance = 1000
│
├─ Check sufficient balance: 1000 >= 500 ✓
│
├─ Deduct from wallet: A.WalletBalance -= 500 → 500 remaining
│
├─ Create staking record:
│  ├─ StakeID: "STAKE-A-{blockHeight}"
│  ├─ Address: A
│  ├─ StakedAmount: 500 MLCN
│  ├─ StakeDate: {current_timestamp}
│  ├─ IsActive: true
│  ├─ UnlockHeight: {current_height} + 1,555,200 blocks (~180 days)
│  └─ RewardsEarned: 0 (starts accumulating)
│
├─ Record transaction: TX-{id}
│  ├─ Type: "stake"
│  ├─ Amount: 500 MLCN
│  └─ Memo: "Staked for rewards"
│
├─ Record activity:
│  ├─ total_transactions++
│  ├─ active_users++ (if new staker)
│  └─ Engagement tracking
│
└─ Response: {StakeID: "STAKE-A-{id}"}

After 180 days (at unlock height):
User calls: UnstakeAndClaimRewards(address: A, stakeID: "STAKE-A-...")
└─ Verify unlock height reached: current >= unlock_height ✓
│
├─ Calculate rewards:
│  ├─ Base: 500 MLCN × 2% ÷ 365 = 0.0274 MLCN/day × 180 days ≈ 4.93 MLCN
│  ├─ Engagement multiplier: activity_score / 1000 (e.g., 0.75x if medium activity)
│  ├─ Duration bonus: 180 days = 6 months × 0.1% = 0.6%
│  ├─ Total rewards: 4.93 × 0.75 × 1.006 ≈ 3.71 MLCN
│  └─ StakedAmount + Rewards: 500 + 3.71 = 503.71 MLCN
│
├─ Return to wallet: A.WalletBalance += 503.71 MLCN
│
├─ Record transaction: TX-{id}
│  ├─ Type: "reward"
│  ├─ Amount: 3.71 MLCN
│  └─ Memo: "Staking rewards claimed"
│
└─ Response: {RewardsEarned: 3.71, TotalUnstaked: 503.71}

Query results:
marketplacecli query mlcoin wallet-balance A
→ Balance: 503.71 MLCN (500 staked + 3.71 rewards)
```

### 5. Dynamic Pricing Update (Auto, Every 100 blocks)

```
EndBlock trigger at block 1000 (100 block interval)
└─ Get activity metrics:
│  ├─ total_transactions: 250
│  ├─ total_volume: 5,000 MLCN
│  ├─ active_users: 45
│  └─ Recalculate engagement_score
│
├─ Calculate engagement score:
│  ├─ Volume contribution: min(5000 / 1000, 500) = 500 points
│  ├─ Transaction score: min(250 / 100, 300) = 250 points
│  ├─ User score: min(45 / 10, 200) = 45 points
│  ├─ Total score: 500 + 250 + 45 = 795 (HIGH ACTIVITY)
│  └─ Score > 500 → INCREASE PRICES
│
├─ Calculate price impact:
│  ├─ multiplier = (795 - 500) / 10 = 29 (roughly +29%)
│  ├─ Current BuyPrice: 62 KES
│  ├─ New BuyPrice: 62 + 29 = 91 KES
│  ├─ New SellPrice: (58 + 29) = 87 KES
│  └─ Price increased due to high community activity
│
├─ Update market:
│  ├─ BuyPrice: 91 KES (↑ 47%)
│  ├─ SellPrice: 87 KES (↑ 50%)
│  └─ LastUpdateHeight: 1000
│
├─ Reset metrics for next period:
│  ├─ total_transactions = 0
│  ├─ total_volume = 0
│  ├─ active_users = 0
│  └─ CurrentPeriod = "daily"
│
└─ Event: PricesUpdated{height: 1000, newBuyPrice: 91}

Query results (at block 1001):
marketplacecli query mlcoin market-price
→ BuyPrice: 91 KES, SellPrice: 87 KES, LastUpdateHeight: 1000
→ Activity Score: 795 (HIGH), Impact: +29%
```

### 6. Fee Distribution (Every 12,000 blocks / ~1 day)

```
EndBlock trigger at block 12000
└─ Get accumulated fees:
│  ├─ transaction_fees: 50 MLCN
│  ├─ trading_fees: 75 MLCN
│  └─ conversion_fees: 25 MLCN
│  └─ Total: 150 MLCN
│
├─ Distribute fees:
│  ├─ Stakers (50%): 75 MLCN
│  │  └─ Distributed proportional to stake size
│  ├─ Validators (30%): 45 MLCN
│  │  └─ Distributed to block proposers
│  └─ Treasury (20%): 30 MLCN
│     └─ Held for ecosystem development
│
├─ Reset accumulated fees:
│  ├─ transaction_fees = 0
│  ├─ trading_fees = 0
│  ├─ conversion_fees = 0
│  └─ LastDistributionTime = {current_time}
│
└─ Event: FeesDistributed{
  ├─ stakersShare: 75,
  ├─ validatorsShare: 45,
  ├─ treasuryShare: 30
}

Query results:
marketplacecli query mlcoin fees-accumulated
→ TransactionFees: 0 (reset after distribution)
→ TradingFees: 0
→ ConversionFees: 0
→ LastDistributionTime: {time}

Staker A (with 100 MLCN staked):
→ Received: 75 × (100 / total_staked) MLCN as reward
```

## Query Examples

```bash
# Check wallet balance
marketplacecli query mlcoin wallet-balance marketplace1xyz...
→ Address: marketplace1xyz...
→ Balance: 1000 MLCN
→ Locked: 500 MLCN (staked)

# Get transaction details
marketplacecli query mlcoin transaction TX-1234
→ TxId: TX-1234
→ From: marketplace1abc...
→ To: marketplace1def...
→ Amount: 100 MLCN
→ Type: transfer
→ Timestamp: 1715338800
→ BlockHeight: 5000
→ Memo: P2P transfer

# View market prices
marketplacecli query mlcoin market-price
→ BuyPrice: 63 KES
→ SellPrice: 59 KES
→ TotalBuyVolume: 5000 MLCN
→ TotalSellVolume: 3000 MLCN
→ LastUpdateHeight: 1000

# Check activity metrics
marketplacecli query mlcoin activity-metrics
→ TotalTransactions: 245
→ TotalVolume: 4950 MLCN
→ ActiveUsers: 42
→ EngagementScore: 795
→ PriceImpactMultiplier: +29
→ CurrentPeriod: daily

# Conversion window status
marketplacecli query mallpoints conversion-window
→ IsOpen: true (on 15th or Dec 27th, depending on badge status)
→ BadgeRequired: false (on Dec 27th) / true (on 15th)

# User mallpoints balance
marketplacecli query mallpoints user-points marketplace1xyz...
→ Address: marketplace1xyz...
→ Points: 400
→ LastEarned: 1715338800
→ TasksCompleted: 12
```

## Error Codes & Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `insufficient balance` | Not enough MLCN in wallet | Earn/buy more MLCN |
| `conversion window closed` | Not on correct date (non-badge on Dec 27, badge on 15th) | Wait for correct date |
| `supply exhausted` | Would exceed 670M cap | Mint operation blocked |
| `daily limit exceeded` | Operation > 8.3K MLCN/day | Try tomorrow |
| `vault locked` | 5 failed unlock attempts | Wait 5 minutes |
| `stake locked` | Trying to unstake before 180 days | Wait for unlock height |

---

**Last Updated**: May 10, 2026
**API Version**: Mallchain v1.0
