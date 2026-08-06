/**
 * ArchiveViewer — 보관함 열람 뷰어 (P3 S3.2, 읽기 전용).
 *
 * 아카이브 JSON을 전용 훅으로 읽어 표시 전용으로 렌더한다.
 * 저장·수정·삭제 액션 없음(삭제는 ArchiveDeleteGate가 별도 담당).
 * 라이브 스토어 무접촉 — 이 화면을 열고 닫아도 라이브 파일은 무변경이다.
 */

import { useMemo, useState } from 'react';
import {
  buildArchivedClassLookup,
  matchesSearch,
  parseArchivedAttachments,
  parseArchivedObservations,
  parseArchivedProgress,
  parseArchivedStudentRecords,
  parseArchivedStudents,
  summarizeArchivedAttendance,
} from './archiveViewerData';
import { readArchiveBinaryAsDataUrl, useArchiveFile } from './useArchiveFile';
import { ArchiveRosterCarryover } from './ArchiveRosterCarryover';

type DomainTab = 'students' | 'records' | 'observations' | 'attendance' | 'progress';

const TABS: ReadonlyArray<{ id: DomainTab; label: string; icon: string }> = [
  { id: 'students', label: '명렬', icon: 'groups' },
  { id: 'records', label: '누가기록', icon: 'edit_note' },
  { id: 'observations', label: '관찰 기록', icon: 'visibility' },
  { id: 'attendance', label: '출결 통계', icon: 'fact_check' },
  { id: 'progress', label: '진도', icon: 'menu_book' },
];

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-8">
      <span aria-hidden className="material-symbols-outlined animate-spin text-sp-accent">
        progress_activity
      </span>
    </div>
  );
}

function ErrorRow({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-sp-border bg-sp-surface px-4 py-6 text-center text-sm text-sp-muted">
      {message}
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-sp-border bg-sp-surface px-4 py-6 text-center text-sm text-sp-muted">
      {message}
    </div>
  );
}

