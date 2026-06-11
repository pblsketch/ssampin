#!/usr/bin/env node
/**
 * migration-roundtrip: 5단계 분리 명령 래퍼.
 *
 * Plan §5.2 D11 + Q10 5단계 분리 명령 패턴에 따라
 * step 1 → 5를 순차적으로 실행한다.
 *
 * 각 단계는 독립 스크립트(migration-roundtrip-{N}-*.mjs)로 분리되어 있어
 * 단계별 단독 실행도 가능하다 (build-avoidance, CLAUDE.md 정책).
 *
 * 동작:
 *   - 각 단계 실행 전 스텝 헤더를 출력한다
 *   - 단계가 non-zero exit code로 종료되면 즉시 중단하고 해당 exit code를 전파한다
 *   - 모든 단계 성공 시 exit 0
 *
 * 사용:
 *   node scripts/migration-roundtrip.mjs
 *   npm run migration-roundtrip
 *
 * 단계별 개별 실행:
 *   npm run migration-roundtrip:1-load
 *   npm run migration-roundtrip:2-forward
 *   npm run migration-roundtrip:3-backward
 *   npm run migration-roundtrip:4-diff
 *   npm run migration-roundtrip:5-report
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SCRIPTS_DIR = __dirname;

const STEPS = [
  { num: 1, script: 'migration-roundtrip-1-load.mjs', label: 'v1 픽스처 로드' },
  { num: 2, script: 'migration-roundtrip-2-forward.mjs', label: 'v1→v2 순방향 변환' },
  { num: 3, script: 'migration-roundtrip-3-backward.mjs', label: 'v2→v1 역방향 변환' },
  { num: 4, script: 'migration-roundtrip-4-diff.mjs', label: "v1 vs v1' 손실 검증" },
  { num: 5, script: 'migration-roundtrip-5-report.mjs', label: '리포트 생성' },
];

console.log('='.repeat(60));
console.log('migration-roundtrip: 5단계 라운드트립 검증 시작');
console.log('='.repeat(60));

for (const step of STEPS) {
  const scriptPath = resolve(SCRIPTS_DIR, step.script);
  console.log('');
  console.log(`${'─'.repeat(60)}`);
  console.log(`▶ Step ${step.num}/5: ${step.label}`);
  console.log(`${'─'.repeat(60)}`);

  const result = spawnSync('node', [scriptPath], {
    stdio: 'inherit',
    encoding: 'utf-8',
  });

  const exitCode = result.status ?? 1;

  if (exitCode !== 0) {
    console.error('');
    console.error(`✗ Step ${step.num} 실패 (exit ${exitCode}). 라운드트립 중단.`);
    process.exit(exitCode);
  }
}

console.log('');
console.log('='.repeat(60));
console.log('✓ migration-roundtrip 5단계 모두 성공');
console.log('='.repeat(60));
process.exit(0);
