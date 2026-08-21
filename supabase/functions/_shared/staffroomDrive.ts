/**
 * 온라인 교무실 — 관리자 권한 드라이브 대행 (M3)
 *
 * 계획서 §3.2.1 · §3.4 · ADR-065
 *
 * ── 이 파일이 지키는 한 가지 원칙 ───────────────────────────────────
 * **서버는 바이트를 나르지 않는다. 권한만 준다.**
 *
 * 무료 등급의 월 전송량 5GB 는 챗봇·상담·과제·서명·실시간 게시판이 이미 나눠 쓰고 있다.
 * 200MB 파일을 서버가 읽어 넘기면 25번 만에 한 달치가 끝난다(§3.4). 그래서:
 *
 *   올릴 때  — 서버가 구글에서 **업로드 세션 주소**만 받아 건네준다.
 *              파일은 선생님 PC 에서 구글로 곧장 간다.
 *   내려받을 때 — 서버가 그 멤버의 지메일에 **읽기 권한을 주고** 링크만 돌려준다.
 *              파일은 구글에서 선생님에게 곧장 간다.
 *
 * ── 딱 하나 예외: 미리보기 글자 ─────────────────────────────────────
 * `drive.file` 권한은 **앱이 만든 파일만** 열 수 있다. 권한을 받아도 남의 앱이 만든
 * 파일은 API 로 못 읽는다(브라우저로 열리는 것과 다르다). 그래서 검색에 쓸 글자는
 * 서버가 읽어서 내려줄 수밖에 없다.
 *
 * 감당되는 이유 — 계획서 §3.4-가 가 금지한 것은 "글자를 **서버에 쌓는 것**"이고,
 * 그건 지켰다(글자는 드라이브에 있고 DB 에는 파일 id 만 있다. §3.5 의 366MB 가 사라진 근거).
 * 지나가는 양도 작다 — 부서 하나가 연 300개 파일이어도 글자는 다 합쳐 1.5MB 남짓이고,
 * 각 선생님 PC 가 받아 두고 **바뀐 것만** 다시 받는다(§3.4-가).
 */
import { decrypt, encrypt } from './crypto.ts';
import type { Db } from './staffroomDb.ts';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** 부서 자료가 쌓이는 폴더 이름 */
const DEPARTMENT_FOLDER_PREFIX = '쌤핀 교무실';

/** 미리보기 글자를 모아 두는 하위 폴더 */
const PREVIEW_FOLDER_NAME = '_미리보기';

/** 관리자 토큰이 끊겼을 때 — 자료실 전체가 안 열린다(§3.2.1) */
export const ADMIN_TOKEN_BROKEN_MESSAGE =
  '부서 관리자 선생님의 구글 연결이 끊어져 자료실을 열 수 없습니다. ' +
  '관리자 선생님께 쌤핀에서 구글 로그인을 다시 해달라고 요청해주세요.';

/** 관리자가 아직 구글을 연결하지 않았을 때 */
export const ADMIN_TOKEN_MISSING_MESSAGE =
  '부서 관리자 선생님이 아직 구글 드라이브를 연결하지 않아 자료실을 쓸 수 없습니다. ' +
  '관리자 선생님께 부서 설정에서 구글 연결을 부탁해주세요.';

/** 관리자 토큰 문제 — 부르는 쪽이 409 로 돌려주도록 구분한다 */
export class AdminTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminTokenError';
  }
}

/** 교무실 전용 암호화 키. 없으면 공용 키로 폴백하되 경고를 남긴다 (ADR-062) */
function staffroomEncryptionKey(): string | null {
  const dedicated = Deno.env.get('STAFFROOM_ENCRYPTION_KEY');
  if (dedicated) return dedicated;

  const shared = Deno.env.get('ENCRYPTION_KEY');
  if (shared) {
    console.warn(
      '[staffroomDrive] STAFFROOM_ENCRYPTION_KEY 가 없어 ENCRYPTION_KEY 로 폴백합니다. ' +
        '공개 배포 전에 전용 키를 설정하세요 (ADR-062).',
    );
    return shared;
  }
  return null;
}

interface AdminTokenRow {
  department_id: string;
  admin_email: string;
  encrypted_access_token: string;
  access_iv: string;
  access_tag: string;
  encrypted_refresh_token: string;
  refresh_iv: string;
  refresh_tag: string;
  expires_at: string;
}

