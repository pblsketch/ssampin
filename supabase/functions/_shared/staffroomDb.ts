/**
 * 온라인 교무실 — 서버 DB 접근 공용 헬퍼
 *
 * staffroom_* 테이블은 049 마이그레이션에서 service_role 전용으로 잠갔다.
 * anon / authenticated 는 GRANT 자체가 없으므로, 이 파일의 클라이언트를 거치지 않는
 * 접근 경로는 존재하지 않는다.
 *
 * 인가 판정은 `staffroomAccess.ts`(순수 함수)가 하고, 여기서는 판정에 필요한
 * 데이터를 읽어 오기만 한다. 두 관심사를 나눠 둔 이유는 판정 쪽을 CI 에서
 * 테스트할 수 있게 하기 위해서다.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { AccessMember, StaffRoomRole } from './staffroomAccess.ts';

/** service_role 클라이언트 — staffroom_* 에 닿는 유일한 통로 */
export function serviceClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

/** DB 에서 읽은 멤버 행 */
export interface MemberRow {
  id: string;
  department_id: string;
  member_email: string;
  display_name: string | null;
  role: StaffRoomRole;
  joined_at: string;
}

/** DB 에서 읽은 부서 행 */
export interface DepartmentRow {
  id: string;
  name: string;
  description: string | null;
  owner_email: string;
  created_at: string;
}

/** DB 에서 읽은 초대 행 */
export interface InviteRow {
  id: string;
  department_id: string;
  code: string;
  expires_at: string | null;
  revoked_at: string | null;
  max_uses: number | null;
  use_count: number;
  created_by: string;
  created_at: string;
}

/** service_role 클라이언트 타입 — 같은 폴더의 staffroomDrive.ts 도 쓴다 */
export type Db = ReturnType<typeof serviceClient>;

/** 부서의 멤버 전체를 읽는다 — 인가 판정과 목록 응답이 같은 데이터를 쓴다 */
export async function loadMembers(db: Db, departmentId: string): Promise<MemberRow[]> {
  const { data, error } = await db
    .from('staffroom_members')
    .select('id, department_id, member_email, display_name, role, joined_at')
    .eq('department_id', departmentId)
    .order('joined_at', { ascending: true });

  if (error) throw new Error(`멤버 조회 실패: ${error.message}`);
  return (data ?? []) as MemberRow[];
}

/** 인가 판정용 최소 형태로 줄인다 */
export function toAccessMembers(rows: readonly MemberRow[]): AccessMember[] {
  return rows.map((r) => ({ id: r.id, email: r.member_email, role: r.role }));
}

/** 멤버 행 → 클라이언트 응답 형태 */
export function toMemberResponse(row: MemberRow) {
  return {
    id: row.id,
    departmentId: row.department_id,
    email: row.member_email,
    displayName: row.display_name,
    role: row.role,
    joinedAt: row.joined_at,
  };
}

/** 부서 행 → 클라이언트 응답 형태 */
export function toDepartmentResponse(
  row: DepartmentRow,
  myRole: StaffRoomRole,
  memberCount: number,
) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerEmail: row.owner_email,
    createdAt: row.created_at,
    myRole,
    memberCount,
  };
}

