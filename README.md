# WebAR名刺プロジェクト

スマートフォンでQRコードを読み取り、名刺をカメラに映すと3Dキャラクターが表示されるWebARアプリケーションです。

## 📁 プロジェクト構成

```
WebAR/
├── index.html              # メインHTMLファイル
├── main.js                 # メインJavaScriptファイル
├── README.md              # このファイル
├── assets/
│   ├── models/
│   │   └── person.glb     # 3Dモデル（Meshy出力、アニメーション付き）
│   └── targets/
│       └── card.mind       # 画像ターゲット（名刺画像から生成）
└── model/                 # 既存のGLBファイル（参考用）
    ├── Meshy_AI_Animation_Running_withSkin.glb
    ├── Meshy_AI_Animation_Walking_withSkin.glb
    └── Meshy_AI_Animation_Wave_One_Hand_withSkin.glb
```

## 🚀 ローカル確認手順

### 1. ファイルの配置

以下のファイルを配置してください：

- `./assets/models/person.glb` - 3Dモデル（Meshy出力、アニメーション付き）
- `./assets/targets/card.mind` - 画像ターゲット（名刺画像から生成）

### 2. ローカルサーバーの起動

**⚠️ 重要**: WebARはHTTPSまたはlocalhostでのみ動作します。カメラAPIのセキュリティ制約のため、`file://`プロトコルでは動作しません。

#### 方法1: Python（推奨）

```bash
# Python 3の場合
python3 -m http.server 8000

# Python 2の場合
python -m SimpleHTTPServer 8000
```

ブラウザで `http://localhost:8000` にアクセス

#### 方法2: Node.js (http-server)

```bash
# インストール（初回のみ）
npm install -g http-server

# サーバー起動
http-server -p 8000
```

ブラウザで `http://localhost:8000` にアクセス

#### 方法3: PHP

```bash
php -S localhost:8000
```

ブラウザで `http://localhost:8000` にアクセス

### 3. スマートフォンでの確認

1. パソコンとスマートフォンを同じWi-Fiネットワークに接続
2. パソコンのローカルIPアドレスを確認

   ```bash
   # macOS/Linux
   ifconfig | grep "inet "

   # Windows
   ipconfig
   ```

3. スマートフォンのブラウザで `http://[パソコンのIPアドレス]:8000` にアクセス
4. カメラの許可を求められたら「許可」を選択
5. 名刺をカメラに映す

## 📱 GitHub Pages 公開手順

### 1. リポジトリの準備

```bash
# Gitリポジトリの初期化（まだの場合）
git init

# ファイルをステージング
git add index.html main.js assets/ README.md

# コミット
git commit -m "Initial commit: WebAR名刺プロジェクト"

# GitHubリポジトリを作成し、リモートを追加
git remote add origin https://github.com/[ユーザー名]/[リポジトリ名].git

# メインブランチにプッシュ
git branch -M main
git push -u origin main
```

### 2. GitHub Pagesの有効化

1. GitHubリポジトリのページにアクセス
2. **Settings** → **Pages** を開く
3. **Source** で **Deploy from a branch** を選択
4. **Branch** で `main` を選択、フォルダは `/ (root)` を選択
5. **Save** をクリック

### 3. アクセスURL

数分後、以下のURLでアクセスできます：

```
https://[ユーザー名].github.io/[リポジトリ名]/
```

### 4. QRコードの生成

公開URLをQRコードに変換して名刺に印刷します。

