import { apiFetch } from '../../lib/api'

// Initiate an Mpesa withdrawal request from wallet to fiat
export async function initiateWithdrawMpesa({ walletAddress, phone, amountMlcns, amountKes, currency = 'KES' }) {
  return apiFetch('/withdraw/mpesa', {
    method: 'POST',
    body: JSON.stringify({ walletAddress, phone, amountMlcns: Number(amountMlcns), amountKes: Number(amountKes), currency }),
  })
}
