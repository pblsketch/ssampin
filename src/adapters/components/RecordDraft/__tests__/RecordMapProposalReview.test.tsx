// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { RecordMapStudentProposal } from '@domain/entities/RecordMapProposal';
import {
  RecordMapProposalReview,
  recordMapProposalReviewBlockers,
} from '../RecordMapProposalReview';

const evidence = {
  id: 'e-1',
  studentRef: 's-1',
  areas: ['subject' as const],
  content: '토론에서 근거를 비교하고 결론을 수정한 원문 전체',
  date: '2026-09-01',
  sourceType: 'observation' as const,
  note: '수정 과정이 핵심임',
  createdAt: 1,
  updatedAt: 1,
};
const scaffold = {
  id: 'scaffold-1',
  name: '자료 비교형',
  frame: 'inquiry' as const,
  scenes: [{ role: 'process' as const, label: '근거 비교' }],
};

function proposal(scaffoldId: string | null = scaffold.id): RecordMapStudentProposal {
  return {
    schemaVersion: 1,
    runId: 'run',
    attemptId: 'attempt',
    context: { studentRef: 's-1', area: 'subject', term: '2026-2' },
    sourceFingerprint: 'fingerprint',
    requestEvidence: {
      includedEvidenceIds: ['e-1'],
      excludedCounts: { teacher: 1, empty: 2, prohibited: 3, tooLong: 4 },
      suppressedMemoCount: 5,
    },
    topics: [
      {
        id: 'tmp:topic',
        title: '토론 탐구',
        status: 'open',
        scaffold: {
          scaffoldId,
          reason: scaffoldId === null ? '맞는 후보가 없음' : '자료 비교 과정이 중심임',
        },
        scenes: [
          {
            id: 'tmp:scene',
            role: 'process',
            label: '근거 비교',
            note: '비교 기준을 드러냄',
            leadIn: '질문에서 비교로 이어짐',
            evidenceIds: ['e-1'],
          },
        ],
      },
    ],
    unplacedEvidence: [],
    warnings: ['결론 근거를 확인하세요.'],
    runStatus: 'generated',
    reviewStatus: 'unreviewed',
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('RecordMapProposalReview', () => {
  afterEach(cleanup);

  it('AI 제안의 뼈대·장면·메모·이음말과 감사 건수를 읽고 원문을 키보드 버튼으로 펼친다', () => {
    render(
      <RecordMapProposalReview
        proposal={proposal()}
        policy={{ kind: 'ai', candidates: [scaffold] }}
        evidences={[evidence]}
        threads={[]}
        scaffoldCandidates={[scaffold]}
        sourceChanged={false}
        onRerunSource={vi.fn()}
        onRerunWithScaffold={vi.fn()}
      />,
    );

    expect(screen.getByText('뼈대: 자료 비교형')).toBeTruthy();
    expect(screen.getByText(/AI 제안 메모/)).toBeTruthy();
    expect(screen.getByText('비교 기준을 드러냄')).toBeTruthy();
    expect(screen.getByText(/앞 장면 이음말/)).toBeTruthy();
    expect(screen.getByText('질문에서 비교로 이어짐')).toBeTruthy();
    expect(screen.getByText(/교사 제외 1건.*너무 긴 자료 4건.*생략 메모 5건/)).toBeTruthy();
    const evidenceButton = screen.getByRole('button', { name: /근거 1/ });
    expect(evidenceButton.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(evidenceButton);
    expect(evidenceButton.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/2026-09-01 · 관찰기록/)).toBeTruthy();
    expect(screen.getByText(/선생님 기록 메모/)).toBeTruthy();
    expect(screen.getByText('수정 과정이 핵심임')).toBeTruthy();
  });

  it('현재 지도 전환과 뼈대 미해결 재제안 동작을 제공하고 누락 근거를 차단한다', () => {
    const rerun = vi.fn();
    render(
      <RecordMapProposalReview
        proposal={proposal(null)}
        policy={{ kind: 'ai', candidates: [scaffold] }}
        evidences={[]}
        threads={[
          {
            id: 'thread',
            studentRef: 's-1',
            title: '현재 탐구',
            keywords: [],
            status: 'open',
            term: '2026-2',
            scenes: [],
            createdAt: 1,
            updatedAt: 1,
          },
        ]}
        scaffoldCandidates={[scaffold]}
        sourceChanged={false}
        onRerunSource={vi.fn()}
        onRerunWithScaffold={rerun}
      />,
    );

    expect(
      screen.getAllByRole('alert').some((item) => item.textContent?.includes('원본 근거 1건')),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '현재 지도' }));
    expect(screen.getByText('현재 탐구')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: '다시 제안할 뼈대' }), {
      target: { value: scaffold.id },
    });
    fireEvent.click(screen.getByRole('button', { name: '이 뼈대로 다시 제안' }));
    fireEvent.change(screen.getByRole('combobox', { name: '다시 제안할 주제' }), {
      target: { value: 'tmp:topic' },
    });
    fireEvent.click(screen.getByRole('button', { name: '이 뼈대로 다시 제안' }));
    expect(rerun).toHaveBeenCalledWith(scaffold.id, 'tmp:topic');
    expect(
      recordMapProposalReviewBlockers(proposal(null), [], {
        kind: 'ai',
        candidates: [scaffold],
      }),
    ).toMatchObject({
      unresolvedScaffold: true,
      missingEvidenceIds: ['e-1'],
    });
  });

  it('기존 구성 정책의 기존 주제 scaffoldId null은 허용하고 AI 미선택만 차단한다', () => {
    const base = proposal(null);
    const existing = {
      ...base,
      topics: [{ ...base.topics[0]!, existingThreadId: 'thread-1' }],
    };

    expect(
      recordMapProposalReviewBlockers(existing, [evidence], {
        kind: 'existing',
        defaultScaffold: scaffold,
      }).unresolvedScaffold,
    ).toBe(false);
    expect(
      recordMapProposalReviewBlockers(existing, [evidence], {
        kind: 'ai',
        candidates: [scaffold],
      }).unresolvedScaffold,
    ).toBe(true);
  });
});
