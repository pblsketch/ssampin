import { useState, useEffect, useCallback, useMemo } from 'react';
import { ToolLayout } from './ToolLayout';
import type { KeyboardShortcut } from './types';
import { ClassRosterSelector } from './ClassRosterSelector';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useClassRosterStore } from '@adapters/stores/useClassRosterStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import {
  assignGroups,
  calcGroupCount,
  validateConstraints,
  type GroupingMember,
  type GroupResult,
  type GroupingMethod,
  type GroupingConstraints,
  type Gender,
  type Level,
  type GenderMode,
  type LeaderMethod,
  type RoleAssignMode,
  type RoleConfig,
  assignRolesToGroup,
} from '@domain/rules/groupingRules';

interface ToolGroupingProps {
  onBack: () => void;
  isFullscreen: boolean;
}

type DataSource = 'students' | 'classRoster';
type SizeMode = 'byCount' | 'bySize';

const GROUP_COLORS = [
  'from-blue-500/15 to-blue-600/5 border-blue-400/50',
  'from-emerald-500/15 to-emerald-600/5 border-emerald-400/50',
  'from-amber-500/15 to-amber-600/5 border-amber-400/50',
  'from-purple-500/15 to-purple-600/5 border-purple-400/50',
  'from-rose-500/15 to-rose-600/5 border-rose-400/50',
  'from-cyan-500/15 to-cyan-600/5 border-cyan-400/50',
  'from-orange-500/15 to-orange-600/5 border-orange-400/50',
  'from-indigo-500/15 to-indigo-600/5 border-indigo-400/50',
  'from-pink-500/15 to-pink-600/5 border-pink-400/50',
  'from-teal-500/15 to-teal-600/5 border-teal-400/50',
];

const GROUP_TEXT_COLORS = [
  'text-blue-400',
  'text-emerald-400',
  'text-amber-400',
  'text-purple-400',
  'text-rose-400',
  'text-cyan-400',
  'text-orange-400',
  'text-indigo-400',
  'text-pink-400',
  'text-teal-400',
];

