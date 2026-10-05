# MGP20 FORENSIC AUDIT
## MGP-20 Token Standard (ERC-20-like)
### Audit Date: 2026-09-28

---

## EXECUTIVE SUMMARY

**VERDICT: CODE EXISTS, NOT TESTED ON-CHAIN**

The MGP-20 token standard is implemented in x/mlcoin module as an ERC-20-like interface for smart contract compatibility. The implementation includes allowance and transferFrom functions. Integration with x/wasmbridge enables smart contract interaction. No on-chain testing has been performed.

---

## SPECIFICATION

### Purpose
Provide ERC-20-like token interface for MLC tokens, enabling:
- Smart contract integration
- Decentralized exchange compatibility
- DeFi protocol integration

### Standard Functions
1. **SetAllowance(owner, spender, amount)** - Approve spending
2. **TransferFrom(spender, from, to, amount)** - Spend approved tokens
3. **GetAllowance(owner, spender)** - Query allowance

---

## CODE REVIEW

### Implementation Location
**File**: x/mlcoin/keeper/mgp20.go

### SetAllowance
```go
func (k Keeper) SetAllowance(ctx sdk.Context, owner, spender sdk.AccAddress, amount sdk.Int) {
    store := ctx.KVStore(k.storeKey)
    key := types.GetAllowanceKey(owner, spender)
    store.Set(key, amount.Bytes())
}
```

### TransferFrom
```go
func (k Keeper) TransferFrom(ctx sdk.Context, spender, from, to sdk.AccAddress, amount sdk.Int) error {
    // Check allowance
    allowance := k.GetAllowance(ctx, from, spender)
    if allowance.LT(amount) {
        return sdkerrors.Wrap(sdkerrors.ErrUnauthorized, "insufficient allowance")
    }
    
    // Deduct allowance
    k.SetAllowance(ctx, from, spender, allowance.Sub(amount))
    
    // Transfer tokens
    return k.TransferMallcoin(ctx, from, to, amount)
}
```

### GetAllowance
```go
func (k Keeper) GetAllowance(ctx sdk.Context, owner, spender sdk.AccAddress) sdk.Int {
    store := ctx.KVStore(k.storeKey)
    key := types.GetAllowanceKey(owner, spender)
    bz := store.Get(key)
    if bz == nil {
        return sdk.ZeroInt()
    }
    return sdk.NewIntFromBytes(bz)
}
```

---

## BRIDGE INTEGRATION

### x/wasmbridge Module
**File**: x/wasmbridge/keeper/msg_server.go

```go
func (k msgServer) MsgExecuteAction(goCtx context.Context, msg *types.MsgExecuteAction) (*types.MsgExecuteActionResponse, error) {
    // Dispatch to x/mlcoin MGP20 operations
    switch msg.Action {
    case "set_allowance":
        return k.mlcoinKeeper.SetAllowance(...)
    case "transfer_from":
        return k.mlcoinKeeper.TransferFrom(...)
    }
}
```

**Purpose**: Enable WASM smart contracts to interact with MGP-20 functions

---

## ON-CHAIN VERIFICATION

### Query Endpoint
**COMMAND**: `curl http://127.0.0.1:1317/mall/mlcoin/allowance?owner=...&spender=...`
**RESULT**: Not implemented
**VERDICT**: ❌ FAIL - Cannot query allowances

### Test Transaction
**Status**: ⚠️ NOT TESTED
**Reason**: No MLC tokens in circulation

---

## SECURITY CONSIDERATIONS

### Allowance Race Condition
**Issue**: ERC-20 approve/transferFrom race condition
**Mitigation**: Not implemented (standard ERC-20 issue)
**Recommendation**: Document limitation or implement increaseAllowance/decreaseAllowance

### Overflow Protection
**Status**: ✅ Uses sdk.Int (safe math)

### Authorization
**Status**: ✅ Checks allowance before transfer

---

## USE CASES

### 1. Decentralized Exchange
```
User A approves DEX contract to spend 100 MLC
DEX contract calls transferFrom(User A, Pool, 100 MLC)
```

### 2. Escrow Contract
```
User approves escrow contract
Escrow contract transfers tokens based on conditions
```

### 3. Staking Contract
```
User approves staking contract
Staking contract pulls tokens for staking
```

---

## FINDINGS

### Working
1. ✅ Code implementation exists
2. ✅ Allowance storage in KVStore
3. ✅ Authorization checks
4. ✅ Bridge integration designed

### Not Working
1. ❌ Query endpoint not implemented
2. ❌ Cannot verify on-chain state
3. ❌ No transactions tested

### Not Tested
1. ⚠️ SetAllowance transaction
2. ⚠️ TransferFrom transaction
3. ⚠️ WASM contract integration
4. ⚠️ DEX integration

---

## RECOMMENDATIONS

### Immediate
1. Implement allowance query endpoint
2. Test SetAllowance transaction
3. Test TransferFrom transaction

### Short-term
1. Deploy test WASM contract
2. Test WASM ↔ MGP20 integration
3. Verify bridge dispatch logic

### Long-term
1. Build DEX using MGP-20
2. Create staking contract
3. Implement escrow contracts

---

## VERDICT SUMMARY

| Component | Status | Evidence |
|-----------|--------|----------|
| Code Implementation | ✅ PASS | x/mlcoin/keeper/mgp20.go exists |
| Bridge Integration | ✅ PASS | x/wasmbridge dispatches to MGP20 |
| Query Endpoint | ❌ FAIL | Not implemented |
| On-chain Testing | ⚠️ NOT VERIFIED | No transactions tested |

**OVERALL**: NOT VERIFIED - Code exists but not tested

---

**Audit Completed**: 2026-09-28T07:55:00Z
**Status**: IMPLEMENTED, NOT TESTED
