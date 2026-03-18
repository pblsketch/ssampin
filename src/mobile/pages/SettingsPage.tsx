import { useEffect } from 'react';
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
    <div className="flex items-center gap-3 py-3 border-b border-sp-border last:border-b-0">
      <span className="material-symbols-outlined text-sp-muted text-[20px] shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sp-muted text-xs mb-0.5">{label}</p>
        <p className="text-sp-text text-sm font-medium truncate">
          {value || <span className="text-sp-muted italic">미설정</span>}
        </p>
      </div>
    </div>
  );
}

export function SettingsPage({ onBack }: Props) {
  const { settings, loaded, load } = useMobileSettingsStore();

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col h-full bg-sp-bg">
      {/* 헤더 */}
      <header className="flex items-center gap-3 px-4 py-3 bg-sp-surface border-b border-sp-border shrink-0">
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
          <div className="bg-sp-card rounded-xl px-4">
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

        {/* 동기화 */}
        <section>
          <h3 className="text-sp-muted text-xs font-semibold uppercase tracking-wider mb-2 px-1">
            동기화
          </h3>
          <SyncStatus />
        </section>

        {/* 앱 정보 */}
        <section>
          <h3 className="text-sp-muted text-xs font-semibold uppercase tracking-wider mb-2 px-1">
            앱 정보
          </h3>
          <div className="bg-sp-card rounded-xl px-4">
            <div className="flex items-center gap-3 py-3 border-b border-sp-border">
              <span className="material-symbols-outlined text-sp-muted text-[20px]">info</span>
              <div className="flex-1">
                <p className="text-sp-muted text-xs mb-0.5">버전</p>
                <p className="text-sp-text text-sm font-medium">쌤핀 모바일 v0.5.0</p>
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
