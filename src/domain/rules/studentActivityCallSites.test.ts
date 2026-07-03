/**
 * studentActivityCallSites.test.ts — 메타 테스트
 *
 * 활성 학생 판정의 단일 진실 원천(`isStudentActive` / `isStudentInactive`)을
 * 우회하여 `.isVacant` 를 직접 비교하는 코드를 회귀 차단한다.
 *
 * 미래 누군가 `.filter((s) => !s.isVacant)` 같은 패턴을 새로 도입하면
 * 이 테스트가 즉시 실패하여 PR 리뷰에서 잡히도록 한다.
 *
 * 화이트리스트는 다음 사유 중 하나에 해당하는 파일만 등록:
 *   1. 판정 함수 자체 정의/테스트
 *   2. 엔티티 인터페이스 정의 (필드 선언)
 *   3. status ↔ isVacant 상호 동기화를 수행하는 마이그레이션/스토어 액션
 *   4. UI 표시(line-through, opacity, 결번 라벨)에 isVacant 단독을 사용
 *      — 단, "활성 학생만 추리는" 의도면 isStudentActive 사용 필수
 *   5. 데이터 전달 (`isVacant: src.isVacant`) 형태의 단순 패스스루
 *
 * 신규 파일을 추가할 경우 PR 리뷰어가 위 사유를 확인하여 화이트리스트 갱신.
 *
 * 자세한 배경: `docs/02-design/features/roster-data-consistency.design.md` §4
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SRC_DIR = resolve(REPO_ROOT, 'src');

/**
 * `.isVacant` 직접 접근이 허용된 파일 목록 (POSIX-style sibling-relative path from repo root).
 */
const ALLOWED_FILES: ReadonlySet<string> = new Set([
  // 1. 판정 함수 정의 + 메타 테스트 자체 (문서/에러 메시지에서 `.isVacant` 언급 불가피)
  'src/domain/rules/studentActivity.ts',
  'src/domain/rules/studentActivityCallSites.test.ts',

  // 2. status ↔ isVacant 동기화 책임 — toggleVacant 액션이 isVacant 직접 접근
  'src/adapters/stores/useStudentStore.ts',

  // 3. UI 표시 (line-through · opacity · 결번 배지) — `isVacant` 단독으로 시각적 분기
  'src/adapters/components/Homeroom/RosterManagementTab.tsx',
  'src/adapters/components/Homeroom/shared/StudentGrid.tsx',
  'src/adapters/components/Homeroom/Records/StudentJumpList.tsx',
  'src/adapters/components/Homeroom/Records/InputMode.tsx',
  'src/adapters/components/ClassManagement/ClassRosterTab.tsx',
  'src/mobile/pages/StudentsPage.tsx',
  // 2026-07-03 모바일 리팩토링 — StudentsPage 내부 뷰들을 파일로 순수 추출하면서
  // 동일한 UI 표시 목적의 `.isVacant` 접근이 코드 무변경으로 함께 이사 (사유 3 승계)
  'src/mobile/pages/students/HomeroomListView.tsx',
  'src/mobile/pages/students/SeatingView.tsx',
  'src/mobile/pages/students/TeachingListView.tsx',
  'src/mobile/pages/students/TeachingSeatingView.tsx',

  // 4. 데이터 패스스루 (`isVacant: src.isVacant`) + 결번 라벨 표시
  'src/adapters/components/ClassManagement/ClassSurveyTab.tsx',
  'src/infrastructure/export/ExcelExporter.ts',

  // 5. Phase 3 — import 적용 시 ImportReadyStudent.isVacant → Student.isVacant 패스스루
  'src/usecases/roster/applyImportPlan.ts',
  // 6. Phase 3 — 충돌 모달의 status 미설정 학생 표시 라벨 ("결번" vs "재학") 폴백
  'src/adapters/components/Homeroom/RosterImport/ConflictResolveModal.tsx',
]);

/** Windows 백슬래시 → 슬래시 정규화 */
function toPosix(p: string): string {
  return p.split(sep).join('/');
}

/** src/ 하위의 모든 .ts/.tsx 파일을 재귀적으로 수집 (node_modules 제외) */
function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      walkTsFiles(full, out);
    } else if (st.isFile() && (entry.endsWith('.ts') || entry.endsWith('.tsx'))) {
      out.push(full);
    }
  }
  return out;
}

/** 본문에 `.isVacant` 가 등장하는 src/ 하위 ts/tsx 파일 목록 (POSIX 경로) */
function listIsVacantFiles(): readonly string[] {
  const all = walkTsFiles(SRC_DIR);
  const result: string[] = [];
  for (const file of all) {
    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    if (/\.isVacant\b/.test(content)) {
      result.push(toPosix(relative(REPO_ROOT, file)));
    }
  }
  return result;
}

describe('isStudentActive 호출처 정합성 (메타 테스트)', () => {
  it('`.isVacant` 직접 접근은 화이트리스트 외 모든 파일에서 금지 (isStudentActive 사용)', () => {
    const files = listIsVacantFiles();
    const violations = files.filter((f) => !ALLOWED_FILES.has(f));

    if (violations.length > 0) {
      const message = [
        '',
        '다음 파일들이 `.isVacant` 를 직접 사용하고 있습니다.',
        '`isStudentActive(s)` / `isStudentInactive(s)` 로 교체하거나,',
        '정당한 사유라면 src/domain/rules/studentActivityCallSites.test.ts 의 ALLOWED_FILES 에 추가하세요.',
        '',
        ...violations.map((v) => `  - ${v}`),
        '',
      ].join('\n');
      expect.fail(message);
    }
  });

  it('화이트리스트 자체 정합성 — 등록된 모든 파일이 실제로 `.isVacant` 를 사용해야 함', () => {
    const files = new Set(listIsVacantFiles());
    const stale = [...ALLOWED_FILES].filter((f) => !files.has(f));

    if (stale.length > 0) {
      const message = [
        '',
        '화이트리스트에 등록되어 있지만 더 이상 `.isVacant` 를 사용하지 않는 파일:',
        'codemod 후 제거 대상입니다.',
        '',
        ...stale.map((f) => `  - ${f}`),
        '',
      ].join('\n');
      expect.fail(message);
    }
  });
});
