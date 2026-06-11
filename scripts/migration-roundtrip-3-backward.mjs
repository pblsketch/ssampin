#!/usr/bin/env node
/**
 * migration-roundtrip step 3: v2 → v1 역방향 변환.
 *
 * tests/output/multiSurvey-v2-intermediate.json을 읽어 v2ToV1 어댑터로 변환하고,
 * 결과를 tests/output/multiSurvey-v1-roundtripped.json에 저장한다.
 *
 * v2ToV1 어댑터 위치:
 *   src/adapters/multiSurvey/migration/v2ToV1.ts (worker-2 영역)
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

const V2_INTERMEDIATE_PATH = resolve(ROOT, 'tests/output/multiSurvey-v2-intermediate.json');
const OUTPUT_DIR = resolve(ROOT, 'tests/output');
const OUTPUT_PATH = resolve(OUTPUT_DIR, 'multiSurvey-v1-roundtripped.json');

// worker-2가 생성할 어댑터 경로 (TypeScript 소스)
const ADAPTER_TS_PATH = resolve(ROOT, 'src/adapters/multiSurvey/migration/v2ToV1.ts');

console.log('[step 3] v2 → v1 역방향 변환...');

if (!existsSync(ADAPTER_TS_PATH)) {
  console.error(
    '[step 3] v2ToV1 adapter not landed yet (worker-2 territory). ' +
      `예상 경로: ${ADAPTER_TS_PATH}`,
  );
  process.exit(1);
}

if (!existsSync(V2_INTERMEDIATE_PATH)) {
  console.error('[step 3] v2 중간 결과가 없습니다. step 2를 먼저 실행하세요.');
  process.exit(1);
}

// tsx로 어댑터를 inline 실행
const helperScript = `
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const v2 = JSON.parse(readFileSync(${JSON.stringify(V2_INTERMEDIATE_PATH)}, 'utf-8'));

// worker-2 어댑터의 named export: migrateV2ToV1(v2: MultiSurveyV2): MultiSurveyV1
// pathToFileURL: Windows 절대 경로를 file:// URL로 변환 (ERR_UNSUPPORTED_ESM_URL_SCHEME 방지)
const { migrateV2ToV1 } = await import(pathToFileURL(${JSON.stringify(ADAPTER_TS_PATH)}).href);
const v1prime = migrateV2ToV1(v2);

if (!existsSync(${JSON.stringify(OUTPUT_DIR)})) {
  mkdirSync(${JSON.stringify(OUTPUT_DIR)}, { recursive: true });
}
writeFileSync(${JSON.stringify(OUTPUT_PATH)}, JSON.stringify(v1prime, null, 2), 'utf-8');
console.log('[step 3] OK — v1\\'(라운드트립) 저장:', ${JSON.stringify(OUTPUT_PATH)});
`;

const result = spawnSync('node', ['--import', 'tsx/esm', '--input-type=module'], {
  input: helperScript,
  cwd: ROOT,
  encoding: 'utf-8',
  stdio: ['pipe', 'inherit', 'inherit'],
});

if (result.status !== 0) {
  console.error(`[step 3] 변환 실패 (exit ${result.status})`);
  process.exit(result.status ?? 1);
}

process.exit(0);
