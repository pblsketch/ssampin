/**
 * 온라인 교무실 자료실 스토어 (M3)
 *
 * 계획서에서 이 파일이 지켜야 할 것:
 *  - §3.4     파일 바이트는 **서버를 지나지 않는다.** 구글 주소로 곧장 올리고 곧장 받는다.
 *  - §3.4-가  미리보기 글자는 **올리는 선생님 PC 에서** 뽑는다(kordoc 로컬 파싱).
 *             뽑은 글자는 파일과 같은 드라이브로 가고, 검색은 내 PC 에 받아 둔 글자로 한다.
 *  - §4.1     그래서 `IDocumentParserPort` 의 "파싱은 로컬에서만" 약속이 깨지지 않는다.
 *  - §8-C     같은 파일 새 판 · 부서 용량 표시
 *  - §10.6    파일당 200MB — 올리기 **전에** 막는다
 */
import { create } from 'zustand';
import type {
  StaffRoomFile,
  StaffRoomFileVersion,
  StaffRoomSearchHit,
  StaffRoomStorageUsage,
} from '@domain/entities/StaffRoomLibrary';
import {
  checkUpload,
  isSearchable,
  makeSnippet,
  matchesQuery,
  previewKindOf,
  shouldExtractPreview,
  truncatePreview,
} from '@domain/rules/staffRoomLibraryRules';

/** 실패 원인을 한국어 한 줄로 — 서버가 준 문구가 있으면 그대로 */
function messageOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return '요청 처리 중 오류가 발생했습니다.';
}

/** 구글 access token — 연결이 안 돼 있으면 null */
async function getGoogleToken(): Promise<string | null> {
  try {
    const { authenticateGoogle } = await import('@adapters/di/container');
    if (!(await authenticateGoogle.isConnected())) return null;
    return await authenticateGoogle.getValidAccessToken();
  } catch {
    return null;
  }
}

/** 지금 올리는 중인 파일의 상태 */
export interface UploadState {
  readonly fileName: string;
  /** 0~1 */
  readonly ratio: number;
  /** 파일은 다 올라갔고 미리보기 글자를 뽑는 중 */
  readonly phase: 'uploading' | 'extracting' | 'done';
}

interface StaffRoomLibraryState {
  files: StaffRoomFile[];
  usage: StaffRoomStorageUsage;
  /** 관리자가 구글을 연결해 뒀는가. 아니면 올리기·내려받기가 안 된다(§3.2.1) */
  driveConnected: boolean;
  /** 왜 안 되는가 — missing(처음 연결 필요) · broken(다시 로그인 필요) */
  driveStatus: 'connected' | 'missing' | 'broken';
  moduleId: string | null;

  /** 파일 id → 검색용 글자. 받아 두면 인터넷 없이도 찾을 수 있다(§3.4-가) */
  previews: Record<string, string>;

  upload: UploadState | null;
  versions: StaffRoomFileVersion[];

  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;

