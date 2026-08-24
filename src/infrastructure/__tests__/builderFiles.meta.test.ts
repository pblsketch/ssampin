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
  // @napi-rs — pdfjs-dist 의 Node 전용 캔버스 백엔드. 쌤핀은 renderer 의 DOM 캔버스만 쓴다.
  // 칩/OS 전용 바이너리라 macOS universal 빌드의 x64·arm64 병합까지 막았다(2026-08-24).
  '@napi-rs',
  // leveldown — 협업 보드 서버의 optional 저장소. y-websocket/bin/utils.cjs 가 YPERSISTENCE
  // 환경변수가 있을 때만 require 하는데 쌤핀은 설정하지 않는다(build-electron.mjs 도 external 처리).
  'leveldown',
] as const;

describe('electron-builder.yml 미사용 node_modules 배포 제외 보장', () => {
  it.each(REQUIRED_NODE_MODULES_EXCLUSIONS)(
    'files 섹션이 **/node_modules/%s 를 제외한다',
    (pkg) => {
      const src = readElectronBuilderYml();
      // `- '!**/node_modules/<pkg>/**'` — 따옴표/공백 변형 허용.
      //
      // '**/' 접두사를 강제하는 이유(2026-08-24): 'node_modules/x/**' 는 최상위 사본만 지운다.
      // npm 은 버전 충돌·플랫폼별 optional 의존성 때문에 node_modules/<다른패키지>/node_modules/x
      // 형태의 중첩 사본을 만드는데, 그건 규칙에 걸리지 않아 그대로 설치파일에 실렸다.
      // macOS universal 빌드가 kordoc/node_modules/onnxruntime-node 의 dylib 때문에 실패하면서
      // 드러났고, 그 전까지 Windows 설치파일에도 조용히 포함돼 있었다.
      const pattern = new RegExp(
        `!\\s*\\*\\*/node_modules/${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\*\\*`,
      );
      expect(
        pattern.test(src),
        `electron-builder.yml files 섹션에 "!**/node_modules/${pkg}/**" 제외 규칙이 없습니다. ` +
          '앱이 실행하지 않는 코드가 설치파일에 담겨 취약점 알림과 용량이 함께 늘어납니다. ' +
          '"node_modules/…" 로만 쓰면 중첩 사본이 빠져나가니 "**/node_modules/…" 형태로 적으세요. ' +
          '정말 런타임에 필요해진 경우에만 이 테스트의 목록에서 항목을 빼세요.',
      ).toBe(true);
    },
  );
});

/**
 * macOS 서명·아키텍처 회귀 방지 (2026-08-24).
 *
 * 배경:
 *   v2.4.4 까지 맥 빌드는 서명을 통째로 건너뛰고 있었다. electron-builder 는 인증서를 못 찾으면
 *   warn 한 줄만 남기고 성공하므로(app-builder-lib macPackager.sign(): identity 없으면 return false),
 *   빌드도 CI 도 초록불이었다. 그 결과 배포된 DMG 의 앱 번들에는 _CodeSignature 가 0개였고,
 *   macOS 는 이를 "미확인 개발자"가 아니라 "손상된 앱"으로 취급했다 —
 *   즉 [그래도 열기] 안내가 통하지 않고 선생님이 터미널 xattr 명령을 쳐야 하는 상태였다.
 *
 *   `identity: '-'` 는 Developer ID(연 $99) 없이 쓰는 무료 임시 서명(ad-hoc)이며,
 *   이 한 줄이 사라지면 위 상태로 조용히 되돌아간다. 그래서 설정을 테스트로 고정한다.
 *
 * 되돌려야 할 때:
 *   Apple Developer Program 에 가입해 Developer ID 서명 + 공증(notarization)을 도입하는 경우다.
 *   그때는 identity 를 실제 인증서로 바꾸고 hardenedRuntime 을 true 로 되돌린 뒤 이 테스트를 함께 고친다.
 */