/** 초대 행 → 클라이언트 응답 형태 */
export function toInviteResponse(row: InviteRow) {
  return {
    id: row.id,
    departmentId: row.department_id,
    code: row.code,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    maxUses: row.max_uses,
    useCount: row.use_count,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// ══════════════════════════════════════════════════════════════════
// 게시판 (M2)
// ══════════════════════════════════════════════════════════════════

/** DB 에서 읽은 모듈 행 */
export interface ModuleRow {
  id: string;
  department_id: string;
  kind: string;
  name: string;
  position: number;
}

/** DB 에서 읽은 글 행 (목록용 — body 없음) */
export interface PostSummaryRow {
  id: string;
  module_id: string;
  title: string;
  author_email: string;
  is_required: boolean;
  /** 말머리. 안 붙였으면 null (054) */
  category_id: string | null;
  created_at: string;
  updated_at: string;
}

/** DB 에서 읽은 글 행 (본문 포함) */
export interface PostRow extends PostSummaryRow {
  department_id: string;
  body: string;
  body_format: string;
}

/** DB 에서 읽은 댓글 행 */
export interface CommentRow {
  id: string;
  post_id: string;
  author_email: string;
  body: string;
  body_format: string;
  created_at: string;
}

/** 목록 조회에서 가져오는 컬럼 — **body 를 넣지 말 것**(계획서 §3.5-다 전송량) */
export const POST_SUMMARY_COLUMNS =
  'id, module_id, title, author_email, is_required, category_id, created_at, updated_at';

/** 본문까지 가져오는 컬럼 */
export const POST_FULL_COLUMNS =
  'id, module_id, department_id, title, body, body_format, author_email, is_required, category_id, created_at, updated_at';

/**
 * 본문 형식으로 받아들일 값. (마이그레이션 053 · ADR-069)
 *
 * 클라이언트가 보낸 값을 그대로 믿지 않는다 — 모르는 형식이 저장되면 화면이
 * 그 글을 어떻게 그려야 할지 판단할 수 없고, DB 의 CHECK 제약에 걸려 저장
 * 자체가 실패해 "글이 안 올라간다"는 신고로 돌아온다. 아는 값이 아니면
 * 조용히 맨글로 떨어뜨린다(글을 잃는 것보다 덜 꾸며지는 편이 낫다).
 */
export const STAFFROOM_BODY_FORMATS = ['plain', 'lexical'] as const;
export type StaffRoomBodyFormat = (typeof STAFFROOM_BODY_FORMATS)[number];

export function normalizeBodyFormat(value: unknown): StaffRoomBodyFormat {
  return value === 'lexical' ? 'lexical' : 'plain';
}

// ══════════════════════════════════════════════════════════════════
// 말머리·해시태그 (054)
// ══════════════════════════════════════════════════════════════════

/** 글 하나에 붙일 수 있는 해시태그 수 */
export const POST_MAX_TAGS = 10;
/** 해시태그 하나의 최대 길이 */
export const TAG_MAX_LENGTH = 20;

/**
 * 해시태그 다듬기 — 앱의 `domain/rules/staffRoomTaxonomy.ts` 와 **같은 규칙**이다.
 *
 * 서버가 앱을 믿지 않기 때문에 여기서 다시 한다. 앱을 거치지 않고 부르는 경로가
 * 있으면 `#체육대회` 와 `체육대회` 가 다른 태그로 갈려 저장된다.
 *
 * **규칙을 고칠 때는 두 곳을 함께 고쳐야 한다.**
 */
export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const tag = item.trim().replace(/^#+/, '').replace(/\s+/g, '').replace(/,/g, '');
    if (tag === '' || tag.length > TAG_MAX_LENGTH) continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= POST_MAX_TAGS) break;
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════
// 글 첨부 (055)
// ══════════════════════════════════════════════════════════════════

/** 글 하나에 붙일 수 있는 파일 수 */
export const POST_MAX_ATTACHMENTS = 10;

export interface AttachmentRow {
  id: string;
  post_id: string;
  file_id: string | null;
  file_name: string;
  position: number;
}

/**
 * 붙이려는 파일들이 **이 부서 자료실 것인지** 확인하고, 이름과 함께 돌려준다.
 *
 * 남의 부서 파일 id 를 보내도 통하지 않게 하려는 것이다. 통하면 글에 남의 부서
 * 파일 이름이 뜨고, 누르는 순간 자료실이 권한을 내주려 시도한다.
 *
 * 이름을 여기서 읽어 오는 이유: 첨부는 파일이 지워진 뒤에도 이름을 보여줘야 해서
 * (055) 붙일 때의 이름을 함께 적어 둔다. 앱이 보낸 이름을 믿으면 엉뚱한 이름이
 * 박힌다.
 */
export async function resolveDepartmentFiles(
  db: Db,
  fileIds: readonly string[],
  departmentId: string,
): Promise<{ id: string; name: string }[]> {
  if (fileIds.length === 0) return [];

  const { data, error } = await db
    .from('staffroom_files')
    .select('id, name')
    .eq('department_id', departmentId)
    .in('id', fileIds as string[]);

  if (error) throw new Error(`첨부 파일 확인 실패: ${error.message}`);
  const found = new Map(
    ((data ?? []) as { id: string; name: string }[]).map((f) => [f.id, f.name]),
  );

  // 보낸 순서를 지킨다 — 화면에 보이는 차례가 매번 바뀌면 어지럽다
  const out: { id: string; name: string }[] = [];
  for (const id of fileIds) {
    const name = found.get(id);
    if (name !== undefined) out.push({ id, name });
    if (out.length >= POST_MAX_ATTACHMENTS) break;
  }
  return out;
}

/** 글 여러 개의 첨부를 한 번에 읽는다 — 글마다 따로 부르면 목록이 느려진다 */
export async function loadAttachmentsByPost(
  db: Db,
  postIds: readonly string[],
): Promise<Map<string, AttachmentRow[]>> {
  const map = new Map<string, AttachmentRow[]>();
  if (postIds.length === 0) return map;

  const { data, error } = await db
    .from('staffroom_post_attachments')
    .select('id, post_id, file_id, file_name, position')
    .in('post_id', postIds as string[])
    .order('position', { ascending: true });

  if (error) throw new Error(`첨부 조회 실패: ${error.message}`);
  for (const row of (data ?? []) as AttachmentRow[]) {
    const list = map.get(row.post_id) ?? [];
    list.push(row);
    map.set(row.post_id, list);
  }
  return map;
}

/** 글의 첨부를 통째로 바꾼다 (지우고 다시 넣기) — 태그와 같은 방식 */
export async function replacePostAttachments(
  db: Db,
  postId: string,
  departmentId: string,
  files: readonly { id: string; name: string }[],
): Promise<void> {
  const { error: delError } = await db
    .from('staffroom_post_attachments')
    .delete()
    .eq('post_id', postId);
  if (delError) throw new Error(`첨부 정리 실패: ${delError.message}`);

  if (files.length === 0) return;
  const { error } = await db.from('staffroom_post_attachments').insert(
    files.map((f, index) => ({
      post_id: postId,
      department_id: departmentId,
      file_id: f.id,
      file_name: f.name,
      position: index,
    })),
  );
  if (error) throw new Error(`첨부 저장 실패: ${error.message}`);
}

/** 첨부 행 → 클라이언트 응답. 파일이 지워졌으면 fileId 가 null 이다 */
export function toAttachmentResponse(row: AttachmentRow) {
  return {
    id: row.id,
    fileId: row.file_id,
    fileName: row.file_name,
  };
}

/**
 * 이 말머리가 이 부서 것인지 확인한다.
 *
 * 남의 부서 말머리 id 를 보내도 통하지 않게 — 통하면 글 목록에서 남의 부서
 * 말머리 이름이 비쳐 보인다.
 */
export async function categoryBelongsTo(
  db: Db,
  categoryId: string,
  departmentId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('staffroom_categories')
    .select('id')
    .eq('id', categoryId)
    .eq('department_id', departmentId)
    .maybeSingle();

  if (error) throw new Error(`말머리 확인 실패: ${error.message}`);
  return data !== null;
}

/** 글 여러 개의 태그를 한 번에 읽는다 — 글마다 따로 부르면 목록이 느려진다 */
export async function loadTagsByPost(
  db: Db,
  postIds: readonly string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (postIds.length === 0) return map;

  const { data, error } = await db
    .from('staffroom_post_tags')
    .select('post_id, tag')
    .in('post_id', postIds as string[]);

  if (error) throw new Error(`태그 조회 실패: ${error.message}`);
  for (const row of (data ?? []) as { post_id: string; tag: string }[]) {
    const list = map.get(row.post_id) ?? [];
    list.push(row.tag);
    map.set(row.post_id, list);
  }
  return map;
}

/**
 * 글의 태그를 통째로 바꾼다 (지우고 다시 넣기).
 *
 * 하나씩 견주어 더하고 빼는 것보다 단순하고, 태그는 글마다 10개 이하라 비용도
 * 작다. 순서를 지키기 위해서도 이 편이 낫다.
 */
export async function replacePostTags(
  db: Db,
  postId: string,
  departmentId: string,
  tags: readonly string[],
): Promise<void> {
  const { error: delError } = await db.from('staffroom_post_tags').delete().eq('post_id', postId);
  if (delError) throw new Error(`태그 정리 실패: ${delError.message}`);

  if (tags.length === 0) return;
  const { error } = await db
    .from('staffroom_post_tags')
    .insert(tags.map((tag) => ({ post_id: postId, department_id: departmentId, tag })));
  if (error) throw new Error(`태그 저장 실패: ${error.message}`);
}

/**
 * 지메일 → 부서에서 쓰는 표시 이름.
 *
 * 구글이 이름을 주지 않아서(쌤핀은 이메일 권한만 받는다) 멤버가 직접 적은 값이다.
 * 안 적었으면 null 이고, 화면이 지메일을 대신 보여준다.
 */
export function nameMapOf(members: readonly MemberRow[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const m of members) {
    map.set(m.member_email.trim().toLowerCase(), m.display_name);
  }
  return map;
}

/** 이 부서의 게시판 모듈을 찾는다 (M2 는 부서마다 1개) */
export async function loadBoardModule(db: Db, departmentId: string): Promise<ModuleRow | null> {
  const { data, error } = await db
    .from('staffroom_modules')
    .select('id, department_id, kind, name, position')
    .eq('department_id', departmentId)
    .eq('kind', 'board')
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`게시판 조회 실패: ${error.message}`);
  return (data as ModuleRow | null) ?? null;
}

/** 모듈이 이 부서 것인지 확인한다 — 남의 부서 모듈 id 를 보내도 통하지 않게 */
export async function moduleBelongsTo(
  db: Db,
  moduleId: string,
  departmentId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('staffroom_modules')
    .select('id')
    .eq('id', moduleId)
    .eq('department_id', departmentId)
    .maybeSingle();

  if (error) throw new Error(`게시판 확인 실패: ${error.message}`);
  return data !== null;
}

/** 이 사람이 이 게시판을 마지막으로 본 시각. 한 번도 안 봤으면 null */
export async function loadLastSeenAt(
  db: Db,
  moduleId: string,
  email: string,
): Promise<string | null> {
  const { data, error } = await db
    .from('staffroom_module_reads')
    .select('last_seen_at')
    .eq('module_id', moduleId)
    .eq('member_email', email)
    .maybeSingle();

  if (error) throw new Error(`읽음 기록 조회 실패: ${error.message}`);
  return (data as { last_seen_at: string } | null)?.last_seen_at ?? null;
}

/**
 * "마지막으로 본 시각"을 지금으로 갱신한다.
 *
 * ★ 반드시 **안 읽음 판정을 끝낸 뒤에** 부를 것. 먼저 갱신하면 목록을 여는 순간
 *   모든 글이 읽은 것으로 바뀌어 방금 올라온 글을 놓친다.
 */
export async function touchLastSeen(db: Db, moduleId: string, email: string): Promise<void> {
  const { error } = await db
    .from('staffroom_module_reads')
    .upsert(
      { module_id: moduleId, member_email: email, last_seen_at: new Date().toISOString() },
      { onConflict: 'module_id,member_email' },
    );
  if (error) console.error('[staffroomDb] 읽음 기록 갱신 실패:', error.message);
}

/** 글 행 → 클라이언트 응답(목록용). body 는 담지 않는다 */
export function toPostSummaryResponse(
  row: PostSummaryRow,
  names: Map<string, string | null>,
  opts: { commentCount: number; isUnread: boolean; mentionsMe: boolean },
) {
  return {
    id: row.id,
    moduleId: row.module_id,
    categoryId: row.category_id ?? null,
    title: row.title,
    authorEmail: row.author_email,
    authorName: names.get(row.author_email.trim().toLowerCase()) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isRequired: row.is_required,
    commentCount: opts.commentCount,
    isUnread: opts.isUnread,
    mentionsMe: opts.mentionsMe,
  };
}

/** 댓글 행 → 클라이언트 응답 */
export function toCommentResponse(row: CommentRow, names: Map<string, string | null>) {
  return {
    id: row.id,
    postId: row.post_id,
    authorEmail: row.author_email,
    authorName: names.get(row.author_email.trim().toLowerCase()) ?? null,
    body: row.body,
    // 댓글에는 아직 서식 편집기가 없어 값은 항상 plain 이다. 그래도 응답에
    // 실어 보내는 이유는, 화면이 글과 댓글을 같은 규칙으로 그리게 하기
    // 위해서다 — 한쪽만 형식을 모르면 그리는 코드가 두 벌로 갈린다.
    bodyFormat: normalizeBodyFormat(row.body_format),
    createdAt: row.created_at,
  };
}

/** 모듈 행 → 클라이언트 응답 */
export function toModuleResponse(row: ModuleRow, unreadCount: number) {
  return {
    id: row.id,
    departmentId: row.department_id,
    kind: row.kind,
    name: row.name,
    position: row.position,
    unreadCount,
  };
}

// ══════════════════════════════════════════════════════════════════
// 자료실 (M3)
//
// ★ 이 표들에는 **파일 내용이 없다.** 관리자 드라이브를 가리키는 표찰만 있다.
//   전송량과 개인정보 둘 다를 위해서다(계획서 §3.4 · 051 마이그레이션 헤더).
// ══════════════════════════════════════════════════════════════════

/** DB 에서 읽은 자료실 파일 행 */
export interface FileRow {
  id: string;
  department_id: string;
  module_id: string;
  drive_file_id: string;
  name: string;
  mime_type: string;
  size: number;
  uploader_email: string;
  uploaded_at: string;
  version: number;
  preview_file_id: string | null;
  preview_size: number;
}

/** DB 에서 읽은 이전 판 행 */
export interface FileVersionRow {
  id: string;
  file_id: string;
  version: number;
  drive_file_id: string;
  name: string;
  size: number;
  uploader_email: string;
  uploaded_at: string;
  preview_file_id: string | null;
}

/** DB 에서 읽은 올리기 표 행 */
export interface UploadTicketRow {
  id: string;
  department_id: string;
  module_id: string;
  uploader_email: string;
  name: string;
  mime_type: string;
  size: number;
  folder_id: string;
  replaces_file_id: string | null;
  kind: 'file' | 'preview';
  created_at: string;
  consumed_at: string | null;
}

export const FILE_COLUMNS =
  'id, department_id, module_id, drive_file_id, name, mime_type, size, uploader_email, uploaded_at, version, preview_file_id, preview_size';

/** 이 부서의 자료실 모듈을 찾는다 (M3 는 부서마다 1개) */
export async function loadArchiveModule(db: Db, departmentId: string): Promise<ModuleRow | null> {
  const { data, error } = await db
    .from('staffroom_modules')
    .select('id, department_id, kind, name, position')
    .eq('department_id', departmentId)
    .eq('kind', 'archive')
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`자료실 조회 실패: ${error.message}`);
  return (data as ModuleRow | null) ?? null;
}

