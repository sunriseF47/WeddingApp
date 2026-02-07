// ============================================
// WebAR名刺 - メインスクリプト（ES Module）
// ============================================

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MindARThree } from "mindar-image-three";

// カメラ常時表示モード: true = 名刺なしでモデルを常にカメラの前に表示し、手でつかんで投げられる
const CAMERA_FIXED_MODE = true;
// MediaPipe の内部ログ（vision_wasm / GL / Feedback manager 等）をコンソールに出さない
const SUPPRESS_MEDIAPIPE_LOGS = true;

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
let modelGroup = null; // カメラモード時: 2体をまとめたグループ（camera の子）
let handLandmarker = null;
let handMeshGroup = null; // 手のメッシュ（遮蔽用・現在は非表示）
let lastHandPos = null;
let isPinching = false;
let grabOffset = new THREE.Vector3();
let lastInteractionTime = 0; // 最後に操作した時刻
const RETURN_TO_CENTER_DELAY = 2000; // 操作後何msで中央に戻るか
let lastPinchEndTime = 0; // ピンチ解除した時刻（クールダウン用）
const PINCH_COOLDOWN = 1000; // ピンチ解除後のクールダウン（ms）
let modelBaseHeight = 0; // モデルの基準高さ（スケール1時）
let modelBaseCenterY = 0; // モデルの基準中心Y（スケール1時）
let modelHeadTopY = 0; // モデル頭頂のY（ローカル、スケール1時）
let hasCenteredOnce = false; // 初期中心合わせ済みフラグ
let containerResizeObserver = null;
let initialSyncTimer = null;
let modelInitialPosition = new THREE.Vector3(0, 0, -2); // 初期位置（動的に計算）
let modelBaseScale = 1.0; // ウィンドウサイズに応じたスケール
let pinchIndicator = null; // ピンチ中のUI表示
let handOverlayCanvas = null; // 手のハイライト表示用キャンバス
let handOverlayCtx = null;
let viewWrapper = null; // ビュー用ラッパー（左右反転用）
let mirrorVideo = false; // 左右反転の状態（開発時用）

// アニメーション名のキーワード（探索用）
const ANIM_KEYWORDS = {
  idle: ["idle", "stand", "rest", "default", "walk", "walking"],
  wave: ["wave", "waving", "hand", "hello", "hi"],
  bow: ["bow", "bowing", "bow_down", "respect"],
  dance: ["dance", "dancing"],
};

// 左・右で別々の .glb を指定（2体別々に表示）
const MODEL_PATHS = {
  left: "./assets/models/person_left.glb", // 左側に表示するモデル
  right: "./assets/models/person_right.glb", // 右側に表示するモデル
};

// モデルの配置設定（MindARモード用 - 名刺の左右に配置）
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

// カメラ常時表示モード用の配置設定（画面中央に配置）
const MODEL_CONFIG_FIXED = {
  left: {
    position: { x: -0.15, y: 0, z: 0 }, // 画面中央の左側
    scale: 0.5,
    rotation: { x: 0, y: 0.2, z: 0 }, // 少し内向きに
  },
  right: {
    position: { x: 0.15, y: 0, z: 0 }, // 画面中央の右側
    scale: 0.5,
    rotation: { x: 0, y: -0.2, z: 0 }, // 少し内向きに
  },
};

// 中央ステッカー設定（二人の真ん中に表示 / カメラモードでは頭の上に配置）
const STICKER_CONFIG = {
  type: "text",
  imagePath: "./assets/sticker.png",
  text: "Hello!",
  fontSize: 56,
  fontFamily: "sans-serif",
  textColor: "#ffffff",
  backgroundColor: "rgba(0, 0, 0, 0.6)",
  position: { x: 0, y: 0.05, z: 0 },
  width: 0.15,
  height: 0.08,
  rotation: { x: 0, y: 0, z: 0 },
};

// アニメーション別ステッカー文言（bow / wave / dance で切り替え）
const STICKER_TEXTS = {
  idle: "Hello!",
  bow: "来ていただいてありがとうございます",
  wave: "こんにちは",
  dance: "ぜひ楽しんでください",
};

// 文字数に応じたステッカースケール（横幅を文字数で伸ばす）
const STICKER_BASE_SCALE = 2.5;
const STICKER_SCALE_PER_CHAR = 0.2; // 1文字あたりの横幅の増分
const STICKER_HEIGHT_FACTOR = 1.2; // 高さを少し高くする係数
function getStickerScaleForTextLength(textLength) {
  const scaleX = STICKER_BASE_SCALE + textLength * STICKER_SCALE_PER_CHAR;
  const scaleY = STICKER_BASE_SCALE * STICKER_HEIGHT_FACTOR;
  return { x: scaleX, y: scaleY };
}

