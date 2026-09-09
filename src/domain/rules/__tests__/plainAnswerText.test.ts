/**
 * 쌤핀 AI 답 → 평문 (2026-09-10 오너 신고)
 *
 * 실제로 본 화면: "이번 주 일정과 할 일 정리해줘" 에 내 AI(Claude Code)가 마크다운 표로
 * 답했고, 패널이 그걸 글자 그대로 그려서 `## 📅 이번 주 일정 | 날짜 | 시간 | ...` 이
 * 한 줄로 늘어붙었다. 마크다운 해석도 없고 줄바꿈 유지도 없던 자리다.
 *
 * ★여기 쓰는 일정은 **지어낸 값**이다. 신고 화면에는 오너의 실제 일정과 사람 이름이
 *   있었는데, 저장소에 남길 이유가 없어 모양만 같게 다시 썼다.
 */
import { describe, it, expect } from 'vitest';

import { buildCodexStdinText } from '../ownAiCliRules';
import {
  PLAIN_ANSWER_INSTRUCTION,
  buildPanelSystemPrompt,
  toPlainAnswerText,
} from '../plainAnswerText';

describe('toPlainAnswerText — 마크다운을 평문으로', () => {
  it('★제목의 우물 정을 뗀다', () => {
    expect(toPlainAnswerText('## 이번 주 일정')).toBe('이번 주 일정');
    expect(toPlainAnswerText('#### 참고')).toBe('참고');
  });

  it('붙여 쓴 우물 정은 제목이 아니다 — 그대로 둔다', () => {
    expect(toPlainAnswerText('#1 순위는 출결입니다')).toBe('#1 순위는 출결입니다');
  });

  it('★표는 가운뎃점으로 편다. 구분줄은 버린다', () => {
    const table = [
      '| 날짜 | 시간 | 일정 |',
      '|------|------|------|',
      '| 9/8 | 20:30 | 수업 |',
    ].join('\n');
    expect(toPlainAnswerText(table)).toBe('날짜 · 시간 · 일정\n9/8 · 20:30 · 수업');
  });

  it('굵게·코드·링크 표시를 뗀다', () => {
    expect(toPlainAnswerText('할 일은 **없습니다**')).toBe('할 일은 없습니다');
    expect(toPlainAnswerText('__굵게__ 씁니다')).toBe('굵게 씁니다');
    expect(toPlainAnswerText('`get_events` 로 조회했어요')).toBe('get_events 로 조회했어요');
    expect(toPlainAnswerText('[사용자 가이드](https://www.ssampin.com/docs) 를 보세요')).toBe(
      '사용자 가이드 (https://www.ssampin.com/docs) 를 보세요',
    );
  });

  it('목록 기호는 가운뎃점으로 바꾸고 들여쓰기는 살린다', () => {
    expect(toPlainAnswerText('- 간식\n  - 배변패드')).toBe('· 간식\n  · 배변패드');
    expect(toPlainAnswerText('* 의상 준비')).toBe('· 의상 준비');
  });

  it('확인칸 목록은 했는지 안 했는지를 살린다', () => {
    expect(toPlainAnswerText('- [x] 결재 처리\n- [ ] 채점')).toBe('✓ 결재 처리\n· 채점');
  });

  it('수평선과 코드 울타리는 줄째 버린다', () => {
    expect(toPlainAnswerText('앞\n\n---\n\n뒤')).toBe('앞\n\n뒤');
    expect(toPlainAnswerText('```json\n{ "a": 1 }\n```')).toBe('{ "a": 1 }');
  });

  it('번호 목록은 건드리지 않는다 — 한국어 평문으로 읽어도 자연스럽다', () => {
    expect(toPlainAnswerText('1. 출결 확인\n2. 채점')).toBe('1. 출결 확인\n2. 채점');
  });

  it('★별표 하나는 건드리지 않는다 — 각주·곱셈일 수 있어 멀쩡한 글자를 지우게 된다', () => {
    expect(toPlainAnswerText('3 * 4 는 12 입니다')).toBe('3 * 4 는 12 입니다');
    expect(toPlainAnswerText('점수*는 임시값입니다')).toBe('점수*는 임시값입니다');
  });

  it('★가린 이름 별칭(전각 괄호)은 그대로 지나간다 — 여기서 깨지면 실명 복원이 실패한다', () => {
    expect(toPlainAnswerText('- ［이름1］ 출결은 **정상**입니다')).toBe(
      '· ［이름1］ 출결은 정상입니다',
    );
  });

  it('버린 줄 자리에 빈 줄이 뭉치지 않는다', () => {
    expect(toPlainAnswerText('앞\n\n\n\n\n뒤')).toBe('앞\n\n뒤');
  });

  it('평문으로 온 답은 하나도 바뀌지 않는다', () => {
    const plain = '이번 주 등록된 할 일은 없어요.\n필요하면 등록해 드릴까요?';
    expect(toPlainAnswerText(plain)).toBe(plain);
  });

  it('★신고 화면 재현 — 표·제목·굵게·수평선이 섞인 답이 읽히는 평문이 된다', () => {
    const answer = [
      '## 📅 이번 주 일정',
      '',
      '| 날짜 | 시간 | 일정 |',
      '|------|------|------|',
      '| 9/8(화) | 20:30~22:55 | 교직 실무 연수 |',
      '| 9/11(금) | 14:00~15:00 | 학년 협의회 |',
      '',
      '## ✅ 할 일',
      '',
      '이번 주 등록된 할 일은 **없습니다** (0건).',
      '',
      '---',
      '',
      '**참고**: 필요하면 할 일로 등록해 드릴까요?',
    ].join('\n');

    expect(toPlainAnswerText(answer)).toBe(
      [
        '📅 이번 주 일정',
        '',
        '날짜 · 시간 · 일정',
        '9/8(화) · 20:30~22:55 · 교직 실무 연수',
        '9/11(금) · 14:00~15:00 · 학년 협의회',
        '',
        '✅ 할 일',
        '',
        '이번 주 등록된 할 일은 없습니다 (0건).',
        '',
        '참고: 필요하면 할 일로 등록해 드릴까요?',
      ].join('\n'),
    );
  });
});

