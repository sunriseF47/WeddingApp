/**
 * 指定フォルダ内の FBX ファイル（と参照される PNG 等）を1つの GLB にまとめる
 *
 * 使い方:
 *   node scripts/convert-fbx-to-glb.js --input <入力ディレクトリ> [--output <出力ディレクトリ>]
 *   node scripts/convert-fbx-to-glb.js -i <入力> [-o <出力>]
 *
 * --output を省略した場合は入力ディレクトリと同じ場所に merged.glb を出力する。
 */

import { createRequire } from "module";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { NodeIO, Document } from "@gltf-transform/core";
import { unpartition } from "@gltf-transform/functions";

const require = createRequire(import.meta.url);
const convert = require("fbx2gltf");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    outputDir = inputDir;
  }
  return { inputDir, outputDir };
}

async function main() {
  const { inputDir, outputDir } = parseArgs();

  if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) {
    throw new Error(`入力ディレクトリが存在しません: ${inputDir}`);
  }

  const fbxFiles = fs
    .readdirSync(inputDir)
    .filter((f) => f.toLowerCase().endsWith(".fbx"))
    .sort();

  if (fbxFiles.length === 0) {
    throw new Error(`FBX ファイルが見つかりません: ${inputDir}`);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const tempGlbs = fbxFiles.map((_, i) =>
    path.join(outputDir, `_convert_temp_${i}.glb`)
  );
  const outputGlb = path.join(outputDir, "merged.glb");

  console.log("📁 入力:", inputDir);
  console.log("📁 出力:", outputDir);
  console.log("📄 FBX:", fbxFiles.join(", "));
  console.log("");

  // 1. 各 FBX を GLB に変換（同フォルダのテクスチャは自動で参照される）
  console.log("1/3 FBX → GLB 変換中...");
  for (let i = 0; i < fbxFiles.length; i++) {
    const fbxPath = path.join(inputDir, fbxFiles[i]);
    await convert(fbxPath, tempGlbs[i], []).catch((err) => {
      throw new Error(`変換失敗 (${fbxFiles[i]}): ${err.message || err}`);
    });
    console.log("  ✅", fbxFiles[i], "→", path.basename(tempGlbs[i]));
  }

  // 2. すべての GLB を1つの Document にマージ
  console.log("2/3 GLB をマージ中...");
  const io = new NodeIO();
  const outputDoc = new Document();
  for (const tempGlb of tempGlbs) {
    const doc = await io.read(tempGlb);
    outputDoc.merge(doc);
  }
  // 複数バッファを1つに統合（GLB は 0–1 バッファのみ許容）
  await outputDoc.transform(unpartition());

  // 3. 1つの GLB として出力
  console.log("3/3 出力中:", outputGlb);
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
