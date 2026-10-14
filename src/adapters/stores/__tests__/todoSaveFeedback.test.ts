import { beforeEach, describe, expect, it, vi } from 'vitest';

const show = vi.hoisted(() => vi.fn());
vi.mock('@adapters/components/common/Toast', () => ({
  useToastStore: { getState: () => ({ show }) },
}));

import { reportTodoSaveFailure } from '../todoSaveFeedback';

beforeEach(() => {
  show.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('reportTodoSaveFailure', () => {
  it('저장 실패를 오류 토스트로 알린다', async () => {
    reportTodoSaveFailure(new Error('저장하지 못했습니다: todos'));
    await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(1));
    const [message, type] = show.mock.calls[0] as [string, string];
    expect(type).toBe('error');
    expect(message).toContain('저장하지 못했어요');
  });

  it('할 일 제목을 콘솔에 남기지 않는다', () => {
    reportTodoSaveFailure(new Error('저장하지 못했습니다: todos'));
    const printed = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .flat()
      .join(' ');
    expect(printed).not.toContain('김OO');
  });

  it('오류가 아닌 값도 던지지 않고 알린다', async () => {
    expect(() => reportTodoSaveFailure('문자열 오류')).not.toThrow();
    await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(1));
  });
});
