# MLCNS FORENSIC AUDIT
## Mallcoin Module (x/mlcoin)
### Audit Date: 2026-09-28

---

## EXECUTIVE SUMMARY

**VERDICT: CODE EXISTS, MODULE ACCOUNT REGISTERED, NO TOKENS OBSERVED**

The MLCNS (Mallcoin) module implements the core MLC token with minting, staking, transfer, and MGP-20 (ERC-20-like) functionality. The module account is registered but has zero balance, indicating no token operations have been performed.

---

## MODULE SPECIFICATION

### Purpose
Core token module for Mallcoin (MLC) with:
- Token minting/burning
- Staking/unstaking
- Transfers
- MGP-20 token standard (allowance/transferFrom)
- Treasury management
- Fee accumulation

### Token Details
- **Denomination**: "mlc"
- **Module Account**: mall1mv4gw27wx2ac4x8uks8jyvfsugszza577usjmq
- **Permissions**: Minter, Burner

---

## CODE REVIEW

### Message Types
1. **MsgMintMallcoin** - Mint new MLC tokens
2. **MsgStake** - Stake MLC tokens
3. **MsgUnstake** - Unstake MLC tokens
4. **MsgTransferMallcoin** - Transfer MLC between addresses
5. **MsgSetAllowance** - Set MGP-20 allowance
6. **MsgTransferFrom** - MGP-20 transferFrom

### Keeper Functions

#### Minting (keeper/msg_server_mint.go)
```go
func (k msgServer) MintMallcoin(goCtx context.Context, msg *types.MsgMintMallcoin) (*types.MsgMintMallcoinResponse, error) {
    coins := sdk.NewCoins(sdk.NewInt64Coin("mlc", msg.Amount))
    err := k.bankKeeper.MintCoins(ctx, types.ModuleName, coins)
    // Send to user address
}
```

#### Marketplace (keeper/msg_server_marketplace.go)
```go
func (k msgServer) BuyMallcoin(goCtx context.Context, msg *types.MsgBuyMallcoin) (*types.MsgBuyMallcoinResponse, error) {
    // Buy MLC with fiat/crypto
}

func (k msgServer) SellMallcoin(goCtx context.Context, msg *types.MsgSellMallcoin) (*types.MsgSellMallcoinResponse, error) {
    // Sell MLC for fiat/crypto
}
```

#### Staking (keeper/msg_server_stake.go)
```go
func (k msgServer) Stake(goCtx context.Context, msg *types.MsgStake) (*types.MsgStakeResponse, error) {
    // Lock MLC for staking rewards
}

func (k msgServer) Unstake(goCtx context.Context, msg *types.MsgUnstake) (*types.MsgUnstakeResponse, error) {
    // Unlock staked MLC
}
```

#### MGP-20 Token (keeper/mgp20.go)
```go
func (k Keeper) SetAllowance(ctx sdk.Context, owner, spender sdk.AccAddress, amount sdk.Int) {
    // ERC-20-like allowance
}

func (k Keeper) TransferFrom(ctx sdk.Context, spender, from, to sdk.AccAddress, amount sdk.Int) error {
    // ERC-20-like transferFrom
}
```

### End Blocker (keeper/end_blocker.go)
```go
func EndBlocker(ctx sdk.Context, k Keeper) {
    // 1. UpdateEmissionMonthly - Adjust emission rate
    // 2. RecordTreasurySnapshot - Record treasury state
    // 3. AccumulateFees - Accumulate transaction fees
}
```

---

## ON-CHAIN VERIFICATION

### Module Account
**COMMAND**: `curl http://127.0.0.1:1317/cosmos/auth/v1beta1/module_accounts`
**RESULT**:
```json
{
  "name": "mlcoin",
  "address": "mall1mv4gw27wx2ac4x8uks8jyvfsugszza577usjmq",
  "permissions": ["minter", "burner"]
}
```
**VERDICT**: ✅ PASS - Module account registered with correct permissions

### Module Account Balance
**COMMAND**: `curl http://127.0.0.1:1317/cosmos/bank/v1beta1/balances/mall1mv4gw27wx2ac4x8uks8jyvfsugszza577usjmq`
**RESULT**:
```json
{
  "balances": [],
  "pagination": {"next_key": null, "total": "0"}
}
```
**VERDICT**: ⚠️ FAIL - Zero balance, no MLC tokens observed

### Token Supply
**COMMAND**: `curl http://127.0.0.1:1317/cosmos/bank/v1beta1/supply`
**RESULT**:
```json
{
  "supply": [
    {"denom": "stake", "amount": "4003159460"}
  ]
}
```
**VERDICT**: ⚠️ FAIL - No "mlc" denomination in supply

