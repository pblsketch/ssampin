/**
 * 미니앱("내가 만든 앱") 파일 저장 IPC — 앱 HTML·아이콘의 로컬 파일 영속을 메인이 담당.
 *
 * 채널:
 *  - `miniapp:save`     : 앱 HTML 저장 → `<userData>/miniapps/<id>/index.html`
 *  - `miniapp:saveIcon` : 이미지 아이콘 저장 → `<userData>/miniapps/<id>/icon.<ext>` (파일명 반환)
 *  - `miniapp:remove`   : 앱 폴더 전체 재귀 삭제
 *  - `miniapp:list`     : 디스크에 존재하는 앱 폴더 id 목록
 *
 * 보안:
 *  - 모든 id는 {@link assertSafeAppId}로 검증(영숫자·`-`·`_`, 64자 이하) → 경로 조작(`../`·
 *    절대경로·드라이브문자) 원천 차단. 아이콘 확장자는 화이트리스트로 제한한다.
 *  - **미니앱 webview는 preload가 없어 이 채널에 도달할 수 없다**(설계상 격리). 이 채널은
 *    오직 쌤핀 renderer(신뢰된 UI)가 `window.electronAPI.miniApp`으로만 호출한다.
 *
 * 설계 문서: docs/01-plan/features/miniapp-my-apps.plan.md §2 infrastructure
 */

import { ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { getContentRoot } from '../dataRoot';

/** 미니앱 id 형식 — 영숫자·하이픈·언더스코어 1~64자. `miniapp-protocol.ts`의 SAFE_APP_ID와 동일 규칙. */
const SAFE_APP_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** 아이콘 확장자 화이트리스트(래스터·SVG). 실행 가능한 확장자는 불허. */
const ICON_EXT_WHITELIST = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']);

/** 미니앱 id 안전성 검증 — 위반 시 throw(핸들러가 reject로 renderer에 전달). */
function assertSafeAppId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !SAFE_APP_ID.test(id)) {
    throw new Error('잘못된 미니앱 id입니다.');
  }
}

/** `<userData>/miniapps` 루트 경로. */
function miniappsRoot(): string {
  return path.join(getContentRoot(), 'miniapps');
}

/** 입력 바이트(Uint8Array | ArrayBuffer)를 Buffer로 정규화. */
function toBuffer(input: Uint8Array | ArrayBuffer): Buffer {
  if (input instanceof Uint8Array) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }
  return Buffer.from(new Uint8Array(input));
}

export function registerMiniAppHandlers(): void {
  // 앱 HTML 저장 → <userData>/miniapps/<id>/index.html (폴더 없으면 생성)
  ipcMain.handle(
    'miniapp:save',
    async (_event, id: string, html: Uint8Array | ArrayBuffer): Promise<void> => {
      assertSafeAppId(id);
      const dir = path.join(miniappsRoot(), id);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, 'index.html'), toBuffer(html));
    },
  );

  // 이미지 아이콘 저장 → <userData>/miniapps/<id>/icon.<ext>, 저장 파일명 반환
  ipcMain.handle(
    'miniapp:saveIcon',
    async (_event, id: string, bytes: Uint8Array | ArrayBuffer, ext: string): Promise<string> => {
      assertSafeAppId(id);
      const normalizedExt = typeof ext === 'string' ? ext.toLowerCase().replace(/^\./, '') : '';
      if (!ICON_EXT_WHITELIST.has(normalizedExt)) {
        throw new Error('허용되지 않은 아이콘 형식입니다.');
      }
      const dir = path.join(miniappsRoot(), id);
      await fs.promises.mkdir(dir, { recursive: true });
      const fileName = `icon.${normalizedExt}`;
      await fs.promises.writeFile(path.join(dir, fileName), toBuffer(bytes));
      return fileName;
    },
  );

  // 앱 폴더 전체 재귀 삭제 → <userData>/miniapps/<id> (없어도 무해)
  ipcMain.handle('miniapp:remove', async (_event, id: string): Promise<void> => {
    assertSafeAppId(id);
    const dir = path.join(miniappsRoot(), id);
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  // 디스크에 존재하는 앱 폴더 id 목록(메타-파일 정합 확인용)
  ipcMain.handle('miniapp:list', async (): Promise<string[]> => {
    const root = miniappsRoot();
    try {
      const entries = await fs.promises.readdir(root, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory() && SAFE_APP_ID.test(e.name)).map((e) => e.name);
    } catch {
      // 루트 미존재(앱 0개) 등 → 빈 목록.
      return [];
    }
  });
}
