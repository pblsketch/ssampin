// @vitest-environment jsdom
/**
 * SchoolYearWizardModal — 마법사 상태 전이(이어하기)·실행 전 파일 무변경 (S2.3 AC-1·AC-2).
 *
 * AC-1: 3단계에서 닫고 재진입하면 3단계로 복귀(진행은 localStorage에만).
 * AC-2: 실행 전까지 단계 이동만으로는 데이터 파일 쓰기가 0회다(storage.write/remove 미호출).
 *
 * + ArchivedTermNotice(S2.5) 노출 조건 — currentTerm과 보관함 존재를 둘 다 요구.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

/* ── 무거운 경계 3곳만 mock — 나머지는 실물 ─────────────────── */
const { storageFake, reloadStoresMock } = vi.hoisted(() => {
  const writes: { key: string; data: unknown }[] = [];
  const removes: string[] = [];
  return {
    reloadStoresMock: vi.fn(async () => {}),
    storageFake: {
      writes,
      removes,
      async read() {
        return null;
      },
      async write(key: string, data: unknown) {
        writes.push({ key, data });
      },
      async remove(key: string) {
        removes.push(key);
      },
      async readBinary() {
        return null;
      },
      async writeBinary() {},
      async removeBinary() {},
      async listBinary() {
        return [];
      },
    },
  };
});

vi.mock('@adapters/di/container', () => ({ storage: storageFake }));
vi.mock('@adapters/hooks/useDriveSync', () => ({ reloadStores: reloadStoresMock }));
// focus-trap은 jsdom의 레이아웃 부재(getClientRects=[])에서 "tabbable 없음"으로 throw한다 —
// 포커스 동작은 이 테스트의 관심사가 아니므로 통과 래퍼로 대체한다.
vi.mock('focus-trap-react', () => ({
  FocusTrap: ({ children }: { children: unknown }) => children,
}));

import { SchoolYearWizardModal } from '../SchoolYearWizardModal';
import {
  ArchivedTermNotice,
  invalidateArchivedTermNoticeCache,
  shouldShowArchivedTermNotice,
} from '../ArchivedTermNotice';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { YearTransitionGateway } from '@usecases/schoolYear/ExecuteYearTransition';

function makeGateway(): YearTransitionGateway {
  return {
    createSafetyBackup: vi.fn(async () => ({ ok: true as const, path: 'C:/fake' })),
    archiveCreate: vi.fn(async () => ({
      ok: true as const,
      term: '2026-1',
      label: 'x',
      entryCount: 0,
      totalBytes: 0,
    })),
    archiveRead: vi.fn(async () => ({
      ok: true as const,
      encoding: 'utf8' as const,
      content: '{"entries":[]}',
    })),
  };
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  storageFake.writes.length = 0;
  storageFake.removes.length = 0;
  invalidateArchivedTermNoticeCache();
});

describe('마법사 상태 전이 + 실행 전 파일 무변경 (AC-1·AC-2)', () => {
  test('1→2→3 이동 후 닫고 재진입하면 3단계 복귀, 데이터 파일 쓰기 0회', async () => {
    const gateway = makeGateway();
    const { unmount } = render(
      <SchoolYearWizardModal isOpen onClose={() => {}} closingTerm="2026-1" gateway={gateway} />,
    );

    // ① 안내
    expect(screen.getByText(/캐비닛에 넣어둘 준비/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));

    // ② 범위 확인
    expect(screen.getByText('보관할 기록을 확인해 주세요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));

    // ③ 새 학년도 프로필
    expect(screen.getByText('새 학년도의 나를 알려주세요')).toBeTruthy();

    // 닫았다가(언마운트) 재진입 — 3단계 복귀 (AC-1)
    unmount();
    render(
      <SchoolYearWizardModal isOpen onClose={() => {}} closingTerm="2026-1" gateway={gateway} />,
    );
    expect(screen.getByText('새 학년도의 나를 알려주세요')).toBeTruthy();

    // AC-2: 단계 이동만으로는 데이터 파일 쓰기·삭제·게이트웨이 호출이 전부 0
    expect(storageFake.writes).toHaveLength(0);
    expect(storageFake.removes).toHaveLength(0);
    expect(gateway.createSafetyBackup).not.toHaveBeenCalled();
    expect(gateway.archiveCreate).not.toHaveBeenCalled();
    expect(gateway.archiveRead).not.toHaveBeenCalled();
  });

  test('다른 학기의 잔재 진행은 무시하고 1단계부터 시작한다', () => {
    // 지난 학기('2025-2')의 진행 잔재
    window.localStorage.setItem(
      'ssampin:year-wizard-progress-v1',
      JSON.stringify({
        version: 1,
        closingTerm: '2025-2',
        step: 3,
        profile: useSettingsStore.getState().settings,
        savedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    render(
      <SchoolYearWizardModal
        isOpen
        onClose={() => {}}
        closingTerm="2026-1"
        gateway={makeGateway()}
      />,
    );
    expect(screen.getByText(/캐비닛에 넣어둘 준비/)).toBeTruthy();
  });

  test('프로필 편집도 실행 전에는 설정 파일에 반영되지 않는다', () => {
    render(
      <SchoolYearWizardModal
        isOpen
        onClose={() => {}}
        closingTerm="2026-1"
        gateway={makeGateway()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    const schoolInput = screen.getByLabelText('학교명');
    fireEvent.change(schoolInput, { target: { value: '새학교중학교' } });
    // 마법사 초안에는 반영
    expect((schoolInput as HTMLInputElement).value).toBe('새학교중학교');
    // 실제 설정(스토어·파일)은 무변경
    expect(useSettingsStore.getState().settings.schoolName).not.toBe('새학교중학교');
    expect(storageFake.writes).toHaveLength(0);
  });
});

describe('ArchivedTermNotice 노출 조건 (S2.5)', () => {
  test('shouldShowArchivedTermNotice — currentTerm과 보관함이 둘 다 있어야 true', () => {
    expect(shouldShowArchivedTermNotice(undefined, [])).toBe(false);
    expect(shouldShowArchivedTermNotice(undefined, ['2026-2'])).toBe(false);
    expect(shouldShowArchivedTermNotice('2027-1', [])).toBe(false);
    expect(shouldShowArchivedTermNotice('2027-1', ['2026-2'])).toBe(true);
  });

  test('조건 충족 시 보관 안내 + 설정 열기 버튼이 렌더된다', async () => {
    (window as unknown as { electronAPI?: unknown }).electronAPI = {
      archive: {
        list: async () => ({
          ok: true,
          archives: [
            {
              term: '2026-2',
              label: '2026학년도 2학기',
              archivedAt: '2027-02-20T00:00:00.000Z',
              appVersion: '2.3.0',
              entryCount: 17,
              totalBytes: 1024,
              manifestOk: true,
            },
          ],
        }),
      },
    };
    const prev = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...prev, currentTerm: '2027-1' } });

    render(<ArchivedTermNotice />);
    expect(await screen.findByText(/2026학년도 기록은 보관함에 안전하게 있어요/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '학년도 마무리 설정 열기' })).toBeTruthy();

    // 정리
    useSettingsStore.setState({ settings: prev });
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  test('전환 이력이 없으면(currentTerm 부재) 아무것도 렌더하지 않는다', () => {
    const { container } = render(<ArchivedTermNotice />);
    expect(container.innerHTML).toBe('');
  });
});
