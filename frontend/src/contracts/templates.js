// Contract Templates for Mallchain Ecosystem

// Marketplace Contract Template
export const MARKETPLACE_TEMPLATE = {
  name: "marketplace",
  version: "1.0.0",
  abi: "mallchain",
  initMsg: {
    listing_fee: "1000",
    treasury: "mall1..."
  },
  actions: {
    create_listing: { item_id: "string", price: "uint64" },
    cancel_listing: { listing_id: "uint64" },
    buy: { listing_id: "uint64" }
  },
  queries: {
    listing: { listing_id: "uint64" },
    listings: { seller: "string?" },
    inventory: { buyer: "string" }
  }
}

// DAO Contract Template
export const DAO_TEMPLATE = {
  name: "dao",
  version: "1.0.0",
  abi: "mallchain",
  initMsg: {
    name: "string",
    proposal_quorum: "0.1",
    voting_period: 604800
  },
  actions: {
    create_proposal: { title: "string", description: "string", calldata: "bytes?" },
    vote: { proposal_id: "uint64", vote: "yes|no|abstain" },
    execute_proposal: { proposal_id: "uint64" }
  },
  queries: {
    proposal: { id: "uint64" },
    proposals: { status: "active|passed|rejected?" },
    voting_power: { address: "string" }
  }
}

// Game Rewards Contract Template
export const GAME_REWARDS_TEMPLATE = {
  name: "game-rewards",
  version: "1.0.0",
  abi: "mallchain",
  initMsg: {
    reward_per_action: "10",
    cooldown_seconds: 30
  },
  actions: {
    reward: { player: "string", action: "string" },
    claim: { player: "string" },
    set_reward: { new_reward: "uint64" }
  },
  queries: {
    balance: { player: "string" },
    last_claim: { player: "string" },
    total_rewards: {}
  }
}