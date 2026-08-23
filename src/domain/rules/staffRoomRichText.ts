/**
 * 온라인 교무실 — 서식 있는 본문 읽기 (ADR-069)
 *
 * **이 파일이 보안 경계다.**
 *
 * 교무실은 남이 쓴 글이 내 화면 안에서 펼쳐지는 쌤핀 최초의 기능이다. 저장된
 * 본문은 편집기가 만든 구조(JSON)인데, 그걸 **그대로 믿고 그리면 안 된다.**
 * 서버를 거쳐 온 값이라도 중간에 무엇이 섞였는지 화면은 알 수 없다.
 *
 * 그래서 여기서 하는 일은 하나다 — **아는 것만 통과시키고 나머지는 버린다.**
 *  - 아는 조각 종류(문단·글자)만 남기고 모르는 종류는 버린다.
 *  - 꾸밈은 **정해진 목록과 글자 그대로 같을 때만** 인정한다.
 *    `color: var(--sp-error)` 는 통과하고, `color: red; background: url(...)`
 *    같은 건 목록에 없으므로 통째로 떨어진다.
 *  - 결과는 **HTML 문자열이 아니라 자료 구조**다. 화면은 이걸 React 조각으로
 *    그리므로 글자가 태그로 해석될 여지가 없다(회귀 #7 과 같은 원칙).
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다. 편집기(Lexical)를
 * 나중에 갈아끼워도 이 파일의 판단 기준은 그대로 쓸 수 있다.
 */

/**
 * Lexical 이 글자 꾸밈을 담는 방식 — 하나의 숫자에 비트로 얹는다.
 * (node_modules/lexical 에서 실제 값을 확인해 옮겨 적었다. 추측이 아니다.)
 */
const FORMAT_BOLD = 1;
const FORMAT_ITALIC = 2;
const FORMAT_STRIKETHROUGH = 4;
const FORMAT_UNDERLINE = 8;

/**
 * 쓸 수 있는 글자색.
 *
 * 자유 입력이 아니라 **고른 목록**인 이유가 둘이다.
 *  1) 하드코딩 색 금지 규칙 — 전부 `sp-*` 토큰을 가리키므로 라이트·다크에서
 *     각각 알맞은 색이 나온다. 직접 색을 적게 하면 다크 모드에서 안 보이는
 *     글이 생긴다.
 *  2) 안전 — 통과 기준이 "이 목록과 글자 그대로 같은가"가 되어, 이상한 값이
 *     비집고 들어올 틈이 없다.
 */
export const STAFFROOM_TEXT_COLORS = {
  default: '',
  accent: 'color: var(--sp-accent)',
  error: 'color: var(--sp-error)',
  warning: 'color: var(--sp-warning)',
  success: 'color: var(--sp-success)',
  info: 'color: var(--sp-info)',
  muted: 'color: var(--sp-muted)',
} as const;

export type StaffRoomTextColor = keyof typeof STAFFROOM_TEXT_COLORS;

/** 화면에 보일 색 이름 — UI 텍스트는 전부 한국어 */
export const STAFFROOM_TEXT_COLOR_LABELS: Record<StaffRoomTextColor, string> = {
  default: '기본',
  accent: '강조',
  error: '빨강',
  warning: '주황',
  success: '초록',
  info: '보라',
  muted: '회색',
};

/**
 * 쓸 수 있는 글자 크기.
 *
 * `rem` 을 쓰는 이유: 사용자가 앱 글자 크기를 키우면 함께 커진다. `px` 로 박으면
 * 시력이 나쁜 선생님이 앱 글자를 키워도 이 글만 작게 남는다.
 */
export const STAFFROOM_TEXT_SIZES = {
  small: 'font-size: 0.875rem',
  normal: '',
  large: 'font-size: 1.125rem',
  xlarge: 'font-size: 1.375rem',
} as const;

export type StaffRoomTextSize = keyof typeof STAFFROOM_TEXT_SIZES;

/** 화면에 보일 크기 이름 */
export const STAFFROOM_TEXT_SIZE_LABELS: Record<StaffRoomTextSize, string> = {
  small: '작게',
  normal: '보통',
  large: '크게',
  xlarge: '아주 크게',
};

/**
 * 목록의 값에서 **값 부분만** 떼어 준다. (`'color: var(--sp-error)'` → `'var(--sp-error)'`)
 *
 * 편집기는 "속성 이름"과 "값"을 따로 받으므로 이 모양이 필요하다. 떼는 일을
 * 허용 목록 바로 옆에 두는 이유는, 목록과 떼는 규칙이 떨어져 있으면 목록을
 * 고칠 때 한쪽만 고쳐 색이 조용히 안 먹는 사고가 나기 때문이다.
 *
 * 빈 문자열은 "꾸밈 없음"이고, 편집기에서는 걸려 있던 꾸밈을 지우라는 뜻이 된다.
 */
function valuePartOf(declaration: string): string {
  if (declaration === '') return '';
  const colonAt = declaration.indexOf(':');
  return colonAt < 0 ? '' : declaration.slice(colonAt + 1).trim();
}

/** 색 이름 → 편집기에 넘길 값. 기본색이면 빈 문자열(= 걸린 색을 지운다) */
export function staffRoomTextColorValue(name: StaffRoomTextColor): string {
  return valuePartOf(STAFFROOM_TEXT_COLORS[name]);
}

/** 크기 이름 → 편집기에 넘길 값. 보통이면 빈 문자열(= 걸린 크기를 지운다) */
export function staffRoomTextSizeValue(name: StaffRoomTextSize): string {
  return valuePartOf(STAFFROOM_TEXT_SIZES[name]);
}

