# WebAR名刺プロジェクト

スマートフォンでQRコードを読み取り、名刺をカメラに映すと3Dキャラクターが表示されるWebARアプリケーションです。左・右で別々のモデルを表示し、二人の真ん中にステッカー（文字または画像）を表示できます。

## 📁 プロジェクト構成

```
WebAR/
├── index.html              # メインHTMLファイル
├── main.js                 # メインJavaScriptファイル
├── README.md              # このファイル
├── assets/
│   ├── models/
│   │   ├── person_left.glb   # 左側に表示する3Dモデル
│   │   └── person_right.glb  # 右側に表示する3Dモデル
│   └── targets/
│       └── card.mind       # 画像ターゲット（名刺画像から生成）
├── scripts/
│   └── convert-fbx-to-glb.js    # FBX+PNG → 1つのGLBに変換
└── model/                 # 既存のGLBファイル（参考用）
    ├── Groom_model/       # 変換元例（2 FBX + 1 PNG → merged.glb）
    ├── Meshy_AI_Animation_Running_withSkin.glb
    ├── Meshy_AI_Animation_Walking_withSkin.glb
    └── Meshy_AI_Animation_Wave_One_Hand_withSkin.glb
```

### FBX + PNG → 1つの GLB に変換

指定フォルダ内の FBX ファイル（と同フォルダの PNG 等テクスチャ）を1つの GLB にまとめます。

```bash
npm install
# 入力・出力を指定（出力を省略すると入力フォルダの親ディレクトリに merged.glb を出力）
node scripts/convert-fbx-to-glb.js --input <入力ディレクトリ> [--output <出力ディレクトリ>]
node scripts/convert-fbx-to-glb.js -i model/Groom_model -o dist

# model/Groom_model を入力・出力に使う場合（従来どおり）
npm run convert-groom
```

- **入力**: 指定ディレクトリ内の `.fbx` をマージ。`scripts/convert-fbx-to-glb.js` 先頭の `FBX_INCLUDE_LIST` で含める FBX を限定できる（空の場合はフォルダ内のすべての .fbx を含む）
- **出力**: 指定しなければ入力フォルダと同じ階層（入力の親ディレクトリ）に `merged.glb` を出力

## 🚀 ローカル確認手順

### 1. ファイルの配置

以下のファイルを配置してください：

- `./assets/models/person_left.glb` - 左側に表示する 3D モデル
- `./assets/models/person_right.glb` - 右側に表示する 3D モデル
- `./assets/targets/card.mind` - 画像ターゲット（名刺画像から生成）

### 2. ローカルサーバーの起動

**⚠️ 重要**: WebAR は HTTPS または localhost でのみ動作します。カメラ API のセキュリティ制約のため、`file://`プロトコルでは動作しません。

#### 方法 1: Vite（推奨・手検出あり）

手検出（MediaPipe）は npm パッケージ `@mediapipe/tasks-vision` を使用するため、Vite で起動すると正しく読み込まれます。

```bash
npm install
# canvas 等のネイティブビルドで失敗する場合は --ignore-scripts を付けて再実行
npm install --ignore-scripts
npm run dev
```

ブラウザで `http://localhost:5173` にアクセス

#### 方法 2: Python

```bash
# Python 3の場合
python3 -m http.server 8000

# Python 2の場合
python -m SimpleHTTPServer 8000
```

ブラウザで `http://localhost:8000` にアクセス

#### 方法 3: Node.js (http-server)

```bash
# インストール（初回のみ）
npm install -g http-server

# サーバー起動
http-server -p 8000
```

ブラウザで `http://localhost:8000` にアクセス

#### 方法 4: PHP

```bash
php -S localhost:8000
```

ブラウザで `http://localhost:8000` にアクセス

### 3. スマートフォンでの確認

1. パソコンとスマートフォンを同じ Wi-Fi ネットワークに接続
2. パソコンのローカル IP アドレスを確認

   ```bash
   # macOS/Linux
   ifconfig | grep "inet "

   # Windows
   ipconfig
   ```

3. スマートフォンのブラウザで `http://[パソコンのIPアドレス]:8000` にアクセス
4. カメラの許可を求められたら「許可」を選択
5. QRコードが書かれた画像（またはパンフレット等）をカメラに映す

## 📱 GitHub Pages 公開手順

### 1. リポジトリの準備