describe('electron-builder.yml macOS 서명 설정 보장', () => {
  it('mac.identity 가 설정되어 있다 (서명 건너뛰기 방지)', () => {
    const src = readElectronBuilderYml();
    expect(
      /^\s*identity:\s*'-'\s*$/m.test(src),
      "electron-builder.yml 의 mac 섹션에 identity: '-' 가 없습니다. " +
        '이 줄이 없으면 electron-builder 가 인증서를 못 찾고 서명을 통째로 건너뛰어, ' +
        'macOS 가 앱을 "손상됨"으로 판단해 설치 자체가 막힙니다.',
    ).toBe(true);
  });

  it('ad-hoc 서명과 충돌하는 hardenedRuntime 이 꺼져 있다', () => {
    const src = readElectronBuilderYml();
    expect(
      /^\s*hardenedRuntime:\s*false\s*$/m.test(src),
      'ad-hoc 서명(identity: "-")과 hardenedRuntime: true 를 함께 쓰면 ' +
        '라이브러리 검증에 걸려 앱이 실행되지 않을 수 있습니다. 공증을 도입하기 전에는 false 로 둡니다.',
    ).toBe(true);
  });

  /**
   * mac 은 칩별 2파일(x64·arm64) 유지 — 2026-08-24 오너 판단.
   *
   * universal 통합을 시도했다가 되돌렸다. 통합은 칩 오선택 사고를 없애지만 모든 사용자의
   * 다운로드 용량이 2배(약 330MB → 640MB)가 되고, 실사용 인텔 Mac 이 사실상 없다
   * (릴리즈당 x64 1건 vs arm64 4~14건). 대신 랜딩·앱 내 업데이트가 칩에 맞는 파일을 고른다.
   *
   * 파일명 규칙(ssampin-${arch}.dmg)은 latest-mac.yml·랜딩 URL·앱 내 업데이트가 모두 참조하므로
   * 여기서 arch 목록이 바뀌면 그 세 곳도 함께 바뀌어야 한다.
   */
  /**
   * mac 섹션에 files: 를 두면 패키지가 오히려 커진다 — 2026-08-24 실측(329MB → 379MB).
   *
   * app-builder-lib/out/fileMatcher.js getFileMatchers(): 플랫폼 섹션의 문자열 패턴은
   * defaultMatcher 로 들어가고, 그 defaultMatcher 가 fileMatchers 맨 앞으로 unshift 되어
   * 주 필터(matchers[0])가 된다. 그러면 루트 files 의 `{from:'.', filter:[…]}` 목록
   * (포함 대상 한정 + 미사용 패키지 제외)이 주 필터 자리에서 밀려나 의도치 않은 파일이 함께 실린다.
   */
  it('mac 섹션에 files: 를 두지 않는다 (루트 files 필터가 밀려남)', () => {
    const src = readElectronBuilderYml();
    const macSection = src.slice(src.indexOf('\nmac:'), src.indexOf('\ndmg:'));
    expect(
      /^\s{2}files:\s*$/m.test(macSection),
      'electron-builder.yml 의 mac 섹션에 files: 가 있습니다. 플랫폼별 files 는 루트 files 의 ' +
        '주 필터를 밀어내 설치파일이 오히려 커집니다(실측 329MB → 379MB). ' +
        '플랫폼별로 뺄 것이 있으면 루트 files 에서 처리하거나 빌드 스크립트로 걸러내세요.',
    ).toBe(false);
  });

  it('mac 타깃이 x64·arm64 2종이다 (파일명·다운로드 URL 규칙과 일치)', () => {
    const src = readElectronBuilderYml();
    const macSection = src.slice(src.indexOf('\nmac:'), src.indexOf('\ndmg:'));
    expect(
      /^\s*-\s*x64\s*$/m.test(macSection),
      'mac 타깃에 x64 가 없습니다. Intel Mac 사용자가 받을 DMG 가 사라집니다.',
    ).toBe(true);
    expect(
      /^\s*-\s*arm64\s*$/m.test(macSection),
      'mac 타깃에 arm64 가 없습니다. Apple Silicon 사용자가 받을 DMG 가 사라집니다.',
    ).toBe(true);
    expect(
      /-\s*universal\b/.test(macSection),
      'mac 타깃이 universal 로 바뀌었습니다. 파일명이 ssampin-universal.dmg 로 바뀌므로 ' +
        'landing/src/config.ts 의 다운로드 URL 과 electron/main.ts 의 update:download, ' +
        '릴리즈 업로드 파일명을 함께 고쳐야 합니다(용량 2배 문제도 재검토할 것).',
    ).toBe(false);
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
