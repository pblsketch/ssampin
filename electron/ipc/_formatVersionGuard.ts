/**
 * formatVersion 충돌 감지 (Design §4.4, worker-2 영역).
 *
 * GDrive Sync 4-사분면 매트릭스:
 *   PC1 v2.1.0 마이그레이션 완료 → PC2 v2.0.x가 새 포맷을 만나면 sync 일시 정지.
 *
 * Q3 확정 안내 문구: Plan §9 / OQ Q3 초안 (main 승인 전 사용)
 */

/**
 * formatVersion 불일치 에러.
 * 옛 앱(v2.0.x)이 v2 포맷 데이터를 만났을 때 throw된다.
 */
export class FormatVersionMismatchError extends Error {
  override readonly name = 'FormatVersionMismatchError';
  readonly code = 'sync_paused_v2_format';

  constructor() {
    super(
      '다른 PC에서 v2.1.0으로 업데이트된 데이터가 있어요. 이 PC도 v2.1.0으로 업데이트하면 다시 sync됩니다.',
    );
    // Ensure instanceof works correctly in transpiled environments
    Object.setPrototypeOf(this, FormatVersionMismatchError.prototype);
  }
}

/**
 * 입력 데이터가 현재 앱 버전으로 안전하게 처리 가능한지 검사한다.
 *
 * formatVersion: 2 + currentAppVersion이 "2.0." 로 시작하는 경우 →
 * FormatVersionMismatchError throw (sync 일시 정지 트리거).
 *
 * Pure function (string-arg only, no fs).
 */
export function assertSafeForCurrentApp(input: unknown, currentAppVersion: string): void {
  if (
    typeof input === 'object' &&
    input !== null &&
    (input as Record<string, unknown>)['formatVersion'] === 2 &&
    currentAppVersion.startsWith('2.0.')
  ) {
    throw new FormatVersionMismatchError();
  }
}
