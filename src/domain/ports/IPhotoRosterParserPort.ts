/**
 * 사진 명렬표 파일 해석 포트.
 *
 * 파일 형식 판별과 zip/XML 해석은 전부 바깥(infrastructure)의 일이다.
 * usecases 는 이 포트만 알면 되고, 파서를 직접 import 하지 않는다.
 *
 * ⚠️ 이 포트가 없으면 `usecases → infrastructure` 직접 import 가 되는데,
 * 이 저장소의 eslint 는 그 위반을 **`error` 가 아니라 `warn` 으로만** 잡는다
 * (기존 위반 57건이 누적돼 승격이 보류된 상태). 즉 게이트가 막아 주지 않으므로
 * 규칙이 아니라 설계로 막아야 한다.
 */

import type { PhotoRosterParseOutcome } from '@domain/valueObjects/PhotoRoster';

export interface IPhotoRosterParserPort {
  /**
   * 명렬표 파일 바이트를 해석한다.
   *
   * 지원하지 않는 형식이면 파싱을 시도하지 않고, 사용자에게 그대로 보여 줄
   * 안내 문구를 담아 돌려준다 (조용히 실패하지 않는다).
   */
  parse(bytes: Uint8Array): PhotoRosterParseOutcome;
}