// ============================================
// 初期化
// ============================================
async function init() {
  try {
    if (CAMERA_FIXED_MODE) {
      await initCameraFixedMode();
    } else {
      await initMindARMode();
    }
    console.log("✅ WebAR初期化完了");
  } catch (error) {
    console.error("❌ 初期化エラー:", error);
    showError("初期化に失敗しました: " + error.message);
  }
}

// ============================================
// カメラ常時表示モード（MindAR を使わない独自セットアップ）
// ============================================
async function initCameraFixedMode() {
  const container = document.getElementById("container");

  // ビュー用ラッパー（左右反転時に video / canvas をまとめて反転する）
  viewWrapper = document.createElement("div");
  viewWrapper.id = "view-wrapper";
  viewWrapper.style.cssText =
    "position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;";
  container.appendChild(viewWrapper);

  // カメラ映像を取得
  const video = document.createElement("video");
  video.setAttribute("autoplay", "");
  video.setAttribute("playsinline", "");
  video.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:0;";
  viewWrapper.appendChild(video);

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();

  // Three.js セットアップ
  const rect = container.getBoundingClientRect();
  const viewWidth = rect.width || window.innerWidth;
  const viewHeight = rect.height || window.innerHeight;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, viewWidth / viewHeight, 0.1, 100);
  camera.position.set(0, 0, 0);
  scene.add(camera); // カメラをシーンに追加（手メッシュ等のカメラの子を描画するため）

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(viewWidth, viewHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.cssText = "position:absolute;top:0;left:0;z-index:1;";
  viewWrapper.appendChild(renderer.domElement);

  // 手のハイライト表示用キャンバス（Three.jsキャンバスの上に重ねる）
  handOverlayCanvas = document.createElement("canvas");
  handOverlayCanvas.width = viewWidth;
  handOverlayCanvas.height = viewHeight;
  handOverlayCanvas.style.cssText = "position:absolute;top:0;left:0;z-index:2;pointer-events:none;";
  viewWrapper.appendChild(handOverlayCanvas);
  handOverlayCtx = handOverlayCanvas.getContext("2d");

  // 初回サイズ同期（レイアウト確定後にもう一度）
  syncViewSize();
  requestAnimationFrame(() => syncViewSize());
  setTimeout(() => syncViewSize(), 100);
  setTimeout(() => syncViewSize(), 300);
  setTimeout(() => syncViewSize(), 600);

  clock = new THREE.Clock();

  // ライト
  setupLights();

  // モデル読み込み
  await loadModelsForFixedMode();
  hasCenteredOnce = false;

  // ステッカー
  const sticker = await createSticker();
  if (sticker && modelGroup) {
    modelGroup.add(sticker);
    // ステッカーをモデルの頭の上に配置。文字数に応じてスケール
    sticker.position.y = modelHeadTopY + 0.8;
    const initialScale = getStickerScaleForTextLength((STICKER_CONFIG.text || "").length);
    sticker.scale.set(initialScale.x, initialScale.y, initialScale.y);
    stickerMesh = sticker;
  }

  // イベントリスナー
  setupEventListeners();

  // コンテナのリサイズを監視
  if (containerResizeObserver) {
    containerResizeObserver.disconnect();
  }
  containerResizeObserver = new ResizeObserver(() => {
    syncViewSize();
    hasCenteredOnce = false;
  });
  containerResizeObserver.observe(container);

  // 初回起動時のサイズ確定待ち（ビルド版の遅延レイアウト対策）
  if (initialSyncTimer) {
    clearInterval(initialSyncTimer);
  }
  let lastW = 0;
  let lastH = 0;
  let elapsed = 0;
  initialSyncTimer = setInterval(() => {
    const rectNow = container.getBoundingClientRect();
    const w = Math.round(rectNow.width);
    const h = Math.round(rectNow.height);
    if (w && h && (w !== lastW || h !== lastH)) {
      lastW = w;
      lastH = h;
      syncViewSize();
      hasCenteredOnce = false;
    }
    elapsed += 100;
    if (elapsed >= 2000) {
      clearInterval(initialSyncTimer);
      initialSyncTimer = null;
      syncViewSize();
      hasCenteredOnce = false;
    }
  }, 100);

  // 手検出
  initHandTracking().catch((e) => console.warn("⚠️ 手検出の初期化に失敗:", e));

  // アニメーションループ
  renderer.setAnimationLoop(() => {
    if (!hasCenteredOnce && modelGroup) {
      updateModelPositionAndScale();
      hasCenteredOnce = true;
    }
    updateAnimations();
    updateHandAndInteraction();
    renderer.render(scene, camera);
  });

  // UI
  document.getElementById("loading").classList.add("hidden");
  document.getElementById("info").classList.remove("hidden");
  document.getElementById("controls").classList.remove("hidden");
  const infoEl = document.getElementById("info");
  if (infoEl) {
    infoEl.innerHTML =
      '<div style="font-size: 12px; line-height: 1.6;">手を映して親指と人差し指でピンチするとついてきます<br>Show your hand and pinch with thumb & index finger to make it follow.</div>';
  }

  // ピンチインジケーター（画面中央上部・コンパクト表示）
  pinchIndicator = document.createElement("div");
  pinchIndicator.id = "pinch-indicator";
  pinchIndicator.style.cssText =
    "position:absolute;top:56px;left:50%;transform:translateX(-50%);padding:4px 10px;border-radius:12px;" +
    "background:rgba(0,200,100,0.9);color:#fff;font-weight:600;font-size:11px;z-index:100;display:none;";
  pinchIndicator.textContent = "✊ つかんでいます";
  container.appendChild(pinchIndicator);

  // 開発時のみ: 左右反転ボタン（localhost の Mac カメラ用）
  if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV) {
    const mirrorBtn = document.createElement("button");
    mirrorBtn.type = "button";
    mirrorBtn.id = "btn-mirror";
    mirrorBtn.style.cssText =
      "position:absolute;bottom:80px;right:16px;z-index:100;padding:8px 14px;border-radius:8px;" +
      "background:rgba(0,0,0,0.6);color:#fff;border:1px solid rgba(255,255,255,0.3);font-size:13px;cursor:pointer;";
    mirrorBtn.textContent = "🔄 左右反転 OFF";
    mirrorBtn.title = "開発用: カメラ映像を左右反転します";
    mirrorBtn.addEventListener("click", () => {
      mirrorVideo = !mirrorVideo;
      if (viewWrapper) {
        viewWrapper.style.transform = mirrorVideo ? "scaleX(-1)" : "none";
        viewWrapper.style.transformOrigin = "50% 50%";
      }
      mirrorBtn.textContent = mirrorVideo ? "🔄 左右反転 ON" : "🔄 左右反転 OFF";
    });
    container.appendChild(mirrorBtn);
  }
}