/**
 * 자료실 모듈을 찾고, 없으면 만든다.
 *
 * M1·M2 로 이미 만들어진 부서는 051 마이그레이션이 채워 주지만, 마이그레이션이
 * 돌기 전에 생긴 부서나 경합으로 빠진 부서가 있을 수 있어 여기서도 한 번 더 본다.
 */
export async function ensureArchiveModule(db: Db, departmentId: string): Promise<ModuleRow> {
  const found = await loadArchiveModule(db, departmentId);
  if (found) return found;

  const { data, error } = await db
    .from('staffroom_modules')
    .insert({ department_id: departmentId, kind: 'archive', name: '자료실', position: 1 })
    .select('id, department_id, kind, name, position')
    .single();

  if (error) throw new Error(`자료실 생성 실패: ${error.message}`);
  return data as ModuleRow;
}

/** 이 부서의 파일 하나 — 남의 부서 파일 id 를 보내도 통하지 않게 부서로 좁혀 읽는다 */
export async function loadFile(
  db: Db,
  fileId: string,
  departmentId: string,
): Promise<FileRow | null> {
  const { data, error } = await db
    .from('staffroom_files')
    .select(FILE_COLUMNS)
    .eq('id', fileId)
    .eq('department_id', departmentId)
    .maybeSingle();

  if (error) throw new Error(`파일 조회 실패: ${error.message}`);
  return (data as FileRow | null) ?? null;
}

