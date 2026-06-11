#!/usr/bin/env node
/**
 * migration-roundtrip step 2: v1 → v2 순방향 변환.
 *
 * tests/fixtures/multiSurvey-v1.json을 읽어 v1ToV2 어댑터로 변환하고,
 * 결과를 tests/output/multiSurvey-v2-intermediate.json에 저장한다.
 *
 * v1ToV2 어댑터 위치:
 *   src/adapters/multiSurvey/migration/v1ToV2.ts (worker-2 영역)
 *   tsx를 사용해 TypeScript 소스를 직접 실행한다 (build-avoidance, CLAUDE.md 정책).
 *
 * 어댑터가 없으면: exit 1 + worker-2 안내 메시지.
 *
 * Plan §5.2 D11 + Q10: 5단계 분리 명령 패턴
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

const FIXTURE_PATH = resolve(ROOT, 'tests/fixtures/multiSurvey-v1.json');
const OUTPUT_DIR = resolve(ROOT, 'tests/output');
const OUTPUT_PATH = resolve(OUTPUT_DIR, 'multiSurvey-v2-intermediate.json');

// worker-2가 생성할 어댑터 경로 (TypeScript 소스)
const ADAPTER_TS_PATH = resolve(ROOT, 'src/adapters/multiSurvey/migration/v1ToV2.ts');

console.log('[step 2] v1 → v2 순방향 변환...');

if (!existsSync(ADAPTER_TS_PATH)) {
  console.error(
    '[step 2] v1ToV2 adapter not landed yet (worker-2 territory). ' +
      `예상 경로: ${ADAPTER_TS_PATH}`,
  );
  process.exit(1);
}

if (!existsSync(FIXTURE_PATH)) {
  console.error('[step 2] v1 픽스처가 없습니다. step 1을 먼저 실행하세요.');
  process.exit(1);
}

// tsx로 어댑터를 inline 실행하는 헬퍼 스크립트를 생성 후 실행
// (dynamic import는 tsx 등록 없이 .ts를 직접 import 할 수 없으므로 tsx spawn 패턴)
const helperScript = `
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = ${JSON.stringify(ROOT)};
const fixture = JSON.parse(readFileSync(${JSON.stringify(FIXTURE_PATH)}, 'utf-8'));

// worker-2 어댑터의 named export: migrateV1ToV2(v1: MultiSurveyV1): MultiSurveyV2
// pathToFileURL: Windows 절대 경로를 file:// URL로 변환 (ERR_UNSUPPORTED_ESM_URL_SCHEME 방지)
const { migrateV1ToV2 } = await import(pathToFileURL(${JSON.stringify(ADAPTER_TS_PATH)}).href);
const v2 = migrateV1ToV2(fixture);

if (!existsSync(${JSON.stringify(OUTPUT_DIR)})) {
  mkdirSync(${JSON.stringify(OUTPUT_DIR)}, { recursive: true });
}
writeFileSync(${JSON.stringify(OUTPUT_PATH)}, JSON.stringify(v2, null, 2), 'utf-8');
console.log('[step 2] OK — v2 중간 결과 저장:', ${JSON.stringify(OUTPUT_PATH)});
`;

const result = spawnSync('node', ['--import', 'tsx/esm', '--input-type=module'], {
  input: helperScript,
  cwd: ROOT,
  encoding: 'utf-8',
  stdio: ['pipe', 'inherit', 'inherit'],
});

if (result.status !== 0) {
  console.error(`[step 2] 변환 실패 (exit ${result.status})`);
  process.exit(result.status ?? 1);
}

process.exit(0);
