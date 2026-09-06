import { useEffect, useMemo } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { studentKey } from '@domain/entities/TeachingClass';
import { coerceSchoolLevel, teachingStudentRef } from '@domain/entities/RecordDraft';
import type { RecordFlowIntent } from '@adapters/components/RecordDraft/recordFlowIntent';
import {
  RecordDraftView,
  type RecordDraftStudentRow,
} from '@adapters/components/RecordDraft/RecordDraftView';

interface ClassRecordDraftViewProps {
  readonly classId: string;
  /** 입력 화면에서 넘어온 왕복 요청(계획 §4.3). */
  readonly flowIntent?: RecordFlowIntent | null;
  readonly onFlowIntentConsumed?: (requestId: string) => void;
  /** 보드에서 입력·원본으로 돌아가는 요청. */
  readonly onRequestFlow?: (intent: RecordFlowIntent) => void | Promise<void>;
}

/** 수업반(교과) 생활기록부 초안 — 과목세특·개인세특·동아리 영역. */
export function ClassRecordDraftView({
  classId,
  flowIntent,
  onFlowIntentConsumed,
  onRequestFlow,
}: ClassRecordDraftViewProps) {
  const classes = useTeachingClassStore((s) => s.classes);
  const load = useTeachingClassStore((s) => s.load);
  const schoolLevel = useSettingsStore((s) => s.settings.schoolLevel);

  useEffect(() => {
    void load();
  }, [load]);

  const cls = classes.find((c) => c.id === classId);
  const level = coerceSchoolLevel(schoolLevel);

  const students: RecordDraftStudentRow[] = useMemo(() => {
    if (!cls) return [];
    return cls.students.map((st) => {
      const key = studentKey(st);
      return {
        studentRef: teachingStudentRef(cls.id, key),
        number: st.number,
        name: st.name,
        studentKey: key,
      };
    });
  }, [cls]);

  if (!cls) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-sp-muted">수업반을 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <RecordDraftView
      context="teaching"
      level={level}
      students={students}
      classId={cls.id}
      classSubject={cls.subject}
      className={`${cls.name} (${cls.subject})`}
      flowIntent={flowIntent}
      onFlowIntentConsumed={onFlowIntentConsumed}
      {...(onRequestFlow !== undefined ? { onRequestFlow } : {})}
      // 수업반을 찾았다는 것이 곧 명단을 읽었다는 뜻이다. 학생 0명인 반도 로드된 상태다.
      rosterLoaded
    />
  );
}
