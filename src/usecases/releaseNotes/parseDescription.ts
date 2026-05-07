/**
 * release-notes.json description 4슬롯 파서.
 *
 * Layer 1 가이드(`docs/release-notes-assets/RELEASE-NOTES-WRITING-STYLE.md`)의
 * 4슬롯 구조 description 텍스트를 React 트리 또는 Threads/카드 변환에 쓸 수 있는
 * 노드 배열로 변환한다.
 *
 * 슬롯 구조:
 *   {리드 한~두 문장}
 *
 *   · {불릿 1}
 *   · {불릿 2}
 *
 *   {How: [설정 > 경로]}
 *
 *   {공감 마무리}
 *
 * 폴백:
 *   - description에 빈 줄(\n\n)이 없으면 단일 paragraph로 렌더 (v2.0.3 이전 호환)
 *   - 슬롯 내 모든 줄이 불릿 마커일 때만 bulletList, 혼합 시 paragraph
 *
 * Layer 2(UI 렌더)와 Layer 3(자동 변환기)가 동일한 모듈을 공유한다.
 */

// ── 인라인 노드 ─────────────────────────────────────────────────────────────

export interface InlineText {
  kind: 'text';
  value: string;
}

export interface InlineBold {
  kind: 'bold';
  value: string;
}

export type InlineNode = InlineText | InlineBold;

// ── 슬롯 노드 ───────────────────────────────────────────────────────────────

export interface BulletItem {
  level: 1 | 2; // 1 = · , 2 = ◦ (종속 들여쓰기)
  nodes: InlineNode[];
}

export interface ParagraphNode {
  type: 'paragraph';
  content: InlineNode[];
}

export interface BulletListNode {
  type: 'bulletList';
  items: BulletItem[];
}

export type DescriptionNode = ParagraphNode | BulletListNode;

// ── 정규식 ──────────────────────────────────────────────────────────────────

const BULLET_L1_RE = /^· /; // U+00B7 + 공백
const BULLET_L2_RE = /^ {2}◦ /; // 들여쓰기 2칸 + U+25E6 + 공백

// ── 파서 ────────────────────────────────────────────────────────────────────

/**
 * "텍스트 **bold** 텍스트" 형식을 InlineNode[] 배열로 변환.
 *
 * - 중첩 bold 비지원 (단일 패스 정규식)
 * - bold 매치가 없으면 단일 text 노드 반환
 * - 빈 문자열이면 빈 text 1개 반환 (호출 측에서 noop 처리)
 */
export function parseInlineMarks(text: string): InlineNode[] {
  const result: InlineNode[] = [];
  const boldRe = /\*\*(.+?)\*\*/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = boldRe.exec(text)) !== null) {
    if (match.index > lastIdx) {
      result.push({ kind: 'text', value: text.slice(lastIdx, match.index) });
    }
    result.push({ kind: 'bold', value: match[1] ?? '' });
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    result.push({ kind: 'text', value: text.slice(lastIdx) });
  }

  if (result.length === 0) {
    result.push({ kind: 'text', value: text });
  }

  return result;
}

/**
 * 4슬롯 description 문자열 → DescriptionNode[] 변환.
 */
export function parseDescription(description: string | null | undefined): DescriptionNode[] {
  if (!description || description.trim() === '') return [];

  // 구버전 단일 문단 폴백
  if (!description.includes('\n\n')) {
    return [{ type: 'paragraph', content: parseInlineMarks(description.trim()) }];
  }

  const slots = description
    .split('\n\n')
    .map((s) => s.trim())
    .filter(Boolean);

  return slots.map((slot): DescriptionNode => {
    const lines = slot.split('\n');
    const allBullets = lines.every(
      (l) => BULLET_L1_RE.test(l) || BULLET_L2_RE.test(l),
    );

    if (allBullets) {
      return {
        type: 'bulletList',
        items: lines.map((l): BulletItem => {
          if (BULLET_L2_RE.test(l)) {
            return {
              level: 2,
              nodes: parseInlineMarks(l.replace(BULLET_L2_RE, '')),
            };
          }
          return {
            level: 1,
            nodes: parseInlineMarks(l.replace(BULLET_L1_RE, '')),
          };
        }),
      };
    }

    return { type: 'paragraph', content: parseInlineMarks(lines.join(' ')) };
  });
}
