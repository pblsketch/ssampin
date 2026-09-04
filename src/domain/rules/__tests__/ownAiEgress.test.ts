/**
 * 나가는 것 전부를 한 자리에서 붙잡는다 — **학생 실명은 이 컴퓨터를 떠나지 않는다.**
 *
 * "내 AI로 실행"은 선생님 PC 안에서 CLI 를 돌리지만, 그 CLI 는 회사 서버와 대화한다.
 * 그래서 쌤핀이 CLI 에 넘기는 것(=명령줄에 실리는 모든 글자)이 곧 밖으로 나가는 것이다.
 *
 * 다른 테스트들이 조각별로 지키는 것을, 이 파일은 **조각을 이어 붙인 채로** 지킨다.
 * 한 조각이 아무리 멀쩡해도 이어 붙이는 자리에서 새면 소용이 없다.
 *
 * 지키는 것:
 * 1. 패널 질문 — 실명이 별칭으로 바뀐 뒤에만 명령줄에 실린다.
 * 2. 대응 힌트 — "별칭 = 몇 번"만 적고 실명은 안 적는다.
 * 3. 생기부 꾸러미 — 별칭만 실리고, 기재 금지 항목은 아예 빠진다.
 * 4. 두 CLI(claude·codex) 어느 쪽 명령줄에도 실명이 없다.
 */
import { describe, it, expect } from 'vitest';

import { createMaskSession } from '@domain/privacy/maskEngine';
import { redactQuestion, rosterFromAll } from '@domain/rules/redactOutbound';
import {
  buildCorrelationHints,
  formatCorrelationHintBlock,
} from '@domain/rules/ownAiCorrelationHints';
import { buildClaudeArgv, buildCodexArgv } from '@domain/rules/ownAiCliRules';
import { buildRecordDraftPack } from '@domain/services/recordDraftPack';

/** 실명·학번이 실제로 있는 명단. 아래 모든 검사가 이 이름들을 찾는다. */
const STUDENTS = [
  { name: '김지훈', studentNumber: 15 },
  { name: '박서연', studentNumber: 3 },
];
const CLASSES = [{ name: '2학년 4반', students: [{ name: '이도윤', number: 22 }] }];
const REAL_NAMES = ['김지훈', '박서연', '이도윤'];

const ROSTER = rosterFromAll(STUDENTS, CLASSES);

/** 명령줄에 실리는 모든 글자를 한 덩어리로 — 여기 실명이 있으면 밖으로 나간 것이다. */
function commandLineText(argv: readonly string[]): string {
  return argv.join(' ');
}

function expectNoRealNames(text: string): void {
  for (const name of REAL_NAMES) {
    expect(text).not.toContain(name);
  }
}

describe('★패널 질문 — 명령줄 어디에도 실명이 없다', () => {
  const question = '김지훈이랑 박서연 이번 주 어땠어? 이도윤도 같이 봐 줘.';

  /** 화면이 실제로 하는 일 그대로: 가리고 → 힌트 만들고 → argv 로 조립한다. */
  function buildOutbound() {
    const { masked, mappings } = redactQuestion(question, ROSTER, createMaskSession());
    const hints = buildCorrelationHints(mappings, (name) => {
      const refs: { scope: string; number: number }[] = [];
      for (const st of STUDENTS) {
        if (st.name === name) refs.push({ scope: '담임', number: st.studentNumber });
      }
      for (const cls of CLASSES) {
        for (const st of cls.students) {
          if (st.name === name) refs.push({ scope: cls.name, number: st.number });
        }
      }
      return refs;
    });
    return { masked, hintBlock: formatCorrelationHintBlock(hints) };
  }

  it('가려진 질문에는 실명이 없고 별칭이 들어 있다', () => {
    const { masked } = buildOutbound();

    expectNoRealNames(masked);
    expect(masked).toContain('［이름');
  });

  it('★대응 힌트에도 실명이 없다 — 힌트는 "별칭 = 몇 번"만 말한다', () => {
    const { hintBlock } = buildOutbound();

    expectNoRealNames(hintBlock);
    expect(hintBlock).toContain('15번');
  });

  it('claude 명령줄 전체에 실명이 없다', () => {
    const { masked, hintBlock } = buildOutbound();
    const argv = buildClaudeArgv({
      kind: 'panel',
      prompt: masked,
      mcpConfigPath: 'E:\\data\\mcp.json',
      appendSystemPrompt: hintBlock,
      version: '2.1.258',
    });

    expectNoRealNames(commandLineText(argv));
  });

  it('codex 명령줄 전체에 실명이 없다', () => {
    const { masked, hintBlock } = buildOutbound();
    const argv = buildCodexArgv({
      kind: 'panel',
      prompt: masked,
      cwd: 'E:\\data\\run',
      appendSystemPrompt: hintBlock,
      bridge: { command: 'node', args: ['index.mjs'], env: {} },
    });

    expectNoRealNames(commandLineText(argv));
  });
});

describe('★생기부 초안 — 꾸러미와 명령줄 어디에도 실명이 없다', () => {
  const pack = buildRecordDraftPack({
    studentName: '김지훈',
    roster: ROSTER,
    areaLabel: '교과 세부능력 및 특기사항',
    threadTitle: '이도윤과의 공동 탐구',
    evidences: [
      // ★근거에 다른 학생 실명이 적혀 있다 — 이게 새는지가 핵심이다(UltraQA P0).
      { id: 'e1', content: '박서연과 모둠 토의에서 자료를 정리해 왔다.' },
      { id: 'e2', content: '교내 수학경시대회에서 금상을 받았다.' },
    ],
  });

  it('★꾸러미에는 이 학생도, 근거 속 다른 학생도, 주제 속 학생도 실명이 없다', () => {
    expectNoRealNames(pack.text);
    expect(pack.text).toContain('학생: ［이름1］');
    expect(pack.text).toContain('［이름2］'); // 박서연 또는 이도윤 — 어느 쪽이든 별칭이다
  });

  it('기재 금지 항목은 아예 실리지 않는다 — 프롬프트로 막지 않고 빼서 막는다', () => {
    expect(pack.text).not.toContain('경시대회');
    expect(pack.exclusions.map((x) => x.reason)).toContain('prohibited');
  });

  it('초안 명령줄에는 브릿지 통로가 붙지 않는다 — 도구로 실명을 끌어올 길이 없다', () => {
    const argv = buildClaudeArgv({ kind: 'draft', prompt: pack.text, version: '2.1.258' });
    const text = commandLineText(argv);

    expectNoRealNames(text);
    expect(text).not.toContain('--mcp-config');
    expect(text).not.toContain('--allowedTools');
  });
});

describe('★대화 기록을 디스크에 남기지 않는다', () => {
  it('claude 는 세션 저장을 끈다 — 별칭이라도 남기지 않는다', () => {
    const argv = buildClaudeArgv({ kind: 'panel', prompt: '［이름1］ 어땠어?' });
    expect(argv).toContain('--no-session-persistence');
  });
});
