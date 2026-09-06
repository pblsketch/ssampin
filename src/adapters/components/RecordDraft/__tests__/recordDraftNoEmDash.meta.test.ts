/**
 * 메타 테스트 — 생기부 초안 화면과 그 도메인·유스케이스에 em 대시(`—`)를 다시 들이지 않는다.
 *
 * 배경(ADR-085 보강 2, 설계서 `record-evidence-board-v2` §4-3): 화면 문구·placeholder·저장 본문·모델에게
 * 가는 글에 em 대시가 13+2곳 있었다. 오너 결정으로 화면에 보이는 문자열과 모델에게 가는 문자열은 쌍점(`:`)을
 * 쓴다. **주석·JSDoc 은 대상이 아니다** — 설명문이지 화면 문구가 아니라서, 여기서는 주석을 벗긴 뒤 센다.
 *
 * 검증 방식: `recordDraftFontScale.meta.test.ts` 와 같은 방식으로 소스 파일을 문자열로 읽는다. 다만 이 검사는
 * 주석(`/* *\/`·JSDoc·`{/* *\/}`·`//`)을 먼저 지운 뒤 `—` 를 센다. `__tests__` 폴더는 제외한다(테스트 이름은 문구가 아니다).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RECORD_DRAFT_DIR = resolve(__dirname, '..');
const SRC_ROOT = resolve(__dirname, '../../../..');

/** 설계서 §4-3 표에 오른 도메인·유스케이스 파일. 보드 폴더 밖이라 따로 센다. */
const EXTRA_FILES: readonly string[] = [
  'domain/services/threadSuggestPack.ts',
  'domain/rules/threadSuggestionParser.ts',
  'domain/rules/ownAiCliRules.ts',
  'usecases/studentRecords/evidenceImport.ts',
].map((p) => resolve(SRC_ROOT, p));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__') continue;
      out.push(...sourceFiles(p));
    } else if (/\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * 주석을 지운다. 줄 번호를 보존하려고 블록 주석은 줄바꿈만 남긴다.
 * `//` 는 줄 첫머리나 공백 뒤에 오는 것만 주석으로 본다 — `https://` 같은 문자열 속 `//` 는 남긴다.
 */
export function stripComments(src: string): string {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''));
  return noBlock
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');
}

describe('RecordDraft/** 와 그 도메인·유스케이스 — 화면·모델 문자열에 em 대시(—) 금지', () => {
  it('주석을 벗긴 뒤 — 가 0건이다', () => {
    const files = [...sourceFiles(RECORD_DRAFT_DIR), ...EXTRA_FILES];
    const hits: string[] = [];
    for (const file of files) {
      const lines = stripComments(readFileSync(file, 'utf-8')).split('\n');
      lines.forEach((line, i) => {
        if (line.includes('—')) hits.push(`${file}:${i + 1}`);
      });
    }
    expect(
      hits,
      '화면 문구나 모델에게 가는 문자열에 em 대시(—)가 다시 들어왔습니다. 쌍점(:)을 쓰세요(ADR-085 보강 2).',
    ).toEqual([]);
  });

  it('주석 벗기기 자체 — 블록·JSDoc·JSX·줄 주석은 지우고 문자열 속 // 는 남긴다', () => {
    const src = [
      '/** 설명 — 첫 줄 */',
      "const a = 'https://x — y';",
      '{/* JSX — 주석 */}',
      "const b = 'b'; // 뒤 — 주석",
      '// 줄 — 주석',
    ].join('\n');
    const out = stripComments(src);
    expect(out.split('\n')).toHaveLength(5);
    expect(out).toContain("'https://x — y'");
    expect(out).not.toContain('첫 줄');
    expect(out).not.toContain('JSX —');
    expect(out).not.toContain('뒤 —');
    expect(out).not.toContain('줄 —');
  });
});
