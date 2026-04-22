#!/usr/bin/env node
// 칠판 배경용 지도 SVG → 흰 선 + 투명 배경 PNG 변환 스크립트
//
// 입력: docs/korea-blank.svg, docs/world-blank.svg (Wikimedia Commons)
// 출력: public/chalkboard/korea-map.png, public/chalkboard/world-map.png
//       + 팝오버 썸네일용 -thumb.png 동시 산출
//
// 사용법:
//   node scripts/preprocess-chalkboard-maps.mjs
//
// 파이프라인 (SVG 소스, 회색 영토 + 흰 경계선 구조):
//   SVG → 고해상도 래스터화(density) → RGBA 유지 →
//     각 픽셀: 밝기(R값) + 원본 alpha를 조합하여 단일 흰색 + 최종 알파 계산
//   - 회색 영토(200~230): 중간 알파 → faint fill (영토 영역 구분 가능)
//   - 흰 경계선(250~255): 높은 알파 → 선명한 흰 선
//   - 투명 배경(alpha=0): 그대로 투명

import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.+)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  }),
);

const THUMB_WIDTH = 64;

// 최종 알파 = (밝기/255)^gamma * originalAlpha * maxAlpha
// gamma < 1: 어두운(회색) 영역도 잘 보임
// gamma = 1: 선형 (회색은 회색만큼만 보임)
// gamma > 1: 흰 선만 진하게
// 타겟별 파라미터는 TARGETS에 지정. 여기는 전역 override.
const GLOBAL_GAMMA = args.gamma !== undefined ? Number(args.gamma) : null;
const GLOBAL_MAX_ALPHA = args.maxAlpha !== undefined ? Number(args.maxAlpha) : null;

const TARGETS = [
  {
    label: '한반도',
    input: path.join(ROOT, 'docs/korea-blank.svg'),
    output: path.join(ROOT, 'public/chalkboard/korea-map.png'),
    thumbOutput: path.join(ROOT, 'public/chalkboard/korea-map-thumb.png'),
    renderWidth: 1600,
    budgetKB: 400,
    // 세계지도와 동일한 tone. fill이 너무 진해 판서 가독성 저해 방지
    gamma: 1.8,
    maxAlpha: 0.55,
  },
  {
    label: '세계',
    input: path.join(ROOT, 'docs/world-blank.svg'),
    output: path.join(ROOT, 'public/chalkboard/world-map.png'),
    thumbOutput: path.join(ROOT, 'public/chalkboard/world-map-thumb.png'),
    renderWidth: 2400,
    budgetKB: 800,
    // 세계지도는 ocean이 전체의 70%라 너무 진하면 배경으로 과함
    // 높은 gamma로 밝은 경계선만 강조 + 전체 alpha 낮춤
    gamma: 1.8,
    maxAlpha: 0.55,
  },
];

async function preprocess(target) {
  console.log(`\n[${target.label}] 처리 시작: ${path.relative(ROOT, target.input)}`);
  const gamma = GLOBAL_GAMMA ?? target.gamma;
  const maxAlpha = GLOBAL_MAX_ALPHA ?? target.maxAlpha;
  console.log(`  gamma=${gamma}  maxAlpha=${maxAlpha}  renderWidth=${target.renderWidth}`);

  // 1. SVG를 고해상도로 래스터화 (density는 원본 SVG viewBox 기준 DPI)
  // Sharp의 SVG 입력은 density 파라미터로 해상도 제어. 기본 72dpi.
  // renderWidth를 맞추기 위해 적절히 크게 설정 후 resize.
  const rawBuffer = await sharp(target.input, { density: 300 })
    .resize({ width: target.renderWidth, fit: 'inside' })
    .ensureAlpha() // RGBA 보장
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = rawBuffer;
  const pixelCount = info.width * info.height;
  console.log(`  렌더 해상도: ${info.width}×${info.height} (${pixelCount.toLocaleString()} px)`);

  // 2. 각 픽셀: 밝기 + 원본 alpha 결합
  //    채널: RGBA(4) or 단일 채널 + A(2) 모두 처리
  const rgba = Buffer.alloc(pixelCount * 4);
  const ch = info.channels;
  for (let i = 0; i < pixelCount; i++) {
    const src = i * ch;
    const brightness = data[src]; // R (greyscale의 경우 R=G=B)
    const origAlpha = data[src + ch - 1]; // 마지막 채널이 alpha

    // 최종 알파: 밝기에 gamma 적용 × 원본 alpha × maxAlpha
    const brightnessNorm = brightness / 255;
    const brightnessBoosted = Math.pow(brightnessNorm, gamma);
    const finalAlpha = Math.round(brightnessBoosted * (origAlpha / 255) * 255 * maxAlpha);

    rgba[i * 4 + 0] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = finalAlpha;
  }

  // 3. PNG 저장
  await sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9, palette: false })
    .toFile(target.output);

  const stat = await fs.stat(target.output);
  const sizeKB = Math.round(stat.size / 1024);
  const over = sizeKB > target.budgetKB ? ' ⚠️  예산 초과' : '';
  console.log(`  저장: ${path.relative(ROOT, target.output)} (${sizeKB} KB, 예산 ${target.budgetKB} KB)${over}`);

  // 4. 팝오버 썸네일: 64px 폭
  await sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize({ width: THUMB_WIDTH, fit: 'inside' })
    .png({ compressionLevel: 9 })
    .toFile(target.thumbOutput);

  const thumbStat = await fs.stat(target.thumbOutput);
  console.log(`  썸네일: ${path.relative(ROOT, target.thumbOutput)} (${Math.round(thumbStat.size / 1024)} KB)`);
}

console.log('칠판 지도 전처리 시작 (gamma/maxAlpha는 타겟별)');

await fs.mkdir(path.join(ROOT, 'public/chalkboard'), { recursive: true });

for (const target of TARGETS) {
  try {
    await preprocess(target);
  } catch (err) {
    console.error(`\n[${target.label}] 실패:`, err.message);
    process.exit(1);
  }
}

console.log('\n완료. public/chalkboard/ 확인하세요.');
