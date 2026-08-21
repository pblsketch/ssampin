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

type Db = ReturnType<typeof serviceClient>;

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
