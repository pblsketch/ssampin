#!/usr/bin/env node
/**
 * scan.mjs — 소스 영상을 훑어볼 수 있게 만든다.
 *
 *   node scan.mjs "<영상>" [작업폴더]              컨택트시트 생성
 *   node scan.mjs "<영상>" [작업폴더] --at 10,40   지정 초를 원본 해상도로 추출
 *
 * 나온 jpg 는 반드시 Read 로 직접 눈으로 본다.
 */
import { resolve, join } from 'node:path';
import { readdirSync } from 'node:fs';
import { ff, dims, duration, ensure } from './lib.mjs';

const argv = process.argv.slice(2);
const src = argv[0];
if (!src) {
  console.error('사용법: node scan.mjs "<영상>" [작업폴더] [--at 10,40,90]');
  process.exit(1);
}
const work = ensure(resolve(argv[1] && !argv[1].startsWith('--') ? argv[1] : '.insta-work'));
const atIdx = argv.indexOf('--at');
const at =
  atIdx >= 0
    ? String(argv[atIdx + 1] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

const [W, H] = dims(src);
const dur = duration(src);
console.log(`영상  ${W}×${H}  ${dur.toFixed(1)}초`);

if (at) {
  for (const t of at) {
    const out = join(work, `at_${t}.jpg`);
    ff(['-ss', t, '-i', src, '-frames:v', '1', '-q:v', '2', out, '-y']);
    console.log(`  ${out}`);
  }
  console.log('\n→ 원본 해상도 그대로다. 크롭 좌표(w:h:x:y)를 여기서 잰다.');
  process.exit(0);
}

// 전체를 90컷 안팎으로 — 너무 촘촘하면 시트가 많아지고, 성기면 놓친다.
const step = Math.max(1, Math.round(dur / 90));
const framesDir = ensure(join(work, 'frames'));
ff([
  '-i',
  src,
  '-vf',
  `fps=1/${step},scale=864:-1`,
  '-q:v',
  '4',
  join(framesDir, 'f_%03d.jpg'),
  '-y',
]);
const n = readdirSync(framesDir).filter((f) => f.endsWith('.jpg')).length;

const PER = 18; // 3열 × 6행
const sheets = Math.ceil(n / PER);
for (let s = 0; s < sheets; s++) {
  ff([
    '-start_number',
    String(s * PER + 1),
    '-i',
    join(framesDir, 'f_%03d.jpg'),
    '-vf',
    'scale=440:-1,tile=3x6:margin=4:padding=4:color=black',
    '-frames:v',
    '1',
    '-q:v',
    '3',
    join(work, `sheet_${s}.jpg`),
    '-y',
  ]);
}

console.log(`\n프레임 ${n}컷 (${step}초 간격) → 시트 ${sheets}장`);
console.log('시트별 구간:');
for (let s = 0; s < sheets; s++) {
  const from = s * PER * step;
  const to = Math.min(dur, (s + 1) * PER * step);
  console.log(`  ${join(work, `sheet_${s}.jpg`)}   ${from}초 ~ ${to.toFixed(0)}초`);
}
console.log('\n시트 안에서 위치 → 시간: (행-1)×3 + 열 번째 컷 = 시작초 + (순번-1)×' + step);
console.log('→ 전부 Read 로 보고, 기능 구간 · 크롭 범위 · 개인정보 위험을 적어 둔다.');
