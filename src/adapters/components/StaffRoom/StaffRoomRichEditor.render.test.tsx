/**
 * 온라인 교무실 글쓰기 편집기 — 정적 렌더 테스트.
 *
 * 환경: vitest(node) — `renderToString` 으로 출력 문자열을 검사한다
 * (같은 폴더 `StaffRoomBoard.render.test.tsx` 와 같은 방식).
 *
 * ⚠️ **이 테스트가 못 하는 일을 먼저 밝혀 둔다.**
 * 서식이 올바른 글자에 걸리는지, 한글 입력 중에 글자가 사라지지 않는지는
 * **여기서 확인할 수 없다.** 그건 진짜 브라우저와 진짜 입력기가 있어야 한다
 * (2026-08-23 에 Chrome + CDP `Input.imeSetComposition` 으로 확인했고,
 *  결과는 PROGRESS.md 에 남겼다).
 *
 * 그래서 여기서는 **브라우저에서 확인한 그 동작이 기대는 구조**만 잠근다.
 * 구조가 무너지면 브라우저에서만 드러나는 결함이 되므로, 값이 크다.
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StaffRoomRichEditor } from './StaffRoomRichEditor';

describe('교무실 글쓰기 편집기 — 툴바', () => {
  const html = renderToString(<StaffRoomRichEditor />);

  it('꾸미기 단추 네 개가 한국어 이름으로 있다', () => {
    for (const label of ['굵게', '기울임', '밑줄', '취소선']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });

  it('안내 문구가 한국어다', () => {
    expect(html).toContain('내용을 입력하세요');
  });

  it('안내 문구를 바꿔 넣을 수 있다', () => {
    const custom = renderToString(<StaffRoomRichEditor placeholder="회의 내용을 적어주세요" />);
    expect(custom).toContain('회의 내용을 적어주세요');
  });
});

describe('교무실 글쓰기 편집기 — 디자인 규칙', () => {
  const html = renderToString(<StaffRoomRichEditor />);

  it('하드코딩 색을 쓰지 않는다 (sp-* 토큰만)', () => {
    // 프로젝트 규칙: 하드코딩 HEX 금지. 화면에 직접 박힌 색이 있으면 잡는다.
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('직각을 쓰지 않는다', () => {
    expect(html).toMatch(/rounded/);
  });

  it('rounded-sp-* 를 쓰지 않는다 (Tailwind 기본 키만)', () => {
    expect(html).not.toMatch(/rounded-sp-/);
  });
});

/**
 * ── 여기부터가 이 파일을 만든 진짜 이유 ────────────────────────────
 *
 * 툴바 단추는 `onMouseDown` 에서 **초점 뺏기만 막고**, 실제 명령은 `onClick`
 * 에서 보낸다. 둘 중 하나만 쓰면 둘 다 틀리는데, **틀린 티가 브라우저에서만
 * 난다.** 그래서 지우거나 "정리"당하기 쉽다.
 *
 * 브라우저에서 실제로 확인한 두 가지 실패(2026-08-23):
 *   - onMouseDown 에서 명령까지 보내면 → "hello" 를 선택했는데 " world" 가 굵어졌다.
 *   - onMouseDown 을 안 막으면 → 굵게를 켜고 쓴 "학년부" 는 안 굵고,
 *     끄고 쓴 "회의는" 이 굵어졌다(첫 누름이 통째로 무시된다).
 */
describe('교무실 글쓰기 편집기 — 툴바가 편집기 초점을 뺏지 않는다', () => {
  it('단추에 onMouseDown 과 onClick 이 모두 걸려 있다', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./StaffRoomRichEditor.tsx', import.meta.url), 'utf-8'),
    );

    // 초점 뺏기 방지 — 이게 빠지면 첫 누름이 무시된다
    expect(source).toMatch(/onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/);
    // 명령은 선택이 자리잡은 뒤에 — 이게 onMouseDown 으로 올라가면 엉뚱한 곳에 걸린다
    expect(source).toMatch(/onClick=\{\(\) => \{\s*editor\.dispatchCommand/);
    // onMouseDown 안에서 명령을 보내지 않는다 (되돌아가기 방지)
    expect(source).not.toMatch(/onMouseDown=\{\([^)]*\) => \{[\s\S]*?dispatchCommand/);
  });
});

/**
 * 링크 입력을 화면 안에서 받는다.
 *
 * ⚠️ **`window.prompt` 를 쓰면 안 된다.** 쌤핀은 Electron 앱인데 Electron 은
 * `prompt` 를 지원하지 않는다 — 브라우저로 개발할 때는 멀쩡히 되다가 실제
 * 앱에서만 아무 일도 일어나지 않는다. 실제로 그렇게 만들었다가 브라우저
 * 확인 중에 잡았고, 되돌아가지 않도록 여기서 못박는다.
 */
describe('교무실 글쓰기 편집기 — 링크', () => {
  const html = renderToString(<StaffRoomRichEditor />);

  it('링크 단추가 한국어 이름으로 있다', () => {
    expect(html).toContain('aria-label="링크"');
  });

  it('window.prompt·window.alert 를 쓰지 않는다 (Electron 에서 안 먹는다)', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./StaffRoomRichEditor.tsx', import.meta.url), 'utf-8'),
    );
    expect(source).not.toMatch(/window\.prompt\s*\(/);
    expect(source).not.toMatch(/window\.alert\s*\(/);
  });

  it('주소 검사를 화면에서 먼저 한다 — 도메인 검사를 다시 만들지 않고 가져다 쓴다', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./StaffRoomRichEditor.tsx', import.meta.url), 'utf-8'),
    );
    expect(source).toContain('isValidStaffRoomLinkHref');
  });
});
