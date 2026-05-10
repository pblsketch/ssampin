/**
 * OverlayConfigDrawer — 활동 설정 패널 (우측 슬라이드 Drawer).
 *
 * 선택된 오버레이의 config(질문/선택지/안내문구 등)를 편집.
 * 활성 오버레이는 잠금(disabled) 처리 — Plan §11/UX [2] 안전망.
 * 3개 config form (poll/text/wordcloud)을 본 파일에 inline. 분량 늘면 분리.
 *
 * Plan §3 + Design §8.4 매핑.
 */

import { useEffect, useState } from 'react';
import { Drawer } from '@adapters/components/common/Drawer';
import type {
  OverlayConfig,
  PollOption,
  SlideOverlay,
} from '@domain/entities/InteractiveSlides';
import type {
  LessonId,
  OverlayId,
} from '@domain/valueObjects/InteractiveSlidesIds';

export interface OverlayConfigDrawerProps {
  readonly isOpen: boolean;
  readonly overlay: SlideOverlay | null;
  readonly lessonId: LessonId;
  readonly isActive: boolean;
  readonly onClose: () => void;
  readonly onConfigChange: (
    overlayId: OverlayId,
    config: OverlayConfig,
  ) => Promise<void>;
  readonly onAutoActivateChange: (
    overlayId: OverlayId,
    autoActivate: boolean,
  ) => Promise<void>;
  readonly onDelete: (overlayId: OverlayId) => void;
}