/**
 * 이 부서 관리자의 구글 액세스 토큰을 꺼낸다. 만료됐으면 갱신하고 다시 저장한다.
 *
 * ★ 여기서 실패하면 **자료실 전체가 모든 멤버에게 안 열린다**(§3.2.1).
 *   "새 파일이 안 올라간다" 정도가 아니라 이미 있는 자료도 못 연다.
 *   §10.1 의 관리자 승계 장치가 부가 기능이 아니라 생존 조건인 이유가 이것이다.
 */
export async function adminAccessToken(db: Db, departmentId: string): Promise<string> {
  const keyHex = staffroomEncryptionKey();
  if (!keyHex) throw new AdminTokenError(ADMIN_TOKEN_MISSING_MESSAGE);

  const { data, error } = await db
    .from('staffroom_admin_tokens')
    .select('*')
    .eq('department_id', departmentId)
    .maybeSingle();

  if (error) throw new Error(`관리자 토큰 조회 실패: ${error.message}`);
  if (!data) throw new AdminTokenError(ADMIN_TOKEN_MISSING_MESSAGE);

  const row = data as AdminTokenRow;

  // 아직 살아 있으면 그대로 쓴다 (1분 여유를 둔다 — 쓰는 도중에 만료되지 않게)
  const expiresAt = new Date(row.expires_at).getTime();
  if (Number.isFinite(expiresAt) && expiresAt - Date.now() > 60_000) {
    return decrypt(row.encrypted_access_token, keyHex, row.access_iv, row.access_tag);
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new AdminTokenError(ADMIN_TOKEN_BROKEN_MESSAGE);

  const refreshToken = await decrypt(
    row.encrypted_refresh_token,
    keyHex,
    row.refresh_iv,
    row.refresh_tag,
  );

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!res.ok) {
    // refresh_token 이 무효화됐다 — 관리자가 다시 로그인해야 한다
    console.error('[staffroomDrive] 관리자 토큰 갱신 실패:', res.status);
    throw new AdminTokenError(ADMIN_TOKEN_BROKEN_MESSAGE);
  }

  const fresh = (await res.json()) as { access_token: string; expires_in: number };

  const encAccess = await encrypt(fresh.access_token, keyHex);
  await db
    .from('staffroom_admin_tokens')
    .update({
      encrypted_access_token: encAccess.ciphertext,
      access_iv: encAccess.iv,
      access_tag: encAccess.tag,
      expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('department_id', departmentId);

  return fresh.access_token;
}

/** 드라이브 API 호출 (JSON) */
async function driveRequest<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new AdminTokenError(ADMIN_TOKEN_BROKEN_MESSAGE);
    }
    throw new Error(`Drive API ${res.status}: ${detail}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  webViewLink?: string;
  parents?: string[];
  trashed?: boolean;
}

/** 폴더 하나를 찾거나 만든다 */
async function getOrCreateFolder(
  accessToken: string,
  name: string,
  parentId: string | null,
): Promise<string> {
  const clauses = [
    `name='${name.replace(/'/g, "\\'")}'`,
    `mimeType='${FOLDER_MIME}'`,
    'trashed=false',
  ];
  if (parentId) clauses.push(`'${parentId}' in parents`);

  const params = new URLSearchParams({
    q: clauses.join(' and '),
    fields: 'files(id,name)',
    spaces: 'drive',
  });

  const found = await driveRequest<{ files?: Array<{ id: string }> }>(
    accessToken,
    `/files?${params.toString()}`,
  );
  const existing = found.files?.[0];
  if (existing) return existing.id;

  const created = await driveRequest<DriveFileMeta>(accessToken, '/files?fields=id', {
    method: 'POST',
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  return created.id;
}

/** 이 부서의 폴더를 찾거나 만들고, DB 에 적어 둔다 */
export async function ensureDepartmentFolder(
  db: Db,
  departmentId: string,
  departmentName: string,
  accessToken: string,
): Promise<string> {
  const { data } = await db
    .from('staffroom_departments')
    .select('drive_folder_id')
    .eq('id', departmentId)
    .maybeSingle();

  const existing = (data as { drive_folder_id: string | null } | null)?.drive_folder_id;
  if (existing) return existing;

  const root = await getOrCreateFolder(accessToken, DEPARTMENT_FOLDER_PREFIX, null);
  const folderId = await getOrCreateFolder(accessToken, departmentName, root);

  await db
    .from('staffroom_departments')
    .update({ drive_folder_id: folderId })
    .eq('id', departmentId);

  return folderId;
}

/** 미리보기 글자를 모아 두는 하위 폴더 */
export async function ensurePreviewFolder(
  accessToken: string,
  departmentFolderId: string,
): Promise<string> {
  return getOrCreateFolder(accessToken, PREVIEW_FOLDER_NAME, departmentFolderId);
}

/**
 * ★ 업로드 세션 주소를 받아 온다 (ADR-065).
 *
 * 여기서 만들어지는 주소는 **그 자체가 열쇠**다. 받은 사람은 관리자 토큰 없이도
 * 이 세션으로 파일을 올릴 수 있다. 그래서 두 가지를 못박는다:
 *   1) `parents` 로 **부서 폴더 안에만** 쓰이게 한다
 *   2) 표(staffroom_upload_tickets)에 이름·크기를 적어 두고 커밋 때 대조한다
 */
export async function createUploadSession(
  accessToken: string,
  folderId: string,
  fileName: string,
  mimeType: string,
  size: number,
): Promise<string> {
  const res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(size),
    },
    body: JSON.stringify({ name: fileName, parents: [folderId] }),
  });

  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new AdminTokenError(ADMIN_TOKEN_BROKEN_MESSAGE);
    }
    throw new Error(`업로드 세션 발급 실패 ${res.status}: ${detail}`);
  }

  const location = res.headers.get('Location');
  if (!location) throw new Error('구글이 업로드 주소를 주지 않았습니다.');
  return location;
}

