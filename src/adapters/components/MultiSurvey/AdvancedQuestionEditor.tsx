import { useState } from 'react';
import type { AdvancedQuestion } from '@domain/entities/multiSurvey/AdvancedQuestion';
import { isSafeQuestionImage } from '@domain/rules/advancedQuestionRules';

const field = 'w-full rounded-xl border border-sp-border bg-sp-bg p-3 text-sp-text';
/** 항목 추가·삭제처럼 설정 안에서 쓰는 작은 단추 */
const smallButton =
  'min-h-11 shrink-0 whitespace-nowrap rounded-xl border border-sp-border bg-sp-card px-4 text-sp-text hover:border-sp-accent focus-visible:ring-2 focus-visible:ring-sp-accent disabled:opacity-40';

export function QuestionImageInput({
  value,
  onChange,
  label = '이미지',
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}) {
  const [error, setError] = useState('');
  return (
    <div className="space-y-2">
      <label className="block">
        {label}
        <input
          className={field}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
              setError('2MB 이하의 이미지를 골라 주세요.');
              return;
            }
            const reader = new FileReader();
            reader.onerror = () => setError('이미지를 읽지 못했어요.');
            reader.onload = () => {
              const url = String(reader.result);
              if (!isSafeQuestionImage(url)) {
                setError('PNG·JPEG·WebP·GIF 이미지를 골라 주세요.');
                return;
              }
              setError('');
              onChange(url);
            };
            reader.readAsDataURL(file);
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {value && (
        <>
          <img src={value} alt={label} className="max-h-48 max-w-full rounded-lg object-contain" />
          <button type="button" className={smallButton} onClick={() => onChange('')}>
            이미지 제거
          </button>
        </>
      )}
    </div>
  );
}