export function OverlayConfigDrawer({
  isOpen,
  overlay,
  lessonId: _lessonId,
  isActive,
  onClose,
  onConfigChange,
  onAutoActivateChange,
  onDelete,
}: OverlayConfigDrawerProps): JSX.Element {
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="활동 설정"
      srOnlyTitle
      side="right"
      size="md"
    >
      {overlay ? (
        <DrawerBody
          overlay={overlay}
          isActive={isActive}
          onConfigChange={(config) => onConfigChange(overlay.id, config)}
          onAutoActivateChange={(v) => onAutoActivateChange(overlay.id, v)}
          onDelete={() => onDelete(overlay.id)}
          onClose={onClose}
        />
      ) : (
        <div className="p-6 text-sm text-sp-muted">
          활동을 선택하면 설정을 편집할 수 있어요.
        </div>
      )}
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────
interface DrawerBodyProps {
  readonly overlay: SlideOverlay;
  readonly isActive: boolean;
  readonly onConfigChange: (config: OverlayConfig) => Promise<void>;
  readonly onAutoActivateChange: (autoActivate: boolean) => Promise<void>;
  readonly onDelete: () => void;
  readonly onClose: () => void;
}

function DrawerBody({
  overlay,
  isActive,
  onConfigChange,
  onAutoActivateChange,
  onDelete,
  onClose,
}: DrawerBodyProps): JSX.Element {
  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-5 py-4 border-b border-sp-border">
        <h2 className="text-base font-bold text-sp-text">활동 설정</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-sp-muted hover:text-sp-text"
        >
          닫기
        </button>
      </header>

      {isActive && (
        <div className="px-5 py-3 bg-sp-accent/10 border-b border-sp-border text-xs text-sp-text">
          진행 중인 활동은 설정을 바꿀 수 없어요. 닫고 새로 만들 수 있습니다.
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {overlay.config.type === 'poll' && (
          <PollConfigForm
            config={overlay.config}
            disabled={isActive}
            onChange={onConfigChange}
          />
        )}
        {overlay.config.type === 'text' && (
          <TextConfigForm
            config={overlay.config}
            disabled={isActive}
            onChange={onConfigChange}
          />
        )}
        {overlay.config.type === 'wordcloud' && (
          <WordCloudConfigForm
            config={overlay.config}
            disabled={isActive}
            onChange={onConfigChange}
          />
        )}

        {/* 자동 활성화 토글 — 비활성 시에만 변경 가능 */}
        <div className="pt-3 border-t border-sp-border">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={overlay.autoActivate}
              disabled={isActive}
              onChange={(e) => {
                void onAutoActivateChange(e.target.checked);
              }}
              className="w-4 h-4 accent-sp-accent"
            />
            <span className="text-sm text-sp-text">슬라이드 진입 시 자동 시작</span>
          </label>
          <p className="mt-1 ml-7 text-xs text-sp-muted">
            켜두면 이 슬라이드로 넘어갈 때 활동이 자동으로 학생에게 보입니다.
          </p>
        </div>
      </div>

      <footer className="px-5 py-3 border-t border-sp-border flex justify-between items-center">
        <button
          type="button"
          onClick={onDelete}
          disabled={isActive}
          className="text-xs text-red-400 hover:text-red-300 disabled:text-sp-muted disabled:cursor-not-allowed"
        >
          활동 삭제
        </button>
        <span className="text-xs text-sp-muted">
          변경사항은 자동 저장됩니다
        </span>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Poll Config Form
// ─────────────────────────────────────────────────────────────
interface PollConfigFormProps {
  readonly config: Extract<OverlayConfig, { type: 'poll' }>;
  readonly disabled: boolean;
  readonly onChange: (config: OverlayConfig) => Promise<void>;
}

function PollConfigForm({
  config,
  disabled,
  onChange,
}: PollConfigFormProps): JSX.Element {
  const [draft, setDraft] = useState(config);

  // config prop이 외부에서 갱신되면 동기화 (다른 오버레이 선택 등)
  useEffect(() => setDraft(config), [config]);

  const commit = (next: typeof draft): void => {
    setDraft(next);
    void onChange(next);
  };

  const updateOption = (idx: number, label: string): void => {
    const next: PollOption[] = draft.options.map((o, i) =>
      i === idx ? { ...o, label } : o,
    );
    commit({ ...draft, options: next });
  };

  const addOption = (): void => {
    if (draft.options.length >= 10) return;
    const newId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    commit({
      ...draft,
      options: [...draft.options, { id: newId, label: '' }],
    });
  };

  const removeOption = (idx: number): void => {
    if (draft.options.length <= 2) return;
    commit({ ...draft, options: draft.options.filter((_, i) => i !== idx) });
  };

  return (
    <fieldset disabled={disabled} className="space-y-4 disabled:opacity-50">
      <div>
        <label className="block text-xs text-sp-muted mb-1">질문</label>
        <textarea
          className="w-full px-3 py-2 bg-sp-bg border border-sp-border rounded-lg text-sp-text text-sm focus:outline-none focus:border-sp-accent disabled:cursor-not-allowed"
          rows={2}
          maxLength={500}
          value={draft.question}
          onChange={(e) => commit({ ...draft, question: e.target.value })}
          placeholder="학생에게 물어볼 질문을 적어주세요"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-xs text-sp-muted">선택지 (2~10개)</label>
          <button
            type="button"
            onClick={addOption}
            disabled={disabled || draft.options.length >= 10}
            className="text-xs text-sp-accent hover:text-sp-accent/80 disabled:text-sp-muted disabled:cursor-not-allowed"
          >
            + 추가
          </button>
        </div>
        <div className="space-y-2">
          {draft.options.map((opt, idx) => (
            <div key={opt.id} className="flex gap-2">
              <input
                type="text"
                className="flex-1 px-3 py-2 bg-sp-bg border border-sp-border rounded-lg text-sp-text text-sm focus:outline-none focus:border-sp-accent disabled:cursor-not-allowed"
                maxLength={200}
                value={opt.label}
                onChange={(e) => updateOption(idx, e.target.value)}
                placeholder={`선택지 ${idx + 1}`}
              />
              <button
                type="button"
                onClick={() => removeOption(idx)}
                disabled={disabled || draft.options.length <= 2}
                className="px-2 text-sp-muted hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="선택지 삭제"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-sp-text">
        <input
          type="checkbox"
          checked={draft.multiSelect}
          onChange={(e) => commit({ ...draft, multiSelect: e.target.checked })}
          className="w-4 h-4 accent-sp-accent"
        />
        복수 선택 허용
      </label>
    </fieldset>
  );
}

// ─────────────────────────────────────────────────────────────
// Text Config Form
// ─────────────────────────────────────────────────────────────
interface TextConfigFormProps {
  readonly config: Extract<OverlayConfig, { type: 'text' }>;
  readonly disabled: boolean;
  readonly onChange: (config: OverlayConfig) => Promise<void>;
}

function TextConfigForm({
  config,
  disabled,
  onChange,
}: TextConfigFormProps): JSX.Element {
  const [draft, setDraft] = useState(config);
  useEffect(() => setDraft(config), [config]);

  const commit = (next: typeof draft): void => {
    setDraft(next);
    void onChange(next);
  };

  return (
    <fieldset disabled={disabled} className="space-y-4 disabled:opacity-50">
      <div>
        <label className="block text-xs text-sp-muted mb-1">안내 문구</label>
        <textarea
          className="w-full px-3 py-2 bg-sp-bg border border-sp-border rounded-lg text-sp-text text-sm focus:outline-none focus:border-sp-accent disabled:cursor-not-allowed"
          rows={2}
          maxLength={500}
          value={draft.prompt}
          onChange={(e) => commit({ ...draft, prompt: e.target.value })}
          placeholder="학생에게 보여줄 안내 문구"
        />
      </div>
      <div>
        <label className="block text-xs text-sp-muted mb-1">최대 글자수</label>
        <input
          type="number"
          min={10}
          max={2000}
          step={10}
          className="w-full px-3 py-2 bg-sp-bg border border-sp-border rounded-lg text-sp-text text-sm focus:outline-none focus:border-sp-accent disabled:cursor-not-allowed"
          value={draft.maxLength}
          onChange={(e) =>
            commit({
              ...draft,
              maxLength: Math.max(10, Math.min(2000, Number(e.target.value) || 200)),
            })
          }
        />
      </div>
    </fieldset>
  );
}

// ─────────────────────────────────────────────────────────────
// WordCloud Config Form
// ─────────────────────────────────────────────────────────────
interface WordCloudConfigFormProps {
  readonly config: Extract<OverlayConfig, { type: 'wordcloud' }>;
  readonly disabled: boolean;
  readonly onChange: (config: OverlayConfig) => Promise<void>;
}

function WordCloudConfigForm({
  config,
  disabled,
  onChange,
}: WordCloudConfigFormProps): JSX.Element {
  const [draft, setDraft] = useState(config);
  useEffect(() => setDraft(config), [config]);

  const commit = (next: typeof draft): void => {
    setDraft(next);
    void onChange(next);
  };

  return (
    <fieldset disabled={disabled} className="space-y-4 disabled:opacity-50">
      <div>
        <label className="block text-xs text-sp-muted mb-1">안내 문구</label>
        <textarea
          className="w-full px-3 py-2 bg-sp-bg border border-sp-border rounded-lg text-sp-text text-sm focus:outline-none focus:border-sp-accent disabled:cursor-not-allowed"
          rows={2}
          maxLength={500}
          value={draft.prompt}
          onChange={(e) => commit({ ...draft, prompt: e.target.value })}
          placeholder="떠오르는 키워드를 입력해 주세요"
        />
      </div>
      <div>
        <label className="block text-xs text-sp-muted mb-1">학생당 최대 키워드 수</label>
        <input
          type="number"
          min={1}
          max={20}
          className="w-full px-3 py-2 bg-sp-bg border border-sp-border rounded-lg text-sp-text text-sm focus:outline-none focus:border-sp-accent disabled:cursor-not-allowed"
          value={draft.maxKeywords}
          onChange={(e) =>
            commit({
              ...draft,
              maxKeywords: Math.max(1, Math.min(20, Number(e.target.value) || 3)),
            })
          }
        />
      </div>
    </fieldset>
  );
}
