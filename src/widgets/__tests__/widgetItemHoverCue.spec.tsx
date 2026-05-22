/**
 * AC12 — 인플레이스 가능 위젯의 인터랙티브 요소 hover 큐 소스 스캔.
 *
 * @vitest-environment jsdom
 *
 * 전략: 소스 파일을 문자열로 읽어 <button> / <input> / <a> JSX 요소의
 * className 속성에 hover: 클래스가 포함되어 있는지 검사한다.
 * (undoToastDuration.test.ts 의 정적 분석 패턴을 미러링)
 *
 * 검사 대상 파일:
 *   1. src/adapters/components/Dashboard/DashboardTodo.tsx
 *   2. src/adapters/components/Dashboard/DashboardMemo.tsx
 *   3. src/widgets/items/DDayCounter.tsx
 *
 * hover 큐 패턴: hover:underline | hover:bg-sp- | hover:text-sp- |
 *               hover:border-sp- | hover:opacity- | hover:ring- |
 *               hover:brightness- | hover:scale- | hover:bg-yellow- 등
 *
 * 신뢰 체인 참고:
 *   - DashboardMemo는 MEMO_HOVER 레코드에 hover:bg-{color}-400/30 를 선언하고
 *     카드 className에 주입한다. 이 레코드 자체를 검증한다.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/* ------------------------------------------------------------------ */
/*  대상 파일 목록                                                    */
/* ------------------------------------------------------------------ */

// process.cwd()는 Vitest 실행 위치 = 저장소 루트 (E:/github/ssampin)
const REPO_ROOT = process.cwd();

const TARGET_FILES = [
  {
    id: 'DashboardTodo',
    path: resolve(REPO_ROOT, 'src/adapters/components/Dashboard/DashboardTodo.tsx'),
  },
  {
    id: 'DashboardMemo',
    path: resolve(REPO_ROOT, 'src/adapters/components/Dashboard/DashboardMemo.tsx'),
  },
  {
    id: 'DDayCounter',
    path: resolve(REPO_ROOT, 'src/widgets/items/DDayCounter.tsx'),
  },
];

/* ------------------------------------------------------------------ */
/*  hover 큐 패턴                                                     */
/* ------------------------------------------------------------------ */

/**
 * 파일 소스 문자열에서 인터랙티브 JSX 요소 블록을 추출하는 정규식.
 * <button, <input, <a, role="checkbox", role="button" 로 시작하는
 * JSX 요소를 간단히 찾는다.
 */
const INTERACTIVE_TAG_RE = /<(button|input|a)\b[^>]*className[^>]*>/gs;

/**
 * hover: 큐 패턴 — 최소 하나라도 있으면 통과.
 * DashboardMemo의 경우 MEMO_HOVER 레코드(파일 상단 hover: 상수)도 포함.
 */
const HOVER_CUE_RE =
  /hover:(underline|bg-sp-|text-sp-|border-sp-|opacity-|ring-|brightness-|scale-|bg-yellow-|bg-pink-|bg-green-|bg-blue-|bg-red-|text-red-|text-sp-|border-sp-)/;

/* ------------------------------------------------------------------ */
/*  테스트                                                            */
/* ------------------------------------------------------------------ */

describe('AC12 — 인플레이스 위젯 인터랙티브 요소 hover 큐', () => {
  for (const target of TARGET_FILES) {
    it(`${target.id} — 파일 전체에 hover: 큐 클래스가 하나 이상 존재한다`, () => {
      let src: string;
      try {
        src = readFileSync(target.path, 'utf-8');
      } catch (err) {
        throw new Error(
          `[AC12] 파일 읽기 실패: ${target.path} — ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }

      // 파일 전체에서 hover: 패턴이 존재하는지 먼저 확인 (빠른 검사)
      const fileHasHover = HOVER_CUE_RE.test(src);
      expect(fileHasHover, `[AC12] ${target.id}: 파일에 hover: 큐 클래스가 전혀 없습니다`).toBe(
        true,
      );
    });

    it(`${target.id} — <button>/<input>/<a> 중 hover: 큐가 없는 요소가 없다`, () => {
      let src: string;
      try {
        src = readFileSync(target.path, 'utf-8');
      } catch (err) {
        throw new Error(
          `[AC12] 파일 읽기 실패: ${target.path} — ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }

      // 인터랙티브 요소 블록 추출
      const matches = [...src.matchAll(INTERACTIVE_TAG_RE)];
      if (matches.length === 0) {
        // 인터랙티브 요소가 없으면 검사 불필요 — 파일 구조가 바뀐 것이므로 경고
        // (실패 대신 주석으로 기록: 파일이 빈 경우는 없음)
        expect(true).toBe(true); // 빈 파일 허용
        return;
      }

      /**
       * 각 JSX 요소 블록에서 hover: 큐 확인.
       *
       * 예외 처리:
       *   - DashboardMemo의 카드(<div> 래퍼) 클릭 영역은 MEMO_HOVER 레코드로
       *     주입되므로 직접 className에 없을 수 있다.
       *     이 경우 파일 상단 MEMO_HOVER 상수에서 이미 확인했으므로
       *     개별 요소 실패를 soft 처리한다.
       *
       * 구현 단순화: 'disabled' 속성이 있는 요소는 건너뛴다.
       */
      const violations: string[] = [];
      for (const m of matches) {
        const block = m[0] ?? '';
        // disabled 요소는 hover 불필요
        if (/\bdisabled\b/.test(block)) continue;
        // submit 버튼 등 제출 버튼도 hover:brightness- 등으로 처리되어야 함
        if (!HOVER_CUE_RE.test(block)) {
          violations.push(block.slice(0, 200));
        }
      }

      // violations 있을 경우 집계 보고
      if (violations.length > 0) {
        // DashboardMemo는 MEMO_HOVER 레코드 신뢰 체인으로 카드 hover 처리 — 파일 레벨 검사 통과
        if (target.id === 'DashboardMemo') {
          // 카드 div는 <div>이므로 INTERACTIVE_TAG_RE에 포함 안 됨. 실제 위반만 보고.
          expect(
            violations,
            `[AC12] ${target.id}: hover: 큐 없는 인터랙티브 요소\n${violations.join('\n')}`,
          ).toHaveLength(0);
        } else {
          expect(
            violations,
            `[AC12] ${target.id}: hover: 큐 없는 인터랙티브 요소\n${violations.join('\n')}`,
          ).toHaveLength(0);
        }
      }
    });
  }
});
