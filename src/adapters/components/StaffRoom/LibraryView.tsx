/**
 * 온라인 교무실 — 자료실 (M3)
 *
 * 계획서 §4(미리보기) · §8-C(새 판·용량) · §10.6(200MB·용량 경고)
 *
 * 화면이 지켜야 할 것 둘:
 *  1) **용량이 항상 보인다.** 오너 결정대로 인위적 상한은 두지 않되 보이지 않게 두지도
 *     않는다(§8-C). 자료는 관리자 선생님의 **개인** 드라이브에 쌓이고, 그게 차면
 *     그 선생님의 지메일 수신과 쌤핀 동기화까지 함께 멈춘다(§10.6).
 *  2) **찾는 것이 목록보다 앞에 온다.** 자료실은 "제목만 봐서는 뭔지 모르는 한글 파일"이
 *     쌓이는 곳이라, 본문까지 뒤지는 검색이 없으면 검색이 있으나 마나가 된다(§4.1).
 */
import { useEffect, useMemo, useState } from 'react';
import { useStaffRoomLibraryStore } from '@adapters/stores/useStaffRoomLibraryStore';
import { useStaffRoomStore } from '@adapters/stores/useStaffRoomStore';
import { useGoogleAccountStore } from '@adapters/stores/useGoogleAccountStore';
import { displayNameOf } from '@domain/rules/staffRoomBoardPermission';
import {
  canDeleteFile,
  formatBytes,
  isSearchable,
  previewKindOf,
  storageLevel,
  storageMessage,
  storageRatio,
} from '@domain/rules/staffRoomLibraryRules';
import { STAFFROOM_FILE_MAX_BYTES } from '@domain/entities/StaffRoomLibrary';
import type { StaffRoomFile } from '@domain/entities/StaffRoomLibrary';
import { formatPostTime } from './boardFormat';
import { FilePreviewModal } from './FilePreviewModal';

interface LibraryViewProps {
  departmentId: string;
  /** 어느 공간의 자료인가 (M4 — 자료실·갤러리가 여러 개일 수 있다) */
  moduleId: string;
}

/** 파일 종류에 맞는 아이콘 — 목록에서 한눈에 갈라 보이게 */
function iconFor(fileName: string): string {
  switch (previewKindOf(fileName)) {
    case 'text':
      return 'description';
    case 'image':
      return 'image';
    case 'viewer':
      return 'slideshow';
    case 'html':
      return 'code';
    default:
      return 'draft';
  }
}

