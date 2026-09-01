/**
 * [지금 가리기] 배선 테스트 — 도메인만 고치고 통로를 안 이으면 단추가 죽는다.
 *
 * ## 왜 이 테스트가 있나 (실제로 겪은 일)
 *
 * `close-requested` 는 **무언가 쓰는 중이면 아무 일도 하지 않는다**
 * (`resolveSidePinTransition.ts` 의 `isEditorBusy` 방어). 그런데 위젯을 열어 두면
 * 곧바로 "쓰는 중"이 걸리므로, 옆핀 머리말의 단추를 눌러도 **아무 일도 안 일어났다.**
 * 급히 가려야 하는 순간이 바로 그때인데도.
 *
 * 그래서 `force` 를 더해 "사용자가 직접 누른 경우"만 그 방어를 건너뛰게 했다.
 * 그런데 **도메인에만 `force` 를 넣고 통로(preload → main → 화면)를 안 이으면
 * 모든 검사가 초록인 채로 단추는 그대로 죽어 있다.** 실제로 이번 작업에서 그 상태가
 * 한 번 만들어졌다 — 도메인 테스트 97개가 전부 통과하는데 기능은 동작하지 않았다.
 *
 * 타입으로는 못 막는다. `npx tsc --noEmit` 은 `electron/` 을 안 본다
 * (tsconfig `include: ["src"]`). 그래서 **소스를 읽어 네 곳이 이어져 있는지 확인한다.**
 * `memoEditorActivity.mirror.test.ts` 가 같은 이유로 같은 방식을 쓴다.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');

function read(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf-8');
}

describe('[지금 가리기] — 화면에서 도메인까지 통로가 이어져 있다', () => {
  test('① 화면이 force 를 실어 보낸다', () => {
    // 인자 없이 부르면 예전 동작(쓰는 중이면 안 접힘)이라 단추가 죽는다.
    const src = read('src/adapters/components/SidePin/SidePinApp.tsx');
    expect(src).toMatch(/requestClose\(\s*true\s*\)/);
  });

  test('② preload 가 force 를 받아 채널로 넘긴다', () => {
    const src = read('electron/preload.ts');
    // 인자를 받기만 하고 send 에 안 실으면 조용히 사라진다.
    expect(src).toMatch(/requestClose:\s*\(force\?: boolean\)/);
    expect(src).toMatch(/send\('sidePin:request-close',\s*force === true\)/);
  });

  test('③ main 이 받은 force 를 전이 함수로 넘긴다', () => {
    const src = read('electron/main.ts');
    // 옛 코드는 `dispatch({ type: 'close-requested' })` 로 인자가 없었다.
    expect(src).toMatch(/type: 'close-requested',\s*force:/);
  });

  test('④ 전이 함수가 force 일 때 편집 방어를 건너뛴다', () => {
    const src = read('src/domain/services/resolveSidePinTransition.ts');
    // force 를 읽지 않으면 도메인이 그 값을 무시한다는 뜻이다.
    const closeCase = src.slice(src.indexOf("case 'close-requested'"));
    expect(closeCase.slice(0, 600)).toMatch(/force/);
  });

  test('단추 라벨이 "닫기"가 아니라 "지금 가리기"다', () => {
    // "닫기"는 앱 종료로 읽혀 선생님이 누르기를 피한다. 실제 동작은 접기다.
    const src = read('src/adapters/components/SidePin/SidePinPanel.tsx');
    expect(src).toContain('지금 가리기');
    expect(src).toContain('visibility_off');
  });
});
