import type { ComciganRawSchoolData, ComciganSchool } from '../entities/ComciganTimetable';

/**
 * 컴시간알리미 포트 인터페이스 — infrastructure 레이어에서 구현.
 * 통신·라우트 추출은 어댑터가, 수업 코드 해석은 domain/rules/comciganRules 가 담당한다.
 */
export interface IComciganPort {
  /** 학교명으로 컴시간 등록 학교를 검색한다 (미등록이면 빈 배열). */
  searchSchools(name: string): Promise<readonly ComciganSchool[]>;

  /** 학교 전체 시간표 원본 데이터(교사/과목 목록 + 기본 편성표 격자)를 가져온다. */
  getSchoolData(schoolCode: number): Promise<ComciganRawSchoolData>;
}