/** 파일 행 → 클라이언트 응답 */
export function toFileResponse(row: FileRow, names: Map<string, string | null>) {
  return {
    id: row.id,
    departmentId: row.department_id,
    moduleId: row.module_id,
    driveFileId: row.drive_file_id,
    name: row.name,
    mimeType: row.mime_type,
    size: Number(row.size),
    uploaderEmail: row.uploader_email,
    uploaderName: names.get(row.uploader_email.trim().toLowerCase()) ?? null,
    uploadedAt: row.uploaded_at,
    version: row.version,
    previewFileId: row.preview_file_id,
    previewSize: Number(row.preview_size),
  };
}

/** 이전 판 행 → 클라이언트 응답 */
export function toVersionResponse(row: FileVersionRow, names: Map<string, string | null>) {
  return {
    id: row.id,
    fileId: row.file_id,
    version: row.version,
    driveFileId: row.drive_file_id,
    name: row.name,
    size: Number(row.size),
    uploaderEmail: row.uploader_email,
    uploaderName: names.get(row.uploader_email.trim().toLowerCase()) ?? null,
    uploadedAt: row.uploaded_at,
  };
}

// ══════════════════════════════════════════════════════════════════
// 토론방 · 회의록 · 공간 관리 (M4)
// ══════════════════════════════════════════════════════════════════

