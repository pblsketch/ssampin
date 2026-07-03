import React, { useState } from 'react';
import { useBottomSheet } from '@mobile/hooks/useBottomSheet';
import type { SheetStudentInfo } from './shared';
import { AttendanceSubTab } from './AttendanceSubTab';
import { RecordsSubTab } from './RecordsSubTab';
import { ContactSubTab } from './ContactSubTab';

// ============================================================
// 학생 퀵액션 바텀시트
// ============================================================

interface StudentQuickActionSheetProps {
  info: SheetStudentInfo;
  onClose: () => void;
  getRecordForDate: (
    classId: string,
    period: number,
    dateStr: string,
  ) => import('@domain/entities/Attendance').AttendanceRecord | null;
}

type SheetSubTab = 'attendance' | 'records' | 'contact';

export function StudentQuickActionSheet({
  info,
  onClose,
  getRecordForDate,
}: StudentQuickActionSheetProps) {
  const [subTab, setSubTab] = useState<SheetSubTab>('attendance');

  useBottomSheet();

  // 배경 터치로 닫기
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={handleBackdropClick}>
      {/* 반투명 배경 */}
      <div className="absolute inset-0 bg-black/50" />

      {/* 시트 */}
      <div className="relative w-full glass-card rounded-t-2xl pb-safe pt-1">
        {/* 핸들 바 */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-sp-border" />
        </div>

        {/* 학생 정보 */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-sp-border">
          <div className="w-12 h-12 rounded-full bg-sp-accent/15 flex items-center justify-center shrink-0">
            <span className="text-blue-500 font-bold text-lg">{info.name.charAt(0)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sp-muted text-sm">{info.number}번</span>
              <span className="text-sp-text font-bold text-base">{info.name}</span>
            </div>
            {info.grade != null && info.classNum != null && (
              <p className="text-sp-muted text-xs mt-0.5">
                {info.grade}학년 {info.classNum}반
              </p>
            )}
            <p className="text-sp-muted text-xs mt-0.5">
              {info.date} · {info.type === 'homeroom' ? '담임 출결' : '수업 출결'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-sp-card transition-colors">
            <span className="material-symbols-outlined text-sp-muted">close</span>
          </button>
        </div>

        {/* 서브탭 pill */}
        <div className="flex gap-1 mx-5 my-3 p-1 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
          <button
            onClick={() => setSubTab('attendance')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              subTab === 'attendance' ? 'bg-sp-accent text-sp-accent-fg shadow-sm' : 'text-sp-muted'
            }`}
          >
            출결
          </button>
          <button
            onClick={() => setSubTab('records')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              subTab === 'records' ? 'bg-sp-accent text-sp-accent-fg shadow-sm' : 'text-sp-muted'
            }`}
          >
            기록
          </button>
          <button
            onClick={() => setSubTab('contact')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              subTab === 'contact' ? 'bg-sp-accent text-sp-accent-fg shadow-sm' : 'text-sp-muted'
            }`}
          >
            연락처
          </button>
        </div>

        {/* 서브탭 내용 */}
        {subTab === 'attendance' ? (
          <AttendanceSubTab info={info} getRecordForDate={getRecordForDate} onClose={onClose} />
        ) : subTab === 'records' ? (
          <RecordsSubTab studentId={info.studentId} studentName={info.name} />
        ) : (
          <ContactSubTab studentId={info.studentId} />
        )}
      </div>
    </div>
  );
}
