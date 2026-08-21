/**
 * 온라인 교무실 — 자료실 (M3)
 *
 * 계획서: §3.2.1(읽는 길도 서버) · §3.4(서버는 바이트를 나르지 않는다) ·
 *        §4(미리보기) · §8-C(새 버전·용량) · §10.6(200MB 상한) · ADR-065
 *
 * ── 파일이 오가는 길 ────────────────────────────────────────────────
 *
 *  올릴 때
 *    1) uploadSession — 서버가 관리자 권한으로 **업로드 세션 주소**를 받아 건네준다.
 *       표(ticket)에 이름·크기·폴더를 적어 둔다.
 *    2) 멤버의 쌤핀이 그 주소로 **구글에 곧장** 올린다. 서버를 지나지 않는다.
 *    3) commit — 돌아온 파일 id 가 표와 맞는지 서버가 **드라이브에 되물어** 확인하고 등록한다.
 *       (되묻지 않으면 관리자 개인 파일 id 를 보내 부서에 노출시킬 수 있다.)
 *
 *  내려받을 때
 *    download — 서버가 그 멤버 지메일에 **읽기 권한을 주고** 구글 링크만 돌려준다.
 *              파일은 구글에서 선생님에게 곧장 간다.
 *
 *  ★ 예외는 미리보기 글자 하나뿐이다(previews). drive.file 권한 탓에 멤버가 직접
 *    못 읽어서 서버가 읽어 준다. 양이 작다 — 부서당 연 1.5MB 남짓(§3.4-다).
 *
 * action:
 *   list          { departmentId }                                  → 파일 목록 + 용량
 *   uploadSession { departmentId, name, mimeType, size, replacesFileId? } → { uploadUrl, ticketId }
 *   commit        { departmentId, ticketId, driveFileId }           → 등록된 파일
 *   previewSession{ departmentId, fileId, size }                    → 미리보기 글자 올릴 주소
 *   commitPreview { departmentId, ticketId, driveFileId, fileId }
 *   download      { departmentId, fileId }                          → { url } (권한 부여 포함)
 *   delete        { departmentId, fileId }
 *   versions      { departmentId, fileId }                          → 접어 둔 이전 판
 *   previews      { departmentId, fileIds }                         → 검색용 글자 (§3.4-가)
 *   searchPosts   { departmentId, query }                          → 글 제목·본문에서 찾기 (§8-A)
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';
import { verifyGoogleIdentity, normalizeEmail } from '../_shared/googleIdentity.ts';
import {
  canDeleteFile,
  canUploadFile,
  checkUploadInput,
  denialMessage,
  denialStatus,
  isTicketUsable,
  matchesTicket,
  requireMember,
} from '../_shared/staffroomAccess.ts';
import {
  serviceClient,
  ensureArchiveModule,
  loadFile,
  loadMembers,
  nameMapOf,
  toAccessMembers,
  toFileResponse,
  toVersionResponse,
  FILE_COLUMNS,
  POST_SUMMARY_COLUMNS,
  type FileRow,
  type FileVersionRow,
  type UploadTicketRow,
  type PostSummaryRow,
  type Db,
} from '../_shared/staffroomDb.ts';
import {
  AdminTokenError,
  adminAccessToken,
  createUploadSession,
  driveQuota,
  ensureDepartmentFolder,
  ensurePreviewFolder,
  fileMeta,
  grantReader,
  readTextFile,
  trashDriveFile,
} from '../_shared/staffroomDrive.ts';

/** 한 번에 내려보내는 파일 수 */
const PAGE_SIZE = 300;

/** 미리보기 글자를 한 번에 몇 개까지 읽어 줄 것인가 — 한 요청이 너무 무거워지지 않게 */
const PREVIEW_BATCH_MAX = 30;

