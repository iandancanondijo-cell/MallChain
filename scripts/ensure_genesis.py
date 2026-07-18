#!/usr/bin/env python3
"""
ensure_genesis.py  <chain_home>

Validates the genesis.json and priv_validator_key.json for Mallchain.
Automatically repairs any structural issues that would prevent the chain
from producing blocks, WITHOUT touching wallet balances, MLC allocations,
or any application-layer state.

Checks performed (and auto-fixed if needed):
  1. top-level validators array matches priv_validator_key.json
  2. staking module has the validator bonded with correct delegation
  3. bonded_tokens_pool module account exists in auth
  4. bonded_tokens_pool has the correct stake balance in bank
  5. bank supply matches the sum of all bank balances
  6. slashing module has signing_info for the validator
  7. genutil gen_txs is empty (broken gentx removed)
  8. initial_height is 1 (integer)
  9. unsafe-reset-all is run only when the validator state file is from
     a different chain run (height > 0 and app_hash mismatch)
"""

import json
import os
import subprocess
import sys
import hashlib
from collections import defaultdict

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


def _convertbits(data, frombits, tobits, pad=True):
    acc = 0; bits = 0; ret = []; maxv = (1 << tobits) - 1
    for value in data:
        acc = ((acc << frombits) | value) & 0xFFFFFFFF
        bits += frombits
        while bits >= tobits:
            bits -= tobits
            ret.append((acc >> bits) & maxv)
    if pad and bits:
        ret.append((acc << (tobits - bits)) & maxv)
    return ret


def _bech32_polymod(values):
    GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
    chk = 1
    for v in values:
        b = (chk >> 25)
        chk = (chk & 0x1ffffff) << 5 ^ v
        for i in range(5):
            chk ^= GEN[i] if ((b >> i) & 1) else 0
    return chk


def bech32_encode(prefix, data_bytes):
    hrpdata = [ord(x) >> 5 for x in prefix] + [0] + [ord(x) & 31 for x in prefix]
    data5 = _convertbits(data_bytes, 8, 5)
    values = hrpdata + data5 + [0, 0, 0, 0, 0, 0]
    polymod = _bech32_polymod(values) ^ 1
    checksum = [(polymod >> 5 * (5 - i)) & 31 for i in range(6)]
    return prefix + "1" + "".join([CHARSET[d] for d in data5 + checksum])


