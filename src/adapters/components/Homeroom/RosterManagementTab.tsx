import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useBirthdaySync } from '@adapters/hooks/useBirthdaySync';
import { STUDENT_STATUS_LABELS, isInactiveStatus } from '@domain/entities/Student';
import type { StudentStatus } from '@domain/entities/Student';
import type { Student } from '@domain/entities/Student';
/* eslint-disable no-restricted-imports */
import { exportRosterToExcel, parseRosterFromExcel } from '@infrastructure/export/ExcelExporter';
/* eslint-enable no-restricted-imports */
import { FormatHint } from '../common/FormatHint';
import {
  parseClipboardText,
  validateRows,
  toImportStudents,
  generateSampleData,
} from '@domain/rules/rosterImportRules';
import type {
  ParseResult,
  ColumnMapping,
  ColumnType,
  ValidationSummary,
} from '@domain/rules/rosterImportRules';

export function RosterManagementTab() {
  const {
    students,
    loaded,
    load: loadStudents,
    updateStudents,
    setStudentCount,
    updateStudentField,
    changeStatus,
  } = useStudentStore();

  const [isEditing, setIsEditing] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');
  // 3-step wizard state
  const [bulkStep, setBulkStep] = useState<1 | 2 | 3>(1);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [useFirstRowAsHeader, setUseFirstRowAsHeader] = useState(true);
  const [validationResult, setValidationResult] = useState<ValidationSummary | null>(null);
  const prevStudentsRef = useRef<readonly Student[]>([]);
  const rosterFileRef = useRef<HTMLInputElement>(null);
  const [previewStudents, setPreviewStudents] = useState<Array<{ name: string; studentNumber: number; phone: string; parentPhone: string; parentPhoneLabel?: string; parentPhone2?: string; parentPhone2Label?: string; birthDate?: string; isVacant: boolean }> | null>(null);
  // 보호자2 필드가 열려있는 학생 ID 세트
  const [showParent2, setShowParent2] = useState<Set<string>>(new Set());
  // 상태 변경 모달용 상태 (prompt() 대신 사용)
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    studentId: string;
    status: StudentStatus;
  } | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const settings = useSettingsStore((s) => s.settings);
  const showToast = useToastStore((s) => s.show);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  // 보호자2가 이미 입력된 학생은 자동으로 보호자2 필드를 열어둔다
  useEffect(() => {
    const ids = new Set<string>();
    for (const s of students) {
      if (s.parentPhone2) ids.add(s.id);
    }
    if (ids.size > 0) setShowParent2((prev) => new Set([...prev, ...ids]));
  }, [students]);

  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0)),
    [students],
  );

  const activeCount = useMemo(() => students.filter((s) => {
    if (s.status) return s.status === 'active';
    return !s.isVacant;
  }).length, [students]);
  const vacantCount = useMemo(() => students.filter((s) => {
    if (s.status) return s.status !== 'active';
    return !!s.isVacant;
  }).length, [students]);

  const resetBulkImport = useCallback(() => {
    setBulkText('');
    setBulkStep(1);
    setParseResult(null);
    setColumnMappings([]);
    setUseFirstRowAsHeader(true);
    setValidationResult(null);
  }, []);

  const handleBulkImport = useCallback(async () => {
    if (!bulkText.trim()) return;

    const names = bulkText
      .split(/[\n\t,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (names.length === 0) return;

    const newStudents = names.map((name, idx) => ({
      id: `s${Date.now()}_${idx}`,
      name,
      studentNumber: idx + 1,
      phone: '',
      parentPhone: '',
      isVacant: false,
    }));

    prevStudentsRef.current = students;
    await updateStudents(newStudents);
    resetBulkImport();
    setShowBulkImport(false);
    showToast(`${names.length}명의 학생을 등록했습니다`, 'success', {
      label: '실행 취소',
      onClick: () => void updateStudents([...prevStudentsRef.current]),
    });
  }, [bulkText, updateStudents, showToast, students, resetBulkImport]);

  /** Step 1 → Step 2: 텍스트 파싱 후 분기 */
  const handleBulkNext = useCallback(() => {
    const text = bulkText.trim();
    if (!text) return;

    const result = parseClipboardText(text);

    // 단일 열이고 헤더 없음 → 이름만 모드 (구 동작)
    if (result.columns.length === 1 && !result.hasHeader) {
      void handleBulkImport();
      return;
    }

    setParseResult(result);
    setColumnMappings(result.columns);
    setUseFirstRowAsHeader(result.hasHeader);

    const summary = validateRows(result.rows, result.columns);
    setValidationResult(summary);
    setBulkStep(2);
  }, [bulkText, handleBulkImport]);

  /** Step 2에서 컬럼 타입 변경 */
  const handleColumnTypeChange = useCallback((colIdx: number, type: ColumnType) => {
    setColumnMappings((prev) => {
      const next = prev.map((m, i) => (i === colIdx ? { ...m, type } : m));
      if (parseResult) {
        setValidationResult(validateRows(parseResult.rows, next));
      }
      return next;
    });
  }, [parseResult, useFirstRowAsHeader]);

  /** Step 2에서 헤더 토글 변경 */
  const handleHeaderToggle = useCallback((checked: boolean) => {
    setUseFirstRowAsHeader(checked);
    if (parseResult) {
      setValidationResult(validateRows(parseResult.rows, columnMappings));
    }
  }, [parseResult, columnMappings]);

  /** Step 2 → Step 3 */
  const handleBulkStep2Next = useCallback(() => {
    setBulkStep(3);
  }, []);

  /** Step 3 적용 */
  const handleBulkApply = useCallback(async () => {
    if (!parseResult) return;
    const imported = toImportStudents(parseResult.rows, columnMappings);

    const newStudents = imported.map((p, idx) => ({
      id: `s${Date.now()}_${idx}`,
      name: p.name,
      studentNumber: p.studentNumber,
      phone: p.phone,
      parentPhone: p.parentPhone,
      parentPhoneLabel: p.parentPhoneLabel,
      parentPhone2: p.parentPhone2,
      parentPhone2Label: p.parentPhone2Label,
      birthDate: p.birthDate,
      isVacant: p.isVacant,
    }));

    prevStudentsRef.current = students;
    await updateStudents(newStudents);
    resetBulkImport();
    setShowBulkImport(false);
    showToast(`${newStudents.length}명의 학생을 등록했습니다`, 'success', {
      label: '실행 취소',
      onClick: () => void updateStudents([...prevStudentsRef.current]),
    });
  }, [parseResult, useFirstRowAsHeader, columnMappings, students, updateStudents, resetBulkImport, showToast]);

  const handleExportRoster = useCallback(async () => {
    try {
      const data = await exportRosterToExcel(students, settings.grade, settings.className);
      const defaultFileName = '명렬표.xlsx';

      if (window.electronAPI) {
        const filePath = await window.electronAPI.showSaveDialog({
          title: '명렬표 내보내기',
          defaultPath: defaultFileName,
          filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }],
        });
        if (filePath) {
          await window.electronAPI.writeFile(filePath, data);
          showToast('명렬표가 저장되었습니다', 'success', {
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
        a.click();
        URL.revokeObjectURL(url);
        showToast('명렬표가 다운로드되었습니다', 'success');
      }
    } catch {
      showToast('명렬표 내보내기 중 오류가 발생했습니다', 'error');
    }
  }, [students, settings.grade, settings.className, showToast]);

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sp-muted text-lg">데이터 로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <header className="flex items-center justify-between pb-6">
        <div className="flex items-center gap-4">
          <div className="bg-sp-accent/20 p-2 rounded-lg text-sp-accent">
            <span className="material-symbols-outlined">groups</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-sp-text tracking-tight">명렬 관리</h2>
            <p className="text-xs text-sp-muted">
              총 {activeCount}명 (비활성 {vacantCount}명)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 인원 수 조절 */}
          <div className="flex items-center gap-1 px-3 py-2 rounded-lg border border-sp-border bg-sp-card text-sm text-sp-text">
            <button
              onClick={() => void setStudentCount(students.length - 1)}
              disabled={students.length <= 1}
              className="w-6 h-6 flex items-center justify-center rounded border border-sp-border bg-sp-bg hover:bg-sp-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <span className="material-symbols-outlined text-icon-sm">remove</span>
            </button>
            <span className="w-8 text-center font-mono font-bold">{students.length}</span>
            <button
              onClick={() => void setStudentCount(students.length + 1)}
              disabled={students.length >= 50}
              className="w-6 h-6 flex items-center justify-center rounded border border-sp-border bg-sp-bg hover:bg-sp-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <span className="material-symbols-outlined text-icon-sm">add</span>
            </button>
            <span className="ml-1 text-sp-muted">명</span>
          </div>

          <button
            onClick={() => { resetBulkImport(); setShowBulkImport(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm font-medium text-sp-text transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-lg">group_add</span>
            <span>일괄 입력</span>
          </button>

          {/* 엑셀 가져오기 */}
          <div className="flex flex-col items-start gap-1">
            <button
              onClick={() => rosterFileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm font-medium text-sp-text transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-lg">upload_file</span>
              <span>엑셀 가져오기</span>
            </button>
            <FormatHint formats=".xlsx" />
          </div>
          <input
            ref={rosterFileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;

              // .xls 파일 감지
              if (file.name.endsWith('.xls') && !file.name.endsWith('.xlsx')) {
                showToast(
                  '구형 엑셀(.xls) 파일은 지원되지 않습니다. Excel에서 .xlsx로 다시 저장해주세요.',
                  'error',
                );
                e.target.value = '';
                return;
              }

              try {
                const buffer = await file.arrayBuffer();
                const parsed = await parseRosterFromExcel(buffer);
                if (parsed.length === 0) {
                  showToast(
                    '엑셀에서 학생 데이터를 찾을 수 없습니다. 1열=번호, 2열=이름 순서인지 확인해주세요.',
                    'error',
                  );
                  e.target.value = '';
                  return;
                }
                setPreviewStudents(parsed);
              } catch (err) {
                const msg = err instanceof Error ? err.message : '';
                if (msg.includes('End of data reached') || msg.includes('Unexpected')) {
                  showToast(
                    '파일 형식을 읽을 수 없습니다. .xlsx 파일인지 확인해주세요.',
                    'error',
                  );
                } else {
                  showToast('엑셀 파일을 읽는 중 오류가 발생했습니다', 'error');
                }
              }
              e.target.value = '';
            }}
          />

          {/* 내보내기 */}
          <button
            onClick={() => void handleExportRoster()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm font-medium text-sp-text transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-lg">download</span>
            <span>내보내기</span>
          </button>

          <div className="w-px h-8 bg-sp-border" />

          <BirthdaySyncToggle />

          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors shadow-sm ${isEditing
              ? 'border-sp-accent bg-sp-accent/20 text-sp-accent'
              : 'border-sp-border bg-sp-card hover:bg-sp-surface text-sp-text'
              }`}
          >
            <span className="material-symbols-outlined text-lg">edit</span>
            <span>{isEditing ? '편집 완료' : '편집'}</span>
          </button>
        </div>
      </header>

      {/* 명렬표 */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-6xl mx-auto">
          {/* 테이블 헤더 */}
          <div className="grid grid-cols-[36px_36px_minmax(60px,1fr)_120px_64px_120px_64px_120px_96px_56px] gap-1.5 px-3 py-3 border-b border-sp-border text-xs font-bold text-sp-muted uppercase tracking-wider">
            <span>번호</span>
            <span>학번</span>
            <span>이름</span>
            <span>학생 연락처</span>
            <span>관계1</span>
            <span>보호자1 연락처</span>
            <span>관계2</span>
            <span>보호자2 연락처</span>
            <span>생년월일</span>
            <span className="text-center">상태</span>
          </div>

          {/* 학생 목록 */}
          <div className="divide-y divide-sp-border/50">
            {sortedStudents.map((student, idx) => {
              const isVacant = isInactiveStatus(student.status) || !!student.isVacant;
              const hasParent2 = showParent2.has(student.id);
              return (
                <div
                  key={student.id}
                  className={`grid grid-cols-[36px_36px_minmax(60px,1fr)_120px_64px_120px_64px_120px_96px_56px] gap-1.5 px-3 py-2.5 items-center transition-colors ${isVacant ? 'opacity-50 bg-red-500/5' : ''} ${isEditing ? 'hover:bg-sp-accent/5' : 'hover:bg-sp-card'}`}
                >
                  {/* 번호 */}
                  <span className="text-sm text-sp-muted font-mono">{idx + 1}</span>

                  {/* 학번 */}
                  <span className={`text-sm font-mono font-bold ${isVacant ? 'text-red-400/60' : 'text-sp-accent'}`}>
                    {student.studentNumber !== undefined
                      ? String(student.studentNumber).padStart(2, '0')
                      : '--'}
                  </span>

                  {/* 이름 */}
                  {isVacant ? (
                    <span className="text-sm text-sp-muted flex items-center gap-1.5">
                      {student.name ? (
                        <span className="line-through">{student.name}</span>
                      ) : null}
                      <span className="italic text-xs text-red-400/60">결번</span>
                    </span>
                  ) : isEditing ? (
                    <input
                      type="text"
                      className="rounded bg-sp-bg border border-sp-border px-3 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none w-full max-w-xs"
                      defaultValue={student.name}
                      onBlur={(e) => {
                        const newName = e.target.value.trim();
                        if (newName && newName !== student.name) {
                          void updateStudentField(student.id, 'name', newName);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                      placeholder="학생 이름"
                    />
                  ) : (
                    <span className="text-sm text-sp-text font-medium">{student.name}</span>
                  )}

                  {/* 학생 연락처 */}
                  {isEditing && !isVacant ? (
                    <input
                      type="tel"
                      className="rounded bg-sp-bg border border-sp-border px-3 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none w-full"
                      defaultValue={student.phone ?? ''}
                      placeholder="010-0000-0000"
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val !== (student.phone ?? '')) {
                          void updateStudentField(student.id, 'phone', val);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                    />
                  ) : (
                    <span className="text-sm text-sp-muted">{student.phone || '-'}</span>
                  )}

                  {/* 보호자1 관계 라벨 */}
                  {isEditing && !isVacant ? (
                    <select
                      className="rounded bg-sp-bg border border-sp-border px-1 py-1.5 text-xs text-sp-text focus:border-sp-accent focus:outline-none w-full"
                      defaultValue={student.parentPhoneLabel ?? ''}
                      onChange={(e) => {
                        void updateStudentField(student.id, 'parentPhoneLabel', e.target.value);
                      }}
                    >
                      <option value="">선택</option>
                      <option value="아버지">아버지</option>
                      <option value="어머니">어머니</option>
                      <option value="조부모">조부모</option>
                      <option value="기타">기타</option>
                    </select>
                  ) : (
                    <span className="text-xs text-sp-muted">{student.parentPhoneLabel || '-'}</span>
                  )}

                  {/* 보호자1 연락처 */}
                  {isEditing && !isVacant ? (
                    <input
                      type="tel"
                      className="rounded bg-sp-bg border border-sp-border px-3 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none w-full"
                      defaultValue={student.parentPhone ?? ''}
                      placeholder="010-0000-0000"
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val !== (student.parentPhone ?? '')) {
                          void updateStudentField(student.id, 'parentPhone', val);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                    />
                  ) : (
                    <span className="text-sm text-sp-muted">{student.parentPhone || '-'}</span>
                  )}

                  {/* 보호자2 관계 라벨 */}
                  {isEditing && !isVacant ? (
                    hasParent2 ? (
                      <select
                        className="rounded bg-sp-bg border border-sp-border px-1 py-1.5 text-xs text-sp-text focus:border-sp-accent focus:outline-none w-full"
                        defaultValue={student.parentPhone2Label ?? ''}
                        onChange={(e) => {
                          void updateStudentField(student.id, 'parentPhone2Label', e.target.value);
                        }}
                      >
                        <option value="">선택</option>
                        <option value="아버지">아버지</option>
                        <option value="어머니">어머니</option>
                        <option value="조부모">조부모</option>
                        <option value="기타">기타</option>
                      </select>
                    ) : (
                      <span className="text-xs text-sp-muted">-</span>
                    )
                  ) : (
                    <span className="text-xs text-sp-muted">{student.parentPhone2Label || '-'}</span>
                  )}

                  {/* 보호자2 연락처 */}
                  {isEditing && !isVacant ? (
                    hasParent2 ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="tel"
                          className="rounded bg-sp-bg border border-sp-border px-3 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none flex-1 min-w-0"
                          defaultValue={student.parentPhone2 ?? ''}
                          placeholder="010-0000-0000"
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (val !== (student.parentPhone2 ?? '')) {
                              void updateStudentField(student.id, 'parentPhone2', val);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                          }}
                        />
                        <button
                          onClick={() => {
                            void updateStudentField(student.id, 'parentPhone2', '');
                            void updateStudentField(student.id, 'parentPhone2Label', '');
                            setShowParent2((prev) => {
                              const next = new Set(prev);
                              next.delete(student.id);
                              return next;
                            });
                          }}
                          className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-sp-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="보호자2 삭제"
                        >
                          <span className="material-symbols-outlined text-icon-sm">close</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowParent2((prev) => new Set([...prev, student.id]))}
                        className="text-xs text-sp-accent hover:text-blue-400 transition-colors"
                      >
                        + 추가
                      </button>
                    )
                  ) : (
                    <span className="text-sm text-sp-muted">{student.parentPhone2 || '-'}</span>
                  )}

                  {/* 생년월일 */}
                  {isEditing && !isVacant ? (
                    <input
                      type="date"
                      className="rounded bg-sp-bg border border-sp-border px-2 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none w-full"
                      defaultValue={student.birthDate ?? ''}
                      onBlur={(e) => {
                        const val = e.target.value;
                        if (val !== (student.birthDate ?? '')) {
                          void updateStudentField(student.id, 'birthDate', val);
                        }
                      }}
                    />
                  ) : (
                    <span className="text-sm text-sp-muted">
                      {student.birthDate
                        ? student.birthDate.replace(/-/g, '.')
                        : '-'}
                    </span>
                  )}

                  {/* 상태 드롭다운 */}
                  <div className="flex justify-center">
                    {isEditing ? (
                      <select
                        value={student.status ?? 'active'}
                        onChange={(e) => {
                          const newStatus = e.target.value as StudentStatus;
                          if (newStatus !== 'active') {
                            setPendingStatusChange({ studentId: student.id, status: newStatus });
                            setStatusNote('');
                          } else {
                            void changeStatus(student.id, 'active');
                          }
                        }}
                        className={`text-xs rounded px-1.5 py-1 border border-sp-border bg-sp-bg ${
                          isVacant ? 'text-red-400' : 'text-sp-muted'
                        }`}
                      >
                        {Object.entries(STUDENT_STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    ) : isVacant ? (
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                        student.status ? (() => {
                          switch (student.status) {
                            case 'transferred': return 'text-blue-400 bg-blue-500/10';
                            case 'suspended': return 'text-amber-400 bg-amber-500/10';
                            case 'expelled': case 'dropped': return 'text-red-400 bg-red-500/10';
                            case 'withdrawn': return 'text-orange-400 bg-orange-500/10';
                            default: return 'text-red-400 bg-red-500/10';
                          }
                        })() : 'text-red-400 bg-red-500/10'
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {student.status ? STUDENT_STATUS_LABELS[student.status] : '결번'}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 하단 요약 */}
          <div className="flex items-center gap-4 px-4 py-3 border-t border-sp-border text-xs text-sp-muted">
            <span>총 {activeCount}명 (비활성 {vacantCount}명)</span>
          </div>
        </div>

        {/* 안내 메시지 */}
        <div className="max-w-5xl mx-auto mt-4 text-xs text-sp-muted bg-sp-surface rounded-lg px-4 py-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-sm text-sp-accent">info</span>
          <span>여기서 등록한 명렬은 자리배치, 과제수합, 학생기록 등 모든 기능에서 사용됩니다. 자리배치를 따로 설정하지 않아도 명렬만 등록하면 다른 기능을 이용할 수 있어요.</span>
        </div>

        {/* 엑셀 가져오기 미리보기 모달 */}
        {previewStudents && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-sp-card border border-sp-border rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl flex flex-col max-h-[80vh]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-sp-text flex items-center gap-2">
                  <span className="material-symbols-outlined text-sp-accent">preview</span>
                  가져올 학생 미리보기 ({previewStudents.length}명)
                </h3>
                <button
                  onClick={() => setPreviewStudents(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
                </button>
              </div>
              <p className="text-xs text-red-400 mb-4">주의: 적용 시 기존 명단이 모두 교체됩니다.</p>
              <div className="flex-1 overflow-y-auto mb-4 text-xs">
                <table className="w-full">
                  <thead className="sticky top-0 bg-sp-card">
                    <tr className="text-sp-muted border-b border-sp-border">
                      <th className="py-1.5 text-left w-16">번호</th>
                      <th className="py-1.5 text-left">이름</th>
                      <th className="py-1.5 text-left">연락처</th>
                      <th className="py-1.5 text-left">보호자1</th>
                      <th className="py-1.5 text-left">보호자2</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewStudents.map((s) => (
                      <tr key={s.studentNumber} className="border-b border-sp-border/30">
                        <td className="py-1.5 text-sp-text font-mono">{s.studentNumber}</td>
                        <td className="py-1.5 text-sp-text">{s.isVacant ? <span className="text-red-400 italic">결번</span> : s.name}</td>
                        <td className="py-1.5 text-sp-muted">{s.phone || '-'}</td>
                        <td className="py-1.5 text-sp-muted">{s.parentPhone || '-'}</td>
                        <td className="py-1.5 text-sp-muted">{s.parentPhone2 || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-3 shrink-0 pt-3 border-t border-sp-border">
                <button
                  onClick={() => setPreviewStudents(null)}
                  className="px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm text-sp-text transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={async () => {
                    const newStudents = previewStudents.map((p, idx) => ({
                      id: `s${Date.now()}_${idx}`,
                      name: p.name,
                      studentNumber: p.studentNumber,
                      phone: p.phone,
                      parentPhone: p.parentPhone,
                      parentPhoneLabel: p.parentPhoneLabel ?? '',
                      parentPhone2: p.parentPhone2 ?? '',
                      parentPhone2Label: p.parentPhone2Label ?? '',
                      birthDate: p.birthDate ?? '',
                      isVacant: p.isVacant,
                    }));
                    await updateStudents(newStudents);
                    showToast(`${previewStudents.length}명의 학생을 가져왔습니다`, 'success');
                    setPreviewStudents(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors"
                >
                  적용하기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 일괄 입력 모달 — 3단계 마법사 */}
      {showBulkImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          {/* ── Step 1: 붙여넣기 ─────────────────────────────────────────── */}
          {bulkStep === 1 && (
            <div className="bg-sp-card border border-sp-border rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl flex flex-col max-h-[85vh]">
              {/* 헤더 */}
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold text-sp-text flex items-center gap-2">
                  <span className="material-symbols-outlined text-sp-accent">content_paste</span>
                  학생 일괄 입력
                </h3>
                <div className="flex items-center gap-2 text-xs text-sp-muted">
                  <span className="px-2 py-0.5 rounded-full bg-sp-accent/20 text-sp-accent font-medium">1</span>
                  <span>/</span>
                  <span className="px-2 py-0.5 rounded-full bg-sp-surface">2</span>
                  <span>/</span>
                  <span className="px-2 py-0.5 rounded-full bg-sp-surface">3</span>
                </div>
              </div>
              <p className="text-xs text-sp-muted mb-4">엑셀이나 구글 시트에서 복사한 데이터를 붙여넣으세요.</p>

              <textarea
                className="w-full min-h-[240px] bg-sp-bg border border-sp-border rounded-lg p-3 text-sm text-sp-text focus:border-sp-accent focus:outline-none resize-none mb-3 font-mono"
                placeholder={'엑셀이나 구글 시트에서 학생 데이터를 복사하여 붙여넣으세요.\n\n번호  이름  학생연락처  보호자관계  보호자연락처\n1  홍길동  010-1234-5678  어머니  010-9876-5432'}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                autoFocus
              />

              <button
                onClick={() => setBulkText(generateSampleData())}
                className="self-start text-xs text-sp-accent hover:underline mb-4"
              >
                예시 데이터 입력
              </button>

              <div className="flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => { resetBulkImport(); setShowBulkImport(false); }}
                  className="px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm text-sp-text transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleBulkNext}
                  disabled={!bulkText.trim()}
                  className="px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                >
                  다음
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: 컬럼 매핑 & 미리보기 ──────────────────────────────── */}
          {bulkStep === 2 && parseResult && (
            <div className="bg-sp-card border border-sp-border rounded-xl p-6 max-w-4xl w-full mx-4 shadow-2xl flex flex-col max-h-[90vh]">
              {/* 헤더 */}
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold text-sp-text flex items-center gap-2">
                  <span className="material-symbols-outlined text-sp-accent">table_chart</span>
                  컬럼 설정 및 미리보기
                </h3>
                <div className="flex items-center gap-2 text-xs text-sp-muted">
                  <span className="px-2 py-0.5 rounded-full bg-sp-surface">1</span>
                  <span>/</span>
                  <span className="px-2 py-0.5 rounded-full bg-sp-accent/20 text-sp-accent font-medium">2</span>
                  <span>/</span>
                  <span className="px-2 py-0.5 rounded-full bg-sp-surface">3</span>
                </div>
              </div>
              <p className="text-xs text-sp-muted mb-3">
                각 열의 데이터 종류를 확인하고 수정하세요. 신뢰도가 낮은 열은 황색으로 표시됩니다.
              </p>

              {/* 헤더 토글 */}
              {parseResult.hasHeader && (
                <label className="flex items-center gap-2 mb-3 cursor-pointer select-none w-fit">
                  <input
                    type="checkbox"
                    checked={useFirstRowAsHeader}
                    onChange={(e) => handleHeaderToggle(e.target.checked)}
                    className="w-4 h-4 accent-sp-accent"
                  />
                  <span className="text-sm text-sp-text">첫 번째 행을 헤더로 사용</span>
                </label>
              )}

              {/* 테이블 미리보기 */}
              <div className="flex-1 overflow-auto mb-3 rounded-lg border border-sp-border">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-sp-surface z-10">
                    <tr>
                      {columnMappings.map((mapping, colIdx) => {
                        const isLowConf = mapping.confidence === 'low';
                        return (
                          <th
                            key={colIdx}
                            className={`px-3 py-2 text-left border-b border-sp-border font-normal ${isLowConf ? 'border border-amber-500/50' : ''}`}
                          >
                            <div className="text-sp-muted text-caption mb-1 truncate max-w-[120px]">{mapping.headerText}</div>
                            <select
                              value={mapping.type}
                              onChange={(e) => handleColumnTypeChange(colIdx, e.target.value as ColumnType)}
                              className={`w-full rounded bg-sp-bg px-1.5 py-1 text-xs text-sp-text border focus:outline-none focus:border-sp-accent ${isLowConf ? 'border-amber-500/60' : 'border-sp-border'}`}
                            >
                              <option value="number">번호</option>
                              <option value="name">이름</option>
                              <option value="phone">학생연락처</option>
                              <option value="parentPhoneLabel">보호자1관계</option>
                              <option value="parentPhone">보호자1연락처</option>
                              <option value="parentPhone2Label">보호자2관계</option>
                              <option value="parentPhone2">보호자2연락처</option>
                              <option value="birthDate">생년월일</option>
                              <option value="remarks">비고</option>
                              <option value="skip">건너뛰기</option>
                            </select>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const dataRows = parseResult.rows;
                      const previewRows = dataRows.slice(0, 10);
                      const extra = dataRows.length - previewRows.length;
                      return (
                        <>
                          {previewRows.map((row, rowIdx) => {
                            const rowErr = validationResult?.errors.find((e) => e.rowIndex === rowIdx);
                            const rowClass = rowErr
                              ? rowErr.errors.some((e) => e.severity === 'error')
                                ? 'bg-red-500/10'
                                : 'bg-amber-500/5'
                              : '';
                            return (
                              <tr key={rowIdx} className={`border-b border-sp-border/40 hover:bg-sp-surface/50 ${rowClass}`}>
                                {row.cells.map((cell, colIdx) => {
                                  const cellErr = rowErr?.errors.find((e) => e.columnIndex === colIdx);
                                  const cellClass = cellErr
                                    ? cellErr.severity === 'error' ? 'bg-red-500/15 text-red-300'
                                    : 'bg-amber-500/10 text-amber-300'
                                    : 'text-sp-text';
                                  return (
                                    <td
                                      key={colIdx}
                                      className={`px-3 py-1.5 border-r border-sp-border/30 last:border-r-0 ${cellClass}`}
                                      title={cellErr?.message}
                                    >
                                      {cell || <span className="text-sp-muted/50 italic">-</span>}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                          {extra > 0 && (
                            <tr>
                              <td colSpan={columnMappings.length} className="px-3 py-2 text-center text-sp-muted italic">
                                ... 외 {extra}명
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>

              {/* 유효성 요약 */}
              {validationResult && (
                <div className="flex items-center gap-3 text-xs mb-3 px-1">
                  <span className="text-sp-muted">총 {validationResult.totalRows}명</span>
                  {validationResult.errorRows > 0 && (
                    <span className="text-red-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-icon-sm">error</span>
                      {validationResult.errorRows}명 오류
                    </span>
                  )}
                  {validationResult.warningRows > 0 && (
                    <span className="text-amber-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-icon-sm">warning</span>
                      {validationResult.warningRows}명 주의
                    </span>
                  )}
                  {validationResult.errorRows === 0 && validationResult.warningRows === 0 && (
                    <span className="text-green-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-icon-sm">check_circle</span>
                      모두 정상
                    </span>
                  )}
                </div>
              )}

              <div className="flex justify-between gap-3 shrink-0">
                <button
                  onClick={() => setBulkStep(1)}
                  className="px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm text-sp-text transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-icon">arrow_back</span>
                  이전
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => { resetBulkImport(); setShowBulkImport(false); }}
                    className="px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm text-sp-text transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleBulkStep2Next}
                    className="px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors flex items-center gap-1"
                  >
                    다음
                    <span className="material-symbols-outlined text-icon">arrow_forward</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: 확인 & 적용 ──────────────────────────────────────── */}
          {bulkStep === 3 && parseResult && (
            <div className="bg-sp-card border border-sp-border rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl flex flex-col max-h-[85vh]">
              {/* 헤더 */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-sp-text flex items-center gap-2">
                  <span className="material-symbols-outlined text-sp-accent">fact_check</span>
                  확인 및 적용
                </h3>
                <div className="flex items-center gap-2 text-xs text-sp-muted">
                  <span className="px-2 py-0.5 rounded-full bg-sp-surface">1</span>
                  <span>/</span>
                  <span className="px-2 py-0.5 rounded-full bg-sp-surface">2</span>
                  <span>/</span>
                  <span className="px-2 py-0.5 rounded-full bg-sp-accent/20 text-sp-accent font-medium">3</span>
                </div>
              </div>

              {/* 요약 */}
              {(() => {
                const imported = toImportStudents(parseResult.rows, columnMappings);
                return (
                  <>
                    <p className="text-sm text-sp-text mb-3">
                      총 <span className="font-bold text-sp-accent">{imported.length}명</span>의 학생을 등록합니다.
                    </p>

                    {/* 경고 박스 */}
                    <div className="flex items-start gap-2 border border-red-500/40 bg-red-500/10 rounded-lg px-4 py-3 mb-4">
                      <span className="material-symbols-outlined text-red-400 mt-0.5" style={{ fontSize: '18px' }}>warning</span>
                      <p className="text-xs text-red-300 leading-relaxed">
                        주의: 기존 명단이 모두 교체됩니다. 이 작업은 되돌릴 수 없습니다.<br />
                        <span className="text-red-400/70">(적용 후 토스트의 '실행 취소'로 복원 가능)</span>
                      </p>
                    </div>

                    {/* 학생 목록 */}
                    <div className="flex-1 overflow-y-auto border border-sp-border rounded-lg divide-y divide-sp-border/40 mb-4 max-h-[240px]">
                      {imported.map((s, idx) => (
                        <div key={idx} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <span className="text-sp-muted font-mono text-xs w-6 shrink-0">{s.studentNumber}</span>
                          <span className="text-sp-text font-medium">{s.name}</span>
                          {s.phone && <span className="text-xs text-sp-muted">{s.phone}</span>}
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}

              <div className="flex justify-between gap-3 shrink-0">
                <button
                  onClick={() => setBulkStep(2)}
                  className="px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm text-sp-text transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-icon">arrow_back</span>
                  이전
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => { resetBulkImport(); setShowBulkImport(false); }}
                    className="px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm text-sp-text transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => void handleBulkApply()}
                    className="px-5 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-bold transition-colors"
                  >
                    적용하기
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 상태 변경 사유 입력 모달 (window.prompt 대체) */}
      {pendingStatusChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-sp-card border border-sp-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-sp-text mb-2">
              {STUDENT_STATUS_LABELS[pendingStatusChange.status]} 처리
            </h3>
            <p className="text-sm text-sp-muted mb-4">
              사유를 입력하세요 (선택)
            </p>
            <input
              type="text"
              className="w-full rounded-lg bg-sp-bg border border-sp-border px-3 py-2 text-sm text-sp-text focus:border-sp-accent focus:outline-none mb-4"
              placeholder="예: 2026.3.27 OO학교로 전출"
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void changeStatus(pendingStatusChange.studentId, pendingStatusChange.status, statusNote);
                  setPendingStatusChange(null);
                }
              }}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPendingStatusChange(null)}
                className="px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm text-sp-text transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  void changeStatus(pendingStatusChange.studentId, pendingStatusChange.status, statusNote);
                  setPendingStatusChange(null);
                }}
                className="px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BirthdaySyncToggle() {
  const { toggle, syncEnabled } = useBirthdaySync();
  const [loading, setLoading] = useState(false);
  const showToast = useToastStore((s) => s.show);

  const handleToggle = async () => {
    setLoading(true);
    try {
      const next = !syncEnabled;
      await toggle(next);
      showToast(
        next ? '학생 생일이 일정에 등록되었습니다' : '생일 일정이 제거되었습니다',
        'success',
      );
    } catch {
      showToast('생일 동기화 중 오류가 발생했습니다', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={() => void handleToggle()}
      disabled={loading}
      title={syncEnabled ? '생일 일정 등록됨 (클릭하여 해제)' : '생일을 일정에 등록'}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors shadow-sm ${
        syncEnabled
          ? 'border-pink-500/40 bg-pink-500/15 text-pink-400'
          : 'border-sp-border bg-sp-card hover:bg-sp-surface text-sp-muted'
      } ${loading ? 'opacity-50' : ''}`}
    >
      <span style={{ fontSize: '16px' }}>🎂</span>
      <span>{syncEnabled ? '생일 등록됨' : '생일 등록'}</span>
    </button>
  );
}
