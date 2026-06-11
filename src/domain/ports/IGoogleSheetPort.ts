/**
 * Google Sheet 생성 포트 — 서명 결과를 시트로 내보낼 때 사용.
 *
 * 순수 도메인 인터페이스 — 구현체는 메인 프로세스에 위치 (drive.file 스코프 격리).
 * drive.file 스코프로 시트를 생성하고 서명 셀에 `=IMAGE(url)` 수식을
 * 주입하는 동작을 추상화한다. 도메인은 Google API/fetch를 알지 않는다.
 */

import type { ColumnDef } from '../entities/SignatureRoster';

/** 시트 1행 — 컬럼 key → 셀 값 매핑 (signature 컬럼 값은 공개 이미지 URL) */
export type SheetRow = Record<string, string>;

/** createRegisterSheet 입력 */
export interface CreateRegisterSheetInput {
  /** 시트(스프레드시트) 제목 */
  readonly title: string;
  /** 저장 폴더 이름 (drive.file 내 생성) */
  readonly folderName: string;
  /** 시트 상단 안내 문구 */
  readonly headerText: string;
  /** 컬럼 정의 목록 (order 기준 정렬, 헤더 행 구성) */
  readonly columns: readonly ColumnDef[];
  /**
   * 데이터 행 목록.
   * 각 row의 signature 타입 컬럼 값은 `signature_public_url` (공개 이미지 URL)이며,
   * 구현체가 `=IMAGE(url)` 수식으로 변환해 주입한다.
   */
  readonly rows: readonly SheetRow[];
}

/** createRegisterSheet 출력 */
export interface CreateRegisterSheetResult {
  /** 생성된 스프레드시트 식별자 */
  readonly spreadsheetId: string;
  /** 스프레드시트 접근 URL */
  readonly url: string;
}

/** Google Sheet 포트 */
export interface IGoogleSheetPort {
  /**
   * 서명 명부 시트 생성.
   * drive.file 스코프로 시트를 만들고 signature 컬럼에 `=IMAGE` 수식을 주입한다.
   */
  createRegisterSheet(input: CreateRegisterSheetInput): Promise<CreateRegisterSheetResult>;
}
