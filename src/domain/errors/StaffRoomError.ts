/**
 * 온라인 교무실 오류 타입
 *
 * domain 에 두는 이유 — 화면(스토어)이 "이미 멤버라 409" 같은 결과를 보고 흐름을
 * 바꿔야 하는데, 그러자고 adapters 가 infrastructure 를 import 하면 의존성 규칙이 깨진다.
 * 서버 응답의 모양은 infrastructure 가 알고, **그 결과의 의미**는 domain 이 갖는다.
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */

/** 온라인 교무실 서버 요청 실패 */
export class StaffRoomHttpError extends Error {
  /** HTTP 상태. 0 이면 네트워크에 닿지도 못한 경우(오프라인·서버 미설정) */
  readonly status: number;
  /** "이미 그 부서의 멤버"처럼 서버가 함께 알려 준 부서 식별자 */
  readonly departmentId: string | null;

  constructor(message: string, status: number, departmentId: string | null = null) {
    super(message);
    this.name = 'StaffRoomHttpError';
    this.status = status;
    this.departmentId = departmentId;
  }
}

/** 인터넷에 닿지 못해 실패했는가 — 계획서 §10.2 의 "연결이 필요해요" 안내 조건 */
export function isOfflineStaffRoomError(err: unknown): boolean {
  return err instanceof StaffRoomHttpError && err.status === 0;
}
