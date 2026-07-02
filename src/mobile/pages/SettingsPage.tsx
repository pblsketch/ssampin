import { useEffect, useState } from 'react';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { useMobileHomeLayoutStore, type HomeCardId } from '@mobile/stores/useMobileHomeLayoutStore';
import { Toggle } from '@mobile/components/common/Toggle';
import { PeriodTimesEditor } from '@mobile/components/Settings/PeriodTimesEditor';
import { SyncStatus } from '@mobile/components/More/SyncStatus';

interface Props {
  onBack: () => void;
}

type ThemeValue = 'system' | 'light' | 'dark';

const themeOptions: { value: ThemeValue; label: string; icon: string }[] = [
  { value: 'system', label: '시스템 설정', icon: 'brightness_auto' },
  { value: 'light', label: '라이트', icon: 'light_mode' },
  { value: 'dark', label: '다크', icon: 'dark_mode' },
];

const HOME_CARD_OPTIONS: { id: HomeCardId; label: string; icon: string }[] = [
  { id: 'currentClass', label: '현재 교시', icon: 'schedule' },
  { id: 'homeroomAttendance', label: '담임 출결 요약', icon: 'groups' },
  { id: 'classAttendance', label: '수업 출결 요약', icon: 'co_present' },
  { id: 'weather', label: '날씨', icon: 'partly_cloudy_day' },
  { id: 'meal', label: '급식 정보', icon: 'restaurant' },
];