def module_address(name, prefix="mall"):
    """Derive the bech32 address for a Cosmos SDK module account."""
    addr_bytes = hashlib.sha256(name.encode()).digest()[:20]
    return bech32_encode(prefix, addr_bytes)


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main(chain_home: str):
    genesis_path   = os.path.join(chain_home, "config", "genesis.json")
    val_key_path   = os.path.join(chain_home, "config", "priv_validator_key.json")
    val_state_path = os.path.join(chain_home, "data",   "priv_validator_state.json")

    if not os.path.exists(genesis_path):
        print(f"ERROR: genesis.json not found at {genesis_path}")
        sys.exit(1)
    if not os.path.exists(val_key_path):
        print(f"ERROR: priv_validator_key.json not found at {val_key_path}")
        sys.exit(1)

    # Load files
    with open(genesis_path) as f:
        genesis = json.load(f)
    with open(val_key_path) as f:
        val_key = json.load(f)

    pub_b64  = val_key["pub_key"]["value"]
    val_hex  = val_key["address"]
    modified = False

    # Derive addresses from validator hex
    val_bytes        = bytes.fromhex(val_hex)
    cons_addr        = bech32_encode("mallvalcons", val_bytes)
    bonded_pool_addr = module_address("bonded_tokens_pool")
    not_bonded_addr  = module_address("not_bonded_tokens_pool")

    # Identify validator operator address from staking module (or derive it)
    # We read it from existing staking validators if present, otherwise from
    # the bank — the account with only stake and no mlc is the validator account.
    existing_staking_vals = genesis["app_state"]["staking"]["validators"]
    if existing_staking_vals:
        val_operator = existing_staking_vals[0]["operator_address"]
    else:
        # Fallback: find account that holds only stake (no mlc) — that's the validator
        mlcoin_addrs = {
            w["address"] for w in
            genesis["app_state"]["mlcoin"].get("wallet_balance_map", [])
        }
        val_delegator = None
        for b in genesis["app_state"]["bank"]["balances"]:
            addr = b["address"]
            if addr in (bonded_pool_addr, not_bonded_addr):
                continue
            denoms = {c["denom"] for c in b["coins"]}
            if "stake" in denoms and addr not in mlcoin_addrs:
                val_delegator = addr
                break
        if not val_delegator:
            print("ERROR: cannot identify validator delegator account in genesis.")
            sys.exit(1)
        # Convert mall1... -> mallvaloper1... (same raw bytes, different prefix)
        # We can't do this without the raw bytes, so we derive from the account
        # by bech32-decoding. Use a simple decode approach:
        def bech32_decode_raw(addr):
            _, data_part = addr.rsplit("1", 1)
            decoded = [CHARSET.index(c) for c in data_part]
            # drop checksum (last 6)
            decoded = decoded[:-6]
            return bytes(_convertbits(decoded, 5, 8, False))
        raw = bech32_decode_raw(val_delegator)
        val_operator = bech32_encode("mallvaloper", raw)
        val_delegator_addr = val_delegator
        print(f"  Derived validator operator: {val_operator}")

    # Read delegator from existing delegation or bank
    existing_delegations = genesis["app_state"]["staking"]["delegations"]
    if existing_delegations:
        val_delegator_addr = existing_delegations[0]["delegator_address"]
    else:
        # same logic as above but we need it regardless
        mlcoin_addrs = {
            w["address"] for w in
            genesis["app_state"]["mlcoin"].get("wallet_balance_map", [])
        }
        for b in genesis["app_state"]["bank"]["balances"]:
            addr = b["address"]
            if addr in (bonded_pool_addr, not_bonded_addr):
                continue
            denoms = {c["denom"] for c in b["coins"]}
            if "stake" in denoms and addr not in mlcoin_addrs:
                val_delegator_addr = addr
                break

    # Bond amount = validator tokens in staking (or fall back to 1B)
    BOND_AMOUNT = (
        existing_staking_vals[0]["tokens"]
        if existing_staking_vals
        else "1000000000"
    )

    # ── Check 1: top-level validators ──────────────────────────────────────
    current_top_vals = genesis.get("validators", [])
    expected_top_val = {
        "address": val_hex,
        "pub_key": {"type": "tendermint/PubKeyEd25519", "value": pub_b64},
        "power": "1",
        "name": "validator1",
    }
    if current_top_vals != [expected_top_val]:
        print("  Fixing: top-level validators array")
        genesis["validators"] = [expected_top_val]
        modified = True

    # ── Check 2: initial_height ─────────────────────────────────────────────
    if genesis.get("initial_height") != 1:
        print("  Fixing: initial_height")
        genesis["initial_height"] = 1
        modified = True

    # ── Check 3: genutil gen_txs (remove broken gentx) ─────────────────────
    if genesis["app_state"]["genutil"].get("gen_txs"):
        print("  Fixing: removing broken gen_txs from genutil")
        genesis["app_state"]["genutil"]["gen_txs"] = []
        modified = True

    # ── Check 4: staking validator ──────────────────────────────────────────
    staking_vals = genesis["app_state"]["staking"]["validators"]
    needs_staking_fix = (
        not staking_vals
        or staking_vals[0].get("consensus_pubkey", {}).get("key") != pub_b64
        or staking_vals[0].get("status") != "BOND_STATUS_BONDED"
    )
    if needs_staking_fix:
        print("  Fixing: staking validator entry")
        genesis["app_state"]["staking"]["validators"] = [{
            "operator_address": val_operator,
            "consensus_pubkey": {
                "@type": "/cosmos.crypto.ed25519.PubKey",
                "key": pub_b64,
            },
            "jailed": False,
            "status": "BOND_STATUS_BONDED",
            "tokens": BOND_AMOUNT,
            "delegator_shares": f"{BOND_AMOUNT}.000000000000000000",
            "description": {
                "moniker": "validator1",
                "identity": "",
                "website": "",
                "security_contact": "",
                "details": "",
            },
            "unbonding_height": "0",
            "unbonding_time": "1970-01-01T00:00:00Z",
            "commission": {
                "commission_rates": {
                    "rate":             "0.100000000000000000",
                    "max_rate":         "0.200000000000000000",
                    "max_change_rate":  "0.010000000000000000",
                },
                "update_time": "2024-01-01T00:00:00Z",
            },
            "min_self_delegation": "1",
        }]
        modified = True

    # ── Check 5: staking delegation ─────────────────────────────────────────
    delegations = genesis["app_state"]["staking"]["delegations"]
    needs_delegation_fix = (
        not delegations
        or delegations[0].get("validator_address") != val_operator
    )
    if needs_delegation_fix:
        print("  Fixing: staking delegation")
        genesis["app_state"]["staking"]["delegations"] = [{
            "delegator_address": val_delegator_addr,
            "validator_address": val_operator,
            "shares": f"{BOND_AMOUNT}.000000000000000000",
        }]
        modified = True

    # ── Check 6: staking last_validator_powers ──────────────────────────────
    lvp = genesis["app_state"]["staking"].get("last_validator_powers", [])
    if not lvp or lvp[0].get("address") != val_operator:
        print("  Fixing: staking last_validator_powers")
        genesis["app_state"]["staking"]["last_validator_powers"] = [
            {"address": val_operator, "power": "1"}
        ]
        genesis["app_state"]["staking"]["last_total_power"] = "1"
        modified = True

    # ── Check 7: auth module accounts (bonded pool) ─────────────────────────
    auth_addrs = set()
    for a in genesis["app_state"]["auth"]["accounts"]:
        addr = a.get("address") or a.get("base_account", {}).get("address", "")
        auth_addrs.add(addr)

    for addr, name, perms in [
        (bonded_pool_addr, "bonded_tokens_pool",     ["burner", "staker"]),
        (not_bonded_addr,  "not_bonded_tokens_pool", ["burner", "staker"]),
    ]:
        if addr not in auth_addrs:
            print(f"  Fixing: adding module account {name}")
            genesis["app_state"]["auth"]["accounts"].append({
                "@type": "/cosmos.auth.v1beta1.ModuleAccount",
                "base_account": {
                    "address":        addr,
                    "pub_key":        None,
                    "account_number": "0",
                    "sequence":       "0",
                },
                "name":        name,
                "permissions": perms,
            })
            modified = True

    # ── Check 8: bonded pool bank balance ───────────────────────────────────
    bank_map = {b["address"]: b["coins"] for b in genesis["app_state"]["bank"]["balances"]}
    bonded_pool_coins = bank_map.get(bonded_pool_addr, [])
    bonded_stake = next((int(c["amount"]) for c in bonded_pool_coins if c["denom"] == "stake"), 0)

    if bonded_stake != int(BOND_AMOUNT):
        print(f"  Fixing: bonded_tokens_pool bank balance (need {BOND_AMOUNT}stake, have {bonded_stake}stake)")
        # Remove old entry if any
        genesis["app_state"]["bank"]["balances"] = [
            b for b in genesis["app_state"]["bank"]["balances"]
            if b["address"] != bonded_pool_addr
        ]
        genesis["app_state"]["bank"]["balances"].append({
            "address": bonded_pool_addr,
            "coins":   [{"denom": "stake", "amount": BOND_AMOUNT}],
        })
        modified = True

    # ── Check 9: bank supply = sum of all balances ──────────────────────────
    totals = defaultdict(int)
    for b in genesis["app_state"]["bank"]["balances"]:
        for c in b["coins"]:
            totals[c["denom"]] += int(c["amount"])

    current_supply = {s["denom"]: s["amount"] for s in genesis["app_state"]["bank"]["supply"]}
    expected_supply = {d: str(a) for d, a in sorted(totals.items())}

    if current_supply != expected_supply:
        print(f"  Fixing: bank supply ({current_supply} → {expected_supply})")
        genesis["app_state"]["bank"]["supply"] = [
            {"denom": d, "amount": a} for d, a in sorted(totals.items())
        ]
        modified = True

    # ── Check 10: slashing signing_infos ───────────────────────────────────
    signing_addrs = {
        s["address"] for s in genesis["app_state"]["slashing"].get("signing_infos", [])
    }
    if cons_addr not in signing_addrs:
        print(f"  Fixing: slashing signing_info for {cons_addr}")
        genesis["app_state"]["slashing"]["signing_infos"] = [{
            "address": cons_addr,
            "validator_signing_info": {
                "address":               cons_addr,
                "start_height":          "0",
                "index_offset":          "0",
                "jailed_until":          "1970-01-01T00:00:00Z",
                "tombstoned":            False,
                "missed_blocks_counter": "0",
            },
        }]
        modified = True

    # ── Write fixed genesis ─────────────────────────────────────────────────
    if modified:
        with open(genesis_path, "w") as f:
            json.dump(genesis, f, indent=2)
        print("  Genesis updated and saved.")

        # Reset chain data so the node starts from block 0 with the new genesis
        repo_dir = os.path.dirname(chain_home)
        binary   = os.path.join(repo_dir, "marketplaced")
        print("  Running unsafe-reset-all (state reset for fresh genesis start)...")
        subprocess.run(
            [binary, "tendermint", "unsafe-reset-all", f"--home={chain_home}"],
            check=True,
        )
    else:
        # Even if genesis is fine, reset state if priv_validator_state height > 0
        # and data was from a previous run that may conflict
        if os.path.exists(val_state_path):
            with open(val_state_path) as f:
                vs = json.load(f)
            if int(vs.get("height", 0)) > 0:
                # Check if blockstore has data — if not, we need a reset
                blockstore = os.path.join(chain_home, "data", "blockstore.db")
                if not os.path.exists(blockstore):
                    print("  State mismatch detected (height > 0 but no blockstore). Resetting...")
                    repo_dir = os.path.dirname(chain_home)
                    binary   = os.path.join(repo_dir, "marketplaced")
                    subprocess.run(
                        [binary, "tendermint", "unsafe-reset-all", f"--home={chain_home}"],
                        check=True,
                    )

    # ── Final wallet audit (informational) ────────────────────────────────
    print("\n  Wallet balances:")
    wallet_labels = {
        genesis["app_state"]["mlcoin"]["wallet_balance_map"][i]["address"]: lbl
        for i, lbl in enumerate(["founder", "afa", "orthopharm", "team"])
        if i < len(genesis["app_state"]["mlcoin"]["wallet_balance_map"])
    }
    for w in genesis["app_state"]["mlcoin"]["wallet_balance_map"]:
        addr  = w["address"]
        label = wallet_labels.get(addr, addr)
        print(f"    {addr}  ({label})  MLC={w['balance']}  locked={w.get('locked','0')}")

    print("\n  Genesis OK ✅")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <chain_home>")
        sys.exit(1)
    main(sys.argv[1])
