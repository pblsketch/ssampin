import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type {
  ObservationAttachment,
  ObservationAttachmentSource,
} from '@domain/entities/ObservationAttachment';
import { useObservationAttachmentStore } from '@adapters/stores/useObservationAttachmentStore';
import { useToastStore } from '@adapters/components/common/Toast';

interface ObservationAttachmentListProps {
  observationId: string;
}

/** 이미지 첨부 썸네일 — 바이너리를 objectURL 로 lazy 로드(메타 JSON 에 dataURL 미보관). */
function AttachmentThumb({
  attachment,
  onOpen,
  onDelete,
}: {
  attachment: ObservationAttachment;
  onOpen: (url: string) => void;
  onDelete: () => void;
}) {
  const readFile = useObservationAttachmentStore((s) => s.readFile);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    void readFile(attachment.id).then((bytes) => {
      if (!alive || !bytes) return;
      objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: attachment.mimeType }));
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, attachment.mimeType, readFile]);

  return (
    <div className="group/att relative h-16 w-16 overflow-hidden rounded-lg border border-sp-border bg-sp-bg">
      {url ? (
        <img
          src={url}
          alt={attachment.fileName}
          title={attachment.fileName}
          className="h-full w-full cursor-zoom-in object-cover"
          onClick={() => onOpen(url)}
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sp-muted">
          <span className="material-symbols-outlined text-base">image</span>
        </div>
      )}
      {attachment.source === 'student' && (
        <span className="absolute bottom-0 left-0 right-0 bg-black/55 text-center text-[9px] font-medium text-white">
          학생
        </span>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover/att:opacity-100 hover:bg-black/75"
        aria-label="첨부 삭제"
        title="첨부 삭제"
      >
        <span className="material-symbols-outlined text-icon">close</span>
      </button>
    </div>
  );
}

/** 문서 첨부 칩 — 클릭 시 다운로드(환경 무관). */
function AttachmentDocChip({
  attachment,
  onDelete,
}: {
  attachment: ObservationAttachment;
  onDelete: () => void;
}) {
  const readFile = useObservationAttachmentStore((s) => s.readFile);

  const handleDownload = useCallback(async () => {
    const bytes = await readFile(attachment.id);
    if (!bytes) {
      useToastStore.getState().show('첨부 파일을 찾을 수 없습니다.', 'error');
      return;
    }
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: attachment.mimeType }));
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  }, [attachment.id, attachment.fileName, attachment.mimeType, readFile]);

  return (
    <div className="group/att flex items-center gap-1.5 rounded-lg border border-sp-border bg-sp-bg px-2 py-1">
      <span className="material-symbols-outlined text-sm text-sp-accent">description</span>
      <button
        type="button"
        onClick={() => void handleDownload()}
        className="max-w-[140px] truncate text-xs text-sp-text hover:text-sp-accent"
        title={`${attachment.fileName} (내려받기)`}
      >
        {attachment.fileName}
      </button>
      {attachment.source === 'student' && (
        <span className="rounded-full bg-sp-accent/10 px-1 text-[9px] font-medium text-sp-accent">
          학생
        </span>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="text-sp-muted opacity-0 transition-opacity group-hover/att:opacity-100 hover:text-red-400"
        aria-label="첨부 삭제"
        title="첨부 삭제"
      >
        <span className="material-symbols-outlined text-icon">close</span>
      </button>
    </div>
  );
}

export function ObservationAttachmentList({ observationId }: ObservationAttachmentListProps) {
  const allAttachments = useObservationAttachmentStore((s) => s.attachments);
  const load = useObservationAttachmentStore((s) => s.load);
  const addAttachment = useObservationAttachmentStore((s) => s.addAttachment);
  const deleteAttachment = useObservationAttachmentStore((s) => s.deleteAttachment);

  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSourceRef = useRef<ObservationAttachmentSource>('teacher');

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(
    () => allAttachments.filter((a) => a.observationId === observationId),
    [allAttachments, observationId],
  );
  const images = items.filter((a) => a.kind === 'image');
  const docs = items.filter((a) => a.kind === 'document');

  const handleFiles = useCallback(
    async (files: readonly File[], source: ObservationAttachmentSource) => {
      if (files.length === 0) return;
      setBusy(true);
      try {
        for (const file of files) {
          try {
            await addAttachment({ observationId, file, source });
          } catch (err) {
            const msg = err instanceof Error ? err.message : '첨부에 실패했습니다.';
            useToastStore.getState().show(msg, 'error');
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [addAttachment, observationId],
  );

  const openPicker = useCallback((source: ObservationAttachmentSource) => {
    pendingSourceRef.current = source;
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      void handleFiles(files, pendingSourceRef.current);
      e.target.value = '';
    },
    [handleFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
      void handleFiles(files, 'teacher');
    },
    [handleFiles],
  );

  return (
    <div
      className={`mt-2 rounded-lg border border-dashed px-2 py-1.5 transition-colors ${
        dragOver ? 'border-sp-accent bg-sp-accent/5' : 'border-sp-border'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {(images.length > 0 || docs.length > 0) && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {images.map((att) => (
            <AttachmentThumb
              key={att.id}
              attachment={att}
              onOpen={setViewerUrl}
              onDelete={() => void deleteAttachment(att.id)}
            />
          ))}
          {docs.map((att) => (
            <AttachmentDocChip
              key={att.id}
              attachment={att}
              onDelete={() => void deleteAttachment(att.id)}
            />
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleInputChange}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => openPicker('teacher')}
          disabled={busy}
          className="flex items-center gap-1 text-xs text-sp-muted hover:text-sp-accent disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-sm">attach_file</span>내 자료
        </button>
        <button
          type="button"
          onClick={() => openPicker('student')}
          disabled={busy}
          className="flex items-center gap-1 text-xs text-sp-muted hover:text-sp-accent disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-sm">backpack</span>
          학생 제출물
        </button>
        <span className="ml-auto text-[10px] text-sp-muted/70">
          {busy ? '첨부 중...' : '이미지·문서 끌어다 놓기'}
        </span>
      </div>

      {/* 이미지 확대 뷰어 */}
      {viewerUrl && (
        <div
          className="fixed inset-0 z-sp-modal flex items-center justify-center bg-black/80 p-8"
          onClick={() => setViewerUrl(null)}
        >
          <img
            src={viewerUrl}
            alt="첨부 원본"
            className="max-h-full max-w-full rounded-lg object-contain"
          />
          <button
            type="button"
            onClick={() => setViewerUrl(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
            aria-label="닫기"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}
    </div>
  );
}
