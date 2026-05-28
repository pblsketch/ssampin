#!/usr/bin/env node
/**
 * measure-storage-capacity — Phase 2C US-2C-16 worst-case storage 추정.
 *
 * 계산 모델: lifecycle (migration 034) 적용 후의 steady-state.
 *   - 활성 요청 100건 (1년 운영 후, 마감되지 않은 요청만 유지)
 *   - 80 영역 × 10 페이지 × 3 PNG 유형 (page / region / submission) × 100 요청 < 500MB 목표 (PRD AC-7)
 *
 * 평균 파일 크기 (실측 기반, 측정 위치):
 *   - PDF 양식: ~1MB (일반 출결·연수 등록부, 이미지 적음). signature-templates lifecycle 1년 → 100개 미만 유지.
 *   - Page preview PNG: ~30KB (1024px wide, OffscreenCanvas convertToBlob 압축). 10 페이지.
 *   - Region preview PNG (cutout): ~5KB (서명 영역 단편). 80 region.
 *   - 서명 제출 PNG: ~10KB (256×128 캔버스, 손글씨 strokes 만 — 대부분 투명). 80 제출.
 *   - 합성 PDF (최신 2 버전 retention): ~1MB × 2 = 2MB.
 *
 * 목표: 누적 합 < 500MB. 초과 시 lifecycle 정책 또는 한도 재검토.
 *
 * 사용: node scripts/measure-storage-capacity.mjs
 * Exit 0: 목표 만족 / Exit 1: 초과
 */

const SCENARIO = {
  activeRequests: 100,
  perRequest: {
    pdfTemplate: 1 * 1024 * 1024, // 1MB
    pagePreviewsTotal: 10 * 30 * 1024, // 10 pages × 30KB
    regionPreviewsTotal: 80 * 5 * 1024, // 80 regions × 5KB
    signatureSubmissionsTotal: 80 * 10 * 1024, // 80 submissions × 10KB
    composedPdfsRetained: 2 * 1 * 1024 * 1024, // 2 versions × 1MB
  },
};

const TARGET_BYTES = 500 * 1024 * 1024; // 500MB

function fmtMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

const perRequestTotal =
  SCENARIO.perRequest.pdfTemplate +
  SCENARIO.perRequest.pagePreviewsTotal +
  SCENARIO.perRequest.regionPreviewsTotal +
  SCENARIO.perRequest.signatureSubmissionsTotal +
  SCENARIO.perRequest.composedPdfsRetained;

const aggregate = perRequestTotal * SCENARIO.activeRequests;

console.log('서명받기 Storage worst-case 시뮬레이션 (Phase 2C US-2C-16)');
console.log('───────────────────────────────────────────────────────────');
console.log(`활성 요청 수                : ${SCENARIO.activeRequests}`);
console.log(`요청당 PDF 양식 원본         : ${fmtMB(SCENARIO.perRequest.pdfTemplate)}`);
console.log(`요청당 page preview PNG 합계 : ${fmtMB(SCENARIO.perRequest.pagePreviewsTotal)}`);
console.log(`요청당 region preview PNG 합계: ${fmtMB(SCENARIO.perRequest.regionPreviewsTotal)}`);
console.log(
  `요청당 서명 제출 PNG 합계    : ${fmtMB(SCENARIO.perRequest.signatureSubmissionsTotal)}`,
);
console.log(`요청당 합성 PDF (최신 2 버전) : ${fmtMB(SCENARIO.perRequest.composedPdfsRetained)}`);
console.log('-----------------------------------------------------------');
console.log(`요청 1건 누적                 : ${fmtMB(perRequestTotal)}`);
console.log(`전체 누적 (active × 요청1건) : ${fmtMB(aggregate)}`);
console.log(`목표 한도                     : ${fmtMB(TARGET_BYTES)}`);
console.log('-----------------------------------------------------------');

if (aggregate < TARGET_BYTES) {
  const margin = TARGET_BYTES - aggregate;
  console.log(
    `PASS  — 한도 대비 여유 ${fmtMB(margin)} (${((margin / TARGET_BYTES) * 100).toFixed(1)}%)`,
  );
  process.exit(0);
} else {
  const over = aggregate - TARGET_BYTES;
  console.error(`FAIL  — 한도 초과 ${fmtMB(over)} (${((over / TARGET_BYTES) * 100).toFixed(1)}%)`);
  console.error(
    '대응: (a) signature-templates 보관 기간 단축, (b) 합성 버전 retention 1로 축소, (c) PNG 압축 강화',
  );
  process.exit(1);
}
