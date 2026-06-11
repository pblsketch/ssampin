/**
 * Google Sheets API v4 클라이언트
 *
 * 서명받기 결과를 교사 드라이브의 스프레드시트로 내보낸다.
 * IGoogleSheetPort 구현체.
 *
 * 동작:
 *  (a) Sheets API로 빈 스프레드시트 생성
 *  (b) Drive로 "쌤핀 서명" 폴더에 이동 (parent 설정)
 *  (c) values:batchUpdate(USER_ENTERED)로 헤더행 + 데이터행 작성.
 *      signature 컬럼 셀은 `=IMAGE("{url}")` 수식으로 주입 (USER_ENTERED라 수식 보존).
 *
 * drive.file 스코프로 충분 — 앱이 생성한 시트만 다루므로 스코프 변경 불필요.
 */
import { GOOGLE_AUTH_BLOCKED_MESSAGE } from '@domain/rules/calendarSyncRules';
import type {
  IGoogleSheetPort,
  CreateRegisterSheetInput,
  CreateRegisterSheetResult,
} from '@domain/ports/IGoogleSheetPort';
import type { IGoogleDrivePort } from '@domain/ports/IGoogleDrivePort';

const SHEETS_API_URL = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';

/** Sheets spreadsheets.create 응답 */
interface CreateSpreadsheetResponse {
  spreadsheetId: string;
}

/** Sheets API 에러 */
interface SheetsApiError extends Error {
  code: number;
}

export class GoogleSheetClient implements IGoogleSheetPort {
  private readonly getAccessToken: () => Promise<string>;
  private readonly drivePort: IGoogleDrivePort;

  /**
   * @param getAccessToken 교사 OAuth access token getter (GoogleDriveClient와 동일 소스)
   * @param drivePort 폴더 생성/이동용 Drive 포트
   */
  constructor(getAccessToken: () => Promise<string>, drivePort: IGoogleDrivePort) {
    this.getAccessToken = getAccessToken;
    this.drivePort = drivePort;
  }

  /**
   * Google API 공통 fetch 헬퍼 (JSON 요청/응답)
   */
  private async request<T>(url: string, options: RequestInit): Promise<T> {
    const accessToken = await this.getAccessToken();

    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    });

    if (!res.ok) {
      const err = await res.text();
      if (
        res.status === 403 &&
        (err.includes('accessNotConfigured') ||
          err.includes('has not been used') ||
          err.includes('it is disabled'))
      ) {
        throw new Error(
          'Google Sheets API가 활성화되지 않았습니다. Google Cloud Console에서 Sheets API를 사용 설정해주세요.',
        );
      }
      const message =
        res.status === 401
          ? GOOGLE_AUTH_BLOCKED_MESSAGE
          : `Google Sheets API error: ${res.status} ${err}`;
      const error = new Error(message) as SheetsApiError;
      error.code = res.status;
      throw error;
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  /**
   * 서명 명부 시트 생성.
   */
  async createRegisterSheet(input: CreateRegisterSheetInput): Promise<CreateRegisterSheetResult> {
    // (a) 빈 스프레드시트 생성
    const created = await this.request<CreateSpreadsheetResponse>(SHEETS_API_URL, {
      method: 'POST',
      body: JSON.stringify({
        properties: { title: input.title },
      }),
    });
    const spreadsheetId = created.spreadsheetId;

    // (b) "쌤핀 서명" 폴더에 이동 (parent 설정)
    const folder = await this.drivePort.getOrCreateRootFolder(input.folderName);
    await this.moveToFolder(spreadsheetId, folder.id);

    // (c) 헤더행 + 데이터행 작성 (USER_ENTERED → =IMAGE 수식 보존)
    const values = this.buildValues(input);
    await this.batchUpdateValues(spreadsheetId, values);

    return {
      spreadsheetId,
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    };
  }

  /**
   * 스프레드시트를 대상 폴더로 이동.
   * Drive files.update?addParents=...&removeParents=root
   */
  private async moveToFolder(fileId: string, folderId: string): Promise<void> {
    const params = new URLSearchParams({
      addParents: folderId,
      removeParents: 'root',
      fields: 'id,parents',
    });
    await this.request<{ id: string }>(`${DRIVE_API_URL}/files/${fileId}?${params.toString()}`, {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
  }

  /**
   * 입력으로부터 시트 2차원 값 배열 구성.
   * 1행: 안내 문구 (headerText), 2행: 컬럼 라벨, 이후: 데이터행.
   * signature 타입 컬럼 셀은 `=IMAGE("{url}")` 수식.
   */
  private buildValues(input: CreateRegisterSheetInput): string[][] {
    const columns = [...input.columns].sort((a, b) => a.order - b.order);
    const signatureKeys = new Set(columns.filter((c) => c.type === 'signature').map((c) => c.key));

    const rows: string[][] = [];

    // 1행: 안내 문구 (있을 때만)
    if (input.headerText) {
      rows.push([input.headerText]);
    }

    // 헤더행: 컬럼 라벨
    rows.push(columns.map((c) => c.label));

    // 데이터행
    for (const row of input.rows) {
      rows.push(
        columns.map((c) => {
          const value = row[c.key] ?? '';
          if (signatureKeys.has(c.key) && value) {
            // signature 셀만 의도된 수식(=IMAGE)을 주입한다.
            return `=IMAGE("${escapeFormulaUrl(value)}")`;
          }
          // 그 외 모든 텍스트 셀은 수식 주입(=,+,-,@,탭/CR 선두)을 무력화한다.
          // USER_ENTERED 모드에서 명단 이름 등이 '=...'로 시작하면 수식으로 실행되는 것을 차단.
          return neutralizeFormula(value);
        }),
      );
    }

    return rows;
  }

  /**
   * values:batchUpdate 로 시트 전체 값 작성 (USER_ENTERED).
   */
  private async batchUpdateValues(spreadsheetId: string, values: string[][]): Promise<void> {
    await this.request<unknown>(`${SHEETS_API_URL}/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: 'A1',
            majorDimension: 'ROWS',
            values,
          },
        ],
      }),
    });
  }
}

/**
 * `=IMAGE("...")` 수식에 들어갈 URL 내 큰따옴표 이스케이프.
 */
function escapeFormulaUrl(url: string): string {
  return url.replace(/"/g, '""');
}

/**
 * 수식 주입(formula/CSV injection) 무력화.
 * Google Sheets는 `=`, `+`, `-`, `@` 로 시작하는 셀을 USER_ENTERED 모드에서
 * 수식으로 해석한다. 선두에 작은따옴표(')를 붙이면 시트가
 * 강제로 텍스트로 취급하며, 작은따옴표 자체는 표시되지 않는다(시트 표준 동작).
 */
function neutralizeFormula(value: string): string {
  if (value.length > 0 && /^[=+@-]/.test(value)) {
    return `'${value}`;
  }
  return value;
}
