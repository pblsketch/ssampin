import { useEffect, useState } from 'react';
import { useNeisScheduleStore } from '@adapters/stores/useNeisScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';

/* ─── Toggle Switch (설정 페이지와 동일한 스타일) ─── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${checked ? 'bg-sp-accent' : 'bg-sp-border'}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

export function NeisScheduleSection() {
  const { settings, syncStatus, lastSyncResult, errorMessage, loadSettings, updateSettings, syncNow, toggleEnabled } = useNeisScheduleStore();
  const appSettings = useSettingsStore((s) => s.settings);
  const { show: showToast } = useToastStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // NEIS 학교 정보 확인
  const hasSchoolInfo = Boolean(appSettings.neis.atptCode && appSettings.neis.schoolCode);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleToggle = async (enabled: boolean) => {
    if (enabled && !hasSchoolInfo) {
      showToast('먼저 학교를 검색해주세요.', 'error');
      return;
    }

    if (!enabled && settings.syncedCount > 0) {
      setShowDeleteConfirm(true);
      return;
    }

    await toggleEnabled(enabled);
    if (enabled) {
      showToast('학사일정 동기화를 시작합니다.', 'info');
    }
  };

  const handleDisableWithDelete = async () => {
    setShowDeleteConfirm(false);
    const { removeAllNeisEvents } = useNeisScheduleStore.getState();
    await removeAllNeisEvents();
    await toggleEnabled(false);
    showToast('NEIS 학사일정이 삭제되었습니다.', 'info');
  };

  const handleDisableKeep = async () => {
    setShowDeleteConfirm(false);
    await toggleEnabled(false);
    showToast('동기화를 중지했습니다. 기존 일정은 유지됩니다.', 'info');
  };

  const handleSyncNow = async () => {
    if (!hasSchoolInfo) {
      showToast('먼저 학교를 검색해주세요.', 'error');
      return;
    }

    const result = await syncNow();
    if (result) {
      showToast(`${result.total}건 동기화 완료 (추가: ${result.added}, 업데이트: ${result.updated})`, 'success');
    } else if (errorMessage) {
      showToast(errorMessage, 'error');
    }
  };

  const handleGradeFilterChange = (grade: number) => {
    const current = [...settings.gradeFilter];
    const idx = current.indexOf(grade);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(grade);
    }
    void updateSettings({ gradeFilter: current });
  };

  const isGradeChecked = (grade: number) => {
    return settings.gradeFilter.length === 0 || settings.gradeFilter.includes(grade);
  };

  // 마지막 동기화 시간 포맷
  const formatSyncTime = (iso: string | null): string => {
    if (!iso) return '동기화한 적 없음';
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  };

  return (
    <section className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
          <span className="material-symbols-outlined">calendar_month</span>
        </div>
        <h3 className="text-lg font-bold text-sp-text">NEIS 학사일정</h3>
      </div>

      <div className="space-y-5">
        {/* 메인 토글 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-sp-text">학사일정 자동 동기화</p>
            <p className="text-xs text-sp-muted mt-0.5">
              NEIS에서 학교 학사일정을 자동으로 가져옵니다
            </p>
          </div>
          <Toggle checked={settings.enabled} onChange={handleToggle} />
        </div>

        {/* OFF 시 안내 */}
        {!settings.enabled && !hasSchoolInfo && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
            <span className="material-symbols-outlined text-yellow-500 text-[18px] mt-0.5">info</span>
            <p className="text-xs text-yellow-200/80">
              먼저 위의 &quot;학교/학급 정보&quot; 섹션에서 학교를 검색해주세요.
            </p>
          </div>
        )}

        {/* ON 시 상세 설정 */}
        {settings.enabled && (
          <>
            {/* 동기화 상태 */}
            <div className="p-4 rounded-lg bg-sp-surface/60 border border-sp-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {syncStatus === 'syncing' ? (
                    <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  ) : syncStatus === 'error' ? (
                    <span className="material-symbols-outlined text-red-400 text-[18px]">error</span>
                  ) : settings.lastSyncAt ? (
                    <span className="material-symbols-outlined text-green-400 text-[18px]">check_circle</span>
                  ) : (
                    <span className="material-symbols-outlined text-sp-muted text-[18px]">sync</span>
                  )}
                  <div>
                    <p className="text-xs text-sp-muted">마지막 동기화</p>
                    <p className="text-sm text-sp-text font-medium">
                      {syncStatus === 'syncing' ? '동기화 중...' : formatSyncTime(settings.lastSyncAt)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-sp-muted">동기화된 일정</p>
                  <p className="text-sm text-sp-text font-bold">{settings.syncedCount}건</p>
                </div>
              </div>

              {/* 에러 메시지 */}
              {syncStatus === 'error' && errorMessage && (
                <p className="text-xs text-red-400 bg-red-500/10 rounded-md px-3 py-2">
                  {errorMessage}
                </p>
              )}

              {/* 마지막 동기화 결과 */}
              {lastSyncResult && syncStatus === 'success' && (
                <p className="text-xs text-green-400 bg-green-500/10 rounded-md px-3 py-2">
                  추가 {lastSyncResult.added}건 · 업데이트 {lastSyncResult.updated}건 · 스킵 {lastSyncResult.skipped}건
                </p>
              )}

              {/* 동기화 버튼 */}
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={syncStatus === 'syncing'}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 hover:bg-purple-500/20 text-sm font-medium transition-all disabled:opacity-50"
              >
                {syncStatus === 'syncing' ? (
                  <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-[18px]">sync</span>
                )}
                {syncStatus === 'syncing' ? '동기화 중...' : '지금 동기화'}
              </button>
            </div>

            {/* 표시 설정 */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-sp-muted uppercase tracking-wider">표시 설정</p>

              {/* 학년 필터 */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-sp-text">학년 필터</p>
                <div className="flex items-center gap-2">
                  {[1, 2, 3].map((grade) => (
                    <label key={grade} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isGradeChecked(grade)}
                        onChange={() => handleGradeFilterChange(grade)}
                        className="w-3.5 h-3.5 rounded border-sp-border bg-sp-bg text-purple-500 focus:ring-purple-500"
                      />
                      <span className="text-xs text-sp-text">{grade}학년</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 공휴일 표시 */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-sp-text">공휴일 표시</p>
                <Toggle
                  checked={settings.showHolidays}
                  onChange={(v) => void updateSettings({ showHolidays: v })}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* 삭제 확인 다이얼로그 */}
      {showDeleteConfirm && (
        <>
          <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-sp-card rounded-xl border border-sp-border shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
              <h4 className="text-base font-bold text-sp-text mb-2">학사일정 동기화 해제</h4>
              <p className="text-sm text-sp-muted mb-5">
                기존에 가져온 학사일정({settings.syncedCount}건)을 삭제하시겠습니까?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDisableKeep}
                  className="flex-1 rounded-lg border border-sp-border px-3 py-2 text-sm font-medium text-sp-muted hover:bg-sp-surface transition-all"
                >
                  일정 유지
                </button>
                <button
                  type="button"
                  onClick={handleDisableWithDelete}
                  className="flex-1 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-all"
                >
                  일정 삭제
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