export function SettingsPage({ onBack }: Props) {
  const { settings, loaded, load, updateSettings } = useMobileSettingsStore();
  const [theme, setTheme] = useState<ThemeValue>(
    () => (localStorage.getItem('ssampin-mobile-theme') as ThemeValue | null) ?? 'system',
  );

  // 기본 정보 편집 (학교/교사/담임 학급)
  const [editSchool, setEditSchool] = useState('');
  const [editTeacher, setEditTeacher] = useState('');
  const [editClass, setEditClass] = useState('');
  const [infoSaved, setInfoSaved] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loaded) {
      setEditSchool(settings.schoolName);
      setEditTeacher(settings.teacherName);
      setEditClass(settings.className);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const infoDirty =
    editSchool !== settings.schoolName ||
    editTeacher !== settings.teacherName ||
    editClass !== settings.className;

  const handleSaveInfo = async () => {
    if (editClass.trim() !== settings.className) {
      const ok = window.confirm(
        '담임 학급을 바꾸면 명단·출결 데이터 매핑이 달라질 수 있어요. 계속할까요?',
      );
      if (!ok) return;
    }
    await updateSettings({
      schoolName: editSchool.trim(),
      teacherName: editTeacher.trim(),
      className: editClass.trim(),
    });
    setInfoSaved(true);
  };

  const handleThemeChange = (value: ThemeValue) => {
    setTheme(value);
    localStorage.setItem('ssampin-mobile-theme', value);
    window.dispatchEvent(new Event('theme-changed'));
  };

  const hiddenCards = useMobileHomeLayoutStore((s) => s.hiddenCards);
  const setHidden = useMobileHomeLayoutStore((s) => s.setHidden);

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <header className="glass-header flex items-center gap-3 px-4 py-3 shrink-0">
        <button onClick={onBack} className="flex items-center justify-center w-10 h-10">
          <span className="material-symbols-outlined text-sp-text">arrow_back</span>
        </button>
        <h2 className="flex-1 text-sp-text font-bold text-base">설정</h2>
      </header>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 기본 정보 (모바일에서 편집 가능) */}
        <section>
          <h3 className="text-sp-muted text-xs font-semibold uppercase tracking-wider mb-2 px-1">
            기본 정보
          </h3>
          <div className="glass-card px-4 py-3 space-y-3">
            {!loaded ? (
              <div className="flex items-center justify-center py-5">
                <span className="material-symbols-outlined text-sp-muted text-2xl animate-spin">
                  progress_activity
                </span>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sp-muted text-xs mb-1">학교</label>
                  <input
                    value={editSchool}
                    onChange={(e) => {
                      setEditSchool(e.target.value);
                      setInfoSaved(false);
                    }}
                    placeholder="학교명"
                    className="w-full glass-input text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sp-muted text-xs mb-1">교사</label>
                  <input
                    value={editTeacher}
                    onChange={(e) => {
                      setEditTeacher(e.target.value);
                      setInfoSaved(false);
                    }}
                    placeholder="교사명"
                    className="w-full glass-input text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sp-muted text-xs mb-1">담임 학급</label>
                  <input
                    value={editClass}
                    onChange={(e) => {
                      setEditClass(e.target.value);
                      setInfoSaved(false);
                    }}
                    placeholder="예: 3-2"
                    className="w-full glass-input text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleSaveInfo()}
                  disabled={!infoDirty}
                  className="h-10 w-full rounded-lg bg-sp-accent text-sm font-medium text-sp-accent-fg transition-transform active:scale-[0.98] disabled:opacity-40"
                >
                  {infoSaved && !infoDirty ? '저장됨 ✓' : '저장'}
                </button>
              </>
            )}
          </div>
        </section>

        {/* 교시 시간 */}
        <section>
          <h3 className="text-sp-muted text-xs font-semibold uppercase tracking-wider mb-2 px-1">
            교시 시간
          </h3>
          {loaded ? (
            <PeriodTimesEditor
              key={settings.periodTimes.map((p) => `${p.start}-${p.end}`).join('|')}
              initial={settings.periodTimes}
              onSave={(pt) => void updateSettings({ periodTimes: pt })}
            />
          ) : (
            <div className="glass-card flex items-center justify-center py-5">
              <span className="material-symbols-outlined text-sp-muted text-2xl animate-spin">
                progress_activity
              </span>
            </div>
          )}
        </section>

        {/* 테마 */}
        <section>
          <h3 className="text-sp-muted text-xs font-semibold uppercase tracking-wider mb-2 px-1">
            테마
          </h3>
          <div className="glass-card px-4 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              {themeOptions.map((option) => {
                const isSelected = theme === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => handleThemeChange(option.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                      isSelected
                        ? 'bg-sp-accent/15 border-sp-accent/40 text-sp-accent'
                        : 'bg-transparent border-black/10 dark:border-white/10 text-sp-muted'
                    }`}
                  >
                    <span className="material-symbols-outlined text-icon">{option.icon}</span>
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 홈 화면 카드 표시 */}
        <section>
          <h3 className="text-sp-muted text-xs font-semibold uppercase tracking-wider mb-2 px-1">
            홈 화면 카드 표시
          </h3>
          <div className="glass-card px-4">
            {HOME_CARD_OPTIONS.map((card) => {
              const visible = hiddenCards[card.id] !== true;
              return (
                <div
                  key={card.id}
                  className="flex items-center gap-3 py-3 border-b border-black/5 dark:border-white/5 last:border-b-0"
                >
                  <span className="material-symbols-outlined text-sp-muted text-icon-lg shrink-0">
                    {card.icon}
                  </span>
                  <span className="flex-1 text-sp-text text-sm">{card.label}</span>
                  <Toggle
                    checked={visible}
                    onChange={(next) => setHidden(card.id, !next)}
                    label={`${card.label} 표시`}
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* 구글 드라이브 동기화 */}
        <section>
          <h3 className="text-sp-muted text-xs font-semibold uppercase tracking-wider mb-2 px-1">
            구글 드라이브 동기화
          </h3>
          <SyncStatus />
        </section>

        {/* 앱 정보 */}
        <section>
          <h3 className="text-sp-muted text-xs font-semibold uppercase tracking-wider mb-2 px-1">
            앱 정보
          </h3>
          <div className="glass-card px-4">
            <div className="flex items-center gap-3 py-3 border-b border-black/5 dark:border-white/5">
              <span className="material-symbols-outlined text-sp-muted text-icon-lg">info</span>
              <div className="flex-1">
                <p className="text-sp-muted text-xs mb-0.5">버전</p>
                <p className="text-sp-text text-sm font-medium">쌤핀 모바일 v2.2.7</p>
              </div>
            </div>
            <div className="py-3">
              <p className="text-sp-muted text-xs leading-relaxed">
                그 외 상세 설정(시간표·좌석배치 등)은 데스크톱 앱에서 변경할 수 있습니다.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
