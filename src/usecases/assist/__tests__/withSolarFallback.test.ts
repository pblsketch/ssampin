import { describe, it, expect } from 'vitest';
import { withSolarFallback } from '@usecases/assist/withSolarFallback';
import {
  AssistBlockedError,
  type AssistAnswer,
  type AssistPort,
  type AssistRequestPayload,
} from '@domain/ports/AssistPort';

const PAYLOAD: AssistRequestPayload = {
  installId: 'i1',
  turns: [{ role: 'user', content: '할 일 몇 건?' }],
  toolResults: [],
};

function port(impl: () => Promise<AssistAnswer>): AssistPort & { calls: number } {
  const p = {
    calls: 0,
    async ask(): Promise<AssistAnswer> {
      p.calls += 1;
      return impl();
    },
  };
  return p;
}

const ok =
  (text: string): (() => Promise<AssistAnswer>) =>
  async () => ({
    text,
    degraded: null,
  });
const boom =
  (e: Error): (() => Promise<AssistAnswer>) =>
  async () => {
    throw e;
  };

describe('내 AI 가 되면 Solar 를 부르지 않는다', () => {
  it('성공하면 그 답을 그대로 준다', async () => {
    const primary = port(ok('내 AI 답'));
    const solar = port(ok('Solar 답'));
    const composed = withSolarFallback(primary, solar, { solarEnabled: () => true });

    const answer = await composed.ask(PAYLOAD);

    expect(answer.text).toBe('내 AI 답');
    expect(answer.degraded).toBeNull();
    expect(solar.calls).toBe(0);
  });
});

describe('★동의선 — 쌤핀 AI 에 동의하지 않았으면 폴백하지 않는다', () => {
  it('동의가 없으면 Solar 를 부르지 않고 원래 오류를 그대로 올린다', async () => {
    const err = new Error('내 AI 실패');
    const primary = port(boom(err));
    const solar = port(ok('Solar 답'));
    const composed = withSolarFallback(primary, solar, { solarEnabled: () => false });

    await expect(composed.ask(PAYLOAD)).rejects.toBe(err);
    // 동의 없이 서버로 질문이 나가면 안 된다
    expect(solar.calls).toBe(0);
  });

  it('동의가 있으면 Solar 로 이어 답하고 사유를 붙인다', async () => {
    const primary = port(boom(new Error('내 AI 실패')));
    const solar = port(ok('Solar 답'));
    const composed = withSolarFallback(primary, solar, { solarEnabled: () => true });

    const answer = await composed.ask(PAYLOAD);

    expect(answer.text).toBe('Solar 답');
    expect(answer.degraded).toBe('own-ai-fallback');
    expect(solar.calls).toBe(1);
  });

  it('Solar 가 이미 사유를 달았으면 그 값을 존중한다', async () => {
    const primary = port(boom(new Error('실패')));
    const solar = port(async () => ({ text: '요약만', degraded: 'budget' as const }));
    const composed = withSolarFallback(primary, solar, { solarEnabled: () => true });

    expect((await composed.ask(PAYLOAD)).degraded).toBe('budget');
  });
});

describe('막힌 전송은 폴백 대상이 아니다', () => {
  it('★개인정보로 막힌 질문은 Solar 로도 보내지 않는다 — 다른 데로 보내도 똑같이 막혀야 한다', async () => {
    const blocked = new AssistBlockedError('학생 이름이 들어 있어요');
    const primary = port(boom(blocked));
    const solar = port(ok('Solar 답'));
    const composed = withSolarFallback(primary, solar, { solarEnabled: () => true });

    await expect(composed.ask(PAYLOAD)).rejects.toBe(blocked);
    expect(solar.calls).toBe(0);
  });
});

describe('폴백을 화면에 알린다', () => {
  it('실제로 폴백했을 때만 알린다', async () => {
    const seen: unknown[] = [];
    const err = new Error('내 AI 실패');

    await withSolarFallback(port(ok('성공')), port(ok('s')), {
      solarEnabled: () => true,
      onFallback: (r) => seen.push(r),
    }).ask(PAYLOAD);
    expect(seen).toHaveLength(0);

    await withSolarFallback(port(boom(err)), port(ok('s')), {
      solarEnabled: () => true,
      onFallback: (r) => seen.push(r),
    }).ask(PAYLOAD);
    expect(seen).toEqual([err]);
  });
});

describe('★[중단]을 누른 것은 폴백하지 않는다', () => {
  /** 실행 오류의 모양만 흉내 낸다(유스케이스는 그 클래스를 import 하지 않는다). */
  function runError(kind: string): Error & { kind: string } {
    const e = new Error('own ai') as Error & { kind: string };
    e.name = 'OwnAiRunError';
    e.kind = kind;
    return e;
  }

  it('중단이면 쌤핀 AI 로 다시 묻지 않는다 — 멈추라는 말을 옮겨 보내면 안 된다', async () => {
    const solar = port(ok('solar'));
    const composite = withSolarFallback(port(boom(runError('cancelled'))), solar, {
      solarEnabled: () => true,
    });

    await expect(composite.ask(PAYLOAD)).rejects.toMatchObject({ kind: 'cancelled' });
    expect(solar.calls).toBe(0);
  });

  it('한도에 닿은 것은 폴백한다 — "이어서 답할까요?"가 자연스러운 상황이다', async () => {
    const solar = port(ok('solar'));
    const composite = withSolarFallback(port(boom(runError('usage-limit'))), solar, {
      solarEnabled: () => true,
    });

    await expect(composite.ask(PAYLOAD)).resolves.toMatchObject({ degraded: 'own-ai-fallback' });
    expect(solar.calls).toBe(1);
  });

  it('갈래를 모르는 오류는 예전처럼 폴백한다', async () => {
    const solar = port(ok('solar'));
    const composite = withSolarFallback(port(boom(new Error('unknown'))), solar, {
      solarEnabled: () => true,
    });

    await expect(composite.ask(PAYLOAD)).resolves.toMatchObject({ degraded: 'own-ai-fallback' });
  });
});
