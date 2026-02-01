// ============================================
// WebAR名刺 - メインスクリプト（ES Module）
// ============================================

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MindARThree } from "mindar-image-three";

// グローバル変数
let mindarThree = null;
let scene = null;
let camera = null;
let renderer = null;
let anchors = [];
let models = []; // [左モデル, 右モデル]
let mixers = []; // [左ミキサー, 右ミキサー]
let animations = []; // [[左アニメ], [右アニメ]]
let currentAnimations = [null, null]; // 現在再生中のアニメーション
let clock = null;
let stickerMesh = null; // 中央ステッカー（アニメーションに応じてテキスト更新用）

// アニメーション名のキーワード（探索用）
const ANIM_KEYWORDS = {
  idle: ["idle", "stand", "rest", "default"],
  wave: ["wave", "waving", "hand", "hello", "hi"],
  bow: ["bow", "bowing", "bow_down", "respect"],
  dance: ["dance", "dancing"],
};

// 左・右で別々の .glb を指定（2体別々に表示）
const MODEL_PATHS = {
  left: "./assets/models/person_left.glb", // 左側に表示するモデル
  right: "./assets/models/person_right.glb", // 右側に表示するモデル
};

// モデルの配置設定
const MODEL_CONFIG = {
  left: {
    position: { x: -0.15, y: 0, z: 0 }, // 名刺の左側（単位: メートル）
    scale: 0.8,
    rotation: { x: 0, y: 0, z: 0 },
  },
  right: {
    position: { x: 0.15, y: 0, z: 0 }, // 名刺の右側
    scale: 0.8,
    rotation: { x: 0, y: 0, z: 0 },
  },
};

// 中央ステッカー設定（二人の真ん中に表示）
// type: 'image' = 画像ファイル | 'text' = 文字（Canvasで描画）
const STICKER_CONFIG = {
  type: "text", // 'image' または 'text'
  // 画像の場合
  imagePath: "./assets/sticker.png", // ステッカー画像（PNG/JPEG、透過可）
  // 文字の場合
  text: "Hello!", // 表示する文字
  fontSize: 48, // フォントサイズ（px）
  fontFamily: "sans-serif", // フォント
  textColor: "#ffffff",
  backgroundColor: "rgba(0, 0, 0, 0.6)", // 背景（透過可）
  // 共通
  position: { x: 0, y: 0.05, z: 0 }, // 中央・やや上（二人の間）
  width: 0.08, // ステッカーの幅（メートル）
  height: 0.04, // 高さ（画像はアスペクト比で自動）
  rotation: { x: 0, y: 0, z: 0 }, // 向きが合わないときはここで調整（ラジアン）
};

// アニメーション別ステッカー文言（bow / wave / dance で切り替え）
const STICKER_TEXTS = {
  idle: "Hello!",
  bow: "来ていただいてありがとうございます",
  wave: "こんにちは",
  dance: "ぜひ楽しんでください",
};

// ============================================
// 初期化
// ============================================
async function init() {
  try {
    // MindARの初期化
    mindarThree = new MindARThree({
      container: document.getElementById("container"),
      imageTargetSrc: "./assets/targets/card.mind", // 画像ターゲットファイル
      maxTrack: 1, // 同時追跡数
      uiLoading: "no", // MindARのデフォルトローディングを無効化
      uiScanning: "no", // MindARのデフォルトスキャンUIを無効化
      filterMinCF: 0.0001, // トラッキングの安定性（低いほど敏感）
      filterBeta: 10000, // トラッキングの滑らかさ（高いほど滑らか）
    });

    const { renderer: r, scene: s, camera: c } = mindarThree;
    renderer = r;
    scene = s;
    camera = c;
    clock = new THREE.Clock();

    // レンダラーの設定
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // ライトの追加
    setupLights();

    // アンカーの作成
    const anchor = mindarThree.addAnchor(0);
    anchors.push(anchor);

    // 2体分の .glb を読み込み（左・右別ファイル）
    await loadModels(anchor);

    // 中央ステッカー（二人の真ん中）を追加
    const sticker = await createSticker();
    if (sticker) {
      anchor.group.add(sticker);
      stickerMesh = sticker;
    }

    // イベントリスナーの設定
    setupEventListeners();

    // アニメーションループの開始
    mindarThree.start();
    renderer.setAnimationLoop(() => {
      updateAnimations();
      renderer.render(scene, camera);
    });

    // ローディング表示を非表示
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("info").classList.remove("hidden");
    document.getElementById("controls").classList.remove("hidden");

    console.log("✅ WebAR初期化完了");
  } catch (error) {
    console.error("❌ 初期化エラー:", error);
    showError("初期化に失敗しました: " + error.message);
  }
}

