/**
 * 학교알리미 공시(OpenAPI) 조회 포트 — infrastructure 어댑터에서 구현.
 * 인증키 주입·IPC 통신은 어댑터 책임. 도메인은 "지역+항목+연도 → 행 목록"만 안다.
 */
export interface ISchoolDisclosurePort {
  /**
   * 시도/시군구/학교급/연도의 특정 공시항목(apiType)을 그 지역 학교 전체 행으로 반환한다.
   * 우리 학교 필터(SCHUL_NM/SCHUL_CODE)·옆 학교 비교는 호출부에서 처리한다.
   */
  getAreaDisclosure(params: {
    apiType: string;
    schulKndCode: string;
    sidoCode: string;
    sggCode: string;
    pbanYr: string;
  }): Promise<readonly Record<string, unknown>[]>;
}
