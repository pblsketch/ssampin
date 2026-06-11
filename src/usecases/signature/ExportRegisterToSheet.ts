/**
 * 서명 명부를 Google Sheet로 내보내는 유스케이스.
 *
 * 흐름:
 *  1) ISignaturePort.getStatus 로 현황을 취합(관리 키 검증 겸 최신 완료 상태 확인)
 *  2) 호출자가 전달한 데이터행(rows: signature 셀 = signaturePublicUrl)을
 *     IGoogleSheetPort.createRegisterSheet 로 시트 생성
 *  3) 생성된 drive_spreadsheet_id 반환
 *
 * 전부 port 주입(의존성 역전) — infra(Supabase/Sheets)를 직접 알지 않는다.
 */
import type { ColumnDef } from '@domain/entities/SignatureRoster';
import type { ISignaturePort } from '@domain/ports/ISignaturePort';
import type { IGoogleSheetPort, SheetRow } from '@domain/ports/IGoogleSheetPort';

/** 기본 저장 폴더명 */
const DEFAULT_SIGNATURE_FOLDER = '쌤핀 서명';

export interface ExportRegisterToSheetParams {
  /** 대상 세션 식별자 */
  readonly sessionId: string;
  /** 교사 관리 키 (현황 조회 권한) */
  readonly adminKey: string;
  /** 시트 제목 */
  readonly title: string;
  /** 시트 상단 안내 문구 */
  readonly headerText: string;
  /** 컬럼 정의 목록 (order 기준 정렬) */
  readonly columns: readonly ColumnDef[];
  /**
   * 데이터 행 목록.
   * signature 타입 컬럼 값은 signaturePublicUrl(공개 이미지 URL)이며,
   * GoogleSheetClient가 `=IMAGE(url)` 수식으로 변환해 주입한다.
   */
  readonly rows: readonly SheetRow[];
  /** 저장 폴더명 (기본 '쌤핀 서명') */
  readonly folderName?: string;
}

export interface ExportRegisterToSheetResult {
  /** 생성된 스프레드시트 식별자 (세션의 drive_spreadsheet_id로 저장) */
  readonly driveSpreadsheetId: string;
  /** 스프레드시트 접근 URL */
  readonly url: string;
}

export class ExportRegisterToSheet {
  constructor(
    private readonly signaturePort: ISignaturePort,
    private readonly sheetPort: IGoogleSheetPort,
  ) {}

  async execute(params: ExportRegisterToSheetParams): Promise<ExportRegisterToSheetResult> {
    // 1) 현황 취합 (관리 키 검증 겸 최신 완료 상태 확인)
    await this.signaturePort.getStatus(params.sessionId, params.adminKey);

    // 2) 시트 생성 (signature 셀 → =IMAGE 수식은 GoogleSheetClient가 처리)
    const result = await this.sheetPort.createRegisterSheet({
      title: params.title,
      folderName: params.folderName ?? DEFAULT_SIGNATURE_FOLDER,
      headerText: params.headerText,
      columns: params.columns,
      rows: params.rows,
    });

    // 3) drive_spreadsheet_id 반환
    return {
      driveSpreadsheetId: result.spreadsheetId,
      url: result.url,
    };
  }
}
