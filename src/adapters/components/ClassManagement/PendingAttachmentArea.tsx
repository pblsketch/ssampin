import { useRef, useState } from 'react';
import { attachmentKindOf } from '@domain/rules/observationAttachmentRules';
import type { ObservationAttachmentSource } from '@domain/entities/ObservationAttachment';

export interface PendingAttachment {
  readonly file: File;
  readonly source: ObservationAttachmentSource;
}

interface PendingAttachmentAreaProps {
  readonly pendingFiles: readonly PendingAttachment[];
  readonly onAddFiles: (files: File[], source: ObservationAttachmentSource) => void;
  readonly onRemove: (idx: number) => void;
  /** true 면 첨부 추가 불가(대상이 명확하지 않을 때). disabledHint 로 사유 안내. */
  readonly disabled?: boolean;
  readonly disabledHint?: string;
}

/**
 * 작성 중 담아두는 첨부(아직 미저장) 영역. 파일 선택 + 드래그&드롭 + 칩 미리보기.
 * 실제 저장은 호출 측이 기록 생성 후 commit 한다. 저장된 첨부 표시는 ObservationAttachmentList 가 담당.
 */
export function PendingAttachmentArea({
  pendingFiles,
  onAddFiles,
  onRemove,
  disabled,
  disabledHint,
}: PendingAttachmentAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<ObservationAttachmentSource>('teacher');
  const [dragOver, setDragOver] = useState(false);

  const openPicker = (source: ObservationAttachmentSource) => {
    if (disabled) return;
    sourceRef.current = source;
    inputRef.current?.click();
  };

  if (disabled) {
    return (
      <div className="rounded-lg border border-dashed border-sp-border px-2 py-1.5">
        <span className="text-[10px] text-sp-muted/70">
          {disabledHint ?? '학생 1명·단일 날짜·비출결 기록에서 자료를 첨부할 수 있어요'}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-dashed px-2 py-1.5 transition-colors ${
        dragOver ? 'border-sp-accent bg-sp-accent/5' : 'border-sp-border'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onAddFiles(e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [], 'teacher');
      }}
    >
      {pendingFiles.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {pendingFiles.map((p, i) => (
            <span
              key={`${p.file.name}-${i}`}
              className="flex items-center gap-1 rounded-lg border border-sp-border bg-sp-bg px-2 py-0.5 text-caption text-sp-text"
            >
              <span className="material-symbols-outlined text-sm text-sp-accent">
                {attachmentKindOf(p.file.name) === 'image' ? 'image' : 'description'}
              </span>
              <span className="max-w-[120px] truncate">{p.file.name}</span>
              {p.source === 'student' && (
                <span className="rounded-full bg-sp-accent/10 px-1 text-[9px] text-sp-accent">
                  학생
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="text-sp-muted hover:text-red-400"
                aria-label="첨부 제거"
              >
                <span className="material-symbols-outlined text-icon">close</span>
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          onAddFiles(files, sourceRef.current);
          e.target.value = '';
        }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => openPicker('teacher')}
          className="flex items-center gap-1 text-caption text-sp-muted hover:text-sp-accent"
        >
          <span className="material-symbols-outlined text-sm">attach_file</span>내 자료
        </button>
        <button
          type="button"
          onClick={() => openPicker('student')}
          className="flex items-center gap-1 text-caption text-sp-muted hover:text-sp-accent"
        >
          <span className="material-symbols-outlined text-sm">backpack</span>학생 제출물
        </button>
        <span className="ml-auto text-[10px] text-sp-muted/70">이미지·문서 끌어다 놓기</span>
      </div>
    </div>
  );
}
