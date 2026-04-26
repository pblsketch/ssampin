import { useState, useMemo, useCallback, useRef } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import type { TeachingClassStudent } from '@domain/entities/TeachingClass';
import { studentKey } from '@domain/entities/TeachingClass';
import { generateTeachingClassRosterTemplate, parseTeachingClassRosterFromExcel } from '@infrastructure/export';
import { useToastStore } from '@adapters/components/common/Toast';
import { STUDENT_STATUS_LABELS, STUDENT_STATUS_COLORS, isInactiveStatus } from '@domain/entities/Student';
import type { StudentStatus } from '@domain/entities/Student';
import { FormatHint } from '../common/FormatHint';
import { UnifiedExportModal } from './UnifiedExportModal';

/* ──────────────────────── 컴포넌트 ──────────────────────── */

interface ClassRosterTabProps {
  classId: string;
}

export function ClassRosterTab({ classId }: ClassRosterTabProps) {
  const classes = useTeachingClassStore((s) => s.classes);
  const updateClass = useTeachingClassStore((s) => s.updateClass);
  const syncGroupStudents = useTeachingClassStore((s) => s.syncGroupStudents);
  const showToast = useToastStore((s) => s.show);

  const cls = classes.find((c) => c.id === classId);
  const students = cls?.students ?? [];

  /* ── 편집 모드 상태 ── */
  const [isEditing, setIsEditing] = useState(false);
  const [sortBy, setSortBy] = useState<'number' | 'name' | 'grade'>('number');
  const [editStudents, setEditStudents] = useState<TeachingClassStudent[]>([]);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [excelPreview, setExcelPreview] = useState<TeachingClassStudent[] | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const excelFileRef = useRef<HTMLInputElement>(null);

  const hasGradeInfo = useMemo(() => {
    const list = isEditing ? editStudents : students;
    return list.some((s) => s.grade != null || s.classNum != null);
  }, [students, isEditing, editStudents]);

  const sortedStudents = useMemo(() => {
    const list = isEditing ? editStudents : cls?.students ?? [];
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'grade':
          if ((a.grade != null) !== (b.grade != null)) return a.grade != null ? -1 : 1;
          if ((a.grade ?? 0) !== (b.grade ?? 0)) return (a.grade ?? 0) - (b.grade ?? 0);
          if ((a.classNum ?? 0) !== (b.classNum ?? 0)) return (a.classNum ?? 0) - (b.classNum ?? 0);
          return a.number - b.number;
        case 'name':
          if ((a.isVacant ?? false) !== (b.isVacant ?? false)) return a.isVacant ? 1 : -1;
          return (a.name || '').localeCompare(b.name || '', 'ko');
        case 'number':
        default:
          if ((a.grade ?? 0) !== (b.grade ?? 0)) return (a.grade ?? 0) - (b.grade ?? 0);
          if ((a.classNum ?? 0) !== (b.classNum ?? 0)) return (a.classNum ?? 0) - (b.classNum ?? 0);
          return a.number - b.number;
      }
    });
  }, [isEditing, editStudents, cls?.students, sortBy]);

  /* ──────────────────────── 편집 모드 ──────────────────────── */

  const startEdit = useCallback(() => {
    if (!cls) return;
    setEditStudents(cls.students.map((s) => ({ ...s })));
    setIsEditing(true);
  }, [cls]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditStudents([]);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!cls) return;
    if (cls.groupId) {
      await syncGroupStudents(cls.groupId, editStudents);
    } else {
      await updateClass({
        ...cls,
        students: editStudents,
      });
    }
    setIsEditing(false);
  }, [cls, editStudents, updateClass, syncGroupStudents]);

  const updateStudentName = useCallback((index: number, name: string) => {
    setEditStudents((prev) => {
      const next = [...prev];
      const existing = next[index];
      if (existing) {
        next[index] = { ...existing, name };
      }
      return next;
    });
  }, []);

  const addRow = useCallback(() => {
    setEditStudents((prev) => {
      const nextNumber = prev.length > 0 ? Math.max(...prev.map((s) => s.number)) + 1 : 1;
      return [...prev, { number: nextNumber, name: '' }];
    });
  }, []);

  const setStudentCount = useCallback((count: number) => {
    if (count < 1) return;
    setEditStudents((prev) => {
      if (count > prev.length) {
        const newRows: TeachingClassStudent[] = [];
        const maxNum = prev.length > 0 ? Math.max(...prev.map((s) => s.number)) : 0;
        for (let i = 0; i < count - prev.length; i++) {
          newRows.push({ number: maxNum + i + 1, name: '' });
        }
        return [...prev, ...newRows];
      }
      return prev.slice(0, count);
    });
  }, []);

  const removeRow = useCallback((index: number) => {
    setEditStudents((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateStudentGrade = useCallback((index: number, grade: number | undefined) => {
    setEditStudents((prev) => {
      const next = [...prev];
      const existing = next[index];
      if (existing) next[index] = { ...existing, grade };
      return next;
    });
  }, []);

  const updateStudentClassNum = useCallback((index: number, classNum: number | undefined) => {
    setEditStudents((prev) => {
      const next = [...prev];
      const existing = next[index];
      if (existing) next[index] = { ...existing, classNum };
      return next;
    });
  }, []);

  const updateStudentNumber = useCallback((index: number, num: number) => {
    setEditStudents((prev) => {
      const next = [...prev];
      const existing = next[index];
      if (existing) next[index] = { ...existing, number: num };
      return next;
    });
  }, []);

  const updateStudentStatus = useCallback((index: number, status: StudentStatus) => {
    setEditStudents((prev) => {
      const next = [...prev];
      const existing = next[index];
      if (existing) {
        const inactive = isInactiveStatus(status);
        next[index] = {
          ...existing,
          status,
          isVacant: inactive ? true : existing.isVacant,
          ...(status === 'active' ? { isVacant: false } : {}),
        };
      }
      return next;
    });
  }, []);

  /* ── 반별 인원 입력 ── */
  const [bulkEntries, setBulkEntries] = useState<Array<{ grade: string; classNum: string; count: string }>>([
    { grade: '', classNum: '', count: '' },
  ]);

  const updateBulkEntry = useCallback((index: number, field: 'grade' | 'classNum' | 'count', value: string) => {
    setBulkEntries((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, [field]: value };
      return next;
    });
  }, []);

  const addBulkEntry = useCallback(() => {
    setBulkEntries((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, { grade: last?.grade ?? '', classNum: '', count: '' }];
    });
  }, []);

  const removeBulkEntry = useCallback((index: number) => {
    setBulkEntries((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
  }, []);

  const applyBulkEntries = useCallback(() => {
    const sorted = [...bulkEntries]
      .map((e) => ({ grade: parseInt(e.grade, 10), classNum: parseInt(e.classNum, 10), count: parseInt(e.count, 10) }))
      .filter((e) => !isNaN(e.grade) && !isNaN(e.classNum) && !isNaN(e.count) && e.count > 0)
      .sort((a, b) => a.grade - b.grade || a.classNum - b.classNum);
    const newStudents: TeachingClassStudent[] = [];
    for (const entry of sorted) {
      for (let i = 1; i <= entry.count; i++) {
        newStudents.push({ number: i, name: '', grade: entry.grade, classNum: entry.classNum });
      }
    }
    if (newStudents.length > 0) {
      setEditStudents(newStudents);
    }
  }, [bulkEntries]);

  const bulkValid = bulkEntries.some((e) => {
    const g = parseInt(e.grade, 10);
    const c = parseInt(e.classNum, 10);
    const n = parseInt(e.count, 10);
    return !isNaN(g) && !isNaN(c) && !isNaN(n) && n > 0;
  });

  const bulkTotal = bulkEntries.reduce((sum, e) => {
    const n = parseInt(e.count, 10);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  const handlePasteImport = useCallback(() => {
    const lines = pasteText.trim().split('\n').filter((line) => line.trim());
    if (lines.length === 0) return;

    const parsed: TeachingClassStudent[] = lines.map((line, idx) => {
      const parts = line.split('\t');
      if (parts.length >= 4) {
        const grade = parseInt(parts[0]!.trim(), 10);
        const classNum = parseInt(parts[1]!.trim(), 10);
        const num = parseInt(parts[2]!.trim(), 10);
        const name = parts[3]!.trim();
        return {
          number: isNaN(num) ? idx + 1 : num,
          name,
          grade: isNaN(grade) ? undefined : grade,
          classNum: isNaN(classNum) ? undefined : classNum,
        };
      }
      if (parts.length >= 2) {
        const num = parseInt(parts[0]!.trim(), 10);
        const name = parts[1]!.trim();
        return { number: isNaN(num) ? idx + 1 : num, name };
      }
      return { number: idx + 1, name: line.trim() };
    });

    setEditStudents(parsed);
    setShowPasteModal(false);
    setPasteText('');
    if (!isEditing) setIsEditing(true);
  }, [pasteText, isEditing]);

  /* ── 엑셀 양식 다운로드 ── */
  const handleDownloadTemplate = useCallback(async () => {
    try {
      const data = await generateTeachingClassRosterTemplate();
      const defaultFileName = '수업반_명렬표_양식.xlsx';

      if (window.electronAPI) {
        const filePath = await window.electronAPI.showSaveDialog({
          title: '명렬표 양식 다운로드',
          defaultPath: defaultFileName,
          filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }],
        });
        if (filePath) {
          await window.electronAPI.writeFile(filePath, data);
          showToast('양식이 저장되었습니다', 'success', {
            label: '파일 열기',
            onClick: () => window.electronAPI?.openFile(filePath),
          });
        }
      } else {
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('양식이 다운로드되었습니다', 'success');
      }
    } catch {
      showToast('양식 다운로드 중 오류가 발생했습니다', 'error');
    }
  }, [showToast]);

  /* ── 엑셀 파일 선택 ── */
  const handleExcelFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.xls') && !file.name.endsWith('.xlsx')) {
      showToast('구형 엑셀(.xls) 파일은 지원되지 않습니다. Excel에서 .xlsx로 다시 저장해주세요.', 'error');
      e.target.value = '';
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseTeachingClassRosterFromExcel(buffer);
      if (parsed.length === 0) {
        showToast('엑셀에서 학생 데이터를 찾을 수 없습니다. 1열=번호, 2열=이름 순서인지 확인해주세요.', 'error');
        e.target.value = '';
        return;
      }
      setExcelPreview(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('End of data reached') || msg.includes('Unexpected')) {
        showToast('파일 형식을 읽을 수 없습니다. .xlsx 파일인지 확인해주세요.', 'error');
      } else {
        showToast('엑셀 파일을 읽는 중 오류가 발생했습니다', 'error');
      }
    }
    e.target.value = '';
  }, [showToast]);

  /* ── 엑셀 가져오기 적용 ── */
  const applyExcelImport = useCallback(async () => {
    if (!excelPreview || !cls) return;
    await updateClass({ ...cls, students: excelPreview });
    showToast(`${excelPreview.length}명의 학생을 가져왔습니다`, 'success');
    setExcelPreview(null);
    if (isEditing) {
      setIsEditing(false);
      setEditStudents([]);
    }
  }, [excelPreview, cls, updateClass, showToast, isEditing]);

  /* ── 붙여넣기 미리보기 ── */
  const parsedPreview = useMemo(() => {
    if (!pasteText.trim()) return [];
    const lines = pasteText.trim().split('\n').filter((line) => line.trim());
    return lines.map((line, idx) => {
      const parts = line.split('\t');
      if (parts.length >= 4) {
        const grade = parseInt(parts[0]!.trim(), 10);
        const classNum = parseInt(parts[1]!.trim(), 10);
        const num = parseInt(parts[2]!.trim(), 10);
        const name = parts[3]!.trim();
        return {
          number: isNaN(num) ? idx + 1 : num,
          name,
          grade: isNaN(grade) ? undefined : grade,
          classNum: isNaN(classNum) ? undefined : classNum,
        };
      }
      if (parts.length >= 2) {
        const num = parseInt(parts[0]!.trim(), 10);
        const name = parts[1]!.trim();
        return { number: isNaN(num) ? idx + 1 : num, name, grade: undefined, classNum: undefined };
      }
      return { number: idx + 1, name: line.trim(), grade: undefined, classNum: undefined };
    });
  }, [pasteText]);


  /* ──────────────────────── 렌더링 ──────────────────────── */

  if (!cls) {
    return (
      <div className="flex items-center justify-center h-64 text-sp-muted">
        <p className="text-sm">학급을 찾을 수 없습니다.</p>
      </div>
    );
  }

  const displayStudents = sortedStudents;

  // 편집 모드에서는 항상 소속 컬럼 표시
  const showGradeCol = isEditing || hasGradeInfo;

  const gridCols = showGradeCol
    ? (isEditing ? 'grid-cols-[7rem_3.5rem_1fr_1fr_5rem_2.5rem]' : 'grid-cols-[4rem_2.5rem_1fr]')
    : (isEditing ? 'grid-cols-[3rem_1fr_1fr_5rem_2.5rem]' : 'grid-cols-[2.5rem_1fr]');

  const groupSiblingCount = cls.groupId
    ? classes.filter((c) => c.groupId === cls.groupId).length
    : 0;

  return (
    <div className="space-y-4">
      {cls.groupId && groupSiblingCount > 1 && (
        <div className="bg-sp-accent/10 border border-sp-accent/30 px-3 py-2 rounded-lg text-xs text-sp-muted">
          이 학급은 <span className="text-sp-text font-medium">{cls.name}</span> 그룹에 속합니다.
          변경사항은 <span className="text-sp-accent font-medium">{groupSiblingCount}</span>개 과목에 공유됩니다.
        </div>
      )}
      {/* ── 헤더: 학생 수 + 편집 버튼 ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-sp-muted">
          총 <span className="text-sp-text font-medium">{cls.students.length}</span>명
        </p>
        <div className="flex items-center gap-2">
          {!isEditing ? (
            <>
              <button
                onClick={() => setShowExportModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-muted hover:text-sp-text bg-sp-card border border-sp-border rounded-lg hover:border-sp-accent/50 transition-colors"
                title="명렬표 내보내기"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                내보내기
              </button>
              <button
                onClick={() => {
                  setShowPasteModal(true);
                  setPasteText('');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-muted hover:text-sp-text bg-sp-card border border-sp-border rounded-lg hover:border-sp-accent/50 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">content_paste</span>
                붙여넣기로 입력
              </button>
              <button
                onClick={() => void handleDownloadTemplate()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-muted hover:text-sp-text bg-sp-card border border-sp-border rounded-lg hover:border-sp-accent/50 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">description</span>
                엑셀 양식
              </button>
              <button
                onClick={() => excelFileRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-muted hover:text-sp-text bg-sp-card border border-sp-border rounded-lg hover:border-sp-accent/50 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">upload_file</span>
                엑셀 가져오기
              </button>
              <button
                onClick={startEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-accent bg-sp-accent/10 rounded-lg hover:bg-sp-accent/20 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">edit</span>
                편집
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setShowPasteModal(true);
                  setPasteText('');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-muted hover:text-sp-text bg-sp-card border border-sp-border rounded-lg hover:border-sp-accent/50 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">content_paste</span>
                붙여넣기로 입력
              </button>
              <button
                onClick={() => void handleDownloadTemplate()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-muted hover:text-sp-text bg-sp-card border border-sp-border rounded-lg hover:border-sp-accent/50 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">description</span>
                엑셀 양식
              </button>
              <button
                onClick={() => excelFileRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-muted hover:text-sp-text bg-sp-card border border-sp-border rounded-lg hover:border-sp-accent/50 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">upload_file</span>
                엑셀 가져오기
              </button>
              <button
                onClick={() => void saveEdit()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-sp-accent rounded-lg hover:bg-sp-accent/80 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">check</span>
                저장
              </button>
              <button
                onClick={cancelEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-muted bg-sp-border rounded-lg hover:bg-sp-border/80 transition-colors"
              >
                취소
              </button>
            </>
          )}
          <input
            ref={excelFileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => void handleExcelFileChange(e)}
          />
          <FormatHint formats=".xlsx" />
        </div>
      </div>

      {/* ── 반별 인원 입력 (편집 모드) ── */}
      {isEditing && (
        <div className="bg-sp-surface border border-sp-border rounded-xl px-4 py-3 space-y-2">
          {bulkEntries.map((entry, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="number"
                value={entry.grade}
                onChange={(e) => updateBulkEntry(i, 'grade', e.target.value)}
                className="w-14 bg-sp-bg border border-sp-border rounded-lg px-2 py-1.5 text-sm text-sp-text text-center focus:outline-none focus:border-sp-accent"
                placeholder="학년"
                min={1}
                max={6}
              />
              <span className="text-xs text-sp-muted">학년</span>
              <input
                type="number"
                value={entry.classNum}
                onChange={(e) => updateBulkEntry(i, 'classNum', e.target.value)}
                className="w-14 bg-sp-bg border border-sp-border rounded-lg px-2 py-1.5 text-sm text-sp-text text-center focus:outline-none focus:border-sp-accent"
                placeholder="반"
                min={1}
                max={30}
              />
              <span className="text-xs text-sp-muted">반</span>
              <input
                type="number"
                value={entry.count}
                onChange={(e) => updateBulkEntry(i, 'count', e.target.value)}
                className="w-14 bg-sp-bg border border-sp-border rounded-lg px-2 py-1.5 text-sm text-sp-text text-center focus:outline-none focus:border-sp-accent"
                placeholder="인원"
                min={1}
              />
              <span className="text-xs text-sp-muted">명</span>
              {bulkEntries.length > 1 && (
                <button
                  onClick={() => removeBulkEntry(i)}
                  className="p-1 text-sp-muted hover:text-red-400 rounded transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
              {i === bulkEntries.length - 1 && (
                <button
                  onClick={addBulkEntry}
                  className="flex items-center gap-0.5 px-2 py-1 text-xs text-sp-accent hover:bg-sp-accent/10 rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  반 추가
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={applyBulkEntries}
              disabled={!bulkValid}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-sp-accent bg-sp-accent/10 rounded-lg
                         hover:bg-sp-accent/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-sm">done_all</span>
              명단 생성
            </button>
            {bulkTotal > 0 && (
              <span className="text-xs text-sp-muted">총 {bulkTotal}명</span>
            )}
          </div>
        </div>
      )}

      {/* ── 통합 테이블 ── */}
      <div className="bg-sp-card border border-sp-border rounded-xl overflow-hidden">
        {/* 테이블 헤더 */}
        <div
          className={`grid items-center px-4 py-2.5 bg-sp-bg/50 text-xs font-medium text-sp-muted ${gridCols}`}
        >
          {showGradeCol && (
            <button
              onClick={() => setSortBy('grade')}
              className={`flex items-center gap-0.5 hover:text-sp-text transition-colors text-left ${sortBy === 'grade' ? 'text-sp-accent' : ''}`}
            >
              소속
              {sortBy === 'grade' && <span className="material-symbols-outlined text-xs">arrow_downward</span>}
            </button>
          )}
          <button
            onClick={() => setSortBy('number')}
            className={`flex items-center gap-0.5 hover:text-sp-text transition-colors text-left ${sortBy === 'number' ? 'text-sp-accent' : ''}`}
          >
            번호
            {sortBy === 'number' && <span className="material-symbols-outlined text-xs">arrow_downward</span>}
          </button>
          {!isEditing ? (
            <button
              onClick={() => setSortBy('name')}
              className={`flex items-center gap-0.5 hover:text-sp-text transition-colors text-left ${sortBy === 'name' ? 'text-sp-accent' : ''}`}
            >
              이름
              {sortBy === 'name' && <span className="material-symbols-outlined text-xs">arrow_downward</span>}
            </button>
          ) : (
            <>
              <button
                onClick={() => setSortBy('name')}
                className={`flex items-center gap-0.5 hover:text-sp-text transition-colors text-left ${sortBy === 'name' ? 'text-sp-accent' : ''}`}
              >
                이름
                {sortBy === 'name' && <span className="material-symbols-outlined text-xs">arrow_downward</span>}
              </button>
              <span />
              <span className="text-center">상태</span>
              <span />
            </>
          )}
        </div>

        {/* 학생 행 */}
        <div className="divide-y divide-sp-border/50">
          {displayStudents.map((student) => {
            const originalIdx = isEditing
              ? editStudents.findIndex((s) => s.number === student.number && s.grade === student.grade && s.classNum === student.classNum)
              : -1;

            const sKey = studentKey(student);

            return (
              <div key={sKey}
                className={`grid items-center px-4 py-2 hover:bg-sp-text/[0.02] transition-colors ${gridCols}`}
              >
                {/* 소속 (학년-반) */}
                {showGradeCol && (
                  isEditing ? (
                    <div className="flex gap-1 pr-1">
                      <input
                        type="number"
                        value={student.grade ?? ''}
                        onChange={(e) => updateStudentGrade(originalIdx, e.target.value ? parseInt(e.target.value, 10) : undefined)}
                        className="w-11 bg-sp-bg border border-sp-border rounded px-1.5 py-1 text-xs text-sp-text text-center focus:outline-none focus:border-sp-accent"
                        placeholder="학년"
                        min={1}
                        max={6}
                      />
                      <span className="text-sp-muted text-xs self-center">-</span>
                      <input
                        type="number"
                        value={student.classNum ?? ''}
                        onChange={(e) => updateStudentClassNum(originalIdx, e.target.value ? parseInt(e.target.value, 10) : undefined)}
                        className="w-11 bg-sp-bg border border-sp-border rounded px-1.5 py-1 text-xs text-sp-text text-center focus:outline-none focus:border-sp-accent"
                        placeholder="반"
                        min={1}
                        max={30}
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-sp-muted">
                      {student.grade != null && student.classNum != null ? `${student.grade}-${student.classNum}` : ''}
                    </span>
                  )
                )}

                {/* 번호 */}
                {isEditing ? (
                  <input
                    type="number"
                    value={student.number}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) updateStudentNumber(originalIdx, v);
                    }}
                    className="w-12 bg-sp-bg border border-sp-border rounded px-1.5 py-1 text-sm text-sp-text text-center focus:outline-none focus:border-sp-accent"
                    min={1}
                  />
                ) : (
                  <span className={`text-sm ${(student.isVacant || isInactiveStatus(student.status)) ? 'text-sp-muted/40' : 'text-sp-muted'}`}>{student.number}</span>
                )}

                {/* 이름 (보기 모드) / 이름 + 상태 (편집 모드) */}
                {isEditing ? (
                  <>
                    {student.isVacant && !isInactiveStatus(student.status) ? (
                      <span className="text-sm text-sp-muted/40 italic">결번</span>
                    ) : (
                      <div className="pr-2">
                        <input
                          type="text"
                          value={student.name}
                          onChange={(e) => updateStudentName(originalIdx, e.target.value)}
                          className={`w-full bg-sp-bg border border-sp-border rounded-lg px-2.5 py-1 text-sm placeholder:text-sp-muted focus:outline-none focus:border-sp-accent ${
                            isInactiveStatus(student.status) ? 'text-sp-muted/50' : 'text-sp-text'
                          }`}
                          placeholder="이름 입력"
                        />
                      </div>
                    )}
                    <div />
                    <div className="flex justify-center">
                      <select
                        value={student.status ?? 'active'}
                        onChange={(e) => updateStudentStatus(originalIdx, e.target.value as StudentStatus)}
                        className={`px-2 py-1 rounded-lg text-xs font-medium border transition-colors focus:outline-none focus:border-sp-accent cursor-pointer
                          ${isInactiveStatus(student.status)
                            ? `${STUDENT_STATUS_COLORS[student.status ?? 'active']} border-transparent`
                            : 'bg-sp-bg border-sp-border text-sp-muted hover:border-sp-accent/50'
                          }`}
                      >
                        {(Object.entries(STUDENT_STATUS_LABELS) as [StudentStatus, string][]).map(([value, label]) => (
                          <option key={value} value={value} className="bg-sp-card text-sp-text">
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex justify-center">
                      <button
                        onClick={() => removeRow(originalIdx)}
                        className="p-1 text-sp-muted hover:text-red-400 rounded transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </div>
                  </>
                ) : (
                  /* 보기 모드: 이름 */
                  student.isVacant && !isInactiveStatus(student.status) ? (
                    <span className="text-sm text-sp-muted/40 italic">결번</span>
                  ) : isInactiveStatus(student.status) ? (
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className="text-sm text-sp-muted/50 line-through">{student.name}</span>
                      <span className={`text-caption font-medium px-1.5 py-0.5 rounded ${STUDENT_STATUS_COLORS[student.status!]}`}>
                        {STUDENT_STATUS_LABELS[student.status!]}
                      </span>
                    </span>
                  ) : (
                    <span className="text-sm text-sp-text whitespace-nowrap">{student.name}</span>
                  )
                )}
              </div>
            );
          })}

          {displayStudents.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-sp-muted">
              등록된 학생이 없습니다
            </div>
          )}
        </div>

        {/* 편집 모드: 수강 인원 + 행 추가 */}
        {isEditing && (
          <div className="border-t border-sp-border/50 p-2 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-sp-muted">수강 인원</span>
              <input
                type="number"
                value={editStudents.length || ''}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) setStudentCount(v);
                }}
                className="w-16 bg-sp-bg border border-sp-border rounded-lg px-2 py-1 text-sm text-sp-text text-center focus:outline-none focus:border-sp-accent"
                min={1}
              />
              <span className="text-xs text-sp-muted">명</span>
            </div>
            <button
              onClick={addRow}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-sp-accent hover:bg-sp-accent/10 rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              1명 추가
            </button>
          </div>
        )}
      </div>

      {/* ── 통합 내보내기 모달 ── */}
      {showExportModal && cls && (
        <UnifiedExportModal
          classId={classId}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* ── 붙여넣기 모달 ── */}
      {showPasteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-sp-card border border-sp-border rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
            <h3 className="text-base font-bold text-sp-text mb-2">붙여넣기로 입력</h3>
            <p className="text-xs text-sp-muted mb-4">
              엑셀이나 한글에서 복사한 명렬표를 붙여넣으세요.<br />
              &quot;학년{'\t'}반{'\t'}번호{'\t'}이름&quot; · &quot;번호{'\t'}이름&quot; · &quot;이름&quot; 형식을 지원합니다.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'1\t2\t5\t김민수\n1\t2\t12\t이영희\n2\t3\t5\t박철수'}
              rows={5}
              className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent resize-none font-mono"
            />
            {parsedPreview.length > 0 && (
              <>
                <div className="mt-3 max-h-48 overflow-y-auto border border-sp-border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-sp-bg/50 sticky top-0">
                      <tr className="text-xs text-sp-muted">
                        {parsedPreview.some((s) => s.grade != null) && <th className="px-3 py-1.5 text-left font-medium">학년</th>}
                        {parsedPreview.some((s) => s.classNum != null) && <th className="px-3 py-1.5 text-left font-medium">반</th>}
                        <th className="px-3 py-1.5 text-left font-medium">번호</th>
                        <th className="px-3 py-1.5 text-left font-medium">이름</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sp-border/50">
                      {parsedPreview.map((s, i) => (
                        <tr key={i} className="text-sp-text">
                          {parsedPreview.some((ps) => ps.grade != null) && <td className="px-3 py-1.5">{s.grade ?? '-'}</td>}
                          {parsedPreview.some((ps) => ps.classNum != null) && <td className="px-3 py-1.5">{s.classNum ?? '-'}</td>}
                          <td className="px-3 py-1.5">{s.number}</td>
                          <td className="px-3 py-1.5">{s.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-sp-muted mt-2">{parsedPreview.length}명 인식됨</p>
              </>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={handlePasteImport}
                disabled={!pasteText.trim()}
                className="flex-1 text-sm bg-sp-accent text-white rounded-lg py-2 hover:bg-sp-accent/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                적용
              </button>
              <button
                onClick={() => setShowPasteModal(false)}
                className="flex-1 text-sm bg-sp-border text-sp-muted rounded-lg py-2 hover:bg-sp-border/80 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 엑셀 가져오기 미리보기 모달 ── */}
      {excelPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-sp-card border border-sp-border rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-sp-text flex items-center gap-2">
                <span className="material-symbols-outlined text-sp-accent">preview</span>
                가져올 학생 미리보기 ({excelPreview.length}명)
              </h3>
              <button
                onClick={() => setExcelPreview(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
              >
                <span className="material-symbols-outlined text-icon-lg">close</span>
              </button>
            </div>
            <p className="text-xs text-red-400 mb-4">주의: 적용 시 기존 명단이 모두 교체됩니다.</p>
            <div className="flex-1 overflow-y-auto mb-4 text-xs">
              <table className="w-full">
                <thead className="sticky top-0 bg-sp-card">
                  <tr className="text-sp-muted border-b border-sp-border">
                    {excelPreview.some((s) => s.grade != null) && <th className="py-1.5 text-left">학년</th>}
                    {excelPreview.some((s) => s.classNum != null) && <th className="py-1.5 text-left">반</th>}
                    <th className="py-1.5 text-left w-16">번호</th>
                    <th className="py-1.5 text-left">이름</th>
                  </tr>
                </thead>
                <tbody>
                  {excelPreview.map((s, i) => (
                    <tr key={i} className="border-b border-sp-border/30">
                      {excelPreview.some((ps) => ps.grade != null) && (
                        <td className="py-1.5 text-sp-muted">{s.grade ?? '-'}</td>
                      )}
                      {excelPreview.some((ps) => ps.classNum != null) && (
                        <td className="py-1.5 text-sp-muted">{s.classNum ?? '-'}</td>
                      )}
                      <td className="py-1.5 text-sp-text font-mono">{s.number}</td>
                      <td className="py-1.5 text-sp-text">
                        {s.isVacant ? <span className="text-red-400 italic">결번</span> : s.name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-3 shrink-0 pt-3 border-t border-sp-border">
              <button
                onClick={() => setExcelPreview(null)}
                className="px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm text-sp-text transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => void applyExcelImport()}
                className="px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors"
              >
                적용하기
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
