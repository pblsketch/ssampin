/**
 * crossPlatformSortCallSites.meta.test.ts — PC ↔ 모바일 표시 순서 일치 메타 가드
 *
 * ## 왜 필요한가
 *
 * 세 목록(수업반·일정·할 일)은 "사용자가 PC에서 정한 순서"를 **필드**에 담는다
 * (`TeachingClass.order`, `SchoolEvent.sortOrder`, `Todo.sortOrder`). 저장 파일의
 * 배열 순서는 그 순서가 **아니다** — 재배치는 필드만 갱신하고 배열은 그대로 둔다.
 *
 * 그래서 목록을 그리는 쪽이 도메인 정렬 규칙을 거르면, 화면은 조용히 "저장된 순서"로
 * 돌아간다. 오류도, 빈 화면도 없다. 사용자만 "PC에서 정렬했는데 폰은 그대로"라고
 * 신고한다(2026-08-24 실제 신고).
 *
 * 이 가드는 그 호출이 사라지는 순간 실패한다.
 *
 * ## 축소 절차
 * 화면이 없어지거나 정렬 책임이 다른 파일로 옮겨가면 배열에서 해당 줄만 지우고
 * 옮겨간 파일을 새로 넣는다. 단언 로직 수정·it.skip·파일 삭제는 금지.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

/** 파일 → 그 파일이 반드시 호출해야 하는 도메인 정렬 함수. */
const MUST_SORT: readonly { readonly file: string; readonly call: string; readonly why: string }[] =
  [
    // ── 수업반: TeachingClass.order ──────────────────────────────────
    {
      file: 'src/mobile/stores/useMobileTeachingClassStore.ts',
      call: 'sortTeachingClasses(',
      why: '모바일 수업 목록·반 선택 6개 화면이 이 스토어 하나를 본다',
    },
    {
      file: 'src/adapters/stores/useTeachingClassStore.ts',
      call: 'sortTeachingClasses',
      why: '데스크톱도 같은 도메인 규칙을 써야 두 화면이 갈라지지 않는다',
    },

    // ── 일정: SchoolEvent.sortOrder (같은 날 안의 위아래) ─────────────
    {
      file: 'src/mobile/pages/SchedulePage.tsx',
      call: 'sortByDate(',
      why: '날짜만 비교하면 같은 날 일정 순서가 PC와 어긋난다',
    },

    // ── 할 일: Todo.sortOrder → 우선순위 → 마감일 ────────────────────
    {
      file: 'src/mobile/pages/TodoPage.tsx',
      call: 'sortTodos(',
      why: 'groupByDate 는 구간만 나누고 정렬하지 않는다',
    },
    {
      file: 'src/mobile/components/Today/TodayRemaining.tsx',
      call: 'sortTodos(',
      why: '오늘 화면의 남은 할 일도 같은 순서여야 한다',
    },
  ];

describe('PC ↔ 모바일 표시 순서 — 도메인 정렬 규칙 호출 가드', () => {
  it.each(MUST_SORT)('$file 는 $call 을 호출한다 — $why', ({ file, call }) => {
    const source = readFileSync(resolve(REPO_ROOT, file), 'utf-8');
    expect(source).toContain(call);
  });

  it('groupByDate 는 정렬을 하지 않는다 — 부르는 쪽이 미리 정렬해야 한다는 전제가 유효하다', () => {
    // 이 전제가 깨지면(= groupByDate 가 스스로 정렬하게 되면) 위 할 일 가드는
    // 과잉이 된다. 전제를 코드로 붙들어 둔다.
    const source = readFileSync(resolve(REPO_ROOT, 'src/domain/rules/todoRules.ts'), 'utf-8');
    const body = source.slice(source.indexOf('export function groupByDate'));
    const nextExport = body.indexOf('\nexport function', 1);
    const groupByDateBody = nextExport === -1 ? body : body.slice(0, nextExport);

    expect(groupByDateBody).not.toContain('.sort(');
  });
});
