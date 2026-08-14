#!/usr/bin/env node
/**
 * scripts/generate-mascot-icons.mjs
 *
 * 마스코트 "쌤핀이"를 앱/사이트 아이콘 전 세트로 굽는다.
 *
 * 배경: v2.3.8 까지 데스크톱 앱 아이콘·파비콘은 3D 압정 일러스트였고,
 *       앱 안(로딩 화면·아이콘 모드·모바일 PWA)만 쌤핀이였다. 두 갈래를
 *       쌤핀이 하나로 통일한다(2026-08-13 사용자 결정: 배경 없이 투명).
 *
 * 원본(SOURCE) 은 public/floating-pin.png — 앱이 지금 실제로 보여 주는 그림이다.
 * references/.icon-backup/floating-pin.original.png (1328px 3D 렌더) 는 화풍이
 * 달라서(구 버전) 쓰지 않는다. 원본을 바꿀 땐 앱 안 그림도 같이 바꿔야 한다.
 *
 * 확대 규칙: SOURCE 는 반투명 픽셀이 0 인 하드에지 아트다. 캐릭터 실제 영역
 * (alpha bbox) 을 잘라 정확히 2배 nearest 확대하면 계단 없이 선명하다.
 * 축소본은 그 1024 마스터에서 lanczos3 로 내린다.
 *
 * 사용법:
 *   node scripts/generate-mascot-icons.mjs          # 생성
 *   node scripts/generate-mascot-icons.mjs --check  # 덮어쓰지 않고 계획만 출력
 */

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SOURCE = 'public/floating-pin.png';

/** 마스터 캔버스 한 변(px). macOS .icns 는 1024 를 요구한다. */
const MASTER = 1024;

/** 캔버스 대비 캐릭터가 차지할 최대 비율 — 나머지는 여백. */
const CONTENT_RATIO = 0.84;

/** iOS 홈화면 아이콘은 투명을 검정으로 합성한다 → 이 파일만 크림 배경. */
const CREAM = { r: 250, g: 247, b: 240, alpha: 1 };

const dryRun = process.argv.includes('--check');
const cwd = process.cwd();

/** alpha > 0 인 실제 캐릭터 영역을 찾는다. sharp.trim() 은 색 기준이라 직접 잰다. */
async function alphaBBox(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error(`${file}: 불투명 픽셀이 없습니다`);
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** 1024 투명 마스터 PNG 버퍼를 만든다. */
async function buildMaster() {
  const box = await alphaBBox(SOURCE);
  const cropped = await sharp(SOURCE).extract(box).png().toBuffer();

  // 목표 높이/너비를 넘지 않는 정수 배율을 고른다(하드에지 유지).
  const limit = Math.round(MASTER * CONTENT_RATIO);
  const factor = Math.max(1, Math.floor(Math.min(limit / box.height, limit / box.width)));
  const w = box.width * factor;
  const h = box.height * factor;

  const scaled = await sharp(cropped).resize(w, h, { kernel: 'nearest' }).png().toBuffer();

  const master = await sharp({
    create: {
      width: MASTER,
      height: MASTER,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaled, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  console.log(
    `· 원본 ${SOURCE} 캐릭터 영역 ${box.width}×${box.height} → ${factor}배 확대 ${w}×${h} → ${MASTER}×${MASTER} 캔버스`,
  );
  return master;
}

/** 마스터를 size 정사각 PNG 로 축소. bg 를 주면 그 색으로 깔고 합성한다. */
async function png(master, size, bg) {
  const scaled = await sharp(master)
    .resize(size, size, {
      kernel: 'lanczos3',
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
  if (!bg) return scaled;
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: scaled }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * PNG 들을 .ico 컨테이너로 묶는다.
 * Vista 이후 Windows 는 ICO 안의 PNG 를 그대로 읽는다. 기존 build/icon.ico 도
 * 7개 항목 전부 PNG 였으므로 같은 형식을 유지한다.
 */
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = header.length + dir.length;

  entries.forEach((e, i) => {
    const o = i * 16;
    dir[o] = e.size >= 256 ? 0 : e.size; // 256 은 0 으로 표기하는 규격
    dir[o + 1] = e.size >= 256 ? 0 : e.size;
    dir[o + 2] = 0; // 팔레트 색 수 (트루컬러 = 0)
    dir[o + 3] = 0; // reserved
    dir.writeUInt16LE(1, o + 4); // color planes
    dir.writeUInt16LE(32, o + 6); // bits per pixel
    dir.writeUInt32LE(e.data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.data.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.data)]);
}

async function ico(master, sizes) {
  const entries = [];
  for (const size of sizes) {
    entries.push({ size, data: await png(master, size) });
  }
  return encodeIco(entries);
}

/**
 * macOS 메뉴막대용 template 이미지 — 검정 실루엣 + 알파.
 * macOS 가 다크/라이트에 맞춰 알아서 반전하므로 색은 버리고 모양만 남긴다.
 */
async function trayTemplate(master, size) {
  const { data, info } = await sharp(master)
    .resize(size, size, { kernel: 'lanczos3' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    out[i * 4] = 0;
    out[i * 4 + 1] = 0;
    out[i * 4 + 2] = 0;
    out[i * 4 + 3] = data[i * 4 + 3];
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function write(rel, buf) {
  const abs = path.resolve(cwd, rel);
  if (dryRun) {
    console.log(`  (dry-run) ${rel} ← ${buf.length.toLocaleString()} bytes`);
    return;
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf);
  console.log(`  ✅ ${rel} (${buf.length.toLocaleString()} bytes)`);
}

async function main() {
  if (!fs.existsSync(path.resolve(cwd, SOURCE))) {
    throw new Error(`원본이 없습니다: ${SOURCE}`);
  }
  console.log('🎨 쌤핀이 아이콘 세트 생성\n');
  const master = await buildMaster();

  console.log('\n[데스크톱 앱]');
  write('build/icon.png', master); // macOS .icns 소스
  write('build/icon.ico', await ico(master, [16, 24, 32, 48, 64, 128, 256])); // Windows 실행/설치/작업표시줄
  write('build/iconTemplate.png', await trayTemplate(master, 16)); // macOS 메뉴막대
  write('build/iconTemplate@2x.png', await trayTemplate(master, 32));

  console.log('\n[앱 창·브라우저 탭]');
  write('public/favicon.ico', await ico(master, [16, 32, 48]));

  console.log('\n[랜딩 사이트]');
  write('landing/src/app/favicon.ico', await ico(master, [16, 24, 32, 48, 64, 128, 256]));
  write('landing/src/app/icon.png', await png(master, 256)); // 파비콘 + 헤더 로고 겸용
  // iOS 홈화면은 투명을 검정으로 합성한다 → 여기만 크림 배경(모바일 PWA 아이콘과 동일 처리).
  write('landing/src/app/apple-icon.png', await png(master, 180, CREAM));

  console.log('\n완료. 검증: node scripts/check-icon-alpha.mjs build/icon.png');
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
