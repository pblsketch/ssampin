/**
 * 옆핀 PIN 잠금 — **통로가 이어져 있는지**만 본다.
 *
 * ## 왜 이런 테스트가 필요한가
 *
 * 1단계에서 실제로 겪은 일이다: 도메인에 `force` 를 넣고 도메인 테스트 97개가 모두
 * 통과하는데 **단추를 눌러도 아무 반응이 없었다.** preload → main → 화면으로 이어지는
 * 배선이 빠져 있었고, `tsc` 는 `electron/` 을 안 보므로 타입으로도 안 걸렸다.
 *
 * 잠금은 한 칸만 끊겨도 **"잠갔다고 믿는데 안 잠긴" 상태**가 되므로 같은 방식으로 막는다.
 * 이 테스트는 동작을 보지 않는다 — 통로가 있는지만 본다(그게 빠지는 자리라서).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function sourceOf(path: string): string {
  return readFileSync(path, 'utf8');
}

const PRELOAD = sourceOf('electron/preload.ts');
const MAIN = sourceOf('electron/main.ts');
const APP = sourceOf('src/adapters/components/SidePin/SidePinApp.tsx');
const ZONE = sourceOf('src/adapters/components/SidePin/SidePinWidgetZone.tsx');
const PIN_STORE = sourceOf('src/adapters/stores/usePinStore.ts');

describe('PIN 을 풀었다는 신호가 창까지 간다', () => {
  it('preload 에 창구가 있다', () => {
    expect(PRELOAD).toContain('reportPinUnlocked');
    expect(PRELOAD).toContain("ipcRenderer.send('sidePin:pin-unlocked')");
  });

  it('main 이 그 신호를 받아 상태 기계에 전달한다', () => {
    expect(MAIN).toContain("ipcMain.on('sidePin:pin-unlocked'");
    expect(MAIN).toContain("type: 'pin-unlocked'");
  });

  it('화면이 그 창구를 실제로 부른다 — 안 부르면 매번 다시 묻는다', () => {
    expect(APP).toContain('reportPinUnlocked');
  });
});

describe('잠그는 방향만 창을 건넌다', () => {
  it('본 앱에서 잠그면 창에 알린다', () => {
    expect(PIN_STORE).toContain('reportLocked');
    expect(PRELOAD).toContain("ipcRenderer.send('pin:locked')");
    expect(MAIN).toContain("ipcMain.on('pin:locked'");
    expect(MAIN).toContain("type: 'pin-locked'");
  });

  it('★ 푸는 방향을 전파하는 통로는 만들지 않는다', () => {
    // 이게 생기면 화면에 떠 있는 옆핀이 **저절로 열린다.**
    // 잠금은 언제나 안전한 방향이지만 해제는 아니다.
    expect(PRELOAD).not.toContain("ipcRenderer.send('pin:unlocked')");
    expect(MAIN).not.toContain("'pin:unlocked-elsewhere'");
  });
});

describe('해제 상태를 화면이 기억하지 않는다', () => {
  it('위젯 칸이 창에서 받은 값을 쓴다', () => {
    // 화면이 스스로 기억하면 패널 창이 파괴될 때 함께 사라져
    // **스칠 때마다 PIN 을 다시 묻는다**(계획서 §6.1).
    expect(ZONE).toContain('pinUnlockedAt');
    expect(APP).toContain('pinUnlockedAt={view.pinUnlockedAt}');
  });
});
