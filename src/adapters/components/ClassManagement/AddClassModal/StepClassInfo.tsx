import { useState, useCallback } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

interface StepClassInfoProps {
  initialName: string;
  onNext: (name: string) => void;
  onCancel: () => void;
  /** 기존 그룹에 과목만 추가하는 플로우로 전환 (그룹이 있을 때만 제공) */
  onSwitchToAddGroup?: () => void;
  /** 중등 교과교사용 Legacy 간단 모드로 전환 */
  onSwitchToLegacy?: () => void;
}

/** 위자드 Step 1 — 학급명 입력. 설정의 className을 자동 채움. */
export function StepClassInfo({
  initialName,
  onNext,
  onCancel,
  onSwitchToAddGroup,
  onSwitchToLegacy,
}: StepClassInfoProps) {
  const settingsClassName = useSettingsStore((s) => s.settings.className);
  const [name, setName] = useState<string>(initialName);

  const trimmed = name.trim();
  const canProceed = trimmed.length > 0;

  const handleNext = useCallback(() => {
    if (!canProceed) return;
    onNext(trimmed);
  }, [canProceed, trimmed, onNext]);

  return (
    <div>
      <p className="text-sm text-sp-muted mb-4">
        어느 학급을 만들까요? 같은 학급의 여러 과목은 하나로 묶여 명렬·좌석이 공유됩니다.
      </p>

      <div className="mb-2">
        <label className="block text-xs text-sp-muted mb-1">학급명</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 3학년 1반"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canProceed) handleNext();
          }}
          className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent"
        />
      </div>

      {settingsClassName && settingsClassName.trim() && (
        <p className="text-[11px] text-sp-muted mb-4 flex items-center gap-1">
          <span className="material-symbols-outlined text-xs">edit</span>
          설정에서 가져옴
        </p>
      )}

      {/* 기존 그룹에 과목 추가 진입점 */}
      {onSwitchToAddGroup && (
        <div className="mt-4 p-3 rounded-lg bg-sp-accent/5 border border-sp-accent/20">
          <p className="text-[11px] text-sp-muted mb-1.5">
            이미 만들어둔 학급이 있으신가요?
          </p>
          <button
            type="button"
            onClick={onSwitchToAddGroup}
            className="text-xs text-sp-accent hover:underline"
          >
            기존 학급에 과목 추가하기 →
          </button>
        </div>
      )}

      <div className="flex gap-2 mt-5">
        <button
          onClick={onCancel}
          className="flex-1 text-sm bg-sp-border text-sp-muted rounded-lg py-2 hover:bg-sp-border/80 transition-colors"
        >
          취소
        </button>
        <button
          onClick={handleNext}
          disabled={!canProceed}
          className="flex-1 text-sm bg-sp-accent text-white rounded-lg py-2 hover:bg-sp-accent/80 transition-colors disabled:opacity-40"
        >
          다음
        </button>
      </div>

      {/* 중등 교과교사 전환 링크 */}
      {onSwitchToLegacy && (
        <div className="mt-4 pt-4 border-t border-sp-border text-center">
          <button
            type="button"
            onClick={onSwitchToLegacy}
            className="text-xs text-sp-muted hover:text-sp-accent hover:underline"
          >
            중등 교과교사이신가요? 간단 모드로 추가 →
          </button>
        </div>
      )}
    </div>
  );
}
