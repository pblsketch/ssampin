/**
 * 수행평가 피드백 PDF (FR-6) — 실제 바이트 검증.
 * 실제 public/fonts 서브셋을 임베드해 PDF 를 생성하고, pdf-lib 로 재로드해
 * 페이지 수·매직 바이트를 확인한다 (런타임 검증 원칙).
 * 점수 숨김의 정확성은 도메인 buildRubricFeedbackDocs 테스트가 보장한다.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { Rubric, RubricGrading } from '@domain/entities/Rubric';
import { buildRubricFeedbackDocs, type RubricFeedbackDoc } from '@domain/rules/rubricRules';
import { __resetFontCache, loadKoreanFontBuffers } from './FontRegistry';
import { exportRubricFeedbackToPdf } from './RubricFeedbackPdf';

/** Node 환경에는 fetch 상대경로가 없으므로 fs fetcher 로 폰트 캐시를 선워밍 */
beforeAll(async () => {
  __resetFontCache();
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const root = process.cwd();
  await loadKoreanFontBuffers(async (url: string) => {
    const buf = await fs.readFile(path.join(root, 'public', url));
    const copy = new ArrayBuffer(buf.byteLength);
    new Uint8Array(copy).set(buf);
    return copy;
  }, '');
});

const DOC_GRADED: RubricFeedbackDoc = {
  studentNumber: 1,
  studentName: '성춘향',
  isAbsent: false,
  blocks: [
    {
      criterionName: '주장의 명확성',
      levels: [
        { name: '탁월함', score: 10, checked: false },
        { name: '잘함', score: 8, checked: true, description: '주장이 명확하고 일관됨' },
        { name: '보통', score: 6, checked: false },
      ],
      note: '서론의 주장 제시가 좋았음',
    },
    {
      criterionName: '근거의 타당성',
      levels: [
        { name: '우수', score: 5, checked: true },
        { name: '미흡', score: 2, checked: false },
      ],
    },
  ],
  overallFeedback:
    '논리 전개가 한 학기 동안 크게 좋아졌어요. 다음에는 반론 다루기에 도전해 봅시다.',
  total: 13,
  maxScore: 15,
};

const DOC_ABSENT: RubricFeedbackDoc = {
  ...DOC_GRADED,
  studentNumber: 2,
  studentName: '방자',
  isAbsent: true,
  blocks: DOC_GRADED.blocks.map((b) => ({
    ...b,
    levels: b.levels.map((l) => ({ ...l, checked: false })),
  })),
  total: null,
};

