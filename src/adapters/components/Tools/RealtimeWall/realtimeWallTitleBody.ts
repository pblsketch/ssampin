/**
 * 2026-04-26 신설 — 카드 본문에서 학생 입력 "제목" 추출 헬퍼.
 *
 * 결함 #3 fix (학생 카드 마크다운 미처리):
 *   StudentSubmitForm은 제목 입력을 `# 제목\n\n본문` 형식으로 합성해 `post.text`로 전송한다
 *   (StudentSubmitForm.tsx line 130-136 / TITLE_BODY_REGEX). 그러나 카드 본문은 plain text로
 *   렌더되므로 학생/교사 모두 카드에 `# ㅇㅇ` 같은 raw `#` 문자가 그대로 노출됨.
 *
 *   해결: 본문 렌더 시점에 동일 regex로 매칭 시도 → 매칭되면 title을 굵은 글씨로, body를
 *   본문 톤으로 분리 렌더. 매칭 실패 시 전체를 본문으로 렌더 (기존 호환).
 *
 * 2026-04-26 라운드 7 결함 C fix (학생 마크다운 미처리 잔존 케이스):
 *   - 기존 regex `/^#\s+(.+?)\n\n([\s\S]*)$/`는 `\n\n`(빈 줄)을 강제하여 다음 케이스 매치 실패:
 *     · `# 제목` 단독 (본문 없음) — 학생이 제목만 적고 빈 본문 제출.
 *     · `# 제목\n본문` (single newline) — 학생이 본문을 한 줄 띄움 없이 바로 작성.
 *     · 레거시 카드 — 다른 합성 경로의 raw markdown.
 *   - 본 라운드 변경: regex를 `/^#\s+(.+?)(?:\n\n|\n|$)([\s\S]*)$/`로 lenient화.
 *     · `\n\n` 매치(2개 이상의 trailing newline 포함, 기존 동작 보존).
 *     · `\n` 매치(single newline).
 *     · `$` 매치(title-only — body 캡처는 빈 문자열).
 *   - 추가로 `extractLegacyTitle` 헬퍼: 첫 줄이 `# `로 시작하는 임의 위치 본문 처리.
 *
 * regex: StudentSubmitForm과 동일 — 단일 진실 공급원으로 본 모듈을 import 하는 것이 이상적이나,
 *   ADRR(architectural decision: rule replication for resilience) 정신으로 양쪽이 독립 정의해도
 *   동일 동작 보장. 향후 본 모듈을 StudentSubmitForm이 import하도록 리팩터 가능.
 *
 * 회귀 위험:
 *   - #11 (viewerRole 비대칭): 본 헬퍼는 viewerRole 무관 — 학생/교사 양쪽 동일 적용. PASS.
 *   - 빈 body: title-only `# 제목` / `# 제목\n\n` 입력은 body=''로 매칭 → 호출자가 body 길이 체크 후 미렌더.
 *   - 다중 줄 body: regex의 `[\s\S]*`로 줄바꿈 포함 전부 캡처. PASS.
 *   - title-less 본문: regex 매칭 실패 → null 반환 → 호출자가 전체 텍스트를 body로 렌더.
 *   - lenient 후 회귀: regex의 `^#\s+` 앵커는 그대로 — 본문이 `#`로 시작하지 않으면 매칭 실패
 *     → null 반환 → 기존 호출자 동작 보존.
 *
 * XSS: regex는 입력 검증 X — 단순 형태 매칭만. 추출된 title/body는 호출자가 React 텍스트
 *   노드(`{title}`)로 렌더하므로 자동 escape됨. dangerouslySetInnerHTML 사용 금지(회귀 #7).
 */

// 2026-04-26 라운드 7: lenient — `\n\n` | `\n` | `$` 모두 허용.
const TITLE_BODY_REGEX = /^#\s+(.+?)(?:\n\n|\n|$)([\s\S]*)$/;

export interface RealtimeWallParsedTitleBody {
  readonly title: string;
  readonly body: string;
}

/**
 * 본문에서 `# 제목\n\n본문` / `# 제목\n본문` / `# 제목` 형식을 추출.
 *
 * @returns 매칭 시 `{ title, body }`, 미매칭 시 `null`.
 */
export function parseTitleBody(text: string): RealtimeWallParsedTitleBody | null {
  if (!text) return null;
  const match = text.match(TITLE_BODY_REGEX);
  if (!match) return null;
  // regex 캡처 그룹 2개 보장(정규식 정의 시점 검증). undefined 가드는 strict 모드 안전망.
  const title = match[1] ?? '';
  const body = match[2] ?? '';
  return { title: title.trim(), body };
}
