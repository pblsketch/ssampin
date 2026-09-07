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
 * 5. 분량 조절 — **조절 대상 본문 자체**가 나가는 경로다. 1차와 자동 재조정 2차 **양쪽 다** 본다.
 */
import { describe, it, expect } from 'vitest';

import { createMaskSession } from '@domain/privacy/maskEngine';
import { redactQuestion, rosterFromAll } from '@domain/rules/redactOutbound';
import {
  buildCorrelationHints,
  formatCorrelationHintBlock,
} from '@domain/rules/ownAiCorrelationHints';
import { buildClaudeArgv, buildCodexArgv, buildCodexStdinText } from '@domain/rules/ownAiCliRules';
import { buildClaudeStdinMessage } from '@domain/rules/assistAttachmentRules';
import { buildLengthAdjustPack, buildRecordDraftPack } from '@domain/services/recordDraftPack';

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

/**
 * **claude 로 나가는 것 전부** — 명령줄 + stdin 메시지.
 *
 * ★argv 만 보면 안 된다(ADR-089 후속 6). 러너는 이제 프롬프트를 **stdin 으로** 넘기므로,
 *   `commandLineText(buildClaudeArgv(...))` 만 재면 본문이 argv 에 없어서 **이유가 틀린 채
 *   항상 통과**한다 — 저장소의 실명 유출 가드가 조용히 무력화되는 모양이다.
 *   그래서 러너와 **같은 조합**(promptViaStdin + stdin 한 줄)으로 재조립해 함께 본다.
 */
function claudeOutbound(o: Parameters<typeof buildClaudeArgv>[0]): string {
  const argv = buildClaudeArgv({ ...o, promptViaStdin: true });
  return `${commandLineText(argv)} ${buildClaudeStdinMessage(o.prompt, [])}`;
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
    expectNoRealNames(
      claudeOutbound({
        kind: 'panel',
        prompt: masked,
        mcpConfigPath: 'E:\\data\\mcp.json',
        appendSystemPrompt: hintBlock,
        version: '2.1.258',
      }),
    );
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
    const text = claudeOutbound({ kind: 'draft', prompt: pack.text, version: '2.1.258' });

    expectNoRealNames(text);
    expect(text).not.toContain('--mcp-config');
    expect(text).not.toContain('--allowedTools');
  });
});

