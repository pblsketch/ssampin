/**
 * 빠른 학생 기록 — 학생을 먼저 찾고, **저장 위치를 직접 고른 뒤**, 본문을 쓴다.
 *
 * ★이 화면은 새 저장소를 만들지 않는다. 담임 맥락은 기존 담임 누가기록(`addRecordWithTags`),
 * 교과 맥락은 기존 관찰기록(`useObservationStore.addRecord`)으로 그대로 들어간다.
 * 두 기록의 뜻과 자리가 다르기 때문에 한 레코드로 합치지 않는다.
 *
 * ★저장에 실패하면 화면을 비우지 않는다. 선생님이 방금 쓴 글이 사라지는 것이 이 화면에서
 * 가장 큰 사고다. 여러 명 기록에서 일부만 실패하면 실패한 학생만 남겨 다시 저장하게 한다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useQuickAddStore } from '@adapters/stores/useQuickAddStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { VoiceTypingButton } from '@adapters/components/common/VoiceTypingButton';
import { allSlotsForContext } from '@domain/rules/observationSlots';
import { filterActiveClasses } from '@domain/rules/teachingClassArchive';
import { toLocalDateString } from '@shared/utils/localDate';
import {
  buildQuickRecordCandidates,
  candidatesForClass,
  filterQuickRecordCandidates,
  sharedQuickRecordContexts,
  type QuickRecordCandidate,
  type SharedQuickRecordContext,
} from '@domain/rules/quickStudentRecord';

/** 담임 맥락에서 분류를 고르지 않았을 때 들어갈 카테고리 — 기존 '생활 / 학습' 이다. */
const HOMEROOM_FALLBACK_CATEGORY = 'life';

/** 담임 빠른 분류로 노출할 카테고리(출결 제외) — 출결은 전용 화면의 저장 규칙을 따른다. */
const HOMEROOM_QUICK_CATEGORY_IDS = ['counseling', 'life', 'etc'] as const;

type Step = 'pick' | 'context' | 'compose';

interface Props {
  readonly onClose: () => void;
}