/** DB 에서 읽은 안건 행 */
export interface DiscussionRow {
  id: string;
  module_id: string;
  department_id: string;
  author_email: string;
  title: string;
  body: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** DB 에서 읽은 투표 행 */
export interface VoteRow {
  id: string;
  discussion_id: string;
  member_email: string;
  stance: 'agree' | 'disagree' | 'abstain';
  comment: string;
  updated_at: string;
}

/** DB 에서 읽은 회의록 행 */
export interface MinutesRow {
  id: string;
  module_id: string;
  department_id: string;
  author_email: string;
  title: string;
  met_on: string;
  attendees: string;
  agenda: string;
  discussion: string;
  decisions: string;
  from_discussion_id: string | null;
  created_at: string;
  updated_at: string;
}

export const DISCUSSION_COLUMNS =
  'id, module_id, department_id, author_email, title, body, closed_at, created_at, updated_at';

export const MINUTES_COLUMNS =
  'id, module_id, department_id, author_email, title, met_on, attendees, agenda, discussion, decisions, from_discussion_id, created_at, updated_at';

/** 이 부서의 공간(모듈) 전체 — 탭 순서대로 */
export async function loadModules(db: Db, departmentId: string): Promise<ModuleRow[]> {
  const { data, error } = await db
    .from('staffroom_modules')
    .select('id, department_id, kind, name, position')
    .eq('department_id', departmentId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`공간 조회 실패: ${error.message}`);
  return (data ?? []) as ModuleRow[];
}

/** 이 부서의 안건 하나 — 남의 부서 id 를 보내도 통하지 않게 부서로 좁혀 읽는다 */
export async function loadDiscussion(
  db: Db,
  discussionId: string,
  departmentId: string,
): Promise<DiscussionRow | null> {
  const { data, error } = await db
    .from('staffroom_discussions')
    .select(DISCUSSION_COLUMNS)
    .eq('id', discussionId)
    .eq('department_id', departmentId)
    .maybeSingle();

  if (error) throw new Error(`안건 조회 실패: ${error.message}`);
  return (data as DiscussionRow | null) ?? null;
}

/** 이 부서의 회의록 하나 */
export async function loadMinutes(
  db: Db,
  minutesId: string,
  departmentId: string,
): Promise<MinutesRow | null> {
  const { data, error } = await db
    .from('staffroom_minutes')
    .select(MINUTES_COLUMNS)
    .eq('id', minutesId)
    .eq('department_id', departmentId)
    .maybeSingle();

  if (error) throw new Error(`회의록 조회 실패: ${error.message}`);
  return (data as MinutesRow | null) ?? null;
}

/** 안건 행 → 클라이언트 응답 */
export function toDiscussionResponse(
  row: DiscussionRow,
  names: Map<string, string | null>,
  opts: {
    tally: { agree: number; disagree: number; abstain: number };
    myVote: VoteRow | null;
  },
) {
  return {
    id: row.id,
    moduleId: row.module_id,
    departmentId: row.department_id,
    title: row.title,
    body: row.body,
    authorEmail: row.author_email,
    authorName: names.get(row.author_email.trim().toLowerCase()) ?? null,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tally: opts.tally,
    myVote: opts.myVote ? toVoteResponse(opts.myVote, names) : null,
  };
}

/** 투표 행 → 클라이언트 응답 */
export function toVoteResponse(row: VoteRow, names: Map<string, string | null>) {
  return {
    memberEmail: row.member_email,
    memberName: names.get(row.member_email.trim().toLowerCase()) ?? null,
    stance: row.stance,
    comment: row.comment,
    updatedAt: row.updated_at,
  };
}

/** 회의록 행 → 클라이언트 응답 */
export function toMinutesResponse(row: MinutesRow, names: Map<string, string | null>) {
  return {
    id: row.id,
    moduleId: row.module_id,
    departmentId: row.department_id,
    title: row.title,
    metOn: row.met_on,
    attendees: row.attendees,
    agenda: row.agenda,
    discussion: row.discussion,
    decisions: row.decisions,
    fromDiscussionId: row.from_discussion_id,
    authorEmail: row.author_email,
    authorName: names.get(row.author_email.trim().toLowerCase()) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 안건들의 찬반을 한 번에 센다.
 *
 * 앱이 투표를 전부 받아 세지 않는다 — 30명 부서에서 안건 20개면 600줄인데
 * 화면에 필요한 건 숫자 세 개다(계획서 §3.5-다 전송량).
 */
export async function loadTallies(
  db: Db,
  discussionIds: readonly string[],
): Promise<Map<string, { agree: number; disagree: number; abstain: number }>> {
  const empty = { agree: 0, disagree: 0, abstain: 0 };
  const map = new Map<string, { agree: number; disagree: number; abstain: number }>();
  for (const id of discussionIds) map.set(id, { ...empty });
  if (discussionIds.length === 0) return map;

  const { data, error } = await db.rpc('staffroom_discussion_tally', {
    p_discussion_ids: discussionIds,
  });
  if (error) throw new Error(`집계 실패: ${error.message}`);

  for (const row of (data ?? []) as Array<{
    discussion_id: string;
    agree_count: number;
    disagree_count: number;
    abstain_count: number;
  }>) {
    map.set(row.discussion_id, {
      agree: Number(row.agree_count),
      disagree: Number(row.disagree_count),
      abstain: Number(row.abstain_count),
    });
  }
  return map;
}
