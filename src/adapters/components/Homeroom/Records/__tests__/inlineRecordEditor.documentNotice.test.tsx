// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * 인라인 수정기의 증빙서류 3분기 검증 — 체크박스 / 안내 / 침묵.
 *
 * 원래 피드백("증빙서류 체크박스가 안 보인다")이 나온 바로 그 화면이다. 세 분기가 뒤섞이면
 * 다시 같은 혼란이 생긴다:
 *  - 정책 대상    → 체크박스
 *  - 정책 밖      → "왜 없는지 + 어디서 바꾸는지" 안내 (체크해도 아무 데도 안 나타나므로 체크박스 금지)
 *  - 미인정(공통) → 아무것도 안 그림 (방침을 바꿔도 안 걷으니 안내가 거짓말이 된다)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { InlineRecordEditor } from '../InlineRecordEditor';

const settingsState: { settings: Record<string, unknown> } = { settings: {} };

vi.mock('@adapters/stores/useSettingsStore', () => ({
  useSettingsStore: (selector: (s: typeof settingsState) => unknown) => selector(settingsState),
}));
// 첨부 목록은 별개 스토어에 의존 — 이 테스트의 관심사가 아니라 자리만 채운다.
vi.mock('@adapters/components/ClassManagement/ObservationAttachmentList', () => ({
  ObservationAttachmentList: () => null,
}));

const CATEGORIES: RecordCategoryItem[] = [
  { id: 'attendance', name: '출결 (ATTENDANCE)', color: 'red', subcategories: [] },
];

function makeRecord(subcategory: string): StudentRecord {
  return {
    id: 'r1',
    studentId: 's1',
    category: 'attendance',
    subcategory,
    content: '',
    date: '2026-08-27',
    createdAt: '2026-08-27T00:00:00.000Z',
  };
}

function renderEditor(subcategory: string) {
  return render(
    <InlineRecordEditor
      record={makeRecord(subcategory)}
      categories={CATEGORIES}
      editContent=""
      setEditContent={vi.fn()}
      editCategory="attendance"
      setEditCategory={vi.fn()}
      editSubcategory={subcategory}
      setEditSubcategory={vi.fn()}
      editDocumentSubmitted={false}
      setEditDocumentSubmitted={vi.fn()}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
}

const CHECKBOX = /증빙서류 제출 확인/;
const NOTICE = /지금 방침에선 이 출결의 증빙서류를 걷지 않아요/;

beforeEach(() => {
  settingsState.settings = {};
});
afterEach(cleanup);

describe('정책 대상 — 체크박스', () => {
  it('질병 결석은 기본 정책 대상이라 체크박스가 나온다 (원래 피드백 해소)', () => {
    renderEditor('결석 (질병)');
    expect(screen.getByText(CHECKBOX)).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('출석인정 지각도 대상', () => {
    renderEditor('지각 (인정)');
    expect(screen.getByText(CHECKBOX)).toBeInTheDocument();
  });
});

describe('정책 밖 — 안내와 딥링크', () => {
  it('기타 조퇴는 체크박스 대신 안내가 나온다 (체크해도 반영 안 되므로)', () => {
    renderEditor('조퇴 (기타)');
    expect(screen.queryByText(CHECKBOX)).not.toBeInTheDocument();
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it('[방침 바꾸기]는 기록 알림 설정 탭으로 가는 딥링크를 쏜다', () => {
    const seen: string[] = [];
    const onNavigate = (e: Event) => seen.push((e as CustomEvent<string>).detail);
    window.addEventListener('ssampin:navigate', onNavigate);
    try {
      renderEditor('조퇴 (기타)');
      fireEvent.click(screen.getByRole('button', { name: '방침 바꾸기' }));
      expect(seen).toEqual(['settings#record-reminder']);
    } finally {
      window.removeEventListener('ssampin:navigate', onNavigate);
    }
  });

  it('학교가 질병을 꺼 두면 질병 결석도 안내로 바뀐다 (설정을 실제로 따른다)', () => {
    settingsState.settings = {
      attendanceDocumentPolicy: {
        requiredBy: { 인정: ['absent', 'late', 'earlyLeave', 'classAbsence'] },
      },
    };
    renderEditor('결석 (질병)');
    expect(screen.queryByText(CHECKBOX)).not.toBeInTheDocument();
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });
});

describe('미인정 — 아무것도 그리지 않는다', () => {
  it('무단 결석에는 체크박스도 안내도 없다 (방침을 바꿔도 안 걷으므로)', () => {
    renderEditor('결석 (미인정)');
    expect(screen.queryByText(CHECKBOX)).not.toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('정책에 미인정을 켜 둬도 여전히 아무것도 안 그린다 (공통 규칙 우선)', () => {
    settingsState.settings = {
      attendanceDocumentPolicy: { requiredBy: { 미인정: ['absent'] } },
    };
    renderEditor('결석 (미인정)');
    expect(screen.queryByText(CHECKBOX)).not.toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});
