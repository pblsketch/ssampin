import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useBirthdaySync } from '@adapters/hooks/useBirthdaySync';
/* eslint-disable no-restricted-imports */
import { exportRosterToExcel, parseRosterFromExcel } from '@infrastructure/export/ExcelExporter';
/* eslint-enable no-restricted-imports */

export function RosterManagementTab() {
  const {
    students,
    loaded,
    load: loadStudents,
    updateStudents,
    setStudentCount,
    updateStudentField,
    toggleVacant,
  } = useStudentStore();

  const [isEditing, setIsEditing] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const rosterFileRef = useRef<HTMLInputElement>(null);
  const [previewStudents, setPreviewStudents] = useState<Array<{ name: string; studentNumber: number; phone: string; parentPhone: string; parentPhoneLabel?: string; parentPhone2?: string; parentPhone2Label?: string; birthDate?: string; isVacant: boolean }> | null>(null);
  // 보호자2 필드가 열려있는 학생 ID 세트
  const [showParent2, setShowParent2] = useState<Set<string>>(new Set());
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

  const activeCount = useMemo(() => students.filter((s) => !s.isVacant).length, [students]);
  const vacantCount = useMemo(() => students.filter((s) => s.isVacant).length, [students]);

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

    await updateStudents(newStudents);
    setBulkText('');
    setShowBulkImport(false);
    showToast(`${names.length}명의 학생을 등록했습니다`, 'success');
  }, [bulkText, updateStudents, showToast]);

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
              총 {activeCount}명 (결번 {vacantCount}명)
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
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>remove</span>
            </button>
            <span className="w-8 text-center font-mono font-bold">{students.length}</span>
            <button
              onClick={() => void setStudentCount(students.length + 1)}
              disabled={students.length >= 50}
              className="w-6 h-6 flex items-center justify-center rounded border border-sp-border bg-sp-bg hover:bg-sp-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add</span>
            </button>
            <span className="ml-1 text-sp-muted">명</span>
          </div>

          <button
            onClick={() => setShowBulkImport(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm font-medium text-sp-text transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-lg">group_add</span>
            <span>일괄 입력</span>
          </button>

          {/* 엑셀 가져오기 */}
          <button
            onClick={() => rosterFileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm font-medium text-sp-text transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-lg">upload_file</span>
            <span>엑셀 가져오기</span>
          </button>
          <input
            ref={rosterFileRef}
            type="file"
            accept=".xlsx,.xls"
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
        <div className="w-full max-w-5xl mx-auto overflow-x-auto">
          {/* 테이블 헤더 */}
          <div className="grid grid-cols-[50px_50px_minmax(100px,1fr)_160px_80px_160px_80px_160px_120px_80px] gap-2 px-4 py-3 border-b border-sp-border text-xs font-bold text-sp-muted uppercase tracking-wider min-w-[1040px]">
            <span>번호</span>
            <span>학번</span>
            <span>이름</span>
            <span>학생 연락처</span>
            <span>관계1</span>
            <span>보호자1 연락처</span>
            <span>관계2</span>
            <span>보호자2 연락처</span>
            <span>생년월일</span>
            <span className="text-center">결번</span>
          </div>

          {/* 학생 목록 */}
          <div className="divide-y divide-sp-border/50">
            {sortedStudents.map((student, idx) => {
              const isVacant = !!student.isVacant;
              const hasParent2 = showParent2.has(student.id);
              return (
                <div
                  key={student.id}
                  className={`grid grid-cols-[50px_50px_minmax(100px,1fr)_160px_80px_160px_80px_160px_120px_80px] gap-2 px-4 py-3 items-center transition-colors min-w-[1040px] ${isVacant ? 'opacity-50 bg-red-500/5' : ''} ${isEditing ? 'hover:bg-sp-accent/5' : 'hover:bg-sp-card'}`}
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
                    <span className="text-sm text-sp-muted italic line-through">결번</span>
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
                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
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

                  {/* 결번 토글 */}
                  <div className="flex justify-center">
                    {isEditing ? (
                      <button
                        onClick={() => void toggleVacant(student.id)}
                        className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${isVacant
                          ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                          : 'bg-sp-border/20 text-sp-muted hover:bg-sp-border/40'
                          }`}
                        title={isVacant ? '결번 해제' : '결번 설정'}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                          block
                        </span>
                      </button>
                    ) : isVacant ? (
                      <span className="inline-flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        결번
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 하단 요약 */}
          <div className="flex items-center gap-4 px-4 py-3 border-t border-sp-border text-xs text-sp-muted">
            <span>총 {activeCount}명 (결번 {vacantCount}명)</span>
          </div>
        </div>

        {/* 안내 메시지 */}
        <div className="max-w-5xl mx-auto mt-4 text-xs text-sp-muted bg-sp-surface rounded-lg px-4 py-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-sm text-sp-accent">info</span>
          <span>여기서 등록한 명렬은 자리배치, 과제수합, 학생기록 등 모든 기능에서 사용됩니다. 자리배치를 따로 설정하지 않아도 명렬만 등록하면 다른 기능을 이용할 수 있어요.</span>
        </div>

        {/* 엑셀 가져오기 미리보기 */}
        {previewStudents && (
          <div className="max-w-5xl mx-auto mt-4 p-4 rounded-lg bg-sp-surface border border-sp-border">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-sp-text flex items-center gap-2">
                <span className="material-symbols-outlined text-sp-accent" style={{ fontSize: '18px' }}>preview</span>
                가져올 학생 미리보기 ({previewStudents.length}명)
              </h4>
              <div className="flex gap-2">
                <button
                  onClick={() => setPreviewStudents(null)}
                  className="px-3 py-1.5 text-xs text-sp-muted border border-sp-border rounded-lg hover:bg-sp-card transition-colors"
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
                  className="px-3 py-1.5 text-xs text-white bg-sp-accent hover:bg-blue-600 rounded-lg font-medium transition-colors"
                >
                  적용하기
                </button>
              </div>
            </div>
            <p className="text-xs text-red-400 mb-3">주의: 적용 시 기존 명단이 모두 교체됩니다.</p>
            <div className="max-h-[200px] overflow-y-auto text-xs">
              <table className="w-full">
                <thead>
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
          </div>
        )}
      </div>

      {/* 일괄 입력 모달 */}
      {showBulkImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-sp-card border border-sp-border rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl flex flex-col max-h-[80vh]">
            <h3 className="text-lg font-bold text-sp-text mb-2">학생 일괄 입력</h3>
            <p className="text-sm text-sp-muted mb-4">
              엑셀, 한글 파일 등에서 학생 이름 목록을 복사하여 붙여넣으세요.<br />
              이름은 줄바꿈, 쉼표, 또는 탭으로 구분됩니다.<br />
              <span className="text-red-400 font-bold mt-1 inline-block">주의: 저장 시 기존 명단이 모두 교체됩니다!</span>
            </p>

            <textarea
              className="flex-1 w-full min-h-[200px] bg-sp-bg border border-sp-border rounded-lg p-3 text-sm text-sp-text focus:border-sp-accent focus:outline-none resize-none mb-6"
              placeholder="홍길동, 김철수, 이영희..."
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />

            <div className="flex justify-end gap-3 shrink-0">
              <button
                onClick={() => {
                  setBulkText('');
                  setShowBulkImport(false);
                }}
                className="px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm text-sp-text transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => void handleBulkImport()}
                className="px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors"
              >
                저장하기
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
