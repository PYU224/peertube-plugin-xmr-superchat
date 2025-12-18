# ポート設定とファイアウォール設定ガイド

## ポート概要

このプラグインで使用するポートと通信方向について説明します。

## 通信フロー図

```
┌─────────────────┐          ┌──────────────────┐          ┌─────────────────┐
│   視聴者の      │          │   PeerTube       │          │ monero-wallet-  │
│   ブラウザ      │          │   サーバー       │          │     rpc         │
└─────────────────┘          └──────────────────┘          └─────────────────┘
        │                            │                             │
        │ (1) HTTPS 443             │                             │
        │ Video + Plugin UI          │                             │
        │◄──────────────────────────►│                             │
        │                            │                             │
        │ (2) WebSocket              │                             │
        │ /plugins/.../socket.io     │                             │
        │◄──────────────────────────►│                             │
        │                            │                             │
        │                            │ (3) HTTP 18082             │
        │                            │ JSON-RPC API               │
        │                            │ (Outgoing接続)              │
        │                            ├────────────────────────────►│
        │                            │                             │
        │                            │◄────────────────────────────┤
        │                            │                             │
                                     │                             │
                              ┌──────▼─────────┐                  │
                              │ Monero Network │                  │
                              │  (P2P: 18081)  │                  │
                              └────────────────┘                  │
                                                                   │
                              Onion Node (例)                      │
                              xxx.onion:18081 ◄───────────────────┘
                                     ▲
                                     │
                                  Tor Proxy
                                  (SOCKS5: 9050)
```

## 各ポートの詳細

### 1. PeerTubeサーバー側

#### ポート 443 (HTTPS) - **INCOMING接続**
- **用途**: 視聴者のブラウザからの接続
- **通信方向**: 外部 → PeerTubeサーバー
- **必須**: はい
- **ファイアウォール**: **ALLOW INCOMING**

```bash
# ufwの例
sudo ufw allow 443/tcp
```

PeerTubeの動画視聴とプラグインのUIに使用されます。

#### WebSocket (同じく443/HTTPS) - **INCOMING接続**
- **用途**: リアルタイムスパチャ通知
- **パス**: `/plugins/xmr-superchat/socket.io`
- **通信方向**: ブラウザ → PeerTubeサーバー
- **ファイアウォール**: 443が開いていればOK

HTTPSと同じポートを使用するため、追加のポート開放は不要です。

---

### 2. monero-wallet-rpc側

#### ポート 18082 (JSON-RPC) - **OUTGOING接続のみ**
- **用途**: PeerTubeサーバーからのウォレット操作
- **通信方向**: PeerTubeサーバー → wallet-rpc
- **必須**: はい
- **ファイアウォール**: **DENY INCOMING / ALLOW OUTGOING**

**重要**: このポートは**外部に公開する必要はありません**。

```bash
# wallet-rpcの起動例（localhostのみリスニング）
monero-wallet-rpc \
  --rpc-bind-ip 127.0.0.1 \
  --rpc-bind-port 18082 \
  --disable-rpc-login
```

`--rpc-bind-ip 127.0.0.1` により、localhostからのみ接続可能になります。

#### ファイアウォール設定例

```bash
# wallet-rpcを別サーバーで動かす場合でも、
# 外部からの18082へのアクセスは拒否
sudo ufw deny 18082/tcp

# PeerTubeサーバーからのoutgoing接続は自動的に許可される
# （デフォルトでoutgoingは許可されている）
```

---

### 3. Moneroノード接続

#### Onionリモートノード経由の場合

```bash
monero-wallet-rpc \
  --daemon-address xxxxx.onion:18081 \
  --proxy 127.0.0.1:9050 \
  --rpc-bind-ip 127.0.0.1 \
  --rpc-bind-port 18082 \
  --trusted-daemon
```

**通信フロー:**
1. wallet-rpc → Torプロキシ (127.0.0.1:9050) - **OUTGOING**
2. Torプロキシ → Onionノード (xxx.onion:18081) - **OUTGOING**

**必要なファイアウォール設定:**
- なし（すべてOUTGOING接続のため）

#### ローカルノード (monerod) の場合

```bash
# monerodを同じサーバーで動かす場合
monerod \
  --rpc-bind-ip 127.0.0.1 \
  --rpc-bind-port 18089
```

- **ポート 18089**: wallet-rpcがmonerodと通信 - **OUTGOING**
- **ポート 18081**: P2Pネットワーク - **INCOMING/OUTGOING** (必要に応じて)

---

## セットアップ別のファイアウォール設定

### パターンA: すべて同一サーバー（最もシンプル）

```
┌─────────────────────────────────────┐
│  同一サーバー (例: VPS)              │
│                                     │
│  ├─ PeerTube (:443)                │
│  └─ monero-wallet-rpc (:18082)     │
└─────────────────────────────────────┘
```

**必要なファイアウォール設定:**
```bash
sudo ufw allow 443/tcp    # PeerTubeのみ
sudo ufw deny 18082/tcp   # wallet-rpcは外部非公開
```

wallet-rpcは`127.0.0.1`でリスニングし、PeerTubeから`localhost:18082`で接続。

---

### パターンB: wallet-rpcを別サーバーで運用