export function ToolGrouping({ onBack, isFullscreen }: ToolGroupingProps) {
  const { track } = useAnalytics();
  useEffect(() => {
    track('tool_use', { tool: 'grouping' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Data Source ---
  const [dataSource, setDataSource] = useState<DataSource>('students');
  const [selectedRosterId, setSelectedRosterId] = useState<string | null>(null);
  const [excludedNames, setExcludedNames] = useState<Set<string>>(new Set());

  // --- Stores ---
  const students = useStudentStore((s) => s.students);
  const loaded = useStudentStore((s) => s.loaded);
  const loadStudents = useStudentStore((s) => s.load);
  const rosters = useClassRosterStore((s) => s.rosters);
  const rosterLoaded = useClassRosterStore((s) => s.loaded);
  const loadRosters = useClassRosterStore((s) => s.load);
  const teachingClasses = useTeachingClassStore((s) => s.classes);
  const tcLoaded = useTeachingClassStore((s) => s.loaded);
  const loadTc = useTeachingClassStore((s) => s.load);

  useEffect(() => {
    if (!loaded) loadStudents();
    if (!rosterLoaded) loadRosters();
    if (!tcLoaded) loadTc();
  }, [loaded, loadStudents, rosterLoaded, loadRosters, tcLoaded, loadTc]);

  // --- Grouping Settings ---
  const [sizeMode, setSizeMode] = useState<SizeMode>('byCount');
  const [groupCount, setGroupCount] = useState(4);
  const [membersPerGroup, setMembersPerGroup] = useState(5);
  const [method, setMethod] = useState<GroupingMethod>('random');
  const [genderMode, setGenderMode] = useState<GenderMode>('none');
  const [balanceLevel, setBalanceLevel] = useState(false);
  const [leaderMethod, setLeaderMethod] = useState<LeaderMethod>('none');
  const [roleAssignMode, setRoleAssignMode] = useState<RoleAssignMode>('none');
  const [roleConfigs, setRoleConfigs] = useState<RoleConfig[]>([
    { name: '이끔이', count: 1 },
    { name: '기록이', count: 1 },
    { name: '칭찬이', count: 1 },
    { name: '나눔이', count: 1 },
  ]);
  const [newRoleName, setNewRoleName] = useState('');

  // --- Gender / Level Tags (session-only) ---
  const [genderTags, setGenderTags] = useState<Record<string, Gender>>({});
  const [levelTags, setLevelTags] = useState<Record<string, Level>>({});
  const [showGenderTag, setShowGenderTag] = useState(false);
  const [showLevelTag, setShowLevelTag] = useState(false);

  // --- UI ---
  const [showAdvanced, setShowAdvanced] = useState(false);

  // --- Constraints ---
  const [showConstraints, setShowConstraints] = useState(false);
  const [togetherInput, setTogetherInput] = useState('');
  const [apartInput, setApartInput] = useState('');

  // --- Result ---
  const [result, setResult] = useState<GroupResult[] | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [lockedGroups, setLockedGroups] = useState<Set<number>>(new Set());

  // --- History ---
  const [history, setHistory] = useState<GroupResult[][]>([]);

  // --- Export ---
  const [copyMsg, setCopyMsg] = useState('');

  // Build member pool
  const getMembers = useCallback((): GroupingMember[] => {
    const addTags = (m: GroupingMember): GroupingMember => ({
      ...m,
      gender: genderTags[m.name] ?? m.gender,
      level: levelTags[m.name] ?? m.level,
    });

    if (dataSource === 'students') {
      return students
        .filter((s) => !s.isVacant && !excludedNames.has(s.name || `${s.studentNumber ?? 0}번`))
        .map((s) => addTags({
          name: s.name || `${s.studentNumber ?? 0}번`,
          number: s.studentNumber ?? undefined,
        }));
    }
    if (selectedRosterId?.startsWith('tc:')) {
      const tcId = selectedRosterId.slice(3);
      const tc = teachingClasses.find((c) => c.id === tcId);
      if (!tc) return [];
      return tc.students
        .filter((s) => !s.isVacant && !excludedNames.has(s.name?.trim() ? s.name : `${s.number}번`))
        .map((s) => addTags({
          name: s.name?.trim() ? s.name : `${s.number}번`,
          number: s.number,
        }));
    }
    const roster = rosters.find((r) => r.id === selectedRosterId);
    if (!roster) return [];
    return roster.studentNames
      .filter((name) => name.trim().length > 0 && !excludedNames.has(name))
      .map((name, idx) => addTags({ name, number: idx + 1 }));
  }, [dataSource, students, excludedNames, selectedRosterId, teachingClasses, rosters, genderTags, levelTags]);

  const memberPool = useMemo(() => getMembers(), [getMembers]);
  const totalMembers = memberPool.length;

  const effectiveGroupCount = useMemo(() => {
    if (sizeMode === 'byCount') return Math.min(groupCount, totalMembers);
    return calcGroupCount(totalMembers, membersPerGroup);
  }, [sizeMode, groupCount, membersPerGroup, totalMembers]);

  // Parse constraints
  const constraints = useMemo((): GroupingConstraints => {
    const parsePairs = (text: string): [string, string][] => {
      return text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
          const parts = line.split(/[,\s]+/).filter(Boolean);
          if (parts.length >= 2) return [parts[0]!, parts[1]!] as [string, string];
          return null;
        })
        .filter((pair): pair is [string, string] => pair !== null);
    };
    return { together: parsePairs(togetherInput), apart: parsePairs(apartInput) };
  }, [togetherInput, apartInput]);

  const constraintErrors = useMemo(() => validateConstraints(constraints), [constraints]);

  // 총 역할 슬롯 수
  const totalRoleSlots = useMemo(() =>
    roleConfigs.reduce((sum, r) => sum + r.count, 0),
    [roleConfigs],
  );

  useEffect(() => {
    setExcludedNames(new Set());
    setResult(null);
    setLockedGroups(new Set());
  }, [dataSource]);

  // Show gender/level panels when mode changes
  useEffect(() => {
    if (genderMode !== 'none') setShowGenderTag(true);
  }, [genderMode]);
  useEffect(() => {
    if (balanceLevel) setShowLevelTag(true);
  }, [balanceLevel]);

  const toggleExclusion = useCallback((name: string) => {
    setExcludedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const cycleGender = useCallback((name: string) => {
    setGenderTags((prev) => {
      const current = prev[name];
      if (!current) return { ...prev, [name]: 'M' as Gender };
      if (current === 'M') return { ...prev, [name]: 'F' as Gender };
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const cycleLevel = useCallback((name: string) => {
    setLevelTags((prev) => {
      const current = prev[name];
      if (!current) return { ...prev, [name]: 'high' as Level };
      if (current === 'high') return { ...prev, [name]: 'mid' as Level };
      if (current === 'mid') return { ...prev, [name]: 'low' as Level };
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  // --- Handle Assign ---
  const handleAssign = useCallback(() => {
    if (totalMembers === 0 || effectiveGroupCount === 0) return;
    setIsAnimating(true);

    setTimeout(() => {
      const groups = assignGroups(memberPool, effectiveGroupCount, {
        method,
        constraints,
        genderMode: genderMode !== 'none' ? genderMode : undefined,
        balanceLevel: balanceLevel || undefined,
        leaderMethod,
        roles: roleAssignMode !== 'none' ? roleConfigs : undefined,
        roleAssignMode,
      });
      setResult(groups);
      setHistory((prev) => [groups, ...prev].slice(0, 10));
      setLockedGroups(new Set());
      setIsAnimating(false);
    }, 400);
  }, [totalMembers, effectiveGroupCount, memberPool, method, constraints, genderMode, balanceLevel, leaderMethod, roleAssignMode, roleConfigs]);

  // --- Reshuffle ---
  const handleReshuffle = useCallback(() => {
    if (!result || totalMembers === 0) return;
    setIsAnimating(true);

    setTimeout(() => {
      const roleOpts = {
        method, constraints, genderMode: genderMode !== 'none' ? genderMode : undefined,
        balanceLevel: balanceLevel || undefined, leaderMethod,
        roles: roleAssignMode !== 'none' ? roleConfigs : undefined,
        roleAssignMode,
      };

      if (lockedGroups.size === 0) {
        const groups = assignGroups(memberPool, effectiveGroupCount, roleOpts);
        setResult(groups);
        setHistory((prev) => [groups, ...prev].slice(0, 10));
      } else {
        const lockedMembers = new Set<string>();
        const newGroups = result.map((g, i) => {
          if (lockedGroups.has(i)) {
            g.members.forEach((m) => lockedMembers.add(m.name));
            return g;
          }
          return null;
        });

        const unlockedMembers = memberPool.filter((m) => !lockedMembers.has(m.name));
        const unlockedCount = result.length - lockedGroups.size;
        const reassigned = assignGroups(unlockedMembers, unlockedCount, roleOpts);

        let reassignIdx = 0;
        const finalGroups = newGroups.map((g, i) => {
          if (g) return g;
          const r = reassigned[reassignIdx];
          reassignIdx++;
          return r ?? { label: `${i + 1}모둠`, members: [] };
        });

        setResult(finalGroups);
        setHistory((prev) => [finalGroups, ...prev].slice(0, 10));
      }
      setIsAnimating(false);
    }, 400);
  }, [result, lockedGroups, totalMembers, memberPool, effectiveGroupCount, method, constraints, genderMode, balanceLevel, leaderMethod, roleAssignMode, roleConfigs]);

  const toggleLock = useCallback((idx: number) => {
    setLockedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  // --- Manual role assignment: cycle through roles for a member ---
  const roleNameList = useMemo(() => {
    const unique = [...new Set(roleConfigs.map((r) => r.name))];
    return unique;
  }, [roleConfigs]);

  const handleCycleRole = useCallback((groupIdx: number, memberIdx: number) => {
    if (!result || roleNameList.length === 0) return;
    setResult((prev) => {
      if (!prev) return prev;
      return prev.map((g, gi) => {
        if (gi !== groupIdx) return g;
        const newMembers = g.members.map((m, mi) => {
          if (mi !== memberIdx) return m;
          const currentRole = m.role;
          if (!currentRole) return { ...m, role: roleNameList[0] };
          const idx = roleNameList.indexOf(currentRole);
          if (idx === -1 || idx === roleNameList.length - 1) return { ...m, role: undefined };
          return { ...m, role: roleNameList[idx + 1] };
        });
        return { ...g, members: newMembers };
      });
    });
  }, [result, roleNameList]);

  // --- Reshuffle roles only (keep groups) ---
  const handleReshuffleRoles = useCallback(() => {
    if (!result || roleConfigs.length === 0) return;
    setResult((prev) => {
      if (!prev) return prev;
      return prev.map((g) => ({
        ...g,
        members: assignRolesToGroup([...g.members], roleConfigs),
      }));
    });
  }, [result, roleConfigs]);

  const handleReset = useCallback(() => {
    setResult(null);
    setLockedGroups(new Set());
  }, []);

  const loadHistory = useCallback((idx: number) => {
    const item = history[idx];
    if (item) { setResult(item); setLockedGroups(new Set()); }
  }, [history]);

  // --- Copy to clipboard ---
  const handleCopy = useCallback(() => {
    if (!result) return;
    const text = result
      .map((g) => {
        const header = g.leaderName ? `[${g.label}] (모둠장: ${g.leaderName})` : `[${g.label}]`;
        const members = g.members.map((m) => {
          let line = `  ${m.number != null ? `${m.number}번 ` : ''}${m.name}`;
          if (m.name === g.leaderName) line += ' ★';
          if (m.role) line += ` (${m.role})`;
          return line;
        }).join('\n');
        return `${header}\n${members}`;
      })
      .join('\n\n');
    void navigator.clipboard.writeText(text);
    setCopyMsg('복사 완료!');
    setTimeout(() => setCopyMsg(''), 2000);
  }, [result]);

  // --- Export to Excel ---
  const handleExportExcel = useCallback(async () => {
    if (!result) return;
    try {
      const { exportGroupingToExcel } = await import('@infrastructure/export/ExcelExporter');
      const buffer = await exportGroupingToExcel(result);

      if (window.electronAPI?.showSaveDialog && window.electronAPI?.writeFile) {
        const filePath = await window.electronAPI.showSaveDialog({
          title: '모둠 편성 결과 저장',
          defaultPath: `모둠편성_${new Date().toISOString().slice(0, 10)}.xlsx`,
          filters: [{ name: 'Excel', extensions: ['xlsx'] }],
        });
        if (filePath) {
          await window.electronAPI.writeFile(filePath, buffer);
        }
      } else {
        // 브라우저 환경: Blob 다운로드
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `모둠편성_${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // fallback: 클립보드
      handleCopy();
    }
  }, [result, handleCopy]);

  // --- Export to HWPX ---
  const handleExportHwpx = useCallback(async () => {
    if (!result) return;
    try {
      const { exportGroupingToHwpx } = await import('@infrastructure/export/HwpxExporter');
      const raw = await exportGroupingToHwpx(result);
      const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

      if (window.electronAPI?.showSaveDialog && window.electronAPI?.writeFile) {
        const filePath = await window.electronAPI.showSaveDialog({
          title: '모둠 편성 결과 한글 파일 저장',
          defaultPath: `모둠편성_${new Date().toISOString().slice(0, 10)}.hwpx`,
          filters: [{ name: '한글 문서', extensions: ['hwpx'] }],
        });
        if (filePath) {
          await window.electronAPI.writeFile(filePath, buffer);
        }
      } else {
        const blob = new Blob([buffer], { type: 'application/hwp+zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `모둠편성_${new Date().toISOString().slice(0, 10)}.hwpx`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      handleCopy();
    }
  }, [result, handleCopy]);

  const shortcuts = useMemo<KeyboardShortcut[]>(() => [
    { key: ' ', label: '편성', description: '모둠 편성 실행', handler: result ? handleReshuffle : handleAssign },
    { key: 'Enter', label: '편성', description: '모둠 편성 실행', handler: result ? handleReshuffle : handleAssign },
    { key: 'r', label: '초기화', description: '결과 초기화', handler: handleReset },
  ], [result, handleReshuffle, handleAssign, handleReset]);

  const canAssign = totalMembers >= 2 && effectiveGroupCount >= 1 && !isAnimating && constraintErrors.length === 0;

  // All student names for tagging UI
  const allStudentNames = useMemo(() => {
    if (dataSource === 'students') {
      return students.filter((s) => !s.isVacant).map((s) => s.name || `${s.studentNumber ?? 0}번`);
    }
    if (selectedRosterId?.startsWith('tc:')) {
      const tc = teachingClasses.find((c) => c.id === selectedRosterId.slice(3));
      return tc?.students.filter((s) => !s.isVacant).map((s) => s.name?.trim() ? s.name : `${s.number}번`) ?? [];
    }
    const roster = rosters.find((r) => r.id === selectedRosterId);
    return roster?.studentNames.filter((n) => n.trim()) ?? [];
  }, [dataSource, students, selectedRosterId, teachingClasses, rosters]);

  const genderLabel = (g?: Gender) => g === 'M' ? '♂' : g === 'F' ? '♀' : '';
  const genderColor = (g?: Gender) => g === 'M' ? 'bg-blue-500/20 text-blue-400 border-blue-400/40' : g === 'F' ? 'bg-pink-500/20 text-pink-400 border-pink-400/40' : 'bg-sp-surface text-sp-muted border-sp-border';
  const levelLabel = (l?: Level) => l === 'high' ? '상' : l === 'mid' ? '중' : l === 'low' ? '하' : '';
  const levelColor = (l?: Level) => l === 'high' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-400/40' : l === 'mid' ? 'bg-amber-500/20 text-amber-400 border-amber-400/40' : l === 'low' ? 'bg-orange-500/20 text-orange-400 border-orange-400/40' : 'bg-sp-surface text-sp-muted border-sp-border';

  const hasAdvancedNonDefault = leaderMethod !== 'none' || roleAssignMode !== 'none' || genderMode !== 'none' || balanceLevel || togetherInput.trim().length > 0 || apartInput.trim().length > 0;

  return (
    <ToolLayout title="모둠 편성기" emoji="👥" onBack={onBack} isFullscreen={isFullscreen} shortcuts={shortcuts}>
      <style>{`
        @keyframes groupFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .group-fade-in {
          animation: groupFadeIn 0.35s ease-out both;
        }
      `}</style>
      <div className="w-full max-w-5xl mx-auto flex flex-col gap-5">

        {/* === Settings Panel === */}
        {!result && (
          <>
            {/* CARD 1 — Primary */}
            <div className="bg-sp-card rounded-2xl border border-sp-border">

              {/* Section A: Data source + student chips */}
              <div className="p-5">
                <div className="flex gap-2 mb-4 justify-center">
                  {([
                    { key: 'students' as const, label: '👩‍🎓 우리 반' },
                    { key: 'classRoster' as const, label: '📋 다른 반' },
                  ] as const).map((src) => (
                    <button
                      key={src.key}
                      onClick={() => setDataSource(src.key)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        dataSource === src.key
                          ? 'bg-sp-accent/20 text-sp-accent border border-sp-accent/40'
                          : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
                      }`}
                    >
                      {src.label}
                    </button>
                  ))}
                </div>

                {dataSource === 'students' && (
                  <div>
                    {students.filter((s) => !s.isVacant).length === 0 ? (
                      <div className="flex flex-col items-center gap-3 py-6 text-center">
                        <span className="text-3xl">🏫</span>
                        <p className="text-sm text-sp-muted">학급 자리 배치 메뉴에서 학생을 등록하면<br/>자동으로 불러와집니다</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                          {students.filter((s) => !s.isVacant).map((student) => {
                            const studentName = student.name || `${student.studentNumber ?? 0}번`;
                            const isExcluded = excludedNames.has(studentName);
                            return (
                              <button
                                key={student.id}
                                onClick={() => toggleExclusion(studentName)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                                  isExcluded
                                    ? 'bg-sp-surface text-sp-muted/50 line-through border border-sp-border/50'
                                    : 'bg-sp-accent/10 text-sp-accent border border-sp-accent/30 hover:bg-sp-accent/20'
                                }`}
                              >
                                {studentName}
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-2 text-xs text-sp-muted text-center">
                          클릭하여 제외/포함 ({totalMembers}명 참여)
                        </div>
                      </>
                    )}
                  </div>
                )}

                {dataSource === 'classRoster' && (
                  <ClassRosterSelector
                    selectedRosterId={selectedRosterId}
                    onSelectRoster={setSelectedRosterId}
                    excludedNames={excludedNames}
                    onToggleExclusion={toggleExclusion}
                    pickedItems={[]}
                  />
                )}
              </div>

              {/* Section B: Group count stepper */}
              <div className="border-t border-sp-border/40 p-5">
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={sizeMode === 'byCount'
                      ? () => setGroupCount((v) => Math.max(2, v - 1))
                      : () => setMembersPerGroup((v) => Math.max(2, v - 1))}
                    className="w-10 h-10 rounded-xl bg-sp-surface border border-sp-border text-sp-muted hover:text-sp-text transition-all flex items-center justify-center text-xl font-bold"
                  >-</button>
                  <input
                    type="number"
                    min={2}
                    max={Math.max(2, totalMembers)}
                    value={sizeMode === 'byCount' ? groupCount : membersPerGroup}
                    onChange={(e) => {
                      const v = Math.max(2, parseInt(e.target.value) || 2);
                      if (sizeMode === 'byCount') setGroupCount(v);
                      else setMembersPerGroup(v);
                    }}
                    className="w-20 py-1 rounded-xl bg-transparent text-sp-text text-3xl text-center font-black focus:outline-none"
                  />
                  <button
                    onClick={sizeMode === 'byCount'
                      ? () => setGroupCount((v) => Math.min(totalMembers || 20, v + 1))
                      : () => setMembersPerGroup((v) => Math.min(totalMembers || 20, v + 1))}
                    className="w-10 h-10 rounded-xl bg-sp-surface border border-sp-border text-sp-muted hover:text-sp-text transition-all flex items-center justify-center text-xl font-bold"
                  >+</button>
                </div>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <button
                    onClick={() => setSizeMode(sizeMode === 'byCount' ? 'bySize' : 'byCount')}
                    className="text-sm text-sp-muted hover:text-sp-accent transition-colors cursor-pointer"
                  >
                    <span className={sizeMode === 'byCount' ? 'text-sp-accent font-semibold' : ''}>모둠</span>
                    <span className="mx-1 text-sp-border">/</span>
                    <span className={sizeMode === 'bySize' ? 'text-sp-accent font-semibold' : ''}>명/모둠</span>
                  </button>
                  <span className="text-sm text-sp-muted ml-2">
                    → {effectiveGroupCount}모둠 × {totalMembers > 0 ? Math.ceil(totalMembers / Math.max(1, effectiveGroupCount)) : 0}명
                  </span>
                </div>
              </div>

              {/* Section C: Method pills + quick toggles */}
              <div className="border-t border-sp-border/40 px-5 py-4 space-y-3">
                {/* Line 1: 편성 방법 */}
                <div>
                  <p className="text-xs font-medium text-sp-muted/70 uppercase tracking-wider mb-2">편성 방법</p>
                  <div className="flex gap-1 flex-wrap">
                    {([
                      { key: 'random' as const, label: '🎲 무작위' },
                      { key: 'number' as const, label: '🔢 번호순' },
                      { key: 'name' as const, label: '가나다' },
                    ] as const).map((m) => (
                      <button
                        key={m.key}
                        onClick={() => setMethod(m.key)}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                          method === m.key
                            ? 'bg-sp-accent/20 text-sp-accent border border-sp-accent/40'
                            : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Line 2: 배분 방식 */}
                <div>
                  <p className="text-xs font-medium text-sp-muted/70 uppercase tracking-wider mb-1.5">배분 방식</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Gender mode pills */}
                    <div className="flex gap-1">
                      {([
                        { key: 'none' as const, label: '무관' },
                        { key: 'mix' as const, label: '혼합 배분' },
                        { key: 'same' as const, label: '동성 모둠' },
                      ] as const).map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => setGenderMode(opt.key)}
                          className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                            genderMode === opt.key
                              ? 'bg-sp-accent/20 text-sp-accent border border-sp-accent/40'
                              : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <span className="text-sp-border/60 text-sm select-none">|</span>

                    {/* Level toggle */}
                    <button
                      onClick={() => setBalanceLevel((v) => !v)}
                      className="flex items-center gap-1.5"
                    >
                      <span className="text-xs text-sp-muted">수준 균등 배분</span>
                      <span className={`relative w-8 h-4 rounded-full transition-colors inline-block ${
                        balanceLevel ? 'bg-sp-accent' : 'bg-sp-border'
                      }`}>
                        <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                          balanceLevel ? 'translate-x-4' : 'translate-x-0'
                        }`} />
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* CARD 2 — Advanced settings accordion */}
            <div className="bg-sp-card rounded-2xl border border-sp-border">
              <button
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-sm text-sp-muted hover:text-sp-text transition-colors"
              >
                <span className="flex items-center gap-2">
                  고급 설정
                  {hasAdvancedNonDefault && (
                    <span className="w-1.5 h-1.5 rounded-full bg-sp-accent" />
                  )}
                </span>
                <span className="material-symbols-outlined text-icon">
                  {showAdvanced ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {showAdvanced && (
                <div className="divide-y divide-sp-border/40">
                  {/* Leader method */}
                  <div className="px-5 py-4">
                    <p className="text-xs text-sp-muted mb-2">모둠장 자동 지정</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {([
                        { key: 'none' as const, label: '없음' },
                        { key: 'first-number' as const, label: '1번(낮은 번호)' },
                        { key: 'random' as const, label: '무작위' },
                      ] as const).map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => setLeaderMethod(opt.key)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            leaderMethod === opt.key
                              ? 'bg-sp-accent/20 text-sp-accent border border-sp-accent/40'
                              : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Role assignment */}
                  <div className="px-5 py-4">
                    <div className="flex items-center gap-3 mb-2">
                      <p className="text-xs text-sp-muted">역할 배정</p>
                      <div className="flex gap-1.5">
                        {([
                          { key: 'none' as const, label: '없음' },
                          { key: 'random' as const, label: '🎲 자동' },
                          { key: 'manual' as const, label: '✏️ 직접' },
                        ] as const).map((opt) => (
                          <button
                            key={opt.key}
                            onClick={() => setRoleAssignMode(opt.key)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              roleAssignMode === opt.key
                                ? 'bg-sp-accent/20 text-sp-accent border border-sp-accent/40'
                                : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {roleAssignMode !== 'none' && (
                      <div className="mt-3 p-3 rounded-xl bg-sp-surface/50 border border-sp-border/50">
                        <label className="text-xs text-sp-muted mb-2 block">역할 목록</label>
                        <div className="space-y-1.5">
                          {roleConfigs.map((role, i) => (
                            <div key={i} className="flex items-center gap-2 bg-sp-surface/40 rounded-lg px-2.5 py-1.5">
                              <span className="text-sm font-medium text-sp-text flex-1 min-w-0 truncate">{role.name}</span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => setRoleConfigs((prev) => prev.map((r, j) => j === i ? { ...r, count: Math.max(1, r.count - 1) } : r))}
                                  className="w-6 h-6 rounded bg-sp-surface border border-sp-border text-sp-muted hover:text-sp-text text-xs flex items-center justify-center"
                                >-</button>
                                <span className="w-6 text-center text-sm text-sp-text font-medium">{role.count}</span>
                                <button
                                  onClick={() => setRoleConfigs((prev) => prev.map((r, j) => j === i ? { ...r, count: r.count + 1 } : r))}
                                  className="w-6 h-6 rounded bg-sp-surface border border-sp-border text-sp-muted hover:text-sp-text text-xs flex items-center justify-center"
                                >+</button>
                                <span className="text-[10px] text-sp-muted w-4">명</span>
                              </div>
                              <button
                                onClick={() => setRoleConfigs((prev) => prev.filter((_, j) => j !== i))}
                                className="w-6 h-6 rounded text-sp-muted/40 hover:text-red-400 flex items-center justify-center shrink-0"
                                title="삭제"
                              >
                                <span className="material-symbols-outlined text-[14px]">close</span>
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="text"
                            value={newRoleName}
                            onChange={(e) => setNewRoleName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newRoleName.trim()) {
                                setRoleConfigs((prev) => [...prev, { name: newRoleName.trim(), count: 1 }]);
                                setNewRoleName('');
                              }
                            }}
                            placeholder="새 역할 이름 입력"
                            className="flex-1 px-2.5 py-1.5 rounded-lg bg-sp-surface border border-sp-border text-sp-text text-sm placeholder-sp-muted/50 focus:outline-none focus:border-sp-accent"
                          />
                          <button
                            onClick={() => {
                              if (newRoleName.trim()) {
                                setRoleConfigs((prev) => [...prev, { name: newRoleName.trim(), count: 1 }]);
                                setNewRoleName('');
                              }
                            }}
                            disabled={!newRoleName.trim()}
                            className="px-3 py-1.5 rounded-lg bg-sp-accent/20 text-sp-accent text-xs font-medium border border-sp-accent/40 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            추가
                          </button>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex flex-wrap gap-1">
                            {roleConfigs.map((r, i) => (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-400/30">
                                {r.name}{r.count > 1 ? ` ×${r.count}` : ''}
                              </span>
                            ))}
                          </div>
                          <span className="text-[10px] text-sp-muted shrink-0 ml-2">
                            총 {totalRoleSlots}명분
                          </span>
                        </div>
                        {(() => {
                          const perGroup = Math.ceil(totalMembers / Math.max(1, effectiveGroupCount));
                          if (totalRoleSlots > 0 && totalRoleSlots < perGroup) {
                            return (
                              <p className="text-[10px] text-amber-400 mt-1">
                                역할 슬롯({totalRoleSlots}) &lt; 모둠 인원({perGroup}): 일부 멤버는 역할 없이 배정됩니다
                              </p>
                            );
                          }
                          if (totalRoleSlots > perGroup) {
                            return (
                              <p className="text-[10px] text-amber-400 mt-1">
                                역할 슬롯({totalRoleSlots}) &gt; 모둠 인원({perGroup}): 한 명이 여러 역할을 맡습니다
                              </p>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Gender tagging */}
                  {genderMode !== 'none' && (
                    <div className="px-5 py-4">
                      <button
                        onClick={() => setShowGenderTag((v) => !v)}
                        className="w-full flex items-center justify-between text-sm text-sp-muted hover:text-sp-text transition-colors mb-2"
                      >
                        <span>♂♀ 성별 지정 (미지정 → ♂ → ♀)</span>
                        <span className="material-symbols-outlined text-icon">
                          {showGenderTag ? 'expand_less' : 'expand_more'}
                        </span>
                      </button>
                      {showGenderTag && (
                        <div>
                          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                            {allStudentNames.filter((n) => !excludedNames.has(n)).map((name) => {
                              const g = genderTags[name];
                              return (
                                <button
                                  key={name}
                                  onClick={() => cycleGender(name)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${genderColor(g)}`}
                                >
                                  {g ? `${genderLabel(g)} ` : ''}{name}
                                </button>
                              );
                            })}
                          </div>
                          <p className="mt-2 text-[10px] text-sp-muted/60 text-center">
                            미지정 학생은 성별 균형 배분에서 제외됩니다. 이 정보는 저장되지 않습니다.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Level tagging */}
                  {balanceLevel && (
                    <div className="px-5 py-4">
                      <button
                        onClick={() => setShowLevelTag((v) => !v)}
                        className="w-full flex items-center justify-between text-sm text-sp-muted hover:text-sp-text transition-colors mb-2"
                      >
                        <span>📊 수준 지정 (미지정 → 상 → 중 → 하)</span>
                        <span className="material-symbols-outlined text-icon">
                          {showLevelTag ? 'expand_less' : 'expand_more'}
                        </span>
                      </button>
                      {showLevelTag && (
                        <div>
                          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                            {allStudentNames.filter((n) => !excludedNames.has(n)).map((name) => {
                              const l = levelTags[name];
                              return (
                                <button
                                  key={name}
                                  onClick={() => cycleLevel(name)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${levelColor(l)}`}
                                >
                                  {l ? `[${levelLabel(l)}] ` : ''}{name}
                                </button>
                              );
                            })}
                          </div>
                          <p className="mt-2 text-[10px] text-sp-muted/60 text-center">
                            미지정 학생은 수준 균형 배분에서 제외됩니다. 이 정보는 저장되지 않습니다.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Constraints: together/apart */}
                  <div className="px-5 py-4">
                    <button
                      onClick={() => setShowConstraints((v) => !v)}
                      className="w-full flex items-center justify-between text-sm text-sp-muted hover:text-sp-text transition-colors mb-2"
                    >
                      <span>🤝 희망/비희망 친구</span>
                      <span className="material-symbols-outlined text-icon">
                        {showConstraints ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>
                    {showConstraints && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-sp-muted mb-1 block">
                            같은 모둠 희망 (한 줄에 이름 2개, 쉼표 또는 공백 구분)
                          </label>
                          <textarea
                            value={togetherInput}
                            onChange={(e) => setTogetherInput(e.target.value)}
                            placeholder={'예:\n김민수 박영희\n이지은, 최수진'}
                            className={`w-full h-20 px-3 py-2 rounded-xl bg-sp-surface border text-sp-text text-sm placeholder-sp-muted/50 resize-none focus:outline-none focus:border-sp-accent ${
                              constraintErrors.length > 0 ? 'border-red-500/30' : 'border-sp-border'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-sp-muted mb-1 block">
                            다른 모둠 희망 (분리 배치)
                          </label>
                          <textarea
                            value={apartInput}
                            onChange={(e) => setApartInput(e.target.value)}
                            placeholder={'예:\n홍길동 김철수'}
                            className={`w-full h-20 px-3 py-2 rounded-xl bg-sp-surface border text-sp-text text-sm placeholder-sp-muted/50 resize-none focus:outline-none focus:border-sp-accent ${
                              constraintErrors.length > 0 ? 'border-red-500/30' : 'border-sp-border'
                            }`}
                          />
                        </div>
                        {constraintErrors.length > 0 && (
                          <div className="text-xs text-red-400 space-y-1">
                            {constraintErrors.map((err, i) => (
                              <p key={i}>⚠️ {err}</p>
                            ))}
                          </div>
                        )}
                        <p className="text-[10px] text-sp-muted/60">
                          * 조건은 이 화면에서만 유효하며 저장되지 않습니다 (프라이버시 보호)
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Action Button */}
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={handleAssign}
                disabled={!canAssign}
                className={`px-12 py-4 rounded-2xl font-bold text-xl transition-all ${
                  canAssign
                    ? 'bg-sp-accent text-white hover:bg-blue-500 shadow-[0_0_24px_rgba(59,130,246,0.35)] active:scale-95'
                    : 'bg-sp-card text-sp-muted border border-sp-border cursor-not-allowed'
                }`}
              >
                {isAnimating ? '편성 중...' : '👥 모둠 편성!'}
              </button>
              {totalMembers > 0 && (
                <span className="text-xs text-sp-muted">{totalMembers}명 참여</span>
              )}
            </div>
          </>
        )}

        {/* === Result View === */}
        {result && (
          <>
            {/* Header bar */}
            <div className="bg-sp-card rounded-xl border border-sp-border px-4 py-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-sp-text">
                {totalMembers}명 → {result.length}모둠
              </h2>
              <div className="flex items-center gap-2">
                <div className="bg-sp-bg rounded-lg p-1 flex gap-1">
                  <button
                    onClick={handleCopy}
                    className="px-2.5 py-1 rounded-md text-sp-muted hover:text-sp-text text-xs transition-all hover:bg-sp-surface"
                  >
                    {copyMsg || '📋 복사'}
                  </button>
                  <button
                    onClick={() => void handleExportExcel()}
                    className="px-2.5 py-1 rounded-md text-sp-muted hover:text-sp-text text-xs transition-all hover:bg-sp-surface"
                  >
                    📊 Excel
                  </button>
                  <button
                    onClick={() => void handleExportHwpx()}
                    className="px-2.5 py-1 rounded-md text-sp-muted hover:text-sp-text text-xs transition-all hover:bg-sp-surface"
                  >
                    📝 한글
                  </button>
                </div>
                <button
                  onClick={handleReshuffle}
                  disabled={isAnimating}
                  className="px-4 py-1.5 rounded-xl bg-sp-accent text-white text-sm font-medium hover:bg-blue-500 active:scale-95 transition-all disabled:opacity-40"
                >
                  {isAnimating ? '...' : '🔀 다시 편성'}
                </button>
                <button
                  onClick={handleReset}
                  className="px-3 py-1.5 rounded-lg text-sp-muted hover:text-sp-text text-xs transition-all"
                >
                  ← 설정으로
                </button>
              </div>
            </div>

            {/* Group cards grid */}
            <div className={`grid gap-4 ${
              result.length <= 3
                ? 'grid-cols-1 sm:grid-cols-3'
                : result.length <= 4
                  ? 'grid-cols-2'
                  : result.length <= 6
                    ? 'grid-cols-2 lg:grid-cols-3'
                    : 'grid-cols-2 lg:grid-cols-4'
            }`}>
              {result.map((group, idx) => {
                const colorIdx = idx % GROUP_COLORS.length;
                const isLocked = lockedGroups.has(idx);
                return (
                  <div
                    key={`${group.label}-${idx}`}
                    className={`group-fade-in relative rounded-xl border bg-gradient-to-br p-4 transition-all ${
                      GROUP_COLORS[colorIdx]
                    } ${isLocked ? 'ring-2 ring-amber-400/60' : ''} ${
                      isAnimating ? 'opacity-50 animate-pulse' : ''
                    }`}
                    style={{ animationDelay: `${idx * 60}ms`, willChange: 'transform' }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className={`text-sm font-bold ${GROUP_TEXT_COLORS[colorIdx]}`}>
                        {group.label}
                      </h3>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-sp-muted">{group.members.length}명</span>
                        <button
                          onClick={() => toggleLock(idx)}
                          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                            isLocked
                              ? 'bg-amber-500/20 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                              : 'text-sp-muted/30 hover:text-sp-muted hover:bg-sp-surface/60'
                          }`}
                          title={isLocked ? '잠금 해제' : '이 모둠 고정'}
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            {isLocked ? 'lock' : 'lock_open'}
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      {group.members.map((member, mIdx) => {
                        const isLeader = member.name === group.leaderName;
                        return (
                          <div
                            key={`${member.name}-${mIdx}`}
                            className={`flex items-center gap-2 px-2 py-1 rounded-lg ${
                              isLeader ? 'bg-amber-500/10 ring-1 ring-amber-400/30' : 'bg-sp-bg/30'
                            }`}
                          >
                            {member.number != null && (
                              <span className="text-[10px] text-sp-muted min-w-[1.5rem] text-right">
                                {member.number}
                              </span>
                            )}
                            <span className={`text-sm font-medium ${isLeader ? 'text-amber-300' : 'text-sp-text'}`}>
                              {member.name}
                            </span>
                            {isLeader && <span className="text-amber-400 text-[10px] shrink-0">★</span>}
                            <span className="flex items-center gap-1 ml-auto shrink-0">
                              {member.role && (
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-400/30 ${
                                    roleAssignMode === 'manual' ? 'cursor-pointer hover:bg-violet-500/25' : ''
                                  }`}
                                  onClick={roleAssignMode === 'manual' ? (e) => { e.stopPropagation(); handleCycleRole(idx, mIdx); } : undefined}
                                  title={roleAssignMode === 'manual' ? '클릭하여 역할 변경' : undefined}
                                >
                                  {member.role}
                                </span>
                              )}
                              {!member.role && roleAssignMode === 'manual' && roleConfigs.length > 0 && (
                                <button
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-sp-surface text-sp-muted/50 border border-sp-border/50 hover:text-sp-muted hover:border-sp-border"
                                  onClick={(e) => { e.stopPropagation(); handleCycleRole(idx, mIdx); }}
                                  title="역할 배정"
                                >
                                  +역할
                                </button>
                              )}
                              {member.gender && (
                                <span className={`text-[10px] ${member.gender === 'M' ? 'text-blue-400' : 'text-pink-400'}`}>
                                  {genderLabel(member.gender)}
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom controls */}
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button
                onClick={handleReshuffle}
                disabled={isAnimating}
                className={`px-8 py-3 rounded-2xl font-bold text-lg transition-all ${
                  !isAnimating
                    ? 'bg-sp-accent text-white hover:bg-blue-500 shadow-lg shadow-blue-500/30 active:scale-95'
                    : 'bg-sp-card text-sp-muted border border-sp-border cursor-not-allowed'
                }`}
              >
                {isAnimating ? '섞는 중...' : '🔀 다시 편성'}
              </button>
              {roleAssignMode !== 'none' && roleConfigs.length > 0 && (
                <button
                  onClick={handleReshuffleRoles}
                  className="px-4 py-3 rounded-2xl text-sp-muted hover:text-violet-300 hover:bg-violet-500/10 border border-sp-border hover:border-violet-400/30 transition-all text-sm font-medium"
                >
                  🎭 역할만 다시 섞기
                </button>
              )}
              {lockedGroups.size > 0 && (
                <p className="text-xs text-amber-400">
                  🔒 {lockedGroups.size}개 모둠 고정
                </p>
              )}
            </div>

            {/* History chips */}
            {history.length > 1 && (
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="text-xs text-sp-muted">이전:</span>
                {history.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => loadHistory(idx)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      idx === 0
                        ? 'bg-sp-accent/20 text-sp-accent border border-sp-accent/40'
                        : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
                    }`}
                  >
                    #{history.length - idx}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* Empty state — rendered inside the student chip area already; this is a fallback */}
      </div>
    </ToolLayout>
  );
}
