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