/** 미리보기 글자 파일 크기 상한 — 5만 자면 UTF-8 로 최대 150KB 남짓(§3.4-다) */
const PREVIEW_MAX_BYTES = 200 * 1024;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action: unknown = body?.action;
    const googleAccessToken: unknown = body?.googleAccessToken;
    const departmentId = typeof body?.departmentId === 'string' ? body.departmentId : '';

    if (typeof googleAccessToken !== 'string' || !googleAccessToken) {
      return errorResponse('구글 로그인이 필요합니다', 401);
    }
    if (!departmentId) return errorResponse('부서를 찾을 수 없습니다', 400);

    const identity = await verifyGoogleIdentity(googleAccessToken);
    if (!identity) {
      return errorResponse('구글 계정 확인에 실패했습니다. 다시 로그인해주세요', 401);
    }

    const db = serviceClient();
    const members = await loadMembers(db, departmentId);
    const access = toAccessMembers(members);
    const names = nameMapOf(members);

    // 멤버가 아니면 자료가 있는지조차 알려주지 않는다
    const viewer = requireMember(access, identity.email);
    if (!viewer.ok) {
      return errorResponse(denialMessage(viewer.reason), denialStatus(viewer.reason));
    }
    const myEmail = normalizeEmail(identity.email);

    // 부서 정보 — 폴더를 만들 때 이름이 필요하다
    const { data: deptData } = await db
      .from('staffroom_departments')
      .select('id, name, drive_folder_id')
      .eq('id', departmentId)
      .maybeSingle();
    const dept = deptData as { id: string; name: string; drive_folder_id: string | null } | null;
    if (!dept) return errorResponse('부서를 찾을 수 없습니다', 404);

    const archive = await ensureArchiveModule(db, departmentId);

    // ── 목록 + 용량 ─────────────────────────────────────────────────
    if (action === 'list') {
      const { data, error } = await db
        .from('staffroom_files')
        .select(FILE_COLUMNS)
        .eq('department_id', departmentId)
        .order('uploaded_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (error) throw new Error(`자료 목록 조회 실패: ${error.message}`);
      const rows = (data ?? []) as FileRow[];

      // 부서가 쓰는 용량은 데이터베이스가 센다(목록에 크기를 실어 보내지 않아도 되게)
      const { data: usageData } = await db.rpc('staffroom_storage_usage', {
        p_department_ids: [departmentId],
      });
      const usageRow = (usageData ?? [])[0] as
        | { department_id: string; used_bytes: number; file_count: number }
        | undefined;

      // 관리자 드라이브 전체 사용량 — 토큰이 없으면 0 으로 두고 화면이 안내한다
      let driveUsed = 0;
      let driveLimit = 0;
      try {
        const token = await adminAccessToken(db, departmentId);
        const quota = await driveQuota(token);
        driveUsed = quota.used;
        driveLimit = quota.limit;
      } catch (error) {
        if (!(error instanceof AdminTokenError)) throw error;
        // 관리자 연결이 끊겼어도 목록은 보여준다 — 무엇이 있는지는 알 수 있어야 한다
      }

      return jsonResponse({
        module: {
          id: archive.id,
          departmentId: archive.department_id,
          kind: archive.kind,
          name: archive.name,
          position: archive.position,
          unreadCount: 0,
        },
        files: rows.map((r) => toFileResponse(r, names)),
        usage: {
          departmentBytes: Number(usageRow?.used_bytes ?? 0),
          driveUsedBytes: driveUsed,
          driveLimitBytes: driveLimit,
        },
        driveConnected: driveLimit > 0,
      });
    }

    // ── 올리기 세션 발급 (ADR-065) ──────────────────────────────────
    if (action === 'uploadSession') {
      const allowed = canUploadFile(access, identity.email);
      if (!allowed.ok) {
        return errorResponse(denialMessage(allowed.reason), denialStatus(allowed.reason));
      }

      // ★ 세션을 내주기 **전에** 크기를 본다. 바이트가 서버를 지나지 않으므로
      //   여기서 못 막으면 200MB 짜리가 관리자 드라이브에 들어갔다 나온다.
      const checked = checkUploadInput(body?.name, body?.size);
      if (!checked.ok) return errorResponse(checked.message, 400);

      const mimeType =
        typeof body?.mimeType === 'string' && body.mimeType
          ? body.mimeType
          : 'application/octet-stream';

      const replacesFileId =
        typeof body?.replacesFileId === 'string' && body.replacesFileId
          ? body.replacesFileId
          : null;

      // 새 판으로 덮을 파일이 정말 이 부서 것인지 확인한다
      if (replacesFileId) {
        const target = await loadFile(db, replacesFileId, departmentId);
        if (!target) return errorResponse('덮어쓸 파일을 찾을 수 없습니다', 404);
      }

      const token = await adminAccessToken(db, departmentId);
      const folderId = await ensureDepartmentFolder(db, departmentId, dept.name, token);
      const uploadUrl = await createUploadSession(
        token,
        folderId,
        checked.name,
        mimeType,
        body.size as number,
      );

      const { data: ticket, error } = await db
        .from('staffroom_upload_tickets')
        .insert({
          department_id: departmentId,
          module_id: archive.id,
          uploader_email: myEmail,
          name: checked.name,
          mime_type: mimeType,
          size: body.size,
          folder_id: folderId,
          replaces_file_id: replacesFileId,
          kind: 'file',
        })
        .select('id')
        .single();

      if (error) throw new Error(`올리기 표 발급 실패: ${error.message}`);

      return jsonResponse({ uploadUrl, ticketId: (ticket as { id: string }).id });
    }

    // ── 올린 뒤 등록 (ADR-065 대조) ─────────────────────────────────
    if (action === 'commit') {
      const ticketId = typeof body?.ticketId === 'string' ? body.ticketId : '';
      const driveFileId = typeof body?.driveFileId === 'string' ? body.driveFileId : '';
      if (!ticketId || !driveFileId) return errorResponse('올리기 정보가 없습니다', 400);

      const ticket = await readTicket(db, ticketId, departmentId, 'file');
      if (!ticket) return errorResponse('올리기 정보를 찾을 수 없습니다', 404);

      const usable = isTicketUsable(
        {
          uploaderEmail: ticket.uploader_email,
          createdAt: ticket.created_at,
          consumedAt: ticket.consumed_at,
        },
        myEmail,
        Date.now(),
      );
      if (!usable.ok) return errorResponse(usable.message, 409);

      // ★★ 드라이브에 되물어 표와 대조한다.
      //    이 확인이 없으면 관리자 개인 파일 id 를 보내 부서 전원에게 노출시킬 수 있다.
      const token = await adminAccessToken(db, departmentId);
      const meta = await fileMeta(token, driveFileId);
      const matched = matchesTicket(
        { name: ticket.name, size: Number(ticket.size), folderId: ticket.folder_id },
        {
          name: meta.name,
          size: Number(meta.size ?? 0),
          parents: meta.parents ?? [],
          trashed: meta.trashed === true,
        },
      );
      if (!matched.ok) return errorResponse(matched.message, 400);

      // 표를 먼저 소비 처리한다 — 같은 표로 두 번 등록되지 않게
      await db
        .from('staffroom_upload_tickets')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', ticketId);

      // 새 판이면 이전 판을 접어 넣고 현재 판을 갈아 끼운다 (§8-C)
      if (ticket.replaces_file_id) {
        const previous = await loadFile(db, ticket.replaces_file_id, departmentId);
        if (!previous) return errorResponse('덮어쓸 파일을 찾을 수 없습니다', 404);

        await db.from('staffroom_file_versions').insert({
          file_id: previous.id,
          version: previous.version,
          drive_file_id: previous.drive_file_id,
          name: previous.name,
          size: previous.size,
          uploader_email: previous.uploader_email,
          uploaded_at: previous.uploaded_at,
          preview_file_id: previous.preview_file_id,
        });

        const { data: updated, error: updateError } = await db
          .from('staffroom_files')
          .update({
            drive_file_id: driveFileId,
            name: ticket.name,
            mime_type: ticket.mime_type,
            size: ticket.size,
            uploader_email: myEmail,
            uploaded_at: new Date().toISOString(),
            version: previous.version + 1,
            // 새 판의 글자는 아직 없다 — 올린 쪽이 이어서 previewSession 을 부른다
            preview_file_id: null,
            preview_size: 0,
          })
          .eq('id', previous.id)
          .select(FILE_COLUMNS)
          .single();

        if (updateError) throw new Error(`새 판 등록 실패: ${updateError.message}`);
        return jsonResponse({ file: toFileResponse(updated as FileRow, names) });
      }

      const { data: created, error: insertError } = await db
        .from('staffroom_files')
        .insert({
          department_id: departmentId,
          module_id: archive.id,
          drive_file_id: driveFileId,
          name: ticket.name,
          mime_type: ticket.mime_type,
          size: ticket.size,
          uploader_email: myEmail,
          version: 1,
        })
        .select(FILE_COLUMNS)
        .single();

      if (insertError) throw new Error(`파일 등록 실패: ${insertError.message}`);
      return jsonResponse({ file: toFileResponse(created as FileRow, names) });
    }

    // ── 미리보기 글자 올리기 (§3.4-가) ──────────────────────────────
    if (action === 'previewSession') {
      const fileId = typeof body?.fileId === 'string' ? body.fileId : '';
      const size = typeof body?.size === 'number' ? body.size : 0;
      if (!fileId) return errorResponse('파일을 찾을 수 없습니다', 400);
      if (size <= 0 || size > PREVIEW_MAX_BYTES) {
        return errorResponse('미리보기 글자 크기가 올바르지 않습니다', 400);
      }

      const target = await loadFile(db, fileId, departmentId);
      if (!target) return errorResponse('파일을 찾을 수 없습니다', 404);

      const token = await adminAccessToken(db, departmentId);
      const folderId = await ensureDepartmentFolder(db, departmentId, dept.name, token);
      const previewFolder = await ensurePreviewFolder(token, folderId);
      const uploadUrl = await createUploadSession(
        token,
        previewFolder,
        `${target.id}.md`,
        'text/markdown',
        size,
      );

      const { data: ticket, error } = await db
        .from('staffroom_upload_tickets')
        .insert({
          department_id: departmentId,
          module_id: archive.id,
          uploader_email: myEmail,
          name: `${target.id}.md`,
          mime_type: 'text/markdown',
          size,
          folder_id: previewFolder,
          replaces_file_id: target.id,
          kind: 'preview',
        })
        .select('id')
        .single();

      if (error) throw new Error(`미리보기 표 발급 실패: ${error.message}`);
      return jsonResponse({ uploadUrl, ticketId: (ticket as { id: string }).id });
    }

    if (action === 'commitPreview') {
      const ticketId = typeof body?.ticketId === 'string' ? body.ticketId : '';
      const driveFileId = typeof body?.driveFileId === 'string' ? body.driveFileId : '';
      if (!ticketId || !driveFileId) return errorResponse('올리기 정보가 없습니다', 400);

      const ticket = await readTicket(db, ticketId, departmentId, 'preview');
      if (!ticket) return errorResponse('올리기 정보를 찾을 수 없습니다', 404);

      const usable = isTicketUsable(
        {
          uploaderEmail: ticket.uploader_email,
          createdAt: ticket.created_at,
          consumedAt: ticket.consumed_at,
        },
        myEmail,
        Date.now(),
      );
      if (!usable.ok) return errorResponse(usable.message, 409);

      const token = await adminAccessToken(db, departmentId);
      const meta = await fileMeta(token, driveFileId);
      const matched = matchesTicket(
        { name: ticket.name, size: Number(ticket.size), folderId: ticket.folder_id },
        {
          name: meta.name,
          size: Number(meta.size ?? 0),
          parents: meta.parents ?? [],
          trashed: meta.trashed === true,
        },
      );
      if (!matched.ok) return errorResponse(matched.message, 400);

      await db
        .from('staffroom_upload_tickets')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', ticketId);

      await db
        .from('staffroom_files')
        .update({ preview_file_id: driveFileId, preview_size: ticket.size })
        .eq('id', ticket.replaces_file_id)
        .eq('department_id', departmentId);

      return jsonResponse({ ok: true });
    }

    // ── 내려받기 — 권한만 주고 빠진다 (§3.4-나) ─────────────────────
    if (action === 'download') {
      const fileId = typeof body?.fileId === 'string' ? body.fileId : '';
      if (!fileId) return errorResponse('파일을 찾을 수 없습니다', 400);

      const target = await loadFile(db, fileId, departmentId);
      if (!target) return errorResponse('파일을 찾을 수 없습니다', 404);

      const token = await adminAccessToken(db, departmentId);

      // 이미 권한을 준 적이 있으면 다시 만들지 않는다
      const { data: existing } = await db
        .from('staffroom_file_grants')
        .select('permission_id')
        .eq('file_id', fileId)
        .eq('member_email', myEmail)
        .maybeSingle();

      if (!existing) {
        const permissionId = await grantReader(token, target.drive_file_id, myEmail);
        await db.from('staffroom_file_grants').insert({
          department_id: departmentId,
          file_id: fileId,
          drive_file_id: target.drive_file_id,
          member_email: myEmail,
          permission_id: permissionId,
        });
      }

      const meta = await fileMeta(token, target.drive_file_id);
      return jsonResponse({
        url: meta.webViewLink ?? `https://drive.google.com/file/d/${target.drive_file_id}/view`,
        name: target.name,
      });
    }

    // ── 지우기 ──────────────────────────────────────────────────────
    if (action === 'delete') {
      const fileId = typeof body?.fileId === 'string' ? body.fileId : '';
      if (!fileId) return errorResponse('파일을 찾을 수 없습니다', 400);

      const target = await loadFile(db, fileId, departmentId);
      if (!target) return errorResponse('파일을 찾을 수 없습니다', 404);

      const allowed = canDeleteFile(access, identity.email, target.uploader_email);
      if (!allowed.ok) {
        return errorResponse(denialMessage(allowed.reason), denialStatus(allowed.reason));
      }

      // 드라이브에서는 휴지통으로만 보낸다 — 잘못 지웠을 때 관리자가 되돌릴 수 있게
      try {
        const token = await adminAccessToken(db, departmentId);
        await trashDriveFile(token, target.drive_file_id);
        if (target.preview_file_id) await trashDriveFile(token, target.preview_file_id);
      } catch (error) {
        if (!(error instanceof AdminTokenError)) throw error;
        // 관리자 연결이 끊겼어도 목록에서는 지운다 — 드라이브 파일은 남는다
        console.warn('[staffroom-library] 관리자 연결이 끊겨 드라이브 파일을 못 지웠습니다');
      }

      const { error } = await db
        .from('staffroom_files')
        .delete()
        .eq('id', fileId)
        .eq('department_id', departmentId);
      if (error) throw new Error(`파일 삭제 실패: ${error.message}`);

      return jsonResponse({ ok: true });
    }

    // ── 접어 둔 이전 판 (§8-C) ──────────────────────────────────────
    if (action === 'versions') {
      const fileId = typeof body?.fileId === 'string' ? body.fileId : '';
      if (!fileId) return errorResponse('파일을 찾을 수 없습니다', 400);

      const target = await loadFile(db, fileId, departmentId);
      if (!target) return errorResponse('파일을 찾을 수 없습니다', 404);

      const { data, error } = await db
        .from('staffroom_file_versions')
        .select(
          'id, file_id, version, drive_file_id, name, size, uploader_email, uploaded_at, preview_file_id',
        )
        .eq('file_id', fileId)
        .order('version', { ascending: false });

      if (error) throw new Error(`이전 판 조회 실패: ${error.message}`);
      const rows = (data ?? []) as FileVersionRow[];
      return jsonResponse({ versions: rows.map((r) => toVersionResponse(r, names)) });
    }

    // ── 검색용 글자 내려주기 (§3.4-가) ──────────────────────────────
    if (action === 'previews') {
      const requested = Array.isArray(body?.fileIds) ? body.fileIds : [];
      const fileIds = requested
        .filter((id: unknown): id is string => typeof id === 'string')
        .slice(0, PREVIEW_BATCH_MAX);

      if (fileIds.length === 0) return jsonResponse({ previews: [] });

      const { data, error } = await db
        .from('staffroom_files')
        .select('id, preview_file_id')
        .eq('department_id', departmentId)
        .in('id', fileIds);

      if (error) throw new Error(`미리보기 조회 실패: ${error.message}`);
      const rows = (data ?? []) as Array<{ id: string; preview_file_id: string | null }>;

      const token = await adminAccessToken(db, departmentId);
      const previews: Array<{ fileId: string; text: string }> = [];

      for (const row of rows) {
        if (!row.preview_file_id) continue;
        try {
          previews.push({ fileId: row.id, text: await readTextFile(token, row.preview_file_id) });
        } catch (error) {
          if (error instanceof AdminTokenError) throw error;
          // 글자 하나를 못 읽었다고 검색 전체를 멈추지 않는다
          console.warn('[staffroom-library] 미리보기 읽기 건너뜀:', row.id);
        }
      }

      return jsonResponse({ previews });
    }

    // ── 글에서 찾기 (§8-A 부서 전체 검색) ───────────────────────────
    //
    // ★ 왜 서버가 찾는가 — 글 본문은 목록에 실려 오지 않는다(§3.5-다 전송량).
    //   파일은 미리보기 글자를 각자 PC 에 받아 두므로 앱이 직접 찾지만,
    //   글은 본문이 앱에 없어서 서버가 찾아 **걸린 것만** 돌려주는 편이 훨씬 싸다.
    //   (전부 내려받아 앱에서 찾으면 §3.5-다 가 막으려던 그 전송량이 그대로 든다.)
    if (action === 'searchPosts') {
      const raw = typeof body?.query === 'string' ? body.query.trim() : '';
      if (raw.length < 2) return jsonResponse({ posts: [] });

      // ★ 검색어를 그대로 필터 문자열에 끼워 넣지 않는다.
      //
      // PostgREST 의 `or(...)` 는 **쉼표·괄호가 구분자**다. 검색어에 그런 글자가 들어오면
      // 필터가 통째로 다른 뜻이 되어(다른 부서 글을 긁어오는 조건이 될 수도 있다) 위험하다.
      // `%`·`_` 는 ILIKE 의 만능 문자라 "전부 걸리는" 검색이 된다.
      // 한국어 검색에서 이 글자들이 뜻을 갖는 경우는 없으므로 아예 걷어낸다.
      const needle = raw
        .replace(/[,()\\%_."*:]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (needle.length < 2) return jsonResponse({ posts: [] });
      const pattern = `%${needle}%`;

      const { data, error } = await db
        .from('staffroom_posts')
        .select(`${POST_SUMMARY_COLUMNS}, body`)
        .eq('department_id', departmentId)
        .or(`title.ilike.${pattern},body.ilike.${pattern}`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw new Error(`글 검색 실패: ${error.message}`);
      const rows = (data ?? []) as Array<PostSummaryRow & { body: string }>;

      // 본문을 통째로 돌려보내지 않는다 — 걸린 자리 주변만 잘라 보낸다(§3.5-다)
      // 잘라낸 뒤의 낱말로 찾아야 DB 가 걸러낸 것과 같은 자리를 가리킨다
      const lowered = needle.toLowerCase();
      return jsonResponse({
        posts: rows.map((row) => {
          const at = row.body.toLowerCase().indexOf(lowered);
          const matchedInContent = at >= 0 && !row.title.toLowerCase().includes(lowered);
          const start = at >= 0 ? Math.max(0, at - 40) : 0;
          const snippet =
            at >= 0
              ? `${start > 0 ? '…' : ''}${row.body
                  .slice(start, at + lowered.length + 40)
                  .replace(/\s+/g, ' ')
                  .trim()}…`
              : row.title;
          return {
            id: row.id,
            moduleId: row.module_id,
            title: row.title,
            authorEmail: row.author_email,
            authorName: names.get(row.author_email.trim().toLowerCase()) ?? null,
            snippet,
            matchedInContent,
            updatedAt: row.updated_at,
          };
        }),
      });
    }

    return errorResponse('알 수 없는 요청입니다', 400);
  } catch (error) {
    // 관리자 연결이 끊긴 것은 서버 잘못이 아니라 조치가 필요한 상태다 —
    // 한국어로 무엇을 해야 하는지까지 알려준다(§3.2.1)
    if (error instanceof AdminTokenError) {
      return errorResponse(error.message, 409);
    }
    console.error('[staffroom-library] 오류:', error);
    return internalErrorResponse();
  }
});

/** 표를 읽는다 — 부서와 종류로 좁혀서 (남의 부서 표를 쓰지 못하게) */
async function readTicket(
  db: Db,
  ticketId: string,
  departmentId: string,
  kind: 'file' | 'preview',
): Promise<UploadTicketRow | null> {
  const { data, error } = await db
    .from('staffroom_upload_tickets')
    .select('*')
    .eq('id', ticketId)
    .eq('department_id', departmentId)
    .eq('kind', kind)
    .maybeSingle();

  if (error) throw new Error(`올리기 표 조회 실패: ${error.message}`);
  return (data as UploadTicketRow | null) ?? null;
}
