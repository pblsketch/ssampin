import { useState, useEffect, useCallback, useRef } from 'react';
import { useClassRosterStore } from '@adapters/stores/useClassRosterStore';

interface ClassRosterSelectorProps {
  selectedRosterId: string | null;
  onSelectRoster: (id: string | null) => void;
  excludedNames: Set<string>;
  onToggleExclusion: (name: string) => void;
  pickedItems: string[];
}

type EditorMode = 'idle' | 'creating' | 'editing';

export function ClassRosterSelector({
  selectedRosterId,
  onSelectRoster,
  excludedNames,
  onToggleExclusion,
  pickedItems,
}: ClassRosterSelectorProps) {
  const { rosters, loaded, load, addRoster, updateRoster, deleteRoster } = useClassRosterStore();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('idle');
  const [editorName, setEditorName] = useState('');
  const [editorText, setEditorText] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isDropdownOpen]);

  // If selected roster was deleted externally, reset
  useEffect(() => {
    if (selectedRosterId && !rosters.find((r) => r.id === selectedRosterId)) {
      onSelectRoster(null);
    }
  }, [rosters, selectedRosterId, onSelectRoster]);

  const selectedRoster = rosters.find((r) => r.id === selectedRosterId) ?? null;

  const handleSelect = useCallback((id: string) => {
    onSelectRoster(id);
    setIsDropdownOpen(false);
  }, [onSelectRoster]);

  const handleStartCreate = useCallback(() => {
    setEditorName('');
    setEditorText('');
    setEditorMode('creating');
  }, []);

  const handleStartEdit = useCallback(() => {
    if (!selectedRoster) return;
    setEditorName(selectedRoster.name);
    setEditorText(selectedRoster.studentNames.join('\n'));
    setEditorMode('editing');
  }, [selectedRoster]);

  const handleSave = useCallback(async () => {
    const name = editorName.trim();
    if (!name) return;

    const studentNames = editorText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (editorMode === 'creating') {
      const created = await addRoster(name, studentNames);
      onSelectRoster(created.id);
    } else if (editorMode === 'editing' && selectedRosterId) {
      await updateRoster(selectedRosterId, name, studentNames);
    }
    setEditorMode('idle');
  }, [editorMode, editorName, editorText, addRoster, updateRoster, selectedRosterId, onSelectRoster]);

  const handleDelete = useCallback(async () => {
    if (!selectedRosterId) return;
    await deleteRoster(selectedRosterId);
    onSelectRoster(null);
    setShowDeleteConfirm(false);
  }, [selectedRosterId, deleteRoster, onSelectRoster]);

  const handleCancelEditor = useCallback(() => {
    setEditorMode('idle');
  }, []);

  const editorStudentCount = editorText
    .split('\n')
    .filter((l) => l.trim().length > 0).length;

  // --- Editor Modal ---
  if (editorMode !== 'idle') {
    return (
      <div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-sp-muted mb-1 block">반 이름</label>
            <input
              type="text"
              value={editorName}
              onChange={(e) => setEditorName(e.target.value)}
              placeholder="예: 1학년 3반"
              maxLength={20}
              autoFocus
              className="w-full px-3 py-2 rounded-lg bg-sp-surface border border-sp-border text-white text-sm placeholder-sp-muted/50 focus:outline-none focus:border-sp-accent"
            />
          </div>
          <div>
            <label className="text-xs text-sp-muted mb-1 block">학생 명단 (한 줄에 한 명)</label>
            <textarea
              value={editorText}
              onChange={(e) => setEditorText(e.target.value)}
              placeholder={'학생 이름을 한 줄에 하나씩 입력\n\n엑셀에서 복사-붙여넣기도 가능합니다'}
              className="w-full h-32 px-3 py-2 rounded-lg bg-sp-surface border border-sp-border text-white text-sm placeholder-sp-muted/50 resize-none focus:outline-none focus:border-sp-accent"
            />
            <div className="mt-1 text-xs text-sp-muted">
              {editorStudentCount}명
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={handleCancelEditor}
              className="px-4 py-2 rounded-lg border border-sp-border text-sp-muted hover:text-white text-sm transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={!editorName.trim()}
              className="px-4 py-2 rounded-lg bg-sp-accent text-white text-sm font-medium disabled:opacity-40 transition-colors"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Main UI ---
  return (
    <div>
      {/* Header: dropdown + action buttons */}
      <div className="flex items-center gap-2 mb-3">
        {/* Roster Dropdown */}
        <div className="relative flex-1" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-sp-surface border border-sp-border text-sm hover:border-sp-accent transition-all"
          >
            <span className={selectedRoster ? 'text-white' : 'text-sp-muted'}>
              {selectedRoster
                ? `${selectedRoster.name} (${selectedRoster.studentNames.length}명)`
                : '반을 선택하세요'}
            </span>
            <span className="material-symbols-outlined text-[16px] text-sp-muted">
              {isDropdownOpen ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {isDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-sp-card border border-sp-border rounded-xl shadow-2xl z-50 py-1 max-h-48 overflow-y-auto">
              {rosters.length === 0 ? (
                <div className="px-3 py-3 text-xs text-sp-muted text-center">
                  등록된 반이 없습니다
                </div>
              ) : (
                rosters.map((roster) => (
                  <button
                    key={roster.id}
                    onClick={() => handleSelect(roster.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 text-left transition-colors ${
                      roster.id === selectedRosterId ? 'bg-sp-accent/10' : ''
                    }`}
                  >
                    <span className="text-sm text-sp-text truncate">{roster.name}</span>
                    <span className="text-[10px] text-sp-muted ml-2 shrink-0">
                      {roster.studentNames.length}명
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <button
          onClick={handleStartCreate}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-sp-surface border border-sp-border text-sp-text text-xs font-medium hover:border-sp-accent transition-all shrink-0"
          title="새 반 등록"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
          <span>새 반</span>
        </button>
        {selectedRoster && (
          <>
            <button
              onClick={handleStartEdit}
              className="p-2 rounded-lg bg-sp-surface border border-sp-border text-sp-muted hover:text-white hover:border-sp-accent transition-all shrink-0"
              title="명단 수정"
            >
              <span className="material-symbols-outlined text-[14px]">edit</span>
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 rounded-lg bg-sp-surface border border-sp-border text-sp-muted hover:text-red-400 hover:border-red-400/40 transition-all shrink-0"
              title="반 삭제"
            >
              <span className="material-symbols-outlined text-[14px]">delete</span>
            </button>
          </>
        )}
      </div>

      {/* Student Grid */}
      {selectedRoster ? (
        <div>
          {selectedRoster.studentNames.length === 0 ? (
            <div className="text-center py-4 text-sp-muted text-sm">
              학생이 등록되지 않았습니다. ✏️ 버튼으로 명단을 추가하세요.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
              {selectedRoster.studentNames.map((name, idx) => {
                const isExcluded = excludedNames.has(name);
                const isPicked = pickedItems.includes(name);
                return (
                  <button
                    key={`${name}-${idx}`}
                    onClick={() => onToggleExclusion(name)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      isExcluded
                        ? 'bg-sp-surface text-sp-muted/50 line-through border border-sp-border/50'
                        : isPicked
                          ? 'bg-sp-surface text-sp-muted line-through border border-sp-border'
                          : 'bg-sp-accent/10 text-sp-accent border border-sp-accent/30 hover:bg-sp-accent/20'
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
          {selectedRoster.studentNames.length > 0 && (
            <div className="mt-2 text-xs text-sp-muted text-center">
              클릭하여 제외/포함 ({selectedRoster.studentNames.length - excludedNames.size}명 참여)
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-4 text-sp-muted text-sm">
          {rosters.length === 0
            ? '아직 등록된 반이 없습니다. [+ 새 반] 버튼으로 시작하세요.'
            : '위 드롭다운에서 반을 선택하세요.'}
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-sp-card border border-sp-border rounded-2xl p-5 w-72">
            <h3 className="text-sm font-bold text-white mb-2">반 삭제</h3>
            <p className="text-xs text-sp-muted mb-4">
              &apos;{selectedRoster?.name}&apos; 명단을 삭제할까요?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 rounded-lg border border-sp-border text-sp-muted hover:text-white text-sm transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 text-sm font-medium hover:bg-red-500/30 transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
