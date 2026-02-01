/**
 * 指定フォルダ内の FBX ファイル（と参照される PNG 等）を1つの GLB にまとめる。
 * ファイル名規則で PBR 用 PNG（normal, roughness, metallic, ベースカラー）を検出し、
 * マージ後の GLB に対してテクスチャを再定義する。
 *
 * 使い方:
 *   node scripts/convert-fbx-to-glb.js --input <入力ディレクトリ> [--output <出力ディレクトリ>]
 *   node scripts/convert-fbx-to-glb.js -i <入力> [-o <出力>]
 *
 * --output を省略した場合は入力フォルダと同じディレクトリ（入力の親フォルダ）に merged.glb を出力する。
 */

import { createRequire } from "module";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { NodeIO, Document } from "@gltf-transform/core";
import { unpartition } from "@gltf-transform/functions";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const convert = require("fbx2gltf");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// GLB に含める .fbx ファイルのリスト（入力フォルダ内のファイル名）
// 空配列 [] の場合は入力フォルダ内のすべての .fbx を含める
// ※ WebAR で1体のキャラに bow/wave/dance を切り替えたい場合: 複数 FBX のマージでは
//    各 FBX が別スケルトンだとアニメが表示メッシュに紐づかないことがあります。
//    1本スケルトン＋複数アニメの1 FBX を Blender 等で作り、それを GLB 化することを推奨。
// ---------------------------------------------------------------------------
const FBX_INCLUDE_LIST = ["Bow.fbx", "Dance.fbx", "Waving.fbx"];

// ---------------------------------------------------------------------------
// PBR PNG 検出（ファイル名規則: *normal*.png, *roughness*.png, *metallic*.png, それ以外の .png = ベースカラー）
// ---------------------------------------------------------------------------
function discoverPbrPngs(inputDir) {
  const files = fs
    .readdirSync(inputDir)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort();
  let baseColor = null;
  let normal = null;
  let roughness = null;
  let metallic = null;
  for (const f of files) {
    const lower = f.toLowerCase();
    if (lower.includes("normal")) {
      if (!normal) normal = path.join(inputDir, f);
    } else if (lower.includes("roughness")) {
      if (!roughness) roughness = path.join(inputDir, f);
    } else if (lower.includes("metallic")) {
      if (!metallic) metallic = path.join(inputDir, f);
    } else {
      if (!baseColor) baseColor = path.join(inputDir, f);
    }
  }
  return { baseColor, normal, roughness, metallic };
}

// ---------------------------------------------------------------------------
// PNG を読み込み Document に Texture を追加
// ---------------------------------------------------------------------------
function createTextureFromPng(document, pngPath, name) {
  const buffer = new Uint8Array(fs.readFileSync(pngPath));
  const texture = document.createTexture(name ?? path.basename(pngPath));
  texture.setImage(buffer);
  texture.setMimeType("image/png");
  texture.setURI(path.basename(pngPath));
  return texture;
}

// ---------------------------------------------------------------------------
// roughness.png と metallic.png を 1 枚に合成（glTF: R=metallic, G=roughness）
// ---------------------------------------------------------------------------
async function combineMetallicRoughnessPng(roughnessPath, metallicPath) {
  const [roughnessMeta, metallicMeta] = await Promise.all([
    sharp(roughnessPath).raw().toBuffer({ resolveWithObject: true }),
    sharp(metallicPath).raw().toBuffer({ resolveWithObject: true }),
  ]);
  let w = roughnessMeta.info.width;
  let h = roughnessMeta.info.height;
  let metallicData = metallicMeta.data;
  if (metallicMeta.info.width !== w || metallicMeta.info.height !== h) {
    const resized = await sharp(metallicPath).resize(w, h).raw().toBuffer();
    metallicData = resized;
  }
  const rData = roughnessMeta.data;
  const pixelCount = w * h;
  const channels = roughnessMeta.info.channels ?? 1;
  const mChannels = metallicMeta.info.channels ?? 1;
  const out = new Uint8Array(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    out[i * 4 + 0] = mChannels === 1 ? metallicData[i] : metallicData[i * mChannels];
    out[i * 4 + 1] = channels === 1 ? rData[i] : rData[i * channels];
    out[i * 4 + 2] = 0;
    out[i * 4 + 3] = 255;
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// マージ後の Document に PBR テクスチャを再定義
// ---------------------------------------------------------------------------
async function applyTextureRedefinition(document, inputDir) {
  const pngs = discoverPbrPngs(inputDir);
  const hasAny = pngs.baseColor != null || pngs.normal != null || pngs.roughness != null || pngs.metallic != null;
  if (!hasAny) return;

  const root = document.getRoot();
  const materials = root.listMaterials();
  if (materials.length === 0) return;

  let texBase = null;
  let texNormal = null;
  let texMetallicRoughness = null;

  if (pngs.baseColor) {
    texBase = createTextureFromPng(document, pngs.baseColor, "baseColor");
  }
  if (pngs.normal) {
    texNormal = createTextureFromPng(document, pngs.normal, "normal");
  }
  if (pngs.roughness && pngs.metallic) {
    const combinedBuffer = await combineMetallicRoughnessPng(pngs.roughness, pngs.metallic);
    texMetallicRoughness = document.createTexture("metallicRoughness");
    texMetallicRoughness.setImage(new Uint8Array(combinedBuffer));
    texMetallicRoughness.setMimeType("image/png");
    texMetallicRoughness.setURI("metallicRoughness.png");
  }

  for (const material of materials) {
    if (texBase) material.setBaseColorTexture(texBase);
    if (texNormal) material.setNormalTexture(texNormal);
    if (texMetallicRoughness) material.setMetallicRoughnessTexture(texMetallicRoughness);
  }
}

function parseArgs() {
  let inputDir = null;
  let outputDir = null;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === "--input" || arg === "-i") && argv[i + 1]) {
      inputDir = path.resolve(argv[++i]);
    } else if ((arg === "--output" || arg === "-o") && argv[i + 1]) {
      outputDir = path.resolve(argv[++i]);
    }
  }
  if (!inputDir) {
    console.error("❌ --input (-i) で入力ディレクトリを指定してください");
    console.error("   例: node scripts/convert-fbx-to-glb.js -i model/Groom_model");
    process.exit(1);
  }
  if (!outputDir) {
    outputDir = path.dirname(inputDir);
  }
  return { inputDir, outputDir };
}

