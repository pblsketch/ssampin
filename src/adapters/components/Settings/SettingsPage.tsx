import { useEffect, useState, useCallback, useRef } from 'react';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import type { Settings } from '@domain/entities/Settings';
import { SettingsLayout } from './SettingsLayout';

export type SettingsTabId =
  | 'google'
  | 'school'
  | 'period'
  | 'widget'
  | 'seat'
  | 'security'
  | 'calendar'
  | 'weather'
  | 'display'
  | 'sidebar'
  | 'todo'
  | 'tools'
  | 'shortcuts'
  | 'record-reminder'
  | 'system'
  | 'backup'
  | 'archive'
  | 'ai-bridge'
  | 'about';

interface SettingsPageProps {
  /**
   * 진입 시 활성화할 탭 id. navigateToPage('settings#widget') 같은 형식으로
   * 위젯에서 특정 탭으로 직접 진입한 경우 사용. null/undefined면 기본 'school'.
   * prop이 도중에 바뀌면 따라가도록 useEffect로 sync한다.
   */
  readonly initialTab?: SettingsTabId | null;
}

export function SettingsPage({ initialTab }: SettingsPageProps = {}) {
  const { track } = useAnalytics();
  const { settings, loaded, load, update } = useSettingsStore();
  const { load: loadEvents } = useEventsStore();

  const [draft, setDraft] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab ?? 'school');

  // initialTab prop이 도중에 바뀌면 (cross-window navigate 등) 활성 탭 동기화.
  // 같은 SettingsPage 인스턴스가 살아있는 동안 useState 초기값은 한 번만 적용되므로
  // 동적 동기화는 effect에서 수행한다.
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    load();
    loadEvents();
  }, [load, loadEvents]);
  // 초안(draft)은 최초 로드 완료 시 한 번만 스토어와 맞춘다.
  // 이후 백그라운드 설정 변경(구글 드라이브 동기화 재로드 등)이 저장 안 한 편집을
  // 덮어써 되돌려버리던 문제를 막는다(예: '기록 알림' 토글이 저장 전에 꺼지던 버그).
  // 다른 창/기기의 변경은 설정 화면을 다시 열면 반영된다.
  const draftInitializedRef = useRef(false);
  useEffect(() => {
    if (loaded && !draftInitializedRef.current) {
      draftInitializedRef.current = true;
      setDraft(settings);
    }
  }, [loaded, settings]);

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

      // 위젯 설정 변경 시 실행 중인 위젯에 실시간 적용.
      //
      // 'native-desktop'은 값이 그대로여도 항상 다시 보낸다(2026-08-11 사용자 신고 대응):
      //   바탕화면 붙이기에 실패해 실제로는 일반 모드로 돌아간 상태여도 저장값은 그대로
      //   'native-desktop'일 수 있다. 이때 "값이 같으면 안 보낸다"는 기존 조건 때문에
      //   라디오가 이미 선택돼 있는 사용자는 저장을 눌러도 재시도가 발생하지 않아
      //   영구히 빠져나올 수 없었다. main 쪽에 "같은 모드인데 실제로 안 붙어 있으면 재시도"
      //   가드가 이미 있으므로, 신호만 보내면 중복 적용은 알아서 걸러진다.
      if (
        draft.widget.opacity !== settings.widget.opacity ||
        draft.widget.desktopMode !== settings.widget.desktopMode ||
        draft.widget.desktopMode === 'native-desktop'
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
