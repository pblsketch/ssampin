/*
  디자인 시스템 메타테스트 — amber-on-amber 가독성 가드.

  배경: 다크 모드 페이지에서 옅은 amber 알파 배경 위에 옅은 amber 텍스트를 두는
  ad-hoc 안내 박스 패턴이 코드베이스 곳곳에 반복되며 베이지 위 노랑 효과로
  가독성이 떨어졌다 (WCAG AA fail).

  가드 정책:
  - large container (여러 단어 안내 박스 — padding p-3 / p-4 / px-3 py-2 동반) 안에서
    amber bg + 옅은 amber text 조합 신규 추가 금지
  - 대안: <Notice variant="warning"> 를 쓴다.

  권장 대안 변경 (2026-08-18) — 예전에는 `bg-sp-card + border-l-amber-400 + text-sp-text`
  (좌측 4px stripe)를 권했다. 그 방식은 가독성 목적은 달성했지만 경고·분류색·현재상태·인용문이
  전부 같은 띠가 되어 "AI 가 만든 화면" 으로 읽힌다는 지적을 받았다(준일님, 2026-08-18).
  Notice 가 색조 면 + 아이콘 칩 방식으로 재설계되었으므로 **직접 만들지 말고 Notice 를 쓴다.**
  직접 만들어야 한다면 색은 `color-mix(in srgb, var(--sp-warning) 7%, var(--sp-card))` 로 면에
  녹이고 본문은 `text-sp-text` 로 둔다 — `bg-sp-warning/7` 같은 표기는 sp-* 토큰에 듣지 않는다.

  작은 badge/chip 케이스 (px-1.5 py-0.5, text-[10px] 등) 는 본 가드 범위 밖.
  점진적으로 화이트리스트를 줄여 가는 형태로 운영.
*/

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

// 화이트리스트 — 작은 badge/chip 으로 가독성 영향이 적거나, 별도 작업으로 이관 예정인 위치.
// 신규 항목 추가는 PR 코드리뷰에서 정당성 확인 후 허용.
const ALLOWED_FILES: readonly string[] = [
  // top bar 패턴 (border-b full-width) — Notice 의 box 외관(rounded-lg + 색조 면)과
  // 시각 동등 불가. 별도 TopAlertBar 컴포넌트 도입 시 재평가 (notice-phase2-migration, 2026-05-20)
  'src/adapters/components/Tools/InteractiveSlides/Presenter/LessonPresenter.tsx',
  'src/slides-student/pages/SlidePage.tsx',
  // status badge / chip (좁은 라벨 → 영향 작음, 라이트 테마 가독성은 Phase 2B CSS override 가 처리)
  'src/adapters/components/ClassManagement/AttendanceTab.tsx',
  'src/adapters/components/ClassManagement/ClassRecordInputView.tsx',
  'src/adapters/components/ClassManagement/ClassRecordSearchView.tsx',
  'src/adapters/components/ClassManagement/ClassSeatingTab.tsx',
  'src/adapters/components/ClassManagement/ObservationTab.tsx',
  'src/adapters/components/ClassManagement/ProgressTab.tsx',
  'src/adapters/components/ClassManagement/shared/AttendanceMatrixCore.tsx',
  'src/adapters/components/Homeroom/Records/PeriodChipGroup.tsx',
  'src/adapters/components/Homeroom/Records/ProgressMode.tsx',
  'src/adapters/components/Homeroom/Records/RecordStatCards.tsx',
  'src/adapters/components/Homeroom/Records/recordUtils.ts',
  'src/adapters/components/Homeroom/RosterImport/ConflictResolveModal.tsx',
  'src/adapters/components/Homeroom/RosterManagementTab.tsx',
  'src/adapters/components/Homeroom/Survey/SurveyDetail.tsx',
  'src/adapters/components/Meal/MealPage.tsx',
  'src/adapters/components/Schedule/EventFormModal.tsx',
  'src/adapters/components/Schedule/EventList.tsx',
  'src/adapters/components/Schedule/ImportModal.tsx',
  'src/adapters/components/Schedule/Schedule.tsx',
  'src/adapters/components/Settings/SettingsSidebar.tsx',
  'src/adapters/components/Settings/tabs/CalendarTab.tsx',
  'src/adapters/components/Settings/tabs/DisplayTab.tsx',
  'src/adapters/components/Settings/tabs/TodoTab.tsx',
  'src/adapters/components/Settings/tabs/tools/SeatPickerToolSettings.tsx',
  'src/adapters/components/Settings/tabs/WidgetTab.tsx',
  'src/adapters/components/StudentRecords/StudentRecords.tsx',
  'src/adapters/components/Timetable/TeacherExcelPreviewModal.tsx',
  'src/adapters/components/Timetable/TimetableOverridesPanel.tsx',
  'src/adapters/components/Todo/Todo.tsx',
  'src/adapters/components/Tools/Assignment/AssignmentDetail.tsx',
  'src/adapters/components/Tools/Chalkboard/BoardBackgroundPicker.tsx',
  'src/adapters/components/Tools/Chalkboard/ChalkboardToolbar.tsx',
  'src/adapters/components/Tools/RealtimeWall/RealtimeWallCard.tsx',
  'src/adapters/components/Tools/RealtimeWall/RealtimeWallCardActions.tsx',
  'src/adapters/components/Tools/RealtimeWall/RealtimeWallCardDetailModal.tsx',
  'src/adapters/components/common/DriveSyncConflictModal.tsx',
  'src/adapters/components/common/DriveSyncIndicator.tsx', // conflict badge 만 잔존
  'src/domain/valueObjects/SubjectColor.ts',
];

// ─────────────────────────────────────────────────────────────
// large container 패턴 정규식:
// 1) bg-(amber|yellow)-Number/(5|10|15|20)
// 2) AND text-(amber|yellow)-(100|200|300)
// 3) AND padding 표시 (p-3 / p-4 / px-3 py-2 등 — 안내 박스급 padding)
// ─────────────────────────────────────────────────────────────
const BG_RE = /bg-(amber|yellow)-(?:300|400|500)\/(?:5|10|15|20)\b/;
const TEXT_RE = /text-(amber|yellow)-(?:100|200|300)\b/;
const PAD_RE = /\b(p-(?:3|4|5|6)|px-(?:3|4|6)\s+py-(?:2|3|4)|py-(?:2|3|4)\s+px-(?:3|4|6))\b/;

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'dist-electron')
      continue;
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (
      (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) &&
      !entry.name.includes('.test.') &&
      !entry.name.includes('.metatest.')
    ) {
      out.push(full);
    }
  }
}

describe('MT-D1: amber-on-amber large container 가독성 가드', () => {
  it('새로 추가되는 large 안내 박스에는 amber bg + 옅은 amber text 금지', () => {
    const srcDir = path.join(repoRoot, 'src');
    const files: string[] = [];
    walk(srcDir, files);

    const allowed = new Set(ALLOWED_FILES.map((p) => path.resolve(repoRoot, p)));

    const violations: string[] = [];
    for (const file of files) {
      if (allowed.has(file)) continue;
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        if (BG_RE.test(line) && TEXT_RE.test(line) && PAD_RE.test(line)) {
          const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
          violations.push(
            `${rel}:${i + 1} — large 안내 박스에 amber bg + 옅은 amber text 조합.\n` +
              `    대신 <Notice variant="warning"> 를 사용. 직접 만들어야 하면 ` +
              `color-mix(in srgb, var(--sp-warning) 7%, var(--sp-card)) 배경 + text-sp-text 본문`,
          );
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });
});