export function QuickAddStudentRecordForm({ onClose }: Props): JSX.Element {
  const focus = useQuickAddStore((s) => s.studentRecordFocus);
  const settings = useSettingsStore((s) => s.settings);
  const students = useStudentStore((s) => s.students);
  const loadStudents = useStudentStore((s) => s.load);
  const classes = useTeachingClassStore((s) => s.classes);
  const loadClasses = useTeachingClassStore((s) => s.load);
  const homeroomRecords = useStudentRecordsStore((s) => s.records);
  const homeroomCategories = useStudentRecordsStore((s) => s.categories);
  const loadHomeroomRecords = useStudentRecordsStore((s) => s.load);
  const addHomeroomRecord = useStudentRecordsStore((s) => s.addRecordWithTags);
  const observationRecords = useObservationStore((s) => s.records);
  const customSlots = useObservationStore((s) => s.customSlots);
  const loadObservations = useObservationStore((s) => s.load);
  const addObservation = useObservationStore((s) => s.addRecord);
  const showToast = useToastStore((s) => s.show);

  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  /** 두 번 누르기 방지는 ref 로 막는다 — useState 는 갱신이 비동기라 두 호출이 같은 옛 값을 본다. */
  const savingRef = useRef(false);

  const [step, setStep] = useState<Step>('pick');
  const [query, setQuery] = useState('');
  const [multiMode, setMultiMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [contextKey, setContextKey] = useState<string | null>(null);
  const [date, setDate] = useState(() => toLocalDateString(new Date()));
  const [content, setContent] = useState('');
  const [classification, setClassification] = useState('');
  const [recentOpen, setRecentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  /** 시작 목록 — 저장에 성공하면 여기로 돌아간다. null 이면 통합 검색이 시작 목록이다. */
  const [originClassId, setOriginClassId] = useState<string | null>(focus?.classId ?? null);
  /** 대시보드 칩으로 들어온 학생을 한 번만 미리 골라 둔다. 저장 위치는 여전히 다음 화면에서 고른다. */
  const preselectedRef = useRef(focus?.studentIdentity ?? null);

  useEffect(() => {
    void loadStudents();
    void loadClasses();
    void loadHomeroomRecords();
    void loadObservations();
  }, [loadStudents, loadClasses, loadHomeroomRecords, loadObservations]);

  // 단축키로 열면 검색창에 바로 커서를 둔다(명세 "단축키").
  useEffect(() => {
    if (preselectedRef.current !== null) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const activeClasses = useMemo(() => filterActiveClasses(classes), [classes]);

  const candidates = useMemo(
    () =>
      buildQuickRecordCandidates({
        homeroom:
          students.length > 0
            ? { className: settings.className, grade: settings.grade, students }
            : null,
        teachingClasses: activeClasses,
      }),
    [students, settings.className, settings.grade, activeClasses],
  );

  const originClass = useMemo(
    () =>
      originClassId === null ? null : (activeClasses.find((c) => c.id === originClassId) ?? null),
    [activeClasses, originClassId],
  );

  /** 시작 목록이 수업반이면 그 명단 안에서만 찾는다. 전체로 넓히는 것은 선생님이 직접 한다. */
  const scoped = useMemo(
    () => (originClass === null ? candidates : candidatesForClass(candidates, originClass.id)),
    [candidates, originClass],
  );
  const visible = useMemo(() => filterQuickRecordCandidates(scoped, query), [scoped, query]);

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => candidates.find((c) => c.identity === id))
        .filter((c): c is QuickRecordCandidate => c !== undefined),
    [selectedIds, candidates],
  );

  // 칩으로 들어온 학생은 명단이 로드된 뒤에야 찾을 수 있다. 찾으면 맥락 고르기로 바로 넘어간다.
  useEffect(() => {
    const wanted = preselectedRef.current;
    if (wanted === null) return;
    if (!candidates.some((c) => c.identity === wanted)) return;
    preselectedRef.current = null;
    setSelectedIds([wanted]);
    setStep('context');
  }, [candidates]);

  const sharedContexts = useMemo(() => sharedQuickRecordContexts(selected), [selected]);
  const activeContext: SharedQuickRecordContext | null = useMemo(
    () => sharedContexts.find((c) => `${c.kind}:${c.contextId}` === contextKey) ?? null,
    [sharedContexts, contextKey],
  );

  /** 최근 기록 — **고른 학생 + 고른 맥락**에 한정한다. 다른 반 기록을 섞어 보여주지 않는다. */
  const recent = useMemo(() => {
    if (activeContext === null || selected.length !== 1) return [];
    const member = activeContext.members[0];
    if (member === undefined) return [];
    if (activeContext.kind === 'homeroom') {
      return homeroomRecords
        .filter((r) => r.studentId === member.studentRef && r.category !== 'attendance')
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 2)
        .map((r) => ({ id: r.id, date: r.date, content: r.content }));
    }
    return observationRecords
      .filter((r) => r.studentId === member.studentRef && r.classId === activeContext.contextId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 2)
      .map((r) => ({ id: r.id, date: r.date, content: r.content }));
  }, [activeContext, selected, homeroomRecords, observationRecords]);

  const classificationOptions = useMemo(() => {
    if (activeContext === null) return [];
    if (activeContext.kind === 'teaching') {
      return allSlotsForContext('teaching', customSlots).map((s) => ({ value: s, label: s }));
    }
    return homeroomCategories
      .filter((c) => (HOMEROOM_QUICK_CATEGORY_IDS as readonly string[]).includes(c.id))
      .map((c) => ({ value: c.id, label: c.name.replace(/\s*\(.*\)\s*$/, '') }));
  }, [activeContext, customSlots, homeroomCategories]);

  const toggleStudent = useCallback(
    (candidate: QuickRecordCandidate) => {
      setContextKey(null);
      if (!multiMode) {
        setSelectedIds([candidate.identity]);
        setStep('context');
        return;
      }
      setSelectedIds((prev) =>
        prev.includes(candidate.identity)
          ? prev.filter((id) => id !== candidate.identity)
          : [...prev, candidate.identity],
      );
    },
    [multiMode],
  );

  const backToPick = useCallback(() => {
    setStep('pick');
    setContextKey(null);
    setRecentOpen(false);
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

  const chooseContext = useCallback((ctx: SharedQuickRecordContext) => {
    setContextKey(`${ctx.kind}:${ctx.contextId}`);
    setClassification('');
    setStep('compose');
    window.setTimeout(() => contentRef.current?.focus(), 0);
  }, []);

  const save = useCallback(
    async (closeAfter: boolean): Promise<void> => {
      const body = content.trim();
      if (activeContext === null || body.length === 0) return;
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);

      const failed: { identity: string; name: string }[] = [];
      let succeeded = 0;
      for (const member of activeContext.members) {
        try {
          if (activeContext.kind === 'homeroom') {
            await addHomeroomRecord({
              studentId: member.studentRef,
              category: classification === '' ? HOMEROOM_FALLBACK_CATEGORY : classification,
              content: body,
              date,
              tags: [],
            });
          } else {
            await addObservation({
              studentId: member.studentRef,
              classId: activeContext.contextId,
              date,
              content: body,
              tags: [],
              slots: classification === '' ? [] : [classification],
            });
          }
          succeeded += 1;
        } catch {
          failed.push({ identity: member.identity, name: member.name });
        }
      }

      savingRef.current = false;
      setSaving(false);

      if (failed.length > 0) {
        // 일부라도 실패하면 성공으로 덮지 않는다. 실패한 학생만 남겨 다시 저장할 수 있게 한다.
        const names = failed.map((f) => f.name).join(', ');
        showToast(
          succeeded > 0
            ? `${succeeded}명은 저장했지만 ${names} 학생은 저장하지 못했어요. 작성 내용은 그대로 두었습니다.`
            : `${names} 학생 기록을 저장하지 못했어요. 작성 내용은 그대로 두었습니다.`,
          'error',
        );
        setSelectedIds(failed.map((f) => f.identity));
        return;
      }

      showToast(
        activeContext.members.length === 1
          ? `${activeContext.members[0]!.name} 학생 기록을 저장했어요`
          : `${activeContext.label}의 ${activeContext.members.length}명에게 기록을 저장했어요`,
        'success',
      );

      if (closeAfter) {
        onClose();
        return;
      }
      setContent('');
      setClassification('');
      setSelectedIds([]);
      backToPick();
    },
    [
      activeContext,
      content,
      classification,
      date,
      addHomeroomRecord,
      addObservation,
      showToast,
      onClose,
      backToPick,
    ],
  );

  const handleComposeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void save(false);
    }
  };

  /* ── 1단계: 학생 찾기 ───────────────────────────────────────────── */
  if (step === 'pick') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && visible.length > 0) {
                e.preventDefault();
                toggleStudent(visible[0]!);
              }
            }}
            placeholder="이름 또는 번호로 학생 찾기"
            aria-label="학생 찾기"
            className="flex-1 rounded-lg border border-sp-border bg-sp-bg px-3 py-2 text-sm text-sp-text outline-none transition-colors focus:border-sp-accent"
          />
          <button
            type="button"
            onClick={() => {
              setMultiMode((prev) => !prev);
              setSelectedIds([]);
              setContextKey(null);
            }}
            aria-pressed={multiMode}
            className={`shrink-0 rounded-lg px-2.5 py-2 text-xs font-sp-medium transition-colors ${
              multiMode
                ? 'bg-sp-accent text-white'
                : 'bg-sp-surface text-sp-muted hover:text-sp-text'
            }`}
          >
            여러 명 기록
          </button>
        </div>

        {originClass !== null && (
          <div className="flex items-center justify-between rounded-lg bg-sp-bg/50 px-3 py-2">
            <span className="text-xs text-sp-text">
              {originClass.subject} · {originClass.name} 명단에서 찾는 중
            </span>
            <button
              type="button"
              onClick={() => setOriginClassId(null)}
              className="text-xs text-sp-accent hover:brightness-110"
            >
              전체 학생에서 찾기
            </button>
          </div>
        )}

        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-sp-muted">
            {candidates.length === 0
              ? '기록할 학생이 없습니다. 담임 명렬이나 수업반 명단을 먼저 등록해 주세요.'
              : '찾는 학생이 없습니다'}
          </p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {visible.map((c) => {
              const picked = selectedIds.includes(c.identity);
              return (
                <li key={c.identity}>
                  <button
                    type="button"
                    onClick={() => toggleStudent(c)}
                    aria-pressed={multiMode ? picked : undefined}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                      picked
                        ? 'border-sp-accent bg-sp-accent/10'
                        : 'border-sp-border hover:border-sp-accent'
                    }`}
                  >
                    <span className="text-sm font-sp-medium text-sp-text">
                      {c.number != null && `${c.number} `}
                      {c.name}
                    </span>
                    <span className="ml-auto text-detail text-sp-muted">
                      기록 위치 {c.contexts.length}곳
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {multiMode && (
          <div className="flex items-center justify-between border-t border-sp-border pt-3">
            <span className="text-xs text-sp-muted">{selectedIds.length}명 선택</span>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={() => setStep('context')}
              className="rounded-lg bg-sp-accent px-4 py-1.5 text-sm font-sp-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              기록 위치 고르기
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ── 2단계: 기록 위치(맥락) 고르기 ─────────────────────────────── */
  if (step === 'context') {
    return (
      <div className="space-y-3">
        <button type="button" onClick={backToPick} className="text-xs text-sp-accent">
          ← 학생 다시 고르기
        </button>
        <div>
          <p className="text-sm font-sp-semibold text-sp-text">
            {selected.map((s) => s.name).join(', ')}
          </p>
          <p className="mt-1 text-xs text-sp-muted">
            어디에서 본 모습인가요? 기록이 저장될 곳을 직접 골라 주세요.
          </p>
        </div>
        {sharedContexts.length === 0 ? (
          <p className="rounded-lg bg-sp-bg/50 p-3 text-xs text-sp-muted">
            고른 학생 전원에게 공통으로 있는 기록 위치가 없습니다. 같은 담임반이나 같은 수업반
            학생끼리 다시 골라 주세요.
          </p>
        ) : (
          <ul className="space-y-2">
            {sharedContexts.map((ctx) => (
              <li key={`${ctx.kind}:${ctx.contextId}`}>
                <button
                  type="button"
                  onClick={() => chooseContext(ctx)}
                  className="flex w-full items-center gap-2 rounded-lg border border-sp-border px-3 py-2.5 text-left text-sm text-sp-text transition-colors hover:border-sp-accent"
                >
                  <span aria-hidden>{ctx.kind === 'homeroom' ? '🏠' : '📘'}</span>
                  <span>{ctx.label}</span>
                  <span className="ml-auto text-detail text-sp-muted">
                    {ctx.kind === 'homeroom' ? '담임 누가기록' : '교과 특기사항'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  /* ── 3단계: 본문 쓰기 ──────────────────────────────────────────── */
  const memberCount = activeContext?.members.length ?? 0;
  return (
    <div className="space-y-3" onKeyDown={handleComposeKeyDown}>
      <button
        type="button"
        onClick={() => {
          setStep('context');
          setContextKey(null);
        }}
        className="text-xs text-sp-accent"
      >
        ← 기록 위치 다시 고르기
      </button>

      <div className="rounded-lg bg-sp-bg/50 px-3 py-2">
        <p className="text-sm font-sp-semibold text-sp-text">
          {activeContext?.members.map((m) => m.name).join(', ')}
        </p>
        <p className="mt-0.5 text-xs text-sp-muted">
          {activeContext?.label}
          {memberCount > 1 && ` · ${memberCount}명에게 같은 내용으로 저장합니다`}
        </p>
      </div>

      <label className="block">
        <span className="text-xs text-sp-muted">날짜</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 block rounded-lg border border-sp-border bg-sp-bg px-3 py-1.5 text-sm text-sp-text outline-none transition-colors focus:border-sp-accent"
        />
      </label>

      <label className="block">
        <span className="text-xs text-sp-muted">관찰 내용</span>
        <textarea
          ref={contentRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="학생의 모습을 본 대로 적어 주세요"
          className="mt-1 w-full resize-none rounded-lg border border-sp-border bg-sp-bg px-3 py-2 text-sm text-sp-text outline-none transition-colors focus:border-sp-accent"
        />
      </label>

      {/* 말로 쓰기는 데스크톱 앱에서만 그려진다(브라우저에서는 null) — 글자 수는 항상 오른쪽 끝에 둔다. */}
      <div className="flex items-center">
        <VoiceTypingButton onFocusField={() => contentRef.current?.focus()} />
        <span className="ml-auto text-detail text-sp-muted">{content.length}/500</span>
      </div>

      {classificationOptions.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-sp-muted">간단 분류 · 고르지 않아도 저장됩니다</p>
          <div className="flex flex-wrap gap-1.5">
            {classificationOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setClassification(classification === opt.value ? '' : opt.value)}
                aria-pressed={classification === opt.value}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  classification === opt.value
                    ? 'bg-sp-accent text-white'
                    : 'bg-sp-surface text-sp-muted hover:text-sp-text'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setRecentOpen((prev) => !prev)}
            aria-expanded={recentOpen}
            className="text-xs text-sp-accent"
          >
            이 맥락의 최근 기록 {recent.length}건 {recentOpen ? '접기' : '보기'}
          </button>
          {recentOpen && (
            <ul className="mt-2 space-y-1">
              {recent.map((r) => (
                <li key={r.id} className="rounded-lg bg-sp-bg/50 px-2.5 py-1.5">
                  <span className="text-detail text-sp-muted">{r.date}</span>
                  <p className="truncate text-xs text-sp-text">{r.content}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-sp-border pt-3">
        <button
          type="button"
          onClick={() => void save(true)}
          disabled={content.trim().length === 0 || saving}
          className="px-3 py-1.5 text-xs text-sp-muted transition-colors hover:text-sp-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          저장하고 닫기
        </button>
        <button
          type="button"
          onClick={() => void save(false)}
          disabled={content.trim().length === 0 || saving}
          className="rounded-lg bg-sp-accent px-4 py-1.5 text-sm font-sp-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? '저장 중…' : memberCount > 1 ? `${memberCount}명에게 기록하기` : '기록하기'}
        </button>
      </div>
    </div>
  );
}