/** 파일 정보를 읽는다 — 커밋 때 표와 대조하는 데 쓴다 */
export async function fileMeta(accessToken: string, fileId: string): Promise<DriveFileMeta> {
  return driveRequest<DriveFileMeta>(
    accessToken,
    `/files/${fileId}?fields=id,name,mimeType,size,createdTime,webViewLink,parents,trashed`,
  );
}

/**
 * ★ 이 멤버의 지메일에 읽기 권한을 준다 (§3.4-나).
 *
 * 링크 공유(`anyone`)보다 안전하다 — 누가 접근할 수 있는지가 이름으로 남고
 * 언제든 회수할 수 있다. 내보낸 멤버의 접근을 끊는 것도 이 권한을 거두는 일이다.
 *
 * `sendNotificationEmail=false` — 자료 하나 열 때마다 관리자 이름으로 공유 메일이
 * 가면 선생님들 메일함이 못 쓰게 된다.
 */
export async function grantReader(
  accessToken: string,
  fileId: string,
  email: string,
): Promise<string> {
  const params = new URLSearchParams({
    sendNotificationEmail: 'false',
    fields: 'id',
  });
  const created = await driveRequest<{ id: string }>(
    accessToken,
    `/files/${fileId}/permissions?${params.toString()}`,
    {
      method: 'POST',
      body: JSON.stringify({ type: 'user', role: 'reader', emailAddress: email }),
    },
  );
  return created.id;
}

/**
 * 내준 권한을 거둔다 — 멤버를 내보낼 때 (§10.6).
 * 이미 없는 권한(404)은 조용히 넘어간다 — 멱등.
 */
export async function revokePermission(
  accessToken: string,
  fileId: string,
  permissionId: string,
): Promise<void> {
  try {
    await driveRequest(accessToken, `/files/${fileId}/permissions/${permissionId}`, {
      method: 'DELETE',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('404')) return;
    throw error;
  }
}

/** 파일을 휴지통으로 — 영구 삭제하지 않는다(잘못 지웠을 때 관리자가 되돌릴 수 있게) */
export async function trashDriveFile(accessToken: string, fileId: string): Promise<void> {
  try {
    await driveRequest(accessToken, `/files/${fileId}`, {
      method: 'PATCH',
      body: JSON.stringify({ trashed: true }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('404')) return;
    throw error;
  }
}

/**
 * 미리보기 글자를 읽어 온다.
 *
 * ★ 서버가 바이트를 나르는 **유일한 자리**다. 파일 헤더의 설명대로,
 *   `drive.file` 권한 탓에 멤버가 직접 못 읽어서 어쩔 수 없다.
 *   대신 양이 작다(부서당 연 1.5MB 남짓) — 원본 파일은 절대 이 길로 보내지 않는다.
 */
export async function readTextFile(accessToken: string, fileId: string): Promise<string> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new AdminTokenError(ADMIN_TOKEN_BROKEN_MESSAGE);
    }
    throw new Error(`미리보기 읽기 실패 ${res.status}`);
  }
  return res.text();
}

/** 관리자 드라이브가 얼마나 찼는가 (§8-C 용량 표시) */
export async function driveQuota(accessToken: string): Promise<{ used: number; limit: number }> {
  const about = await driveRequest<{
    storageQuota?: { usage?: string; limit?: string };
  }>(accessToken, '/about?fields=storageQuota');

  return {
    used: Number(about.storageQuota?.usage ?? 0),
    limit: Number(about.storageQuota?.limit ?? 0),
  };
}
