/**
 * 온라인 교무실 — 갤러리 (M4)
 *
 * 계획서 §6 — "갤러리 : 사진 격자"
 *
 * ★ 표를 새로 만들지 않았다. 갤러리는 **사진 격자로 보는 자료실**이라,
 *   M3 의 파일 표(`staffroom_files`)를 그대로 쓰고 화면만 격자로 바꾼다.
 *   표를 두 벌로 만들면 올리기·용량 집계·권한 회수를 두 번 관리하게 된다.
 *
 * 그래서 올리기·내려받기·200MB 상한·용량 경고가 전부 자료실과 같은 길을 탄다.
 */
import { useEffect, useState } from 'react';
import { useStaffRoomLibraryStore } from '@adapters/stores/useStaffRoomLibraryStore';
import { useStaffRoomStore } from '@adapters/stores/useStaffRoomStore';
import { useGoogleAccountStore } from '@adapters/stores/useGoogleAccountStore';
import { displayNameOf } from '@domain/rules/staffRoomBoardPermission';
import { canDeleteFile, formatBytes, previewKindOf } from '@domain/rules/staffRoomLibraryRules';
import { STAFFROOM_FILE_MAX_BYTES, type StaffRoomFile } from '@domain/entities/StaffRoomLibrary';
import { formatPostTime } from './boardFormat';
import { FilePreviewModal } from './FilePreviewModal';

interface GalleryViewProps {
  departmentId: string;
  moduleId: string;
}

/** 사진 한 장 */
function PhotoCard({
  file,
  canDelete,
  onOpen,
  onDelete,
}: {
  file: StaffRoomFile;
  canDelete: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const uploaderLabel = displayNameOf({
    email: file.uploaderEmail,
    displayName: file.uploaderName,
  });

  return (
    <div className="group relative overflow-hidden rounded-xl border border-sp-border bg-sp-card transition-all duration-sp-base ease-sp-out hover:border-sp-accent hover:shadow-sp-md">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        {/*
          미리보기 그림을 여기 직접 띄우지 않는다. `drive.file` 권한 탓에 앱이 관리자
          드라이브의 그림을 바로 못 읽어서(계획서 §3.2.1), 열었을 때 서버가 권한을 준 뒤
          구글 뷰어로 띄운다. 격자에는 이름과 올린 사람만 보여준다.
        */}
        <div className="flex aspect-square items-center justify-center bg-sp-surface">
          <span className="material-symbols-outlined text-icon-xl text-sp-muted">
            {previewKindOf(file.name) === 'image' ? 'image' : 'draft'}
          </span>
        </div>
        <div className="p-3">
          <p className="truncate text-xs font-sp-medium text-sp-text">{file.name}</p>
          <p className="mt-0.5 truncate text-[11px] text-sp-muted">
            {uploaderLabel} · {formatPostTime(file.uploadedAt)}
          </p>
        </div>
      </button>

      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`${file.name} 지우기`}
          title="지우기"
          className="absolute right-2 top-2 rounded-lg bg-sp-card/90 p-1.5 text-sp-muted opacity-0 transition-opacity hover:text-sp-danger focus:opacity-100 group-hover:opacity-100"
        >
          <span className="material-symbols-outlined text-icon-sm">delete</span>
        </button>
      )}
    </div>
  );
}

