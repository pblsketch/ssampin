import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useBottomSheet } from '@mobile/hooks/useBottomSheet';
import { todayISO } from '@mobile/utils/date';
import type { ObservationRecord } from '@domain/entities/Observation';
import { DEFAULT_OBSERVATION_TAGS } from '@domain/entities/Observation';
import { allSlotsForContext } from '@domain/rules/observationSlots';
import { useSpeechInput } from '@mobile/hooks/useSpeechInput';

interface ObservationSheetProps {
  mode: 'add' | 'edit';
  tags: readonly string[];
  initialRecord?: ObservationRecord;
  /** 교사가 직접 추가한 슬롯(기본 6종 외). 데스크톱과 같은 목록을 쓴다. */
  customSlots?: readonly string[];
  onSave: (date: string, content: string, tags: string[], slots: string[]) => Promise<void>;
  onClose: () => void;
}

export function ObservationSheet({
  mode,
  tags,
  customSlots = [],
  initialRecord,
  onSave,
  onClose,
}: ObservationSheetProps) {
  useBottomSheet(true, onClose);

  const [date, setDate] = useState(initialRecord?.date ?? todayISO());
  const [content, setContent] = useState(initialRecord?.content ?? '');
  const [selectedTags, setSelectedTags] = useState<string[]>(
    initialRecord ? [...initialRecord.tags] : [],
  );
  // 관찰 슬롯("어떤 장면인가") — 태그와 직교하는 별개 축. 편집 시 기존 값을 이어받는다.
  const [selectedSlots, setSelectedSlots] = useState<string[]>(
    initialRecord?.slots ? [...initialRecord.slots] : [],
  );
  const allSlots = allSlotsForContext('teaching', customSlots);
  const toggleSlot = (slot: string): void =>
    setSelectedSlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot],
    );
  const [saving, setSaving] = useState(false);

  const contentId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 시트를 열면 바로 쓸 수 있어야 한다. 커서가 이미 칸에 있으면 휴대폰 키보드의
  // 마이크까지 한 번만 누르면 된다(코드 한 줄로 얻는 이득이 크다).
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  /** 받아쓴 말이 확정될 때마다 칸 끝에 이어 붙인다. 상한(500자)은 여기서 지킨다. */
  const appendSpoken = useCallback((spoken: string): void => {
    setContent((prev) => {
      const joined = prev.trimEnd().length === 0 ? spoken : `${prev.trimEnd()} ${spoken}`;
      return joined.slice(0, 500);
    });
  }, []);
  const speech = useSpeechInput(appendSpoken);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleSave = async () => {
    const trimmed = content.trim().slice(0, 500);
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSave(date, trimmed, selectedTags, selectedSlots);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-sp-card border-t border-sp-border rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 드래그 핸들 */}
        <div className="px-2 pt-2 flex justify-center">
          <div className="w-12 h-1 bg-sp-border rounded-full" aria-hidden />
        </div>

        <div className="px-5 pt-3 pb-4 space-y-4">
          <h3 className="text-sp-text font-bold text-base">
            {mode === 'add' ? '특기사항 기록 추가' : '특기사항 기록 편집'}
          </h3>

          {/* 날짜 */}
          <div>
            <label className="block text-sp-muted text-xs mb-1.5">날짜</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="glass-input w-full rounded-xl px-3 py-2 text-sp-text text-sm"
              style={{ minHeight: 44 }}
            />
          </div>

          {/* 태그 */}
          <div>
            <label className="block text-sp-muted text-xs mb-1.5">태그 (복수 선택 가능)</label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isDefaultTag = (DEFAULT_OBSERVATION_TAGS as readonly string[]).includes(tag);
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                      isSelected
                        ? 'bg-sp-accent text-sp-accent-fg border-sp-accent'
                        : isDefaultTag
                          ? 'bg-sp-surface text-sp-text border-sp-border'
                          : 'bg-sp-surface text-sp-muted border-sp-border'
                    }`}
                    style={{ minHeight: 36 }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 내용 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor={contentId} className="text-sp-muted text-xs">
                내용 <span className="tabular-nums">({content.length}/500자)</span>
              </label>
              {/* 모바일은 앱이 직접 듣는다 — 그래서 여기 "듣는 중" 표시는 거짓말이 아니다.
                  (데스크톱은 OS 가 패널을 갖고 있어 알 수 없으므로 표시를 두지 않는다.)
                  지원하지 않는 브라우저에서는 아예 그리지 않는다. */}
              {speech.supported && (
                <button
                  type="button"
                  onClick={speech.listening ? speech.stop : speech.start}
                  aria-pressed={speech.listening}
                  aria-label={speech.listening ? '받아쓰기 멈추기' : '말로 쓰기'}
                  className={`-m-2 flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
                    speech.listening ? 'bg-sp-accent text-sp-accent-fg' : 'text-sp-muted'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`material-symbols-outlined text-icon-md leading-none ${
                      speech.listening ? 'animate-pulse motion-reduce:animate-none' : ''
                    }`}
                  >
                    {speech.listening ? 'stop' : 'mic'}
                  </span>
                </button>
              )}
            </div>
            <textarea
              id={contentId}
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, 500))}
              placeholder="학생 관찰 내용을 입력하세요."
              rows={4}
              className="glass-input w-full rounded-xl px-3 py-2 text-sp-text text-sm resize-none"
            />
            {/* 아직 확정되지 않은 말 — 칸에 넣지 않고 아래에 흐리게 보여 준다.
                그래야 "적힌 것"과 "아직 듣는 중인 것"이 눈으로 구분된다. */}
            {speech.interim !== '' && (
              <p className="mt-1 text-xs text-sp-muted" aria-live="polite">
                {speech.interim}
              </p>
            )}
            {speech.error !== null && (
              <p role="alert" className="mt-1 text-xs text-sp-text">
                {speech.error}
              </p>
            )}
          </div>

          {/* 관찰 슬롯 — 내용 아래(설계 (나)안). 쓰고 나서야 무슨 장면인지 알기 때문이다.
              모바일은 직접 추가 칸을 두지 않는다 — 좁은 화면에서 입력 부담을 늘리지 않는다.
              데스크톱에서 추가한 슬롯은 customSlots 로 내려와 여기서도 보인다. */}
          <div>
            <label className="block text-sp-muted text-xs mb-1.5">어떤 장면인가요? (선택)</label>
            <div className="flex flex-wrap gap-1.5">
              {allSlots.map((slot) => {
                const on = selectedSlots.includes(slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => toggleSlot(slot)}
                    aria-pressed={on}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                      on
                        ? 'bg-sp-accent text-sp-accent-fg border-sp-accent'
                        : 'bg-sp-surface text-sp-muted border-sp-border'
                    }`}
                    style={{ minHeight: 36 }}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 저장 버튼 */}
          <button
            onClick={() => void handleSave()}
            disabled={saving || !content.trim()}
            className="w-full py-3 rounded-xl bg-sp-accent text-sp-accent-fg text-sm font-medium active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100"
            style={{ minHeight: 44 }}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
