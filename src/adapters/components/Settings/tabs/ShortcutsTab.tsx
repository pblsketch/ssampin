import { useMemo, useState } from 'react';
import { useSettingsStore, DEFAULT_SHORTCUTS } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { KeyCaptureInput } from './ShortcutsTab/KeyCaptureInput';

interface CommandRow {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly iconColor: string;
}

const COMMANDS: readonly CommandRow[] = [
  { id: 'quickAdd.todo',         label: '할일 추가',              icon: 'check_circle',   iconColor: 'text-sp-accent' },
  { id: 'quickAdd.event',        label: '일정 추가',              icon: 'event',          iconColor: 'text-sp-highlight' },
  { id: 'quickAdd.memo',         label: '메모 추가',              icon: 'sticky_note_2',  iconColor: 'text-emerald-400' },
  { id: 'quickAdd.note',         label: '노트 새 페이지',          icon: 'description',    iconColor: 'text-violet-400' },
  { id: 'quickAdd.bookmark',     label: '즐겨찾기 추가',          icon: 'bookmark',       iconColor: 'text-amber-400' },
  { id: 'sticker-picker:toggle', label: '내 이모티콘 피커 열기/닫기', icon: 'mood',           iconColor: 'text-pink-400' },
];

export function ShortcutsTab(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings);
  const setShortcut = useSettingsStore((s) => s.setShortcut);
  const toggleGlobal = useSettingsStore((s) => s.toggleGlobalShortcuts);
  const resetShortcuts = useSettingsStore((s) => s.resetShortcuts);
  const showToast = useToastStore((s) => s.show);
  const [confirmReset, setConfirmReset] = useState(false);

  const shortcuts = settings.shortcuts ?? DEFAULT_SHORTCUTS;

  // 중복 검출
  const duplicates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [id, b] of Object.entries(shortcuts.bindings)) {
      if (!b.enabled) continue;
      const key = b.combo;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      void id;
    }
    const dup = new Set<string>();
    for (const [combo, n] of counts.entries()) {
      if (n > 1) dup.add(combo);
    }
    return dup;
  }, [shortcuts.bindings]);

  const handleChangeCombo = async (commandId: string, newCombo: string): Promise<void> => {
    // 다른 커맨드와 중복 체크 (자기 자신 제외)
    const conflict = Object.entries(shortcuts.bindings).find(
      ([id, b]) => id !== commandId && b.enabled && b.combo === newCombo,
    );
    if (conflict) {
      const conflictLabel = COMMANDS.find((c) => c.id === conflict[0])?.label ?? conflict[0];
      showToast(`이미 "${conflictLabel}"에 사용 중인 조합입니다.`, 'error');
      return;
    }
    await setShortcut(commandId, newCombo);
  };

  const handleToggleEnabled = async (commandId: string, enabled: boolean): Promise<void> => {
    const existing = shortcuts.bindings[commandId];
    if (!existing) return;
    await setShortcut(commandId, existing.combo, enabled);
  };

  const handleReset = async (): Promise<void> => {
    await resetShortcuts();
    showToast('단축키를 기본값으로 되돌렸습니다.', 'success');
    setConfirmReset(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-sp-semibold text-sp-text mb-2">단축키</h2>
        <p className="text-sm text-sp-muted">
          앱 어디서든 단축키 한 번으로 빠르게 항목을 추가하세요.
        </p>
      </div>

      <div className="rounded-xl bg-sp-card ring-1 ring-sp-border p-5">
        {/* 글로벌 토글 */}
        <div className="flex items-start justify-between pb-4 border-b border-sp-border/40">
          <div className="flex-1 pr-4">
            <div className="text-sm font-sp-semibold text-sp-text">글로벌 단축키</div>
            <p className="text-xs text-sp-muted mt-0.5">
              켜면 쌤핀이 최소화돼 있어도 단축키가 동작합니다. 다른 앱과 충돌할 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={shortcuts.globalEnabled}
            onClick={() => void toggleGlobal(!shortcuts.globalEnabled)}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
              shortcuts.globalEnabled ? 'bg-sp-accent' : 'bg-sp-border'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                shortcuts.globalEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* 커맨드 행 */}
        <div className="divide-y divide-sp-border/40">
          {COMMANDS.map((cmd) => {
            const binding = shortcuts.bindings[cmd.id] ?? DEFAULT_SHORTCUTS.bindings[cmd.id]!;
            const isDuplicate = duplicates.has(binding.combo);
            return (
              <div key={cmd.id} className="flex items-center gap-3 h-14">
                {/* 좌측: 개별 토글 + 아이콘 + 라벨 */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={binding.enabled}
                  aria-label={`${cmd.label} 단축키 활성화`}
                  onClick={() => void handleToggleEnabled(cmd.id, !binding.enabled)}
                  className={`w-3 h-3 rounded-full transition-colors flex-shrink-0 ${
                    binding.enabled ? 'bg-sp-accent' : 'bg-sp-border'
                  }`}
                />
                <span className={`material-symbols-outlined text-icon-md ${binding.enabled ? cmd.iconColor : 'text-sp-muted'}`}>
                  {cmd.icon}
                </span>
                <span className={`text-sm font-sp-medium ${binding.enabled ? 'text-sp-text' : 'text-sp-muted line-through'}`}>
                  {cmd.label}
                </span>

                {/* 우측: 키 캡처 + 상태 배지 */}
                <div className="ml-auto flex items-center gap-2">
                  {isDuplicate && (
                    <span className="text-detail font-sp-medium px-2 py-0.5 rounded-full bg-red-500/15 text-red-300">
                      중복
                    </span>
                  )}
                  <KeyCaptureInput
                    combo={binding.combo}
                    onChange={(c) => void handleChangeCombo(cmd.id, c)}
                    disabled={!binding.enabled}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* 리셋 */}
        <div className="flex justify-end pt-4 border-t border-sp-border/40">
          {confirmReset ? (
            <div className="flex items-center gap-2 text-xs text-sp-muted">
              기본값으로 되돌릴까요?
              <button
                type="button"
                onClick={() => void handleReset()}
                className="text-sp-accent font-sp-semibold hover:underline"
              >
                예
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="text-sp-muted hover:text-sp-text"
              >
                아니오
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="text-xs text-sp-muted hover:text-sp-text transition-colors"
            >
              기본값으로 되돌리기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
