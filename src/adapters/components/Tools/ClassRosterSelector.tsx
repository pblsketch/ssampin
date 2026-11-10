import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useClassRosterStore } from '@adapters/stores/useClassRosterStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { isStudentActive } from '@domain/rules/studentActivity';
import { filterActiveClasses } from '@domain/rules/teachingClassArchive';

interface ClassRosterSelectorProps {
  selectedRosterId: string | null;
  onSelectRoster: (id: string | null) => void;
  excludedNames: Set<string>;
  onToggleExclusion: (name: string) => void;
  pickedItems: string[];
}

type EditorMode = 'idle' | 'creating' | 'editing';

const TC_PREFIX = 'tc:';

export function ClassRosterSelector({
  selectedRosterId,
  onSelectRoster,
  excludedNames,
  onToggleExclusion,
  pickedItems,
}: ClassRosterSelectorProps) {
  const { rosters, loaded, load, addRoster, updateRoster, deleteRoster } = useClassRosterStore();
  const teachingClasses = useTeachingClassStore((s) => s.classes);
  // 선택지 열거는 활성 반만 — 저장된 "tc:<id>" 선택의 해석(find)은 전체 목록 유지(보관 후에도 빈 명렬 금지)
  const selectableClasses = filterActiveClasses(teachingClasses);
  const tcLoaded = useTeachingClassStore((s) => s.loaded);
  const loadTc = useTeachingClassStore((s) => s.load);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('idle');
  const [editorName, setEditorName] = useState('');
  const [editorText, setEditorText] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [listPos, setListPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  // 반 목록은 화면 맨 바깥(body)에 그리고 위치를 직접 잡는다. 누른 자리 안쪽에 그리면 유리 효과가
  // 켜졌을 때 이 카드의 층에 갇혀, 목록 아래쪽이 **아래 카드 뒤로** 들어가 누를 수 없었다
  // (2026-09-29 신고 — 랜덤뽑기에서 반이 많으면 아래 목록을 고를 수 없음).
  const updateListPos = useCallback(() => {
    const trigger = dropdownRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 4;
    const maxListHeight = 224; // 예전 max-h-56 과 같은 높이
    const spaceBelow = window.innerHeight - rect.bottom - margin * 2;
    const spaceAbove = rect.top - margin * 2;
    // 아래가 너무 좁고 위가 더 넓으면 위로 연다.
    const openUp = spaceBelow < 120 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(80, Math.min(maxListHeight, openUp ? spaceAbove : spaceBelow));
    setListPos({
      top: openUp ? rect.top - margin - maxHeight : rect.bottom + margin,
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!isDropdownOpen) {
      setListPos(null);
      return;
    }
    updateListPos();
    // 목록 안을 스크롤하는 것은 위치와 무관하다 — 그때마다 다시 그리지 않는다.
    const onScroll = (e: Event) => {
      if (listRef.current?.contains(e.target as Node)) return;
      updateListPos();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', updateListPos);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', updateListPos);
    };
  }, [isDropdownOpen, updateListPos]);

  useEffect(() => {
    if (!loaded) load();
    if (!tcLoaded) loadTc();
  }, [loaded, load, tcLoaded, loadTc]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      // 목록은 body 에 그려져 래퍼 밖에 있다 — 목록 안을 누른 것은 바깥 클릭이 아니다.
      if (listRef.current?.contains(e.target as Node)) return;
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isDropdownOpen]);

  // If selected roster was deleted externally, reset
  useEffect(() => {
    if (!selectedRosterId) return;
    if (selectedRosterId.startsWith(TC_PREFIX)) {
      const tcId = selectedRosterId.slice(TC_PREFIX.length);
      if (!teachingClasses.find((c) => c.id === tcId)) onSelectRoster(null);
    } else {
      if (!rosters.find((r) => r.id === selectedRosterId)) onSelectRoster(null);
    }
  }, [rosters, teachingClasses, selectedRosterId, onSelectRoster]);

  const isTeachingClassSelected = selectedRosterId?.startsWith(TC_PREFIX) ?? false;
  const selectedRoster = isTeachingClassSelected
    ? null
    : (rosters.find((r) => r.id === selectedRosterId) ?? null);
  const selectedTeachingClass = isTeachingClassSelected
    ? (teachingClasses.find((c) => c.id === selectedRosterId!.slice(TC_PREFIX.length)) ?? null)
    : null;

  // Convert teaching class students to name array
  const tcStudentNames = useMemo(() => {
    if (!selectedTeachingClass) return [];
    return selectedTeachingClass.students
      .filter(isStudentActive)
      .map((s) => (s.name?.trim() ? s.name : `${s.number}번`));
  }, [selectedTeachingClass]);

  // Unified display label and names for selected item
  const selectedLabel = selectedTeachingClass
    ? `${selectedTeachingClass.name}${selectedTeachingClass.subject ? ` · ${selectedTeachingClass.subject}` : ''}`
    : selectedRoster
      ? selectedRoster.name
      : null;
  const selectedNames: readonly string[] = selectedTeachingClass
    ? tcStudentNames
    : selectedRoster
      ? selectedRoster.studentNames
      : [];

  const handleSelect = useCallback(
    (id: string) => {
      onSelectRoster(id);
      setIsDropdownOpen(false);
    },
    [onSelectRoster],
  );

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
  }, [
    editorMode,
    editorName,
    editorText,
    addRoster,
    updateRoster,
    selectedRosterId,
    onSelectRoster,
  ]);

  const handleDelete = useCallback(async () => {
    if (!selectedRosterId) return;
    await deleteRoster(selectedRosterId);
    onSelectRoster(null);
    setShowDeleteConfirm(false);
  }, [selectedRosterId, deleteRoster, onSelectRoster]);

  const handleCancelEditor = useCallback(() => {
    setEditorMode('idle');
  }, []);

  const editorStudentCount = editorText.split('\n').filter((l) => l.trim().length > 0).length;

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
              className="w-full px-3 py-2 rounded-lg bg-sp-surface border border-sp-border text-sp-text text-sm placeholder-sp-muted/50 focus:outline-none focus:border-sp-accent"
            />
          </div>
          <div>
            <label className="text-xs text-sp-muted mb-1 block">학생 명단 (한 줄에 한 명)</label>
            <textarea
              value={editorText}
              onChange={(e) => setEditorText(e.target.value)}
              placeholder={'학생 이름을 한 줄에 하나씩 입력\n\n엑셀에서 복사-붙여넣기도 가능합니다'}
              className="w-full h-32 px-3 py-2 rounded-lg bg-sp-surface border border-sp-border text-sp-text text-sm placeholder-sp-muted/50 resize-none focus:outline-none focus:border-sp-accent"
            />
            <div className="mt-1 text-xs text-sp-muted">{editorStudentCount}명</div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={handleCancelEditor}
              className="px-4 py-2 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text text-sm transition-colors"
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
      {/* Phase 5 — 도구 전용 명렬 안내 배너 (담임반·수업반과 별개임을 명시) */}
      <div className="flex items-start gap-2 px-3 py-2 mb-3 rounded-lg border border-sp-accent/30 bg-sp-accent/10 text-xs text-sp-muted">
        <span className="material-symbols-outlined text-sp-accent text-icon-sm shrink-0 mt-0.5">
          info
        </span>
        <p className="leading-relaxed">
          여기서 만든 학급 명렬은 <span className="text-sp-text font-medium">도구 전용</span>입니다.
          담임반·수업반 명렬과는 별도로 저장됩니다. 담임반 명렬을 그대로 쓰려면{' '}
          <span className="text-sp-text">설정 → 학교/학급</span>에서 수업반으로 복사하거나, 위
          드롭다운에서 수업반을 선택하세요.
        </p>
      </div>

      {/* Header: dropdown + action buttons */}
      <div className="flex items-center gap-2 mb-3">
        {/* Roster Dropdown */}
        <div className="relative flex-1" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-sp-surface border border-sp-border text-sm hover:border-sp-accent transition-all"
          >
            <span className={selectedLabel ? 'text-sp-text' : 'text-sp-muted'}>
              {selectedLabel ? `${selectedLabel} (${selectedNames.length}명)` : '반을 선택하세요'}
            </span>
            <span className="material-symbols-outlined text-icon text-sp-muted">
              {isDropdownOpen ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {isDropdownOpen &&
            createPortal(
              <div
                ref={listRef}
                data-sp-floating
                style={{
                  top: listPos?.top ?? 0,
                  left: listPos?.left ?? 0,
                  width: listPos?.width ?? 0,
                  maxHeight: listPos?.maxHeight ?? 224,
                  visibility: listPos ? 'visible' : 'hidden',
                }}
                className="fixed z-[9999] bg-sp-card border border-sp-border rounded-xl shadow-2xl py-1 overflow-y-auto"
              >
                {selectableClasses.length === 0 && rosters.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-sp-muted text-center">
                    등록된 반이 없습니다
                  </div>
                ) : (
                  <>
                    {/* 수업반 섹션 */}
                    {selectableClasses.length > 0 && (
                      <>
                        {rosters.length > 0 && (
                          <div className="px-3 pt-2 pb-1 text-caption font-bold text-sp-muted/70 uppercase tracking-wider">
                            📚 수업반
                          </div>
                        )}
                        {selectableClasses.map((tc) => {
                          const activeCount = tc.students.filter(isStudentActive).length;
                          const tcRosterId = `${TC_PREFIX}${tc.id}`;
                          return (
                            <button
                              key={tcRosterId}
                              onClick={() => handleSelect(tcRosterId)}
                              className={`w-full flex items-center justify-between px-3 py-2 hover:bg-sp-text/5 text-left transition-colors ${
                                tcRosterId === selectedRosterId ? 'bg-sp-accent/10' : ''
                              }`}
                            >
                              <span className="text-sm text-sp-text truncate">
                                {tc.name}
                                {tc.subject && (
                                  <span className="text-sp-muted"> · {tc.subject}</span>
                                )}
                              </span>
                              <span className="text-caption text-sp-muted ml-2 shrink-0">
                                {activeCount}명
                              </span>
                            </button>
                          );
                        })}
                      </>
                    )}

                    {/* 구분선 */}
                    {selectableClasses.length > 0 && rosters.length > 0 && (
                      <div className="mx-2 my-1 border-t border-sp-border/50" />
                    )}

                    {/* 사용자 명단 섹션 */}
                    {rosters.length > 0 && (
                      <>
                        {selectableClasses.length > 0 && (
                          <div className="px-3 pt-2 pb-1 text-caption font-bold text-sp-muted/70 uppercase tracking-wider">
                            📝 사용자 명단
                          </div>
                        )}
                        {rosters.map((roster) => (
                          <button
                            key={roster.id}
                            onClick={() => handleSelect(roster.id)}
                            className={`w-full flex items-center justify-between px-3 py-2 hover:bg-sp-text/5 text-left transition-colors ${
                              roster.id === selectedRosterId ? 'bg-sp-accent/10' : ''
                            }`}
                          >
                            <span className="text-sm text-sp-text truncate">{roster.name}</span>
                            <span className="text-caption text-sp-muted ml-2 shrink-0">
                              {roster.studentNames.length}명
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>,
              document.body,
            )}
        </div>

        {/* Action buttons */}
        <button
          onClick={handleStartCreate}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-sp-surface border border-sp-border text-sp-text text-xs font-medium hover:border-sp-accent transition-all shrink-0"
          title="사용자 명단 추가"
        >
          <span className="material-symbols-outlined text-icon-sm">add</span>
          <span>명단 추가</span>
        </button>
        {selectedRoster && !isTeachingClassSelected && (
          <>
            <button
              onClick={handleStartEdit}
              className="p-2 rounded-lg bg-sp-surface border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent transition-all shrink-0"
              title="명단 수정"
            >
              <span className="material-symbols-outlined text-icon-sm">edit</span>
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 rounded-lg bg-sp-surface border border-sp-border text-sp-muted hover:text-red-400 hover:border-red-400/40 transition-all shrink-0"
              title="반 삭제"
            >
              <span className="material-symbols-outlined text-icon-sm">delete</span>
            </button>
          </>
        )}
      </div>

      {/* Student Grid */}
      {selectedNames.length > 0 ? (
        <div>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
            {selectedNames.map((name, idx) => {
              const isExcluded = excludedNames.has(name);
              const isPicked = pickedItems.includes(name);
              const isPlaceholder = name.endsWith('번') && /^\d+번$/.test(name);
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
                  } ${isPlaceholder ? 'italic' : ''}`}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-xs text-sp-muted text-center">
            클릭하여 제외/포함 ({selectedNames.length - excludedNames.size}명 참여)
          </div>
        </div>
      ) : selectedRoster || selectedTeachingClass ? (
        <div className="text-center py-4 text-sp-muted text-sm">
          {selectedTeachingClass
            ? '수업관리에서 먼저 학생을 등록하세요.'
            : '학생이 등록되지 않았습니다. ✏️ 버튼으로 명단을 추가하세요.'}
        </div>
      ) : (
        <div className="text-center py-4 text-sp-muted text-sm">
          {selectableClasses.length === 0 && rosters.length === 0
            ? '수업관리에서 반을 등록하거나, [명단 추가] 버튼으로 시작하세요.'
            : '위 드롭다운에서 반을 선택하세요.'}
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-sp-card border border-sp-border rounded-2xl p-5 w-72">
            <h3 className="text-sm font-bold text-sp-text mb-2">반 삭제</h3>
            <p className="text-xs text-sp-muted mb-4">
              &apos;{selectedRoster?.name}&apos; 명단을 삭제할까요?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text text-sm transition-colors"
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
