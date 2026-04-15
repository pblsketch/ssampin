import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type {
  ClassScheduleData,
  TeacherScheduleData,
} from '@domain/entities/Timetable';

interface LegacyAddClassModalProps {
  onClose: () => void;
}

interface TimetableClassItem {
  classroom: string;
  subject: string;
  periods: string[];
}

const DAYS = ['월', '화', '수', '목', '금', '토'] as const;

function extractFromTeacher(schedule: TeacherScheduleData | null | undefined): TimetableClassItem[] {
  const seen = new Map<string, TimetableClassItem>();
  if (!schedule) return [];
  for (const day of DAYS) {
    const periods = schedule[day];
    if (!periods) continue;
    periods.forEach((slot, idx) => {
      if (!slot) return;
      const key = `${slot.classroom}__${slot.subject}`;
      if (!seen.has(key)) {
        seen.set(key, { classroom: slot.classroom, subject: slot.subject, periods: [] });
      }
      seen.get(key)!.periods.push(`${day} ${idx + 1}교시`);
    });
  }
  return [...seen.values()];
}

function extractFromClass(
  schedule: ClassScheduleData | null | undefined,
  classroom: string,
): TimetableClassItem[] {
  const seen = new Map<string, TimetableClassItem>();
  if (!schedule) return [];
  for (const day of DAYS) {
    const periods = schedule[day];
    if (!periods) continue;
    periods.forEach((slot, idx) => {
      if (!slot?.subject) return;
      const key = `${classroom}__${slot.subject}`;
      if (!seen.has(key)) {
        seen.set(key, { classroom, subject: slot.subject, periods: [] });
      }
      seen.get(key)!.periods.push(`${day} ${idx + 1}교시`);
    });
  }
  return [...seen.values()];
}

type TimetableSource = 'teacher' | 'class';

