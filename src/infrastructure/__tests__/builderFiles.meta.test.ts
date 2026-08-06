/**
 * 메타 테스트 — electron-builder.yml files 섹션에 !prototype/** 제외 규칙 보장.
 *
 * 배경 (Design §6 #4):
 *   Phase 0 UI 스파이크에서 생성된 `prototype/` 디렉터리는 개발용 실험 파일이므로
 *   프로덕션 Electron 인스톨러에 포함되어서는 안 된다. electron-builder.yml의
 *   `files:` 섹션에 `!prototype/**` 제외 규칙이 없으면 prototype 파일 전체가
 *   배포 패키지에 포함되어 인스톨러 용량이 불필요하게 커지고 보안 리스크가 발생한다.
 *
 * 검증 방식:
 *   electron-builder.yml을 문자열로 읽어 `!prototype/**` 패턴이
 *   files 섹션 컨텍스트에서 존재하는지 정규식으로 확인한다.
 *
 * 현재 상태:
 *   이 테스트는 A.7 작업(main thread: electron-builder.yml에 !prototype/** 추가) 전까지
 *   의도적으로 FAIL 상태이다. A.7이 완료되면 PASS로 전환된다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');

const ELECTRON_BUILDER_YML_PATH = resolve(ROOT, 'electron-builder.yml');

function readElectronBuilderYml(): string {
  return readFileSync(ELECTRON_BUILDER_YML_PATH, 'utf-8');
}

/**
 * 설치파일에서 반드시 빠져야 하는 node_modules 서브트리.
 *
 * 배경 (dependency-security-hardening, 2026-08-07):
 *   Dependabot 알림 39건을 추적한 결과, 상당수가 "앱이 실제로 실행하지 않는 코드"에서 나왔다.
 *   - kordoc 은 `kordoc-mcp` 라는 별도 실행파일에서만 @modelcontextprotocol/sdk 를 쓴다.
 *     쌤핀이 import 하는 dist/index.cjs 는 xmldom·jszip·markdown-it 만 필요하다.
 *     그런데 sdk 가 express/hono 웹서버까지 끌고 와 알림 6건의 발생원이 됐다.
 *   - sharp(+@img 20MB) 는 앱 런타임에서 쓰지 않는다(이미지 처리는 Electron nativeImage).
 *   - onnxruntime/@huggingface 계열은 kordoc 의 수식 OCR optional 경로 전용.
 *
 *   배포되지 않는 코드의 취약점은 선생님 PC에 도달하지 않는다. 반대로 한 번 뺀 항목이
 *   조용히 되돌아오면 알림도 위험도 함께 돌아온다. 그래서 목록을 테스트로 고정한다.
 *
 * 되돌려야 할 때:
 *   해당 패키지를 앱이 정말 런타임에 require 하는지 먼저 grep 으로 확인하고,
 *   이 배열과 electron-builder.yml 을 함께 고친다. 한쪽만 고치면 이 테스트가 막는다.
 */
const REQUIRED_NODE_MODULES_EXCLUSIONS = [
  'onnxruntime-node',
  'onnxruntime-common',
  '@huggingface',
  '@hyzyla',
  '@modelcontextprotocol',
  '@hono',
  'hono',
  'express',
  'express-rate-limit',
  'adm-zip',
  'sharp',
  '@img',
] as const;

describe('electron-builder.yml 미사용 node_modules 배포 제외 보장', () => {
  it.each(REQUIRED_NODE_MODULES_EXCLUSIONS)('files 섹션이 node_modules/%s 를 제외한다', (pkg) => {
    const src = readElectronBuilderYml();
    // `- '!node_modules/<pkg>/**'` — 따옴표/공백 변형 허용
    const pattern = new RegExp(
      `!\\s*node_modules/${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\*\\*`,
    );
    expect(
      pattern.test(src),
      `electron-builder.yml files 섹션에 "!node_modules/${pkg}/**" 제외 규칙이 없습니다. ` +
        '앱이 실행하지 않는 코드가 설치파일에 담겨 취약점 알림과 용량이 함께 늘어납니다. ' +
        '정말 런타임에 필요해진 경우에만 이 테스트의 목록에서 항목을 빼세요.',
    ).toBe(true);
  });
});

describe('electron-builder.yml prototype 디렉터리 배포 제외 보장', () => {
  it('electron-builder.yml files must include !prototype/**', () => {
    const src = readElectronBuilderYml();

    // !prototype/** 패턴이 files 섹션에 존재해야 한다
    // 공백/따옴표 변형 허용: `- "!prototype/**"`, `- '!prototype/**'`, `- !prototype/**`
    const hasPrototypeExclusion = /!\s*prototype\/\*\*/.test(src);
    expect(
      hasPrototypeExclusion,
      'electron-builder.yml의 files 섹션에 "!prototype/**" 제외 규칙이 없습니다. ' +
        'prototype/ 디렉터리(Phase 0 UI 스파이크 파일)가 프로덕션 인스톨러에 포함됩니다. ' +
        'files 섹션에 "- !prototype/**" 행을 추가하세요 (A.7 작업).',
    ).toBe(true);
  });
});
