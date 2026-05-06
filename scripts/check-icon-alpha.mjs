#!/usr/bin/env node
/**
 * scripts/check-icon-alpha.mjs
 *
 * 아이콘 모드 PNG의 alpha 채널 위생 점검.
 *
 * 점검 항목:
 *  1. 파일이 RGBA PNG인지
 *  2. 외곽 2px alpha가 모두 0인지 (테두리 잔상)
 *  3. low-alpha gray/white background-like 픽셀 수 (PNG 내부 잔상 후보)
 *  4. alpha > 5 영역의 bbox (실제 캐릭터 범위)
 *  5. floating-pin.png 와 "플로팅 아이콘2.png" 가 동일한지
 *
 * 권장 기준:
 *  - edge non-zero alpha:                      0
 *  - low-alpha gray/white background pixels:  가능한 한 0에 가깝게
 *  - 캐릭터 외곽 anti-aliasing 반투명 픽셀:    허용
 *
 * 사용법:
 *   node scripts/check-icon-alpha.mjs
 *   node scripts/check-icon-alpha.mjs <png path...>
 */

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_TARGETS = [
  'public/floating-pin.png',
  'public/플로팅 아이콘2.png',
];

const targets = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_TARGETS;

const cwd = process.cwd();

async function inspect(rel) {
  const abs = path.resolve(cwd, rel);
  if (!fs.existsSync(abs)) {
    return { rel, exists: false };
  }
  const meta = await sharp(abs).metadata();
  const buf = fs.readFileSync(abs);
  const sha = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
  const sizeBytes = buf.length;

  const { data, info } = await sharp(abs)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (channels !== 4) {
    return { rel, exists: true, error: `expected 4 channels, got ${channels}` };
  }

  let fullyTransparent = 0;
  let fullyOpaque = 0;
  let semiTransparent = 0;

  // 배경 잔상 후보: 회색/흰색 + 낮은 alpha
  let lowAlphaGrayBg = 0;        // 가장 의심되는 그룹
  let lowAlphaNonTransparent = 0;
  let graySemi = 0;
  let grayLow = 0;

  // alpha > 5 bbox
  let minX = width, minY = height, maxX = -1, maxY = -1;

  // 외곽 2px non-zero alpha
  let edgeNonZero = 0;
  const EDGE = 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a === 0) {
        fullyTransparent++;
      } else if (a === 255) {
        fullyOpaque++;
      } else {
        semiTransparent++;
      }

      if (a > 0 && a < 30) lowAlphaNonTransparent++;

      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const grayish = (maxC - minC) < 12;
      const bright = maxC > 120;

      // 의심 픽셀: 회색 계열 + 밝음 + low-alpha (배경 잔상 추정)
      if (grayish && bright && a > 0 && a <= 80) lowAlphaGrayBg++;
      if (grayish && a > 0 && a < 200) graySemi++;
      if (grayish && a > 0 && a < 60) grayLow++;

      if (a > 5) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }

      // 외곽 2px
      const onEdge = x < EDGE || y < EDGE || x >= width - EDGE || y >= height - EDGE;
      if (onEdge && a > 0) edgeNonZero++;
    }
  }

  const totalPixels = width * height;

  return {
    rel,
    exists: true,
    sha,
    sizeBytes,
    width,
    height,
    channels,
    format: meta.format,
    totalPixels,
    fullyTransparent,
    fullyOpaque,
    semiTransparent,
    fullyTransparentPct: ((fullyTransparent / totalPixels) * 100).toFixed(2),
    fullyOpaquePct: ((fullyOpaque / totalPixels) * 100).toFixed(2),
    semiTransparentPct: ((semiTransparent / totalPixels) * 100).toFixed(2),
    edgeNonZero,
    lowAlphaGrayBg,        // 가장 의심
    lowAlphaNonTransparent,
    graySemi,
    grayLow,
    bbox: maxX >= 0 ? [minX, minY, maxX, maxY] : null,
  };
}

(async () => {
  const results = [];
  for (const t of targets) {
    const r = await inspect(t);
    results.push(r);
  }

  for (const r of results) {
    console.log('═'.repeat(80));
    console.log(`📄  ${r.rel}`);
    if (!r.exists) {
      console.log('  ⛔  파일 없음');
      continue;
    }
    if (r.error) {
      console.log(`  ⛔  ${r.error}`);
      continue;
    }
    console.log(`  포맷                : ${r.format} (${r.width}×${r.height}, ${r.channels}ch)`);
    console.log(`  파일 크기            : ${r.sizeBytes.toLocaleString()} bytes`);
    console.log(`  SHA-256 (16)        : ${r.sha}`);
    console.log(`  총 픽셀              : ${r.totalPixels.toLocaleString()}`);
    console.log(`  완전 투명 (a=0)     : ${r.fullyTransparent.toLocaleString()} (${r.fullyTransparentPct}%)`);
    console.log(`  완전 불투명 (a=255) : ${r.fullyOpaque.toLocaleString()} (${r.fullyOpaquePct}%)`);
    console.log(`  반투명              : ${r.semiTransparent.toLocaleString()} (${r.semiTransparentPct}%)`);
    console.log(`  외곽 2px non-zero α : ${r.edgeNonZero}  ${r.edgeNonZero === 0 ? '✅' : '⚠️'}`);
    console.log(`  배경 잔상 후보 (low-α gray+bright, α≤80) : ${r.lowAlphaGrayBg.toLocaleString()}  ${r.lowAlphaGrayBg === 0 ? '✅' : '⚠️'}`);
    console.log(`  low-α non-transparent (0<α<30)            : ${r.lowAlphaNonTransparent.toLocaleString()}`);
    console.log(`  graySemi (gray, 0<α<200)                  : ${r.graySemi.toLocaleString()}`);
    console.log(`  grayLow  (gray, 0<α<60)                   : ${r.grayLow.toLocaleString()}`);
    if (r.bbox) {
      console.log(`  α>5 bbox             : [${r.bbox.join(', ')}]`);
    }
  }
  console.log('═'.repeat(80));

  if (results.length === 2 && results[0].exists && results[1].exists) {
    const same = results[0].sha === results[1].sha;
    console.log(`🔁  두 자산 동일 여부 : ${same ? '동일 ✅' : '다름 ⚠️'}`);
    if (!same) {
      console.log('   → public/floating-pin.png 와 public/플로팅 아이콘2.png 를 같은 내용으로 동기화하세요.');
    }
  }
})();
