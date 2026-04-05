import { useEffect, useState, useCallback } from 'react';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import type { Settings } from '@domain/entities/Settings';
import { SettingsLayout } from './SettingsLayout';

export type SettingsTabId =
  | 'account' | 'school' | 'period' | 'widget' | 'seat' | 'security'
  | 'calendar' | 'weather' | 'display' | 'sidebar' | 'todo' | 'sync' | 'system' | 'about';

export function SettingsPage() {
  const { track } = useAnalytics();
  const { settings, loaded, load, update } = useSettingsStore();
  const { load: loadEvents } = useEventsStore();

  const [draft, setDraft] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTabId>('school');

  useEffect(() => { load(); loadEvents(); }, [load, loadEvents]);
  useEffect(() => { if (loaded) setDraft(settings); }, [loaded, settings]);

  const patch = useCallback((p: Partial<Settings>) => {
    setDraft((prev) => ({ ...prev, ...p }));
  }, []);

  const showToast = useToastStore((s) => s.show);

  const handleSave = async () => {
    setSaving(true);
    try {
      await update(draft);
      showToast('설정이 저장되었습니다.', 'success');
      track('settings_change', { section: activeTab, key: 'save' });

      // 위젯 설정 변경 시 실행 중인 위젯에 실시간 적용
      if (
        draft.widget.opacity !== settings.widget.opacity ||
        draft.widget.desktopMode !== settings.widget.desktopMode
      ) {
        window.electronAPI?.applyWidgetSettings({
          opacity: draft.widget.opacity,
          desktopMode: draft.widget.desktopMode,
        });
      }

      if (draft.schoolName !== settings.schoolName || draft.schoolLevel !== settings.schoolLevel) {
        const regionMatch = draft.neis.schoolName.match(/\(([^)]+)\)/);
        track('school_set', {
          school: draft.schoolName,
          level: draft.schoolLevel,
          region: regionMatch ? (regionMatch[1] ?? 'unknown') : 'unknown',
        });
      }

      if (draft.className !== settings.className) {
        const gradeMatch = draft.className.match(/(\d+)학년/);
        const classMatch = draft.className.match(/(\d+)반/);
        track('class_set', {
          grade: gradeMatch ? parseInt(gradeMatch[1] ?? '0', 10) : 0,
          classNum: classMatch ? parseInt(classMatch[1] ?? '0', 10) : 0,
          studentCount: 0,
        });
      }
    } catch {
      showToast('설정 저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(settings);
    setShowReset(false);
  };

  if (!loaded) {
    return (
      <div className="-m-8 flex h-[calc(100%+4rem)] items-center justify-center">
        <p className="text-sp-muted">설정을 불러오는 중...</p>
      </div>
    );
  }

  return (
    <SettingsLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      draft={draft}
      patch={patch}
      setDraft={setDraft}
      saving={saving}
      onSave={handleSave}
      onReset={handleReset}
      showReset={showReset}
      setShowReset={setShowReset}
    />
  );
}