describe('buildPanelSystemPrompt — 내 AI 에 보낼 지시문', () => {
  it('★별칭 힌트가 없어도 형식 지시는 간다 — 이름 없는 질문이 지시 없이 나가던 자리다', () => {
    expect(buildPanelSystemPrompt('')).toBe(PLAIN_ANSWER_INSTRUCTION);
    expect(buildPanelSystemPrompt('   ')).toBe(PLAIN_ANSWER_INSTRUCTION);
  });

  it('힌트가 있으면 형식 지시 뒤에 붙는다 — 순서가 바뀌면 형식이 뒤로 밀린다', () => {
    const built = buildPanelSystemPrompt('［이름1］ = 담임 15번');
    expect(built.startsWith(PLAIN_ANSWER_INSTRUCTION)).toBe(true);
    expect(built.endsWith('［이름1］ = 담임 15번')).toBe(true);
  });

  it('지시문이 금지 기호를 글자로 보여 준다 — "마크다운"이라는 낱말만으로는 안 통했다', () => {
    for (const mark of ['#', '|', '**']) {
      expect(PLAIN_ANSWER_INSTRUCTION.includes(mark)).toBe(true);
    }
  });

  it('★지시문에 코드 울타리를 열지 않는다 — codex 는 이 글이 질문과 한 덩어리로 나간다', () => {
    expect(PLAIN_ANSWER_INSTRUCTION.includes('```')).toBe(false);
    // 무엇을 금지하는지는 말로 남아 있어야 한다(기호를 뺐다고 뜻까지 빠지면 안 된다)
    expect(PLAIN_ANSWER_INSTRUCTION.includes('코드블록')).toBe(true);
  });

  it('지시문 자체가 마크다운이 아니다 — "쓰지 말라"면서 그 모양으로 적으면 따라 한다', () => {
    for (const line of PLAIN_ANSWER_INSTRUCTION.split('\n')) {
      expect(/^[-*+#>]\s/.test(line)).toBe(false);
    }
  });
});

/**
 * codex 는 claude 와 통로가 다르다 — `--append-system-prompt` 가 없어서 지시문이
 * **질문과 한 덩어리 글**로 나간다(`buildCodexStdinText`). claude 에서 멀쩡한 지시문이
 * 여기서는 질문을 삼킬 수 있어 따로 잠근다.
 */
describe('codex 경로 — 지시문이 질문과 한 덩어리로 나간다', () => {
  const QUESTION = '이번 주 일정과 할 일 정리해줘';

  it('★형식 지시가 질문보다 앞에 온다 — "이 조건으로 답하라"라서 재료보다 먼저다', () => {
    const text = buildCodexStdinText({
      prompt: QUESTION,
      appendSystemPrompt: buildPanelSystemPrompt(''),
    });
    expect(text.indexOf('마크다운을 쓰지 마세요')).toBeLessThan(text.indexOf(QUESTION));
  });

  it('★코드 울타리가 열린 채 남지 않는다 — 열리면 질문까지 코드 블록에 삼켜진다', () => {
    const text = buildCodexStdinText({
      prompt: QUESTION,
      appendSystemPrompt: buildPanelSystemPrompt('［이름1］ = 담임 15번'),
    });
    // 울타리는 짝이 맞아야 한다. 지시문이 하나만 열어 두던 자리다.
    expect((text.match(/```/g) ?? []).length % 2).toBe(0);
    expect(text.includes(QUESTION)).toBe(true);
  });

  it('별칭 대응표도 질문 앞에 함께 실린다 — 이름으로 물은 질문이 답을 얻는 길', () => {
    const text = buildCodexStdinText({
      prompt: QUESTION,
      appendSystemPrompt: buildPanelSystemPrompt('［이름1］ = 담임 15번'),
    });
    expect(text.indexOf('［이름1］ = 담임 15번')).toBeLessThan(text.indexOf(QUESTION));
  });
});
