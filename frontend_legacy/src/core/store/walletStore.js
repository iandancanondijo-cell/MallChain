import { create } from 'zustand'

export const useWalletStore = create(
  set => ({
    wallet: null,
    address: '',
    balance: '0',
    connected: false,

    setWallet: wallet =>
      set({ wallet }),

    setAddress: address =>
      set({ address }),

    setBalance: balance =>
      set({ balance }),

    setConnected: connected =>
      set({ connected })
  })
)
