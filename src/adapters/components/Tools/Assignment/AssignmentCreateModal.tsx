import { useState, useMemo } from 'react';
import { useAssignmentStore } from '@adapters/stores/useAssignmentStore';
import { useStudentLists } from '@adapters/hooks/useStudentLists';
import type { FileTypeRestriction } from '@domain/valueObjects/FileTypeRestriction';
import type { SubmitType } from '@domain/entities/Assignment';
import type { StudentListOption } from '@adapters/hooks/useStudentLists';
import { DriveFolderInput } from './DriveFolderInput';

interface AssignmentCreateModalProps {
  onClose: () => void;
  onCreated: (assignmentId: string) => void;
}

const SUBMIT_TYPE_OPTIONS: { value: SubmitType; label: string; icon: string }[] = [
  { value: 'file', label: '파일만', icon: 'attach_file' },
  { value: 'text', label: '텍스트만', icon: 'edit_note' },
  { value: 'both', label: '파일 + 텍스트', icon: 'note_stack_add' },
];

const FILE_TYPE_OPTIONS: { value: FileTypeRestriction; label: string; description: string }[] = [
  { value: 'all', label: '전체', description: '모든 파일' },
  { value: 'image', label: '이미지만', description: 'jpg, png, gif, heic, webp' },
  { value: 'document', label: '문서만', description: 'pdf, hwp, hwpx, docx, pptx, xlsx, txt' },
];