/** 걸러낸 뒤의 글자 한 토막 */
export interface StaffRoomTextSpan {
  readonly text: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strikethrough: boolean;
  readonly color: StaffRoomTextColor;
  readonly size: StaffRoomTextSize;
}

/** 걸러낸 뒤의 문단 하나 */
export interface StaffRoomTextBlock {
  readonly spans: readonly StaffRoomTextSpan[];
}

/**
 * 꾸밈 문자열을 뜯어 **아는 것만** 남긴다.
 *
 * `"color: var(--sp-error); font-size: 1.125rem"` 처럼 둘이 함께 올 수 있으므로
 * 하나씩 떼어 각각 목록과 대조한다. 목록에 없는 항목은 조용히 버린다 —
 * 글을 통째로 거부하면 선생님은 "글이 안 보인다"만 겪게 되므로,
 * **덜 꾸며진 채로라도 글자는 보여주는 편**을 택했다.
 */
function readStyle(raw: unknown): { color: StaffRoomTextColor; size: StaffRoomTextSize } {
  let color: StaffRoomTextColor = 'default';
  let size: StaffRoomTextSize = 'normal';
  if (typeof raw !== 'string' || raw.trim() === '') return { color, size };

  for (const part of raw.split(';')) {
    const decl = part.trim();
    if (decl === '') continue;

    // 띄어쓰기만 다른 걸 "모르는 값"으로 버리면, 편집기가 저장하는 모양이 조금만
    // 달라져도 색이 조용히 사라진다. 그래서 **모양은 다듬어 맞추되 값은 그대로**
    // 비교한다. `color:var(--sp-error)` 와 `color:  var(--sp-error)` 는 같은 것으로
    // 보고, `color: red` 는 여전히 다른 것으로 본다.
    const colonAt = decl.indexOf(':');
    if (colonAt < 0) continue;
    const property = decl.slice(0, colonAt).trim().toLowerCase();
    const value = decl.slice(colonAt + 1).trim();
    const normalized = `${property}: ${value}`;

    for (const [name, allowed] of Object.entries(STAFFROOM_TEXT_COLORS)) {
      if (allowed !== '' && normalized === allowed) color = name as StaffRoomTextColor;
    }
    for (const [name, allowed] of Object.entries(STAFFROOM_TEXT_SIZES)) {
      if (allowed !== '' && normalized === allowed) size = name as StaffRoomTextSize;
    }
  }
  return { color, size };
}

/** 아는 모양의 객체인지 — JSON 은 무엇이든 될 수 있으므로 매번 확인한다 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 조각 하나에서 글자 토막들을 모은다.
 *
 * 편집기가 문단 안에 또 다른 묶음을 넣는 경우(목록 등)가 있어 **안쪽까지 훑되**,
 * 종류를 가리지 않고 `text` 만 건져 온다. 모르는 종류는 그리지 않고 글자만 살린다
 * — 새 종류가 생겨도 글이 사라지지 않는다.
 */
function collectSpans(node: unknown, out: StaffRoomTextSpan[]): void {
  if (!isRecord(node)) return;

  if (node['type'] === 'text' && typeof node['text'] === 'string') {
    const format = typeof node['format'] === 'number' ? node['format'] : 0;
    const { color, size } = readStyle(node['style']);
    out.push({
      text: node['text'],
      bold: (format & FORMAT_BOLD) !== 0,
      italic: (format & FORMAT_ITALIC) !== 0,
      underline: (format & FORMAT_UNDERLINE) !== 0,
      strikethrough: (format & FORMAT_STRIKETHROUGH) !== 0,
      color,
      size,
    });
    return;
  }

  // 줄바꿈 조각 — 문단 안에서 Shift+Enter 로 넣은 줄
  if (node['type'] === 'linebreak') {
    out.push({
      text: '\n',
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      color: 'default',
      size: 'normal',
    });
    return;
  }

  const children = node['children'];
  if (Array.isArray(children)) {
    for (const child of children) collectSpans(child, out);
  }
}

/**
 * 저장된 본문을 화면이 그릴 수 있는 형태로 바꾼다.
 *
 * 못 읽는 값이 와도 **던지지 않는다.** 글 하나가 깨졌다고 화면 전체가 하얗게
 * 되면 안 되고, 선생님은 원인을 알 수 없다. 빈 목록을 돌려주고 부르는 쪽이
 * "내용을 불러올 수 없다"를 한국어로 알리게 한다.
 */
export function parseStaffRoomRichText(body: string): StaffRoomTextBlock[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }

  if (!isRecord(parsed)) return [];
  const root = parsed['root'];
  if (!isRecord(root)) return [];
  const children = root['children'];
  if (!Array.isArray(children)) return [];

  const blocks: StaffRoomTextBlock[] = [];
  for (const child of children) {
    const spans: StaffRoomTextSpan[] = [];
    collectSpans(child, spans);
    blocks.push({ spans });
  }
  return blocks;
}

/**
 * 꾸밈을 뺀 순수 글자.
 *
 * 목록 미리보기·글자 수 세기·검색에 쓴다. 서식 있는 글에서 이걸 못 뽑으면
 * 검색이 JSON 안의 `"type"` 같은 낱말을 찾아내는 우스운 일이 생긴다.
 */
export function staffRoomRichTextToPlain(body: string): string {
  return parseStaffRoomRichText(body)
    .map((block) => block.spans.map((s) => s.text).join(''))
    .join('\n')
    .trim();
}
