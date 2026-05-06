#!/usr/bin/env node
/**
 * scripts/fix-icon-alpha.mjs
 *
 * 아이콘 모드 PNG 의 배경 잔상 픽셀을 외과적으로 제거.
 *
 * 처리 규칙:
 *   1. alpha ≤ HARD_CLEAR_ALPHA            → alpha = 0
 *      (브라우저 리샘플링에서 사각형 잔상으로 보일 가능성이 가장 높은 약한 픽셀)
 *   2. 회색/흰색 계열 + 밝음 + low-alpha     → alpha = 0
 *      (max-min < CHROMA_THRESHOLD AND max > BRIGHT_THRESHOLD AND alpha ≤ GRAY_CLEAR_ALPHA)
 *      → 캐릭터 본체 (파란색, 진한 그림자) 는 채도가 있으므로 보존됨.
 *   3. 그 외 픽셀은 손대지 않음 — 외곽 anti-aliasing 보존.
 *
 * 결과:
 *   - 백업: public/floating-pin.png.bak (이미 있으면 건너뜀)
 *   - 덮어쓰기: public/floating-pin.png
 *   - 동기화 :  public/플로팅 아이콘2.png ← public/floating-pin.png
 *
 * 사용법:
 *   node scripts/fix-icon-alpha.mjs           # 처리
 *   node scripts/fix-icon-alpha.mjs --dry     # 시뮬레이션 (수치만 보고 파일은 안 만짐)
 */

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const HARD_CLEAR_ALPHA = 20;
const GRAY_CLEAR_ALPHA = 80;
const CHROMA_THRESHOLD = 12;
const BRIGHT_THRESHOLD = 120;

const SOURCE = 'public/floating-pin.png';
const SECONDARY = 'public/플로팅 아이콘2.png';
// 백업은 vite/electron-builder 가 자산으로 끌어가지 않도록 public/ 밖에 둔다.
const BACKUP = 'references/.icon-backup/floating-pin.original.png';

const dryRun = process.argv.includes('--dry');
const cwd = process.cwd();

function abs(p) { return path.resolve(cwd, p); }

async function run() {
  const srcAbs = abs(SOURCE);
  if (!fs.existsSync(srcAbs)) {
    console.error(`⛔  source not found: ${srcAbs}`);
    process.exit(1);
  }

  const { data, info } = await sharp(srcAbs)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (channels !== 4) {
    console.error(`⛔  expected 4 channels, got ${channels}`);
    process.exit(1);
  }

  let clearedHardAlpha = 0;
  let clearedGrayBg = 0;
  let totalCleared = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a === 0) continue;

    if (a <= HARD_CLEAR_ALPHA) {
      data[i + 3] = 0;
      // R/G/B는 alpha=0 이면 어차피 무시되지만, 합성 안전을 위해 0 으로 정리
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      clearedHardAlpha++;
      totalCleared++;
      continue;
    }

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const grayish = (maxC - minC) < CHROMA_THRESHOLD;
    const bright = maxC > BRIGHT_THRESHOLD;

    if (grayish && bright && a <= GRAY_CLEAR_ALPHA) {
      data[i + 3] = 0;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      clearedGrayBg++;
      totalCleared++;
    }
  }

  console.log('─'.repeat(60));
  console.log(`source         : ${SOURCE}`);
  console.log(`size           : ${width}×${height}`);
  console.log(`cleared (α≤${HARD_CLEAR_ALPHA})         : ${clearedHardAlpha.toLocaleString()}`);
  console.log(`cleared (gray+bright+α≤${GRAY_CLEAR_ALPHA}) : ${clearedGrayBg.toLocaleString()}`);
  console.log(`total cleared             : ${totalCleared.toLocaleString()}`);
  console.log('─'.repeat(60));

  if (dryRun) {
    console.log('🟡  --dry: no files modified');
    return;
  }

  // 백업 (이미 있으면 보존, 첫 실행만). public/ 밖에 두어 빌드 산출물 오염 방지.
  const backupAbs = abs(BACKUP);
  const backupDir = path.dirname(backupAbs);
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  if (!fs.existsSync(backupAbs)) {
    fs.copyFileSync(srcAbs, backupAbs);
    console.log(`📦  backup created: ${BACKUP}`);
  } else {
    console.log(`📦  backup already exists: ${BACKUP} (kept)`);
  }

  // raw → PNG. 핵심: 무손실(=픽셀 변화 0) 보장.
  //  - palette: false             → libimagequant 색 양자화 비활성 (RGBA 그대로 보존)
  //  - adaptiveFiltering: true    → 행마다 최적 필터 선택 (압축 효율 ↑)
  //  - effort:10                  → 최대 압축 노력
  //  - 옵션 누락 시 일부 픽셀 alpha 가 quantize 되는 회귀 발견 (~1,343 px 영향).
  //  결과 크기: 1328×1328 RGBA 기준 ~612KB (원본 650KB 와 비슷).
  const outBuf = await sharp(data, {
    raw: { width, height, channels: 4 },
  })
    .png({
      compressionLevel: 9,
      effort: 10,
      palette: false,
      adaptiveFiltering: true,
    })
    .toBuffer();

  fs.writeFileSync(srcAbs, outBuf);
  console.log(`✅  wrote: ${SOURCE}`);

  // 한글 사본도 동일하게 동기화
  const secAbs = abs(SECONDARY);
  fs.writeFileSync(secAbs, outBuf);
  console.log(`✅  wrote: ${SECONDARY}`);
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
