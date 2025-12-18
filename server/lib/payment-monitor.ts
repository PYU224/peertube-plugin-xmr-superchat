import { XMRWallet, Transfer } from './xmr-wallet'

export interface PendingPayment {
  paymentId: string
  videoId: string
  amount: number
  message: string
  createdAt: number
}

export interface ConfirmedPayment extends PendingPayment {
  txid: string
  confirmations: number
  confirmedAt: number
}

export class PaymentMonitor {
  private wallet: XMRWallet
  private pendingPayments: Map<string, PendingPayment> = new Map()
  private processedTxids: Set<string> = new Set()
  private pollingInterval: NodeJS.Timeout | null = null

  constructor(wallet: XMRWallet) {
    this.wallet = wallet
  }

  /**
   * Register a pending payment to monitor
   */
  registerPayment(payment: PendingPayment): void {
    this.pendingPayments.set(payment.paymentId, payment)
  }

  /**
   * Start monitoring for payments
   */
  startMonitoring(
    intervalMs: number = 10000,
    onPaymentConfirmed: (payment: ConfirmedPayment) => void
  ): void {
    if (this.pollingInterval) {
      return // Already monitoring
    }

    this.pollingInterval = setInterval(async () => {
      await this.checkPayments(onPaymentConfirmed)
    }, intervalMs)

    // Check immediately
    this.checkPayments(onPaymentConfirmed).catch(err => {
      console.error('Error checking payments:', err)
    })
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
  }

  /**
   * Check for confirmed payments
   */
  private async checkPayments(
    onPaymentConfirmed: (payment: ConfirmedPayment) => void
  ): Promise<void> {
    try {
      const transfers = await this.wallet.getTransfers()

      for (const transfer of transfers) {
        // Skip already processed transactions
        if (this.processedTxids.has(transfer.txid)) {
          continue
        }

        // Check if this transfer matches a pending payment
        const pending = this.pendingPayments.get(transfer.payment_id)
        if (!pending) {
          continue
        }

        // Require at least 1 confirmation for security
        if (transfer.confirmations < 1) {
          continue
        }

        // Mark as processed
        this.processedTxids.add(transfer.txid)
        this.pendingPayments.delete(transfer.payment_id)

        // Notify about confirmed payment
        const confirmedPayment: ConfirmedPayment = {
          ...pending,
          txid: transfer.txid,
          confirmations: transfer.confirmations,
          confirmedAt: transfer.timestamp
        }

        onPaymentConfirmed(confirmedPayment)
      }

      // Clean up old pending payments (older than 1 hour)
      const oneHourAgo = Date.now() - 3600000
      for (const [paymentId, payment] of this.pendingPayments) {
        if (payment.createdAt < oneHourAgo) {
          this.pendingPayments.delete(paymentId)
        }
      }
    } catch (error) {
      console.error('Error checking payments:', error)
    }
  }

  /**
   * Get current pending payments count
   */
  getPendingCount(): number {
    return this.pendingPayments.size
  }
}
