# PeerTube XMR Superchat Plugin

XMR (Monero) スーパーチャット機能をPeerTubeに追加するプラグイン（まだ試作段階）

## 機能

- ✅ XMRでの投げ銭
- ✅ リアルタイム着金通知
- ✅ YouTube風のオーバーレイ表示
- ✅ QRコード生成
- ✅ WebSocket経由のリアルタイム通知
- ✅ 金額に応じた演出の変化

## 必要要件

- PeerTube >= 5.0.0
- monero-wallet-rpc (リモートまたはローカル)
- Node.js >= 18

## セットアップ

### 1. monero-wallet-rpcの起動

#### リモートノードを使う場合（推奨 - 簡単）

```bash
monero-wallet-rpc \
  --daemon-address your-remote-node.onion:18081 \
  --wallet-file /path/to/your/wallet \
  --password "your-password" \
  --rpc-bind-port 18082 \
  --rpc-bind-ip 127.0.0.1 \
  --disable-rpc-login \
  --trusted-daemon
```

Tor経由でOnionノードに接続する場合:

```bash
monero-wallet-rpc \
  --daemon-address your-remote-node.onion:18081 \
  --proxy 127.0.0.1:9050 \
  --wallet-file /path/to/your/wallet \
  --password "your-password" \
  --rpc-bind-port 18082 \
  --rpc-bind-ip 127.0.0.1 \
  --disable-rpc-login \
  --trusted-daemon
```

### 2. （ローカルの場合での）プラグインのビルド

```bash
npm install
npm run build
```

### 3. （ローカルの場合での）プラグインのインストール

```bash
# PeerTubeのCLIを使用
cd /var/www/peertube
sudo -u peertube NODE_CONFIG_DIR=/var/www/peertube/config \
  NODE_ENV=production \
  npm run plugin:install -- --path /path/to/peertube-plugin-xmr-superchat
```

### 4. プラグインの設定

PeerTube管理画面 → プラグイン → XMR Superchat で以下を設定:

- **Monero Wallet RPC URL**: `http://localhost` (または `http://127.0.0.1`)
- **Monero Wallet RPC Port**: `18082`
- **RPC Username**: (オプション - 設定していない場合は空)
- **RPC Password**: (オプション - 設定していない場合は空)
- **Minimum Confirmations**: `1` (推奨)

### 5. 動作確認

1. 任意の動画を再生
2. プレイヤーコントロールに💰ボタンが表示される
3. ボタンをクリックしてモーダルを開く
4. 金額とメッセージを入力
5. QRコードが生成される
6. XMRウォレットから支払い
7. 確認後、動画上にオーバーレイが表示される

## 開発

### ディレクトリ構造

```
peertube-plugin-xmr-superchat/
├── client/                  # クライアント側コード
│   ├── common-client-plugin.ts
│   └── video-watch-client-plugin.ts
├── server/                  # サーバー側コード
│   ├── main.ts
│   └── lib/
│       ├── xmr-wallet.ts
│       └── payment-monitor.ts
├── assets/styles/          # スタイル
│   └── superchat.scss
└── scripts/                # ビルドスクリプト
    └── build-client.mjs
```

### ビルドコマンド

```bash
npm run build              # 全体ビルド
npm run build:client       # クライアントのみ
npm run build:server       # サーバーのみ
npm run build:css          # CSSのみ
npm run clean              # distフォルダを削除
```

## API エンドポイント

### POST /plugins/xmr-superchat/router/create-payment

支払い用のアドレスを生成

**リクエスト:**
```json
{
  "videoId": "video-uuid",
  "amount": "0.1",
  "message": "Great video!"
}
```

**レスポンス:**
```json
{
  "address": "4...",
  "paymentId": "abc123...",
  "qrCode": "data:image/png;base64,...",
  "amount": "0.1"
}
```

### GET /plugins/xmr-superchat/router/health

ウォレットRPCのヘルスチェック

**レスポンス:**
```json
{
  "healthy": true
}
```

## WebSocket Events

### クライアント → サーバー

- `join-video`: 動画ルームに参加 `{ videoId: string }`
- `leave-video`: 動画ルームから退出 `{ videoId: string }`

### サーバー → クライアント

- `superchat`: 新しいスパチャ通知
```json
{
  "amount": 0.1,
  "message": "Great video!",
  "txid": "abc123...",
  "confirmations": 1
}
```

## トラブルシューティング

### ウォレットRPCに接続できない

1. monero-wallet-rpcが起動しているか確認
2. ファイアウォール設定を確認
3. `/plugins/xmr-superchat/router/health` でヘルスチェック

### オーバーレイが表示されない

1. ブラウザのコンソールでエラーを確認
2. WebSocket接続が確立されているか確認
3. 支払いが1確認以上受けているか確認

### QRコードが表示されない

1. サーバーログでエラーを確認
2. `qrcode` パッケージが正しくインストールされているか確認

## ライセンス

AGPL-3.0

## TODO

- [ ] LTC対応
- [ ] BTC対応
- [ ] サウンド通知
- [ ] 管理画面での統計表示
- [ ] 複数通貨対応
- [ ] OBS専用オーバーレイページ
# peertube-plugin-xmr-superchat