```
┌──────────────────┐        ┌──────────────────┐
│  PeerTube Server │        │  Wallet Server   │
│  (:443)          │        │  (:18082)        │
└──────────────────┘        └──────────────────┘
        │                           ▲
        └───────────────────────────┘
          PeerTubeからの接続 (OUTGOING)
```

**PeerTubeサーバー:**
```bash
sudo ufw allow 443/tcp
# 18082へのoutgoing接続は自動的に許可される
```

**Walletサーバー:**
```bash
# PeerTubeサーバーのIPからのみ許可（セキュリティ向上）
sudo ufw allow from <PeerTubeサーバーのIP> to any port 18082 proto tcp

# または、VPN/Wireguard経由で接続
```

monero-wallet-rpcの起動:
```bash
monero-wallet-rpc \
  --rpc-bind-ip 0.0.0.0 \
  --rpc-bind-port 18082 \
  --rpc-login username:password  # 認証必須！
```

**プラグイン設定:**
- RPC URL: `http://wallet-server-ip`
- RPC Port: `18082`
- RPC Username: `username`
- RPC Password: `password`

---

### パターンC: すべてローカル + Onionノード (プライバシー最優先)

```
┌─────────────────────────────────────┐
│  サーバー                            │
│  ├─ PeerTube (:443)                │
│  ├─ monero-wallet-rpc (:18082)     │
│  └─ Tor Proxy (:9050)              │
└─────────────────────────────────────┘
              │
              │ OUTGOING only
              ▼
        xxx.onion:18081
       (Moneroノード)
```

**必要なファイアウォール設定:**
```bash
sudo ufw allow 443/tcp    # PeerTubeのみ
# その他のポートは外部非公開
```

すべての通信がOUTGOINGのため、追加のポート開放は不要。

---

## よくある質問

### Q1: wallet-rpcのポート18082を外部に公開する必要はありますか？

**A: いいえ、不要です。**

PeerTubeサーバーからのOUTGOING接続のみなので、ファイアウォールで**DENY INCOMING**にしても問題ありません。

### Q2: "deny incoming but allow outgoing" で接続できますか？

**A: はい、できます。**

```bash
# デフォルトポリシー
sudo ufw default deny incoming   # 外部からの接続を拒否
sudo ufw default allow outgoing  # 内部からの接続を許可

# PeerTubeのみ公開
sudo ufw allow 443/tcp

# これで以下が実現:
# ✅ ブラウザ → PeerTube (443) - OK
# ✅ PeerTube → wallet-rpc (18082) - OK (outgoing)
# ❌ 外部 → wallet-rpc (18082) - ブロック
```

### Q3: VPNやWireguardを使った方が良いですか？

**A: 別サーバーで運用する場合は推奨します。**

PeerTubeとwallet-rpcが別サーバーの場合:
- VPN/Wireguardでプライベートネットワークを構築
- 18082ポートはVPN内のみでリスニング
- インターネット側には公開しない

### Q4: Tor経由でwallet-rpcに接続できますか？

**A: 可能ですが、通常は不要です。**

wallet-rpcがOnionサービスとして公開されていれば接続可能ですが、通常はlocalhost接続で十分です。

---

## セキュリティベストプラクティス

1. **最小権限の原則**
   - 必要なポートのみ開放
   - wallet-rpcは外部非公開

2. **認証の有効化**
   - 別サーバーの場合は必ず`--rpc-login`を使用

3. **TLS/SSL**
   - 別サーバーの場合はリバースプロキシ経由でHTTPS接続

4. **ファイアウォールルール**
   - 特定IPからのみ許可（別サーバーの場合）
   - または、VPN/Wireguard使用

5. **ログ監視**
   - wallet-rpcのアクセスログを定期的に確認

---

## トラブルシューティング

### 接続できない場合のチェックリスト

```bash
# 1. wallet-rpcが起動しているか
ps aux | grep monero-wallet-rpc

# 2. ポートがリスニングしているか
sudo netstat -tlnp | grep 18082

# 3. localhostから接続テスト
curl http://localhost:18082/json_rpc \
  -d '{"jsonrpc":"2.0","id":"0","method":"get_balance"}' \
  -H 'Content-Type: application/json'

# 4. ファイアウォール状態確認
sudo ufw status verbose

# 5. PeerTubeからの接続テスト
# PeerTubeサーバーから
curl http://<wallet-server-ip>:18082/json_rpc \
  -d '{"jsonrpc":"2.0","id":"0","method":"get_balance"}' \
  -H 'Content-Type: application/json'
```

### よくあるエラーと対処法

**エラー**: `ECONNREFUSED`
- wallet-rpcが起動していない
- ファイアウォールでブロックされている
- IPアドレスが間違っている

**エラー**: `401 Unauthorized`
- RPC認証情報が間違っている
- プラグイン設定でusername/passwordを確認

**エラー**: タイムアウト
- ネットワーク接続の問題
- ファイアウォールでブロックされている可能性

---

## まとめ

### 必須ポート開放

- ✅ **PeerTube 443/tcp** - ALLOW INCOMING
- ❌ **wallet-rpc 18082** - DENY INCOMING (localhostのみ)

### 通信方向

- ブラウザ → PeerTube: **INCOMING**
- PeerTube → wallet-rpc: **OUTGOING**
- wallet-rpc → Moneroノード: **OUTGOING**

### セキュリティ

PYUさんの理解通り、**deny incoming + allow outgoing** で完全に動作します！
