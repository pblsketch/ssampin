import type { AppinSchool, AppinElements, AppinFileMeta } from '../entities/AppinTimetable';

/**
 * 압핀(sgpap.com) 포트 인터페이스 — infrastructure 레이어에서 구현.
 * 통신·인코딩(EUC-KR/UTF-8 혼재) 처리는 어댑터가, 격자 파싱·시간표 변환은
 * domain/rules/appinRules 가 담당한다.
 */
export interface IAppinPort {
  /**
   * (시/군, 학교명)으로 압핀 등록 학교를 조회한다(getupdir).
   * 정확한 등록명에만 매칭하며, 없으면 null 을 반환한다.
   */
  resolveSchool(city: string, name: string): Promise<AppinSchool | null>;

  /** 원소표(이동수업 교실/학급 라벨 목록)를 가져온다(dnele). */
  getElements(webdir: string): Promise<AppinElements>;

  /**
   * 특정 주차 시간표 파일(예: 'h20.txt', 'g20.txt', 't20.txt')을
   * EUC-KR 디코딩한 원문 문자열로 가져온다.
   */
  getWeekFileText(webdir: string, filename: string): Promise<string>;

  /** 학교 폴더의 파일 목록(수정일 포함)을 가져온다 — 현재 주차 판정용. */
  listFiles(webdir: string): Promise<readonly AppinFileMeta[]>;
}
