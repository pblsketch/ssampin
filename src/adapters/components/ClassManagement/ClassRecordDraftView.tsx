import { useEffect, useMemo } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { studentKey } from '@domain/entities/TeachingClass';
import { coerceSchoolLevel, teachingStudentRef } from '@domain/entities/RecordDraft';
import {
  RecordDraftView,
  type RecordDraftStudentRow,
} from '@adapters/components/RecordDraft/RecordDraftView';

/** 수업반(교과) 생활기록부 초안 — 과목세특·개인세특·동아리 영역. */
export function ClassRecordDraftView({ classId }: { classId: string }) {
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
    />
  );
}
