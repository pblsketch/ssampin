/**
 * 요청서 기준선 대조 — "장면·연결·메모가 없으면 요청서가 P0 기준선과 **글자 하나까지** 같다".
 *
 * 서사 그래프(P1~P5)가 요청서 조립을 건드리는 내내, 이 검사가 폴백 경로의 불변을 지킨다.
 * 픽스처를 다시 뜨는 법과 두 벌(`pre/`·`base/`)의 뜻은 `fixtures/recordDraftPack/cases.ts` 머리글에.
 *
 * ★경로는 `import.meta.url` 기준으로 연다. 저장소 안에 `path.resolve('tests/fixtures')` 를 쓰는
 *   선례가 있지만 그건 **실행 디렉터리 상대**라 다른 곳에서 돌리면 못 찾는다.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildRecordDraftPack } from '../recordDraftPack';
import { PACK_FIXTURE_CASES } from './fixtures/recordDraftPack/cases';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(HERE, 'fixtures', 'recordDraftPack');

/** `pre` 또는 `base` 를 주면 그 폴더로 **덮어쓴다**. 평소에는 비어 있어야 한다(대조만 한다). */
const WRITE_TARGET = process.env['PACK_FIXTURE_WRITE'];

function fixturePath(bucket: string, name: string): string {
  return join(FIXTURE_ROOT, bucket, `${name}.txt`);
}

describe('요청서 기준선(base/)', () => {
  if (WRITE_TARGET === 'pre' || WRITE_TARGET === 'base') {
    it(`${WRITE_TARGET}/ 을 다시 뜬다`, () => {
      mkdirSync(join(FIXTURE_ROOT, WRITE_TARGET), { recursive: true });
      for (const c of PACK_FIXTURE_CASES) {
        writeFileSync(
          fixturePath(WRITE_TARGET, c.name),
          buildRecordDraftPack(c.input).text,
          'utf8',
        );
      }
      expect(PACK_FIXTURE_CASES.length).toBe(6);
    });
    return;
  }

  for (const c of PACK_FIXTURE_CASES) {
    it(`${c.name} 은 base/ 와 글자 하나까지 같다`, () => {
      const path = fixturePath('base', c.name);
      expect(existsSync(path), `기준선 파일이 없다: ${path}`).toBe(true);
      expect(buildRecordDraftPack(c.input).text).toBe(readFileSync(path, 'utf8'));
    });
  }

  it('무날짜 근거는 맨 뒤로 가고 그 둘의 순서는 createdAt 으로 고정된다', () => {
    const nodate = PACK_FIXTURE_CASES.find((c) => c.name === 'nodate');
    expect(nodate).toBeDefined();
    const lines = buildRecordDraftPack(nodate!.input)
      .text.split('\n')
      .filter((l) => l.startsWith('- '));
    expect(lines).toHaveLength(5);
    // 날짜가 있는 셋이 먼저, 그 안에서 날짜 오름차순.
    expect(lines[0]).toContain('(2026-09-02)');
    expect(lines[1]).toContain('(2026-09-11)');
    expect(lines[2]).toContain('(2026-09-18)');
    // 무날짜 둘이 뒤에, createdAt 이 작은 것이 먼저.
    expect(lines[3]).toContain('먼저 적음');
    expect(lines[4]).toContain('나중에 적음');
  });
});
