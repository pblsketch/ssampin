/**
 * 바탕화면 아이콘 아래 모드(native-desktop) 관련 메인 프로세스 타입.
 *
 * Phase 1: 타입 정의만. 실제 manager 구현은 Phase 2(no-op) → PR-2 Phase 4+(win32).
 *
 * 이 파일은 electron/ 하위 main process 코드만 사용한다.
 * renderer 측은 preload.ts가 노출하는 IPC payload 타입을 통해 간접 접근한다.
 */

/** native-desktop 모드 진입/health-check 결과 */
export type DesktopWidgetModeStatus =
  | { ok: true; mode: 'native-desktop' }
  | { ok: false; reason: string; fallbackMode: 'normal' | 'topmost' };

/**
 * native-desktop 모드 fallback 시 renderer로 보내는 IPC payload.
 * 채널: `desktopMode:fallback`.
 */
export interface DesktopModeFallbackEvent {
  /** 진단 로그용 사유 (i18n 미지원, 영문 식별자 권장) */
  readonly reason: string;
  /** 적용된 fallback 모드 */
  readonly fallbackMode: 'normal' | 'topmost';
}
