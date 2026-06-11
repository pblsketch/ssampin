#!/usr/bin/env node
/**
 * migration-roundtrip step 5: 라운드트립 결과 리포트 생성.
 *
 * 앞선 4단계의 중간 산출물을 읽어 최종 리포트를 생성한다.
 * tests/output/migration-roundtrip-report.json 에 결과를 저장한다.
 *
 * 리포트 형식:
 *   {
 *     ts: ISO8601 타임스탬프,
 *     status: 'ok' | 'fail',
 *     steps: [ { step, status, note } ],
 *     summary: "손실 0, questions N개 라운드트립 성공" | 오류 요약
 *   }
 *
 * 이 단계 자체는 독립적으로 실행 가능하지만, step 1~4가 완료된 후
 * 산출물이 있어야 의미있는 리포트가 생성된다.
 *
 * Plan §5.2 D11 + Q10: 5단계 분리 명령 패턴
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

const OUTPUT_DIR = resolve(ROOT, 'tests/output');
const REPORT_PATH = resolve(OUTPUT_DIR, 'migration-roundtrip-report.json');

const V1_ORIGINAL_PATH = resolve(ROOT, 'tests/fixtures/multiSurvey-v1.json');
const V2_INTERMEDIATE_PATH = resolve(OUTPUT_DIR, 'multiSurvey-v2-intermediate.json');
const V1_ROUNDTRIPPED_PATH = resolve(OUTPUT_DIR, 'multiSurvey-v1-roundtripped.json');

console.log('[step 5] 라운드트립 리포트 생성...');

// tests/output 디렉터리 생성 (없으면)
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`[step 5] tests/output/ 디렉터리 생성: ${OUTPUT_DIR}`);
}

const steps = [];
let overallStatus = 'ok';

// step 1: v1 픽스처 존재 여부
const step1Status = existsSync(V1_ORIGINAL_PATH) ? 'ok' : 'fail';
if (step1Status === 'fail') overallStatus = 'fail';
steps.push({
  step: 1,
  name: 'v1 픽스처 로드',
  status: step1Status,
  note:
    step1Status === 'ok'
      ? `픽스처 존재: ${V1_ORIGINAL_PATH}`
      : `픽스처 없음: ${V1_ORIGINAL_PATH} — worker-2 작업 필요`,
});

// step 2: v2 중간 결과 존재 여부
const step2Status = existsSync(V2_INTERMEDIATE_PATH) ? 'ok' : 'fail';
if (step2Status === 'fail') overallStatus = 'fail';
steps.push({
  step: 2,
  name: 'v1→v2 순방향 변환',
  status: step2Status,
  note:
    step2Status === 'ok'
      ? `v2 중간 결과 존재: ${V2_INTERMEDIATE_PATH}`
      : `v2 중간 결과 없음 — step 2 실패 또는 미실행`,
});

// step 3: v1' 라운드트립 결과 존재 여부
const step3Status = existsSync(V1_ROUNDTRIPPED_PATH) ? 'ok' : 'fail';
if (step3Status === 'fail') overallStatus = 'fail';
steps.push({
  step: 3,
  name: 'v2→v1 역방향 변환',
  status: step3Status,
  note:
    step3Status === 'ok'
      ? `v1' 결과 존재: ${V1_ROUNDTRIPPED_PATH}`
      : `v1' 결과 없음 — step 3 실패 또는 미실행`,
});

// step 4: v1 vs v1' 손실 여부 (두 파일 모두 있을 때만 비교)
let step4Status = 'skip';
let step4Note = '(step 1/3 미완료로 건너뜀)';
let questionCount = 0;

if (step1Status === 'ok' && step3Status === 'ok') {
  try {
    const v1 = JSON.parse(readFileSync(V1_ORIGINAL_PATH, 'utf-8'));
    const v1prime = JSON.parse(readFileSync(V1_ROUNDTRIPPED_PATH, 'utf-8'));

    // step 4(migration-roundtrip-4-diff.mjs)와 동일한 whitelist 유지.
    // 'required'는 v2 도메인에서 제거된 필드라 v2ToV1이 기본값(true)으로 복원 →
    // 라운드트립 byte-equal 검증에서 제외 (Design §4.2 lossy 허용 정책).
    // 본질적 손실 = 사용자 작성 내용(text/options/correctAnswer)만 검증한다.
    const V1_QUESTION_FIELDS = [
      'type',
      'text',
      'options',
      'correctAnswer',
      'correctAnswers',
      'multipleAnswers',
    ];

    const canonicalize = (survey) =>
      (Array.isArray(survey.questions) ? survey.questions : []).map((q) => {
        const c = {};
        for (const f of V1_QUESTION_FIELDS) {
          if (f in q) c[f] = q[f];
        }
        return c;
      });

    const q1 = canonicalize(v1);
    const q1p = canonicalize(v1prime);
    questionCount = q1.length;

    const mismatches = [];
    if (q1.length !== q1p.length) {
      mismatches.push(`questions 수: ${q1.length} vs ${q1p.length}`);
    } else {
      for (let i = 0; i < q1.length; i++) {
        if (JSON.stringify(q1[i]) !== JSON.stringify(q1p[i])) {
          mismatches.push(`questions[${i}] 불일치`);
        }
      }
    }

    if (mismatches.length > 0) {
      step4Status = 'fail';
      step4Note = `손실 발견: ${mismatches.join('; ')}`;
      overallStatus = 'fail';
    } else {
      step4Status = 'ok';
      step4Note = `손실 0 — questions ${q1.length}개 모두 byte-equal`;
    }
  } catch (err) {
    step4Status = 'fail';
    step4Note = `비교 중 오류: ${err.message}`;
    overallStatus = 'fail';
  }
}

steps.push({
  step: 4,
  name: "v1 vs v1' 손실 검증",
  status: step4Status,
  note: step4Note,
});

// step 5: 본 단계 자체
steps.push({
  step: 5,
  name: '리포트 생성',
  status: 'ok',
  note: `리포트 저장: ${REPORT_PATH}`,
});

const summary =
  overallStatus === 'ok'
    ? `손실 0, questions ${questionCount}개 라운드트립 성공`
    : `라운드트립 실패 — ${steps
        .filter((s) => s.status === 'fail')
        .map((s) => `step ${s.step}`)
        .join(', ')} 실패`;

const report = {
  ts: new Date().toISOString(),
  status: overallStatus,
  steps,
  summary,
};

writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');

console.log(`[step 5] 리포트 저장: ${REPORT_PATH}`);
console.log(`[step 5] 결과: ${overallStatus.toUpperCase()} — ${summary}`);

// wrapper(migration-roundtrip.mjs)가 step 5 exit code로 최종 판정을 한다.
// overallStatus가 'fail'이면 non-zero exit으로 propagate하여 거짓 양성 차단.
process.exit(overallStatus === 'ok' ? 0 : 1);
