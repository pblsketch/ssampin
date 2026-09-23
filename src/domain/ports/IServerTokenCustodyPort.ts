/**
 * 서버가 맡아 둔 선생님 구글 토큰을 지우는 포트 (ADR-136 D4).
 *
 * 과제 수합(학생 파일을 선생님 드라이브에 올리기)과 온라인 교무실(부서 자료실)은 서버가
 * 선생님 토큰을 암호화해 맡아 두고 대신 드라이브를 부른다. 연결을 해제하면 그 보관분도
 * 지워야 방침의 "연결 해제 = 삭제"가 참이 된다.
 */
export interface IServerTokenCustodyPort {
  /**
   * 본인 확인용 access token 을 보내, 그 구글 계정으로 서버에 맡긴 토큰을 모두 지운다.
   * ★구글 쪽 폐기(revoke) **전에** 불러야 한다 — 폐기한 뒤에는 본인 확인을 할 수 없다.
   */
  deleteMine(googleAccessToken: string): Promise<void>;
}
