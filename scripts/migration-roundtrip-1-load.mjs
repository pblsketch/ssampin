#!/usr/bin/env node
/**
 * migration-roundtrip step 1: v1 픽스처 로드 확인.
 *
 * tests/fixtures/multiSurvey-v1.json 파일이 존재하는지 확인한다.
 * 파일이 없으면 worker-2(migration-builder)가 아직 픽스처를 생성하지 않은 것이므로
 * 사람이 읽을 수 있는 안내 메시지와 함께 exit 1로 종료한다.
 *
 * 성공 시: JSON을 파싱하여 기본 구조(questions 배열)를 검증하고 요약 출력 후 exit 0.
 *
 * Plan §5.2 D11 + Q10: 5단계 분리 명령 패턴
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const FIXTURE_PATH = resolve(ROOT, 'tests/fixtures/multiSurvey-v1.json');

console.log('[step 1] v1 픽스처 로드 확인...');
console.log(`         경로: ${FIXTURE_PATH}`);

if (!existsSync(FIXTURE_PATH)) {
  console.error(
    '[step 1] v1 fixture missing at tests/fixtures/multiSurvey-v1.json. ' +
      'worker-2 (migration-builder) creates it via roundtrip.test.ts. ' +
      'Run that test once or hand-author the fixture.',
  );
  process.exit(1);
}

let fixture;
try {
  const raw = readFileSync(FIXTURE_PATH, 'utf-8');
  fixture = JSON.parse(raw);
} catch (err) {
  console.error(`[step 1] 픽스처 파싱 실패: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(fixture.questions)) {
  console.error('[step 1] v1 픽스처에 questions 배열이 없습니다. 픽스처 구조를 확인하세요.');
  process.exit(1);
}

console.log(`[step 1] OK — v1 픽스처 로드 완료. questions: ${fixture.questions.length}개`);
process.exit(0);
