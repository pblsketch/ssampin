/**
 * 메타 테스트 — 생기부 초안 화면(`RecordDraft/**`)에 9.6~10.4px 짜리 글자를 다시 들이지 않는다.
 *
 * 배경(ADR-085, 설계서 §4-3 1단계): AI 미리보기가 `text-[0.6rem]` 14곳으로 9.6px 였다. 편집 칸은 14px
 * 인데 AI 답만 작아 읽기 어려웠고, 임의 rem 값은 설정 > 화면 > 글꼴 크기(작게~매우 크게)의 비율을 깨뜨린다.
 * 최소는 `text-xs`(0.75rem), 본문·편집 칸은 `text-sm` 이상이다.
 *
 * 검증 방식: 폴더 안 소스 파일을 문자열로 읽어 `text-[0.x rem]`(0.75rem 미만, 즉 0.7·0.8rem 같은 임의 값 포함)
 * 클래스가 없는지 본다. 디자인 검토(2026-09-06)에서 0.7·0.8rem 도 전부 `text-xs` 로 올렸다 — 다시 들어오지 않게 잠근다.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIR = resolve(__dirname, '..');

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

describe('RecordDraft/** 글자 비율 — text-xs(0.75rem) 미만 임의 rem 금지', () => {
  it('text-[0.x rem] 클래스가 0건이다(0.5·0.6·0.7·0.8rem 모두)', () => {
    const hits: string[] = [];
    for (const file of sourceFiles(DIR)) {
      const src = readFileSync(file, 'utf-8');
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        if (/text-\[0\.\d+rem\]/.test(line)) hits.push(`${file}:${i + 1}`);
      });
    }
    expect(
      hits,
      '생기부 초안 화면에 text-[0.x rem] 임의 글자 크기가 다시 들어왔습니다. 최소 text-xs 를 쓰세요(ADR-085).',
    ).toEqual([]);
  });
});
