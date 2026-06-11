#!/usr/bin/env node
/**
 * migration-roundtrip step 4: v1 vs v1' 라운드트립 손실 검증.
 *
 * tests/fixtures/multiSurvey-v1.json (원본 v1) 과
 * tests/output/multiSurvey-v1-roundtripped.json (v1→v2→v1' 변환 결과) 를
 * 비교하여 v1 관련 필드의 손실 여부를 확인한다.
 *
 * 비교 대상 필드 (v1 whitelist — v2 전용 필드 제외):
 *   questions[].type, questions[].text, questions[].options,
 *   questions[].correctAnswer, questions[].correctAnswers,
 *   questions[].multipleAnswers, questions[].required
 *
 * node:assert/strict deepStrictEqual 사용 (라이브러리 의존 없음, build-avoidance).
 *
 * Plan §5.2 D11 + Q10: 5단계 분리 명령 패턴
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

const V1_ORIGINAL_PATH = resolve(ROOT, 'tests/fixtures/multiSurvey-v1.json');
const V1_ROUNDTRIPPED_PATH = resolve(ROOT, 'tests/output/multiSurvey-v1-roundtripped.json');

// v1 관련 필드 whitelist (v2 전용 신규 필드 제외)
// required 는 v2에서 제거된 필드라 역변환 시 복원 불가 (Design §4.2 lossy 허용)
const V1_QUESTION_FIELDS = [
  'type',
  'text',
  'options',
  'correctAnswer',
  'correctAnswers',
  'multipleAnswers',
];

console.log("[step 4] v1 vs v1' 라운드트립 손실 검증...");

if (!existsSync(V1_ORIGINAL_PATH)) {
  console.error('[step 4] v1 원본 픽스처가 없습니다. step 1을 먼저 실행하세요.');
  process.exit(1);
}

if (!existsSync(V1_ROUNDTRIPPED_PATH)) {
  console.error("[step 4] v1' 라운드트립 결과가 없습니다. step 3을 먼저 실행하세요.");
  process.exit(1);
}

const v1 = JSON.parse(readFileSync(V1_ORIGINAL_PATH, 'utf-8'));
const v1prime = JSON.parse(readFileSync(V1_ROUNDTRIPPED_PATH, 'utf-8'));

/**
 * questions 배열에서 v1 whitelist 필드만 추출하여 정규화한다.
 * @param {object} survey
 * @returns {object[]}
 */
function canonicalizeQuestions(survey) {
  if (!Array.isArray(survey.questions)) return [];
  return survey.questions.map((q) => {
    const canonical = {};
    for (const field of V1_QUESTION_FIELDS) {
      if (field in q) {
        canonical[field] = q[field];
      }
    }
    return canonical;
  });
}

const v1Questions = canonicalizeQuestions(v1);
const v1primeQuestions = canonicalizeQuestions(v1prime);

let diffFound = false;
const diffs = [];

if (v1Questions.length !== v1primeQuestions.length) {
  diffs.push(
    `questions 수 불일치: 원본 ${v1Questions.length}개 vs 라운드트립 ${v1primeQuestions.length}개`,
  );
  diffFound = true;
} else {
  for (let i = 0; i < v1Questions.length; i++) {
    try {
      assert.deepStrictEqual(v1primeQuestions[i], v1Questions[i], `questions[${i}] 불일치`);
    } catch (err) {
      diffs.push(`questions[${i}]: ${err.message}`);
      diffFound = true;
    }
  }
}

if (diffFound) {
  console.error('[step 4] FAIL — 라운드트립 손실 발견:');
  for (const d of diffs) {
    console.error(`         ${d}`);
  }
  process.exit(1);
}

console.log(
  `[step 4] OK — 손실 0. questions ${v1Questions.length}개 모두 v1 whitelist 필드 byte-equal.`,
);
process.exit(0);
