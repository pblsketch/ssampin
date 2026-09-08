/**
 * 초안이 아닌 답(거절·되묻기·목록) 판정 — 2026-09-08 실기기 대행 QA R-3 의 실제 답을 표본으로 쓴다.
 */
import { describe, it, expect } from 'vitest';

import { judgeNonDraftReply, looksLikeNonDraftReply } from '../nonDraftReply';

/** 실제로 조절안으로 표시됐던 거절문(1,721바이트) — 앞부분. */
const REFUSAL = `이 요청은 그대로 수행하기 어렵습니다. - 원문(약 162바이트)에는 구체적 사실이 "모둠 활동 – 자료 정리 – 발표 자료 제작 – 협력 태도 – 역할 완수"뿐이며, 과목·주제·구체적 역할·산출물·수치·시기 등 세부 정보가 전혀 없습니다.
- 목표 분량(1,620~1,705바이트)은 원문의 약 10배로, 이 정도 분량을 채우려면 원문에 없는 활동·장면·수치·평가를 새로 지어내야 합니다.
1. 목표 분량을 원문 정보량에 맞게 현실적으로 낮춰 주시면(예: 300~500바이트), 있는 사실만으로 문장을 완결된 형태로 다듬어 드리겠습니다.`;

/** 같은 QA 에서 정상으로 나온 초안(Claude Code · Sonnet 5) — 한 문단 줄글. */
const DRAFT = `지역 청년 실업 통계에서 경제활동인구의 정의를 직접 확인하는 모습을 보인 뒤, 수업에서 다룬 합리적 선택의 기준을 학습하고 "쿠폰이 있으면 왜 필요 없는 물건도 사게 되나요?"라는 질문을 던져 배운 기준과 실제 소비 행동이 어긋나는 지점을 스스로 짚어냄. 행동경제학의 준거점 개념을 찾아 읽고 이를 근거로 반 친구 20명을 대상으로 한 설문 문항 5개를 직접 제작함. 표본이 같은 반 20명에 그친다는 되물음에 일반화할 수 없음을 인정하고 이 한계를 보고서에 별도로 기술함.`;

describe('judgeNonDraftReply', () => {
  it('★실제 거절문은 설명으로 판정한다', () => {
    const v = judgeNonDraftReply(REFUSAL);
    expect(v.nonDraft).toBe(true);
    expect(v.reason).toContain('설명');
  });

  it('정상 초안(줄글 한 문단)은 초안으로 본다', () => {
    expect(judgeNonDraftReply(DRAFT)).toEqual({ nonDraft: false, reason: '' });
    expect(looksLikeNonDraftReply(DRAFT)).toBe(false);
  });

  it('표식이 붙은 초안도 초안이다 — 떼기 전 원문에 써도 오판하지 않는다', () => {
    const marked = `[동기] ${DRAFT.slice(0, 80)}\n\n[과정] ${DRAFT.slice(80, 200)}\n\n[평가] 탐구 태도가 확인됨.`;
    expect(looksLikeNonDraftReply(marked)).toBe(false);
  });

  it('목록 줄이 2줄 이상이면 설명으로 본다(초안은 줄글이다)', () => {
    const list = `- 설문 문항을 고쳤다.\n- 표본 한계를 적었다.\n- 그래프로 정리했다.`;
    expect(judgeNonDraftReply(list).nonDraft).toBe(true);
  });

  it('목록 줄이 1줄뿐이면 초안으로 둔다(보수적 판정)', () => {
    const one = `1. 설문 문항을 고치고 다시 돌려 표본의 한계를 스스로 적음. 이후 그래프로 정리해 발표함.`;
    expect(judgeNonDraftReply(one).nonDraft).toBe(false);
  });

  it('빈 답은 설명으로 본다', () => {
    expect(judgeNonDraftReply('   ').nonDraft).toBe(true);
  });

  it('"요청" 같은 낱말이 학생 활동 서술 안에 있으면 오판하지 않는다', () => {
    const activity = `친구의 요청에 따라 자료를 정리해 주고, 모둠의 발표 요청을 받아 그래프를 만들어 설명함.`;
    // "요청을 받아" 같은 학생 활동 서술은 초안이다 — 낱말 하나로 막지 않는다.
    expect(judgeNonDraftReply(activity).nonDraft).toBe(false);
  });
});
