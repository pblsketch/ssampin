import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    // 생성 파일(직접 수정 금지) — lint 대상에서 제외(eslint --fix 가 헤더 디렉티브를 떼지 않도록).
    // 정합은 scripts/check-contract-sync.mjs 가 본다.
    ignores: [
      'src/domain/contracts/aiBridgeWriteContract.ts',
      'electron/ipc/_generated/aiBridgeWriteContract.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-useless-assignment': 'off',
    },
  },
  {
    // React Hooks 룰 — 소스 곳곳의 `// eslint-disable react-hooks/exhaustive-deps`
    // 디렉티브가 해석되도록 플러그인을 등록한다. (v7 의 React Compiler 룰셋은 미사용 — 클래식 2종만)
    // TODO: rules-of-hooks 위반 13건(RealtimeWallCard 등 — 조기 return 이후 hook 호출)
    //       정리 후 'warn' → 'error' 로 승격.
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Legacy ratchet: 기존 누적 exhaustive-deps 위반 파일은 warn으로 유지하고,
    // 신규/수정 파일은 기본 error 규칙을 적용한다. Phase 0+1 대상 파일은 이 목록에 넣지 않는다.
    files: [
      'src/App.tsx',
      'src/adapters/components/ClassManagement/AttendanceTab.tsx',
      'src/adapters/components/ClassManagement/ClassRosterTab.tsx',
      'src/adapters/components/ClassManagement/ClassSurveyTab.tsx',
      'src/adapters/components/ClassManagement/ProgressTab.tsx',
      'src/adapters/components/ClassManagement/UnifiedExportModal.tsx',
      'src/adapters/components/Homeroom/Assignment/AssignmentTab.tsx',
      'src/adapters/components/Homeroom/Consultation/ConsultationCreateModal.tsx',
      'src/adapters/components/Homeroom/Consultation/ConsultationDetail.tsx',
      'src/adapters/components/Homeroom/Records/RecordsTab.tsx',
      'src/adapters/components/Homeroom/RosterManagementTab.tsx',
      'src/adapters/components/Homeroom/Survey/SurveyCreateModal.tsx',
      'src/adapters/components/Memo/MemoCard.tsx',
      'src/adapters/components/Note/NotePage.tsx',
      'src/adapters/components/Seating/GroupShuffleOverlay.tsx',
      'src/adapters/components/Seating/Seating.tsx',
      'src/adapters/components/Seating/ShuffleOverlay.tsx',
      'src/adapters/components/Settings/FontSelector.tsx',
      'src/adapters/components/Settings/tabs/DisplayTab.tsx',
      'src/adapters/components/Settings/tabs/PeriodTab.tsx',
      'src/adapters/components/Timetable/TimetableEditor.tsx',
      'src/adapters/components/Timetable/TimetablePage.tsx',
      'src/adapters/components/Todo/Todo.tsx',
      'src/adapters/components/Tools/Assignment/AssignmentDetail.tsx',
      'src/adapters/components/Tools/Assignment/AssignmentTool.tsx',
      'src/adapters/components/Tools/Assignment/ShareLinkModal.tsx',
      'src/adapters/components/Tools/ToolChalkboard.tsx',
      'src/adapters/components/Tools/ToolPoll.tsx',
      'src/adapters/components/Tools/ToolSeatPicker.tsx',
      'src/adapters/components/Tools/ToolTrafficLight.tsx',
      'src/adapters/components/common/CalendarPicker.tsx',
      'src/adapters/hooks/useFontApplier.ts',
      'src/mobile/pages/StudentsPage.tsx',
      'src/student/StudentInlineComposer.tsx',
      'src/student/StudentSubmitForm.tsx',
      'src/widgets/items/Bookmarks.tsx',
      'src/widgets/items/TodayProgress.tsx',
    ],
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@usecases/*', '@adapters/*', '@infrastructure/*'],
              message: 'Domain layer cannot depend on outer layers.',
            },
          ],
        },
      ],
    },
  },
  {
    // TODO: usecases/adapters → infrastructure 직접 import 위반 57건(주로 @infrastructure/utils/uuid,
    //       @infrastructure/supabase/*, @infrastructure/export, @infrastructure/weather 등)이 누적돼 있어
    //       현재는 'warn'. 점진적으로 DI 경유로 리팩토링한 뒤 'error' 로 승격할 것.
    //       (domain·infrastructure 레이어 경계 규칙은 위반 0건이므로 'error' 유지)
    files: ['src/usecases/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['@adapters/*', '@infrastructure/*'],
              message: 'UseCases layer cannot depend on adapters or infrastructure.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/adapters/**/*.{ts,tsx}'],
    ignores: ['src/adapters/di/**/*'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['@infrastructure/*'],
              message: 'Adapters layer cannot depend on infrastructure (except in DI).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/infrastructure/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@usecases/*', '@adapters/*'],
              message: 'Infrastructure layer should only depend on Domain (ports).',
            },
          ],
        },
      ],
    },
  },
);
