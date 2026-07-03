import { useEffect, useMemo, useState } from 'react';
import { useMobileStudentStore } from '@mobile/stores/useMobileStudentStore';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { SegmentedControl } from '@mobile/components/common/SegmentedControl';
import { isStudentActive } from '@domain/rules/studentActivity';
import {
  assignGroups,
  calcGroupCount,
  type GroupingMember,
  type GroupResult,
  type GroupingMethod,
} from '@domain/rules/groupingRules';

interface Props {
  onBack: () => void;
}

type DataSource = 'homeroom' | 'teaching';
type SizeMode = 'byCount' | 'bySize';

const DATA_SOURCE_OPTIONS = [
  { key: 'homeroom', label: '우리 반' },
  { key: 'teaching', label: '수업반' },
] as const;

const SIZE_MODE_OPTIONS = [
  { key: 'byCount', label: '모둠 수' },
  { key: 'bySize', label: '모둠당 인원' },
] as const;

const METHOD_OPTIONS = [
  { key: 'random', label: '무작위' },
  { key: 'number', label: '번호순' },
  { key: 'name', label: '가나다' },
] as const;

/** 모둠 카드 강조색 팔레트 — sp-* 토큰은 알파 수식이 무효라 Tailwind 표준 색만 사용. */
const GROUP_COLORS = [
  { bg: 'bg-blue-500/10', border: 'border-blue-500/25', text: 'text-blue-400' },
  { bg: 'bg-purple-500/10', border: 'border-purple-500/25', text: 'text-purple-400' },
  { bg: 'bg-green-500/10', border: 'border-green-500/25', text: 'text-green-400' },
  { bg: 'bg-orange-500/10', border: 'border-orange-500/25', text: 'text-orange-400' },
  { bg: 'bg-pink-500/10', border: 'border-pink-500/25', text: 'text-pink-400' },
  { bg: 'bg-teal-500/10', border: 'border-teal-500/25', text: 'text-teal-400' },
  { bg: 'bg-amber-500/10', border: 'border-amber-500/25', text: 'text-amber-400' },
  { bg: 'bg-indigo-500/10', border: 'border-indigo-500/25', text: 'text-indigo-400' },
  { bg: 'bg-rose-500/10', border: 'border-rose-500/25', text: 'text-rose-400' },
  { bg: 'bg-cyan-500/10', border: 'border-cyan-500/25', text: 'text-cyan-400' },
] as const;

function Stepper({
  value,
  min,
  max,
  unit,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-11 h-11 rounded-xl bg-sp-card border border-sp-border flex items-center justify-center text-sp-text disabled:opacity-30 active:scale-95 transition-transform"
        aria-label="줄이기"
      >
        <span className="material-symbols-outlined text-xl">remove</span>
      </button>
      <div className="min-w-[72px] text-center">
        <span className="text-2xl font-bold text-sp-text">{value}</span>
        <span className="text-sm text-sp-muted ml-1">{unit}</span>
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-11 h-11 rounded-xl bg-sp-card border border-sp-border flex items-center justify-center text-sp-text disabled:opacity-30 active:scale-95 transition-transform"
        aria-label="늘리기"
      >
        <span className="material-symbols-outlined text-xl">add</span>
      </button>
    </div>
  );
}

function EmptyGuide({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-3 text-center px-6">
      <span className="material-symbols-outlined text-sp-muted text-4xl">group_off</span>
      <p className="text-sp-muted text-sm leading-relaxed">{text}</p>
    </div>
  );
}