async function main() {
  const { inputDir, outputDir } = parseArgs();

  if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) {
    throw new Error(`入力ディレクトリが存在しません: ${inputDir}`);
  }

  let fbxFiles = fs
    .readdirSync(inputDir)
    .filter((f) => f.toLowerCase().endsWith(".fbx"))
    .sort();

  if (FBX_INCLUDE_LIST.length > 0) {
    const allowSet = new Set(FBX_INCLUDE_LIST.map((f) => f.toLowerCase()));
    fbxFiles = fbxFiles.filter((f) => allowSet.has(f.toLowerCase()));
    const missing = FBX_INCLUDE_LIST.filter((f) => !fs.existsSync(path.join(inputDir, f)));
    if (missing.length > 0) {
      console.warn("⚠️ 指定されたが存在しない FBX:", missing.join(", "));
    }
  }

  if (fbxFiles.length === 0) {
    throw new Error(
      FBX_INCLUDE_LIST.length > 0
        ? `FBX_INCLUDE_LIST に指定されたファイルが入力フォルダに見つかりません: ${inputDir}`
        : `FBX ファイルが見つかりません: ${inputDir}`,
    );
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const tempGlbs = fbxFiles.map((_, i) => path.join(outputDir, `_convert_temp_${i}.glb`));
  const outputGlb = path.join(outputDir, "merged.glb");

  console.log("📁 入力:", inputDir);
  console.log("📁 出力:", outputDir);
  console.log("📄 FBX:", fbxFiles.join(", "));
  console.log("");

  // 1. 各 FBX を GLB に変換（同フォルダのテクスチャは自動で参照される）
  console.log("1/4 FBX → GLB 変換中...");
  for (let i = 0; i < fbxFiles.length; i++) {
    const fbxPath = path.join(inputDir, fbxFiles[i]);
    await convert(fbxPath, tempGlbs[i], []).catch((err) => {
      throw new Error(`変換失敗 (${fbxFiles[i]}): ${err.message || err}`);
    });
    console.log("  ✅", fbxFiles[i], "→", path.basename(tempGlbs[i]));
  }

  // 2. すべての GLB を1つの Document にマージ
  console.log("2/4 GLB をマージ中...");
  const io = new NodeIO();
  const outputDoc = new Document();
  for (const tempGlb of tempGlbs) {
    const doc = await io.read(tempGlb);
    outputDoc.merge(doc);
  }
  // 複数バッファを1つに統合（GLB は 0–1 バッファのみ許容）
  await outputDoc.transform(unpartition());

  // 2.5 テクスチャ再定義（入力フォルダ内の PBR PNG を検出して全 Material に適用）
  const pngs = discoverPbrPngs(inputDir);
  const hasPbrPngs = pngs.baseColor != null || pngs.normal != null || pngs.roughness != null || pngs.metallic != null;
  if (hasPbrPngs) {
    console.log("3/4 テクスチャ再定義中...");
    await applyTextureRedefinition(outputDoc, inputDir);
    if (pngs.baseColor) console.log("  ✅ ベースカラー:", path.basename(pngs.baseColor));
    if (pngs.normal) console.log("  ✅ Normal:", path.basename(pngs.normal));
    if (pngs.roughness && pngs.metallic)
      console.log("  ✅ MetallicRoughness:", path.basename(pngs.roughness), "+", path.basename(pngs.metallic));
  }

  // 3. 1つの GLB として出力
  console.log(hasPbrPngs ? "4/4" : "3/3", "出力中:", outputGlb);
  await io.write(outputGlb, outputDoc);

  // 一時ファイル削除
  for (const tempGlb of tempGlbs) {
    fs.unlinkSync(tempGlb);
  }

  console.log("");
  console.log("✅ 完了:", outputGlb);
}

main().catch((err) => {
  console.error("❌ エラー:", err.message || err);
  process.exit(1);
});
