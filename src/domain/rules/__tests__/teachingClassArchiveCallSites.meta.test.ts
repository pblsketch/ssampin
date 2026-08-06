/**
 * teachingClassArchiveCallSites.meta.test.ts — 수업반 보관(P1 S1.6) 메타 가드
 *
 * 계획: docs/01-plan/features/school-year-archive.plan.md §4 S1.6
 *
 * 부정형 화이트리스트(studentActivityCallSites 방식)만으로는 "필터를 아예 빠뜨린
 * 파일"을 원리적으로 잡을 수 없다(Critic r1 C1). 그래서 이 파일은 세 층으로 지킨다:
 *
 *  ① 긍정형(MUST_FILTER_FILES): 선택 표면 파일마다 `filterActiveClasses(` 존재 강제
 *     — 목록 파일에서 호출을 지우면 즉시 실패한다.
 *  ② 대칭 부정형(MUST_NOT_FILTER_FILES): id 해석 전용 파일에 필터가 들어오면 실패
 *     — 저장된 "tc:<id>" 선택이 보관 후 빈 명렬로 해석되는 새 버그를 막는다.
 *  ③ `.archived` 직접 비교 금지: 판정은 isTeachingClassArchived/filter* 경유만.
 *
 * §5.1 축소 게이트 절차: P1.1로 이월할 때는 ①의 배열에서 해당 항목만 한 줄씩 제거하고
 * `// P1.1 이월 — YYYY-MM-DD 축소 게이트` 주석 + PROGRESS.md 기록을 남긴다.
 * 단언 로직 수정·배열 통째 주석·it.skip·파일 삭제는 금지 — 목록이 줄어드는 건 허용,
 * 장치가 약해지는 건 불허.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const SRC_DIR = resolve(REPO_ROOT, 'src');

/** ① 선택 표면 — 각 파일에 `filterActiveClasses(` 호출이 반드시 존재해야 한다. */
const MUST_FILTER_FILES: readonly string[] = [
  // S1.3 — 수업반 목록(활성/보관 분리)
  'src/adapters/components/ClassManagement/ClassList.tsx',
  // S1.2b — 시간표 매칭 4경로
  'src/domain/rules/reminderClassMatch.ts',
  'src/domain/rules/progressCalendarRules.ts',
  'src/widgets/items/TodayProgress.tsx',
  'src/adapters/hooks/useReminderOsPush.ts',
  // S1.4 (B) — 데스크톱 선택 표면
  'src/adapters/components/Settings/RosterCopyAction.tsx',
  'src/adapters/hooks/useStudentLists.ts',
  'src/adapters/components/Tools/ClassRosterSelector.tsx',
  'src/adapters/components/Tools/ToolRoulette.tsx',
  'src/adapters/components/Tools/ToolSeatPicker.tsx',
  // S1.4 (D) — 모바일 (뷰 단)
  'src/mobile/pages/ClassListPage.tsx',
  'src/mobile/components/Today/MobileProgressLogModal.tsx',
];

/**
 * ② id 해석 전용 — `filterActiveClasses(`가 들어오면 실패.
 * 이 파일들은 "빠뜨리면 버그"가 아니라 "넣으면 버그"다: 선택지는 ClassRosterSelector가
 * 그리고, 여기의 목록 접근은 저장된 `"tc:<id>"` 선택을 해석하는 용도뿐이다.
 */
const MUST_NOT_FILTER_FILES: readonly string[] = [
  'src/adapters/components/Tools/ToolRandom.tsx',
  'src/adapters/components/Tools/ToolGrouping.tsx',
];

