import { useEffect, useMemo } from 'react';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { RosterEmptyState } from '@adapters/components/common/RosterEmptyState';
import { coerceSchoolLevel, homeroomStudentRef } from '@domain/entities/RecordDraft';
import type { RecordFlowIntent } from '@adapters/components/RecordDraft/recordFlowIntent';
import {
  RecordDraftView,
  type RecordDraftStudentRow,
} from '@adapters/components/RecordDraft/RecordDraftView';

interface HomeroomRecordDraftTabProps {
  /** 기록 탭에서 넘어온 왕복 요청(계획 §4.3). */
  readonly flowIntent?: RecordFlowIntent | null;
  readonly onFlowIntentConsumed?: (requestId: string) => void;
  /** 보드에서 입력·원본으로 돌아가는 요청. */
  readonly onRequestFlow?: (intent: RecordFlowIntent) => void | Promise<void>;
}

/** 담임 학급 생활기록부 초안 — 자율·진로·행동특성(초등은 교과학습발달상황·창체 포함). */
export function HomeroomRecordDraftTab({
  flowIntent,
  onFlowIntentConsumed,
  onRequestFlow,
}: HomeroomRecordDraftTabProps = {}) {
  const load = useStudentStore((s) => s.load);
  const loaded = useStudentStore((s) => s.loaded);
  const students = useStudentStore((s) => s.students);
  const activeStudents = useStudentStore((s) => s.activeStudents);
  const schoolLevel = useSettingsStore((s) => s.settings.schoolLevel);

  useEffect(() => {
    void load();
  }, [load]);

  const level = coerceSchoolLevel(schoolLevel);

  const rows: RecordDraftStudentRow[] = useMemo(() => {
    return activeStudents().map((s, i) => ({
      studentRef: homeroomStudentRef(s.id),
      number: s.studentNumber ?? i + 1,
      name: s.name,
      studentId: s.id,
    }));
    // students 가 바뀌면 activeStudents() 결과도 갱신된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, activeStudents]);

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-sp-muted">로딩 중...</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <RosterEmptyState context="records" />
      </div>
    );
  }

  return (
    <RecordDraftView
      context="homeroom"
      level={level}
      students={rows}
      className="우리 반"
      flowIntent={flowIntent}
      onFlowIntentConsumed={onFlowIntentConsumed}
      {...(onRequestFlow !== undefined ? { onRequestFlow } : {})}
      // 명단을 실제로 읽었는지 그대로 넘긴다. 로딩 중에 "없는 학생"으로 단정하지 않는다.
      rosterLoaded={loaded}
    />
  );
}
