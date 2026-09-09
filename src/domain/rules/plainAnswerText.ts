/**
 * 쌤핀 AI 패널의 답은 **평문**이다 — 지시하는 쪽과 그리는 쪽, 양쪽을 여기 둔다.
 *
 * ★왜 두 개가 한 파일에 있나(반쪽만 고치면 반쪽만 낫는다):
 *
 *   ① `PLAIN_ANSWER_INSTRUCTION` — 내 AI(구독 CLI) 경로는 선생님 질문 **원문만** 보낸다.
 *      형식을 안 알려 주면 claude·codex 는 기본값대로 제목(`##`)·표(`|`)·굵게(`**`)를 쓴다.
 *      개발자 도구라서 그게 기본이지, 고장이 아니다.
 *   ② `toPlainAnswerText` — 그래도 마크다운이 오면 화면이 받아 낸다. 지시는 부탁이지 보장이
 *      아니고, 쌤핀 AI(Solar) 경로의 서버 프롬프트는 저장소 밖(시크릿)이라 여기서 못 바꾼다.
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지, 순수 함수만 둔다.
 */

/**
 * 내 AI 경로에 덧붙이는 출력 형식 지시.
 *
 * ★짧게 쓴다 — 길면 정작 답의 내용을 밀어낸다. 금지 기호를 **글자로** 보여 주는 게
 *   "마크다운 쓰지 마세요"보다 잘 먹힌다(모델이 무엇을 말하는지 헷갈리지 않는다).
 *
 * ★**코드 울타리(백틱 3개)만은 글자로 쓰지 않는다.** codex 에는 claude 의
 *   `--append-system-prompt` 가 없어 이 글이 **질문과 한 덩어리로** 나간다
 *   (`buildCodexStdinText`). 울타리를 열어 두면 그 뒤의 별칭 대응표·구분선·선생님 질문이
 *   통째로 코드 블록 안으로 빨려 들어간다. `#`·`|`·`**` 는 줄 안에서 끝나는 기호라 안전하다.
 *
 * ★불릿도 마크다운 기호(`-`)가 아니라 가운뎃점을 쓴다. "마크다운 쓰지 말라"면서 마크다운으로
 *   적으면 모델이 그 모양을 따라 한다 — 겸사겸사 우리가 원하는 답의 생김새를 보여 주는 셈이다.
 */
export const PLAIN_ANSWER_INSTRUCTION = [
  '답은 선생님이 보는 대화 화면에 글자 그대로 표시됩니다. 아래 형식을 지켜 주세요.',
  '· 마크다운을 쓰지 마세요. 제목(#), 표(|), 굵게(**), 백틱 세 개로 감싸는 코드블록 모두 금지입니다.',
  '· 항목이 여럿이면 한 줄에 하나씩, 줄바꿈으로만 나눕니다.',
  '· 한국 중·고등학교 교사에게 말하듯 한국어 평문으로, 짧게 씁니다.',
].join('\n');

/** 내 AI 경로에 보낼 지시문 한 덩어리 — 형식 지시 뒤에 별칭 대응표를 잇는다. */
export function buildPanelSystemPrompt(correlationHintBlock: string): string {
  const hint = correlationHintBlock.trim();
  return hint.length > 0 ? `${PLAIN_ANSWER_INSTRUCTION}\n\n${hint}` : PLAIN_ANSWER_INSTRUCTION;
}

/** 표 한 줄(`| 9/8 | 20:30 | 수업 |`)인가 — 앞이 `|` 로 시작하고 칸막이가 2개 이상. */
function isTableRow(line: string): boolean {
  return line.startsWith('|') && (line.match(/\|/g)?.length ?? 0) >= 2;
}

/** 표 구분줄(`|---|:--:|`)인가 — 칸막이·붙임표·쌍점·공백 말고는 아무것도 없다. */
function isTableDivider(line: string): boolean {
  return isTableRow(line) && /^[|\-: \t]+$/.test(line);
}

/** 표 한 줄을 `9/8 · 20:30 · 수업` 으로 편다. 빈 칸은 버린다. */
function flattenTableRow(line: string): string {
  return line
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0)
    .join(' · ');
}

/** 줄 안에서만 쓰는 기호를 뗀다(줄바꿈을 넘지 않게 `[^\n]` 로 묶는다). */
function stripInlineMarks(line: string): string {
  return line
    .replace(/!\[([^\]\n]*)\]\([^)\n]*\)/g, '$1') // 그림은 대체 글자만 남긴다
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, '$1 ($2)') // 링크는 주소를 옆에 적는다
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1');
}

/**
 * 마크다운으로 온 답을 화면에 그대로 보여 줄 평문으로 바꾼다.
 *
 * ★건드리지 않는 것 — 별표 하나(`*강조*`)와 번호 목록(`1. 항목`).
 *   전자는 각주·곱셈 같은 다른 뜻일 수 있어 손대면 멀쩡한 글자를 지운다.
 *   후자는 한국어 평문으로 읽어도 자연스러워 바꿀 이유가 없다.
 * ★`［이름1］` 같은 별칭은 전각 괄호라 여기 규칙에 하나도 걸리지 않는다.
 */
export function toPlainAnswerText(text: string): string {
  const out: string[] = [];

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();

    // 코드 울타리와 수평선은 화면에서 뜻이 없다 — 줄째 버린다.
    if (trimmed.startsWith('```')) continue;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) continue;
    if (isTableDivider(trimmed)) continue;

    if (isTableRow(trimmed)) {
      const row = flattenTableRow(trimmed);
      if (row.length > 0) out.push(stripInlineMarks(row));
      continue;
    }

    // 제목(`## 이번 주 일정`) — 우물 정만 뗀다. `#1` 처럼 붙여 쓴 것은 제목이 아니다.
    const heading = /^#{1,6}[ \t]+(.*)$/.exec(trimmed);
    if (heading) {
      out.push(stripInlineMarks((heading[1] ?? '').trim()));
      continue;
    }

    // 인용(`> 글`)
    const quote = /^>[ \t]?(.*)$/.exec(trimmed);
    if (quote) {
      out.push(stripInlineMarks((quote[1] ?? '').trim()));
      continue;
    }

    // 확인칸 목록(`- [x] 제출 완료`) — 한 건 처리했는지가 뜻이라 표시를 살려 둔다.
    const task = /^([ \t]*)[-*+][ \t]+\[([ xX])\][ \t]+(.*)$/.exec(line);
    if (task) {
      const mark = (task[2] ?? '') === ' ' ? '·' : '✓';
      out.push(`${task[1] ?? ''}${mark} ${stripInlineMarks((task[3] ?? '').trim())}`);
      continue;
    }

    // 보통 목록(`- 항목`) — 들여쓰기는 그대로 두고 기호만 가운뎃점으로 바꾼다.
    const bullet = /^([ \t]*)[-*+][ \t]+(.*)$/.exec(line);
    if (bullet) {
      out.push(`${bullet[1] ?? ''}· ${stripInlineMarks((bullet[2] ?? '').trim())}`);
      continue;
    }

    out.push(stripInlineMarks(line));
  }

  // 버린 줄 자리에 남은 빈 줄이 뭉치지 않게 줄인다 — 문단 사이 한 줄까지만 남긴다.
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
