/**
 * 마크다운 변환 실패 메시지 매핑 (순수 — electron/kordoc 의존 없음, 단위 테스트 가능).
 *
 * kordoc 3.1.1 의 ErrorCode 전체를 교사 친화 한국어로 매핑한다. 미매핑 코드가 있으면
 * kordoc 내부 개발자 문구("빈 버퍼이거나 유효하지 않은 입력입니다" 등)가 그대로 노출돼
 * 사용자가 "파일이 없다고 나와" 식으로 혼란을 겪는다 → 모든 코드를 빠짐없이 덮는다.
 *
 * kordoc ErrorCode(= node_modules/kordoc dist 의 d.ts):
 *   EMPTY_INPUT · UNSUPPORTED_FORMAT · ENCRYPTED · DRM_PROTECTED · CORRUPTED
 *   · DECOMPRESSION_BOMB · ZIP_BOMB · IMAGE_BASED_PDF · NO_SECTIONS · PARSE_ERROR
 *   · MISSING_DEPENDENCY
 * (그 외 ssampin 자체 코드 TOO_LARGE/READ_FAILED 등은 호출부에서 직접 메시지를 세팅한다.)
 */

/** 변환 실패 시 사용자에게 보여줄 친화 문구. 코드 미상/미매핑이면 이 문구를 쓴다. */
export const GENERIC_CONVERT_FAILURE =
  '문서를 변환하지 못했어요. 파일이 손상되지 않았는지, 지원 형식(한글·PDF·엑셀·워드)이 맞는지 확인한 뒤 다시 시도해 주세요.';

/**
 * 에러 코드 → 친화 한국어 메시지. 민감 코드는 원시 메시지(파일 경로 echo 위험)를 노출하지 않고
 * 자체 문구를 쓴다. kordoc ErrorCode 11종을 모두 덮는다.
 */
export const FRIENDLY_ERROR: Partial<Record<string, string>> = {
  // 빈/내용 없음 — 사용자가 "파일이 없다"로 인지하던 대표 케이스.
  EMPTY_INPUT:
    '파일에서 읽을 내용을 찾지 못했어요. 파일이 비어 있거나 손상됐을 수 있어요. 파일을 열어 내용을 확인한 뒤 다시 시도해 주세요.',
  NO_SECTIONS:
    '문서에서 글자 내용을 찾지 못했어요. 빈 문서이거나 이미지·표만 있는 문서일 수 있어요. 내용이 들어 있는 파일인지 확인해 주세요.',
  PARSE_ERROR:
    '문서를 읽는 중 문제가 생겼어요. 한글·엑셀에서 파일을 한 번 더 저장한 뒤 다시 시도하거나, 다른 파일로 시도해 주세요.',
  // 잠김/암호
  ENCRYPTED:
    '암호가 걸렸거나 배포용으로 잠긴 문서예요. Windows에서 한글(한컴오피스)이 설치돼 있으면 ‘문서 선택하기’로 다시 시도해 보세요.',
  DRM_PROTECTED:
    '배포용으로 잠긴 문서예요. Windows에서 한글(한컴오피스)이 설치돼 있으면 ‘문서 선택하기’로 다시 시도해 보세요.',
  // PDF/형식
  IMAGE_BASED_PDF:
    '사진(스캔)으로 된 PDF라 글자를 읽지 못했어요. 글자가 들어 있는 파일을 사용해 주세요.',
  UNSUPPORTED_FORMAT: '지원하지 않는 파일 형식이에요. (한글·PDF·엑셀·워드)',
  // 손상/안전
  CORRUPTED: '파일이 손상된 것 같아요. 다른 파일로 다시 시도해 주세요.',
  ZIP_BOMB: '파일이 비정상적으로 커서 안전을 위해 변환을 멈췄어요.',
  DECOMPRESSION_BOMB: '파일이 비정상적으로 커서 안전을 위해 변환을 멈췄어요.',
  MISSING_DEPENDENCY: '이 파일을 읽는 데 필요한 구성요소를 찾지 못했어요.',
};

/** 코드 → 친화 메시지. 미매핑/미상이면 fallback(기본: 일반 실패 문구). */
export function friendlyError(
  code: string | undefined,
  fallback: string = GENERIC_CONVERT_FAILURE,
): string {
  return (code ? FRIENDLY_ERROR[code] : undefined) ?? fallback;
}

/** 엑셀류 파일명인지(.xls/.xlsx/.xlsm/.xlsb). */
export function isSpreadsheetName(fileName: string): boolean {
  return /\.xls[xmb]?$/i.test(fileName.trim());
}

/**
 * 엑셀 파일을 못 읽었을 때의 안내(검증된 해결책 포함).
 *
 * kordoc 3.1.1 은 한컴 한셀·구글시트·WPS 등 비-MS 도구가 만든 xlsx 의 비표준 workbook.xml
 * (예: 네임스페이스 접두사 `<x:sheet>`)에서 시트를 못 찾아 "XLSX 파일에 시트가 없습니다"로 실패한다.
 * Excel(또는 관대한 리더)로 한 번 다시 저장하면 표준 구조로 정규화되어 정상 변환됨을 실측 확인.
 */
export const SPREADSHEET_READ_FAILURE =
  '엑셀 파일에서 표(시트)를 읽지 못했어요. 한컴 한셀·구글시트 등에서 만들었거나 형식이 표준과 조금 달라서 그럴 수 있어요. Excel에서 파일을 연 뒤 ‘다른 이름으로 저장 → Excel 통합 문서(.xlsx)’로 다시 저장해서 올려 주세요.';

/** 엑셀 파일이 구조/형식 문제로 실패한 코드들(암호·DRM·이미지 등은 제외 — 각자 안내가 더 정확). */
const SPREADSHEET_STRUCTURE_FAIL_CODES: ReadonlySet<string> = new Set([
  'PARSE_ERROR', // "XLSX 파일에 시트가 없습니다" (비표준 workbook.xml)
  'UNSUPPORTED_FORMAT', // HTML 표를 .xls 로, BIFF5, SpreadsheetML 등 가짜 엑셀
  'CORRUPTED',
]);

/**
 * 변환 실패 → 사용자 메시지. 엑셀 파일이 구조/형식 문제로 실패하면 ‘다시 저장’ 해결책을 안내하고,
 * 그 외에는 코드별 친화 메시지를 쓴다.
 */
export function friendlyParseFailure(code: string | undefined, fileName: string): string {
  if (isSpreadsheetName(fileName) && code && SPREADSHEET_STRUCTURE_FAIL_CODES.has(code)) {
    return SPREADSHEET_READ_FAILURE;
  }
  return friendlyError(code);
}

/**
 * 파싱은 성공했지만 추출된 글자가 사실상 없는지 판정.
 * true 면 호출부가 "추출된 글자가 거의 없음" 품질 신호를 붙여 사용자에게 빈 결과를 설명한다.
 * (공백만 남는 경우만 — 짧지만 실제 내용이 있는 문서를 오탐하지 않도록 보수적으로.)
 */
export function hasNoExtractableText(markdown: string): boolean {
  return markdown.replace(/\s/g, '').length === 0;
}
