/**
 * 쌤핀 AI — 입력 안전장치 (**경고 전용**)
 *
 * ★이 테스트의 가장 중요한 역할: **이 함수가 차단 기능을 갖지 않는다는 것을 고정하는 것.**
 * 나중에 누가 "안전하게 하자"며 차단을 되살리면 여기가 빨간불이 된다.
 * 차단은 오너 결정으로 철회됐다(ADR-061 결정 7-4 보정).
 */
import { describe, expect, it } from 'vitest';

import {
  ASSIST_INPUT_KEYWORDS,
  removeFinding,
  screenAssistInput,
} from '@domain/rules/screenAssistInput';

describe('screenAssistInput — 경고 전용', () => {
  it('★판정 결과에 차단 성격의 필드가 없다', () => {
    const result = screenAssistInput('아버지 실직 얘기를 꺼냈는데');
    const keys = Object.keys(result);

    expect(keys.sort()).toEqual(['findings', 'severity']);
    expect(keys).not.toContain('blocked');
    expect(keys).not.toContain('blocking');
    expect(keys).not.toContain('allowed');
  });

  it('정상 업무 질문은 아무것도 걸리지 않는다', () => {
    expect(screenAssistInput('오늘 3학년 2반 출결 어때요?')).toEqual({
      findings: [],
      severity: null,
    });
    expect(screenAssistInput('이번 달 기록 몇 건 썼죠?').severity).toBeNull();
    expect(screenAssistInput('').severity).toBeNull();
  });

  it('가정 형편 표현을 주의로 표시하고 위치를 알려준다', () => {
    const text = '아버지 실직 얘기를 꺼냈는데 어떻게 도와줄까요';
    const result = screenAssistInput(text);

    expect(result.severity).toBe('caution');
    expect(result.findings).toHaveLength(1);
    const hit = result.findings[0];
    if (!hit) throw new Error('findings[0] 이 없다');
    expect(hit.word).toBe('실직');
    expect(hit.label).toBe('가정 형편 이야기');
    expect(text.slice(hit.start, hit.end)).toBe('실직');
  });

  it('★오탐이 나도 막지 않는다 — "진단평가 일정 알려줘"', () => {
    // 차단이었다면 이 정상 업무 질문이 막혀 기능을 못 썼을 것이다.
    // 지금은 노란 줄이 잠깐 뜰 뿐이고, 부르는 쪽은 그대로 전송할 수 있다.
    const result = screenAssistInput('진단평가 일정 알려줘');

    expect(result.severity).toBe('caution');
    expect(result.findings.map((f) => f.word)).toEqual(['진단']);
    // 함수는 판정만 한다 — 전송 여부를 결정하는 값이 없다.
    expect('blocked' in result).toBe(false);
  });

  it('자해·자살은 심각으로 올린다', () => {
    expect(screenAssistInput('자해 흔적이 보여서').severity).toBe('serious');
    expect(screenAssistInput('자살 관련해서 상담이 필요할까요').severity).toBe('serious');
  });

  it('★"예방"이 바로 뒤에 붙으면 심각도를 주의로 내린다 (삭제가 아니다)', () => {
    const result = screenAssistInput('자살예방교육 언제였죠?');

    // 강등되지만 표시는 남는다 - 아무 표시가 없으면 무엇이 나가는지 알 수 없다.
    expect(result.severity).toBe('caution');
    expect(result.findings.map((f) => f.word)).toEqual(['자살']);
    expect(result.findings[0]?.severity).toBe('caution');
  });

  it('★"예방"이 떨어져 있으면 강등하지 않는다 - 전역 검사였을 때 뚫리던 구멍', () => {
    // 이전 구현은 문장 어딘가에 "예방"이 있으면 통째로 건너뛰어 경고가 0건이 됐다.
    const result = screenAssistInput('자살 시도한 학생이 있는데, 예방 교육 자료 있나요?');

    expect(result.severity).toBe('serious');
    expect(result.findings.some((f) => f.category === 'crisis')).toBe(true);
  });

  it('여러 개가 걸리면 위치 순서대로 준다', () => {
    const result = screenAssistInput('이혼 가정이고 우울 증상도 있어요');

    expect(result.findings.map((f) => f.word)).toEqual(['이혼', '우울']);
    const [first, second] = result.findings;
    if (!first || !second) throw new Error('findings 가 2개가 아니다');
    expect(first.start).toBeLessThan(second.start);
  });

  it('같은 단어가 두 번 나오면 두 번 다 잡는다', () => {
    const result = screenAssistInput('입원했다가 또 입원했어요');
    expect(result.findings).toHaveLength(2);
  });

  it('"상담" 단독은 걸리지 않는다 — 쌤핀에 상담예약 기능이 있어 정상 업무어다', () => {
    expect(screenAssistInput('상담 예약 몇 건이지?').severity).toBeNull();
    expect(screenAssistInput('상담 내용 정리해 줘').severity).toBe('caution');
  });

  it('removeFinding 은 걸린 부분만 지우고 나머지는 살린다', () => {
    const text = '아버지 실직 얘기를 꺼냈는데';
    const hit = screenAssistInput(text).findings[0];
    if (!hit) throw new Error('findings[0] 이 없다');

    expect(removeFinding(text, hit)).toBe('아버지  얘기를 꺼냈는데');
  });

  it('키워드 목록이 주의 30 · 심각 2 로 유지된다 (오너 확정: 실사용 후 조정)', () => {
    const serious = ASSIST_INPUT_KEYWORDS.filter((k) => k.severity === 'serious');
    const caution = ASSIST_INPUT_KEYWORDS.filter((k) => k.severity === 'caution');

    expect(serious.map((k) => k.word).sort()).toEqual(['자살', '자해']);
    expect(caution).toHaveLength(30);
  });
});
