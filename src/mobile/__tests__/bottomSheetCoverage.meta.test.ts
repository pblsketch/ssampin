/**
 * 메타 테스트 — 모든 모바일 바텀시트/모달이 `useBottomSheet` 훅으로 전역 카운터에
 * 자기 자신을 등록하는지 확인. 새 시트를 추가하면서 등록을 빠뜨리면 (혹은 누군가
 * 삭제하면) QuickAddFab 이 시트 위에 떠올라 버튼을 가리는 회귀가 발생하므로
 * 이 테스트로 사전 차단한다.
 *
 * 화이트리스트 검사 방식: 알려진 시트 파일 목록을 직접 나열하고, 각 파일에
 * `useBottomSheet` 호출이 있는지 grep. 새 시트를 추가했다면 SHEETS_TO_REGISTER 에
 * 등록해야 한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');

/** 전역 FAB 가 가릴 위험이 있는 시트/모달 파일 목록. 새 시트 추가 시 여기 등록. */
const SHEETS_TO_REGISTER: ReadonlyArray<readonly [filePath: string, sheetLabel: string]> = [
  ['src/mobile/components/Students/PraiseMemoSheet.tsx', 'PraiseMemoSheet'],
  ['src/mobile/components/Share/MobileShareModal.tsx', 'MobileShareModal'],
  ['src/mobile/components/Today/MobileProgressLogModal.tsx', 'MobileProgressLogModal'],
  ['src/mobile/components/common/ConfirmDialog.tsx', 'ConfirmDialog (공용 삭제 확인)'],
  ['src/mobile/pages/students/StudentQuickActionSheet.tsx', 'StudentQuickActionSheet'],
  ['src/mobile/pages/SchedulePage.tsx', 'AddEventModal'],
  ['src/mobile/pages/todo/AddTodoModal.tsx', 'AddTodoModal'],
  ['src/mobile/pages/MemoPage.tsx', 'AddModal / EditModal'],
  ['src/mobile/pages/AttendanceCheckPage.tsx', 'periodMenu'],
];

describe('bottom-sheet coverage (meta)', () => {
  for (const [relPath, label] of SHEETS_TO_REGISTER) {
    it(`${label} (${relPath}) 가 useBottomSheet 를 호출한다`, () => {
      const fullPath = resolve(ROOT, relPath);
      const source = readFileSync(fullPath, 'utf8');
      expect(
        source,
        `${label} 가 useBottomSheet 훅을 호출하지 않습니다. 모바일 FAB 가 시트 위로 떠 버튼을 가리는 회귀를 막으려면 ` +
          `'@mobile/hooks/useBottomSheet' 를 import 하고 시트가 열려 있는 동안 useBottomSheet() 또는 useBottomSheet(isOpen) 을 호출하세요.`,
      ).toMatch(/useBottomSheet\s*\(/);
    });
  }

  it('QuickAddFab 는 useIsAnyBottomSheetOpen 을 구독한다 (fade-out 자동화)', () => {
    const fullPath = resolve(ROOT, 'src/mobile/components/QuickAddFab.tsx');
    const source = readFileSync(fullPath, 'utf8');
    expect(source).toMatch(/useIsAnyBottomSheetOpen\s*\(/);
  });
});