// ============================================
// カメラ常時表示モード用モデル読み込み
// ============================================
async function loadModelsForFixedMode() {
  const [gltfLeft, gltfRight] = await Promise.all([loadOneGLB(MODEL_PATHS.left), loadOneGLB(MODEL_PATHS.right)]);
  const modelLeft = gltfLeft.scene;
  const modelRight = gltfRight.scene;
  // カメラ常時表示モード用の配置を使用
  setupModel(modelLeft, MODEL_CONFIG_FIXED.left, 0, gltfLeft.animations);
  setupModel(modelRight, MODEL_CONFIG_FIXED.right, 1, gltfRight.animations);
  hideUnwantedObjects(modelLeft);
  hideUnwantedObjects(modelRight);
  logAnimations(gltfLeft, "左");
  logAnimations(gltfRight, "右");
  models.push(modelLeft);
  models.push(modelRight);

  modelGroup = new THREE.Group();
  modelGroup.add(modelLeft);
  modelGroup.add(modelRight);
  scene.add(modelGroup);
  // モデルの基準高さと中心を取得（スケール1時）
  const bbox = new THREE.Box3().setFromObject(modelGroup);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bbox.getSize(size);
  bbox.getCenter(center);
  modelBaseHeight = Math.max(0.1, size.y);
  modelBaseCenterY = center.y;
  modelHeadTopY = Math.max(center.y + size.y / 2, size.y * 0.4); // 頭頂のY（ローカル）。0のときは高さの40%をフォールバック
  // ウィンドウサイズに応じた位置とスケールを設定
  updateModelPositionAndScale();
  console.log("✅ カメラ常時表示モード: モデルを配置");
}

