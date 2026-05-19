/**
 * UpdateNotification 영속화 메타 테스트 (PDCA: update-notification-controls D-12).
 *
 * grep 기반 회귀 차단:
 * - 영속화 회귀 (`const [dismissed, setDismissed] = useState(false)` 잔존 금지)
 * - 게이트 함수 사용 보장 (`shouldShowUpdateModal`)
 * - 스토어 import 보장 (`useUpdatePreferencesStore`)
 *
 * 본 테스트는 UpdateNotification.tsx 의 핵심 영속화 불변식을 코드 레벨에서 검증한다.
 * 컴포넌트를 import 하지 않고 소스 파일을 raw 읽어 정규식으로 검사 — 빌드 의존 없음.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.resolve(__dirname, 'UpdateNotification.tsx');
const source = readFileSync(SOURCE_PATH, 'utf-8');

describe('UpdateNotification persistence regression (PDCA: update-notification-controls)', () => {
  test('does NOT contain `useState(false)` for legacy dismissed flag', () => {
    // 회귀 #1 — v2.0.4 까지 사용된 휘발성 dismissed useState 가 부활하면 안 됨.
    // 사용자 피드백 3건의 근본 원인 (PDCA plan §1.1-1).
    expect(source).not.toMatch(/const\s+\[dismissed,\s*setDismissed\]\s*=\s*useState\(false\)/);
  });

  test('imports useUpdatePreferencesStore from stores', () => {
    // 회귀 #2 — 영속화 스토어 import 가 유지되는지.
    expect(source).toMatch(/useUpdatePreferencesStore/);
  });

  test('uses shouldShowUpdateModal gate function', () => {
    // 회귀 #3 — 게이트 함수가 모달 노출 직전에 호출되는지.
    expect(source).toMatch(/shouldShowUpdateModal\s*\(/);
  });

  test('imports LaterDropdown component', () => {
    // 회귀 #4 — 드롭다운이 inline JSX 로 되돌아가면 a11y 회귀 발생.
    expect(source).toMatch(/import\s*\{\s*LaterDropdown\s*\}/);
  });

  test('handleDismiss calls snooze action (3-day default, 1-day if security)', () => {
    // 회귀 #5 — 닫기/ESC 가 영속화 없는 setStatus('idle') 만으로 회귀하면
    // "하루에 한 번씩 뜨는" 문제 재발.
    // 호출 형태는 `prefs.snooze(...)` 또는 `useUpdatePreferencesStore.getState().snooze(...)` 모두 허용
    // (stale closure 회피로 후자 채택 가능 — Analysis §2 참조).
    expect(source).toMatch(/handleDismiss[\s\S]{0,300}(?:prefs|useUpdatePreferencesStore\.getState\(\))\.snooze/);
  });
});
