import axios, { AxiosInstance } from 'axios'

export interface IntegratedAddress {
  integrated_address: string
  payment_id: string
}

export interface Transfer {
  address: string
  amount: number
  confirmations: number
  payment_id: string
  timestamp: number
  txid: string
}

export class XMRWallet {
  private client: AxiosInstance
  
  constructor(
    private rpcUrl: string,
    private rpcPort: number,
    private username?: string,
    private password?: string
  ) {
    const auth = username && password
      ? { username, password }
      : undefined
    
    this.client = axios.create({
      baseURL: `${rpcUrl}:${rpcPort}/json_rpc`,
      auth,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Create an integrated address for receiving payment
   */
  async createIntegratedAddress(paymentId?: string): Promise<IntegratedAddress> {
    const response = await this.client.post('', {
      jsonrpc: '2.0',
      id: '0',
      method: 'make_integrated_address',
      params: paymentId ? { payment_id: paymentId } : {}
    })
    
    return response.data.result
  }

  /**
   * Get incoming transfers
   */
  async getTransfers(paymentId?: string): Promise<Transfer[]> {
    const response = await this.client.post('', {
      jsonrpc: '2.0',
      id: '0',
      method: 'get_transfers',
      params: {
        in: true,
        pending: false,
        pool: true,
        filter_by_height: false,
        ...(paymentId && { payment_id: paymentId })
      }
    })

    const transfers = response.data.result?.in || []
    return transfers.map((t: any) => ({
      address: t.address,
      amount: t.amount / 1e12, // Convert from atomic units
      confirmations: t.confirmations,
      payment_id: t.payment_id,
      timestamp: t.timestamp,
      txid: t.txid
    }))
  }

  /**
   * Get balance
   */
  async getBalance(): Promise<{ balance: number; unlocked_balance: number }> {
    const response = await this.client.post('', {
      jsonrpc: '2.0',
      id: '0',
      method: 'get_balance'
    })

    return {
      balance: response.data.result.balance / 1e12,
      unlocked_balance: response.data.result.unlocked_balance / 1e12
    }
  }

  /**
   * Check if wallet RPC is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.getBalance()
      return true
    } catch (error) {
      return false
    }
  }
}
