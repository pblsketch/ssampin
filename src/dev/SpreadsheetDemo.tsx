/**
 * 개발용 데모 페이지 — SpreadsheetView를 mock 데이터로 확인.
 * 접근: npm run dev 후 http://localhost:5173/?demo=spreadsheet
 *
 * TODO: Step 4/5 완료 후 제거 가능 (또는 Storybook 도입 시 Story로 전환)
 */
import { useState } from 'react';
import type { MultiSurveyResultData } from '@domain/entities/ToolResult';
import { SpreadsheetView } from '@adapters/components/Tools/Results/SpreadsheetView';
import { useThemeApplier } from '@adapters/hooks/useThemeApplier';

const MOCK_DATA: MultiSurveyResultData = {
  type: 'multi-survey',
  title: '사례나눔 발제 피드백 (데모)',
  questions: [
    {
      id: 'q1',
      type: 'single-choice',
      question: '발제 내용의 이해도는 어느 정도였나요?',
      required: true,
      options: [
        { id: 'high', text: '높음' },
        { id: 'mid', text: '보통' },
        { id: 'low', text: '낮음' },
      ],
      maxLength: 200,
      scaleMin: 1,
      scaleMax: 5,
      scaleMinLabel: '',
      scaleMaxLabel: '',
    },
    {
      id: 'q2',
      type: 'multi-choice',
      question: '인상 깊었던 부분은? (복수 선택)',
      required: false,
      options: [
        { id: 'a', text: '구체적 사례 공유' },
        { id: 'b', text: '학생 반응' },
        { id: 'c', text: '수업 설계 의도' },
        { id: 'd', text: '교사의 반성적 성찰' },
      ],
      maxLength: 200,
      scaleMin: 1,
      scaleMax: 5,
      scaleMinLabel: '',
      scaleMaxLabel: '',
    },
    {
      id: 'q3',
      type: 'text',
      question: '발제를 보고 떠오르는 단어 또는 한줄 소감을 남겨주세요.',
      required: true,
      options: [],
      maxLength: 150,
      scaleMin: 1,
      scaleMax: 5,
      scaleMinLabel: '',
      scaleMaxLabel: '',
    },
    {
      id: 'q4',
      type: 'scale',
      question: '오늘 사례나눔의 만족도는?',
      required: true,
      options: [],
      maxLength: 200,
      scaleMin: 1,
      scaleMax: 5,
      scaleMinLabel: '매우 불만족',
      scaleMaxLabel: '매우 만족',
    },
    {
      id: 'q5',
      type: 'text',
      question: '(긴 텍스트 테스트) 발제자에게 질문이나 의견이 있다면?',
      required: false,
      options: [],
      maxLength: 500,
      scaleMin: 1,
      scaleMax: 5,
      scaleMinLabel: '',
      scaleMaxLabel: '',
    },
  ],
  submissions: [
    {
      id: 's1',
      submittedAt: new Date('2026-04-19T10:00:00').getTime(),
      answers: [
        { questionId: 'q1', value: 'high' },
        { questionId: 'q2', value: ['a', 'd'] },
        { questionId: 'q3', value: '공감, 성찰' },
        { questionId: 'q4', value: 5 },
        { questionId: 'q5', value: '학생들의 반응을 기록하는 구체적인 방법이 궁금해요.' },
      ],
    },
    {
      id: 's2',
      submittedAt: new Date('2026-04-19T10:03:00').getTime(),
      answers: [
        { questionId: 'q1', value: 'high' },
        { questionId: 'q2', value: ['a', 'b', 'c'] },
        { questionId: 'q3', value: '구체적 · 실천' },
        { questionId: 'q4', value: 4 },
        { questionId: 'q5', value: '' },
      ],
    },
    {
      id: 's3',
      submittedAt: new Date('2026-04-19T10:05:00').getTime(),
      answers: [
        { questionId: 'q1', value: 'mid' },
        { questionId: 'q2', value: ['b'] },
        { questionId: 'q3', value: '도전' },
        { questionId: 'q4', value: 3 },
        { questionId: 'q5', value: '학년별 차이를 어떻게 고려하셨나요?' },
      ],
    },
    {
      id: 's4',
      submittedAt: new Date('2026-04-19T10:06:00').getTime(),
      answers: [
        { questionId: 'q1', value: 'high' },
        { questionId: 'q2', value: ['a', 'c', 'd'] },
        { questionId: 'q3', value: '마음챙김, 진정성, 학습공동체, 함께-성장, 연결' },
        { questionId: 'q4', value: 5 },
        { questionId: 'q5', value: '이 실천을 지속하기 어려웠던 시기와 극복 방법이 궁금합니다. 특히 평가 시즌에 어떻게 균형을 잡으셨는지 구체적으로 듣고 싶어요.' },
      ],
    },
    {
      id: 's5',
      submittedAt: new Date('2026-04-19T10:08:00').getTime(),
      answers: [
        { questionId: 'q1', value: 'low' },
        { questionId: 'q2', value: [] },
        { questionId: 'q3', value: '' },
        { questionId: 'q4', value: 2 },
        // q5 미응답
      ],
    },
    {
      id: 's6',
      submittedAt: new Date('2026-04-19T10:10:00').getTime(),
      answers: [
        { questionId: 'q1', value: 'mid' },
        { questionId: 'q2', value: ['a', 'd'] },
        { questionId: 'q3', value: '공감' },
        { questionId: 'q4', value: 4 },
        { questionId: 'q5', value: '다음 발제 언제 하시나요?' },
      ],
    },
    {
      id: 's7',
      submittedAt: new Date('2026-04-19T10:12:00').getTime(),
      answers: [
        { questionId: 'q1', value: 'high' },
        { questionId: 'q2', value: ['a'] },
        { questionId: 'q3', value: '실천, 성장' },
        { questionId: 'q4', value: 5 },
        { questionId: 'q5', value: '제 학급에도 적용해보고 싶어요.' },
      ],
    },
  ],
};

export function SpreadsheetDemo() {
  useThemeApplier();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-sp-bg text-sp-text">
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="mb-2 text-2xl font-bold">SpreadsheetView 데모</h1>
        <p className="mb-4 text-sm text-sp-muted">
          개발용 페이지 — 7명 응답 · 5개 질문 (단일/복수/텍스트/척도 모두 포함)
        </p>
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-lg border border-sp-border bg-sp-surface px-3 py-1.5 text-sm text-sp-text transition hover:border-sp-accent"
          >
            모달 모드로 열기
          </button>
        </div>

        <div className="h-[80vh] overflow-hidden rounded-xl border border-sp-border">
          <SpreadsheetView source={{ mode: 'inline', data: MOCK_DATA }} />
        </div>
      </div>

      {modalOpen && (
        <SpreadsheetView
          source={{
            mode: 'modal',
            result: {
              id: 'demo',
              name: MOCK_DATA.title,
              toolType: 'multi-survey',
              data: MOCK_DATA,
              savedAt: new Date().toISOString(),
            },
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