// ============================================
// MindAR モード（画像ターゲット認識）
// ============================================
async function initMindARMode() {
  mindarThree = new MindARThree({
    container: document.getElementById("container"),
    imageTargetSrc: "./assets/targets/card.mind",
    maxTrack: 1,
    uiLoading: "no",
    uiScanning: "no",
    filterMinCF: 0.0001,
    filterBeta: 10000,
  });

  const { renderer: r, scene: s, camera: c } = mindarThree;
  renderer = r;
  scene = s;
  camera = c;
  clock = new THREE.Clock();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  setupLights();

  const anchor = mindarThree.addAnchor(0);
  anchors.push(anchor);

  await loadModels(anchor);

  const sticker = await createSticker();
  if (sticker) {
    anchor.group.add(sticker);
    stickerMesh = sticker;
  }

  setupEventListeners();

  mindarThree.start();

  renderer.setAnimationLoop(() => {
    updateAnimations();
    renderer.render(scene, camera);
  });

  document.getElementById("loading").classList.add("hidden");
  document.getElementById("info").classList.remove("hidden");
  document.getElementById("controls").classList.remove("hidden");
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
          const percent = Math.floor((progress.loaded / progress.total) * 100);
          if (percent === 100 || (percent > 0 && percent % 25 === 0)) {
            console.log(`📦 読み込み中: ${url} ${percent}%`);
          }
        }
      },
      (error) => reject(error),
    );
  });
}

// ============================================
// GLB 内の不要なオブジェクト（立方体など）を非表示にする
// ============================================
function hideUnwantedObjects(root) {
  const hideNames = ["cube", "box"];
  root.traverse((obj) => {
    if (obj.isMesh) {
      const name = (obj.name || "").toLowerCase();
      const isUnwantedName = hideNames.some((n) => name.includes(n));
      const isSmallCube = obj.geometry?.attributes?.position?.count === 8;
      if (isUnwantedName || isSmallCube) {
        obj.visible = false;
      }
    }
  });
}

// ============================================
// 2体分の .glb を同時に読み込み
// ============================================
async function loadModels(anchor) {
  const [gltfLeft, gltfRight] = await Promise.all([loadOneGLB(MODEL_PATHS.left), loadOneGLB(MODEL_PATHS.right)]);

  const modelLeft = gltfLeft.scene;
  const modelRight = gltfRight.scene;
  setupModel(modelLeft, MODEL_CONFIG.left, 0, gltfLeft.animations);
  setupModel(modelRight, MODEL_CONFIG.right, 1, gltfRight.animations);
  hideUnwantedObjects(modelLeft);
  hideUnwantedObjects(modelRight);
  logAnimations(gltfLeft, "左");
  logAnimations(gltfRight, "右");
  models.push(modelLeft);
  models.push(modelRight);

  anchor.group.add(modelLeft);
  anchor.group.add(modelRight);
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
  canvas.width = Math.ceil(metrics.width + padding * 2);
  canvas.height = Math.ceil(cfg.fontSize + padding * 2);
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
  const { position, width } = cfg;

  if (cfg.type === "image") {
    return new Promise((resolve) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        cfg.imagePath,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          const aspect = texture.image ? texture.image.height / texture.image.width : 1;
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
          resolve(plane);
        },
        undefined,
        () => resolve(null),
      );
    });
  }

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
  // 文字数に応じてステッカーの横幅を拡大。Bow 時はさらに広く
  const s = getStickerScaleForTextLength(text.length);
  const scaleX = animType === "bow" ? s.x * 1.25 : s.x;
  stickerMesh.scale.set(scaleX, s.y, s.y);
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

// MediaPipe 内部ログを抑制（SUPPRESS_MEDIAPIPE_LOGS 時）。手検出初期化前に1回だけコンソールをラップ
function installMediaPipeLogFilter() {
  if (!SUPPRESS_MEDIAPIPE_LOGS || console.__mediaPipeFilterInstalled) return;
  const patterns = [
    /vision_wasm|gl_context|inference_feedback|Graph successfully|XNNPACK delegate|OpenGL error checking/i,
    /^[IW]\d{4}\s+\d+\.\d+\s+\d+\s+/, // I0201 15:00:03.260000 1880752 ...
  ];
  const origLog = console.log;
  const origWarn = console.warn;
  const filter = (args, orig) => {
    const msg = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
    if (patterns.some((p) => p.test(msg))) return;
    orig.apply(console, args);
  };
  console.log = (...args) => filter(args, origLog);
  console.warn = (...args) => filter(args, origWarn);
  console.__mediaPipeFilterInstalled = true;
}

