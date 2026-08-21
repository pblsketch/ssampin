/**
 * 온라인 교무실 — 자료 미리보기 (M3)
 *
 * 계획서 §4 의 실측 결과를 그대로 따른다:
 *  - 한글·워드·엑셀·PDF → kordoc 이 뽑아 둔 **글자와 표**를 보여준다.
 *    원본 종이 모양 그대로의 렌더링은 이 계획에 없다 — 정확히 봐야 하면 내려받아 연다.
 *  - 그림 → 구글 뷰어로 띄운다.
 *  - PPT → kordoc 파서 목록에 없어 **구글 뷰어**로 띄운다(§4).
 *  - HTML → 아래 주석 참고. M3 에서는 열지 않고 내려받게 한다.
 *
 * ★ 미리보기 글자는 이미 앱이 받아 둔 것을 쓴다(§3.4-가). 여기서 파일을 새로
 *   내려받지 않으므로 미리보기를 여는 데는 전송량이 들지 않는다.
 */
import { useEffect, useState } from 'react';
import { useStaffRoomLibraryStore } from '@adapters/stores/useStaffRoomLibraryStore';
import { formatBytes, previewKindOf } from '@domain/rules/staffRoomLibraryRules';
import type { StaffRoomFile, StaffRoomFileVersion } from '@domain/entities/StaffRoomLibrary';
import { displayNameOf } from '@domain/rules/staffRoomBoardPermission';
import { formatPostTime } from './boardFormat';

interface FilePreviewModalProps {
  departmentId: string;
  file: StaffRoomFile;
  onClose: () => void;
}

/** 구글 뷰어 주소 — 권한을 받은 사람만 열린다(§3.4-나) */
function googleViewerUrl(driveFileId: string): string {
  return `https://drive.google.com/file/d/${driveFileId}/preview`;
}