  loadFiles: (departmentId: string, moduleId?: string) => Promise<void>;
  uploadFile: (
    departmentId: string,
    file: File,
    replacesFileId?: string | null,
  ) => Promise<boolean>;
  downloadFile: (departmentId: string, fileId: string) => Promise<string | null>;
  removeFile: (departmentId: string, fileId: string) => Promise<boolean>;
  loadVersions: (departmentId: string, fileId: string) => Promise<void>;
  /** 검색에 쓸 글자를 받아 둔다. 이미 받은 것은 다시 받지 않는다 */
  syncPreviews: (departmentId: string) => Promise<void>;
  /** 자료에서 찾기 — 내 PC 에 받아 둔 글자로 찾으므로 인터넷이 없어도 된다 */
  search: (query: string) => StaffRoomSearchHit[];
  /** 글에서 찾기 — 본문이 앱에 없어 서버가 찾는다(§3.5-다) */
  postHits: StaffRoomSearchHit[];
  searchPosts: (departmentId: string, query: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const EMPTY_USAGE: StaffRoomStorageUsage = {
  departmentBytes: 0,
  driveUsedBytes: 0,
  driveLimitBytes: 0,
};

export const useStaffRoomLibraryStore = create<StaffRoomLibraryState>((set, get) => ({
  files: [],
  usage: EMPTY_USAGE,
  driveConnected: false,
  driveStatus: 'missing',
  moduleId: null,
  previews: {},
  postHits: [],
  upload: null,
  versions: [],
  isLoading: false,
  hasLoaded: false,
  error: null,

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      files: [],
      usage: EMPTY_USAGE,
      driveConnected: false,
      driveStatus: 'missing',
      moduleId: null,
      previews: {},
      postHits: [],
      upload: null,
      versions: [],
      hasLoaded: false,
      error: null,
    }),

  loadFiles: async (departmentId, moduleId) => {
    set({ isLoading: true, error: null });
    try {
      const token = await getGoogleToken();
      if (!token) {
        set({ isLoading: false, error: '구글 로그인이 필요합니다.' });
        return;
      }
      const { staffRoomPort } = await import('@adapters/di/container');
      const res = await staffRoomPort.listFiles(token, departmentId, moduleId);
      set({
        files: res.files,
        usage: res.usage,
        driveConnected: res.driveConnected,
        driveStatus: res.driveStatus,
        moduleId: res.module.id,
        isLoading: false,
        hasLoaded: true,
      });
    } catch (err) {
      set({ isLoading: false, hasLoaded: true, error: messageOf(err) });
    }
  },

  /**
   * 파일 올리기 — M3 의 중심 흐름.
   *
   *  1) 200MB 를 **여기서 먼저** 막는다. 다 올린 뒤 거절하면 선생님 인터넷만 버린다.
   *  2) 서버에서 업로드 주소를 받는다 (서버는 주소만 주고 빠진다).
   *  3) 구글로 **곧장** 올린다 — 쌤핀 서버를 지나지 않는다(§3.4).
   *  4) 서버에 등록한다 — 서버가 드라이브에 되물어 이름·크기·폴더를 대조한다.
   *  5) kordoc 으로 **내 PC 에서** 글자를 뽑아 드라이브에 나란히 올린다(§3.4-가).
   *
   * 5번이 실패해도 파일 자체는 이미 올라갔다. 미리보기와 본문 검색만 안 될 뿐이라
   * 전체를 되돌리지 않고 넘어간다.
   */
  uploadFile: async (departmentId, file, replacesFileId = null) => {
    const checked = checkUpload(file.name, file.size);
    if (!checked.ok) {
      set({ error: checked.message });
      return false;
    }

    set({ error: null, upload: { fileName: checked.name, ratio: 0, phase: 'uploading' } });

    try {
      const token = await getGoogleToken();
      if (!token) {
        set({ upload: null, error: '구글 로그인이 필요합니다.' });
        return false;
      }

      const { staffRoomPort } = await import('@adapters/di/container');
      const { uploadToSession } = await import('@infrastructure/google/ResumableUploader');

      const mimeType = file.type || 'application/octet-stream';

      const ticket = await staffRoomPort.createUploadSession(token, departmentId, {
        moduleId: get().moduleId ?? '',
        name: checked.name,
        mimeType,
        size: file.size,
        replacesFileId,
      });

      const uploaded = await uploadToSession(ticket.uploadUrl, file, {
        mimeType,
        onProgress: ({ ratio }) =>
          set({ upload: { fileName: checked.name, ratio, phase: 'uploading' } }),
      });

      const saved = await staffRoomPort.commitUpload(
        token,
        departmentId,
        ticket.ticketId,
        uploaded.id,
      );

      set({ upload: { fileName: checked.name, ratio: 1, phase: 'extracting' } });

      // ── 미리보기 글자 (§3.4-가) ────────────────────────────────────
      // 파싱은 **내 PC 에서만** 한다. 파일을 서버로 보내 파싱하는 경로는 만들지 않는다
      // (`IDocumentParserPort` 의 약속 · §4.1).
      if (shouldExtractPreview(checked.name)) {
        await extractAndUploadPreview(departmentId, token, saved, file, checked.name);
      }

      set({ upload: null });
      await get().loadFiles(departmentId, get().moduleId ?? undefined);
      return true;
    } catch (err) {
      set({ upload: null, error: messageOf(err) });
      return false;
    }
  },

  /**
   * 내려받기 — 서버가 내 지메일에 읽기 권한을 주고 구글 링크를 돌려준다(§3.4-나).
   * 파일은 구글에서 곧장 오므로 쌤핀 서버를 지나지 않는다.
   */
  downloadFile: async (departmentId, fileId) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) {
        set({ error: '구글 로그인이 필요합니다.' });
        return null;
      }
      const { staffRoomPort } = await import('@adapters/di/container');
      const res = await staffRoomPort.getDownloadUrl(token, departmentId, fileId);
      return res.url;
    } catch (err) {
      set({ error: messageOf(err) });
      return null;
    }
  },

  removeFile: async (departmentId, fileId) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) {
        set({ error: '구글 로그인이 필요합니다.' });
        return false;
      }
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.deleteFile(token, departmentId, fileId);

      const { [fileId]: _removed, ...restPreviews } = get().previews;
      set({ files: get().files.filter((f) => f.id !== fileId), previews: restPreviews });
      await get().loadFiles(departmentId, get().moduleId ?? undefined);
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    }
  },

  loadVersions: async (departmentId, fileId) => {
    try {
      const token = await getGoogleToken();
      if (!token) return;
      const { staffRoomPort } = await import('@adapters/di/container');
      set({ versions: await staffRoomPort.listFileVersions(token, departmentId, fileId) });
    } catch (err) {
      set({ error: messageOf(err) });
    }
  },

  /**
   * 검색용 글자를 받아 둔다 (§3.4-가).
   *
   * 이미 받아 둔 것은 다시 받지 않는다 — 부서 하나가 연 300개 파일이어도 글자는
   * 다 합쳐 1.5MB 남짓이라, 한 번 받아 두면 그 뒤로는 새 파일 것만 받으면 된다.
   */
  syncPreviews: async (departmentId) => {
    const { files, previews } = get();
    const missing = files
      .filter((f) => f.previewFileId && previews[f.id] === undefined)
      .map((f) => f.id);

    if (missing.length === 0) return;

    try {
      const token = await getGoogleToken();
      if (!token) return;
      const { staffRoomPort } = await import('@adapters/di/container');

      // 서버가 한 번에 30개까지 준다 — 나눠서 받는다
      const next: Record<string, string> = { ...get().previews };
      for (let i = 0; i < missing.length; i += 30) {
        const batch = missing.slice(i, i + 30);
        const fetched = await staffRoomPort.fetchPreviews(token, departmentId, batch);
        for (const item of fetched) next[item.fileId] = item.text;
      }
      set({ previews: next });
    } catch {
      // 검색 글자를 못 받아도 목록·내려받기는 그대로 된다 — 조용히 넘어간다
    }
  },

  /**
   * 글에서 찾기 (§8-A).
   *
   * 자료와 달리 서버에 물어본다 — 글 본문은 목록에 실려 오지 않아 앱에 없다(§3.5-다).
   * 전부 내려받아 앱에서 찾으면 §3.5-다 가 막으려던 그 전송량이 그대로 든다.
   */
  searchPosts: async (departmentId, query) => {
    if (!isSearchable(query)) {
      set({ postHits: [] });
      return;
    }
    try {
      const token = await getGoogleToken();
      if (!token) return;
      const { staffRoomPort } = await import('@adapters/di/container');
      set({ postHits: await staffRoomPort.searchPosts(token, departmentId, query) });
    } catch {
      // 글 검색이 실패해도 자료 검색은 그대로 된다
      set({ postHits: [] });
    }
  },

  /**
   * 자료에서 찾기 (§4.1 · §8-A).
   *
   * ★ 내 PC 안에서 찾는다. 서버에 검색어를 보내지 않으므로 인터넷이 없어도 되고,
   *   쌤핀 서버가 남의 문서 내용을 볼 일도 없다.
   *
   * 색인을 따로 만들지 않고 받아 둔 글자를 그대로 훑는다 — 한국어는 조사가 붙어
   * 일반적인 전문검색 방식이 잘 안 듣고, 글자 조각 색인은 저장 공간이 몇 배로 뛴다.
   * 느려지면 그때 얹는다(§3.4-다).
   */
  search: (query) => {
    if (!isSearchable(query)) return [];
    const { files, previews } = get();
    const hits: StaffRoomSearchHit[] = [];

    for (const file of files) {
      const inName = matchesQuery(file.name, query);
      const text = previews[file.id];
      const inContent = text !== undefined && matchesQuery(text, query);

      if (!inName && !inContent) continue;

      hits.push({
        kind: 'file',
        id: file.id,
        moduleId: file.moduleId,
        title: file.name,
        snippet: inContent && text ? makeSnippet(text, query) : file.name,
        matchedInContent: inContent && !inName,
        updatedAt: file.uploadedAt,
      });
    }

    // 이름에서 걸린 것을 앞에 — 찾는 사람이 파일명을 기억하고 있을 가능성이 높다
    return hits.sort((a, b) => {
      if (a.matchedInContent !== b.matchedInContent) return a.matchedInContent ? 1 : -1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  },
}));

