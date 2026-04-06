import { useState, useCallback, useMemo } from 'react';
import type { WordCloudGroup } from '@domain/entities/WordCloudSession';

interface WordEntry {
  word: string;
  normalized: string;
  count: number;
  color: string;
}

interface OrganizeViewProps {
  words: WordEntry[];
  question: string;
  totalSubmissions: number;
  isFullscreen: boolean;
  initialGroups?: readonly WordCloudGroup[];
  onSave: (groups: WordCloudGroup[]) => void;
  onBack: () => void;
}

const GROUP_COLORS = [
  { id: 'blue', bg: 'bg-blue-500/15', border: 'border-blue-500/40', text: 'text-blue-400', hex: '#60a5fa' },
  { id: 'green', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-400', hex: '#34d399' },
  { id: 'amber', bg: 'bg-amber-500/15', border: 'border-amber-500/40', text: 'text-amber-400', hex: '#fbbf24' },
  { id: 'purple', bg: 'bg-purple-500/15', border: 'border-purple-500/40', text: 'text-purple-400', hex: '#a78bfa' },
  { id: 'red', bg: 'bg-red-500/15', border: 'border-red-500/40', text: 'text-red-400', hex: '#f87171' },
  { id: 'teal', bg: 'bg-teal-500/15', border: 'border-teal-500/40', text: 'text-teal-400', hex: '#2dd4bf' },
];

function generateId(): string {
  return `g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function OrganizeView({
  words,
  question,
  totalSubmissions,
  isFullscreen,
  initialGroups,
  onSave,
  onBack,
}: OrganizeViewProps) {
  const [groups, setGroups] = useState<WordCloudGroup[]>(() =>
    initialGroups ? [...initialGroups.map((g) => ({ ...g, words: [...g.words] }))] : [],
  );
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [copied, setCopied] = useState(false);

  // 그룹에 이미 할당된 단어들
  const assignedWords = useMemo(() => {
    const assigned = new Set<string>();
    for (const g of groups) {
      for (const w of g.words) {
        assigned.add(w);
      }
    }
    return assigned;
  }, [groups]);

  // 미분류 단어
  const unassignedWords = useMemo(
    () => words.filter((w) => !assignedWords.has(w.normalized)),
    [words, assignedWords],
  );

  const nextColor = useMemo(
    () => GROUP_COLORS[groups.length % GROUP_COLORS.length]!,
    [groups.length],
  );

  const toggleWord = useCallback((normalized: string) => {
    setSelectedWords((prev) => {
      const next = new Set(prev);
      if (next.has(normalized)) next.delete(normalized);
      else next.add(normalized);
      return next;
    });
  }, []);

  const addGroup = useCallback(() => {
    if (selectedWords.size === 0) return;
    const color = nextColor;
    const newGroup: WordCloudGroup = {
      id: generateId(),
      name: `그룹 ${groups.length + 1}`,
      color: color.hex,
      words: [...selectedWords],
    };
    setGroups((prev) => [...prev, newGroup]);
    setSelectedWords(new Set());
  }, [selectedWords, groups.length, nextColor]);

  const addToGroup = useCallback((groupId: string) => {
    if (selectedWords.size === 0) return;
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, words: [...new Set([...g.words, ...selectedWords])] }
          : g,
      ),
    );
    setSelectedWords(new Set());
  }, [selectedWords]);

  const removeFromGroup = useCallback((groupId: string, normalized: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, words: g.words.filter((w) => w !== normalized) }
          : g,
      ),
    );
  }, []);

  const deleteGroup = useCallback((groupId: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }, []);

  const startEditGroup = useCallback((groupId: string, currentName: string) => {
    setEditingGroupId(groupId);
    setEditGroupName(currentName);
  }, []);

  const saveEditGroup = useCallback(() => {
    if (!editingGroupId) return;
    const name = editGroupName.trim();
    if (name) {
      setGroups((prev) =>
        prev.map((g) => (g.id === editingGroupId ? { ...g, name } : g)),
      );
    }
    setEditingGroupId(null);
  }, [editingGroupId, editGroupName]);

  const findWordDisplay = useCallback(
    (normalized: string): string => {
      const entry = words.find((w) => w.normalized === normalized);
      return entry ? entry.word : normalized;
    },
    [words],
  );

  const findWordCount = useCallback(
    (normalized: string): number => {
      const entry = words.find((w) => w.normalized === normalized);
      return entry ? entry.count : 1;
    },
    [words],
  );

  const getGroupColorStyle = useCallback(
    (groupIndex: number) => GROUP_COLORS[groupIndex % GROUP_COLORS.length]!,
    [],
  );

  // 클립보드 복사
  const copyToClipboard = useCallback(() => {
    const lines: string[] = [];
    lines.push(`📋 ${question}`);
    lines.push(`총 ${totalSubmissions}개 제출 · ${words.length}개 고유 단어`);
    lines.push('');

    if (groups.length > 0) {
      groups.forEach((g) => {
        lines.push(`【${g.name}】`);
        g.words.forEach((w) => {
          lines.push(`  • ${findWordDisplay(w)} (${findWordCount(w)}회)`);
        });
        lines.push('');
      });
    }

    if (unassignedWords.length > 0) {
      lines.push('【미분류】');
      unassignedWords.forEach((w) => {
        lines.push(`  • ${w.word} (${w.count}회)`);
      });
    }

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [question, totalSubmissions, words.length, groups, unassignedWords, findWordDisplay, findWordCount]);

  const handleSave = useCallback(() => {
    onSave(groups);
  }, [groups, onSave]);

  return (
    <div className={`flex flex-col gap-4 h-full ${isFullscreen ? 'p-6' : 'p-4'}`}>
      {/* 상단: 질문 + 버튼 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className={`text-sp-text font-bold truncate ${isFullscreen ? 'text-xl' : 'text-lg'}`}>
            {question}
          </h2>
          <p className="text-sp-muted text-sm">
            {words.length}개 단어 · {groups.length}개 그룹
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={copyToClipboard}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
              copied
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/40'
            }`}
          >
            <span className="material-symbols-outlined text-icon-md">
              {copied ? 'check' : 'content_copy'}
            </span>
            {copied ? '복사됨' : '복사'}
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sp-accent text-white text-sm font-medium hover:bg-sp-accent/80 transition-colors"
          >
            <span className="material-symbols-outlined text-icon-md">save</span>
            저장
          </button>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text text-sm transition-all"
          >
            <span className="material-symbols-outlined text-icon-md">arrow_back</span>
            돌아가기
          </button>
        </div>
      </div>

      {/* 메인 영역: 미분류 + 그룹 */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* 왼쪽: 미분류 단어 */}
        <div className="w-1/3 flex flex-col bg-sp-card border border-sp-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-sp-border flex items-center justify-between">
            <span className="text-sm font-medium text-sp-text">
              미분류 ({unassignedWords.length})
            </span>
            {selectedWords.size > 0 && (
              <span className="text-xs text-sp-accent">
                {selectedWords.size}개 선택
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="flex flex-wrap gap-2">
              {unassignedWords.map((w) => (
                <button
                  key={w.normalized}
                  onClick={() => toggleWord(w.normalized)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                    selectedWords.has(w.normalized)
                      ? 'bg-sp-accent/20 border-sp-accent text-sp-accent ring-1 ring-sp-accent/30'
                      : 'bg-sp-bg border-sp-border text-sp-text hover:border-sp-accent/40'
                  }`}
                >
                  {w.word}
                  <span className="ml-1 text-xs opacity-60">{w.count}</span>
                </button>
              ))}
              {unassignedWords.length === 0 && (
                <p className="text-sp-muted text-sm text-center w-full py-4">
                  모든 단어가 그룹에 분류되었습니다
                </p>
              )}
            </div>
          </div>
          {/* 새 그룹 만들기 */}
          {selectedWords.size > 0 && (
            <div className="px-3 py-3 border-t border-sp-border">
              <button
                onClick={addGroup}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sp-accent text-white text-sm font-medium hover:bg-sp-accent/80 transition-colors"
              >
                <span className="material-symbols-outlined text-icon-md">add</span>
                새 그룹으로 분류 ({selectedWords.size}개)
              </button>
            </div>
          )}
        </div>

        {/* 오른쪽: 그룹 목록 */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-3">
            {groups.map((g, gi) => {
              const colorStyle = getGroupColorStyle(gi);
              return (
                <div
                  key={g.id}
                  className={`${colorStyle.bg} border ${colorStyle.border} rounded-xl p-4`}
                >
                  {/* 그룹 헤더 */}
                  <div className="flex items-center gap-2 mb-3">
                    {editingGroupId === g.id ? (
                      <input
                        value={editGroupName}
                        onChange={(e) => setEditGroupName(e.target.value)}
                        onBlur={saveEditGroup}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEditGroup(); }}
                        className="flex-1 px-2 py-1 bg-sp-bg border border-sp-border rounded-lg text-sm text-sp-text focus:border-sp-accent focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => startEditGroup(g.id, g.name)}
                        className={`text-sm font-bold ${colorStyle.text} hover:underline`}
                      >
                        {g.name}
                      </button>
                    )}
                    <span className="text-xs text-sp-muted">{g.words.length}개</span>
                    <div className="flex-1" />
                    {selectedWords.size > 0 && (
                      <button
                        onClick={() => addToGroup(g.id)}
                        className={`px-2 py-1 rounded-lg text-xs font-medium ${colorStyle.text} ${colorStyle.bg} border ${colorStyle.border} hover:opacity-80 transition-all`}
                      >
                        + 여기에 추가
                      </button>
                    )}
                    <button
                      onClick={() => deleteGroup(g.id)}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-sp-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                      title="그룹 삭제"
                    >
                      <span className="material-symbols-outlined text-icon-sm">close</span>
                    </button>
                  </div>
                  {/* 그룹 단어들 */}
                  <div className="flex flex-wrap gap-1.5">
                    {g.words.map((w) => (
                      <span
                        key={w}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sp-bg/50 border border-sp-border/50 text-sm text-sp-text"
                      >
                        {findWordDisplay(w)}
                        <span className="text-xs opacity-50">{findWordCount(w)}</span>
                        <button
                          onClick={() => removeFromGroup(g.id, w)}
                          className="ml-0.5 text-sp-muted hover:text-red-400 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}

            {groups.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-sp-muted">
                <span className="material-symbols-outlined text-[48px] opacity-20 mb-3">
                  category
                </span>
                <p className="text-sm">왼쪽에서 단어를 선택한 뒤</p>
                <p className="text-sm">"새 그룹으로 분류" 버튼을 누르세요</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
