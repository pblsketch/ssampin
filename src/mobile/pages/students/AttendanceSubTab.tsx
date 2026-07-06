import React, { useState, useEffect, useCallback } from 'react';
import type { AttendanceStatus, AttendanceReason } from '@domain/entities/Attendance';
import { ATTENDANCE_REASONS } from '@domain/entities/Attendance';
import { useMobileAttendanceStore } from '@mobile/stores/useMobileAttendanceStore';
import { useMobileStudentRecordsStore } from '@mobile/stores/useMobileStudentRecordsStore';
import { STATUS_CONFIG, type SheetStudentInfo } from './shared';
import { AttendanceHistorySummary } from './AttendanceHistorySummary';

// ============================================================
// 출결 서브탭 (기존 출결 UI 추출)
// ============================================================

export function AttendanceSubTab({
  info,
  getRecordForDate,
  onClose,
}: {
  info: SheetStudentInfo;
  getRecordForDate: (
    classId: string,
    period: number,
    dateStr: string,
  ) => import('@domain/entities/Attendance').AttendanceRecord | null;
  onClose: () => void;
}) {
  const saveRecord = useMobileAttendanceStore((s) => s.saveRecord);
  const records = useMobileAttendanceStore((s) => s.records);

  const { currentStatus, currentReason, currentMemo } = React.useMemo((): {
    currentStatus: AttendanceStatus;
    currentReason: AttendanceReason | undefined;
    currentMemo: string;
  } => {
    const record = getRecordForDate(info.classId, info.period, info.date);
    if (!record) return { currentStatus: 'present', currentReason: undefined, currentMemo: '' };
    const found = record.students.find((sa) => {
      const saKey =
        sa.grade != null && sa.classNum != null
          ? `${sa.grade}-${sa.classNum}-${sa.number}`
          : String(sa.number);
      return saKey === info.sKey;
    });
    return {
      currentStatus: found?.status ?? 'present',
      currentReason: found?.reason as AttendanceReason | undefined,
      currentMemo: found?.memo ?? '',
    };
  }, [getRecordForDate, info.classId, info.period, info.date, info.sKey, records]);

  const [reason, setReason] = useState<AttendanceReason | undefined>(currentReason);
  const [memo, setMemo] = useState(currentMemo);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReason(currentReason);
  }, [currentReason]);

  useEffect(() => {
    setMemo(currentMemo);
  }, [currentMemo]);

  const handleStatusChange = useCallback(
    async (newStatus: AttendanceStatus) => {
      setSaving(true);
      const existing = getRecordForDate(info.classId, info.period, info.date);
      const otherStudents = (existing?.students ?? []).filter((sa) => {
        const saKey =
          sa.grade != null && sa.classNum != null
            ? `${sa.grade}-${sa.classNum}-${sa.number}`
            : String(sa.number);
        return saKey !== info.sKey;
      });
      const thisEntry = {
        number: info.number,
        status: newStatus,
        reason: newStatus !== 'present' ? reason || undefined : undefined,
        memo: newStatus !== 'present' ? memo || undefined : undefined,
        ...(info.grade != null ? { grade: info.grade } : {}),
        ...(info.classNum != null ? { classNum: info.classNum } : {}),
      };
      await saveRecord({
        classId: info.classId,
        date: info.date,
        period: info.period,
        students: [...otherStudents, thisEntry],
      });
      if (info.type === 'homeroom') {
        const { bridgeAttendanceRecord } = useMobileStudentRecordsStore.getState();
        await bridgeAttendanceRecord({
          studentId: info.studentId,
          date: info.date,
          status: newStatus,
          reason: newStatus !== 'present' ? reason || undefined : undefined,
          memo: newStatus !== 'present' ? memo || undefined : undefined,
        });
      }
      setSaving(false);
    },
    [getRecordForDate, info, saveRecord, reason, memo],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    const existing = getRecordForDate(info.classId, info.period, info.date);
    const otherStudents = (existing?.students ?? []).filter((sa) => {
      const saKey =
        sa.grade != null && sa.classNum != null
          ? `${sa.grade}-${sa.classNum}-${sa.number}`
          : String(sa.number);
      return saKey !== info.sKey;
    });
    const thisEntry = {
      number: info.number,
      status: currentStatus,
      reason: currentStatus !== 'present' ? reason || undefined : undefined,
      memo: currentStatus !== 'present' ? memo || undefined : undefined,
      ...(info.grade != null ? { grade: info.grade } : {}),
      ...(info.classNum != null ? { classNum: info.classNum } : {}),
    };
    await saveRecord({
      classId: info.classId,
      date: info.date,
      period: info.period,
      students: [...otherStudents, thisEntry],
    });
    if (info.type === 'homeroom') {
      const { bridgeAttendanceRecord } = useMobileStudentRecordsStore.getState();
      await bridgeAttendanceRecord({
        studentId: info.studentId,
        date: info.date,
        status: currentStatus,
        reason: currentStatus !== 'present' ? reason || undefined : undefined,
        memo: currentStatus !== 'present' ? memo || undefined : undefined,
      });
    }
    setSaving(false);
    onClose();
  }, [getRecordForDate, info, saveRecord, onClose, currentStatus, reason, memo]);

  return (
    <div className="px-5 py-5">
      <p className="text-sp-muted text-xs font-medium mb-3">출결 상태</p>
      <div className="flex flex-wrap gap-2">
        {(
          Object.entries(STATUS_CONFIG) as [AttendanceStatus, (typeof STATUS_CONFIG)['present']][]
        ).map(([status, config]) => {
          const isActive = currentStatus === status;
          return (
            <button
              key={status}
              onClick={() => void handleStatusChange(status)}
              disabled={saving}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                isActive
                  ? config.activeColor + ' border-2'
                  : 'border-sp-border text-sp-muted hover:border-sp-text/30'
              } ${saving ? 'opacity-50' : ''}`}
            >
              <span
                className={`material-symbols-outlined text-lg ${isActive ? '' : 'text-sp-muted'}`}
              >
                {config.icon}
              </span>
              {config.label}
            </button>
          );
        })}
      </div>

      {currentStatus !== 'present' && (
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-sp-muted text-xs font-medium mb-2">사유</p>
            <div className="flex flex-wrap gap-1.5">
              {ATTENDANCE_REASONS.map((r) => {
                const isSelected = reason === r;
                return (
                  <button
                    key={r}
                    onClick={() => setReason(isSelected ? undefined : r)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                      isSelected
                        ? 'bg-sp-accent/15 border-sp-accent/40 text-sp-accent'
                        : 'border-sp-border text-sp-muted hover:text-sp-text'
                    }`}
                  >
                    {isSelected && <span className="mr-0.5">&#10003;</span>}
                    {r}
                  </button>
                );
              })}
            </div>
          </div>
          <input
            type="text"
            placeholder="메모 (선택)"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="w-full px-3 py-1.5 glass-input text-xs"
          />
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="w-full mt-4 py-3 bg-sp-accent text-sp-accent-fg text-sm font-bold rounded-xl disabled:opacity-50 transition-all active:scale-[0.98]"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      )}

      {info.type === 'homeroom' && (
        <AttendanceHistorySummary
          studentId={info.studentId}
          studentNumber={info.number}
          studentName={info.name}
        />
      )}
    </div>
  );
}
