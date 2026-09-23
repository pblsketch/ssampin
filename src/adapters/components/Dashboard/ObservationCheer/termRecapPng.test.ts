// @vitest-environment jsdom
/**
 * ADR-137·돌아보기 spec 3-4 — 학기 돌아보기 그림: 그리는 글자는 다섯 가지뿐(학기 이름·기록한 주·
 * 한 바퀴 합계(0이면 뺌)·숫자 한 줄(없으면 뺌)·쌤핀). 반 이름·반별 숫자·학생 정보가 들어가지 않는다.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderTermRecapPng, termRecapFileName, termRecapImageTexts } from './termRecapPng';

function fakeCanvas(): { canvas: HTMLCanvasElement; texts: string[] } {
  const texts: string[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'fillText') return (text: string) => texts.push(text);
        if (prop === 'measureText') return () => ({ width: 10 });
        return () => undefined;
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
  } as unknown as HTMLCanvasElement;
  return { canvas, texts };
}

const input = {
  termLabel: '2026학년도 2학기',
  recordedWeeks: 14,
  lapTotal: 7,
  weeks: [
    {
      weekStart: '2026-09-21',
      days: ['21', '22', '23', '24', '25'].map((d, i) => ({
        date: `2026-09-${d}`,
        count: i,
        future: false,
        inTerm: true,
      })),
    },
  ],
};

describe('학기 돌아보기 그림', () => {
  it('그리는 글자는 정해진 넷뿐이다', async () => {
    const { canvas, texts } = fakeCanvas();
    const blob = await renderTermRecapPng(input, () => canvas);
    expect(blob.type).toBe('image/png');
    expect(texts).toEqual(['2026학년도 2학기', '기록한 주 14주', '한 바퀴 7번', '쌤핀']);
    expect(termRecapImageTexts(input)).toEqual(texts);
  });

  it('한 바퀴가 0이면 그 줄을 그리지 않는다', async () => {
    const { canvas, texts } = fakeCanvas();
    await renderTermRecapPng({ ...input, lapTotal: 0 }, () => canvas);
    expect(texts).toEqual(['2026학년도 2학기', '기록한 주 14주', '쌤핀']);
  });

  it('숫자 한 줄은 "한 바퀴" 다음, "쌤핀" 앞 — 상담을 가져왔으면 함께', async () => {
    const { canvas, texts } = fakeCanvas();
    await renderTermRecapPng(
      {
        ...input,
        work: {
          counts: { lessons: 58, todos: 12, consultations: 4 },
          partialTodoTerm: false,
        },
      },
      () => canvas,
    );
    expect(texts).toEqual([
      '2026학년도 2학기',
      '기록한 주 14주',
      '한 바퀴 7번',
      '수업 58차시 · 끝낸 할 일 12개 · 상담 4건',
      '쌤핀',
    ]);
  });

  it('학기 중간부터 센 할 일·가져오지 못한 상담·0인 항목은 그림에 없다', () => {
    expect(
      termRecapImageTexts({
        ...input,
        lapTotal: 0,
        work: { counts: { lessons: 30, todos: 5, consultations: null }, partialTodoTerm: true },
      }),
    ).toEqual(['2026학년도 2학기', '기록한 주 14주', '수업 30차시', '쌤핀']);
    // 남는 항목이 없으면 줄 자체가 없다
    expect(
      termRecapImageTexts({
        ...input,
        work: { counts: { lessons: 0, todos: 9, consultations: 0 }, partialTodoTerm: true },
      }),
    ).toEqual(['2026학년도 2학기', '기록한 주 14주', '한 바퀴 7번', '쌤핀']);
  });

  it('창의 숫자 자료를 통째로 넘겨도 반 이름·반별 숫자·할 일 안내는 그리지 않는다', async () => {
    const termWork = {
      line: '수업 3차시 · 끝낸 할 일 1개',
      byClass: [
        { classId: 'c1', name: '2학년 3반', count: 2 },
        { classId: 'c2', name: '2-4 국어', count: 1 },
      ],
      todoNote: '끝낸 할 일은 9월 24일부터 센 수예요',
      counts: { lessons: 3, todos: 1, consultations: null },
      partialTodoTerm: true,
    };
    const { canvas, texts } = fakeCanvas();
    await renderTermRecapPng({ ...input, work: termWork }, () => canvas);
    expect(texts).toEqual([
      '2026학년도 2학기',
      '기록한 주 14주',
      '한 바퀴 7번',
      '수업 3차시',
      '쌤핀',
    ]);
    const all = texts.join(' | ');
    for (const leaked of ['2학년 3반', '2-4', '반', '9월 24일', '끝낸 할 일']) {
      expect(all).not.toContain(leaked);
    }
  });

  it('기본 파일 이름', () => {
    expect(termRecapFileName('2026학년도 2학기')).toBe('쌤핀_2026학년도2학기_잔디.png');
  });

  it('그림을 만들 수 없으면 알린다', async () => {
    const canvas = { getContext: vi.fn(() => null) } as unknown as HTMLCanvasElement;
    await expect(renderTermRecapPng(input, () => canvas)).rejects.toThrow();
  });
});
