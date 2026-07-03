/**
 * 메타테스트: 미니앱 프로토콜의 격리 불변식.
 *
 * 두 순수 함수를 고정한다.
 *  1) buildMiniAppCsp() — enforce CSP 정책이 계획서(§3)에 명시된 그대로인지.
 *  2) resolveMiniAppFilePath() — 앱 폴더 밖으로의 경로 조작(../·절대경로·드라이브문자·앱id 이탈)을
 *     모두 거부하는지(path traversal 방어).
 *
 * miniapp-protocol.ts 는 electron 의 protocol/session 을 값으로 import 하지만, 여기서는 순수
 * 함수만 검증하므로 electron 모듈을 가볍게 모킹해 import 가 실패하지 않게 한다(핸들러는 호출하지 않음).
 *
 * 설계 문서: docs/01-plan/features/miniapp-my-apps.plan.md §3, §7
 */
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';

vi.mock('electron', () => ({ protocol: {}, session: {} }));

import { buildMiniAppCsp, resolveMiniAppFilePath } from './miniapp-protocol';

describe('buildMiniAppCsp', () => {
  const csp = buildMiniAppCsp();

  it("default-src 'none' 를 포함(기본 전면 차단)", () => {
    expect(csp).toContain("default-src 'none'");
  });

  it('connect-src https: 를 포함(평문 http·자기 origin 은 열지 않음)', () => {
    expect(csp).toContain('connect-src https:');
  });

  it("object-src 'none' 를 포함(플러그인 차단)", () => {
    expect(csp).toContain("object-src 'none'");
  });

  it('계획서에 명시된 정확한 정책 문자열과 일치', () => {
    expect(csp).toBe(
      "default-src 'none'; " +
        "script-src 'unsafe-inline' https: miniapp:; " +
        "style-src 'unsafe-inline' https: miniapp:; " +
        'img-src https: data: blob: miniapp:; ' +
        'font-src https: data: miniapp:; ' +
        'media-src https: data: blob: miniapp:; ' +
        'connect-src https:; ' +
        'worker-src blob:; ' +
        "frame-ancestors 'none'; " +
        "base-uri 'none'; " +
        "form-action 'none'; " +
        "object-src 'none'",
    );
  });
});

describe('resolveMiniAppFilePath', () => {
  // 파일을 만들지 않는 순수 함수라 실재하지 않는 절대 경로 루트를 써도 무방.
  const root = path.resolve('.miniapps-fixture-root');

  it('정상 경로는 ok + 앱 폴더 하위 파일로 해석', () => {
    const r = resolveMiniAppFilePath(root, 'app1', '/index.html');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.filePath).toBe(path.join(root, 'app1', 'index.html'));
    }
  });

  it('빈 경로는 index.html 로 기본 해석', () => {
    const r = resolveMiniAppFilePath(root, 'app1', '');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.filePath).toBe(path.join(root, 'app1', 'index.html'));
    }
  });

  it('하위 폴더 리소스도 ok', () => {
    const r = resolveMiniAppFilePath(root, 'app1', '/assets/app.js');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.filePath).toBe(path.join(root, 'app1', 'assets', 'app.js'));
    }
  });

  it('../ 상위 폴더 탈출은 차단(ok:false)', () => {
    expect(resolveMiniAppFilePath(root, 'app1', '/../../../../../../etc/passwd').ok).toBe(false);
  });

  it('% 인코딩된 ../ 탈출도 차단(ok:false)', () => {
    expect(resolveMiniAppFilePath(root, 'app1', '/..%2f..%2f..%2fsecret.txt').ok).toBe(false);
  });

  it('드라이브문자/절대경로 탈출 차단(ok:false)', () => {
    expect(resolveMiniAppFilePath(root, 'app1', 'C:\\Windows\\System32\\cmd.exe').ok).toBe(false);
  });

  it('appId 자체가 상위 이탈·경로 구분자면 차단(ok:false)', () => {
    expect(resolveMiniAppFilePath(root, '..', '/index.html').ok).toBe(false);
    expect(resolveMiniAppFilePath(root, 'a/b', '/index.html').ok).toBe(false);
    expect(resolveMiniAppFilePath(root, 'a\\b', '/index.html').ok).toBe(false);
    expect(resolveMiniAppFilePath(root, '', '/index.html').ok).toBe(false);
  });
});