export function AssignmentCreateModal({ onClose, onCreated }: AssignmentCreateModalProps) {
  const { createAssignment, isLoading } = useAssignmentStore();
  const studentLists = useStudentLists();

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('23:59');
  const [selectedTarget, setSelectedTarget] = useState<StudentListOption | null>(
    studentLists[0] ?? null,
  );
  const [folderName, setFolderName] = useState('');
  const [submitType, setSubmitType] = useState<SubmitType>('file');
  const [fileType, setFileType] = useState<FileTypeRestriction>('all');
  const [allowLate, setAllowLate] = useState(true);
  const [allowResubmit, setAllowResubmit] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill folder name when title changes
  const autoFolderName = useMemo(() => {
    if (!title) return '';
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${title}_${y}${m}${d}`;
  }, [title]);

  const effectiveFolderName = folderName || autoFolderName;

  // Validation
  const canSubmit = title.trim() && deadlineDate && selectedTarget && effectiveFolderName && !isLoading;

  async function handleSubmit() {
    if (!canSubmit || !selectedTarget) return;

    setError(null);
    try {
      const deadline = `${deadlineDate}T${deadlineTime}:00+09:00`;
      const assignment = await createAssignment({
        title: title.trim(),
        description: description.trim() || undefined,
        deadline,
        target: {
          type: selectedTarget.type,
          name: selectedTarget.name,
          students: selectedTarget.students,
        },
        driveFolderName: effectiveFolderName,
        submitType,
        fileTypeRestriction: fileType,
        allowLate,
        allowResubmit,
      });
      onCreated(assignment.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div role="dialog" aria-modal="true" aria-label="새 과제 만들기" className="bg-sp-card rounded-2xl ring-1 ring-sp-border shadow-2xl w-full max-w-xl pointer-events-auto flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-sp-border/40">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sp-accent/10">
                <span className="material-symbols-outlined text-sp-accent">add_task</span>
              </div>
              <h2 className="text-lg font-bold text-sp-text">새 과제 만들기</h2>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-sp-border/30 transition-colors">
              <span className="material-symbols-outlined text-sp-muted">close</span>
            </button>
          </div>

          {/* Body (scrollable) */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Error */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm" role="alert">
                {error}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-sp-text mb-1.5">
                과제 제목 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 독서감상문"
                className="w-full px-4 py-2.5 bg-sp-surface border border-sp-border rounded-lg text-sp-text placeholder-sp-muted/50 focus:outline-none focus:border-sp-accent transition-colors"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-sp-text mb-1.5">
                설명 <span className="text-sp-muted">(선택)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="과제에 대한 안내사항을 입력하세요"
                rows={2}
                className="w-full px-4 py-2.5 bg-sp-surface border border-sp-border rounded-lg text-sp-text placeholder-sp-muted/50 focus:outline-none focus:border-sp-accent transition-colors resize-none"
              />
            </div>

            {/* Deadline */}
            <div>
              <label className="block text-sm font-medium text-sp-text mb-1.5">
                마감일시 <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-3">
                <input
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-sp-surface border border-sp-border rounded-lg text-sp-text focus:outline-none focus:border-sp-accent transition-colors"
                />
                <input
                  type="time"
                  value={deadlineTime}
                  onChange={(e) => setDeadlineTime(e.target.value)}
                  className="w-40 px-4 py-2.5 bg-sp-surface border border-sp-border rounded-lg text-sp-text focus:outline-none focus:border-sp-accent transition-colors"
                />
              </div>
            </div>

            {/* Target selection */}
            <div>
              <label className="block text-sm font-medium text-sp-text mb-1.5">
                대상 선택 <span className="text-red-400">*</span>
              </label>
              {studentLists.length === 0 ? (
                <div className="p-4 bg-sp-surface border border-sp-border/50 rounded-lg text-center">
                  <p className="text-sp-muted text-sm">학급 명단을 먼저 설정해주세요</p>
                  <p className="text-sp-muted/60 text-xs mt-1">설정 → 명렬표에서 학생을 등록하세요</p>
                </div>
              ) : (
                <select
                  value={selectedTarget?.name ?? ''}
                  onChange={(e) => {
                    const found = studentLists.find((sl) => sl.name === e.target.value);
                    setSelectedTarget(found ?? null);
                  }}
                  className="w-full px-4 py-2.5 bg-sp-surface border border-sp-border rounded-lg text-sp-text focus:outline-none focus:border-sp-accent transition-colors"
                >
                  {studentLists.some((sl) => sl.type === 'class') && (
                    <optgroup label="담임반">
                      {studentLists.filter((sl) => sl.type === 'class').map((sl) => (
                        <option key={sl.name} value={sl.name}>
                          {sl.name} ({sl.students.length}명)
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {studentLists.some((sl) => sl.type === 'teaching') && (
                    <optgroup label="수업반">
                      {studentLists.filter((sl) => sl.type === 'teaching').map((sl) => (
                        <option key={sl.name} value={sl.name}>
                          {sl.name} ({sl.students.length}명)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}
            </div>

            {/* Drive folder name */}
            <div>
              <label className="block text-sm font-medium text-sp-text mb-1.5">
                구글 드라이브 저장 폴더 <span className="text-red-400">*</span>
              </label>
              <DriveFolderInput
                value={folderName}
                onChange={setFolderName}
                placeholder={autoFolderName || '폴더명'}
                disabled={isLoading}
              />
            </div>

            {/* Options section */}
            <div className="border-t border-sp-border/40 pt-5">
              <h3 className="text-sm font-semibold text-sp-muted uppercase tracking-wider mb-4">옵션</h3>

              {/* Submit type */}
              <div className="mb-4">
                <label className="text-sm text-sp-text mb-2 block">제출 방식</label>
                <div className="flex gap-2">
                  {SUBMIT_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSubmitType(opt.value)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        submitType === opt.value
                          ? 'bg-sp-accent text-white'
                          : 'bg-sp-surface border border-sp-border text-sp-muted hover:text-sp-text'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* File type — only when file submission is enabled */}
              {submitType !== 'text' && (
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm text-sp-text">파일 형식</label>
                <select
                  value={fileType}
                  onChange={(e) => setFileType(e.target.value as FileTypeRestriction)}
                  className="px-3 py-2 bg-sp-surface border border-sp-border rounded-lg text-sp-text text-sm focus:outline-none focus:border-sp-accent"
                >
                  {FILE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} ({opt.description})
                    </option>
                  ))}
                </select>
              </div>
              )}

              {/* Allow late */}
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm text-sp-text">지각 제출 허용</label>
                <button
                  onClick={() => setAllowLate(!allowLate)}
                  role="switch"
                  aria-checked={allowLate}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    allowLate ? 'bg-sp-accent' : 'bg-sp-border'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      allowLate ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Allow resubmit */}
              <div className="flex items-center justify-between">
                <label className="text-sm text-sp-text">재제출 허용</label>
                <button
                  onClick={() => setAllowResubmit(!allowResubmit)}
                  role="switch"
                  aria-checked={allowResubmit}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    allowResubmit ? 'bg-sp-accent' : 'bg-sp-border'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      allowResubmit ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-sp-border/40">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sp-muted hover:text-sp-text rounded-lg hover:bg-sp-border/30 transition-colors text-sm"
            >
              취소
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                canSubmit
                  ? 'bg-sp-accent text-white hover:bg-sp-accent/80'
                  : 'bg-sp-border text-sp-muted cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                  생성 중...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">add_task</span>
                  과제 생성
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
