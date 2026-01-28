// ============================================
// WebAR名刺 - メインスクリプト（ES Module）
// ============================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { MindARThree } from 'mindar-image-three';

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

// アニメーション名のキーワード（探索用）
const ANIM_KEYWORDS = {
    idle: ['idle', 'stand', 'rest', 'default'],
    wave: ['wave', 'waving', 'hand', 'hello', 'hi'],
    bow: ['bow', 'bowing', 'bow_down', 'respect']
};

// モデルの配置設定
const MODEL_CONFIG = {
    // 左側のモデル
    left: {
        position: { x: -0.15, y: 0, z: 0 }, // 名刺の左側に配置（単位: メートル）
        scale: 0.8, // スケール調整（名刺サイズに合わせて調整）
        rotation: { x: 0, y: 0, z: 0 } // 回転（必要に応じて調整）
    },
    // 右側のモデル
    right: {
        position: { x: 0.15, y: 0, z: 0 }, // 名刺の右側に配置
        scale: 0.8,
        rotation: { x: 0, y: 0, z: 0 }
    }
};

// ============================================
// 初期化
// ============================================
async function init() {
    try {
        // MindARの初期化
        mindarThree = new MindARThree({
            container: document.getElementById('container'),
            imageTargetSrc: './assets/targets/card.mind', // 画像ターゲットファイル
            maxTrack: 1, // 同時追跡数
            uiLoading: 'no', // MindARのデフォルトローディングを無効化
            uiScanning: 'no', // MindARのデフォルトスキャンUIを無効化
            filterMinCF: 0.0001, // トラッキングの安定性（低いほど敏感）
            filterBeta: 10000 // トラッキングの滑らかさ（高いほど滑らか）
        });

        const { renderer: r, scene: s, camera: c } = mindarThree;
        renderer = r;
        scene = s;
        camera = c;

        // レンダラーの設定
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        // ライトの追加
        setupLights();

        // アンカーの作成
        const anchor = mindarThree.addAnchor(0);
        anchors.push(anchor);

        // モデルの読み込み
        await loadModel(anchor);

        // イベントリスナーの設定
        setupEventListeners();

        // アニメーションループの開始
        mindarThree.start();
        renderer.setAnimationLoop(() => {
            updateAnimations();
            renderer.render(scene, camera);
        });

        // ローディング表示を非表示
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('info').classList.remove('hidden');
        document.getElementById('controls').classList.remove('hidden');

        console.log('✅ WebAR初期化完了');
    } catch (error) {
        console.error('❌ 初期化エラー:', error);
        showError('初期化に失敗しました: ' + error.message);
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
// モデルの読み込み
// ============================================
async function loadModel(anchor) {
    return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        
        loader.load(
            './assets/models/person.glb', // GLBファイルのパス
            (gltf) => {
                console.log('✅ GLBモデル読み込み完了');
                
                // アニメーション情報をログ出力（デバッグ用）
                if (gltf.animations && gltf.animations.length > 0) {
                    console.log('📋 利用可能なアニメーション:');
                    gltf.animations.forEach((clip, index) => {
                        console.log(`  [${index}] ${clip.name} (${clip.duration.toFixed(2)}秒)`);
                    });
                } else {
                    console.warn('⚠️ アニメーションが見つかりません');
                }

                // 元のモデル（スケルトン情報を保持）
                const originalModel = gltf.scene;

                // 左側のモデルを作成
                const leftModel = skeletonClone(originalModel);
                setupModel(leftModel, MODEL_CONFIG.left, 0, gltf.animations);
                anchor.group.add(leftModel);
                models.push(leftModel);

                // 右側のモデルを作成
                const rightModel = skeletonClone(originalModel);
                setupModel(rightModel, MODEL_CONFIG.right, 1, gltf.animations);
                anchor.group.add(rightModel);
                models.push(rightModel);

                // ターゲット認識/見失いのイベント設定
                anchor.onTargetFound = () => {
                    console.log('🎯 ターゲット認識');
                    onTargetFound();
                };

                anchor.onTargetLost = () => {
                    console.log('❌ ターゲット見失い');
                    onTargetLost();
                };

                resolve();
            },
            (progress) => {
                const percent = (progress.loaded / progress.total) * 100;
                console.log(`📦 モデル読み込み中: ${percent.toFixed(1)}%`);
            },
            (error) => {
                console.error('❌ モデル読み込みエラー:', error);
                reject(error);
            }
        );
    });
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
            idle: findAnimation(gltfAnimations, 'idle'),
            wave: findAnimation(gltfAnimations, 'wave'),
            bow: findAnimation(gltfAnimations, 'bow')
        };

        // 見つかったアニメーションを登録
        Object.keys(foundAnims).forEach(key => {
            if (foundAnims[key]) {
                modelAnimations.push({
                    type: key,
                    clip: foundAnims[key]
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
                type: 'idle',
                clip: gltfAnimations[0]
            });
        }
    }

    animations.push(modelAnimations);

    // 初期状態でidleアニメーションを再生
    playAnimation(index, 'idle', false);
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
    const targetAnim = modelAnims.find(a => a.type === animType);

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
    // シーケンス再生: 右→wave、左→bow
    // 少し遅延を入れて順番に再生（見栄えを良くする）
    setTimeout(() => {
        playAnimation(1, 'wave', true); // 右側（インデックス1）: wave
    }, 0);
    
    setTimeout(() => {
        playAnimation(0, 'bow', true); // 左側（インデックス0）: bow
    }, 500); // 0.5秒後に左側を再生
}

// ============================================
// ターゲット見失い時の処理
// ============================================
function onTargetLost() {
    // 両方のモデルをidleに戻す
    playAnimation(0, 'idle', true);
    playAnimation(1, 'idle', true);
}

// ============================================
// アニメーション更新（毎フレーム呼び出し）
// ============================================
function updateAnimations() {
    if (mindarThree) {
        const delta = mindarThree.delta;
        // 各ミキサーを更新
        mixers.forEach(mixer => {
            mixer.update(delta);
        });
    }
}

// ============================================
// イベントリスナーの設定
// ============================================
function setupEventListeners() {
    // 左側ボタン: Wave
    document.getElementById('btnLeftWave').addEventListener('click', () => {
        playAnimation(0, 'wave', true);
    });

    // 右側ボタン: Bow
    document.getElementById('btnRightBow').addEventListener('click', () => {
        playAnimation(1, 'bow', true);
    });

    // ウィンドウリサイズ対応
    window.addEventListener('resize', () => {
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
    const errorEl = document.getElementById('error');
    errorEl.textContent = message;
    errorEl.classList.add('show');
    document.getElementById('loading').classList.add('hidden');
}

// ============================================
// ページ読み込み時に初期化
// ============================================
window.addEventListener('load', () => {
    // HTTPSチェック（開発環境では警告のみ）
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        console.warn('⚠️ HTTPSでアクセスしてください（カメラAPIはHTTPS必須）');
    }
    
    init();
});