// ============================================
// ライトの設定
// ============================================
function setupLights() {
  // 環境光（全体を明るく）
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  // 指向性ライト（太陽光のような光）
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);

  // ポイントライト（補助的な光）
  const pointLight = new THREE.PointLight(0xffffff, 0.5);
  pointLight.position.set(-1, 0.5, 1);
  scene.add(pointLight);
}

// ============================================
// 1つの .glb を読み込む（Promise）
// ============================================
function loadOneGLB(url) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => resolve(gltf),
      (progress) => {
        if (progress.total) {
          const percent = (progress.loaded / progress.total) * 100;
          console.log(`📦 読み込み中: ${url} ${percent.toFixed(0)}%`);
        }
      },
      (error) => reject(error),
    );
  });
}

// ============================================
// 2体分の .glb を同時に読み込み
// ============================================
async function loadModels(anchor) {
  const [gltfLeft, gltfRight] = await Promise.all([loadOneGLB(MODEL_PATHS.left), loadOneGLB(MODEL_PATHS.right)]);

  // 左（index 0）
  console.log("✅ 左モデル読み込み完了:", MODEL_PATHS.left);
  logAnimations(gltfLeft, "左");
  const modelLeft = gltfLeft.scene;
  setupModel(modelLeft, MODEL_CONFIG.left, 0, gltfLeft.animations);
  anchor.group.add(modelLeft);
  models.push(modelLeft);

  // 右（index 1）
  console.log("✅ 右モデル読み込み完了:", MODEL_PATHS.right);
  logAnimations(gltfRight, "右");
  const modelRight = gltfRight.scene;
  setupModel(modelRight, MODEL_CONFIG.right, 1, gltfRight.animations);
  anchor.group.add(modelRight);
  models.push(modelRight);

  // ターゲット認識/見失いのイベント設定
  anchor.onTargetFound = () => {
    console.log("🎯 ターゲット認識");
    onTargetFound();
  };
  anchor.onTargetLost = () => {
    console.log("❌ ターゲット見失い");
    onTargetLost();
  };
}

