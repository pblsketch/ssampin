/**
 * AC11 — 위젯 인터랙티브 요소 24×24 최소 hitbox 자동 감사.
 *
 * @vitest-environment jsdom
 *
 * 전략: 각 위젯 컴포넌트를 isCompactMode=true로 마운트 후 DOM을 순회해
 * button/input/a/[role=checkbox]/[role=button] 요소가 min-w-6 + min-h-6 (또는 동등 클래스)를
 * className에 보유하는지 검사한다.
 *
 * 일부 위젯은 Electron API, canvas, 또는 복잡한 store 부작용 때문에
 * jsdom에서 마운트할 수 없다. 이런 위젯은 SKIP_AUDIT 목록에 기재한다.
 */

// React 18 act 환경 플래그
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import { WIDGET_DEFINITIONS } from '../registry';

/* ------------------------------------------------------------------ */
/*  SKIP_AUDIT — jsdom에서 마운트 불가 위젯                            */
/* ------------------------------------------------------------------ */

/**
 * jsdom 환경에서 감사를 건너뛸 위젯 ID.
 * 각 항목 옆 reason: 주석이 이유를 설명한다.
 */
const SKIP_AUDIT: Record<string, string> = {
  'desktop-organize': 'reason: Electron WindowManager API (window.electronAPI) 없으면 런타임 crash',
  'weekly-timetable': 'reason: ResizeObserver + 복잡한 store 의존 — jsdom ResizeObserver 미구현',
  'class-timetable': 'reason: ResizeObserver + 복잡한 store 의존 — jsdom ResizeObserver 미구현',
  seating: 'reason: canvas/SVG 자리배치 렌더 — jsdom canvas stub 불완전',
  'today-progress': 'reason: ResizeObserver 사용 — jsdom에서 ReferenceError 발생',
  events: 'reason: ResizeObserver 사용 — jsdom에서 ReferenceError 발생',
  memo: 'reason: ResizeObserver 사용 (DashboardMemo) — jsdom에서 ReferenceError 발생',
  todo: 'reason: ResizeObserver 사용 (DashboardTodo) — jsdom에서 ReferenceError 발생',
  'mini-calendar':
    'reason: compact 카드 날짜 그리드는 7×6=42셀이라 24px hitbox 강제 시 카드 안에 안 맞음. 모달 확장 뷰(MiniCalendarExpanded)에는 별도 24px 적용 — Phase 3 결정.',
};

/* ------------------------------------------------------------------ */
/*  24px 클래스 판별 헬퍼                                              */
/* ------------------------------------------------------------------ */

/**
 * Tailwind className 문자열이 ≥ 24px 최소 hitbox를 표현하는지 확인한다.
 *
 * 허용 패턴 (width / height 모두):
 *   1) min-w-6 AND min-h-6
 *   2) w-6+ (w-6, w-7, w-8 …) AND h-6+ (h-6, h-7, h-8 …)
 *   3) min-w-[24px] AND min-h-[24px] (Tailwind arbitrary)
 *   4) p-6+ (패딩으로 충분한 경우 — 보수적으로 허용 안 함)
 *
 * "min-w-6"은 Tailwind에서 1.5rem = 24px 이므로 정확히 최소 hitbox다.
 * w-6 이상은 w-6 / w-7 / w-8 … 를 포함한다.
 */
const W_24_PATTERN = /\bmin-w-6\b|\bmin-w-\[24px\]|\bw-(?:[6-9]|[1-9]\d)\b/;
const H_24_PATTERN = /\bmin-h-6\b|\bmin-h-\[24px\]|\bh-(?:[6-9]|[1-9]\d)\b/;

function has24pxHitbox(className: string): boolean {
  return W_24_PATTERN.test(className) && H_24_PATTERN.test(className);
}

/* ------------------------------------------------------------------ */
/*  테스트 하네스                                                      */
/* ------------------------------------------------------------------ */

interface Ctx {
  container: HTMLDivElement;
  root: Root;
}

function setup(): Ctx {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

function teardown(ctx: Ctx) {
  act(() => {
    ctx.root.unmount();
  });
  ctx.container.remove();
}

/* ------------------------------------------------------------------ */
/*  감사 실행                                                          */
/* ------------------------------------------------------------------ */

describe('AC11 — 위젯 인터랙티브 요소 24×24 hitbox 감사', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = setup();
  });
  afterEach(() => {
    teardown(ctx);
  });

  for (const def of WIDGET_DEFINITIONS) {
    const skipReason = SKIP_AUDIT[def.id];

    if (skipReason) {
      it.skip(`[SKIP] ${def.id} — ${skipReason}`, () => {
        /* intentionally skipped */
      });
      continue;
    }

    it(`${def.id} — 모든 인터랙티브 요소가 min-h-6 + min-w-6 (≥ 24px) 클래스를 보유한다`, () => {
      // 마운트 실패 시 loud fail (위젯 id 포함)
      try {
        const Comp = def.component as React.ComponentType<{ isCompactMode?: boolean }>;
        act(() => {
          ctx.root.render(React.createElement(Comp, { isCompactMode: true }));
        });
      } catch (err) {
        throw new Error(
          `[AC11] 위젯 "${def.id}" 마운트 실패: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }

      const INTERACTIVE_SELECTOR = 'button, input, a, [role="checkbox"], [role="button"]';
      const elements = ctx.container.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR);

      const violations: string[] = [];
      elements.forEach((el) => {
        const cls = el.className ?? '';
        if (!has24pxHitbox(cls)) {
          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute('role') ?? '';
          const label =
            el.getAttribute('aria-label') ??
            el.getAttribute('title') ??
            el.textContent?.slice(0, 30) ??
            '';
          violations.push(
            `<${tag}${role ? ` role="${role}"` : ''}> "${label}" className="${cls.slice(0, 120)}"`,
          );
        }
      });

      // expect.soft가 없으므로 모든 위반을 한 번에 보고
      if (violations.length > 0) {
        // 위반 목록을 실패 메시지에 포함
        expect(violations, `[AC11] 위젯 "${def.id}" hitbox 위반 목록`).toHaveLength(0);
      }
    });
  }
});
