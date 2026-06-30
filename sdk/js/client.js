// @mallchain/client - JavaScript SDK for Mallchain
//
// npm install @mallchain/client
//
// Usage:
// import { MallchainClient } from '@mallchain/client'
// const client = new MallchainClient({ rpcUrl: 'https://rpc.mallchain.com' })

export interface ClientOptions {
  rpcUrl: string
  chainId?: string
}

export class MallchainClient {
  private rpcUrl: string
  private chainId: string

  constructor(options: ClientOptions) {
    this.rpcUrl = options.rpcUrl
    this.chainId = options.chainId || 'mall-1'
  }

  async query(path: string): Promise<unknown> {
    const res = await fetch(`${this.rpcUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' }
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }
    return res.json()
  }

  async getBlock(height?: number): Promise<unknown> {
    const path = height ? `/blocks/${height}` : '/blocks/latest'
    return this.query(path)
  }

  async getStatus(): Promise<unknown> {
    return this.query('/status')
  }
}
