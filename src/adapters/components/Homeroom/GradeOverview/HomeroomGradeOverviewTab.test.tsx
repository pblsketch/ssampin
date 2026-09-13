// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { StudentTranscript } from '@domain/entities/ImportedTranscript';

const mocks = vi.hoisted(() => ({ parse: vi.fn(), save: vi.fn() }));
vi.mock('@adapters/di/container', async () => {
  const { ManageImportedTranscript } =
    await import('@usecases/transcript/ManageImportedTranscript');
  return {
    parseTranscriptExcel: mocks.parse,
    manageImportedTranscript: new ManageImportedTranscript({
      load: async () => null,
      save: mocks.save,
    }),
  };
});
import { HomeroomGradeOverviewTab } from './HomeroomGradeOverviewTab';
import { useTranscriptStore } from '@adapters/stores/useTranscriptStore';

const original: StudentTranscript = {
  studentKey: '9',
  studentName: '기존학생',
  term: '2026 1학기',
  subjects: [{ subject: '국어', category: '국어', rawScore: 72 }],
};
const imported: StudentTranscript[] = [
  {
    studentKey: '1',
    studentName: '새학생가',
    term: '2026 2학기',
    subjects: [
      { subject: '국어', category: '국어', scoreText: '91.2(91)', achievement: 'A', rankGrade: 1 },
    ],
  },
  {
    studentKey: '2',
    studentName: '새학생나',
    term: '2026 2학기',
    subjects: [{ subject: '수학', category: '수학', rawScore: 60, achievement: 'D' }],
  },
];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue(undefined);
  mocks.parse.mockResolvedValue({
    students: imported,
    layout: { kind: 'ledger' },
    term: '2026 2학기',
    sheetName: '성적',
    classLabel: '1학년 2반',
    rawRows: [],
  });
  useTranscriptStore.setState({ students: [original], loaded: true });
});
afterEach(cleanup);
function upload(container: HTMLElement) {
  const file = new File(['synthetic'], '가상성적.xlsx');
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(0) });
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
}

describe('성적 가져오기 확인과 원본 보존', () => {
  it('미리보기에서는 저장하지 않고 취소하면 기존 성적을 유지한다', async () => {
    const { container } = render(<HomeroomGradeOverviewTab />);
    upload(container);
    await screen.findByRole('region', { name: '성적 가져오기 확인' });
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(useTranscriptStore.getState().students).toEqual([original]);
    expect(screen.queryByRole('region', { name: '성적 가져오기 확인' })).toBeNull();
  });
  it('확인 후 한 파일로 교체하고 전체 과목 수·원문 점수·분석 불가 안내를 표시한다', async () => {
    const { container } = render(<HomeroomGradeOverviewTab />);
    upload(container);
    fireEvent.click(await screen.findByRole('button', { name: '확인 후 반영' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: '성적 가져오기 확인' })).toBeNull(),
    );
    expect(useTranscriptStore.getState().students).toEqual(imported);
    expect(screen.getByRole('status').textContent).toContain('2명 · 과목 2개');
    expect(screen.getByText('91.2(91)')).toBeTruthy();
    expect(screen.getByText(/정보가 부족해 등급 경계를 계산/)).toBeTruthy();
    expect(screen.queryByText('기존학생')).toBeNull();
  });
  it('저장 실패는 읽기 실패와 구분하고 기존 데이터와 미리보기를 유지한다', async () => {
    mocks.save.mockRejectedValueOnce(new Error('disk unavailable'));
    const { container } = render(<HomeroomGradeOverviewTab />);
    upload(container);
    fireEvent.click(await screen.findByRole('button', { name: '확인 후 반영' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('저장하지 못했어요'),
    );
    expect(useTranscriptStore.getState().students).toEqual([original]);
    expect(screen.getByRole('region', { name: '성적 가져오기 확인' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '확인 후 반영' }));
    await waitFor(() => expect(useTranscriptStore.getState().students).toEqual(imported));
  });
  it('여러 시트나 학생 충돌 안내는 저장하지 않는다', async () => {
    mocks.parse.mockResolvedValueOnce({
      students: [],
      layout: null,
      problem: '성적이 있는 시트가 여러 개예요.',
      term: '',
      rawRows: [],
    });
    const { container } = render(<HomeroomGradeOverviewTab />);
    upload(container);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('여러 개'));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(useTranscriptStore.getState().students).toEqual([original]);
  });
  it('동시 파일 읽기는 하나만 진행하고 저장 중 중복 반영을 막는다', async () => {
    let finish: (() => void) | undefined;
    mocks.save.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { container } = render(<HomeroomGradeOverviewTab />);
    upload(container);
    upload(container);
    const apply = await screen.findByRole('button', { name: '확인 후 반영' });
    expect(mocks.parse).toHaveBeenCalledTimes(1);
    fireEvent.click(apply);
    fireEvent.click(apply);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    finish?.();
    await waitFor(() => expect(useTranscriptStore.getState().students).toEqual(imported));
  });
});
