/**
 * 사진 명렬표 파서 어댑터 — 형식을 판별해 알맞은 해석기로 넘긴다.
 *
 * 지원 범위는 **최신 나이스 산출물 2종뿐**이다(오너 확정):
 * - `.hwp` 중 HWPML(평문 XML) — 최신 나이스 한글
 * - `.xlsx`
 *
 * 구형 `.hwp`(OLE2)·`.xls`(BIFF8)·`.hwpx` 는 지원하지 않되 **조용히 실패시키지 않는다.**
 * 무엇인지 정확히 알아내서 "어떻게 하면 되는지"를 안내한다.
 */

import type { IPhotoRosterParserPort } from '@domain/ports/IPhotoRosterParserPort';
import {
  UNSUPPORTED_ROSTER_GUIDE,
  type PhotoRosterParseOutcome,
} from '@domain/valueObjects/PhotoRoster';
import { detectRosterFileFormat } from './photoRosterFormat';
import { parseHwpmlPhotoRoster } from './HwpmlPhotoRosterParser';
import { parseXlsxPhotoRoster } from './XlsxPhotoRosterParser';

/** 앞머리 BOM 을 떼고 UTF-8 로 읽는다 (최신 나이스 한글은 BOM 이 붙어 있다) */
function decodeUtf8(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8').decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parsePhotoRosterFile(bytes: Uint8Array): PhotoRosterParseOutcome {
  const format = detectRosterFileFormat(bytes);

  switch (format) {
    case 'hwpml':
      return { ok: true, result: parseHwpmlPhotoRoster(decodeUtf8(bytes)) };
    case 'xlsx':
      return { ok: true, result: parseXlsxPhotoRoster(bytes) };
    default:
      return { ok: false, format, guide: UNSUPPORTED_ROSTER_GUIDE[format] };
  }
}

export class PhotoRosterParserAdapter implements IPhotoRosterParserPort {
  parse(bytes: Uint8Array): PhotoRosterParseOutcome {
    return parsePhotoRosterFile(bytes);
  }
}