/**
 * 올린 파일에서 글자를 뽑아 드라이브에 나란히 올린다 (§3.4-가).
 *
 * ★ 파싱은 `KordocParserAdapter` 를 거쳐 **일렉트론 메인 프로세스에서** 돈다.
 *   파일 바이트가 쌤핀 서버로 가지 않는다 — `IDocumentParserPort` 의
 *   "파싱은 반드시 로컬에서만" 약속 그대로다.
 *
 * 실패는 삼킨다. 미리보기가 없어도 파일은 이미 올라갔고 내려받을 수 있다.
 */
async function extractAndUploadPreview(
  departmentId: string,
  token: string,
  saved: StaffRoomFile,
  file: File,
  fileName: string,
): Promise<void> {
  try {
    const { documentParserPort } = await import('@adapters/di/container');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = await documentParserPort.parseBytes(bytes, fileName);
    if (parsed.status !== 'ok') return;

    const { text } = truncatePreview(parsed.document.markdown);
    if (text.trim().length === 0) return;

    const blob = new Blob([text], { type: 'text/markdown' });

    const { staffRoomPort } = await import('@adapters/di/container');
    const { uploadToSession } = await import('@infrastructure/google/ResumableUploader');

    const ticket = await staffRoomPort.createPreviewSession(
      token,
      departmentId,
      saved.id,
      blob.size,
    );
    const uploaded = await uploadToSession(ticket.uploadUrl, blob, { mimeType: 'text/markdown' });
    await staffRoomPort.commitPreview(token, departmentId, ticket.ticketId, uploaded.id, saved.id);
  } catch {
    // 미리보기는 있으면 좋은 것이지 없으면 안 되는 것이 아니다
    console.warn('[자료실] 미리보기 글자를 만들지 못했습니다:', fileName);
  }
}

/** 화면이 파일 종류를 물을 때 — 규칙 파일을 직접 부르지 않아도 되게 다시 내보낸다 */
export { previewKindOf };
