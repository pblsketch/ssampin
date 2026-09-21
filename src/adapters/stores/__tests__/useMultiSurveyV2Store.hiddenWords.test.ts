/**
 * useMultiSurveyV2Store — 숨긴 단어(hideWord/showWord) 단위 테스트.
 *
 * 성질 2개를 고정한다:
 *  1. 교사가 숨긴 단어가 라이브 세션에 쌓이고 되돌릴 수 있다.
 *  2. 숨긴 단어는 **저장되지 않는다** (설문 본문·localStorage 모두).
 *     저장되면 다음 라이브·다른 기기까지 단어가 사라져 원인을 못 찾는다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useMultiSurveyV2Store } from '../useMultiSurveyV2Store';

const QUESTION_ID = 'q-wc';

function resetStore(): void {
  useMultiSurveyV2Store.setState({
    sessions: [],
    liveSession: null,
    selectedSessionId: null,
    questionOpenedAt: {},
  });
}

function startLiveWithWordCloud(): void {
  const { createSession, updateSession, startLive } = useMultiSurveyV2Store.getState();
  const session = createSession({ title: '단어 모으기' });
  updateSession(session.id, {
    questions: [
      {
        id: QUESTION_ID,
        type: 'wordcloud',
        text: '오늘 수업을 단어로',
        timerSeconds: 60,
        score: 0,
        maxWords: 3,
        maxWordLength: 10,
      },
    ],
  });
  startLive(session.id);
}

describe('hideWord / showWord', () => {
  beforeEach(() => {
    resetStore();
    startLiveWithWordCloud();
  });

  it('라이브 시작 시 숨긴 단어는 비어 있다', () => {
    expect(useMultiSurveyV2Store.getState().liveSession?.hiddenWordsByQuestion).toEqual({});
  });

  it('단어를 숨기면 정규화된 키로 쌓인다', () => {
    useMultiSurveyV2Store.getState().hideWord(QUESTION_ID, '  Bad Word ');
    expect(
      useMultiSurveyV2Store.getState().liveSession?.hiddenWordsByQuestion[QUESTION_ID],
    ).toEqual(['bad word']);
  });

  it('같은 단어를 두 번 숨겨도 한 번만 쌓인다', () => {
    const { hideWord } = useMultiSurveyV2Store.getState();
    hideWord(QUESTION_ID, '바보');
    hideWord(QUESTION_ID, '바보');
    expect(
      useMultiSurveyV2Store.getState().liveSession?.hiddenWordsByQuestion[QUESTION_ID],
    ).toEqual(['바보']);
  });

  it('되돌리면 다시 보인다', () => {
    const { hideWord, showWord } = useMultiSurveyV2Store.getState();
    hideWord(QUESTION_ID, '바보');
    showWord(QUESTION_ID, '바보');
    expect(
      useMultiSurveyV2Store.getState().liveSession?.hiddenWordsByQuestion[QUESTION_ID],
    ).toEqual([]);
  });

  it('문항별로 따로 관리한다', () => {
    const { hideWord } = useMultiSurveyV2Store.getState();
    hideWord(QUESTION_ID, '바보');
    hideWord('q-other', '멍청이');
    const hidden = useMultiSurveyV2Store.getState().liveSession?.hiddenWordsByQuestion;
    expect(hidden?.[QUESTION_ID]).toEqual(['바보']);
    expect(hidden?.['q-other']).toEqual(['멍청이']);
  });

  it('빈 단어는 무시한다', () => {
    useMultiSurveyV2Store.getState().hideWord(QUESTION_ID, '   ');
    expect(useMultiSurveyV2Store.getState().liveSession?.hiddenWordsByQuestion).toEqual({});
  });

  it('라이브가 없으면 아무 일도 하지 않는다', () => {
    resetStore();
    expect(() => useMultiSurveyV2Store.getState().hideWord(QUESTION_ID, '바보')).not.toThrow();
    expect(useMultiSurveyV2Store.getState().liveSession).toBeNull();
  });

  it('설문 본문(questions)에는 숨긴 단어가 들어가지 않는다', () => {
    useMultiSurveyV2Store.getState().hideWord(QUESTION_ID, '바보');
    const serialized = JSON.stringify(useMultiSurveyV2Store.getState().sessions);
    expect(serialized).not.toContain('바보');
    expect(serialized).not.toContain('hiddenWords');
  });

  it('저장 대상(partialize)에 라이브 세션이 없다 — 숨긴 단어는 저장되지 않는다', () => {
    // 다른 스토어의 영속 메타테스트와 같은 방식으로 소스를 정적으로 확인한다.
    const source = readFileSync(resolve(__dirname, '..', 'useMultiSurveyV2Store.ts'), 'utf-8');
    const partialize = source.slice(source.indexOf('partialize:'));
    const block = partialize.slice(0, partialize.indexOf('}),'));
    expect(block).toContain('sessions: state.sessions');
    expect(block).not.toContain('liveSession');
    expect(block).not.toContain('hiddenWordsByQuestion');
  });
});