- [QR Code Generator](https://www.qr-code-generator.com/)
- [QRCode Monkey](https://www.qrcode-monkey.com/)

## 🔧 よくあるトラブルと対策

### 1. カメラが起動しない

**症状**: カメラの許可を求められない、またはカメラが起動しない

**対策**:

- ✅ HTTPSでアクセスしているか確認（GitHub Pagesは自動でHTTPS）
- ✅ ブラウザの設定でカメラの許可を確認
  - iOS Safari: 設定 → Safari → カメラ
  - Android Chrome: 設定 → サイト設定 → カメラ
- ✅ 他のアプリがカメラを使用していないか確認
- ✅ ブラウザを再起動

### 2. ターゲットが認識されない

**症状**: 名刺を映しても3Dモデルが表示されない

**対策**:

- ✅ 十分な明るさを確保（暗い場所では認識が困難）
- ✅ 名刺を平らに置く（曲がっていると認識しにくい）
- ✅ カメラと名刺の距離を調整（20-50cm程度が最適）
- ✅ 名刺が画面内に完全に収まっているか確認
- ✅ `card.mind` ファイルが正しく生成されているか確認
- ✅ ブラウザのコンソールでエラーを確認

### 3. モデルが表示されない

**症状**: ターゲットは認識されるが、3Dモデルが表示されない

**対策**:

- ✅ `person.glb` ファイルが `./assets/models/` に正しく配置されているか確認
- ✅ ブラウザのコンソールでエラーメッセージを確認
- ✅ ネットワークタブでGLBファイルの読み込み状況を確認
- ✅ GLBファイルが破損していないか確認（別のビューアで開いて確認）

### 4. アニメーションが再生されない

**症状**: モデルは表示されるが、アニメーションが動かない

**対策**:

- ✅ ブラウザのコンソールでアニメーション名のログを確認
  - `📋 利用可能なアニメーション:` のログを確認
  - アニメーション名に `idle`, `wave`, `bow` のキーワードが含まれているか確認
- ✅ GLBファイルにアニメーションが含まれているか確認（Blender等で確認）
- ✅ アニメーション名を変更するか、`main.js` の `ANIM_KEYWORDS` を調整

### 5. iOS Safariでの問題

**症状**: iOS Safariで動作しない、またはパフォーマンスが悪い

**対策**:

- ✅ iOS 11.3以上を使用（WebARの要件）
- ✅ Safariの設定で「モバイルデータを節約」をオフ
- ✅ 他のタブを閉じてメモリを確保
- ✅ デバイスを再起動
- ✅ モデルが重すぎる場合（頂点数が多い）、軽量化を検討

### 6. Android Chromeでの問題

**症状**: Android Chromeで動作しない

**対策**:

- ✅ Chromeのバージョンが最新か確認
- ✅ WebAR（WebXR）が有効になっているか確認
- ✅ カメラの権限が正しく設定されているか確認
- ✅ 他のアプリがカメラを使用していないか確認

### 7. モデルが重い（読み込みが遅い）

**症状**: モデルの読み込みに時間がかかる

**対策**:

- ✅ GLBファイルのサイズを確認（10MB以下を推奨）
- ✅ モデルの軽量化
  - 頂点数を減らす（リトポロジー）
  - テクスチャの解像度を下げる
  - 不要なアニメーションを削除
- ✅ CDNの読み込み速度を確認（ネットワーク環境）

### 8. HTTPSエラー

**症状**: 「HTTPSでアクセスしてください」という警告

**対策**:

- ✅ GitHub Pagesは自動でHTTPSになるため、問題なし
- ✅ ローカル開発時は `localhost` または `127.0.0.1` を使用
- ✅ 本番環境では必ずHTTPSを使用

### 9. パスの問題（GitHub Pagesのサブパス配信）

**症状**: GitHub Pagesで画像やモデルが読み込まれない

**対策**:

- ✅ すべてのパスを相対パス（`./assets/...`）で記述済み
- ✅ 絶対パス（`/assets/...`）は使用していないため、サブパス配信でも動作

### 10. デバッグ方法

**ブラウザの開発者ツールを使用**:

1. **Chrome/Edge**: `F12` または `Ctrl+Shift+I` (Mac: `Cmd+Option+I`)
2. **Safari**: 開発メニューを有効化 → `Cmd+Option+I`
3. **コンソールタブ**でエラーメッセージを確認
4. **ネットワークタブ**でファイルの読み込み状況を確認

**ログの確認**:

- `✅` マーク: 正常に動作
- `⚠️` マーク: 警告（動作はするが注意が必要）
- `❌` マーク: エラー（動作しない）

## 📝 カスタマイズ

### モデルの配置を変更

`main.js` の `MODEL_CONFIG` を編集：

```javascript
const MODEL_CONFIG = {
  left: {
    position: { x: -0.15, y: 0, z: 0 }, // x: 左右, y: 上下, z: 前後
    scale: 0.8, // スケール（大きさ）
    rotation: { x: 0, y: 0, z: 0 }, // 回転（ラジアン）
  },
  right: {
    position: { x: 0.15, y: 0, z: 0 },
    scale: 0.8,
    rotation: { x: 0, y: 0, z: 0 },
  },
};
```

### アニメーション名のキーワードを変更

`main.js` の `ANIM_KEYWORDS` を編集：

```javascript
const ANIM_KEYWORDS = {
  idle: ["idle", "stand", "rest", "default"],
  wave: ["wave", "waving", "hand", "hello", "hi"],
  bow: ["bow", "bowing", "bow_down", "respect"],
};
```

### シーケンス再生のタイミングを変更

`main.js` の `onTargetFound()` 関数を編集：

```javascript
function onTargetFound() {
  setTimeout(() => {
    playAnimation(1, "wave", true); // 右側: wave
  }, 0);

  setTimeout(() => {
    playAnimation(0, "bow", true); // 左側: bow（0.5秒後）
  }, 500); // この数値を変更してタイミングを調整
}
```

## 📚 参考資料

- [MindAR公式ドキュメント](https://hiukim.github.io/mind-ar-js-doc/)
- [Three.js公式ドキュメント](https://threejs.org/docs/)
- [glTF仕様](https://www.khronos.org/gltf/)

## 📄 ライセンス

このプロジェクトはMITライセンスの下で公開されています。
