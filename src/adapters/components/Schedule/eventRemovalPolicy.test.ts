import { describe, it, expect } from 'vitest';
import { planEventRemoval } from './eventRemovalPolicy';

/**
 * NEIS 일정 "삭제"는 실기기 없이 확인하기 어렵다(구글 연동 + 미푸시 상태가 겹쳐야 재현).
 * 그래서 라우팅 규칙 자체를 여기서 잠근다 — NEIS 는 구글에 알리지 않는 숨김 경로(hide),
 * 그 외는 진짜 삭제(delete). NEIS 가 hide 가 아니게 되면 updateEvent 경로로 돌아가
 * 구글에 사본이 생기던 결함이 재발한다.
 */
describe('planEventRemoval', () => {
  it('NEIS 일정은 지우지 않고 숨긴다 — 숨긴 이유는 manual', () => {
    expect(planEventRemoval({ source: 'neis' })).toEqual({ kind: 'hide', reason: 'manual' });
  });

  it.each(['ssampin', 'google', 'birthday'] as const)('%s 일정은 진짜 삭제한다', (source) => {
    expect(planEventRemoval({ source })).toEqual({ kind: 'delete' });
  });

  it('source 가 없는 옛 일정도 삭제 경로다', () => {
    expect(planEventRemoval({})).toEqual({ kind: 'delete' });
  });

  it('일정을 못 찾았으면(undefined) 삭제 경로로 보낸다 — 스토어가 없는 id 를 무시한다', () => {
    expect(planEventRemoval(undefined)).toEqual({ kind: 'delete' });
  });
});
