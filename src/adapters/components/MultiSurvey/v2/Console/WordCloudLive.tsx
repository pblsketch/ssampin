/**
 * WordCloudLive — 교사 콘솔의 워드클라우드 실시간 표시.
 *
 * 책임:
 *  - 학생이 낸 단어를 빈도에 따라 글자 크기를 키워 보여준다 (기존 워드클라우드 도구와 같은 규칙)
 *  - 교사가 단어를 눌러 화면에서 숨기고, 되돌린다
 *
 * NOT 책임: 숨김 상태 보관(스토어), 교실 화면 표시(Share).
 *
 * 표시 규칙은 `@domain/rules/wordCloudTally`를 쓴다 — 기존 도구와 결과가 같아야 한다.
 * sp-* 토큰: sp-card / sp-border / sp-text / sp-muted / sp-accent
 */

import { memo, useMemo } from 'react';
import type { WordCloudQuestion } from '@domain/entities/multiSurvey/Question';
import type { Response } from '@domain/entities/multiSurvey/Response';
import { scaleFontSize, tallyWords } from '@domain/rules/wordCloudTally';

interface WordCloudLiveProps {
  readonly question: WordCloudQuestion;
  readonly responses: readonly Response[];
  /** 교사가 숨긴 단어(정규화된 키) */
  readonly hiddenWords: readonly string[];
  readonly onHideWord: (word: string) => void;
  readonly onShowWord: (word: string) => void;
}

const MIN_FONT = 16;
const MAX_FONT = 56;
const MAX_DISPLAY = 50;

/** 응답 값에서 단어 배열만 뽑는다 (문자열 하나로 온 옛 응답도 받아들인다) */
function toWordLists(responses: readonly Response[]): readonly (readonly string[] | string)[] {
  const lists: (readonly string[] | string)[] = [];
  for (const r of responses) {
    if (Array.isArray(r.answer)) lists.push(r.answer as readonly string[]);
    else if (typeof r.answer === 'string') lists.push(r.answer);
  }
  return lists;
}

function WordCloudLiveImpl({
  question,
  responses,
  hiddenWords,
  onHideWord,
  onShowWord,
}: WordCloudLiveProps): JSX.Element {
  const lists = useMemo(() => toWordLists(responses), [responses]);
  const words = useMemo(
    () => tallyWords(lists, hiddenWords).slice(0, MAX_DISPLAY),
    [lists, hiddenWords],
  );
  const hiddenLabels = useMemo(() => {
    const all = tallyWords(lists);
    return hiddenWords.map((key) => all.find((w) => w.normalized === key)?.word ?? key);
  }, [lists, hiddenWords]);

  const minCount = words.length > 0 ? Math.min(...words.map((w) => w.count)) : 1;
  const maxCount = words.length > 0 ? Math.max(...words.map((w) => w.count)) : 1;
  const totalWords = words.reduce((sum, w) => sum + w.count, 0);

  return (
    <section
      className="flex w-full flex-col gap-4 rounded-2xl border border-sp-border bg-sp-card p-6"
      aria-label="모인 단어"
    >
      <header className="flex items-baseline justify-between">
        <span className="font-sp-semibold text-sp-text" style={{ fontSize: 20 }}>
          모인 단어
        </span>
        <span className="font-sp-medium text-sp-muted" style={{ fontSize: 14 }}>
          총 {totalWords}개 · 서로 다른 단어 {words.length}개
        </span>
      </header>

      {words.length === 0 ? (
        <p
          className="py-8 text-center font-sp-medium text-sp-muted"
          style={{ fontSize: 16 }}
          role="status"
        >
          아직 들어온 단어가 없어요.
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-3 py-4">
          {words.map((entry) => (
            <button
              key={entry.normalized}
              type="button"
              onClick={() => onHideWord(entry.word)}
              title={`${entry.word} · ${entry.count}회 — 누르면 화면에서 숨겨요`}
              aria-label={`${entry.word}, ${entry.count}회. 화면에서 숨기기`}
              className={[
                'font-sp-bold text-sp-text leading-tight',
                'rounded px-1 hover:bg-sp-bg/60 hover:line-through',
                'transition-colors duration-sp-base motion-reduce:transition-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent',
              ].join(' ')}
              style={{
                fontSize: scaleFontSize(entry.count, {
                  minCount,
                  maxCount,
                  minFont: MIN_FONT,
                  maxFont: MAX_FONT,
                }),
              }}
            >
              {entry.word}
            </button>
          ))}
        </div>
      )}

      <p className="text-center font-sp-medium text-sp-muted" style={{ fontSize: 13 }}>
        단어를 누르면 교실 화면에서도 사라집니다. 학생이 낸 기록 자체는 지워지지 않아요.
      </p>

      {hiddenLabels.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-sp-border pt-3">
          <span className="font-sp-medium text-sp-muted" style={{ fontSize: 13 }}>
            숨긴 단어
          </span>
          {hiddenLabels.map((label, i) => (
            <button
              key={`${label}-${i}`}
              type="button"
              onClick={() => onShowWord(label)}
              aria-label={`${label} 다시 보이기`}
              className={[
                'rounded-full border border-dashed border-sp-border px-3 py-1',
                'font-sp-medium text-sp-muted line-through hover:text-sp-text hover:border-sp-accent',
                'transition-colors duration-sp-base motion-reduce:transition-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent',
              ].join(' ')}
              style={{ fontSize: 13 }}
            >
              {label}
            </button>
          ))}
          <span className="font-sp-medium text-sp-muted" style={{ fontSize: 12 }}>
            (누르면 되돌려요)
          </span>
        </div>
      )}

      <span className="sr-only">
        학생 한 명이 최대 {question.maxWords}개까지 낼 수 있는 문항입니다.
      </span>
    </section>
  );
}

export const WordCloudLive = memo(WordCloudLiveImpl);
