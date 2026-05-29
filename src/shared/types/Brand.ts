/**
 * Brand<T> — nominal-typing phantom marker
 *
 * 구조적 타입 시스템(TS)에서 nominal-like 식별자를 만든다. 실제 런타임 값 없음.
 *
 * 예:
 *   ```ts
 *   type StudentId = string & Brand<'StudentId'>;
 *   type NoPii    = Brand<'NoPii'>;
 *   type SafeDto  = Student & NoPii;
 *   ```
 *
 * **주의 (ADR Addendum 1)**: phantom brand는 *팩토리* 함수 없이는 보호되지 않는다.
 * `as Brand<'NoPii'>` 캐스팅은 ESLint 룰 `no-pii-brand-assertion`이 차단한다.
 * 안전한 mint 경로는 `src/adapters/io/createNoPiiDto.ts::createNoPiiDto`만 사용 (P8).
 */
declare const BRAND: unique symbol;

export type Brand<T extends string> = {
  readonly [BRAND]: T;
};

/** PII-free 마커. P8 export/sync DTO에서 강제. */
export type NoPii = Brand<'NoPii'>;
