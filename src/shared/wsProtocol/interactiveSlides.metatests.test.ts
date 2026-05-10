/**
 * 메타테스트 (Plan §13.1):
 *
 * - MT-6: vite.slides-student outDir이 vite.config.ts (dist) /
 *         vite.student.config.ts (dist-student)와 충돌하지 않음.
 *         실수로 두 SPA가 같은 폴더로 빌드되면 dist 덮어쓰기로 메인 SPA 손상.
 * - MT-3: PROTOCOL_VERSION 상수가 main app + slides-student SPA 양쪽에서
 *         동일 import 경로로 사용됨 (단일 source).
 * - MT-7: interactive-slides 데이터가 syncRegistry / 챗봇 KB에 등록되지 않음
 *         (PIPA §11.1 — GDrive·챗봇 학습 제외).
 */

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PROTOCOL_VERSION } from './interactiveSlides';

const repoRoot = path.resolve(__dirname, '..', '..', '..');

describe('MT-6: vite outDir 충돌 방지', () => {
  it('vite.config.ts / vite.student.config.ts / vite.slides-student.config.ts outDir이 모두 다름', () => {
    const main = readVite('vite.config.ts');
    const student = readVite('vite.student.config.ts');
    const slidesStudent = readVite('vite.slides-student.config.ts');

    const mainOutDir = extractOutDir(main) ?? 'dist';
    const studentOutDir = extractOutDir(student) ?? '';
    const slidesStudentOutDir = extractOutDir(slidesStudent) ?? '';

    expect(studentOutDir.length).toBeGreaterThan(0);
    expect(slidesStudentOutDir.length).toBeGreaterThan(0);
    expect(mainOutDir).not.toBe(studentOutDir);
    expect(mainOutDir).not.toBe(slidesStudentOutDir);
    expect(studentOutDir).not.toBe(slidesStudentOutDir);
  });
});

describe('MT-3: PROTOCOL_VERSION 단일 소스', () => {
  it('학생 SPA의 wsClient.ts가 동일 PROTOCOL_VERSION을 import', () => {
    expect(PROTOCOL_VERSION).toBeDefined();
    const wsClient = fs.readFileSync(
      path.join(repoRoot, 'src/slides-student/wsClient.ts'),
      'utf-8',
    );
    expect(wsClient).toMatch(/PROTOCOL_VERSION/);
    expect(wsClient).toMatch(
      /from\s+['"]@shared\/wsProtocol\/interactiveSlides['"]/,
    );
  });

  it('PROTOCOL_VERSION은 semver 형식 + 본 PR은 1.0.0', () => {
    expect(PROTOCOL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    // 1.0.0 freeze: 향후 bump 시 양쪽이 함께 갱신되어야 함
    expect(PROTOCOL_VERSION).toBe('1.0.0');
  });
});

describe('MT-2: aggregateResponses switch coverage (모든 OverlayType variant 포함)', () => {
  it('overlayRules.ts의 aggregateResponses가 5개 OverlayType variant 모두 case로 처리', () => {
    const overlayRulesPath = path.join(repoRoot, 'src/domain/rules/overlayRules.ts');
    const content = fs.readFileSync(overlayRulesPath, 'utf-8');

    // aggregateResponses 함수 본문만 추출 — 다른 함수의 case는 카운트에서 제외
    const aggregateBody = extractFunctionBody(content, 'aggregateResponses');
    expect(aggregateBody).not.toBeNull();

    const required = ['poll', 'text', 'wordcloud', 'draw', 'draggable'] as const;
    for (const variant of required) {
      const pattern = new RegExp(`case\\s+['"]${variant}['"]`);
      expect(aggregateBody).toMatch(pattern);
    }
  });
});

describe('MT-7: interactive-slides PII 격리 (PIPA §11.1)', () => {
  it('syncRegistry.ts에 interactive-slides 키가 없음', () => {
    // 실제 위치는 src/usecases/sync/syncRegistry.ts (Plan §11.1 메모리 정합)
    const syncRegistryPath = path.join(
      repoRoot,
      'src/usecases/sync/syncRegistry.ts',
    );
    // 본 검사는 실제 파일이 있어야 의미 있음 — 없으면 fail (silent skip 차단)
    expect(fs.existsSync(syncRegistryPath)).toBe(true);
    const content = fs.readFileSync(syncRegistryPath, 'utf-8');
    expect(content).not.toMatch(/interactiveSlidesLessons/);
    expect(content).not.toMatch(/lessonSession/);
  });

  it('챗봇 KB ingest 스크립트에 interactive-slides 응답 데이터 미포함', () => {
    const ingestPath = path.join(repoRoot, 'scripts/ingest-chatbot-qa.mjs');
    // 스크립트는 dev 환경에만 있을 수 있으므로 미존재 시 통과 (CI 환경 고려)
    if (!fs.existsSync(ingestPath)) return;
    const content = fs.readFileSync(ingestPath, 'utf-8');
    // 의도적으로 학습 대상에서 제외 — Plan §11.1 + §7
    expect(content).not.toMatch(/lessonSession/);
    expect(content).not.toMatch(/student-responses/);
  });
});

// ─────────────────────────────────────────────────────────────
function readVite(name: string): string {
  return fs.readFileSync(path.join(repoRoot, name), 'utf-8');
}

function extractOutDir(content: string): string | null {
  const match = content.match(/outDir:\s*['"]([^'"]+)['"]/);
  return match ? match[1]! : null;
}

/**
 * 단순 함수 본문 추출 — `function name(...)` 다음 첫 `{` 부터 짝맞는 `}` 까지.
 * 정밀 파서가 아니라 grep 수준의 텍스트 매칭. 본 테스트 목적상 충분.
 */
function extractFunctionBody(content: string, fnName: string): string | null {
  const sigMatch = new RegExp(`function\\s+${fnName}\\s*\\(`).exec(content);
  if (!sigMatch) return null;
  const sigEnd = sigMatch.index + sigMatch[0].length;
  const openIdx = content.indexOf('{', sigEnd);
  if (openIdx < 0) return null;
  let depth = 0;
  for (let i = openIdx; i < content.length; i++) {
    const ch = content[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return content.substring(openIdx, i + 1);
    }
  }
  return null;
}