describe('★분량 조절 — 본문이 나가는 새 경로, 재조정 2차까지 본다', () => {
  /**
   * 여기까지가 이음매다. 조절은 **근거가 아니라 초안 본문 자체**를 내보내는 첫 경로이고,
   * 자동 재조정은 그 본문을 **한 번 더** 내보낸다. 1차만 가리고 2차에서 이미 가려진 문자열을
   * 재사용하거나 원문을 다시 집으면, 첫 회만 안전한 기능이 된다.
   */
  const SOURCE =
    '김지훈은 박서연과 함께 미세플라스틱을 조사했고, 이도윤의 자료를 이어받아 정리했다.';

  function adjust(kind: 'shrink' | 'expand', targetBytes: number) {
    return buildLengthAdjustPack({
      kind,
      studentName: '김지훈',
      roster: ROSTER,
      areaLabel: '교과 세부능력 및 특기사항',
      threadTitle: '이도윤과의 공동 탐구',
      sourceText: SOURCE,
      targetBytes,
      evidences: [{ id: 'e1', content: '박서연과 모둠 토의에서 자료를 정리해 왔다.' }],
    });
  }

  it('★1차 명령줄에 실명이 없다 (줄이기·보충하기 둘 다)', () => {
    for (const kind of ['shrink', 'expand'] as const) {
      const pack = adjust(kind, 1500);
      expectNoRealNames(pack.text);
      expectNoRealNames(claudeOutbound({ kind: 'draft', prompt: pack.text, version: '2.1.258' }));
      expectNoRealNames(
        commandLineText(buildCodexArgv({ kind: 'draft', prompt: pack.text, cwd: 'C:\\tmp' })),
      );
    }
  });

  it('★자동 재조정 2차도 같은 조립 함수를 다시 지난다 — 실명이 없다', () => {
    // 화면은 목표만 바꿔 **원문으로** 다시 조립한다. 이미 가린 문자열을 재사용하지 않는다.
    const second = adjust('shrink', 1350);
    expectNoRealNames(second.text);
    expectNoRealNames(claudeOutbound({ kind: 'draft', prompt: second.text, version: '2.1.258' }));
    expect(second.text).toContain('［이름1］');
  });

  it('★같은 학생은 두 번 다 같은 별칭을 받는다 — 번호가 갈리면 되돌리기가 깨진다', () => {
    const first = adjust('shrink', 1500);
    const second = adjust('shrink', 1350);
    expect(first.studentAlias).toBe(second.studentAlias);
  });

  it('조절 명령줄에도 브릿지 통로가 붙지 않는다', () => {
    const text = claudeOutbound({
      kind: 'draft',
      prompt: adjust('shrink', 1500).text,
      version: '2.1.258',
    });
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

describe('★claude 는 프롬프트를 명령줄에 싣지 않는다 (ADR-089 후속 6)', () => {
  /**
   * 명령줄은 같은 컴퓨터의 다른 프로그램이 읽을 수 있다(작업 관리자 "명령줄" 열,
   * `Get-CimInstance Win32_Process`, 백신·EDR 텔레메트리). 거기 실리던 것은 규정만이 아니라
   * **선생님이 넣은 학생 근거 본문**이었고, 이름 가림은 그 반 명단 안에서만 작동한다.
   */
  const BODY = '［이름1］은 미세플라스틱을 조사했다. 매우 긴 근거 본문이 여기 이어진다.';

  it('본문이 argv 에 없다 — stdin 으로만 간다', () => {
    const argv = buildClaudeArgv({ kind: 'draft', prompt: BODY, promptViaStdin: true });
    expect(commandLineText(argv)).not.toContain('미세플라스틱');
    expect(argv).toContain('--input-format');
    expect(argv).toContain('stream-json');
  });

  it('★그래도 stdin 에는 있다 — 가드가 빈 곳을 재고 통과하면 안 된다', () => {
    // 이 단언이 없으면 "argv 에 없다"가 **본문이 어디에도 없어서** 참일 수도 있다.
    expect(claudeOutbound({ kind: 'draft', prompt: BODY })).toContain('미세플라스틱');
  });

  it('규정(appendSystemPrompt)은 여전히 argv 에 있다 — 이번 범위가 아니다', () => {
    // claude 의 시스템 자리는 stdin 메시지가 아니라 `--append-system-prompt` 옵션이다.
    // 규정 본문의 명령줄 노출은 ADR-089 "막지 못하는 것"에 그대로 적혀 있다.
    const argv = buildClaudeArgv({
      kind: 'draft',
      prompt: BODY,
      promptViaStdin: true,
      appendSystemPrompt: '작성 규정 본문',
    });
    expect(commandLineText(argv)).toContain('작성 규정 본문');
  });
});

describe('★codex 도 프롬프트를 명령줄에 싣지 않는다 (확인한 버전에서)', () => {
  const BODY = '［이름1］은 미세플라스틱을 조사했다.';
  const RULE = '작성 규정 본문';

  it('본문도 규정도 argv 에 없다 — 자리에 `-` 만 남는다', () => {
    const argv = buildCodexArgv({
      kind: 'draft',
      prompt: BODY,
      cwd: 'C:\\tmp',
      appendSystemPrompt: RULE,
      promptViaStdin: true,
    });
    const text = commandLineText(argv);
    expect(text).not.toContain('미세플라스틱');
    // ★codex 는 규정도 프롬프트에 붙여 보내므로, stdin 으로 옮기면 규정까지 함께 빠진다.
    expect(text).not.toContain(RULE);
    expect(argv[argv.length - 1]).toBe('-');
  });

  it('★그래도 stdin 글에는 둘 다 있다 — 빈 곳을 재고 통과하면 안 된다', () => {
    const stdin = buildCodexStdinText({ prompt: BODY, appendSystemPrompt: RULE });
    expect(stdin).toContain('미세플라스틱');
    expect(stdin).toContain(RULE);
    expect(stdin.indexOf(RULE)).toBeLessThan(stdin.indexOf('미세플라스틱'));
  });

  it('끄면 옛 경로 그대로다 — 구버전에서 조용히 오작동하지 않게', () => {
    const argv = buildCodexArgv({ kind: 'draft', prompt: BODY, cwd: 'C:\\tmp' });
    expect(argv[argv.length - 1]).toContain('미세플라스틱');
  });

  it('두 경로가 같은 글을 보낸다 — 조립을 한 자리에서 한다', () => {
    const viaArgv = buildCodexArgv({
      kind: 'draft',
      prompt: BODY,
      cwd: 'C:\\tmp',
      appendSystemPrompt: RULE,
    });
    expect(viaArgv[viaArgv.length - 1]).toBe(
      buildCodexStdinText({ prompt: BODY, appendSystemPrompt: RULE }),
    );
  });
});