### Query Endpoint
**COMMAND**: `curl http://127.0.0.1:1317/mall/mlcoin/params`
**RESULT**:
```json
{
  "code": 12,
  "message": "Not Implemented",
  "details": []
}
```
**VERDICT**: ❌ FAIL - Query endpoint not implemented

---

## BACKEND INTEGRATION

### Endpoint: GET /api/wallet/balance
**RESULT**:
```json
{
  "MALL": 0,
  "MALL_LOCKED": 0,
  "MLPTS": 0
}
```
**VERDICT**: ✅ PASS - Backend returns MLC balance (zero)

### Endpoint: POST /api/send/mallcoin
**Status**: ⚠️ NOT TESTED - Requires funded account

---

## TOKEN ECONOMY

### Emission Model
**End Blocker Function**: UpdateEmissionMonthly()
**Purpose**: Adjust token emission rate based on economic conditions
**Status**: ⚠️ NOT VERIFIED - Cannot observe without transactions

### Treasury Management
**End Blocker Function**: RecordTreasurySnapshot()
**Purpose**: Record treasury state for accounting
**Status**: ⚠️ NOT VERIFIED

### Fee Accumulation
**End Blocker Function**: AccumulateFees()
**Purpose**: Accumulate transaction fees
**Status**: ⚠️ NOT VERIFIED

---

## MGP-20 TOKEN STANDARD

### Specification
ERC-20-like token standard for smart contract compatibility

### Functions
1. **SetAllowance(owner, spender, amount)** - Approve spending
2. **TransferFrom(spender, from, to, amount)** - Spend approved tokens
3. **GetAllowance(owner, spender)** - Query allowance

### Integration
**Bridge**: x/wasmbridge module dispatches to x/mlcoin MGP20 operations
**Status**: ⚠️ NOT TESTED

---

## STAKING MECHANISM

### Stake Flow
```
User → MsgStake → Lock MLC → Receive staking rewards
```

### Unstake Flow
```
User → MsgUnstake → Unlock MLC + Claim rewards
```

### APY
**Backend Default**: 12.4% (hardcoded in store defaults)
**On-chain**: ⚠️ NOT VERIFIED

---

## FINDINGS

### Working
1. ✅ Module code exists and compiles
2. ✅ Module account registered
3. ✅ Minter/Burner permissions configured
4. ✅ Backend integration functional
5. ✅ End blocker code present

### Not Working
1. ❌ No MLC tokens in circulation
2. ❌ Module account balance is zero
3. ❌ Query endpoint not implemented
4. ❌ Cannot verify token operations

### Not Tested
1. ⚠️ MsgMintMallcoin transaction
2. ⚠️ MsgStake/MsgUnstake transactions
3. ⚠️ MsgTransferMallcoin transaction
4. ⚠️ MGP-20 operations
5. ⚠️ End blocker execution
6. ⚠️ Treasury snapshot recording

---

## CRITICAL ISSUES

### ISSUE-001: No MLC Tokens in Circulation
**Severity**: HIGH
**Description**: Zero MLC tokens observed on-chain
**Impact**: Token economy not functional
**Remediation**: Test MsgMintMallcoin to create initial supply

### ISSUE-002: Query Endpoint Not Implemented
**Severity**: HIGH
**Description**: Cannot query mlcoin module parameters
**Impact**: Cannot monitor module state
**Remediation**: Register gRPC-gateway routes

---

## RECOMMENDATIONS

### Immediate
1. Mint initial MLC supply via MsgMintMallcoin
2. Test token transfer operations
3. Implement query endpoints

### Short-term
1. Test staking/unstaking flow
2. Verify MGP-20 operations
3. Test end blocker execution
4. Verify treasury snapshots

### Long-term
1. Conduct economic modeling
2. Test emission rate adjustments
3. Load test transaction processing

---

## VERDICT SUMMARY

| Component | Status | Evidence |
|-----------|--------|----------|
| Module Code | ✅ PASS | Code exists in x/mlcoin/ |
| Module Account | ✅ PASS | Registered with permissions |
| Token Supply | ❌ FAIL | Zero MLC tokens |
| Query Endpoint | ❌ FAIL | Not implemented |
| Backend Integration | ✅ PASS | Balance query working |
| Token Operations | ⚠️ NOT VERIFIED | No transactions tested |

**OVERALL**: NOT VERIFIED - Module exists but no token operations observed

---

**Audit Completed**: 2026-09-28T07:45:00Z
**Status**: MODULE REGISTERED, NO TOKENS IN CIRCULATION
