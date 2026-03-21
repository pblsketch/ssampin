import { useCallback } from 'react';
import type { Settings, SystemSettings } from '@domain/entities/Settings';
import { SettingsSection } from '../shared/SettingsSection';
import { Toggle } from '../shared/Toggle';

interface Props {
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
  setDraft: React.Dispatch<React.SetStateAction<Settings>>;
}

export function SystemTab({ draft, patch, setDraft }: Props) {
  const patchSystem = useCallback((p: Partial<SystemSettings>) => {
    patch({ system: { ...draft.system, ...p } });
  }, [draft.system, patch]);

  return (
    <SettingsSection
      icon="settings_applications"
      iconColor="bg-slate-500/10 text-slate-400"
      title="시스템"
    >
      <div className="space-y-4 divide-y divide-sp-border/30">
        <div className="flex items-center justify-between pb-2">
          <span className="text-sm font-medium text-sp-text">시작 시 자동 실행</span>
          <Toggle
            checked={draft.system.autoLaunch}
            onChange={(v) => patchSystem({ autoLaunch: v })}
          />
        </div>
        <div className="flex items-center justify-between py-4">
          <span className="text-sm font-medium text-sp-text">알림 소리</span>
          <Toggle
            checked={draft.system.notificationSound}
            onChange={(v) => patchSystem({ notificationSound: v })}
          />
        </div>
        <div className="flex items-center justify-between pt-4">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-sp-text">방해 금지 시간</span>
            <span className="text-xs text-sp-muted">지정된 시간에는 알림을 끄도록 설정합니다.</span>
          </div>
          <div className="flex items-center gap-2 bg-sp-surface px-3 py-1.5 rounded-lg border border-sp-border">
            <input
              type="time"
              value={draft.system.doNotDisturbStart}
              onChange={(e) => patchSystem({ doNotDisturbStart: e.target.value })}
              className="bg-transparent text-sm text-sp-text focus:outline-none p-0 w-[60px] [color-scheme:dark]"
            />
            <span className="text-sp-muted text-sm">~</span>
            <input
              type="time"
              value={draft.system.doNotDisturbEnd}
              onChange={(e) => patchSystem({ doNotDisturbEnd: e.target.value })}
              className="bg-transparent text-sm text-sp-text focus:outline-none p-0 w-[60px] [color-scheme:dark]"
            />
          </div>
        </div>
        <div className="flex items-center justify-between pt-4">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-sp-text">AI 도우미</span>
            <span className="text-xs text-sp-muted">화면 우하단의 AI 챗봇 버튼을 표시합니다</span>
          </div>
          <Toggle
            checked={draft.showChatbot ?? true}
            onChange={(v) => patch({ showChatbot: v })}
          />
        </div>
        <div className="flex items-center justify-between pt-4">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-sp-text">앱 사용 통계 수집</span>
            <span className="text-xs text-sp-muted">앱 개선을 위해 익명 사용 통계를 수집합니다. 개인정보는 수집되지 않습니다.</span>
          </div>
          <Toggle
            checked={draft.analytics?.enabled ?? true}
            onChange={(v) => setDraft((prev) => ({ ...prev, analytics: { enabled: v } }))}
          />
        </div>
      </div>
    </SettingsSection>
  );
}
