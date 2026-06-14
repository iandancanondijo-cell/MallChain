// Contract state query endpoints for Explorer
// Backend should implement /wasm/contract/:address endpoint

import { apiFetch } from './api'

export async function queryContract(contractAddress, query) {
  return apiFetch(`/wasm/contract/${contractAddress}`, {
    method: 'POST',
    body: JSON.stringify({ query }),
  })
}

export async function listContracts() {
  return apiFetch('/wasm/contracts')
}

export async function getContractCode(codeId) {
  return apiFetch(`/wasm/code/${codeId}`)
}