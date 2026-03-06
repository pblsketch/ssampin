export interface FormattedSegment {
  readonly text: string;
  readonly bold: boolean;
  readonly underline: boolean;
  readonly strikethrough: boolean;
}

type MarkerKind = 'bold' | 'underline' | 'strikethrough';

interface Token {
  type: 'text' | 'marker';
  value: string;
  kind?: MarkerKind;
}

const MARKER_MAP: Record<string, MarkerKind> = {
  '**': 'bold',
  '__': 'underline',
  '~~': 'strikethrough',
};

function tokenize(content: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < content.length) {
    // Escape: \** \__ \~~
    if (content[i] === '\\' && i + 2 < content.length) {
      const next2 = content.substring(i + 1, i + 3);
      if (next2 === '**' || next2 === '__' || next2 === '~~') {
        tokens.push({ type: 'text', value: next2 });
        i += 3;
        continue;
      }
    }

    // Check for 2-char markers
    if (i + 1 < content.length) {
      const pair = content.substring(i, i + 2);
      const kind = MARKER_MAP[pair];
      if (kind !== undefined) {
        tokens.push({ type: 'marker', value: pair, kind });
        i += 2;
        continue;
      }
    }

    // Regular character — accumulate text
    const start = i;
    while (i < content.length) {
      if (content[i] === '\\' && i + 2 < content.length) {
        const next2 = content.substring(i + 1, i + 3);
        if (next2 === '**' || next2 === '__' || next2 === '~~') break;
      }
      if (i + 1 < content.length) {
        const pair = content.substring(i, i + 2);
        if (MARKER_MAP[pair] !== undefined) break;
      }
      i++;
    }
    tokens.push({ type: 'text', value: content.substring(start, i) });
  }

  return tokens;
}

const EMPTY_SEGMENT: FormattedSegment = {
  text: '',
  bold: false,
  underline: false,
  strikethrough: false,
};

/**
 * 인라인 마크다운을 파싱하여 서식 세그먼트 배열을 반환한다.
 * 지원 문법:
 * - **text** → bold
 * - __text__ → underline (쌤핀 전용)
 * - ~~text~~ → strikethrough
 * - 중첩 가능: **~~bold strikethrough~~**
 * - 이스케이프: \** → 리터럴 **
 * - 불완전한 마크다운: **미닫힘 → 리터럴 텍스트
 */
export function parseInlineMarkdown(content: string): FormattedSegment[] {
  if (content === '') {
    return [EMPTY_SEGMENT];
  }

  const tokens = tokenize(content);

  // Find matching marker pairs
  const matched = new Set<number>();
  const pairMap = new Map<number, number>(); // open index -> close index

  for (let i = 0; i < tokens.length; i++) {
    const tokenI = tokens[i]!;
    if (tokenI.type !== 'marker' || matched.has(i)) continue;

    const kind = tokenI.kind;
    // Find matching close marker
    for (let j = i + 1; j < tokens.length; j++) {
      const tokenJ = tokens[j]!;
      if (tokenJ.type === 'marker' && tokenJ.kind === kind && !matched.has(j)) {
        // Check if there's any content between them
        let hasContent = false;
        for (let k = i + 1; k < j; k++) {
          const tokenK = tokens[k]!;
          if (tokenK.type === 'text' && tokenK.value.length > 0) {
            hasContent = true;
            break;
          }
          if (tokenK.type === 'marker') {
            hasContent = true;
            break;
          }
        }
        if (hasContent) {
          matched.add(i);
          matched.add(j);
          pairMap.set(i, j);
          break;
        }
      }
    }
  }

  // Build segments by walking tokens with a stack of active styles
  const segments: FormattedSegment[] = [];
  const activeStyles: Set<MarkerKind> = new Set();

  function pushText(text: string): void {
    if (text.length === 0) return;
    segments.push({
      text,
      bold: activeStyles.has('bold'),
      underline: activeStyles.has('underline'),
      strikethrough: activeStyles.has('strikethrough'),
    });
  }

  // Track which markers we've opened (to know when to close)
  const openMarkers: number[] = []; // stack of token indices that opened markers

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;

    if (token.type === 'text') {
      pushText(token.value);
    } else if (token.type === 'marker') {
      if (pairMap.has(i)) {
        // Opening marker
        activeStyles.add(token.kind!);
        openMarkers.push(i);
      } else if (matched.has(i)) {
        // Closing marker — find which open it matches
        const kind = token.kind!;
        for (let k = openMarkers.length - 1; k >= 0; k--) {
          const openIdx = openMarkers[k]!;
          if (tokens[openIdx]!.kind === kind) {
            openMarkers.splice(k, 1);
            activeStyles.delete(kind);
            break;
          }
        }
      } else {
        // Unmatched marker — treat as literal text
        pushText(token.value);
      }
    }
  }

  if (segments.length === 0) {
    return [EMPTY_SEGMENT];
  }

  return segments;
}

/* ──────────────────────────────────────────────
 * HTML ↔ Markdown 변환 (contentEditable WYSIWYG 용)
 * ──────────────────────────────────────────────*/

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 마크다운 → HTML (contentEditable 초기화용) */
export function markdownToHtml(content: string): string {
  if (!content) return '';
  const segments = parseInlineMarkdown(content);
  const parts: string[] = [];
  for (const seg of segments) {
    let text = escapeHtml(seg.text).replace(/\n/g, '<br>');
    if (seg.bold) text = `<b>${text}</b>`;
    if (seg.underline) text = `<u>${text}</u>`;
    if (seg.strikethrough) text = `<s>${text}</s>`;
    parts.push(text);
  }
  return parts.join('');
}

/** HTML DOM → 마크다운 (contentEditable 저장용) */
export function htmlToMarkdown(element: HTMLElement): string {
  let result = '';
  for (let i = 0; i < element.childNodes.length; i++) {
    const node = element.childNodes[i]!;
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (tag === 'br') {
        result += '\n';
      } else {
        let inner = htmlToMarkdown(el);

        if (tag === 'div' || tag === 'p') {
          if (result.length > 0 && !result.endsWith('\n')) {
            result += '\n';
          }
          result += inner;
        } else if (tag === 'b' || tag === 'strong') {
          result += `**${inner}**`;
        } else if (tag === 'u') {
          result += `__${inner}__`;
        } else if (tag === 's' || tag === 'del' || tag === 'strike') {
          result += `~~${inner}~~`;
        } else if (tag === 'span') {
          // 일부 브라우저가 인라인 스타일로 서식 적용
          const style = el.style;
          if (style.fontWeight === 'bold' || style.fontWeight === '700') {
            inner = `**${inner}**`;
          }
          if (style.textDecoration.includes('underline')) {
            inner = `__${inner}__`;
          }
          if (style.textDecoration.includes('line-through')) {
            inner = `~~${inner}~~`;
          }
          result += inner;
        } else {
          result += inner;
        }
      }
    }
  }
  return result;
}
