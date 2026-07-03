/**
 * 지원 기기에서 짧은(10ms) 진동 피드백을 준다.
 * `'vibrate' in navigator` 가드로 미지원 환경(iOS Safari 등)은 조용히 무시한다.
 */
export function haptic(): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10);
  } catch {
    /* ignore — iOS Safari 미지원 */
  }
}
