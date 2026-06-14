#!/usr/bin/env node

/**
 * Generate Complete Validator-Ready Genesis
 * Creates a minimal genesis with a validator matching the node's keys
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

if (process.argv.length < 4) {
  console.log('Usage: node generate_validator_genesis.js <priv_validator_key.json> <output_genesis.json>');
  process.exit(1);
}

const privKeyPath = process.argv[2];
const outputPath = process.argv[3];

if (!fs.existsSync(privKeyPath)) {
  console.error(`Private validator key not found: ${privKeyPath}`);
  process.exit(1);
}

const privKey = JSON.parse(fs.readFileSync(privKeyPath, 'utf-8'));

// Create a complete, minimal genesis with the validator
const genesis = {
  "genesis_time": new Date().toISOString(),
  "chain_id": "mallchain-1",
  "initial_height": "1",
  "consensus_params": {
    "block": {
      "max_bytes": "22020096",
      "max_gas": "-1",
      "time_iota_ms": "1000"
    },
    "evidence": {
      "max_age_num_blocks": "100000",
      "max_age_duration": "1814400000000000",
      "max_bytes": "1048576"
    },
    "validator": {
      "pub_key_types": [
        "ed25519"
      ]
    },
    "version": {
      "app_version": "0"
    },
    "abci": {
      "recheck_tx": false
    }
  },
  "validators": [
    {
      "address": "",
      "pub_key": {
        "type": "tendermint/PubKeyEd25519",
        "value": privKey.pub_key.value
      },
      "power": "10",
      "name": "validator1"
    }
  ],
  "app_hash": "",
  "app_state": {
    "auth": {
      "params": {
        "max_memo_characters": "256",
        "tx_sig_limit": "7",
        "tx_size_cost_per_byte": "10",
        "sig_verify_cost_ed25519": "590",
        "sig_verify_cost_secp256k1": "1000"
      },
      "accounts": [
        {
          "@type": "/cosmos.auth.v1beta1.BaseAccount",
          "address": "mall1vu6mfut8wzkz57m8xs6mjewsl2an4ukh98rw09",
          "pub_key": null,
          "account_number": "0",
          "sequence": "0"
        }
      ]
    },
    "authz": {
      "authorization": []
    },
    "bank": {
      "params": {
        "send_enabled": [],
        "default_send_enabled": true
      },
      "balances": [
        {
          "address": "mall1vu6mfut8wzkz57m8xs6mjewsl2an4ukh98rw09",
          "coins": [
            {
              "denom": "stake",
              "amount": "3600000000000"
            },
            {
              "denom": "mlc",
              "amount": "254500000"
            }
          ]
        }
      ],
      "supply": [
        {
          "denom": "stake",
          "amount": "3600000000000"
        },
        {
          "denom": "mlc",
          "amount": "254500000"
        }
      ],
      "denom_metadata": []
    },
    "capability": {
      "index": "1",
      "capabilities": []
    },
    "consensus": {
      "params": {}
    },
    "crisis": {
      "constant_fee": {
        "denom": "stake",
        "amount": "1000"
      }
    },
    "distribution": {
      "params": {
        "community_tax": "0.020000000000000000",
        "base_proposer_reward": "0.010000000000000000",
        "bonus_proposer_reward": "0.040000000000000000",
        "withdraw_addr_enabled": true
      },
      "fee_pool": {
        "community_pool": []
      },
      "delegator_withdraw_infos": [],
      "previous_proposer": "",
      "outstanding_rewards": [],
      "validator_accumulated_commissions": [],
      "validator_historical_rewards": [],
      "validator_current_rewards": [],
      "delegator_starting_infos": [],
      "validator_slash_events": []
    },
    "evidence": {
      "evidence": []
    },
    "feegrant": {
      "allowances": []
    },
    "genutil": {
      "gen_txs": []
    },
    "gov": {
      "starting_proposal_id": "1",
      "deposits": [],
      "votes": [],
      "proposals": [],
      "params": {
        "voting_period": "172800s",
        "max_deposit_period": "86400s",
        "min_deposit": [
          {
            "denom": "stake",
            "amount": "10000000"
          }
        ],
        "quorum": "0.334000000000000000",
        "threshold": "0.500000000000000000",
        "veto_threshold": "0.334000000000000000",
        "min_initial_deposit_ratio": "0.000000000000000000",
        "proposal_cancel_ratio": "0.500000000000000000",
        "proposal_cancel_dest": "",
        "expedited_voting_period": "86400s",
        "expedited_threshold": "0.667000000000000000",
        "expedited_min_deposit": [
          {
            "denom": "stake",
            "amount": "50000000"
          }
        ]
      }
    },
    "ibc": {
      "client_genesis": {
        "clients": [],
        "clients_consensus": [],
        "create_localhost": false,
        "next_client_sequence": "0",
        "params": {
          "allowed_clients": [
            "06-solomachine",
            "07-tendermint"
          ]
        }
      },
      "connection_genesis": {
        "connections": [],
        "client_connection_paths": [],
        "next_connection_sequence": "0",
        "params": {
          "max_expected_time_per_block": "30000000000"
        }
      },
      "channel_genesis": {
        "channels": [],
        "acknowledgements": [],
        "commitments": [],
        "receipts": [],
        "send_sequences": [],
        "recv_sequences": [],
        "ack_sequences": [],
        "next_channel_sequence": "0",
        "params": {
          "channel_open_init_options": null,
          "channel_open_try_options": null
        }
      }
    },
    "interchainaccounts": {
      "controller_genesis_state": {
        "active_channels": [],
        "interchain_accounts": [],
        "ports": [],
        "params": {
          "controller_enabled": true
        }
      },
      "host_genesis_state": {
        "active_channels": [],
        "interchain_accounts": [],
        "port": "icahost",
        "params": {
          "host_enabled": true,
          "allow_messages": [
            "*"
          ]
        }
      }
    },
    "mint": {
      "minter": {
        "inflation": "0.070000000000000000",
        "annual_provisions": "0.000000000000000000"
      },
      "params": {
        "mint_denom": "stake",
        "inflation_rate_change": "0.130000000000000000",
        "inflation_max": "0.200000000000000000",
        "inflation_min": "0.070000000000000000",
        "goal_bonded": "0.670000000000000000",
        "blocks_per_year": "6311520"
      }
    },
    "nft": {
      "classes": [],
      "entries": []
    },
    "slashing": {
      "params": {
        "signed_blocks_window": "100",
        "min_signed_per_window": "0.500000000000000000",
        "downtime_jail_duration": "600s",
        "slash_fraction_double_sign": "0.050000000000000000",
        "slash_fraction_downtime": "0.010000000000000000"
      },
      "signing_infos": [],
      "missed_blocks": []
    },
    "staking": {
      "params": {
        "unbonding_time": "1814400s",
        "max_validators": 100,
        "max_entries": 7,
        "historical_entries": 10000,
        "bond_denom": "stake",
        "min_commission_rate": "0.000000000000000000"
      },
      "last_total_power": "0",
      "last_validator_powers": [
        {
          "address": "mallvaloper1vu6mfut8wzkz57m8xs6mjewsl2an4ukhcmsclf",
          "power": "0"
        }
      ],
      "validators": [
        {
          "operator_address": "mallvaloper1vu6mfut8wzkz57m8xs6mjewsl2an4ukhcmsclf",
          "consensus_pubkey": {
            "@type": "/cosmos.crypto.ed25519.PubKey",
            "key": privKey.pub_key.value
          },
          "jailed": false,
          "status": "BOND_STATUS_BONDED",
          "tokens": "0",
          "delegator_shares": "0.000000000000000000",
          "description": {
            "moniker": "validator1",
            "identity": "",
            "website": "",
            "security_contact": "",
            "details": ""
          },
          "unbonding_height": "0",
          "unbonding_time": "1970-01-01T00:00:00Z",
          "commission": {
            "commission_rates": {
              "rate": "0.100000000000000000",
              "max_rate": "0.200000000000000000",
              "max_change_rate": "0.010000000000000000"
            },
            "update_time": "1970-01-01T00:00:00Z"
          },
          "min_self_delegation": "1",
          "unbonding_on_hold_ref_count": "0",
          "unbonding_ids": []
        }
      ],
      "delegations": [],
      "unbonding_delegations": [],
      "redelegations": [],
      "exported": false
    },
    "transfer": {
      "port_id": "transfer",
      "denom_traces": [],
      "params": {
        "send_enabled": true,
        "receive_enabled": true
      }
    },
    "upgrade": {},
    "vesting": {},
    "wasm": {},
    "group": {
      "group_seq": "0",
      "groups": [],
      "group_members": [],
      "group_policy_seq": "0",
      "group_policies": [],
      "proposal_seq": "0",
      "proposals": [],
      "votes": []
    },
    "params": {},
    "exploit": {},
    "mallcoin": {},
    "mallpoints": {},
    "badge": {},
    "epochs": {
      "epochs": []
    },
    "circuit": {
      "account_permissions": []
    }
  }
};

fs.writeFileSync(outputPath, JSON.stringify(genesis, null, 2), 'utf-8');
console.log(`✓ Complete validator-ready genesis generated: ${outputPath}`);
console.log(`  Validator pubkey: ${privKey.pub_key.value}`);
