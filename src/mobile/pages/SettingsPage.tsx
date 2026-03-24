import { useEffect, useState } from 'react';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { SyncStatus } from '@mobile/components/More/SyncStatus';

interface Props {
  onBack: () => void;
}

interface InfoRowProps {
  label: string;
  value: string;
  icon: string;
}

function InfoRow({ label, value, icon }: InfoRowProps) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-black/5 dark:border-white/5 last:border-b-0">
      <span className="material-symbols-outlined text-sp-muted text-icon-lg shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sp-muted text-xs mb-0.5">{label}</p>
        <p className="text-sp-text text-sm font-medium truncate">
          {value || <span className="text-sp-muted italic">미설정</span>}
        </p>
      </div>
    </div>
  );
}

type ThemeValue = 'system' | 'light' | 'dark';

const themeOptions: { value: ThemeValue; label: string; icon: string }[] = [
  { value: 'system', label: '시스템 설정', icon: 'brightness_auto' },
  { value: 'light', label: '라이트', icon: 'light_mode' },
  { value: 'dark', label: '다크', icon: 'dark_mode' },
];

export function SettingsPage({ onBack }: Props) {
  const { settings, loaded, load } = useMobileSettingsStore();
  const [theme, setTheme] = useState<ThemeValue>(
    () => (localStorage.getItem('ssampin-mobile-theme') as ThemeValue | null) ?? 'system'
  );

  useEffect(() => {
    void load();
  }, [load]);

  const handleThemeChange = (value: ThemeValue) => {
    setTheme(value);
    localStorage.setItem('ssampin-mobile-theme', value);
    window.dispatchEvent(new Event('theme-changed'));
  };

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <header className="glass-header flex items-center gap-3 px-4 py-3 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-10 h-10"
        >
          <span className="material-symbols-outlined text-sp-text">arrow_back</span>
        </button>
        <h2 className="flex-1 text-sp-text font-bold text-base">설정</h2>
      </header>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 기본 정보 */}
        <section>
          <h3 className="text-sp-muted text-xs font-semibold uppercase tracking-wider mb-2 px-1">
            기본 정보
          </h3>
          <div className="glass-card px-4">
            {!loaded ? (
              <div className="flex items-center justify-center py-8">
                <span className="material-symbols-outlined text-sp-muted text-2xl animate-spin">
                  progress_activity
                </span>
              </div>
            ) : (
              <>
                <InfoRow
                  label="학교"
                  value={settings.schoolName}
                  icon="school"
                />
                <InfoRow
                  label="교사"
                  value={settings.teacherName}
                  icon="person"
                />
                <InfoRow
                  label="학급"
                  value={settings.className}
                  icon="class"
                />
              </>
            )}
          </div>
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
                <p className="text-sp-text text-sm font-medium">쌤핀 모바일 v1.6.4</p>
              </div>
            </div>
            <div className="py-3">
              <p className="text-sp-muted text-xs leading-relaxed">
                데스크톱 앱에서 상세 설정을 변경할 수 있습니다.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