/** 접어 둔 이전 판 목록 (§8-C) */
function VersionList({ versions }: { versions: readonly StaffRoomFileVersion[] }) {
  if (versions.length === 0) return null;

  return (
    <div className="mt-6 border-t border-sp-border pt-4">
      <h4 className="text-xs font-sp-semibold text-sp-muted">이전 판 {versions.length}개</h4>
      <ul className="mt-2 space-y-1.5">
        {versions.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-x-2 text-xs text-sp-muted">
            <span className="rounded-full border border-sp-border px-2 py-0.5 font-sp-semibold">
              {v.version}판
            </span>
            <span className="truncate">{v.name}</span>
            <span>
              {displayNameOf({ email: v.uploaderEmail, displayName: v.uploaderName })} ·{' '}
              {formatPostTime(v.uploadedAt)} · {formatBytes(v.size)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-sp-muted">
        이전 판도 구글 드라이브에 그대로 남아 있습니다. 되돌려야 하면 관리자 선생님께 요청해주세요.
      </p>
    </div>
  );
}

export function FilePreviewModal({ departmentId, file, onClose }: FilePreviewModalProps) {
  const previews = useStaffRoomLibraryStore((s) => s.previews);
  const versions = useStaffRoomLibraryStore((s) => s.versions);
  const loadVersions = useStaffRoomLibraryStore((s) => s.loadVersions);
  const downloadFile = useStaffRoomLibraryStore((s) => s.downloadFile);

  /** 구글 뷰어로 띄우려면 먼저 내 지메일에 권한이 있어야 한다(§3.4-나) */
  const [viewerReady, setViewerReady] = useState(false);
  const kind = previewKindOf(file.name);
  const text = previews[file.id];

  useEffect(() => {
    void loadVersions(departmentId, file.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, file.id]);

  // 그림·PPT 는 구글 뷰어로 띄운다. 뷰어가 열리려면 서버가 내 지메일에
  // 읽기 권한을 준 뒤여야 하므로, 내려받기와 같은 길을 한 번 거친다.
  useEffect(() => {
    if (kind !== 'image' && kind !== 'viewer') return;
    let alive = true;
    void downloadFile(departmentId, file.id).then((url) => {
      if (alive && url) setViewerReady(true);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, file.id, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleDownload = async () => {
    const url = await downloadFile(departmentId, file.id);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${file.name} 미리보기`}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-sp-border bg-sp-card shadow-sp-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-sp-border px-6 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-sp-semibold text-sp-text">{file.name}</h3>
            <p className="mt-0.5 text-xs text-sp-muted">
              {displayNameOf({ email: file.uploaderEmail, displayName: file.uploaderName })} ·{' '}
              {formatPostTime(file.uploadedAt)} · {formatBytes(file.size)}
              {file.version > 1 && ` · ${file.version}번째 판`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded-lg p-1.5 text-sp-muted transition-colors hover:bg-sp-surface hover:text-sp-text"
          >
            <span className="material-symbols-outlined text-icon-sm">close</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {kind === 'text' && text !== undefined && (
            <>
              <pre className="whitespace-pre-wrap break-words font-sp-mono text-xs leading-relaxed text-sp-text">
                {text}
              </pre>
              <p className="mt-4 text-xs leading-relaxed text-sp-muted">
                글자와 표만 뽑아 보여드립니다. 서식과 그림까지 그대로 보려면 내려받아 한글에서
                열어주세요.
              </p>
            </>
          )}

          {kind === 'text' && text === undefined && (
            <p className="py-10 text-center text-sm text-sp-muted">
              미리보기를 준비하고 있습니다. 잠시 뒤 다시 열어보시거나 내려받아 확인해주세요.
            </p>
          )}

          {(kind === 'image' || kind === 'viewer') &&
            (viewerReady ? (
              <iframe
                src={googleViewerUrl(file.driveFileId)}
                title={`${file.name} 미리보기`}
                className="h-[60vh] w-full rounded-xl border border-sp-border"
                sandbox="allow-scripts allow-same-origin allow-popups"
              />
            ) : (
              <p className="py-10 text-center text-sm text-sp-muted">미리보기를 여는 중…</p>
            ))}

          {/*
            HTML 첨부는 M3 에서 앱 안에 띄우지 않는다.
            계획서 §4.2 는 미니앱의 3중 격리(전용 origin·분리된 세션 칸·CSP)를 그대로
            쓰자고 했는데, 그 장치는 **로컬 파일**을 여는 구조라 드라이브에 있는 파일을
            바로 태울 수 없다. 격리를 절반만 만들어 남이 올린 HTML 을 앱 안에서 여는 것은
            안 여는 것보다 위험하므로, 지금은 내려받아 브라우저에서 열도록 한다.
          */}
          {kind === 'html' && (
            <div className="rounded-xl border border-sp-border bg-sp-surface p-5">
              <p className="text-sm leading-relaxed text-sp-text">
                HTML 파일은 앱 안에서 열지 않습니다. 남이 만든 웹 문서를 앱 안에서 그대로 실행하면
                선생님의 다른 자료에 손댈 수 있어서입니다.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-sp-muted">
                내려받아 브라우저에서 열어주세요.
              </p>
            </div>
          )}

          {kind === 'none' && (
            <div className="rounded-xl border border-sp-border bg-sp-surface p-5">
              <p className="text-sm leading-relaxed text-sp-text">
                이 종류의 파일은 앱 안에서 미리 볼 수 없습니다. 내려받아 확인해주세요.
              </p>
            </div>
          )}

          <VersionList versions={versions} />
        </div>

        <div className="flex justify-end gap-2 border-t border-sp-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-sp-border px-4 py-2.5 text-sm font-sp-medium text-sp-text transition-colors hover:bg-sp-surface"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            className="flex items-center gap-1.5 rounded-xl bg-sp-accent px-4 py-2.5 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out hover:shadow-sp-md"
          >
            <span className="material-symbols-outlined text-icon-sm">download</span>
            내려받기
          </button>
        </div>
      </div>
    </div>
  );
}
