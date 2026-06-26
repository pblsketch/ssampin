/**
 * markdownConvertErrors — 변환 실패 메시지/빈 추출 판정 회귀 가드.
 *
 * 배경(사용자 신고): 마크다운 변환기에서 문서를 골랐는데 "파일이 없다"는 식의
 * 혼란스러운 메시지가 떴다. 원인 = kordoc ErrorCode 일부가 미매핑이라 내부 개발자
 * 문구가 그대로 노출됨 + 빈 추출(내용 없음)에 안내가 없었음.
 */
import { describe, it, expect } from 'vitest';
import {
  FRIENDLY_ERROR,
  GENERIC_CONVERT_FAILURE,
  SPREADSHEET_READ_FAILURE,
  friendlyError,
  friendlyParseFailure,
  isSpreadsheetName,
  hasNoExtractableText,
} from './markdownConvertErrors';

// kordoc 3.1.1 ErrorCode 전체 (dist d.ts 기준) — 하나라도 빠지면 원시 문구가 샌다.
const KORDOC_ERROR_CODES = [
  'EMPTY_INPUT',
  'UNSUPPORTED_FORMAT',
  'ENCRYPTED',
  'DRM_PROTECTED',
  'CORRUPTED',
  'DECOMPRESSION_BOMB',
  'ZIP_BOMB',
  'IMAGE_BASED_PDF',
  'NO_SECTIONS',
  'PARSE_ERROR',
  'MISSING_DEPENDENCY',
] as const;

describe('friendlyError', () => {
  it('kordoc ErrorCode 11종을 빠짐없이 매핑한다(원시 문구 누출 방지)', () => {
    for (const code of KORDOC_ERROR_CODES) {
      expect(FRIENDLY_ERROR[code], `${code} 미매핑`).toBeTruthy();
    }
  });

  it('이전에 누락됐던 코드도 친화 문구를 돌려준다(원시 kordoc 문구 미사용)', () => {
    // 회귀의 핵심: EMPTY_INPUT 원시 문구는 "빈 버퍼이거나 유효하지 않은 입력입니다."
    expect(friendlyError('EMPTY_INPUT')).not.toContain('버퍼');
    expect(friendlyError('NO_SECTIONS')).toContain('내용');
    expect(friendlyError('PARSE_ERROR')).toBeTruthy();
  });

  it('미상/미매핑 코드는 일반 실패 문구로 폴백한다', () => {
    expect(friendlyError(undefined)).toBe(GENERIC_CONVERT_FAILURE);
    expect(friendlyError('SOME_UNKNOWN_CODE')).toBe(GENERIC_CONVERT_FAILURE);
  });
});

describe('friendlyParseFailure (엑셀 시트 못 읽음 — 사용자 신고 핵심)', () => {
  it('엑셀 파일 + 구조 실패(PARSE_ERROR="XLSX 파일에 시트가 없습니다")면 ‘다시 저장’ 해결책을 안내한다', () => {
    // kordoc 3.1.1: 한셀/구글시트 등 비표준 workbook.xml → PARSE_ERROR "XLSX 파일에 시트가 없습니다"
    expect(friendlyParseFailure('PARSE_ERROR', '생기부내용.xlsx')).toBe(SPREADSHEET_READ_FAILURE);
    expect(friendlyParseFailure('UNSUPPORTED_FORMAT', '성적.xls')).toBe(SPREADSHEET_READ_FAILURE);
    expect(SPREADSHEET_READ_FAILURE).toContain('다시 저장');
  });

  it('엑셀이라도 암호/이미지 등은 각자 안내가 더 정확하므로 시트 메시지로 덮지 않는다', () => {
    expect(friendlyParseFailure('ENCRYPTED', '잠긴.xlsx')).toBe(FRIENDLY_ERROR.ENCRYPTED);
  });

  it('엑셀이 아니면(예: hwp) 시트 메시지를 쓰지 않는다', () => {
    expect(friendlyParseFailure('PARSE_ERROR', '문서.hwp')).not.toBe(SPREADSHEET_READ_FAILURE);
  });

  it('isSpreadsheetName: xls/xlsx/xlsm/xlsb만 true', () => {
    expect(isSpreadsheetName('a.xlsx')).toBe(true);
    expect(isSpreadsheetName('a.XLS')).toBe(true);
    expect(isSpreadsheetName('a.xlsm')).toBe(true);
    expect(isSpreadsheetName('a.hwp')).toBe(false);
    expect(isSpreadsheetName('a.pdf')).toBe(false);
  });
});

describe('hasNoExtractableText', () => {
  it('공백만 있으면(빈 docx 등) true', () => {
    expect(hasNoExtractableText('')).toBe(true);
    expect(hasNoExtractableText('   \n\n  ')).toBe(true);
  });

  it('실제 글자가 있으면 false(짧은 문서 오탐 금지)', () => {
    expect(hasNoExtractableText('## Sheet')).toBe(false);
    expect(hasNoExtractableText('# 제목')).toBe(false);
    expect(hasNoExtractableText('| 번호 | 이름 |')).toBe(false);
  });
});