/* ── 명렬 ── */
function StudentsView({ term, query }: { term: string; query: string }) {
  const { loading, data, error } = useArchiveFile(term, 'students.json');
  const students = useMemo(() => parseArchivedStudents(data), [data]);
  if (loading) return <LoadingRow />;
  if (error) return <ErrorRow message={error} />;
  const visible = students.filter((s) => matchesSearch(s.name, query));
  if (visible.length === 0)
    return (
      <>
        {/* 학생 승계(S4.3) — 담임 명렬이 비어 있을 때만 나타나는 opt-in 버튼 */}
        {/* F10c — 전체 되돌리기 없이 명렬만 복원하는 경로가 있음을 알린다(기존 기능의 발견성). */}
        <p className="text-xs leading-relaxed text-sp-muted">
          전체를 되돌리지 않고 <span className="text-sp-text">명렬만</span> 지금 학년도로 가져올
          수도 있어요(담임 명렬이 비어 있을 때).
        </p>
        <ArchiveRosterCarryover term={term} data={data} />
        <EmptyRow message="보관된 명렬이 없어요" />
      </>
    );
  return (
    <>
      {/* 학생 승계(S4.3) — 담임 명렬이 비어 있을 때만 나타나는 opt-in 버튼 */}
      <ArchiveRosterCarryover term={term} data={data} />
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {visible.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-2 rounded-lg border border-sp-border bg-sp-card px-3 py-2"
          >
            <span className="w-8 shrink-0 text-right text-xs text-sp-muted">{s.number ?? '—'}</span>
            <span className="truncate text-sm text-sp-text">{s.name}</span>
            {s.status !== 'active' && (
              <span className="ml-auto shrink-0 rounded bg-sp-surface px-1.5 py-0.5 text-caption text-sp-muted">
                {s.status === 'withdrawn' ? '전출' : s.status === 'transferred' ? '전출' : s.status}
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/* ── 누가기록 ── */
function RecordsView({ term, query }: { term: string; query: string }) {
  const { loading, data, error } = useArchiveFile(term, 'student-records.json');
  const studentsFile = useArchiveFile(term, 'students.json');
  const records = useMemo(() => parseArchivedStudentRecords(data), [data]);
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of parseArchivedStudents(studentsFile.data)) map.set(s.id, s.name);
    return map;
  }, [studentsFile.data]);
  if (loading) return <LoadingRow />;
  if (error) return <ErrorRow message={error} />;
  const visible = records.filter((r) =>
    matchesSearch(`${nameById.get(r.studentId) ?? r.studentId} ${r.content}`, query),
  );
  if (visible.length === 0) return <EmptyRow message="보관된 누가기록이 없어요" />;
  return (
    <ul className="space-y-1.5">
      {visible.map((r) => (
        <li key={r.id} className="rounded-lg border border-sp-border bg-sp-card px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-sp-muted">
            <span className="font-semibold text-sp-text">
              {nameById.get(r.studentId) ?? r.studentId}
            </span>
            <span>{r.date}</span>
            {r.subcategory && (
              <span className="rounded bg-sp-surface px-1.5 py-0.5 text-caption">
                {r.subcategory}
              </span>
            )}
          </div>
          {r.content && (
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-sp-text">
              {r.content}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ── 관찰 기록 (첨부 포함) ── */
function ObservationsView({ term, query }: { term: string; query: string }) {
  const { loading, data, error } = useArchiveFile(term, 'observations.json');
  const classesFile = useArchiveFile(term, 'teaching-classes.json');
  const attachmentsFile = useArchiveFile(term, 'observation-attachments.json');
  const observations = useMemo(() => parseArchivedObservations(data), [data]);
  const lookup = useMemo(() => buildArchivedClassLookup(classesFile.data), [classesFile.data]);
  const attachmentsByObs = useMemo(() => {
    const map = new Map<string, ReturnType<typeof parseArchivedAttachments>[number][]>();
    for (const a of parseArchivedAttachments(attachmentsFile.data)) {
      const list = map.get(a.observationId) ?? [];
      list.push(a);
      map.set(a.observationId, list);
    }
    return map;
  }, [attachmentsFile.data]);
  const [openImages, setOpenImages] = useState<Record<string, string>>({});
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({});

  if (loading) return <LoadingRow />;
  if (error) return <ErrorRow message={error} />;

  const visible = observations.filter((o) => {
    const studentName = lookup.studentName.get(`${o.classId}|${o.studentId}`) ?? o.studentId;
    return matchesSearch(`${studentName} ${o.content} ${o.tags.join(' ')}`, query);
  });
  if (visible.length === 0) return <EmptyRow message="보관된 관찰 기록이 없어요" />;

  const showAttachment = async (attId: string, storageRef: string, mimeType: string) => {
    const { url, error: readError } = await readArchiveBinaryAsDataUrl(term, storageRef, mimeType);
    if (url) setOpenImages((prev) => ({ ...prev, [attId]: url }));
    else if (readError) setImageErrors((prev) => ({ ...prev, [attId]: readError }));
  };

  return (
    <ul className="space-y-1.5">
      {visible.map((o) => {
        const studentName = lookup.studentName.get(`${o.classId}|${o.studentId}`) ?? o.studentId;
        const classLabel = lookup.classLabel.get(o.classId);
        const attachments = attachmentsByObs.get(o.id) ?? [];
        return (
          <li key={o.id} className="rounded-lg border border-sp-border bg-sp-card px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-sp-muted">
              <span className="font-semibold text-sp-text">{studentName}</span>
              {classLabel && <span>{classLabel}</span>}
              <span>{o.date}</span>
              {o.tags.map((t) => (
                <span
                  key={t}
                  className="rounded bg-sp-accent/10 px-1.5 py-0.5 text-caption text-sp-accent"
                >
                  {t}
                </span>
              ))}
            </div>
            {o.content && (
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-sp-text">
                {o.content}
              </p>
            )}
            {attachments.length > 0 && (
              <div className="mt-2 space-y-2">
                {attachments.map((a) => (
                  <div key={a.id}>
                    {openImages[a.id] ? (
                      <img
                        src={openImages[a.id]}
                        alt="관찰 기록 첨부"
                        className="max-h-64 max-w-full rounded-lg border border-sp-border"
                      />
                    ) : imageErrors[a.id] ? (
                      <p className="text-caption text-sp-muted">{imageErrors[a.id]}</p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void showAttachment(a.id, a.storageRef, a.mimeType)}
                        className="flex items-center gap-1 rounded-lg border border-sp-border px-2.5 py-1.5 text-xs text-sp-muted transition-colors hover:text-sp-text"
                      >
                        <span aria-hidden className="material-symbols-outlined text-icon-sm">
                          image
                        </span>
                        첨부 보기
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ── 출결 통계 ── */
function AttendanceView({ term }: { term: string }) {
  const { loading, data, error } = useArchiveFile(term, 'attendance.json');
  const classesFile = useArchiveFile(term, 'teaching-classes.json');
  const summary = useMemo(() => summarizeArchivedAttendance(data), [data]);
  const lookup = useMemo(() => buildArchivedClassLookup(classesFile.data), [classesFile.data]);
  if (loading) return <LoadingRow />;
  if (error) return <ErrorRow message={error} />;
  if (summary.recordCount === 0) return <EmptyRow message="보관된 출결 기록이 없어요" />;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-sp-border bg-sp-card px-4 py-3">
        <p className="text-sm text-sp-text">
          출결 기록 <span className="font-bold">{summary.recordCount}건</span>
          {summary.firstDate && (
            <span className="ml-2 text-xs text-sp-muted">
              {summary.firstDate} ~ {summary.lastDate}
            </span>
          )}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {summary.statusCounts.map((s) => (
            <span
              key={s.label}
              className="rounded-full bg-sp-surface px-2.5 py-1 text-xs text-sp-text"
            >
              {s.label} <span className="font-semibold">{s.count}</span>
            </span>
          ))}
        </div>
      </div>
      <ul className="space-y-1.5">
        {summary.perClass.map((c) => (
          <li
            key={c.classId}
            className="flex items-center justify-between rounded-lg border border-sp-border bg-sp-card px-3 py-2 text-sm"
          >
            <span className="truncate text-sp-text">
              {lookup.classLabel.get(c.classId) ?? c.classId}
            </span>
            <span className="shrink-0 text-xs text-sp-muted">{c.count}건</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── 진도 ── */
function ProgressView({ term, query }: { term: string; query: string }) {
  const { loading, data, error } = useArchiveFile(term, 'curriculum-progress.json');
  const classesFile = useArchiveFile(term, 'teaching-classes.json');
  const entries = useMemo(() => parseArchivedProgress(data), [data]);
  const lookup = useMemo(() => buildArchivedClassLookup(classesFile.data), [classesFile.data]);
  if (loading) return <LoadingRow />;
  if (error) return <ErrorRow message={error} />;
  const visible = entries.filter((e) =>
    matchesSearch(`${lookup.classLabel.get(e.classId) ?? ''} ${e.unit} ${e.lesson}`, query),
  );
  if (visible.length === 0) return <EmptyRow message="보관된 진도 기록이 없어요" />;
  return (
    <ul className="space-y-1.5">
      {visible.map((e) => (
        <li key={e.id} className="rounded-lg border border-sp-border bg-sp-card px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-sp-muted">
            <span className="font-semibold text-sp-text">
              {lookup.classLabel.get(e.classId) ?? e.classId}
            </span>
            <span>
              {e.date}
              {e.period !== null && ` · ${e.period}교시`}
            </span>
            <span className="rounded bg-sp-surface px-1.5 py-0.5 text-caption">
              {e.statusLabel}
            </span>
          </div>
          <p className="mt-1 text-sm text-sp-text">
            {e.unit}
            {e.lesson && <span className="text-sp-muted"> — {e.lesson}</span>}
          </p>
        </li>
      ))}
    </ul>
  );
}

/* ── 컨테이너 ── */

export function ArchiveViewer({ term }: { term: string }) {
  const [tab, setTab] = useState<DomainTab>('students');
  const [query, setQuery] = useState('');

  return (
    <div className="space-y-3 rounded-xl border border-sp-border bg-sp-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="보관함 열람 영역">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t.id
                  ? 'bg-sp-accent text-sp-accent-fg'
                  : 'bg-sp-card text-sp-muted hover:text-sp-text'
              }`}
            >
              <span aria-hidden className="material-symbols-outlined text-icon-sm">
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
        </div>
        {tab !== 'attendance' && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="학생 이름·내용 검색"
            className="ml-auto w-44 rounded-lg border border-sp-border bg-sp-card px-3 py-1.5 text-xs text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
          />
        )}
      </div>

      <div className="max-h-[26rem] overflow-y-auto pr-1">
        {tab === 'students' && <StudentsView term={term} query={query} />}
        {tab === 'records' && <RecordsView term={term} query={query} />}
        {tab === 'observations' && <ObservationsView term={term} query={query} />}
        {tab === 'attendance' && <AttendanceView term={term} />}
        {tab === 'progress' && <ProgressView term={term} query={query} />}
      </div>

      <p className="text-caption leading-relaxed text-sp-muted">
        좌석 배치·설문·과제·루브릭·성적 분석도 함께 보관되어 있어요 — 열람 화면은 준비 중이에요.
        읽기 전용 화면이라 여기서 내용이 바뀌지 않아요.
      </p>
    </div>
  );
}
