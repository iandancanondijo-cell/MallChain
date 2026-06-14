import { ethers } from 'ethers'
import CryptoJS from 'crypto-js'

export function createWallet(password = '') {
  const wallet = ethers.Wallet.createRandom()
  const encrypted = CryptoJS.AES.encrypt(wallet.privateKey, password).toString()
  localStorage.setItem('mall_wallet', encrypted)
  localStorage.setItem('mall_address', wallet.address)
  return wallet.address
}

export function loadWallet(password = '') {
  const encrypted = localStorage.getItem('mall_wallet')
  if (!encrypted) return null
  const decrypted = CryptoJS.AES.decrypt(encrypted, password)
  const pk = decrypted.toString(CryptoJS.enc.Utf8)
  if (!pk) return null
  return new ethers.Wallet(pk)
}

export function importWallet(privateKey, password = '') {
  try {
    const wallet = new ethers.Wallet(privateKey)
    const encrypted = CryptoJS.AES.encrypt(wallet.privateKey, password).toString()
    localStorage.setItem('mall_wallet', encrypted)
    localStorage.setItem('mall_address', wallet.address)
    return wallet.address
  } catch (e) {
    console.error('importWallet failed', e)
    return null
  }
}

export function importFromMnemonic(mnemonic, password = '', type = 'mall') {
  try {
    const wallet = ethers.Wallet.fromPhrase(mnemonic)
    const encrypted = CryptoJS.AES.encrypt(wallet.privateKey, password).toString()
    localStorage.setItem('mall_wallet', encrypted)
    localStorage.setItem('mall_address', wallet.address)
    localStorage.setItem('mall_type', type)
    return wallet.address
  } catch (e) {
    console.error('importFromMnemonic failed', e)
    return null
  }
}
