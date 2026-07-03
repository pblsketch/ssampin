import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * 메타테스트 — MiniAppRunner의 격리 관련 webview 속성을 정적 소스로 고정한다.
 *
 * 렌더 대신 소스를 검사하는 이유: 격리 불변식(preload/allowpopups 미부착, 미니앱 partition)이
 * 회귀로 조용히 깨지는 것을 막는 게 목적이고, 이는 런타임 컨텍스트(사운드 스토어 등) 없이
 * 소스 수준에서 결정적으로 검증된다. 주석에 등장하는 용어 오탐을 피하려고 실제
 * `<webview>` JSX 태그 substring만 뽑아서 판정한다(태그 내부엔 주석이 없다).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, 'MiniAppRunner.tsx'), 'utf8');

/**
 * 소스에서 실제 JSX `<webview ...props... />` substring 추출.
 * `\s+`(태그명 뒤 공백+속성)를 요구해 주석 속 `<webview>` 언급은 건너뛴다.
 */
const webviewTag = source.match(/<webview\s+[\s\S]*?\/>/)?.[0] ?? '';

describe('MiniAppRunner 격리 불변식(정적)', () => {
  it('<webview> 태그를 찾을 수 있다', () => {
    expect(webviewTag).not.toBe('');
  });

  it('webview가 미니앱 전용 partition을 사용한다', () => {
    expect(webviewTag).toMatch(/partition="persist:miniapps"/);
  });

  it('webview 태그에 allowpopups 속성이 없다(팝업 미허용)', () => {
    expect(webviewTag).not.toMatch(/allowpopups/);
  });

  it('webview 태그에 preload 속성이 없다(쌤핀 IPC 미노출)', () => {
    expect(webviewTag).not.toMatch(/preload/);
  });

  it('src가 miniapp:// 커스텀 프로토콜을 가리킨다', () => {
    expect(source).toContain('`miniapp://${app.id}/index.html`');
  });
});
