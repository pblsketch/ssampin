/**
 * openSettingsTab.ts
 *
 * 기능 화면에서 설정의 특정 탭으로 곧바로 보내는 딥링크 헬퍼.
 *
 * 라우팅 규칙의 정본은 `navigationTarget.ts`의 `parseNavigationTarget`이고,
 * 이벤트 수신은 `App.tsx`가 한다 — 여기서는 `settings#<tab>` 형식만 조립한다.
 * "왜 안 보이지?" 하는 자리에서 바꾸는 곳까지 한 번에 데려가기 위한 부품.
 */
import type { SettingsTabId } from '@adapters/components/Settings/SettingsPage';

export function openSettingsTab(tab: SettingsTabId): void {
  window.dispatchEvent(new CustomEvent<string>('ssampin:navigate', { detail: `settings#${tab}` }));
}
