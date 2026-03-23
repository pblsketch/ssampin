import { useState, useEffect } from 'react';
import { useNeisScheduleStore } from '@adapters/stores/useNeisScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { getGradeList } from '@domain/entities/NeisSchedule';

/* ─── Toggle Switch ─── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${checked ? 'bg-purple-500' : 'bg-sp-border'}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NeisSchedulePanel({ open, onClose }: Props) {
  const {
    settings,
    syncStatus,
    lastSyncResult,
    errorMessage,
    loadSettings,
    updateSettings,
    syncNow,
    toggleEnabled,
  } = useNeisScheduleStore();
  const appSettings = useSettingsStore((s) => s.settings);
  const { show: showToast } = useToastStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const hasSchoolInfo = Boolean(appSettings.neis.atptCode && appSettings.neis.schoolCode);
  const schoolName = appSettings.neis.schoolName ?? '';

  useEffect(() => {
    if (open) void loadSettings();
  }, [open, loadSettings]);

  const handleToggle = async (enabled: boolean) => {
    if (enabled && !hasSchoolInfo) {
      showToast('먼저 설정에서 학교를 검색해주세요.', 'error');
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
      showToast('먼저 설정에서 학교를 검색해주세요.', 'error');
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

  const isGradeChecked = (grade: number) =>
    settings.gradeFilter.length === 0 || settings.gradeFilter.includes(grade);

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

  if (!open) return null;

  return (
    <>
      {/* 배경 오버레이 */}
      <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* 패널 (우측 슬라이드) */}
      <div className="fixed inset-y-0 right-0 z-[60] w-full max-w-sm flex flex-col bg-sp-card border-l border-sp-border shadow-2xl animate-slide-in-right">
        {/* 헤더 */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-sp-border">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-purple-500/10">
              <span className="material-symbols-outlined text-purple-400 text-icon-lg">school</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-sp-text">NEIS 학사일정</h3>
              {schoolName && (
                <p className="text-detail text-sp-muted">{schoolName}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
          >
            <span className="material-symbols-outlined text-icon-lg">close</span>
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* 활성화 토글 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-sp-text">학사일정 동기화</p>
              <p className="text-detail text-sp-muted mt-0.5">
                NEIS에서 학교 학사일정을 가져옵니다
              </p>
            </div>
            <Toggle checked={settings.enabled} onChange={(v) => void handleToggle(v)} />
          </div>

          {/* 학교 미설정 안내 */}
          {!hasSchoolInfo && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
              <span className="material-symbols-outlined text-yellow-500 text-icon mt-0.5">info</span>
              <p className="text-detail text-yellow-200/80">
                설정 → 학교/학급 정보에서 학교를 먼저 검색해주세요.
              </p>
            </div>
          )}

          {/* 동기화 상태 & 컨트롤 (ON일 때) */}
          {settings.enabled && (
            <>
              {/* 동기화 상태 카드 */}
              <div className="p-4 rounded-xl bg-sp-surface/60 border border-sp-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    {syncStatus === 'syncing' ? (
                      <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                    ) : syncStatus === 'error' ? (
                      <span className="material-symbols-outlined text-red-400 text-icon-md">error</span>
                    ) : settings.lastSyncAt ? (
                      <span className="material-symbols-outlined text-green-400 text-icon-md">check_circle</span>
                    ) : (
                      <span className="material-symbols-outlined text-sp-muted text-icon-md">sync</span>
                    )}
                    <div>
                      <p className="text-detail text-sp-muted">마지막 동기화</p>
                      <p className="text-sm text-sp-text font-medium">
                        {syncStatus === 'syncing' ? '동기화 중...' : formatSyncTime(settings.lastSyncAt)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-detail text-sp-muted">일정 수</p>
                    <p className="text-sm text-sp-text font-bold">{settings.syncedCount}건</p>
                  </div>
                </div>

                {/* 에러 */}
                {syncStatus === 'error' && errorMessage && (
                  <p className="text-detail text-red-400 bg-red-500/10 rounded-md px-3 py-2">
                    {errorMessage}
                  </p>
                )}

                {/* 성공 결과 */}
                {lastSyncResult && syncStatus === 'success' && (
                  <p className="text-detail text-green-400 bg-green-500/10 rounded-md px-3 py-2">
                    추가 {lastSyncResult.added}건 · 업데이트 {lastSyncResult.updated}건 · 스킵 {lastSyncResult.skipped}건
                  </p>
                )}

                {/* 동기화 버튼 */}
                <button
                  type="button"
                  onClick={() => void handleSyncNow()}
                  disabled={syncStatus === 'syncing'}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 hover:bg-purple-500/20 text-sm font-medium transition-all disabled:opacity-50"
                >
                  {syncStatus === 'syncing' ? (
                    <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span className="material-symbols-outlined text-icon-md">sync</span>
                  )}
                  {syncStatus === 'syncing' ? '동기화 중...' : '지금 동기화'}
                </button>
              </div>

              {/* 표시 설정 */}
              <div className="space-y-3">
                <p className="text-detail font-semibold text-sp-muted uppercase tracking-wider">표시 설정</p>

                {/* 학년 필터 */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-sp-text">학년 필터</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {getGradeList(appSettings.schoolLevel).map((grade) => (
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

        {/* 하단 안내 */}
        <div className="shrink-0 px-5 py-3 border-t border-sp-border">
          <p className="text-caption text-sp-muted text-center">
            나이스 교육정보 개방 포털 데이터 활용
          </p>
        </div>
      </div>

      {/* 삭제 확인 다이얼로그 */}
      {showDeleteConfirm && (
        <>
          <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-sp-card rounded-xl border border-sp-border shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
              <h4 className="text-base font-bold text-sp-text mb-2">학사일정 동기화 해제</h4>
              <p className="text-sm text-sp-muted mb-5">
                기존에 가져온 학사일정({settings.syncedCount}건)을 삭제하시겠습니까?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleDisableKeep()}
                  className="flex-1 rounded-lg border border-sp-border px-3 py-2 text-sm font-medium text-sp-muted hover:bg-sp-surface transition-all"
                >
                  일정 유지
                </button>
                <button
                  type="button"
                  onClick={() => void handleDisableWithDelete()}
                  className="flex-1 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-all"
                >
                  일정 삭제
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
