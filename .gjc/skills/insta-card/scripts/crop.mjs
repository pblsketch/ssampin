#!/usr/bin/env node
/**
 * crop.mjs — config.crops 목록대로 UI 크롭을 뽑는다.
 *
 *   node crop.mjs config.json          전부
 *   node crop.mjs config.json tabs     특정 id 만 다시
 *
 * 뽑은 png 는 <out>/crops/<id>.png. 반드시 Read 로 보고 잘린 데가 없는지 확인한다.
 */
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { ff, dims, ensure } from './lib.mjs';

const cfgPath = process.argv[2];
if (!cfgPath) {
  console.error('사용법: node crop.mjs <config.json> [id...]');
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const only = process.argv.slice(3);

const outDir = ensure(join(resolve(cfg.out), 'crops'));
const list = (cfg.crops || []).filter((c) => !only.length || only.includes(c.id));
if (!list.length) {
  console.error('뽑을 크롭이 없습니다.');
  process.exit(1);
}

for (const c of list) {
  const out = join(outDir, `${c.id}.png`);
  ff(['-ss', String(c.t), '-i', cfg.source, '-vf', `crop=${c.crop}`, '-frames:v', '1', out, '-y']);
  const [w, h] = dims(out);
  console.log(`  ${c.id.padEnd(16)} ${String(w).padStart(4)}×${String(h)}   t=${c.t}s`);
}

// 마스코트도 crops 옆에 둔다 (카드 템플릿이 assets/ 를 복사해 쓰므로 여기선 안내만)
console.log(`\n크롭 ${list.length}개 → ${outDir}`);
console.log('→ 전부 Read 로 보고, 버튼·표 행이 반쯤 잘리지 않았는지 확인한다.');
