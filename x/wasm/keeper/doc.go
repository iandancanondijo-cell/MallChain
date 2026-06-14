// Mallchain WASM Contract Runtime - Phase 1 Complete
//
// Host Functions (mallchain):
//   storage_get(key_ptr, key_len) -> ptr - Read contract state
//   storage_set(key_ptr, key_len, value_ptr, value_len) -> success - Write contract state  
//   mgp20_transfer(to_ptr, to_len, amount) -> success - Transfer MGP-20 tokens
//   mgp20_balance(address_ptr, address_len) -> balance - Query MGP-20 balance
//
// Contract Lifecycle:
//   StoreCode -> Instantiate -> Execute/Query -> State Storage
//
// See keeper.go:ExecuteWASMRaw, keeper.go:QueryContract, keeper.go:InstantiateContract
// See wasmbridge/keeper/keeper.go:HandleTransfer, wasmbridge/keeper/keeper.go:QueryBalance
package keeper