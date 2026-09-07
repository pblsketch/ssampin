/**
 * 분량 조절 실행 흐름 — 자동 재조정 1회·앱이 직접 세기·근거 부족 처리.
 *
 * 이 파일이 없으면 조용히 깨지는 것:
 *
 * 1. **모델이 말한 숫자를 믿게 된다.** 판정은 저장될 본문으로 앱이 세야 한다.
 * 2. `[근거 부족]` 표식이 **생기부 본문에 그대로 들어간다** — 문단 파서가 안 떼 준다.
 * 3. 근거가 없어 짧게 나온 답을 **한 번 더 물어 지어내라고 떠민다.**
 * 4. 재조정이 무한히 돈다(왕복 1~2분짜리가 계속 돈다).
 * 5. 두 번 돈 사실이 기록에서 사라진다(`attempts` 와 "고른 쪽"을 뭉개면).
 */
import { describe, it, expect, vi } from 'vitest';
import { rosterFromAll } from '@domain/rules/redactOutbound';
import { neisByteLength } from '@domain/entities/RecordDraft';
import { INSUFFICIENT_MARK } from '@domain/rules/recordLengthGoal';
import {
  adjustRecordOf,
  measureAnswer,
  retryTargetBytes,
  runLengthAdjust,
  type LengthAdjustCandidate,
} from '../lengthAdjustRun';
import type { OwnAiRunApi } from '../ownAiRun';

const ROSTER = rosterFromAll([{ name: '김지훈', studentNumber: 1 }], []);

/** 준비된 답을 순서대로 돌려주는 가짜 CLI. 몇 번 불렸는지도 센다. */
function fakeApi(answers: readonly string[]): { api: OwnAiRunApi; calls: string[] } {
  const calls: string[] = [];
  let handler: ((e: unknown) => void) | null = null;
  const api: OwnAiRunApi = {
    run: async (p) => {
      calls.push(p.prompt);
      const text = answers[calls.length - 1] ?? '(답 없음)';
      // 이벤트는 다음 틱에 — 실제 경로와 같은 순서를 흉내 낸다.
      queueMicrotask(() => handler?.({ type: 'done', runId: p.runId, text }));
      return { ok: true };
    },
    onEvent: (fn) => {
      handler = fn;
      return () => {
        handler = null;
      };
    },
  };
  return { api, calls };
}

function packInput(over: Record<string, unknown> = {}) {
  return {
    kind: 'shrink' as const,
    studentName: '김지훈',
    roster: ROSTER,
    areaLabel: '교과 세부능력 및 특기사항',
    sourceText: '김지훈은 탐구를 이어 갔다.',
    targetBytes: 60,
    ...over,
  };
}

describe('★재조정 목표는 빗나간 만큼 되민다', () => {
  it('넘쳤으면 넘친 만큼 더 줄이라고 한다', () => {
    expect(retryTargetBytes(1610, 1500, 1425)).toBe(1390);
  });

  it('모자랐으면 모자란 만큼 더 채우라고 한다', () => {
    expect(retryTargetBytes(1300, 1500, 1425)).toBe(1625);
  });

  it('음수나 0으로 내려가지 않는다', () => {
    expect(retryTargetBytes(5000, 100, 95)).toBeGreaterThanOrEqual(1);
  });
});

describe('★답의 길이는 저장될 본문으로 앱이 센다', () => {
  it('표식을 뗀 뒤, 문단을 공백 하나로 이은 본문 기준이다', () => {
    const out = measureAnswer('[동기] 왜 그런지 물었다.\n\n[결과] 답을 찾았다.', []);
    expect(out.paragraphs.map((p) => p.role)).toEqual(['motive', 'result']);
    // 저장 본문 = '왜 그런지 물었다. 답을 찾았다.' (표식 없음, 줄바꿈 없음, 공백 한 칸)
    expect(out.bytes).toBe(neisByteLength('왜 그런지 물었다. 답을 찾았다.'));
    expect(out.insufficient).toBe(false);
  });

  it('★[근거 부족] 표식은 본문에서 떨어지고 신호만 남는다', () => {
    const out = measureAnswer(`탐구를 이어 갔다.\n\n${INSUFFICIENT_MARK}`, []);
    expect(out.insufficient).toBe(true);
    expect(out.paragraphs.map((p) => p.text).join(' ')).not.toContain('근거 부족');
  });
});