// ============================================
// 文字から Canvas テクスチャを生成（ステッカー用）
// ============================================
function createTextTexture(text) {
  const cfg = STICKER_CONFIG;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const padding = 20;
  const font = `bold ${cfg.fontSize}px ${cfg.fontFamily}`;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = cfg.fontSize;
  canvas.width = Math.ceil(textWidth + padding * 2);
  canvas.height = Math.ceil(textHeight + padding * 2);
  ctx.fillStyle = cfg.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = font;
  ctx.fillStyle = cfg.textColor;
  ctx.textBaseline = "middle";
  ctx.fillText(text, padding, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ============================================
// 中央ステッカー作成（画像 or 文字）
// ============================================
function createSticker() {
  const cfg = STICKER_CONFIG;
  const { position, width, height } = cfg;

  if (cfg.type === "image") {
    return new Promise((resolve) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        cfg.imagePath,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          const aspect = texture.image ? texture.image.height / texture.image.width : 1;
          const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height * aspect),
            new THREE.MeshBasicMaterial({
              map: texture,
              transparent: true,
              side: THREE.DoubleSide,
            }),
          );
          plane.position.set(position.x, position.y, position.z);
          plane.rotation.set(cfg.rotation.x, cfg.rotation.y, cfg.rotation.z);
          console.log("✅ ステッカー（画像）追加:", cfg.imagePath);
          resolve(plane);
        },
        undefined,
        () => {
          console.warn("⚠️ ステッカー画像の読み込みに失敗:", cfg.imagePath);
          resolve(null);
        },
      );
    });
  }

  // 文字ステッカー: 初期表示は STICKER_CONFIG.text（updateStickerText でアニメーション別に切り替え可能）
  const texture = createTextTexture(cfg.text);
  const tempCtx = document.createElement("canvas").getContext("2d");
  tempCtx.font = `bold ${cfg.fontSize}px ${cfg.fontFamily}`;
  const textW = tempCtx.measureText(cfg.text).width + 40;
  const textH = cfg.fontSize + 40;
  const aspect = textH / textW;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width * aspect),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
    }),
  );
  plane.position.set(position.x, position.y, position.z);
  plane.rotation.set(cfg.rotation.x, cfg.rotation.y, cfg.rotation.z);
  console.log("✅ ステッカー（文字）追加:", cfg.text);
  return Promise.resolve(plane);
}

// ============================================
// ステッカー文言をアニメーションに応じて更新
// ============================================
function updateStickerText(animType) {
  if (!stickerMesh || STICKER_CONFIG.type !== "text") return;
  const text = STICKER_TEXTS[animType] ?? STICKER_CONFIG.text;
  const oldMap = stickerMesh.material.map;
  if (oldMap) oldMap.dispose();
  stickerMesh.material.map = createTextTexture(text);
}

// デバッグ用: アニメーション名一覧をコンソールに出力
function logAnimations(gltf, label) {
  if (gltf.animations && gltf.animations.length > 0) {
    console.log(`📋 [${label}] 利用可能なアニメーション:`);
    gltf.animations.forEach((clip, index) => {
      console.log(`  [${index}] ${clip.name} (${clip.duration.toFixed(2)}秒)`);
    });
  } else {
    console.warn(`⚠️ [${label}] アニメーションが見つかりません`);
  }
}

// ============================================
// モデルのセットアップ（位置・スケール・回転・アニメーション）
// ============================================
function setupModel(model, config, index, gltfAnimations) {
  // 位置・スケール・回転の設定
  model.position.set(config.position.x, config.position.y, config.position.z);
  model.scale.set(config.scale, config.scale, config.scale);
  model.rotation.set(config.rotation.x, config.rotation.y, config.rotation.z);

  // アニメーションミキサーの作成
  const mixer = new THREE.AnimationMixer(model);
  mixers.push(mixer);

  // アニメーションクリップの探索と登録
  const modelAnimations = [];
  if (gltfAnimations && gltfAnimations.length > 0) {
    // 各アニメーションタイプを探索
    const foundAnims = {
      idle: findAnimation(gltfAnimations, "idle"),
      wave: findAnimation(gltfAnimations, "wave"),
      bow: findAnimation(gltfAnimations, "bow"),
      dance: findAnimation(gltfAnimations, "dance"),
    };

    // 見つかったアニメーションを登録
    Object.keys(foundAnims).forEach((key) => {
      if (foundAnims[key]) {
        modelAnimations.push({
          type: key,
          clip: foundAnims[key],
        });
        console.log(`✅ [モデル${index}] ${key}アニメーション: "${foundAnims[key].name}"`);
      } else {
        console.warn(`⚠️ [モデル${index}] ${key}アニメーションが見つかりません`);
      }
    });

    // フォールバック: アニメーションが見つからない場合は最初のアニメーションを使用
    if (modelAnimations.length === 0 && gltfAnimations.length > 0) {
      console.warn(`⚠️ [モデル${index}] キーワードマッチなし。最初のアニメーションを使用: "${gltfAnimations[0].name}"`);
      modelAnimations.push({
        type: "idle",
        clip: gltfAnimations[0],
      });
    }
  }

  animations.push(modelAnimations);

  // 初期状態でidleアニメーションを再生
  playAnimation(index, "idle", false);
}