/** ③ `.archived` 직접 접근이 허용된 파일 (TeachingClass 문맥에 한정). */
const ARCHIVED_ACCESS_ALLOWED: ReadonlySet<string> = new Set([
  // 판정 정본 + 엔티티 선언
  'src/domain/rules/teachingClassArchive.ts',
  'src/domain/entities/TeachingClass.ts',
  // 테스트 (단언에서 필드 직접 확인)
  'src/domain/rules/__tests__/teachingClassArchive.test.ts',
  'src/domain/rules/__tests__/teachingClassArchiveCallSites.meta.test.ts',
  'src/adapters/stores/__tests__/teachingClassArchiveStore.test.ts',
  'src/usecases/classManagement/__tests__/teachingClassUnknownFieldRoundtrip.test.ts',
  // AI 브릿지 — 여기의 `.archived`는 **메모(Memo) 도메인**의 보관 플래그다
  // (memo.archiveMemo 분기·메모 update 파싱). 수업반 판정은 isClassArchived deps
  // (isTeachingClassArchived 경유)만 사용하므로 허용. 수업반 `.archived` 직접 비교를
  // 이 파일들에 새로 넣으면 안 된다.
  'src/adapters/hooks/useAiBridgeLiveSync.ts',
  'src/usecases/aiBridge/applyLiveSyncWrite.ts',
]);

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

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

function readRepoFile(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), 'utf-8');
}

describe('수업반 보관 호출처 정합성 (메타 테스트)', () => {
  it('① MUST_FILTER 목록의 각 파일에 filterActiveClasses 호출이 존재한다', () => {
    const missing: string[] = [];
    for (const relPath of MUST_FILTER_FILES) {
      let content: string;
      try {
        content = readRepoFile(relPath);
      } catch {
        missing.push(`${relPath} (파일 없음 — 이동·삭제 시 이 목록도 갱신할 것)`);
        continue;
      }
      if (!content.includes('filterActiveClasses(')) {
        missing.push(relPath);
      }
    }
    expect(
      missing,
      `다음 선택 표면에서 filterActiveClasses 호출이 사라졌습니다. 보관된 반이 다시 선택지에 노출됩니다:\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('② MUST_NOT_FILTER 목록(id 해석 전용)에 filterActiveClasses가 들어오면 안 된다', () => {
    const violations: string[] = [];
    for (const relPath of MUST_NOT_FILTER_FILES) {
      const content = readRepoFile(relPath);
      if (content.includes('filterActiveClasses(')) {
        violations.push(relPath);
      }
    }
    expect(
      violations,
      `다음 파일은 저장된 "tc:<id>" 선택의 해석 전용입니다. 필터하면 보관 후 빈 명렬로 해석됩니다:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('두 목록에 같은 파일이 동시에 들어갈 수 없다', () => {
    const both = MUST_FILTER_FILES.filter((f) => MUST_NOT_FILTER_FILES.includes(f));
    expect(both).toEqual([]);
  });

  it('③ TeachingClass 문맥에서 `.archived` 직접 접근은 허용 목록 밖에서 금지', () => {
    const all = walkTsFiles(SRC_DIR);
    const violations: string[] = [];
    for (const file of all) {
      let content: string;
      try {
        content = readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      // TeachingClass 문맥 판정: 엔티티/스토어를 참조하는 파일만 검사
      // (Memo/Notebook/Bookmark의 archived는 별개 도메인이라 제외)
      const isTeachingContext =
        content.includes('entities/TeachingClass') ||
        content.includes('useTeachingClassStore') ||
        content.includes('useMobileTeachingClassStore');
      if (!isTeachingContext) continue;
      if (!/\.archived\b/.test(content)) continue;
      const rel = toPosix(relative(REPO_ROOT, file));
      if (!ARCHIVED_ACCESS_ALLOWED.has(rel)) violations.push(rel);
    }
    expect(
      violations,
      `다음 파일이 .archived 를 직접 비교합니다. isTeachingClassArchived/filterActiveClasses/filterArchivedClasses 를 사용하세요:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('보관은 삭제를 호출하지 않는다 — archiveClasses/unarchiveClass 본문에 delete 계열 부재', () => {
    const content = readRepoFile('src/adapters/stores/useTeachingClassStore.ts');
    // archiveClass: ~ unarchiveClass 본문 구간 추출 (다음 액션 선언 전까지)
    const match = /archiveClass:[\s\S]*?unarchiveClass:[\s\S]*?\n {4}\},/.exec(content);
    expect(
      match,
      'archiveClass/unarchiveClass 액션을 찾지 못했습니다 (이름 변경 시 이 테스트 갱신)',
    ).toBeTruthy();
    const body = match![0];
    expect(body).not.toMatch(/deleteClass|deleteByClass|manageClasses\.delete|\.remove\(/);
  });
});