```bash
# Gitリポジトリの初期化（まだの場合）
git init

# ファイルをステージング（ビルド成果物は .gitignore で除外してよい）
git add index.html main.js assets/ README.md package.json vite.config.js

# コミット
git commit -m "Initial commit: WebARプロジェクト"

# GitHubリポジトリを作成し、リモートを追加
git remote add origin https://github.com/[ユーザー名]/[リポジトリ名].git

# メインブランチにプッシュ
git branch -M main
git push -u origin main
```

### 2. ビルドしてデプロイ用ファイルを用意

**重要**: このプロジェクトは Vite でビルドした **dist/** を公開する前提です（MediaPipe 等の npm 依存を含むため）。

```bash
npm install
npm run build
```

生成された `dist/` の中身を GitHub Pages で配信します（次のいずれか）。

### 3. GitHub Pages の有効化

**方法 A: gh-pages ブランチに dist をプッシュ**

```bash
# ビルド後、dist の中身を gh-pages ブランチのルートに
npx gh-pages -d dist
# または手動で: dist/ の中身を別ブランチにコピーして push
```

1. GitHub リポジトリの **Settings** → **Pages**
2. **Source**: Deploy from a branch
3. **Branch**: `gh-pages`、**Folder**: `/ (root)` → Save

**方法 B: main の / (root) でソースを公開（非推奨）**

- Branch: `main`、Folder: `/ (root)` の場合、`index.html` のスクリプトは **相対パス**（`./main.js`）にしてあるため、`main.js` の 404 は防げます。
- ただし MediaPipe 等は npm パッケージのため、**ビルドせずにソースのままでは動作しません**。必ず **方法 A** か GitHub Actions でビルドしてから公開してください。

### 4. アクセス URL

数分後、以下の URL でアクセスできます：

```
https://[ユーザー名].github.io/[リポジトリ名]/
```

### 5. QR コードの生成

公開 URL を QR コードに変換して、画像として配布したり、パンフレット等の印刷物に掲載します。

- [QR Code Generator](https://www.qr-code-generator.com/)
- [QRCode Monkey](https://www.qrcode-monkey.com/)

## 🔧 よくあるトラブルと対策

### 1. カメラが起動しない

**症状**: カメラの許可を求められない、またはカメラが起動しない

**対策**:

- ✅ HTTPS でアクセスしているか確認（GitHub Pages は自動で HTTPS）
- ✅ ブラウザの設定でカメラの許可を確認
  - iOS Safari: 設定 → Safari → カメラ
  - Android Chrome: 設定 → サイト設定 → カメラ
- ✅ 他のアプリがカメラを使用していないか確認
- ✅ ブラウザを再起動

### 2. ターゲットが認識されない

**症状**: 名刺を映しても 3D モデルが表示されない

**対策**:

- ✅ 十分な明るさを確保（暗い場所では認識が困難）
- ✅ 印刷物を平らに置く（曲がっていると認識しにくい）
- ✅ カメラとターゲットの距離を調整（20-50cm 程度が目安）
- ✅ ターゲットが画面内に完全に収まっているか確認
- ✅ `card.mind` ファイルが正しく生成されているか確認
- ✅ ブラウザのコンソールでエラーを確認

### 3. モデルが表示されない

**症状**: ターゲットは認識されるが、3D モデルが表示されない

**対策**:

- ✅ `person_left.glb` / `person_right.glb` が `./assets/models/` に正しく配置されているか確認
- ✅ ブラウザのコンソールでエラーメッセージを確認
- ✅ ネットワークタブで GLB ファイルの読み込み状況を確認
- ✅ GLB ファイルが破損していないか確認（別のビューアで開いて確認）

### 4. アニメーションが再生されない

**症状**: モデルは表示されるが、アニメーションが動かない

**対策**:

- ✅ ブラウザのコンソールでアニメーション名のログを確認
  - `📋 利用可能なアニメーション:` のログを確認
  - アニメーション名に `idle`, `wave`, `bow`, `dance` のキーワードが含まれているか確認
- ✅ GLB ファイルにアニメーションが含まれているか確認（Blender 等で確認）
- ✅ アニメーション名を変更するか、`main.js` の `ANIM_KEYWORDS` を調整
- **convert-fbx-to-glb.js で複数 FBX をマージした GLB の場合**: 各 FBX が別々のメッシュ・スケルトンを持っていると、マージ後は「複数のキャラクター」が1ファイルに入った状態になり、再生するアニメーションが表示中のメッシュと紐づかないことがあります。**1体のキャラクターで bow / wave / dance を切り替えたい場合は**、Blender 等で**1本のスケルトンに複数アニメーション（Bow, Wave, Dance）を載せた1つの FBX** を作成し、それを GLB に変換して `person_left.glb` / `person_right.glb` に使うことを推奨します。

### 5. iOS Safari での問題

**症状**: iOS Safari で動作しない、またはパフォーマンスが悪い

**対策**:

- ✅ iOS 11.3 以上を使用（WebAR の要件）
- ✅ Safari の設定で「モバイルデータを節約」をオフ
- ✅ 他のタブを閉じてメモリを確保
- ✅ デバイスを再起動
- ✅ モデルが重すぎる場合（頂点数が多い）、軽量化を検討

### 6. Android Chrome での問題

**症状**: Android Chrome で動作しない

**対策**:

- ✅ Chrome のバージョンが最新か確認
- ✅ WebAR（WebXR）が有効になっているか確認
- ✅ カメラの権限が正しく設定されているか確認
- ✅ 他のアプリがカメラを使用していないか確認

### 7. モデルが重い（読み込みが遅い）

**症状**: モデルの読み込みに時間がかかる

**対策**:

- ✅ GLB ファイルのサイズを確認（10MB 以下を推奨）
- ✅ モデルの軽量化
  - 頂点数を減らす（リトポロジー）
  - テクスチャの解像度を下げる
  - 不要なアニメーションを削除
- ✅ CDN の読み込み速度を確認（ネットワーク環境）

### 8. HTTPS エラー

**症状**: 「HTTPS でアクセスしてください」という警告

**対策**:

- ✅ GitHub Pages は自動で HTTPS になるため、問題なし
- ✅ ローカル開発時は `localhost` または `127.0.0.1` を使用
- ✅ 本番環境では必ず HTTPS を使用

### 9. main.js が 404 になる（GitHub Pages で「読み込み中...」で止まる）

**症状**: `main.js` が 404、画面が「WebARを読み込み中...」のまま

**原因**: 
- `index.html` のスクリプトが絶対パス（`/main.js`）だと、`https://user.github.io/リポジトリ名/` ではルートの `/main.js` を参照して 404 になる
- このプロジェクトは Vite でビルドして **ビルド結果（dist/）** を公開する前提です

**対策**:

1. **スクリプトを相対パスに変更済み**  
   `index.html` では `<script type="module" src="./main.js">` のように相対パス（`./main.js`）を使用しています。

2. **GitHub Pages にはビルド結果をデプロイする**  
   ソースのままではなく、必ずビルドしてから **dist の中身** を公開してください。

   ```bash
   npm run build
   ```

   その後、次のいずれかで公開します。

   - **方法 A（gh-pages ブランチ）**: `dist/` の中身を `gh-pages` ブランチにプッシュし、Settings → Pages で Branch: `gh-pages` / Folder: `/ (root)` を選択
   - **方法 B（docs フォルダ）**: ビルド出力を `docs/` に出すよう `vite.config.js` の `outDir: 'docs'` にし、`docs/` をコミット。Settings → Pages で Branch: `main` / Folder: `docs` を選択
   - **方法 C（GitHub Actions）**: ワークフローで `npm run build` を実行し、生成した `dist/` を GitHub Pages にデプロイ

### 10. パスの問題（GitHub Pages のサブパス配信）

**症状**: GitHub Pages で画像やモデルが読み込まれない

**対策**:

- ✅ すべてのパスを相対パス（`./assets/...`）で記述済み
- ✅ `vite.config.js` で `base: "./"` を指定しているため、サブパス（`/リポジトリ名/`）配信でも動作

### 11. デバッグ方法

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
  dance: ["dance", "dancing"],
};
```

### 中央ステッカー（二人の真ん中）の変更

`main.js` の `STICKER_CONFIG` を編集：

- **type: `'text'`** … 文字を表示。`text` / `fontSize` / `textColor` / `backgroundColor` で見た目を変更
- **type: `'image'`** … 画像を表示。`imagePath` に `./assets/sticker.png` などを指定
- **position** … 中央は `x: 0`。`y` で上下、`z` で前後
- **width / height** … ステッカーの大きさ（メートル）

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

- [MindAR 公式ドキュメント](https://hiukim.github.io/mind-ar-js-doc/)
- [Three.js 公式ドキュメント](https://threejs.org/docs/)
- [glTF 仕様](https://www.khronos.org/gltf/)

## 📄 ライセンス

このプロジェクトは MIT ライセンスの下で公開されています。