describe('exportRubricFeedbackToPdf', () => {
  it(
    '학생 2명 → 최소 2페이지 유효 PDF (%PDF 매직 + 재로드 성공)',
    { timeout: 30_000 },
    async () => {
      const buffer = await exportRubricFeedbackToPdf({
        title: '설득하는 글쓰기',
        className: '2학년 3반 국어',
        docs: [DOC_GRADED, DOC_ABSENT],
      });

      const head = new TextDecoder().decode(new Uint8Array(buffer).slice(0, 5));
      expect(head).toBe('%PDF-');

      const loaded = await PDFDocument.load(buffer);
      expect(loaded.getPageCount()).toBeGreaterThanOrEqual(2);
    },
  );

  // 전체 스위트 병렬 부하에서 폰트 임베드(subset:false ×2)가 느려질 수 있어 타임아웃 명시
  it(
    '긴 총평·메모도 페이지 넘침 없이(이어지는 페이지로) 유효한 PDF 를 만든다',
    { timeout: 30_000 },
    async () => {
      const longText = '아주 긴 피드백 문장. '.repeat(80);
      const doc: RubricFeedbackDoc = {
        ...DOC_GRADED,
        blocks: DOC_GRADED.blocks.map((b) => ({ ...b, note: longText })),
        overallFeedback: longText,
      };
      const buffer = await exportRubricFeedbackToPdf({ title: '긴 문서', docs: [doc] });
      const loaded = await PDFDocument.load(buffer);
      // 한 학생이라도 내용이 넘치면 페이지가 늘어난다
      expect(loaded.getPageCount()).toBeGreaterThanOrEqual(2);
    },
  );

  // 사용자 신고 회귀 가드 (2026-06-12): 점수 포함 해제 시 출력 오류
  it(
    '점수 숨김(전 score/total/maxScore null) 문서도 유효한 PDF 를 만든다',
    { timeout: 30_000 },
    async () => {
      const hidden: RubricFeedbackDoc = {
        ...DOC_GRADED,
        blocks: DOC_GRADED.blocks.map((b) => ({
          ...b,
          levels: b.levels.map((l) => ({ ...l, score: null })),
        })),
        total: null,
        maxScore: null,
      };
      const buffer = await exportRubricFeedbackToPdf({
        title: '점수 숨김',
        className: '2학년 3반 국어',
        docs: [hidden],
      });
      const loaded = await PDFDocument.load(buffer);
      expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
    },
  );

  it('빈 대상 목록도 유효한 PDF (1페이지)', { timeout: 30_000 }, async () => {
    const buffer = await exportRubricFeedbackToPdf({ title: '빈 문서', docs: [] });
    const loaded = await PDFDocument.load(buffer);
    expect(loaded.getPageCount()).toBe(1);
  });

  // 모달과 동일한 풀 파이프라인 (도메인 빌더 → 렌더러) — 점수 포함 ON/OFF 모두
  it(
    '도메인 buildRubricFeedbackDocs 결과를 점수 ON/OFF 양쪽 다 렌더한다 (완료/부분/결시/미채점 혼합)',
    { timeout: 30_000 },
    async () => {
      const rubric: Rubric = {
        id: 'r1',
        classId: 'c1',
        title: '예시',
        criteria: [
          {
            id: 'cr1',
            name: '111',
            order: 0,
            levels: [
              { id: 'l1', name: '탁월함', score: 10 },
              { id: 'l2', name: '잘함', score: 8, description: '근거가 충분함' },
              { id: 'l3', name: '보통', score: 6 },
              { id: 'l4', name: '노력 필요', score: 4 },
            ],
          },
          {
            id: 'cr2',
            name: '222',
            order: 1,
            levels: [
              { id: 'l5', name: '상', score: 5 },
              { id: 'l6', name: '하', score: 2 },
            ],
          },
        ],
        createdAt: '2026-06-12T00:00:00.000Z',
        updatedAt: '2026-06-12T00:00:00.000Z',
      };
      const gradings: RubricGrading[] = [
        {
          id: 'g1',
          rubricId: 'r1',
          classId: 'c1',
          studentId: 's1',
          status: 'graded',
          marks: { cr1: 'l1', cr2: 'l5' },
          criterionNotes: { cr1: '발표 태도 좋음' },
          overallFeedback: '한 학기 동안 성장이 큽니다.',
          gradedAt: '2026-06-12T00:00:00.000Z',
        },
        {
          id: 'g2',
          rubricId: 'r1',
          classId: 'c1',
          studentId: 's2',
          status: 'partial',
          marks: { cr1: 'l2' },
          criterionNotes: {},
          gradedAt: '2026-06-12T00:00:00.000Z',
        },
        {
          id: 'g3',
          rubricId: 'r1',
          classId: 'c1',
          studentId: 's3',
          status: 'absent',
          marks: {},
          criterionNotes: {},
          gradedAt: '2026-06-12T00:00:00.000Z',
        },
      ];
      const students = [
        { key: 's1', number: 1, name: '김민지' },
        { key: 's2', number: 2, name: '이서연' },
        { key: 's3', number: 3, name: '박지민' },
        { key: 's4', number: 4, name: '최예은' }, // 기록 없음(미채점)
      ];

      for (const includeScores of [true, false]) {
        const docs = buildRubricFeedbackDocs(rubric, gradings, students, includeScores);
        const buffer = await exportRubricFeedbackToPdf({
          title: rubric.title,
          className: '2학년 3반 국어',
          docs,
        });
        const loaded = await PDFDocument.load(buffer);
        expect(loaded.getPageCount()).toBeGreaterThanOrEqual(4);
      }
    },
  );
});
