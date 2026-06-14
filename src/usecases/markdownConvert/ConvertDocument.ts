/**
 * 문서 변환 유스케이스 — 파일 선택 + 파싱(포트 위임).
 * domain 포트만 의존(infrastructure/adapters import 금지).
 */
import type { IDocumentParserPort, ParseOutcome } from '@domain/ports/IDocumentParserPort';

export class ConvertDocument {
  constructor(private readonly parser: IDocumentParserPort) {}

  execute(): Promise<ParseOutcome> {
    return this.parser.pickAndParse();
  }

  /** 여러 파일을 동시에 선택해 변환. */
  executeMulti(): Promise<ParseOutcome[]> {
    return this.parser.pickAndParseMulti();
  }

  /** 드롭한 파일 bytes 로 변환. */
  executeFromBytes(bytes: Uint8Array, fileName: string): Promise<ParseOutcome> {
    return this.parser.parseBytes(bytes, fileName);
  }
}
