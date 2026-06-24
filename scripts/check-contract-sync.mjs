#!/usr/bin/env node
/**
 * AI 브릿지 쓰기 계약 정합 게이트 — def ↔ 생성물 3산출 동기화 검증.
 *
 * 동작: 생성기와 동일한 렌더러(buildOutputs)로 "기대 산출"을 만들고, 디스크의 실제 생성물과
 *   바이트 단위 비교한다. 하나라도 어긋나면 비정상 종료(빌드 게이트).
 *   → "def 만 고치고 `npm run gen:contract` 안 함" 또는 "생성물을 직접 수정함"을 즉시 잡는다.
 *
 * 실행: `node scripts/check-contract-sync.mjs`  ·  CI wire: package.json postbuild 체인.
 * 기존 scripts/check-*.mjs 패턴(check-bundle-isolation 등)과 동일.
 */
import { readFileSync, existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { buildOutputs } from './gen-bridge-contract.mjs';

const ROOT = resolve(process.cwd());

function fail(message) {
  console.error(`✗ contract-sync gate FAIL: ${message}`);
  console.error('  → `npm run gen:contract` 실행 후 생성물을 커밋하세요.');
  process.exit(1);
}

let mismatch = 0;
for (const { path, content } of buildOutputs()) {
  const rel = relative(ROOT, path);
  if (!existsSync(path)) {
    console.error(`✗ 생성물 부재: ${rel}`);
    mismatch++;
    continue;
  }
  const actual = readFileSync(path, 'utf-8');
  if (actual !== content) {
    console.error(`✗ 생성물 불일치(def 와 어긋남): ${rel}`);
    mismatch++;
  }
}

if (mismatch > 0) {
  fail(`${mismatch}개 생성물이 def 와 동기화되지 않았습니다.`);
}

console.log('✓ contract-sync gate PASS: def ↔ 생성물 3산출 일치.');