// ============================================
// 手検出（MediaPipe）初期化（カメラモード時）
// ============================================
async function initHandTracking() {
  try {
    installMediaPipeLogFilter();
    let visionModule = null;

    // 開発・本番とも CDN のみ（常に本番と同じ挙動）
    try {
      visionModule = await import(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs",
      );
      console.log("✅ MediaPipe を CDN から読み込みました");
    } catch (err) {
      console.warn("⚠️ MediaPipe の CDN 読み込みに失敗:", err);
    }
    const { HandLandmarker, FilesetResolver } = visionModule || {};
    if (!HandLandmarker || !FilesetResolver) {
      console.warn("⚠️ MediaPipe の読み込みに失敗しました");
      return;
    }
    // WASM は CDN から読み込み（npm パッケージに同梱の wasm を配信する場合は自前 URL を指定）
    const wasmBaseUrl = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
    const vision = await FilesetResolver.forVisionTasks(wasmBaseUrl);
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.85, // 検出信頼度（高めに設定して誤検出を防ぐ）
      minHandPresenceConfidence: 0.85, // 手の存在信頼度
      minTrackingConfidence: 0.85, // 追跡信頼度
    });
    // 手メッシュは不要（遮蔽用だったが見た目が悪いため非表示）
    handMeshGroup = null;
    console.log("✅ 手検出の初期化完了");
  } catch (e) {
    console.warn("⚠️ 手検出の初期化に失敗:", e);
  }
}

// ランドマークをカメラローカル座標に変換（landmarkIndex: 9=中指付け根, 4=親指先端）
function landmarkToCameraLocal(landmarks, cameraRef, landmarkIndex = 9) {
  if (!landmarks || landmarks.length <= landmarkIndex) return null;
  const p = landmarks[landmarkIndex];
  const x = (p.x - 0.5) * 2;
  const y = -(p.y - 0.5) * 2;
  const depth = 0.8 + (p.z || 0) * 0.4;
  const vFov = (cameraRef.fov * Math.PI) / 180;
  const h = Math.tan(vFov / 2) * depth;
  const w = h * (cameraRef.aspect || 1);
  return new THREE.Vector3(x * w, y * h, -depth);
}

// ランドマークをワールド座標に変換（landmarkIndex: 9=中指付け根, 4=親指先端）
function landmarkToWorldPosition(landmarks, cameraRef, landmarkIndex = 9) {
  const local = landmarkToCameraLocal(landmarks, cameraRef, landmarkIndex);
  if (!local) return null;
  return local.applyMatrix4(cameraRef.matrixWorld);
}

// 親指(4)と人差し指(8)の距離でピンチ判定
function getPinchDistance(landmarks) {
  if (!landmarks || landmarks.length < 9) return 1;
  const t = landmarks[4];
  const i = landmarks[8];
  return Math.hypot(t.x - i.x, t.y - i.y, (t.z || 0) - (i.z || 0));
}

// 手のサイズをチェック（誤検出フィルタ用）
// 手首(0)から中指の付け根(9)までの距離で手のサイズを推定
function getHandSize(landmarks) {
  if (!landmarks || landmarks.length < 10) return 0;
  const wrist = landmarks[0];
  const middleBase = landmarks[9];
  return Math.hypot(wrist.x - middleBase.x, wrist.y - middleBase.y);
}

// 手が有効かどうかをチェック（サイズが妥当な範囲内か）
function isValidHand(landmarks) {
  const size = getHandSize(landmarks);
  // 手のサイズが画面の5%〜40%の範囲内であれば有効
  return size >= 0.05 && size <= 0.4;
}

// 手が画面外に出たかどうか（ピンチ中の強制リセット用）
function isHandOutOfView(landmarks) {
  if (!landmarks || landmarks.length === 0) return true;
  const margin = 0.02;
  for (const p of landmarks) {
    if (p.x < margin || p.x > 1 - margin || p.y < margin || p.y > 1 - margin) {
      return true;
    }
  }
  return false;
}

// 手のサイズに合わせたモデルスケールを計算
function getScaleForHandSize(landmarks, distance, cameraRef) {
  const handSize = getHandSize(landmarks); // 正規化(0-1)
  const vFov = (cameraRef.fov * Math.PI) / 180;
  const viewHeight = 2 * distance * Math.tan(vFov / 2);
  const desiredModelHeight = handSize * viewHeight;
  if (!modelBaseHeight || modelBaseHeight <= 0) return modelBaseScale;
  const scale = desiredModelHeight / modelBaseHeight;
  return Math.max(0.45, Math.min(1.2, scale));
}

const PINCH_THRESHOLD = 0.08;