export function ToolGroupingPage({ onBack }: Props) {
  const students = useMobileStudentStore((s) => s.students);
  const classes = useMobileTeachingClassStore((s) => s.classes);

  useEffect(() => {
    void useMobileStudentStore.getState().load();
    void useMobileTeachingClassStore.getState().load();
  }, []);

  const [dataSource, setDataSource] = useState<DataSource>('homeroom');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [sizeMode, setSizeMode] = useState<SizeMode>('byCount');
  const [groupCount, setGroupCount] = useState(4);
  const [membersPerGroup, setMembersPerGroup] = useState(4);
  const [method, setMethod] = useState<GroupingMethod>('random');
  const [result, setResult] = useState<GroupResult[] | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  // 수업반 세그먼트 선택 시 첫 번째 수업반 기본 선택
  useEffect(() => {
    if (dataSource === 'teaching' && !selectedClassId && classes.length > 0) {
      setSelectedClassId(classes[0]!.id);
    }
  }, [dataSource, classes, selectedClassId]);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? classes[0] ?? null,
    [classes, selectedClassId],
  );

  const memberPool = useMemo<GroupingMember[]>(() => {
    if (dataSource === 'homeroom') {
      return students.filter(isStudentActive).map((s) => ({
        name: s.name || `${s.studentNumber ?? 0}번`,
        number: s.studentNumber ?? undefined,
      }));
    }
    if (!selectedClass) return [];
    return selectedClass.students.filter(isStudentActive).map((s) => ({
      name: s.name?.trim() ? s.name : `${s.number}번`,
      number: s.number,
    }));
  }, [dataSource, students, selectedClass]);

  // 명단이 바뀌면 이전 편성 결과는 무효화
  useEffect(() => {
    setResult(null);
  }, [dataSource, selectedClassId]);

  const effectiveGroupCount = useMemo(() => {
    if (sizeMode === 'byCount') return groupCount;
    return calcGroupCount(memberPool.length, membersPerGroup);
  }, [sizeMode, groupCount, membersPerGroup, memberPool.length]);

  const canAssign = memberPool.length > 0 && effectiveGroupCount > 0;

  const handleAssign = () => {
    if (!canAssign) return;
    setResult(assignGroups(memberPool, effectiveGroupCount, { method }));
  };

  const handleCopy = () => {
    if (!result || result.length === 0) return;
    const text = result
      .map((g) => `${g.label}\n${g.members.map((m) => m.name).join(', ')}`)
      .join('\n\n');
    navigator.clipboard.writeText(text).then(
      () => {
        setCopyToast('결과를 복사했습니다');
        setTimeout(() => setCopyToast(null), 2500);
      },
      () => {
        setCopyToast('복사에 실패했습니다');
        setTimeout(() => setCopyToast(null), 2500);
      },
    );
  };

  const showHomeroomEmpty = dataSource === 'homeroom' && memberPool.length === 0;
  const showNoTeachingClasses = dataSource === 'teaching' && classes.length === 0;
  const showTeachingClassEmpty =
    dataSource === 'teaching' && classes.length > 0 && memberPool.length === 0;

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-sp-border/30">
        <button onClick={onBack} className="text-sp-muted active:scale-95 transition-transform">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-base font-bold text-sp-text">모둠 편성기</h2>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 데이터소스 */}
        <SegmentedControl
          options={DATA_SOURCE_OPTIONS}
          value={dataSource}
          onChange={setDataSource}
          ariaLabel="명단 선택"
        />

        {/* 수업반 선택 칩 */}
        {dataSource === 'teaching' && classes.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {classes.map((c) => {
              const selected = c.id === selectedClass?.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedClassId(c.id)}
                  className={`shrink-0 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap min-h-[40px] transition-colors ${
                    selected
                      ? 'bg-sp-accent text-sp-accent-fg'
                      : 'bg-sp-card text-sp-muted border border-sp-border'
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        )}

        {showHomeroomEmpty && (
          <EmptyGuide text="우리 반 명단이 없어요. PC 앱에서 학생을 등록한 뒤 동기화하세요." />
        )}
        {showNoTeachingClasses && (
          <EmptyGuide text="수업반이 없어요. PC 앱에서 수업반을 추가한 후 동기화하세요." />
        )}
        {showTeachingClassEmpty && (
          <EmptyGuide text="이 수업반에 학생 명단이 없어요. PC 앱에서 학생을 등록한 뒤 동기화하세요." />
        )}

        {memberPool.length > 0 && (
          <>
            {/* 편성 설정 */}
            <div className="glass-card rounded-xl p-4 space-y-4">
              <p className="text-sm font-semibold text-sp-text">총 {memberPool.length}명</p>

              <div className="space-y-2">
                <p className="text-xs text-sp-muted font-medium">편성 기준</p>
                <SegmentedControl
                  options={SIZE_MODE_OPTIONS}
                  value={sizeMode}
                  onChange={setSizeMode}
                  ariaLabel="편성 기준"
                />
              </div>

              {sizeMode === 'byCount' ? (
                <Stepper value={groupCount} min={2} max={10} unit="모둠" onChange={setGroupCount} />
              ) : (
                <>
                  <Stepper
                    value={membersPerGroup}
                    min={2}
                    max={8}
                    unit="명씩"
                    onChange={setMembersPerGroup}
                  />
                  <p className="text-center text-xs text-sp-muted">
                    약 {effectiveGroupCount}개 모둠으로 편성됩니다
                  </p>
                </>
              )}

              <div className="space-y-2">
                <p className="text-xs text-sp-muted font-medium">편성 방법</p>
                <SegmentedControl
                  options={METHOD_OPTIONS}
                  value={method}
                  onChange={setMethod}
                  ariaLabel="편성 방법"
                />
              </div>

              <button
                type="button"
                onClick={handleAssign}
                disabled={!canAssign}
                className="w-full min-h-[44px] rounded-xl bg-sp-accent text-sp-accent-fg font-semibold active:scale-[0.98] transition-transform disabled:opacity-40"
              >
                {result ? '다시 편성' : '모둠 편성'}
              </button>
            </div>

            {/* 편성 결과 */}
            {result && result.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <p className="text-sm font-semibold text-sp-text">
                    편성 결과 ({result.length}개 모둠)
                  </p>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-xs text-sp-accent font-medium active:scale-95 transition-transform"
                  >
                    <span className="material-symbols-outlined text-base">content_copy</span>
                    결과 복사
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {result.map((g, i) => {
                    const color = GROUP_COLORS[i % GROUP_COLORS.length]!;
                    return (
                      <div
                        key={g.label}
                        className={`rounded-xl border ${color.border} ${color.bg} p-3`}
                      >
                        <p className={`text-sm font-bold mb-1.5 ${color.text}`}>{g.label}</p>
                        <div className="space-y-0.5">
                          {g.members.map((m, mi) => (
                            <p key={`${m.name}-${mi}`} className="text-sm text-sp-text truncate">
                              {m.number != null && (
                                <span className="text-sp-muted mr-1">{m.number}</span>
                              )}
                              {m.name}
                            </p>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {copyToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[90] px-4 py-2 bg-sp-card border border-sp-border rounded-lg shadow-xl text-sm text-sp-text"
        >
          {copyToast}
        </div>
      )}
    </div>
  );
}
