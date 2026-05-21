/**
 * 메타 테스트 — 학생 의존 화면 8곳에 <RosterEmptyState> 가드가 존재하는지 확인.
 *
 * 회귀 시나리오:
 *   roster-sample-data-removal PDCA 이전에는 빈 명단 상태에서 학생 의존 화면이
 *   빈 UI를 노출했다. RosterEmptyState 가드가 누락되면 신규 사용자가 아무것도
 *   없는 화면을 보며 혼란을 겪는다.
 *   이 테스트로 8개 화면 모두에서 RosterEmptyState 가드가 누락되는 회귀를
 *   CI 에서 사전 차단한다.
 *
 * 검사 내용:
 *   각 파일에서 다음 두 가지가 모두 존재해야 함:
 *   1) <RosterEmptyState  — JSX 사용
 *   2) from '@adapters/components/common/RosterEmptyState' — import 경로
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../../..');

/** 학생 의존 화면 목록. 새 화면 추가 시 여기 등록해야 한다. */
const FILES_TO_GUARD: ReadonlyArray<readonly [filePath: string, label: string]> = [
  ['src/adapters/components/Homeroom/Records/RecordsTab.tsx', 'RecordsTab'],
  ['src/adapters/components/Homeroom/Survey/SurveyTab.tsx', 'SurveyTab'],
  ['src/adapters/components/Homeroom/Assignment/AssignmentTab.tsx', 'AssignmentTab'],
  ['src/adapters/components/Homeroom/Consultation/ConsultationTab.tsx', 'ConsultationTab'],
  ['src/adapters/components/Homeroom/RosterManagementTab.tsx', 'RosterManagementTab'],
  ['src/adapters/components/Seating/Seating.tsx', 'Seating'],
  ['src/adapters/components/Tools/ToolSeatPicker.tsx', 'ToolSeatPicker'],
  ['src/adapters/components/Tools/ToolGrouping.tsx', 'ToolGrouping'],
];

describe('RosterEmptyState coverage (meta)', () => {
  for (const [relPath, label] of FILES_TO_GUARD) {
    it(`${label} (${relPath}) 에서 RosterEmptyState 가드가 존재한다`, () => {
      const fullPath = resolve(ROOT, relPath);
      const source = readFileSync(fullPath, 'utf8');

      expect(
        source,
        `${relPath} 에서 RosterEmptyState 가드가 누락되었습니다. ` +
          `신규 화면에서 학생 빈 상태 가드를 빼면 안 됩니다. ` +
          `'@adapters/components/common/RosterEmptyState' 를 import 하고 ` +
          `<RosterEmptyState context="..." /> 를 빈 명단 조건 분기에 추가하세요.`,
      ).toMatch(/<RosterEmptyState[\s/]/);

      expect(
        source,
        `${relPath} 에서 RosterEmptyState import 가 누락되었습니다. ` +
          `신규 화면에서 학생 빈 상태 가드를 빼면 안 됩니다. ` +
          `"from '@adapters/components/common/RosterEmptyState'" 를 추가하세요.`,
      ).toContain("from '@adapters/components/common/RosterEmptyState'");
    });
  }
});