// 手のランドマーク接続定義（MediaPipe Hand Landmarks）
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // 親指
  [0, 5], [5, 6], [6, 7], [7, 8],       // 人差し指
  [0, 9], [9, 10], [10, 11], [11, 12],  // 中指
  [0, 13], [13, 14], [14, 15], [15, 16], // 薬指
  [0, 17], [17, 18], [18, 19], [19, 20], // 小指
  [5, 9], [9, 13], [13, 17],            // 手のひら横
];

// 手のハイライトを描画
function drawHandHighlight(landmarks, isPinchingNow) {
  if (!handOverlayCtx || !handOverlayCanvas) return;
  
  const ctx = handOverlayCtx;
  const w = handOverlayCanvas.width;
  const h = handOverlayCanvas.height;
  
  // キャンバスをクリア
  ctx.clearRect(0, 0, w, h);
  
  if (!landmarks || landmarks.length < 21) return;
  
  // 色を設定（ピンチ中は緑、通常は水色）
  const color = isPinchingNow ? "rgba(0, 255, 100, 0.8)" : "rgba(0, 200, 255, 0.7)";
  const glowColor = isPinchingNow ? "rgba(0, 255, 100, 0.3)" : "rgba(0, 200, 255, 0.2)";
  
  // 接続線を描画
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  
  // グロー効果
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  
  ctx.beginPath();
  for (const [start, end] of HAND_CONNECTIONS) {
    const p1 = landmarks[start];
    const p2 = landmarks[end];
    // MediaPipeのランドマークは正規化座標（0-1）
    const x1 = p1.x * w;
    const y1 = p1.y * h;
    const x2 = p2.x * w;
    const y2 = p2.y * h;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  
  // 関節点を描画
  ctx.fillStyle = color;
  ctx.shadowBlur = 15;
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    const x = p.x * w;
    const y = p.y * h;
    // 指先（4, 8, 12, 16, 20）は大きく表示
    const radius = [4, 8, 12, 16, 20].includes(i) ? 8 : 5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // ピンチ中は親指と人差し指の間に特別なハイライト
  if (isPinchingNow) {
    const thumb = landmarks[4];
    const index = landmarks[8];
    const tx = thumb.x * w;
    const ty = thumb.y * h;
    const ix = index.x * w;
    const iy = index.y * h;
    const midX = (tx + ix) / 2;
    const midY = (ty + iy) / 2;
    
    // ピンチポイントにグロー
    ctx.beginPath();
    const gradient = ctx.createRadialGradient(midX, midY, 0, midX, midY, 30);
    gradient.addColorStop(0, "rgba(255, 255, 0, 0.8)");
    gradient.addColorStop(1, "rgba(255, 255, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.arc(midX, midY, 30, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.shadowBlur = 0;
}

// 手のハイライトをクリア
function clearHandHighlight() {
  if (!handOverlayCtx || !handOverlayCanvas) return;
  handOverlayCtx.clearRect(0, 0, handOverlayCanvas.width, handOverlayCanvas.height);
}

// ============================================
// 手・ピンチの更新（カメラモード時、毎フレーム）
// ============================================
let lastVideoTime = -1;
function updateHandAndInteraction() {
  const video = document.querySelector("#container video");
  if (!video || video.readyState < 2) return;

  if (handLandmarker) {
    try {
      const results = handLandmarker.detectForVideo(video, performance.now());
      // 手が検出されなかった場合（画面外など）
      if (!results || !results.landmarks || results.landmarks.length === 0) {
        clearHandHighlight();
        // 掴んでいる状態で手が見えなくなったら離した扱いにして中心に戻す
        if (isPinching) {
          isPinching = false;
          lastPinchEndTime = performance.now();
          lastInteractionTime = performance.now();
          if (modelGroup) {
            modelGroup.position.copy(modelInitialPosition);
            modelGroup.scale.set(modelBaseScale, modelBaseScale, modelBaseScale);
          }
          if (pinchIndicator) pinchIndicator.style.display = "none";
        }
        return;
      }
      
      const landmarks = results.landmarks[0];
      
      // 手のサイズが妥当かチェック（誤検出フィルタ）
      if (!isValidHand(landmarks)) {
        clearHandHighlight();
        // 掴んでいる状態で手が不正（見切れなど）なら離した扱いで中心に戻す
        if (isPinching) {
          isPinching = false;
          lastPinchEndTime = performance.now();
          lastInteractionTime = performance.now();
          if (modelGroup) {
            modelGroup.position.copy(modelInitialPosition);
            modelGroup.scale.set(modelBaseScale, modelBaseScale, modelBaseScale);
          }
          if (pinchIndicator) pinchIndicator.style.display = "none";
        }
        return;
      }
      
      // ピンチ中に手が画面外へ出た場合は中央に戻す
      if (isPinching && isHandOutOfView(landmarks)) {
        isPinching = false;
        lastPinchEndTime = performance.now();
        lastInteractionTime = performance.now();
        if (modelGroup) {
          modelGroup.position.copy(modelInitialPosition);
          modelGroup.scale.set(modelBaseScale, modelBaseScale, modelBaseScale);
        }
        if (pinchIndicator) pinchIndicator.style.display = "none";
        clearHandHighlight();
        return;
      }

      // モデル追従位置は親指先端(4)、その他は従来どおり中指付け根(9)も利用
      const thumbPos = landmarkToWorldPosition(landmarks, camera, 4); // 親指先端
      const handPos = landmarkToWorldPosition(landmarks, camera, 9); // 中指付け根
      if (thumbPos && handPos) {
        lastHandPos = thumbPos.clone();
        const pinchDist = getPinchDistance(landmarks);
        const nowPinching = pinchDist < PINCH_THRESHOLD;
        
        // 手のハイライトを描画
        drawHandHighlight(landmarks, nowPinching);

        // クールダウン中かどうかをチェック
        const now = performance.now();
        const inCooldown = now - lastPinchEndTime < PINCH_COOLDOWN;

        // ピンチ開始（クールダウン中は無視）
        if (nowPinching && !isPinching && modelGroup && !inCooldown) {
          isPinching = true;
          grabOffset.set(0, 0, 0);
          lastInteractionTime = now;
          // 距離補正付きスケール（見た目の大きさを一定に保つ）
          const initialDist = Math.abs(modelInitialPosition.z);
          const thumbDist = Math.max(0.3, Math.abs(thumbPos.z));
          const adjustedScale = modelBaseScale / (initialDist / thumbDist);
          modelGroup.scale.set(adjustedScale, adjustedScale, adjustedScale);
          if (pinchIndicator) pinchIndicator.style.display = "block";
          console.log("✊ ピンチ開始");
        }
        // ピンチ解除 → スケールはそのまま維持し、中心に戻るlerpで徐々に戻す
        else if (!nowPinching && isPinching) {
          isPinching = false;
          lastInteractionTime = now;
          lastPinchEndTime = now; // クールダウン開始
          // スケールは現在の補正値のまま（lerpで徐々にmodelBaseScaleに戻る）
          if (pinchIndicator) pinchIndicator.style.display = "none";
          console.log(`✋ ピンチ解除。${RETURN_TO_CENTER_DELAY / 1000}秒後に中心位置に戻ります`);
        }

        // ピンチ中: 親指先端にモデルの頭頂が来るように追従。
        // 見た目の大きさを一定に保つため、距離に応じてスケールを補正する
        if (isPinching && modelGroup) {
          const initialDist = Math.abs(modelInitialPosition.z);
          const thumbDist = Math.max(0.3, Math.abs(thumbPos.z));
          const distRatio = initialDist / thumbDist;
          const adjustedScale = modelBaseScale / distRatio;
          modelGroup.scale.set(adjustedScale, adjustedScale, adjustedScale);
          const headOffsetY = modelHeadTopY > 0 ? modelHeadTopY * adjustedScale : modelBaseHeight * 0.5 * adjustedScale;
          modelGroup.position.x = thumbPos.x;
          modelGroup.position.y = thumbPos.y - headOffsetY;
          modelGroup.position.z = thumbPos.z;
          lastInteractionTime = performance.now();
        }
      }
    } catch (e) {
      // エラー時は何もしない
    }
  }

  // 操作後一定時間経過で初期位置に戻る
  if (!isPinching && modelGroup && lastInteractionTime > 0) {
    const elapsed = performance.now() - lastInteractionTime;
    if (elapsed > RETURN_TO_CENTER_DELAY) {
      // 最初は速く、後半はゆっくり戻す
      const t = Math.min((elapsed - RETURN_TO_CENTER_DELAY) / 1200, 1);
      const lerpSpeed = 0.22 - 0.14 * t; // 0.22 → 0.08
      modelGroup.position.lerp(modelInitialPosition, lerpSpeed);
      const targetScale = new THREE.Vector3(modelBaseScale, modelBaseScale, modelBaseScale);
      modelGroup.scale.lerp(targetScale, lerpSpeed);
      // 十分近づいたらリセット
      const dist = modelGroup.position.distanceTo(modelInitialPosition);
      if (dist < 0.03) {
        modelGroup.position.copy(modelInitialPosition);
        modelGroup.scale.set(modelBaseScale, modelBaseScale, modelBaseScale);
        lastInteractionTime = performance.now(); // 次の戻り判定のために更新
        console.log("🎯 モデルが初期位置に戻りました");
      }
    }
  }
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
  // Wave: 両モデル同じ動き。二人の距離は初期と同じに戻す
  document.getElementById("btnLeftWave").addEventListener("click", () => {
    if (models.length >= 2) {
      models[0].position.x = MODEL_CONFIG_FIXED.left.position.x;
      models[1].position.x = MODEL_CONFIG_FIXED.right.position.x;
    }
    playAnimation(0, "wave", true);
    playAnimation(1, "wave", true);
    updateStickerText("wave");
  });

  // Bow: 両モデル同じ動き。二人の距離は初期と同じに戻す
  document.getElementById("btnRightBow").addEventListener("click", () => {
    if (models.length >= 2) {
      models[0].position.x = MODEL_CONFIG_FIXED.left.position.x;
      models[1].position.x = MODEL_CONFIG_FIXED.right.position.x;
    }
    playAnimation(0, "bow", true);
    playAnimation(1, "bow", true);
    updateStickerText("bow");
  });

  // Dance: 右だけダンス、左は立ち（idle）。二人の距離を0.5に
  document.getElementById("btnLeftDance").addEventListener("click", () => {
    playAnimation(0, "idle", true);
    playAnimation(1, "dance", true);
    updateStickerText("dance");
    if (models.length >= 2) {
      models[0].position.x = -0.25;
      models[1].position.x = 0.25;
    }
  });

  // ウィンドウリサイズ対応
  window.addEventListener("resize", () => {
    syncViewSize();
    hasCenteredOnce = false;
  });
}

// ============================================
// ウィンドウサイズに応じたモデルの中心位置とスケールを計算
// ============================================
function syncViewSize() {
  if (!camera || !renderer) return;
  const container = document.getElementById("container");
  const rect = container ? container.getBoundingClientRect() : null;
  const width = rect && rect.width ? rect.width : window.innerWidth;
  const height = rect && rect.height ? rect.height : window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  if (handOverlayCanvas) {
    handOverlayCanvas.width = width;
    handOverlayCanvas.height = height;
  }
  if (CAMERA_FIXED_MODE) {
    updateModelPositionAndScale();
  }
}

function updateModelPositionAndScale() {
  if (!camera || !modelGroup) return;

  const container = document.getElementById("container");
  const rect = container ? container.getBoundingClientRect() : null;
  const width = rect && rect.width ? rect.width : window.innerWidth;
  const height = rect && rect.height ? rect.height : window.innerHeight;

  // カメラの視野角から適切な距離とスケールを計算（モデル全体が入るように）
  const vFov = (camera.fov * Math.PI) / 180;
  const baseHeight = Math.max(0.1, modelBaseHeight || 0.5);
  const targetScreenRatio = 0.18; // 画面の高さの約18%をモデルが占める

  // まずスケール1の想定距離を計算し、距離をクランプ
  const idealDistance = baseHeight / (2 * Math.tan(vFov / 2) * targetScreenRatio);
  const distance = Math.max(1.9, Math.min(4.2, idealDistance));

  // その距離に対して、モデルが収まるスケールを算出
  const desiredHeight = 2 * distance * Math.tan(vFov / 2) * targetScreenRatio;
  const scale = desiredHeight / baseHeight;
  modelBaseScale = Math.max(0.4, Math.min(0.9, scale));

  // 中心位置は常にカメラの正面
  // モデルの中心が画面中心に来るように Y を補正
  const modelCenterOffset = -(modelBaseCenterY || 0) * modelBaseScale;
  modelInitialPosition.set(0, modelCenterOffset, -distance);

  // 現在操作中でなければ、モデルの位置とスケールを即座に更新
  if (!isPinching) {
    modelGroup.position.copy(modelInitialPosition);
    modelGroup.scale.set(modelBaseScale, modelBaseScale, modelBaseScale);
    lastInteractionTime = performance.now(); // リサイズ後も中央復帰を確実にする
  }

  console.log(
    `📐 ウィンドウ: ${width}x${height}, スケール: ${modelBaseScale.toFixed(2)}, 位置: (${modelInitialPosition.x.toFixed(2)}, ${modelInitialPosition.y.toFixed(2)}, ${modelInitialPosition.z.toFixed(2)})`,
  );
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
