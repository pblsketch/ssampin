/**
 * Meta-test: 마우스 후킹 콜백 안에서 창을 동기로 건드리지 않는다.
 *
 * ## 배경 (2026-08-19, 크래시 덤프 2개로 확정)
 *
 * 바탕화면 아래 모드에서 위젯 크기를 조절하면 앱이 통째로 죽었다. 덤프 두 개가 **같은 지점**을
 * 가리켰다:
 *
 *   예외 0x80000003 STATUS_BREAKPOINT @ electron.exe+0x37856   (두 덤프 동일)
 *   스택 koffi.node → win32u/USER32 → Chromium 창 프로시저 → USER32
 *        → Chromium 창 프로시저(재진입) → f_sps.dll(Fasoo DRM) → 중단
 *
 * `moveAndResizeWidgetSync` 는 `SWP_ASYNCWINDOWPOS` 를 일부러 뺀 **동기** 호출이라
 * (2026-05-23 "위젯이 한 번에 사라짐" 회귀 방지) 창 메시지를 그 자리에서 전달한다. 그걸 저수준
 * 마우스 후킹의 JS 콜백 안에서 부르면 창 프로시저가 그 콜백 안에서 실행되고, **JS 가 아직
 * 스택에 있는데 JS 가 또 실행되어** Chromium 이 앱을 중단시킨다.
 *
 * 같은 파일의 창 끌기(7-C)는 `SWP_ASYNCWINDOWPOS` 를 쓰는 `moveWidget` 이라 큐잉되고 재진입이
 * 없어 멀쩡했다 — 크기 조절에서만 죽은 이유이자, 이 검사가 **동기 변형만** 겨냥하는 이유다.
 *
 * 이 그물이 없으면 "한 줄 인라인이 더 단순하다"는 이유로 되돌려지기 쉽다. 되돌려도 개발 PC
 * 에서는 재현이 잘 안 된다(주입된 보안 프로그램이 있는 PC에서 훨씬 잘 터진다).
 */
import { describe, expect, test } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SOURCE_PATH = path.join(__dirname, 'desktopWidgetManager.ts');

function readSource(): string {
  return fs.readFileSync(SOURCE_PATH, 'utf-8');
}

/** 주석은 걷어낸다 — 결정을 설명하는 주석에 그 호출 모양을 적어 두면 거짓 실패가 난다. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** `installLowLevelMouseHook(` 의 콜백 본문만 잘라 낸다 (괄호 균형으로 끝을 찾는다). */
function hookCallbackSource(source: string): string {
  const start = source.indexOf('win32.installLowLevelMouseHook(');
  expect(
    start,
    'installLowLevelMouseHook 호출을 찾지 못했다 — 후킹 설치가 옮겨졌는가?',
  ).toBeGreaterThan(-1);

  let depth = 0;
  for (let i = source.indexOf('(', start); i < source.length; i++) {
    const ch = source[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('후킹 콜백의 끝을 찾지 못했다');
}

describe('마우스 후킹 콜백 안에서 창을 동기로 건드리지 않는다', () => {
  test('★후킹 콜백 안에 moveAndResizeWidgetSync 호출이 없다', () => {
    const hook = stripComments(hookCallbackSource(readSource()));
    const calls = hook.match(/moveAndResizeWidgetSync\s*\(/g) ?? [];

    expect(
      calls.length,
      '후킹 콜백이 동기 SetWindowPos 를 직접 부른다 — 창 프로시저가 콜백 안에서 실행돼 ' +
        'JS 재진입이 일어나고 Chromium 이 앱을 중단시킨다. queueResizeApply 로 미뤄야 한다.',
    ).toBe(0);
  });

  test('미뤄서 적용하는 경로가 존재한다', () => {
    const src = readSource();
    expect(src, 'queueResizeApply 가 없다').toContain('function queueResizeApply(');
    expect(src, 'applyPendingResize 가 없다').toContain('function applyPendingResize(');
    // 실제 창 호출은 미뤄진 적용 쪽에만 있어야 한다.
    const applyStart = src.indexOf('function applyPendingResize(');
    const applyBody = src.slice(applyStart, src.indexOf('\n  }\n', applyStart));
    expect(applyBody, '미뤄진 적용이 정작 창을 안 옮긴다').toContain('moveAndResizeWidgetSync(');
  });

  test('후킹 콜백이 목표를 예약한다', () => {
    const hook = stripComments(hookCallbackSource(readSource()));
    expect(hook, '후킹이 리사이즈 목표를 예약하지 않는다').toContain('queueResizeApply(');
  });

  test('창 끌기(7-C)의 비동기 이동은 후킹 안에 남아도 된다 — 재진입이 없다', () => {
    // moveWidget 은 SWP_ASYNCWINDOWPOS 로 큐잉되므로 창 프로시저가 콜백 안에서 돌지 않는다.
    // 이 테스트는 "동기 변형만 금지"라는 의도를 못박아, 나중에 과잉 금지로 드래그가
    // 느려지는 방향의 수정을 막는다.
    const hook = stripComments(hookCallbackSource(readSource()));
    expect(hook, '드래그 이동이 후킹에서 사라졌다 — 의도한 변경인가?').toContain('moveWidget(');
  });

  test('moveAndResizeWidgetSync 는 여전히 동기다 — 비동기로 되돌리면 옛 회귀가 부활한다', () => {
    // 2026-05-23: SWP_ASYNCWINDOWPOS 로 origin+size 가 따로 적용되어 "위젯이 한 번에 사라짐".
    // 재진입 문제는 호출 위치를 옮겨 풀었으므로, 플래그를 되돌리는 방식으로 풀면 안 된다.
    const win32 = fs.readFileSync(path.join(__dirname, 'platform', 'win32Desktop.ts'), 'utf-8');
    const start = win32.indexOf('export function moveAndResizeWidgetSync(');
    expect(start, 'moveAndResizeWidgetSync 를 찾지 못했다').toBeGreaterThan(-1);
    const body = stripComments(win32.slice(start, win32.indexOf('\n}\n', start)));

    expect(body, 'sync 변형에 SWP_ASYNCWINDOWPOS 가 들어갔다').not.toContain('SWP_ASYNCWINDOWPOS');
  });
});
