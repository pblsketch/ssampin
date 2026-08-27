// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * 증빙서류 요구 설정 매트릭스 — '미인정' 행이 노출되지 않는지 검증.
 *
 * 미인정은 학교 공통으로 서류를 걷지 않는다(도메인 DOC_EXEMPT_REASON_AXES가 정책보다 우선).
 * 표에 행이 남아 있으면 **체크해도 아무 일이 없는 칸**이 되어 설정을 신뢰할 수 없게 된다.
 * 도메인 규칙과 화면이 같은 목록(EDITABLE_DOC_REASON_AXES)에서 파생되는지 여기서 고정한다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Settings } from '@domain/entities/Settings';
import { RecordReminderSection } from '../RecordReminderSection';

vi.mock('@adapters/stores/useRecordReminderStore', () => ({
  useRecordReminderStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      pausedUntil: null,
      pauseForToday: vi.fn(),
      pauseForWeek: vi.fn(),
      clearPause: vi.fn(),
    }),
  isReminderPaused: () => false,
}));

afterEach(cleanup);

/** 이 테스트는 증빙서류 매트릭스만 본다 — 나머지 설정 필드는 기본값으로 충분하다. */
const draft = {} as Settings;

function renderSection() {
  return render(<RecordReminderSection draft={draft} patch={vi.fn()} />);
}

describe('증빙서류 요구 설정 매트릭스', () => {
  it("'미인정' 행이 표에 없다 (공통 제외라 켜고 끌 수 없다)", () => {
    renderSection();
    const statuses = ['결석', '지각', '조퇴', '결과'];
    for (const s of statuses) {
      expect(screen.queryByLabelText(`미인정 ${s} 증빙서류 요구`)).not.toBeInTheDocument();
    }
  });

  it('출석인정·질병·기타 행은 4개 구분 모두 편집할 수 있다', () => {
    renderSection();
    for (const axis of ['출석인정', '질병', '기타']) {
      for (const s of ['결석', '지각', '조퇴', '결과']) {
        expect(screen.getByLabelText(`${axis} ${s} 증빙서류 요구`)).toBeInTheDocument();
      }
    }
  });

  it('정책 미설정이면 기본값대로 출석인정·질병이 켜져 있고 기타는 꺼져 있다', () => {
    renderSection();
    expect(screen.getByLabelText('출석인정 결석 증빙서류 요구')).toBeChecked();
    expect(screen.getByLabelText('질병 결석 증빙서류 요구')).toBeChecked();
    expect(screen.getByLabelText('질병 지각 증빙서류 요구')).toBeChecked();
    expect(screen.getByLabelText('기타 결석 증빙서류 요구')).not.toBeChecked();
  });

  it('설명 문구가 새 기본값과 미인정 제외를 알려준다', () => {
    renderSection();
    expect(screen.getByText(/기본은 출석인정\(체험학습 등\)과 질병이고/)).toBeInTheDocument();
    expect(screen.getByText(/무단\(미인정\)은 서류를 걷지 않아 목록에 없어요/)).toBeInTheDocument();
  });
});
