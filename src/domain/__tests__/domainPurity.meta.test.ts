/**
 * `domain/` 순수성 하드 게이트.
 *
 * ## 왜 필요한가 — eslint 가 이걸 못 막는다
 *
 * `eslint.config.js` 의 domain 규칙은 **레이어 별칭만** 막는다
 * (`@usecases/*`, `@adapters/*`, `@infrastructure/*`).
 * npm 패키지는 대상이 아니라서 `import ExcelJS from 'exceljs'` 를 domain 에 써도
 * **린트가 그냥 통과한다.** CLAUDE.md 1번 규칙("domain 은 외부 의존성 import 절대 금지")이
 * 사람의 주의력에만 기대고 있다는 뜻이다.
 *
 * 이 테스트가 그 구멍을 막는다. domain 안의 모든 import 는
 * 상대경로이거나 `@domain/*` 여야 한다 — 그 외에는 전부 실패다.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DOMAIN_ROOT = join(process.cwd(), 'src', 'domain');

function collectSourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectSourceFiles(full));
      continue;
    }
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

/** `import ... from 'x'` / `export ... from 'x'` / `import('x')` 의 'x' 를 모은다 */
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /(?:^|\n)\s*import\s[\s\S]*?from\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*export\s[\s\S]*?from\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]!);
  }
  return specifiers;
}

function isAllowed(specifier: string): boolean {
  return specifier.startsWith('.') || specifier.startsWith('@domain/');
}

describe('domain 레이어 순수성', () => {
  const files = collectSourceFiles(DOMAIN_ROOT);

  it('검사 대상 파일이 실제로 존재한다 (그물이 헛돌지 않는지 확인)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('domain 의 모든 import 는 상대경로이거나 @domain/* 이다 (npm 패키지·다른 레이어 금지)', () => {
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of importSpecifiers(source)) {
        if (isAllowed(specifier)) continue;
        violations.push(`${relative(process.cwd(), file).replace(/\\/g, '/')} → '${specifier}'`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('금지 대상을 실제로 잡아낸다 (그물 자체의 회귀 가드)', () => {
    const sample = [
      "import ExcelJS from 'exceljs';",
      "import { unzipSync } from 'fflate';",
      "import { inflateRawSync } from 'node:zlib';",
      "import { useStore } from '@adapters/stores/useStore';",
      "const mod = await import('exceljs');",
    ].join('\n');
    const caught = importSpecifiers(sample).filter((s) => !isAllowed(s));
    expect(caught).toEqual([
      'exceljs',
      'fflate',
      'node:zlib',
      '@adapters/stores/useStore',
      'exceljs',
    ]);
  });

  it('허용 대상은 통과시킨다', () => {
    const sample = [
      "import type { Student } from '@domain/entities/Student';",
      "import { pairRosterPhotos } from './photoRosterPairing';",
      "export type { SeatingData } from '../entities/Seating';",
    ].join('\n');
    expect(importSpecifiers(sample).filter((s) => !isAllowed(s))).toEqual([]);
  });
});
