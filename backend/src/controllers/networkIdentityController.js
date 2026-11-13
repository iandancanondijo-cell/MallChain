const axios = require('axios')

const { config } = require('../config')

/**
 * Chain identity — GET /api/network.
 *
 * The problem this removes (backend-handoff-2026-11-09 §5): three surfaces of
 * the SPA printed `VITE_NETWORK`, a build flag that defaults to `testnet` when
 * unset, next to each other and next to the dashboard title. A header reading
 * "Mallchain Mainnet" with a "testnet" chip beside the user's name is two
 * answers to one question, and the wrong one was the one that described the
 * chain rather than the compiler. A build flag cannot know which chain is
 * producing blocks; the node can, so the label now comes from the node and is
 * assembled here.
 *
 * Everything in the response is either read from the chain or says which
 * configuration value stood in for it:
 *
 *  - `chainId` comes from CometBFT's `node_info.default_node_info.network`.
 *    When the node does not answer, the configured `CHAIN_ID` is returned
 *    instead and `verified` is false, so a caller can tell an unverified label
 *    from a measured one rather than being handed a guess as fact.
 *  - `networkName` is derived from that chain id by the Cosmos convention
 *    (revision suffix `-1` is a mainnet; test/dev/local is not). The client
 *    used to carry this rule itself; naming a chain is a server-side decision,
 *    and the client now only displays what it is told.
 *  - `decimals`/`displayDenom` are read from the bank module's
 *    `denoms_metadata` when the chain publishes them. If it does not, the
 *    configured unit exponent is returned with `decimalsSource: 'configured'`
 *    — a 6 in the response always says where it came from.
 */

const NODE_INFO_PATH = '/cosmos/base/tendermint/v1beta1/node_info'
const DENOM_METADATA_PATH = '/cosmos/bank/v1beta1/denoms_metadata'

/**
 * Only used when the chain's own denom metadata is absent. The chain's unit
 * denoms (`stake`, and the mlcoin denom) carry six decimals, which is also
 * what every wallet screen already divides by; the value is labelled
 * `decimalsSource: 'configured'` whenever this path is taken.
 */
const CONFIGURED_DECIMALS = 6
const CONFIGURED_DISPLAY_DENOM = 'MALL'
const DENOM_METADATA_TTL_MS = 10 * 60 * 1000

let denomMetadata = null
let denomMetadataAt = 0

function chainRest(urlPath) {
  return `${config.chain.rest.replace(/\/$/, '')}${urlPath}`
}

/**
 * The Cosmos chain-id convention, in one place.
 *
 * Anything these rules do not recognise is returned verbatim rather than
 * labelled "mainnet" on faith — a mislabelled network is worse than an
 * unfamiliar one.
 */
function networkNameFromChainId(chainId) {
  if (!chainId) return null
  if (/test|dev|local/i.test(chainId)) return 'Mallchain Testnet'
  if (/^(.*-)?1$/.test(chainId)) return 'Mallchain Mainnet'
  return chainId
}

/**
 * The chain's public denom metadata, cached. Returns the configured unit
 * exponent with a source flag when the node has none, rather than failing the
 * identity read over a display detail.
 */
async function readDenomDecimals(baseDenom) {
  if (denomMetadata && Date.now() - denomMetadataAt < DENOM_METADATA_TTL_MS) return denomMetadata
  try {
    const { data } = await axios.get(chainRest(DENOM_METADATA_PATH), { timeout: 5000 })
    const entries = (data && data.metadata) || []
    const found = entries.find((m) => m && m.base === baseDenom)
    const units = (found && found.denom_units) || []
    if (units.length) {
      const displayUnit = units.find((u) => u.denom === found.display) || units[units.length - 1]
      const decimals = Number(displayUnit && displayUnit.exponent)
      denomMetadata = {
        decimals: Number.isFinite(decimals) ? decimals : CONFIGURED_DECIMALS,
        display: (found.display && String(found.display)) || CONFIGURED_DISPLAY_DENOM,
        source: 'chain',
      }
      denomMetadataAt = Date.now()
      return denomMetadata
    }
  } catch {
    /* handled by the configured fallback below */
  }
  return {
    decimals: CONFIGURED_DECIMALS,
    display: CONFIGURED_DISPLAY_DENOM,
    source: 'configured',
  }
}

async function getNetworkIdentity(req, res) {
  let nodeInfo = null
  let nodeError = null
  try {
    const { data } = await axios.get(chainRest(NODE_INFO_PATH), { timeout: 5000 })
    nodeInfo = (data && data.default_node_info) || null
  } catch (err) {
    nodeError = err.message
  }

  const measuredChainId = (nodeInfo && nodeInfo.network) || null
  const moniker = (nodeInfo && nodeInfo.moniker) || null
  // The configured id is what the signing code in this process actually uses,
  // so returning it when the node is quiet is informative — but only together
  // with `verified: false`, which is the whole reason the header could not be
  // trusted before.
  const chainId = measuredChainId || config.chain.id

  const decimals = await readDenomDecimals(config.chain.baseDenom)
  const appBase = config.frontendUrl.replace(/\/$/, '')

  return res.json({
    ok: true,
    chainId,
    networkName: networkNameFromChainId(chainId),
    bech32Prefix: config.chain.prefix,
    baseDenom: config.chain.baseDenom,
    displayDenom: decimals.display,
    decimals: decimals.decimals,
    decimalsSource: decimals.source,
    gasPrice: config.chain.gasPrice,
    moniker,
    verified: measuredChainId !== null,
    // Where the chainId in this response came from: the node, or this
    // process's configuration because the node did not answer.
    source: measuredChainId ? 'node' : 'config',
    explorer: {
      base: `${appBase}#/explorer`,
      // Only the transaction deep link exists in the SPA today
      // (BlockchainExplorer.tsx parses `?tx=` out of the hash). Blocks are
      // reached by typing a height into the explorer's own search box, so
      // there is deliberately no per-block URL to hand out here — inventing
      // one would hand callers a link that opens the page and ignores the
      // height they asked for.
      tx: `${appBase}#/explorer?tx={hash}`,
    },
    endpoints: {
      rest: config.chain.rest,
      rpc: config.chain.rpc,
    },
    asOf: new Date().toISOString(),
    nodeError: nodeError || null,
  })
}

// Exposed for tests: the denom cache is module state, and a suite that does
// not reset it would see the first mocked metadata response forever.
function _resetDenomCache() {
  denomMetadata = null
  denomMetadataAt = 0
}

module.exports = { getNetworkIdentity, networkNameFromChainId, _resetDenomCache }
