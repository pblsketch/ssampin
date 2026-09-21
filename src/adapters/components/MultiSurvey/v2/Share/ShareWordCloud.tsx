/**
 * ShareWordCloud — 교실 화면용 단어 구름.
 *
 * 교사 콘솔의 `WordCloudLive`와 **같은 규칙**(정규화·빈도·글자 크기)을 쓰고,
 * 교실 뒤에서도 읽히도록 글자 크기 범위만 크게 잡는다. 교사가 숨긴 단어는 여기서도 사라진다.
 * 이 화면에는 개입 수단이 없다(누르는 기능 없음) — 조작은 교사 콘솔에서만 한다.
 *
 * sp-* 토큰: sp-card / sp-border / sp-text / sp-muted
 */

import { memo, useMemo } from 'react';
import { scaleFontSize, tallyWords } from '@domain/rules/wordCloudTally';

interface ShareWordCloudProps {
  /** 학생별 단어 묶음 (문자열 하나로 온 응답도 받아들인다) */
  readonly responses: readonly (readonly string[] | string)[];
  /** 교사가 숨긴 단어(정규화된 키) */
  readonly hiddenWords: readonly string[];
  readonly emptyLabel?: string;
}

const MIN_FONT = 28;
const MAX_FONT = 112;
const MAX_DISPLAY = 40;

function ShareWordCloudImpl({
  responses,
  hiddenWords,
  emptyLabel = '아직 들어온 단어가 없어요.',
}: ShareWordCloudProps): JSX.Element {
  const words = useMemo(
    () => tallyWords(responses, hiddenWords).slice(0, MAX_DISPLAY),
    [responses, hiddenWords],
  );

  if (words.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center rounded-sp-xl border border-sp-border bg-sp-card p-10"
        role="status"
      >
        <span className="font-sp-medium text-sp-muted" style={{ fontSize: 32 }}>
          {emptyLabel}
        </span>
      </div>
    );
  }

  const minCount = Math.min(...words.map((w) => w.count));
  const maxCount = Math.max(...words.map((w) => w.count));

  return (
    <div
      className="flex h-full w-full flex-wrap content-center items-center justify-center gap-x-8 gap-y-4 overflow-hidden"
      aria-live="polite"
      aria-label="모인 단어"
    >
      {words.map((entry) => (
        <span
          key={entry.normalized}
          className="font-sp-bold text-sp-text sp-floating-card"
          style={{
            fontSize: scaleFontSize(entry.count, {
              minCount,
              maxCount,
              minFont: MIN_FONT,
              maxFont: MAX_FONT,
            }),
            lineHeight: 1.15,
          }}
          title={`${entry.word} ${entry.count}회`}
        >
          {entry.word}
        </span>
      ))}
    </div>
  );
}

export const ShareWordCloud = memo(ShareWordCloudImpl);
