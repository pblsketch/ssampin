/**
 * 제안 칩 ↔ 도구 선택 **이음매**
 *
 * ★UltraQA Cycle 2 에서 잡힌 결함: 칩 4개 중 2개가 카드를 하나도 못 만들었다.
 * '오늘 우리 반 출결' 과 '이번 달 기록 몇 건' 이 어느 정규식에도 안 걸렸다.
 * 칩은 계획서가 "1층 방어"라 부르는 **주 경로**인데, 눌러도 숫자가 안 나오니
 * AI 가 **근거 없이** 답하게 된다(P5 도 깨진다 — 남는 카드가 없으니까).
 *
 * 칩 문구와 컨테이너 정규식은 서로 다른 파일에 있어서 조용히 어긋난다.
 * 그래서 **양쪽을 한 파일에서 맞춰 본다.**
 */
import { describe, expect, it } from 'vitest';

import { ASSIST_PLACEHOLDER_EXAMPLE, SUGGESTIONS } from '../AssistDock';
import { INTENT_RULES } from '../AssistDockContainer';
import { findAssistTool } from '@domain/services/assistToolRegistry';

function toolsFor(question: string): string[] {
  return INTENT_RULES.filter((r) => r.pattern.test(question)).map((r) => r.tool);
}

describe('★제안 칩은 반드시 카드를 만든다', () => {
  it.each([...SUGGESTIONS])('%s → 도구가 하나 이상 걸린다', (chip) => {
    expect(toolsFor(chip), `"${chip}" 이 어느 도구에도 안 걸린다`).not.toHaveLength(0);
  });
});

describe('의도 판정이 가리키는 도구는 실제로 존재한다', () => {
  it.each([...INTENT_RULES])('$tool 은 레지스트리에 있다', ({ tool }) => {
    expect(findAssistTool(tool)).toBeDefined();
  });

  it('★1등급 도구만 가리킨다 (ADR-061 결정 7)', () => {
    for (const rule of INTENT_RULES) {
      expect(findAssistTool(rule.tool)?.grade).toBe(1);
    }
  });
});

describe('평범한 질문에 엉뚱한 도구가 딸려오지 않는다', () => {
  it('인사말에는 아무 도구도 안 걸린다', () => {
    expect(toolsFor('안녕하세요')).toHaveLength(0);
  });

  it('출결 질문에 할 일 도구가 딸려오지 않는다', () => {
    expect(toolsFor('오늘 결석한 학생 있나요')).toEqual(['get_attendance_summary']);
  });

  it('한 질문이 여러 도구를 부를 수 있다 — 서버 상한(6) 안이다', () => {
    const many = toolsFor('담당 학급 인원이랑 출결이랑 할 일이랑 기록 알려줘');
    expect(many.length).toBeGreaterThan(1);
    expect(many.length).toBeLessThanOrEqual(6);
  });
});

describe('입력칸 예시 질문', () => {
  it('★예시가 의도 규칙에 걸린다 — 되지 않는 것을 앱이 권하면 안 된다', () => {
    // 예전 예시 "오늘 3학년 2반 출결 어때요?"는 출결 규칙에 걸리긴 했지만
    // 반 이름을 무시하고 담임 반 숫자를 돌려줬다(2026-08-23 신고).
    // 지금 예시는 담임 반("우리 반") 기준이라 안내와 동작이 일치한다.
    expect(INTENT_RULES.some((rule) => rule.pattern.test(ASSIST_PLACEHOLDER_EXAMPLE))).toBe(true);
    expect(ASSIST_PLACEHOLDER_EXAMPLE).not.toMatch(/\d학년|\d반/);
  });
});