/** 용량 막대 — 관리자 드라이브가 얼마나 찼는지 (§8-C) */
function StorageBar() {
  const usage = useStaffRoomLibraryStore((s) => s.usage);
  const level = storageLevel(usage);
  const message = storageMessage(usage);
  const ratio = storageRatio(usage);

  if (usage.driveLimitBytes <= 0) return null;

  const barColor =
    level === 'full' ? 'bg-sp-danger' : level === 'warn' ? 'bg-sp-highlight' : 'bg-sp-accent';

  return (
    <div className="rounded-xl border border-sp-border bg-sp-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-sp-medium text-sp-text">
          부서 자료 {formatBytes(usage.departmentBytes)}
        </span>
        <span className="text-xs text-sp-muted">
          관리자 드라이브 {formatBytes(usage.driveUsedBytes)} / {formatBytes(usage.driveLimitBytes)}
        </span>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sp-surface">
        <div
          className={`h-full rounded-full transition-all duration-sp-base ease-sp-out ${barColor}`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
          role="progressbar"
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="관리자 드라이브 사용량"
        />
      </div>

      {message && (
        <p
          className={`mt-2.5 text-xs leading-relaxed ${
            level === 'full' ? 'text-sp-danger' : 'text-sp-highlight'
          }`}
        >
          {message.replace(/\*\*/g, '')}
        </p>
      )}
    </div>
  );
}

/** 올리는 중 진행 표시 — 200MB 파일을 올릴 때 멈춘 것처럼 보이지 않게 */
function UploadProgressBar() {
  const upload = useStaffRoomLibraryStore((s) => s.upload);
  if (!upload) return null;

  return (
    <div className="rounded-xl border border-sp-accent bg-sp-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-sp-medium text-sp-text">
          {upload.fileName}
        </span>
        <span className="shrink-0 text-xs text-sp-muted">
          {upload.phase === 'extracting'
            ? '미리보기 만드는 중'
            : `${Math.round(upload.ratio * 100)}%`}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sp-card">
        <div
          className="h-full rounded-full bg-sp-accent transition-all duration-sp-base ease-sp-out"
          style={{ width: `${Math.round(upload.ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}

function FileRow({
  file,
  canDelete,
  onOpen,
  onDownload,
  onDelete,
  onNewVersion,
  snippet,
}: {
  file: StaffRoomFile;
  canDelete: boolean;
  onOpen: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onNewVersion: () => void;
  snippet: string | null;
}) {
  const uploaderLabel = displayNameOf({
    email: file.uploaderEmail,
    displayName: file.uploaderName,
  });

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-sp-border bg-sp-card px-4 py-3.5 transition-all duration-sp-base ease-sp-out hover:border-sp-accent hover:shadow-sp-md">
      <span className="material-symbols-outlined shrink-0 text-icon-md text-sp-muted">
        {iconFor(file.name)}
      </span>

      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="truncate text-sm font-sp-medium text-sp-text">{file.name}</h3>
          {file.version > 1 && (
            <span className="shrink-0 rounded-full border border-sp-border px-2 py-0.5 text-[11px] font-sp-semibold text-sp-muted">
              {file.version}번째 판
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-sp-muted">
          {uploaderLabel} · {formatPostTime(file.uploadedAt)} · {formatBytes(file.size)}
        </p>
        {snippet && (
          <p className="mt-1 truncate text-xs text-sp-highlight">
            <span className="material-symbols-outlined align-middle text-icon-sm">search</span>{' '}
            {snippet}
          </p>
        )}
      </button>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onDownload}
          title="내려받기"
          aria-label={`${file.name} 내려받기`}
          className="rounded-lg p-2 text-sp-muted transition-colors hover:bg-sp-surface hover:text-sp-text"
        >
          <span className="material-symbols-outlined text-icon-sm">download</span>
        </button>
        <button
          type="button"
          onClick={onNewVersion}
          title="새 판 올리기"
          aria-label={`${file.name}의 새 판 올리기`}
          className="rounded-lg p-2 text-sp-muted transition-colors hover:bg-sp-surface hover:text-sp-text"
        >
          <span className="material-symbols-outlined text-icon-sm">upload_file</span>
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="지우기"
            aria-label={`${file.name} 지우기`}
            className="rounded-lg p-2 text-sp-muted transition-colors hover:bg-sp-surface hover:text-sp-danger"
          >
            <span className="material-symbols-outlined text-icon-sm">delete</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function LibraryView({ departmentId, moduleId }: LibraryViewProps) {
  const files = useStaffRoomLibraryStore((s) => s.files);
  const isLoading = useStaffRoomLibraryStore((s) => s.isLoading);
  const hasLoaded = useStaffRoomLibraryStore((s) => s.hasLoaded);
  const error = useStaffRoomLibraryStore((s) => s.error);
  const driveConnected = useStaffRoomLibraryStore((s) => s.driveConnected);
  const driveStatus = useStaffRoomLibraryStore((s) => s.driveStatus);
  const loadFiles = useStaffRoomLibraryStore((s) => s.loadFiles);
  const syncPreviews = useStaffRoomLibraryStore((s) => s.syncPreviews);
  const uploadFile = useStaffRoomLibraryStore((s) => s.uploadFile);
  const downloadFile = useStaffRoomLibraryStore((s) => s.downloadFile);
  const removeFile = useStaffRoomLibraryStore((s) => s.removeFile);
  const search = useStaffRoomLibraryStore((s) => s.search);
  const postHits = useStaffRoomLibraryStore((s) => s.postHits);
  const searchPosts = useStaffRoomLibraryStore((s) => s.searchPosts);
  const clearError = useStaffRoomLibraryStore((s) => s.clearError);
  const previews = useStaffRoomLibraryStore((s) => s.previews);

  // 내가 누구인지·어떤 권한인지는 이미 앱이 알고 있다. 자료실이 따로 들고 있지 않는다.
  const myEmail = useGoogleAccountStore((s) => s.email);
  const myRole = useStaffRoomStore((s) => s.currentDepartment?.myRole) ?? 'member';

  const [query, setQuery] = useState('');
  const [previewFile, setPreviewFile] = useState<StaffRoomFile | null>(null);
  /** 새 판을 올릴 대상. null 이면 새 파일 */
  const [replacing, setReplacing] = useState<StaffRoomFile | null>(null);

  useEffect(() => {
    void loadFiles(departmentId, moduleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, moduleId]);

  // 목록을 받고 나면 검색용 글자를 뒤따라 받아 둔다(§3.4-가).
  // 목록보다 늦게 와도 되는 것이라 화면을 붙잡지 않는다.
  useEffect(() => {
    if (hasLoaded) void syncPreviews(departmentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLoaded, files.length, departmentId]);

  // 글 본문은 앱에 없어 서버에 물어본다(§3.5-다). 타자 한 글자마다 부르지 않도록
  // 잠깐 기다렸다가 보낸다.
  useEffect(() => {
    if (!isSearchable(query)) {
      void searchPosts(departmentId, '');
      return;
    }
    const timer = setTimeout(() => void searchPosts(departmentId, query), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, departmentId]);

  const hits = useMemo(
    () => (isSearchable(query) ? search(query) : []),
    // previews 가 늦게 도착하면 검색 결과도 다시 계산돼야 한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, files, previews],
  );

  const visible = useMemo(() => {
    if (!isSearchable(query)) return files;
    const order = new Map(hits.map((h, i) => [h.id, i]));
    return files
      .filter((f) => order.has(f.id))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }, [files, hits, query]);

  const snippetOf = (fileId: string): string | null => {
    const hit = hits.find((h) => h.id === fileId);
    return hit?.matchedInContent ? hit.snippet : null;
  };

  const pickAndUpload = (replacesFileId: string | null) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = () => {
      const chosen = input.files?.[0];
      if (chosen) void uploadFile(departmentId, chosen, replacesFileId);
      setReplacing(null);
    };
    input.click();
  };

  const handleDownload = async (file: StaffRoomFile) => {
    const url = await downloadFile(departmentId, file.id);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = async (file: StaffRoomFile) => {
    const ok = window.confirm(
      `"${file.name}"을(를) 자료실에서 지울까요?\n\n` +
        '구글 드라이브에서는 휴지통으로 옮겨지므로 관리자 선생님이 되돌릴 수 있습니다.',
    );
    if (ok) await removeFile(departmentId, file.id);
  };

  return (
    <div className="space-y-4">
      <StorageBar />
      <UploadProgressBar />

      {/* 관리자가 구글을 연결하지 않으면 자료실 전체가 안 열린다(§3.2.1) */}
      {hasLoaded && !driveConnected && (
        <div className="rounded-xl border border-sp-highlight bg-sp-surface p-4">
          <p className="text-sm leading-relaxed text-sp-text">
            {driveStatus === 'broken'
              ? myRole === 'admin'
                ? '구글 연결이 끊어졌습니다. 쌤핀에서 구글 로그인을 다시 해주시면 자료실이 열립니다.'
                : '부서 관리자 선생님의 구글 연결이 끊어져 자료를 올리거나 내려받을 수 없습니다. 관리자 선생님께 쌤핀에서 구글 로그인을 다시 해달라고 요청해주세요.'
              : myRole === 'admin'
                ? '자료실을 쓰려면 부서 설정에서 구글 드라이브를 연결해주세요. 자료는 선생님의 구글 드라이브에 쌓입니다.'
                : '부서 관리자 선생님이 아직 구글 드라이브를 연결하지 않아 자료를 올리거나 내려받을 수 없습니다. 관리자 선생님께 요청해주세요.'}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-icon-sm text-sp-muted">
            search
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="파일 이름과 내용으로 찾기"
            aria-label="자료실에서 찾기"
            className="w-full rounded-xl border border-sp-border bg-sp-card py-2.5 pl-10 pr-3 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={() => pickAndUpload(null)}
          disabled={!driveConnected}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-sp-accent px-4 py-2.5 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out hover:shadow-sp-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-icon-sm">upload</span>
          자료 올리기
        </button>
      </div>

      <p className="text-xs text-sp-muted">
        파일 하나는 {formatBytes(STAFFROOM_FILE_MAX_BYTES)}까지 올릴 수 있습니다.
        한글·워드·엑셀·PDF는 앱 안에서 내용을 미리 볼 수 있고, 그 내용까지 검색됩니다.
      </p>

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
          <span className="material-symbols-outlined text-icon-xl text-sp-muted">folder_open</span>
          <p className="mt-3 text-sm font-sp-medium text-sp-text">아직 올라온 자료가 없습니다</p>
          <p className="mt-1 text-xs leading-relaxed text-sp-muted">
            부서에서 함께 보는 계획서·서식·명렬표를 올려두면 필요할 때 찾아 쓸 수 있습니다.
          </p>
        </div>
      )}

      {hasLoaded && files.length > 0 && visible.length === 0 && (
        <p className="py-8 text-center text-sm text-sp-muted">
          &lsquo;{query}&rsquo;로 찾은 자료가 없습니다.
        </p>
      )}

      {/* 글에서 걸린 것 — 자료실 검색이지만 부서 전체를 뒤진다(§8-A) */}
      {isSearchable(query) && postHits.length > 0 && (
        <div className="rounded-xl border border-sp-border bg-sp-surface p-4">
          <h4 className="text-xs font-sp-semibold text-sp-muted">
            게시판에서 찾은 글 {postHits.length}개
          </h4>
          <ul className="mt-2 space-y-1.5">
            {postHits.map((hit) => (
              <li key={hit.id} className="min-w-0">
                <p className="truncate text-sm font-sp-medium text-sp-text">{hit.title}</p>
                {hit.matchedInContent && (
                  <p className="truncate text-xs text-sp-muted">{hit.snippet}</p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-sp-muted">게시판 탭에서 열어볼 수 있습니다.</p>
        </div>
      )}

      <div className="space-y-2">
        {visible.map((file) => (
          <FileRow
            key={file.id}
            file={file}
            canDelete={canDeleteFile(myEmail ?? '', myRole, file.uploaderEmail)}
            snippet={snippetOf(file.id)}
            onOpen={() => setPreviewFile(file)}
            onDownload={() => void handleDownload(file)}
            onDelete={() => void handleDelete(file)}
            onNewVersion={() => {
              setReplacing(file);
              pickAndUpload(file.id);
            }}
          />
        ))}
      </div>

      {replacing && <span className="sr-only">{replacing.name}의 새 판을 고르는 중</span>}

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