export function LegacyAddClassModal({ onClose }: LegacyAddClassModalProps) {
  const addClass = useTeachingClassStore((s) => s.addClass);
  const selectClass = useTeachingClassStore((s) => s.selectClass);
  const existingClasses = useTeachingClassStore((s) => s.classes);
  const teacherSchedule = useScheduleStore((s) => s.teacherSchedule);
  const classSchedule = useScheduleStore((s) => s.classSchedule);
  const settingsClassName = useSettingsStore((s) => s.settings.className);

  const [mode, setMode] = useState<'select' | 'manual'>('select');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // 양쪽 시간표에서 각각 추출 (raw, 중복 필터 전)
  const teacherRaw = useMemo(() => extractFromTeacher(teacherSchedule), [teacherSchedule]);
  const classroomLabel = (settingsClassName && settingsClassName.trim()) || '우리 반';
  const classRaw = useMemo(
    () => extractFromClass(classSchedule, classroomLabel),
    [classSchedule, classroomLabel],
  );

  const hasTeacher = teacherRaw.length > 0;
  const hasClass = classRaw.length > 0;

  // 데이터 소스 선택 (양쪽 있으면 교사 우선, 교사 비었으면 학급)
  const [source, setSource] = useState<TimetableSource>(hasTeacher ? 'teacher' : 'class');
  const [sourceUserPicked, setSourceUserPicked] = useState(false);

  // 시간표 데이터가 로드된 뒤 소스 자동 보정 (초기 렌더 시 schedule이 아직 비어있을 수 있음)
  useEffect(() => {
    if (sourceUserPicked) return;
    if (hasTeacher) setSource('teacher');
    else if (hasClass) setSource('class');
  }, [hasTeacher, hasClass, sourceUserPicked]);

  const pickSource = useCallback((s: TimetableSource) => {
    setSource(s);
    setSourceUserPicked(true);
    setSelectedItems(new Set());
  }, []);

  const existingKeys = useMemo(
    () => new Set(existingClasses.map((c) => `${c.name}__${c.subject}`)),
    [existingClasses],
  );

  const activeRaw = source === 'teacher' ? teacherRaw : classRaw;
  const timetableClasses = useMemo(
    () => activeRaw.filter((item) => !existingKeys.has(`${item.classroom}__${item.subject}`)),
    [activeRaw, existingKeys],
  );
  const hiddenCount = activeRaw.length - timetableClasses.length;

  const handleSaveSelected = useCallback(async () => {
    if (selectedItems.size === 0) return;
    setSaving(true);
    try {
      for (const key of selectedItems) {
        const item = timetableClasses.find((c) => `${c.classroom}__${c.subject}` === key);
        if (item) {
          await addClass(item.classroom, item.subject, []);
        }
      }
      const updated = useTeachingClassStore.getState().classes;
      const lastClass = updated[updated.length - 1];
      if (lastClass) selectClass(lastClass.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [selectedItems, timetableClasses, addClass, selectClass, onClose]);

  const handleSaveManual = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedSubject = subject.trim();
    if (!trimmedName || !trimmedSubject) return;
    setSaving(true);
    try {
      await addClass(trimmedName, trimmedSubject, []);
      const updated = useTeachingClassStore.getState().classes;
      const newClass = updated[updated.length - 1];
      if (newClass) selectClass(newClass.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [name, subject, addClass, selectClass, onClose]);

  const toggleItem = (key: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-sp-card border border-sp-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-base font-bold text-sp-text mb-4">학급 추가</h2>

        {/* 모드 전환 탭 */}
        <div className="flex gap-1 mb-4 bg-sp-surface rounded-lg p-0.5">
          <button
            onClick={() => setMode('select')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'select' ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            시간표에서 선택
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'manual' ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            직접 입력
          </button>
        </div>

        {mode === 'select' ? (
          <>
            {/* 데이터 소스 선택 — 양쪽 시간표 있을 때 노출 */}
            {(hasTeacher || hasClass) && (
              <div className="flex gap-1 mb-3 bg-sp-bg rounded-lg p-0.5 border border-sp-border">
                <button
                  type="button"
                  onClick={() => pickSource('teacher')}
                  disabled={!hasTeacher}
                  className={`flex-1 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                    source === 'teacher'
                      ? 'bg-sp-accent text-white'
                      : hasTeacher
                        ? 'text-sp-muted hover:text-sp-text'
                        : 'text-sp-muted/40 cursor-not-allowed'
                  }`}
                >
                  교사 시간표{hasTeacher ? ` (${teacherRaw.length})` : ' · 비어있음'}
                </button>
                <button
                  type="button"
                  onClick={() => pickSource('class')}
                  disabled={!hasClass}
                  className={`flex-1 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                    source === 'class'
                      ? 'bg-sp-accent text-white'
                      : hasClass
                        ? 'text-sp-muted hover:text-sp-text'
                        : 'text-sp-muted/40 cursor-not-allowed'
                  }`}
                >
                  학급 시간표{hasClass ? ` (${classRaw.length})` : ' · 비어있음'}
                </button>
              </div>
            )}

            {timetableClasses.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-sp-muted mb-2">
                  {!hasTeacher && !hasClass
                    ? '등록된 시간표가 없습니다'
                    : activeRaw.length === 0
                      ? source === 'teacher'
                        ? '교사 시간표가 비어있습니다'
                        : '학급 시간표가 비어있습니다'
                      : `모두 이미 등록된 수업입니다 (${hiddenCount}개 숨김)`}
                </p>
                <button
                  onClick={() => setMode('manual')}
                  className="text-xs text-sp-accent hover:underline"
                >
                  직접 입력하기 →
                </button>
              </div>
            ) : (
              <>
                {hiddenCount > 0 && (
                  <p className="text-[11px] text-sp-muted/70 mb-2 px-1">
                    이미 등록된 수업 {hiddenCount}개는 숨겨졌습니다
                  </p>
                )}
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {timetableClasses.map((item) => {
                  const key = `${item.classroom}__${item.subject}`;
                  const isChecked = selectedItems.has(key);
                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                        isChecked ? 'bg-sp-accent/10 ring-1 ring-sp-accent/30' : 'hover:bg-sp-surface/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleItem(key)}
                        className="w-4 h-4 rounded border-sp-border text-sp-accent focus:ring-sp-accent"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-sp-text">{item.classroom}</span>
                          <span className="text-xs text-sp-muted bg-sp-surface px-1.5 py-0.5 rounded">
                            {item.subject}
                          </span>
                        </div>
                        <p className="text-[10px] text-sp-muted mt-0.5 truncate">
                          {item.periods.join(', ')}
                        </p>
                      </div>
                    </label>
                  );
                  })}
                </div>
              </>
            )}

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => void handleSaveSelected()}
                disabled={selectedItems.size === 0 || saving}
                className="flex-1 text-sm bg-sp-accent text-white rounded-lg py-2 hover:bg-sp-accent/80 transition-colors disabled:opacity-40"
              >
                {saving ? '저장 중...' : `${selectedItems.size}개 추가`}
              </button>
              <button
                onClick={onClose}
                className="flex-1 text-sm bg-sp-border text-sp-muted rounded-lg py-2 hover:bg-sp-border/80 transition-colors"
              >
                취소
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-sp-muted mb-1">학급명</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 2-1"
                  autoFocus
                  className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-sp-muted mb-1">과목</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="예: 수학"
                  className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => void handleSaveManual()}
                disabled={!name.trim() || !subject.trim() || saving}
                className="flex-1 text-sm bg-sp-accent text-white rounded-lg py-2 hover:bg-sp-accent/80 transition-colors disabled:opacity-40"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
              <button
                onClick={onClose}
                className="flex-1 text-sm bg-sp-border text-sp-muted rounded-lg py-2 hover:bg-sp-border/80 transition-colors"
              >
                취소
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
