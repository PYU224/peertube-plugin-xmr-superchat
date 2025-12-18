import { Server as SocketIOServer } from 'socket.io'
import { XMRWallet } from './lib/xmr-wallet'
import { PaymentMonitor, PendingPayment } from './lib/payment-monitor'
import QRCode from 'qrcode'

async function register({
  registerHook,
  registerSetting,
  settingsManager,
  storageManager,
  peertubeHelpers,
  getRouter
}: any) {
  const logger = peertubeHelpers.logger

  // Register settings
  registerSetting({
    name: 'xmr-rpc-url',
    label: 'Monero Wallet RPC URL',
    type: 'input',
    default: 'http://localhost',
    private: true
  })

  registerSetting({
    name: 'xmr-rpc-port',
    label: 'Monero Wallet RPC Port',
    type: 'input',
    default: '18082',
    private: true
  })

  registerSetting({
    name: 'xmr-rpc-username',
    label: 'RPC Username (optional)',
    type: 'input',
    default: '',
    private: true
  })

  registerSetting({
    name: 'xmr-rpc-password',
    label: 'RPC Password (optional)',
    type: 'input',
    default: '',
    private: true
  })

  registerSetting({
    name: 'min-confirmations',
    label: 'Minimum Confirmations',
    type: 'input',
    default: '1'
  })

  // Initialize XMR wallet
  let wallet: XMRWallet | null = null
  let monitor: PaymentMonitor | null = null
  let io: SocketIOServer | null = null

  const initWallet = async () => {
    const rpcUrl = await settingsManager.getSetting('xmr-rpc-url')
    const rpcPort = await settingsManager.getSetting('xmr-rpc-port')
    const username = await settingsManager.getSetting('xmr-rpc-username')
    const password = await settingsManager.getSetting('xmr-rpc-password')

    wallet = new XMRWallet(
      rpcUrl,
      parseInt(rpcPort),
      username || undefined,
      password || undefined
    )

    // Health check
    const isHealthy = await wallet.healthCheck()
    if (!isHealthy) {
      logger.error('XMR Wallet RPC is not accessible')
      return false
    }

    logger.info('XMR Wallet RPC connected successfully')
    return true
  }

  // Initialize on startup
  await initWallet()

  // Setup Socket.IO for real-time notifications
  const router = getRouter()
  const httpServer = router._router?.stack?.[0]?.handle?.server

  if (httpServer && wallet) {
    io = new SocketIOServer(httpServer, {
      path: '/plugins/xmr-superchat/socket.io',
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    })

    monitor = new PaymentMonitor(wallet)
    
    // Start monitoring payments
    monitor.startMonitoring(10000, (payment) => {
      logger.info(`Payment confirmed: ${payment.txid}`)
      
      // Broadcast to all connected clients watching this video
      io?.to(`video-${payment.videoId}`).emit('superchat', {
        amount: payment.amount,
        message: payment.message,
        txid: payment.txid,
        confirmations: payment.confirmations
      })
    })

    io.on('connection', (socket) => {
      logger.info('Client connected to superchat socket')

      socket.on('join-video', (videoId: string) => {
        socket.join(`video-${videoId}`)
        logger.info(`Client joined video room: ${videoId}`)
      })

      socket.on('leave-video', (videoId: string) => {
        socket.leave(`video-${videoId}`)
      })

      socket.on('disconnect', () => {
        logger.info('Client disconnected from superchat socket')
      })
    })
  }

  // API Routes
  router.get('/health', async (req: any, res: any) => {
    if (!wallet) {
      return res.status(503).json({ error: 'Wallet not initialized' })
    }

    const isHealthy = await wallet.healthCheck()
    res.json({ healthy: isHealthy })
  })

  router.post('/create-payment', async (req: any, res: any) => {
    if (!wallet || !monitor) {
      return res.status(503).json({ error: 'Service not available' })
    }

    try {
      const { videoId, amount, message } = req.body

      if (!videoId || !amount || !message) {
        return res.status(400).json({ error: 'Missing required fields' })
      }

      // Create integrated address with unique payment ID
      const { integrated_address, payment_id } = await wallet.createIntegratedAddress()

      // Register payment for monitoring
      const pendingPayment: PendingPayment = {
        paymentId: payment_id,
        videoId,
        amount: parseFloat(amount),
        message,
        createdAt: Date.now()
      }
      monitor.registerPayment(pendingPayment)

      // Generate QR code
      const qrCodeDataUrl = await QRCode.toDataURL(
        `monero:${integrated_address}?tx_amount=${amount}`,
        { width: 300 }
      )

      res.json({
        address: integrated_address,
        paymentId: payment_id,
        qrCode: qrCodeDataUrl,
        amount
      })
    } catch (error: any) {
      logger.error('Error creating payment:', error)
      res.status(500).json({ error: error.message })
    }
  })

  router.get('/pending-count', (req: any, res: any) => {
    if (!monitor) {
      return res.status(503).json({ error: 'Monitor not initialized' })
    }

    res.json({ count: monitor.getPendingCount() })
  })
}

async function unregister() {
  // Cleanup
}

module.exports = {
  register,
  unregister
}

export {}