export function GalleryView({ departmentId, moduleId }: GalleryViewProps) {
  const files = useStaffRoomLibraryStore((s) => s.files);
  const isLoading = useStaffRoomLibraryStore((s) => s.isLoading);
  const hasLoaded = useStaffRoomLibraryStore((s) => s.hasLoaded);
  const error = useStaffRoomLibraryStore((s) => s.error);
  const driveConnected = useStaffRoomLibraryStore((s) => s.driveConnected);
  const upload = useStaffRoomLibraryStore((s) => s.upload);
  const loadFiles = useStaffRoomLibraryStore((s) => s.loadFiles);
  const uploadFile = useStaffRoomLibraryStore((s) => s.uploadFile);
  const removeFile = useStaffRoomLibraryStore((s) => s.removeFile);
  const clearError = useStaffRoomLibraryStore((s) => s.clearError);

  const myEmail = useGoogleAccountStore((s) => s.email);
  const myRole = useStaffRoomStore((s) => s.currentDepartment?.myRole) ?? 'member';

  const [previewFile, setPreviewFile] = useState<StaffRoomFile | null>(null);

  useEffect(() => {
    void loadFiles(departmentId, moduleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, moduleId]);

  const pickAndUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async () => {
      const chosen = Array.from(input.files ?? []);
      // 한 장씩 차례로 올린다 — 동시에 올리면 진행률 표시가 뒤엉킨다
      for (const file of chosen) {
        await uploadFile(departmentId, file, null);
      }
    };
    input.click();
  };

  const handleDelete = async (file: StaffRoomFile) => {
    const ok = window.confirm(
      `"${file.name}"을(를) 지울까요?\n\n구글 드라이브에서는 휴지통으로 옮겨지므로 관리자 선생님이 되돌릴 수 있습니다.`,
    );
    if (ok) await removeFile(departmentId, file.id);
  };

  return (
    <div className="space-y-4">
      {hasLoaded && !driveConnected && (
        <div className="rounded-xl border border-sp-highlight bg-sp-surface p-4">
          <p className="text-sm leading-relaxed text-sp-text">
            {myRole === 'admin'
              ? '사진을 올리려면 부서 설정에서 구글 드라이브를 연결해주세요.'
              : '부서 관리자 선생님이 아직 구글 드라이브를 연결하지 않아 사진을 올리거나 볼 수 없습니다.'}
          </p>
        </div>
      )}

      {upload && (
        <div className="rounded-xl border border-sp-accent bg-sp-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 flex-1 truncate text-sm font-sp-medium text-sp-text">
              {upload.fileName}
            </span>
            <span className="shrink-0 text-xs text-sp-muted">
              {Math.round(upload.ratio * 100)}%
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sp-card">
            <div
              className="h-full rounded-full bg-sp-accent transition-all duration-sp-base ease-sp-out"
              style={{ width: `${Math.round(upload.ratio * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-sp-muted">
          사진 한 장은 {formatBytes(STAFFROOM_FILE_MAX_BYTES)}까지 올릴 수 있습니다. 여러 장을 한
          번에 고를 수 있습니다.
        </p>
        <button
          type="button"
          onClick={pickAndUpload}
          disabled={!driveConnected}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-sp-accent px-4 py-2.5 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out hover:shadow-sp-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-icon-sm">add_photo_alternate</span>
          사진 올리기
        </button>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-sp-danger bg-sp-surface p-4">
          <p className="text-sm leading-relaxed text-sp-danger">{error}</p>
          <button
            type="button"
            onClick={clearError}
            aria-label="안내 닫기"
            className="shrink-0 rounded-lg p-1 text-sp-muted hover:text-sp-text"
          >
            <span className="material-symbols-outlined text-icon-sm">close</span>
          </button>
        </div>
      )}

      {isLoading && !hasLoaded && (
        <p className="py-8 text-center text-sm text-sp-muted">불러오는 중…</p>
      )}

      {hasLoaded && files.length === 0 && (
        <div className="rounded-xl border border-dashed border-sp-border bg-sp-card px-6 py-12 text-center">
          <span className="material-symbols-outlined text-icon-xl text-sp-muted">
            photo_library
          </span>
          <p className="mt-3 text-sm font-sp-medium text-sp-text">아직 올라온 사진이 없습니다</p>
          <p className="mt-1 text-xs leading-relaxed text-sp-muted">
            체육대회·현장학습처럼 여럿이 찍은 사진을 한곳에 모아 두면 나중에 찾기 쉽습니다.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {files.map((file) => (
          <PhotoCard
            key={file.id}
            file={file}
            canDelete={canDeleteFile(myEmail ?? '', myRole, file.uploaderEmail)}
            onOpen={() => setPreviewFile(file)}
            onDelete={() => void handleDelete(file)}
          />
        ))}
      </div>

      {previewFile && (
        <FilePreviewModal
          departmentId={departmentId}
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}