// ============================================
// アニメーション探索関数（キーワードベース）
// ============================================
function findAnimation(animations, type) {
  const keywords = ANIM_KEYWORDS[type] || [];

  for (const anim of animations) {
    const nameLower = anim.name.toLowerCase();
    for (const keyword of keywords) {
      if (nameLower.includes(keyword)) {
        return anim;
      }
    }
  }

  return null;
}

// ============================================
// アニメーション再生関数
// ============================================
function playAnimation(modelIndex, animType, fadeIn = true) {
  if (modelIndex < 0 || modelIndex >= animations.length) {
    console.warn(`⚠️ 無効なモデルインデックス: ${modelIndex}`);
    return;
  }

  const modelAnims = animations[modelIndex];
  const targetAnim = modelAnims.find((a) => a.type === animType);

  if (!targetAnim) {
    console.warn(`⚠️ [モデル${modelIndex}] ${animType}アニメーションが見つかりません`);
    return;
  }

  const mixer = mixers[modelIndex];
  const currentAnim = currentAnimations[modelIndex];

  // 現在のアニメーションをフェードアウト
  if (currentAnim && fadeIn) {
    currentAnim.fadeOut(0.3); // 0.3秒でフェードアウト
  }

  // 新しいアニメーションをフェードイン
  const action = mixer.clipAction(targetAnim.clip);
  action.reset();

  if (fadeIn && currentAnim) {
    action.fadeIn(0.3); // 0.3秒でフェードイン
  } else {
    action.play(); // フェードなしで即座に再生
  }

  // ループ設定
  action.setLoop(THREE.LoopRepeat);
  action.play();

  currentAnimations[modelIndex] = action;
  console.log(`▶️ [モデル${modelIndex}] ${animType}アニメーション再生: "${targetAnim.clip.name}"`);
}

// ============================================
// ターゲット認識時の処理
// ============================================
function onTargetFound() {
  // デフォルト表示は bow（両モデル）
  playAnimation(0, "bow", true);
  playAnimation(1, "bow", true);
  updateStickerText("bow");
}

// ============================================
// ターゲット見失い時の処理
// ============================================
function onTargetLost() {
  playAnimation(0, "idle", true);
  playAnimation(1, "idle", true);
}

// ============================================
// アニメーション更新（毎フレーム呼び出し）
// ============================================
function updateAnimations() {
  if (!clock) {
    return;
  }

  const delta = clock.getDelta();
  // 各ミキサーを更新
  mixers.forEach((mixer) => {
    mixer.update(delta);
  });
}

// ============================================
// イベントリスナーの設定
// ============================================
function setupEventListeners() {
  // 左側ボタン: Wave
  document.getElementById("btnLeftWave").addEventListener("click", () => {
    playAnimation(0, "wave", true);
    updateStickerText("wave");
  });

  // 右側ボタン: Bow
  document.getElementById("btnRightBow").addEventListener("click", () => {
    playAnimation(1, "bow", true);
    updateStickerText("bow");
  });

  // Dance ボタン（左のモデルで再生）
  document.getElementById("btnLeftDance").addEventListener("click", () => {
    playAnimation(0, "dance", true);
    updateStickerText("dance");
  });

  // ウィンドウリサイズ対応
  window.addEventListener("resize", () => {
    if (camera && renderer) {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
  });
}

// ============================================
// エラー表示
// ============================================
function showError(message) {
  const errorEl = document.getElementById("error");
  errorEl.textContent = message;
  errorEl.classList.add("show");
  document.getElementById("loading").classList.add("hidden");
}

// ============================================
// ページ読み込み時に初期化
// ============================================
window.addEventListener("load", () => {
  // HTTPSチェック（開発環境では警告のみ）
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    console.warn("⚠️ HTTPSでアクセスしてください（カメラAPIはHTTPS必須）");
  }

  init();
});