describe('★자동 재조정은 최대 한 번이다', () => {
  it('첫 답이 목표 안이면 한 번만 부른다', async () => {
    const { api, calls } = fakeApi(['짧게 줄인 글.']);
    const r = await runLengthAdjust({
      api,
      provider: 'claude',
      systemPrompt: '[규정]',
      pack: packInput({ targetBytes: 100 }),
      floorBytes: 1,
    });
    expect(calls).toHaveLength(1);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]?.attempt).toBe(1);
  });

  it('빗나가면 두 번 부르고 **거기서 멈춘다** — 세 번은 없다', async () => {
    const long = '아주 긴 글을 여러 번 반복해서 길게 만든 문장이다.'.repeat(4);
    const { api, calls } = fakeApi([long, long]);
    const attempts: number[] = [];
    const r = await runLengthAdjust({
      api,
      provider: 'claude',
      systemPrompt: '[규정]',
      pack: packInput({ targetBytes: 30 }),
      floorBytes: 28,
      onAttempt: (a) => attempts.push(a),
    });
    expect(calls).toHaveLength(2);
    expect(attempts).toEqual([1, 2]);
    expect(r.candidates.map((c) => c.attempt)).toEqual([1, 2]);
  });

  it('★근거가 부족해 짧게 나온 답은 다시 묻지 않는다 (지어내라고 떠미는 셈이다)', async () => {
    const { api, calls } = fakeApi([`짧은 글. ${INSUFFICIENT_MARK}`, '두 번째는 오면 안 된다.']);
    const r = await runLengthAdjust({
      api,
      provider: 'claude',
      systemPrompt: '[규정]',
      pack: packInput({ kind: 'expand', targetBytes: 3000, evidences: [] }),
      floorBytes: 2850,
    });
    expect(calls).toHaveLength(1);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]?.insufficient).toBe(true);
  });

  it('★두 번째 요청도 원문으로 다시 조립한다 — 이미 가린 글을 재사용하지 않는다', async () => {
    const long = '길게 늘어놓은 문장을 반복한다.'.repeat(5);
    const { api, calls } = fakeApi([long, long]);
    await runLengthAdjust({
      api,
      provider: 'claude',
      systemPrompt: '[규정]',
      pack: packInput({ targetBytes: 30 }),
      floorBytes: 28,
    });
    for (const prompt of calls) {
      expect(prompt).not.toContain('김지훈'); // 실명이 두 번 다 없다
      expect(prompt).toContain('［이름1］');
    }
    // 목표 숫자는 서로 달라야 한다 — 같으면 되민 것이 아니다.
    expect(calls[0]).not.toBe(calls[1]);
  });

  it('규정 지시문을 그대로 함께 보낸다 (조절도 같은 게이트를 받는다)', async () => {
    const sent: (string | undefined)[] = [];
    const api: OwnAiRunApi = {
      run: async (p) => {
        sent.push(p.appendSystemPrompt);
        queueMicrotask(() => handler?.({ type: 'done', runId: p.runId, text: '줄인 글.' }));
        return { ok: true };
      },
      onEvent: (fn) => {
        handler = fn;
        return () => {};
      },
    };
    let handler: ((e: unknown) => void) | null = null;
    await runLengthAdjust({
      api,
      provider: 'claude',
      systemPrompt: '[생기부 작성 규정 본문]',
      pack: packInput({ targetBytes: 100 }),
      floorBytes: 1,
    });
    expect(sent[0]).toBe('[생기부 작성 규정 본문]');
  });

  it('실행이 실패하면 그대로 던진다 — 화면이 갈래별 안내를 띄운다', async () => {
    const api: OwnAiRunApi = {
      run: async (p) => {
        queueMicrotask(() => handler?.({ type: 'error', runId: p.runId, kind: 'usage-limit' }));
        return { ok: true };
      },
      onEvent: (fn) => {
        handler = fn;
        return () => {};
      },
    };
    let handler: ((e: unknown) => void) | null = null;
    await expect(
      runLengthAdjust({
        api,
        provider: 'claude',
        systemPrompt: '[규정]',
        pack: packInput(),
        floorBytes: 1,
      }),
    ).rejects.toBe('usage-limit');
  });
});

describe('★기록은 왕복 횟수와 고른 쪽을 따로 남긴다', () => {
  const cand = (attempt: 1 | 2, bytes: number): LengthAdjustCandidate => ({
    attempt,
    paragraphs: [{ role: null, text: `${bytes}바이트 글` }],
    bytes,
    insufficient: false,
    excluded: '',
    includedCount: 0,
  });

  it('두 번 돌았는데 1차를 골라도 "두 번 돌았다"가 남는다', () => {
    const candidates = [cand(1, 1610), cand(2, 1340)];
    const rec = adjustRecordOf({
      kind: 'shrink',
      targetBytes: 1500,
      sourceText: '원문.',
      candidates,
      picked: candidates[0]!,
    });
    expect(rec.attempts).toBe(2);
    expect(rec.pickedAttempt).toBe(1);
    expect(rec.resultBytes).toBe(1610);
  });

  it('원문 판이 없으면(직접 쓴 글) sourceVersionId 칸을 만들지 않는다', () => {
    const c = cand(1, 1400);
    const rec = adjustRecordOf({
      kind: 'shrink',
      targetBytes: 1500,
      sourceText: '직접 쓴 글.',
      candidates: [c],
      picked: c,
    });
    expect(rec.sourceVersionId).toBeUndefined();
    expect(rec.sourceText).toBe('직접 쓴 글.');
  });
});

describe('진행 알림', () => {
  it('왕복마다 화면에 알린다 (1~2분짜리라 진행이 보여야 한다)', async () => {
    const { api } = fakeApi(['짧게.']);
    const spy = vi.fn();
    await runLengthAdjust({
      api,
      provider: 'claude',
      systemPrompt: '[규정]',
      pack: packInput({ targetBytes: 100 }),
      floorBytes: 1,
      onAttempt: spy,
    });
    expect(spy).toHaveBeenCalledWith(1);
  });
});
