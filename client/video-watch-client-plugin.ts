import { io, Socket } from 'socket.io-client'

interface SuperchatPayment {
  amount: number
  message: string
  txid: string
  confirmations: number
}

function register({ registerHook, peertubeHelpers }: any) {
  let socket: Socket | null = null
  let currentVideoId: string | null = null

  // Hook into video player loaded
  registerHook({
    target: 'action:video-watch.player.loaded',
    handler: ({ player, videojs, video }: any) => {
      currentVideoId = video.uuid
      
      // Connect to Socket.IO
      const socketUrl = window.location.origin
      socket = io(socketUrl, {
        path: '/plugins/xmr-superchat/socket.io'
      })

      socket.on('connect', () => {
        console.log('Connected to superchat socket')
        if (currentVideoId) {
          socket?.emit('join-video', currentVideoId)
        }
      })

      socket.on('superchat', (payment: SuperchatPayment) => {
        console.log('Superchat received:', payment)
        showSuperchatOverlay(player, payment)
      })

      // Add superchat button to player controls
      addSuperchatButton(player, videojs, video)
    }
  })

  // Cleanup on video change
  registerHook({
    target: 'action:video-watch.video.loaded',
    handler: ({ video }: any) => {
      if (currentVideoId && currentVideoId !== video.uuid) {
        socket?.emit('leave-video', currentVideoId)
        currentVideoId = video.uuid
        socket?.emit('join-video', currentVideoId)
      }
    }
  })

  function addSuperchatButton(player: any, videojs: any, video: any) {
    const Button = videojs.getComponent('Button')
    
    class SuperchatButton extends Button {
      constructor(player: any, options: any) {
        super(player, options)
        this.controlText('Send Superchat')
      }

      buildCSSClass() {
        return `vjs-superchat-button ${super.buildCSSClass()}`
      }

      handleClick() {
        openSuperchatModal(video, player)
      }
    }

    videojs.registerComponent('SuperchatButton', SuperchatButton)
    player.controlBar.addChild('SuperchatButton', {}, 10)
  }

  function openSuperchatModal(video: any, player: any) {
    // Create modal backdrop
    const backdrop = document.createElement('div')
    backdrop.className = 'superchat-modal-backdrop'
    backdrop.onclick = () => backdrop.remove()

    // Create modal
    const modal = document.createElement('div')
    modal.className = 'superchat-modal'
    modal.onclick = (e) => e.stopPropagation()

    modal.innerHTML = `
      <div class="superchat-modal-header">
        <h2>💰 Send Superchat</h2>
        <button class="close-btn">&times;</button>
      </div>
      <div class="superchat-modal-body">
        <div class="test-section">
          <button class="test-btn" id="test-superchat">🎭 テスト演出を表示</button>
          <p class="test-hint">実際の支払いなしで演出を確認できます</p>
        </div>
        <div class="divider">または</div>
        <div class="form-group">
          <label>Amount (XMR)</label>
          <input type="number" id="superchat-amount" step="0.01" min="0.01" placeholder="0.1" />
        </div>
        <div class="form-group">
          <label>Message</label>
          <textarea id="superchat-message" maxlength="200" placeholder="Your message..."></textarea>
          <span class="char-count">0/200</span>
        </div>
        <button class="generate-btn" id="generate-payment">Generate Payment</button>
        
        <div class="payment-info" id="payment-info" style="display: none;">
          <div class="qr-code" id="qr-code"></div>
          <div class="address-section">
            <label>Payment Address:</label>
            <div class="address-display" id="payment-address"></div>
            <button class="copy-btn" id="copy-address">Copy Address</button>
          </div>
          <p class="waiting-text">Waiting for payment confirmation...</p>
        </div>
      </div>
    `

    backdrop.appendChild(modal)
    document.body.appendChild(backdrop)

    // Event listeners
    const closeBtn = modal.querySelector('.close-btn')
    closeBtn?.addEventListener('click', () => backdrop.remove())

    // Test button
    const testBtn = modal.querySelector('#test-superchat')
    testBtn?.addEventListener('click', () => {
      // Show test amounts selection
      const testAmounts = [
        { amount: 0.01, label: '0.01 XMR (小)' },
        { amount: 0.1, label: '0.1 XMR (中)' },
        { amount: 1.0, label: '1.0 XMR (大)' }
      ]
      
      const testSelection = document.createElement('div')
      testSelection.className = 'test-selection'
      testSelection.innerHTML = `
        <p>テストする金額を選択:</p>
        ${testAmounts.map(t => `
          <button class="test-amount-btn" data-amount="${t.amount}">${t.label}</button>
        `).join('')}
      `
      
      const testSection = modal.querySelector('.test-section')
      testSection?.appendChild(testSelection)
      
      testSelection.querySelectorAll('.test-amount-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const amount = parseFloat(btn.getAttribute('data-amount') || '0.1')
          const testPayment: SuperchatPayment = {
            amount,
            message: 'これはテスト表示です / This is a test display',
            txid: 'test-' + Date.now(),
            confirmations: 1
          }
          showSuperchatOverlay(player, testPayment)
          backdrop.remove()
        })
      })
    })

    const messageInput = modal.querySelector('#superchat-message') as HTMLTextAreaElement
    const charCount = modal.querySelector('.char-count')
    messageInput?.addEventListener('input', () => {
      if (charCount) {
        charCount.textContent = `${messageInput.value.length}/200`
      }
    })

    const generateBtn = modal.querySelector('#generate-payment')
    generateBtn?.addEventListener('click', async () => {
      const amount = (document.getElementById('superchat-amount') as HTMLInputElement)?.value
      const message = (document.getElementById('superchat-message') as HTMLTextAreaElement)?.value

      if (!amount || !message) {
        alert('Please fill in all fields')
        return
      }

      try {
        generateBtn.textContent = 'Generating...'
        generateBtn.setAttribute('disabled', 'true')

        const response = await fetch('/plugins/xmr-superchat/router/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId: video.uuid,
            amount,
            message
          })
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to create payment')
        }

        // Show payment info
        const paymentInfo = document.getElementById('payment-info')
        const qrCode = document.getElementById('qr-code')
        const paymentAddress = document.getElementById('payment-address')

        if (qrCode) qrCode.innerHTML = `<img src="${data.qrCode}" alt="QR Code" />`
        if (paymentAddress) paymentAddress.textContent = data.address
        if (paymentInfo) paymentInfo.style.display = 'block'

        // Copy address button
        const copyBtn = document.getElementById('copy-address')
        copyBtn?.addEventListener('click', () => {
          navigator.clipboard.writeText(data.address)
          copyBtn.textContent = 'Copied!'
          setTimeout(() => {
            copyBtn.textContent = 'Copy Address'
          }, 2000)
        })

        // Hide form
        const formGroups = modal.querySelectorAll('.form-group')
        formGroups.forEach(group => (group as HTMLElement).style.display = 'none')
        generateBtn.style.display = 'none'

      } catch (error: any) {
        alert(`Error: ${error.message}`)
        generateBtn.textContent = 'Generate Payment'
        generateBtn.removeAttribute('disabled')
      }
    })
  }

  function showSuperchatOverlay(player: any, payment: SuperchatPayment) {
    const overlay = document.createElement('div')
    overlay.className = 'superchat-overlay'
    
    const style = getSuperchatStyle(payment.amount)
    overlay.style.background = style.gradient
    
    overlay.innerHTML = `
      <div class="superchat-amount">${payment.amount} XMR</div>
      <div class="superchat-message">${escapeHtml(payment.message)}</div>
      <div class="superchat-confirmations">${payment.confirmations} confirmations</div>
    `

    player.el().appendChild(overlay)

    // Animate in
    setTimeout(() => overlay.classList.add('show'), 10)

    // Remove after duration
    setTimeout(() => {
      overlay.classList.remove('show')
      setTimeout(() => overlay.remove(), 500)
    }, style.duration)
  }

  function getSuperchatStyle(amount: number) {
    if (amount >= 1.0) {
      return {
        gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        duration: 30000
      }
    } else if (amount >= 0.1) {
      return {
        gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        duration: 15000
      }
    } else {
      return {
        gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        duration: 10000
      }
    }
  }

  function escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}

export { register }
