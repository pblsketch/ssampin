/**
 * 메타 테스트 — 모든 모바일 바텀시트/모달이 전역 카운터에 자기 자신을 등록하는지 확인.
 * 등록을 빠뜨리면 (혹은 누군가 삭제하면) QuickAddFab 이 시트 위에 떠올라 버튼을 가리는
 * 회귀가 발생하므로 이 테스트로 사전 차단한다.
 *
 * 등록으로 인정하는 방식은 두 가지다.
 *   (a) 파일이 직접 `useBottomSheet()` 를 호출한다 — 기존 방식
 *   (b) 파일이 공용 껍데기 `<BottomSheet>` 를 렌더한다 — 껍데기 안에서 훅을 호출하므로
 *       사용만 해도 등록이 자동 보장된다
 *
 * ⚠️ (b) 를 인정한다고 해서 보장이 느슨해지지 않는다. 아래 '껍데기 자체' 테스트가
 * BottomSheet.tsx 가 실제로 useBottomSheet 를 호출하는지 검사하므로, 껍데기에서 훅이
 * 빠지면 (b) 경로를 쓰는 모든 시트가 한꺼번에 빨간불이 난다. 즉 검사 범위는 넓어졌고
 * 우회로는 없다.
 *
 * 새 시트를 추가했다면 SHEETS_TO_REGISTER 에 등록해야 한다. 항목 삭제는 금지.
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
  ['src/mobile/pages/students/StudentRecordsFullSheet.tsx', 'StudentRecordsFullSheet'],
  ['src/mobile/pages/students/StudentAttendanceHistorySheet.tsx', 'StudentAttendanceHistorySheet'],
  ['src/mobile/components/common/DateRangePickerSheet.tsx', 'DateRangePickerSheet'],
  ['src/mobile/pages/SchedulePage.tsx', 'AddEventModal'],
  ['src/mobile/pages/todo/AddTodoModal.tsx', 'AddTodoModal'],
  ['src/mobile/pages/MemoPage.tsx', 'AddModal / EditModal'],
  ['src/mobile/pages/AttendanceCheckPage.tsx', 'periodMenu'],
  ['src/mobile/pages/ToolRubricPage.tsx', 'GradingSheet (수행평가 채점)'],
  // 2026-08-12 추가 — 기존에 훅은 호출했지만 이 목록에 없어 검사 사각지대였던 항목들
  ['src/mobile/components/Class/ObservationSheet.tsx', 'ObservationSheet'],
  ['src/mobile/components/common/ActionSheet.tsx', 'ActionSheet (편집/삭제 공용)'],
];

/** 직접 훅 호출 */
const CALLS_HOOK = /useBottomSheet\s*\(/;
/** 공용 껍데기 렌더 — 껍데기 안에서 훅이 호출된다 */
const RENDERS_SHELL = /<BottomSheet[\s/>]/;

describe('bottom-sheet coverage (meta)', () => {
  for (const [relPath, label] of SHEETS_TO_REGISTER) {
    it(`${label} (${relPath}) 가 바텀시트 등록을 보장한다`, () => {
      const source = readFileSync(resolve(ROOT, relPath), 'utf8');
      const registered = CALLS_HOOK.test(source) || RENDERS_SHELL.test(source);
      expect(
        registered,
        `${label} 가 바텀시트 등록을 보장하지 않습니다. 모바일 FAB 가 시트 위로 떠 버튼을 가리는 회귀를 막으려면 ` +
          `공용 껍데기 '@mobile/components/common/BottomSheet' 를 사용하거나, ` +
          `'@mobile/hooks/useBottomSheet' 의 useBottomSheet() 를 직접 호출하세요.`,
      ).toBe(true);
    });
  }

  it('공용 껍데기 BottomSheet 가 useBottomSheet 를 호출한다 (껍데기 경로의 근거)', () => {
    const fullPath = resolve(ROOT, 'src/mobile/components/common/BottomSheet.tsx');
    const source = readFileSync(fullPath, 'utf8');
    expect(
      source,
      'BottomSheet 껍데기가 useBottomSheet 를 호출하지 않으면, 껍데기만 쓰는 시트들의 등록 보장이 통째로 무너집니다.',
    ).toMatch(CALLS_HOOK);
  });

  it('QuickAddFab 는 useIsAnyBottomSheetOpen 을 구독한다 (fade-out 자동화)', () => {
    const fullPath = resolve(ROOT, 'src/mobile/components/QuickAddFab.tsx');
    const source = readFileSync(fullPath, 'utf8');
    expect(source).toMatch(/useIsAnyBottomSheetOpen\s*\(/);
  });
});