export function AdvancedQuestionEditor({
  question: q,
  onChange,
}: {
  question: AdvancedQuestion;
  onChange: (q: AdvancedQuestion) => void;
}) {
  const s = q.settings;
  const settings = (patch: Partial<typeof s>) => onChange({ ...q, settings: { ...s, ...patch } });
  // 가치수직선은 질문 자체를 재는 항목 하나만으로도 쓸 수 있다.
  const minItems = q.type === 'valueline' ? 1 : 2;
  const text = (
    label: string,
    key: 'xLabel' | 'yLabel' | 'xMinLabel' | 'xMaxLabel' | 'yMinLabel' | 'yMaxLabel',
    placeholder = '',
  ) => (
    <label className="block" key={key}>
      {label}
      <input
        aria-label={label}
        className={field}
        placeholder={placeholder}
        value={s[key] ?? ''}
        onChange={(e) => settings({ [key]: e.target.value })}
      />
    </label>
  );
  const number = (label: string, key: 'min' | 'max' | 'step' | 'total' | 'maxIdeas') => (
    <label className="block" key={key}>
      {label}
      <input
        aria-label={label}
        className={field}
        type="number"
        value={s[key]}
        onChange={(e) => settings({ [key]: Number(e.target.value) })}
      />
    </label>
  );
  return (
    <section className="space-y-4" aria-label="문항 유형 설정">
      {['order', 'ranking', 'allocation', 'matrix', 'rating', 'valueline'].includes(q.type) && (
        <fieldset className="space-y-2">
          <legend>
            {q.type === 'valueline' ? '재어 볼 항목 · 한 개면 질문 자체를 잽니다' : '항목'}
          </legend>
          {s.items.map((item, i) => (
            <div key={item.id} className="flex gap-2">
              <input
                aria-label={`${i + 1}번 항목`}
                className={field}
                value={item.text}
                onChange={(e) =>
                  settings({
                    items: s.items.map((old) =>
                      old.id === item.id ? { ...old, text: e.target.value } : old,
                    ),
                  })
                }
              />
              <button
                type="button"
                className={smallButton}
                disabled={s.items.length <= minItems}
                onClick={() => {
                  const items = s.items.filter((old) => old.id !== item.id);
                  onChange({
                    ...q,
                    settings: { ...s, items },
                    ...(q.solution?.order ? { solution: { order: items.map((a) => a.id) } } : {}),
                  });
                }}
              >
                삭제
              </button>
            </div>
          ))}
          <button
            type="button"
            className={smallButton}
            disabled={s.items.length >= 12}
            onClick={() => {
              const items = [...s.items, { id: crypto.randomUUID(), text: '' }];
              onChange({
                ...q,
                settings: { ...s, items },
                ...(q.solution?.order ? { solution: { order: items.map((a) => a.id) } } : {}),
              });
            }}
          >
            항목 추가
          </button>
        </fieldset>
      )}
      {q.type === 'valueline' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {text('왼쪽 끝', 'xMinLabel', '반대')}
            {text('오른쪽 끝', 'xMaxLabel', '찬성')}
          </div>
          {text('기준 이름 · 비워 둬도 됩니다', 'xLabel', '예: 중요도')}
        </>
      )}
      {q.type === 'quadrant' && (
        <>
          <fieldset className="space-y-3">
            <legend className="mb-2 font-bold">두 기준</legend>
            <div className="grid grid-cols-2 gap-3">
              {text('가로 왼쪽 끝', 'xMinLabel', '어려움')}
              {text('가로 오른쪽 끝', 'xMaxLabel', '쉬움')}
            </div>
            {text('가로 기준 이름 · 비워 둬도 됩니다', 'xLabel', '예: 실현 가능성')}
            <div className="grid grid-cols-2 gap-3">
              {text('세로 아래 끝', 'yMinLabel', '낮음')}
              {text('세로 위 끝', 'yMaxLabel', '높음')}
            </div>
            {text('세로 기준 이름 · 비워 둬도 됩니다', 'yLabel', '예: 중요도')}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-2 font-bold">칸 이름 · 비워 두면 축 이름만 보여 줍니다</legend>
            <div className="grid grid-cols-2 gap-3">
              {(['왼쪽 위', '오른쪽 위', '왼쪽 아래', '오른쪽 아래'] as const).map((label, i) => (
                <label className="block" key={label}>
                  {label}
                  <input
                    aria-label={`${label} 칸 이름`}
                    className={field}
                    value={s.quadrantLabels?.[i] ?? ''}
                    onChange={(e) => {
                      const next = [0, 1, 2, 3].map((n) =>
                        n === i ? e.target.value : (s.quadrantLabels?.[n] ?? ''),
                      );
                      // 넷 다 비면 칸 이름을 아예 두지 않는다.
                      settings({
                        quadrantLabels: next.some((value) => value.trim()) ? next : undefined,
                      });
                    }}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block">
            학생 한 명이 놓을 점 개수
            <select
              aria-label="학생 한 명이 놓을 점 개수"
              className={field}
              value={s.maxPoints ?? 1}
              onChange={(e) => settings({ maxPoints: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}개
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={!!s.collectPointText}
              onChange={(e) => settings({ collectPointText: e.target.checked })}
            />
            점마다 짧은 글 함께 받기
          </label>
          <p className="text-sm text-sp-muted">
            {s.collectPointText
              ? '학생이 생각을 적어 그 자리에 붙입니다. 결과 화면에 글이 함께 나와요.'
              : '글 없이 자리만 고릅니다. 결과는 칸마다 몇 명인지로 보여 줘요.'}
          </p>
        </>
      )}
      {['numeric', 'matrix', 'rating', 'valueline'].includes(q.type) && (
        <div className="grid grid-cols-3 gap-3">
          {number('최솟값', 'min')}
          {number('최댓값', 'max')}
          {number('간격', 'step')}
        </div>
      )}
      {q.type === 'numeric' && (
        <label className="block">
          단위
          <input
            className={field}
            value={s.unit}
            onChange={(e) => settings({ unit: e.target.value })}
          />
        </label>
      )}
      {q.type === 'allocation' && number('배분할 총점', 'total')}
      {q.type === 'brainstorm' && (
        <>
          {number('한 학생이 적을 수 있는 개수', 'maxIdeas')}
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={s.allowVoting !== false}
              onChange={(e) => settings({ allowVoting: e.target.checked })}
            />
            공개한 뒤 투표(공감) 받기
          </label>
          <p className="text-sm text-sp-muted">
            {s.allowVoting !== false
              ? '결과를 공개하면 학생이 서로의 글에 공감을 누를 수 있어요.'
              : '모으기만 합니다. 궁금한 점을 받을 때처럼 투표 없이 쓸 수 있어요.'}
          </p>
        </>
      )}
      {q.type === 'matrix' && (
        <div className="grid grid-cols-2 gap-3">
          <label>
            가로축 이름
            <input
              className={field}
              value={s.xLabel}
              onChange={(e) => settings({ xLabel: e.target.value })}
            />
          </label>
          <label>
            세로축 이름
            <input
              className={field}
              value={s.yLabel}
              onChange={(e) => settings({ yLabel: e.target.value })}
            />
          </label>
        </div>
      )}
      {q.type === 'pin' && (
        <QuestionImageInput value={s.imageUrl} onChange={(imageUrl) => settings({ imageUrl })} />
      )}
      {['order', 'numeric', 'pin'].includes(q.type) && (
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={!!q.solution}
            onChange={(e) =>
              onChange({
                ...q,
                score: e.target.checked ? 10 : 0,
                solution: e.target.checked
                  ? q.type === 'order'
                    ? { order: s.items.map((i) => i.id) }
                    : q.type === 'numeric'
                      ? { number: s.min, tolerance: 0 }
                      : { region: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } }
                  : undefined,
              })
            }
          />
          정답 사용
        </label>
      )}
      {q.solution && q.type === 'order' && (
        <p className="text-sp-muted">
          위에서 입력한 항목 순서가 정답입니다. 학생에게는 순서를 섞어 보여줍니다.
        </p>
      )}
      {q.solution && q.type === 'numeric' && (
        <div className="grid grid-cols-2 gap-3">
          {(['number', 'tolerance'] as const).map((key) => (
            <label key={key}>
              {key === 'number' ? '정답 숫자' : '허용 오차'}
              <input
                className={field}
                type="number"
                step="any"
                value={q.solution?.[key] ?? 0}
                onChange={(e) =>
                  onChange({ ...q, solution: { ...q.solution, [key]: Number(e.target.value) } })
                }
              />
            </label>
          ))}
        </div>
      )}
      {q.solution?.region && q.type === 'pin' && (
        <>
          <p className="text-sp-muted">정답 사각형의 위치와 크기를 이미지의 백분율로 지정하세요.</p>
          <div className="grid grid-cols-2 gap-3">
            {(['x', 'y', 'width', 'height'] as const).map((key, i) => (
              <label key={key}>
                {['왼쪽 (%)', '위쪽 (%)', '너비 (%)', '높이 (%)'][i]}
                <input
                  className={field}
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(q.solution!.region![key] * 100)}
                  onChange={(e) =>
                    onChange({
                      ...q,
                      solution: {
                        region: { ...q.solution!.region!, [key]: Number(e.target.value) / 100 },
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
          {s.imageUrl && (
            <div className="relative">
              <img src={s.imageUrl} alt="정답 영역 확인" className="w-full" />
              <div
                className="pointer-events-none absolute border-4 border-sp-accent bg-sp-accent opacity-30"
                style={{
                  left: `${q.solution.region.x * 100}%`,
                  top: `${q.solution.region.y * 100}%`,
                  width: `${q.solution.region.width * 100}%`,
                  height: `${q.solution.region.height * 100}%`,
                }}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
