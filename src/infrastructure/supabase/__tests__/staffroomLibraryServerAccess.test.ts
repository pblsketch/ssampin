/**
 * 온라인 교무실 자료실(M3) — 서버 인가 로직 테스트
 *
 * 왜 여기에 있나: vitest.config.ts 의 include 는 `src/**` 와 `electron/**` 뿐이라
 * `supabase/functions/**` 아래에 둔 테스트는 CI 에서 돌지 않는다.
 * 자료실 인가는 "남의 부서 파일이 보이지 않는다"와 "관리자 개인 파일이 새지 않는다"를
 * 떠받치는 부분이라 돌지 않는 테스트로 둘 수 없어, 순수 함수만 상대경로로 불러와 검증한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  canDeleteFile,
  canUploadFile,
  checkUploadInput,
  isTicketUsable,
  LIBRARY_FILE_MAX_BYTES,
  matchesTicket,
  UPLOAD_TICKET_TTL_MS,
  type AccessMember,
} from '../../../../supabase/functions/_shared/staffroomAccess';
import { STAFFROOM_FILE_MAX_BYTES } from '@domain/entities/StaffRoomLibrary';

const ADMIN: AccessMember = { id: 'm1', email: 'admin@school.kr', role: 'admin' };
const MEMBER: AccessMember = { id: 'm2', email: 'kim@school.kr', role: 'member' };
const OTHER: AccessMember = { id: 'm3', email: 'lee@school.kr', role: 'member' };
const MEMBERS = [ADMIN, MEMBER, OTHER];

const FOLDER = 'folder-abc';
const NOW = Date.parse('2026-08-21T10:00:00Z');

describe('★ 서버와 화면의 상한이 같은 값이다', () => {
  it('200MB 가 양쪽에서 같다 — 한쪽만 고치면 조용히 어긋난다', () => {
    expect(LIBRARY_FILE_MAX_BYTES).toBe(STAFFROOM_FILE_MAX_BYTES);
  });
});

describe('올리기 권한 (계획서 §10.6 — 업로드 승인 절차를 두지 않는다)', () => {
  it('멤버면 누구나 올릴 수 있다', () => {
    expect(canUploadFile(MEMBERS, MEMBER.email).ok).toBe(true);
    expect(canUploadFile(MEMBERS, ADMIN.email).ok).toBe(true);
  });

  it('멤버가 아니면 못 올린다', () => {
    const result = canUploadFile(MEMBERS, 'outsider@other.kr');
    expect(result).toEqual({ ok: false, reason: 'not_member' });
  });
});

describe('지우기 권한 — 올린 사람 본인 또는 관리자', () => {
  it('올린 본인은 지울 수 있다', () => {
    expect(canDeleteFile(MEMBERS, MEMBER.email, MEMBER.email).ok).toBe(true);
  });

  it('관리자는 남의 파일도 지울 수 있다', () => {
    expect(canDeleteFile(MEMBERS, ADMIN.email, MEMBER.email).ok).toBe(true);
  });

  it('남의 파일을 일반 멤버가 지울 수는 없다', () => {
    expect(canDeleteFile(MEMBERS, MEMBER.email, OTHER.email)).toEqual({
      ok: false,
      reason: 'not_author',
    });
  });

  it('멤버가 아니면 파일이 있는지조차 알려주지 않는다', () => {
    expect(canDeleteFile(MEMBERS, 'outsider@other.kr', MEMBER.email)).toEqual({
      ok: false,
      reason: 'not_member',
    });
  });
});

describe('올리기 입력 검사 (계획서 §10.6)', () => {
  it('보통 파일은 통과한다', () => {
    expect(checkUploadInput('교육과정.hwp', 1024)).toEqual({ ok: true, name: '교육과정.hwp' });
  });

  it('★ 200MB 를 넘으면 세션을 내주기 전에 막는다', () => {
    // 바이트가 서버를 지나지 않으므로(ADR-065) 여기서 못 막으면
    // 200MB 짜리가 관리자 드라이브에 들어갔다 나온다.
    expect(checkUploadInput('큰파일.zip', LIBRARY_FILE_MAX_BYTES + 1).ok).toBe(false);
    expect(checkUploadInput('딱맞음.zip', LIBRARY_FILE_MAX_BYTES).ok).toBe(true);
  });

  it('빈 파일·크기 없음은 막는다', () => {
    expect(checkUploadInput('빈.hwp', 0).ok).toBe(false);
    expect(checkUploadInput('빈.hwp', -5).ok).toBe(false);
    expect(checkUploadInput('빈.hwp', '100').ok).toBe(false);
  });

  it('경로 구분자가 든 이름은 막는다', () => {
    expect(checkUploadInput('../비밀.hwp', 100).ok).toBe(false);
    expect(checkUploadInput('폴더\\파일.hwp', 100).ok).toBe(false);
  });

  it('이름이 없으면 막는다', () => {
    expect(checkUploadInput('', 100).ok).toBe(false);
    expect(checkUploadInput(null, 100).ok).toBe(false);
  });
});

describe('★★ 커밋 대조 — 관리자 개인 파일이 새어 나가지 않게 (ADR-065)', () => {
  const ticket = { name: '계획서.hwp', size: 2048, folderId: FOLDER };

  const actual = (
    over: Partial<{
      name: string;
      size: number;
      parents: string[];
      trashed: boolean;
    }> = {},
  ) => ({
    name: '계획서.hwp',
    size: 2048,
    parents: [FOLDER],
    trashed: false,
    ...over,
  });

  it('표와 맞으면 통과', () => {
    expect(matchesTicket(ticket, actual())).toEqual({ ok: true });
  });

  it('★ 부서 폴더 밖의 파일은 거부한다 — 관리자 개인 파일 id 를 보내는 공격', () => {
    // 이걸 통과시키면 그 파일이 자료실에 등록되고, 등록되는 순간
    // 부서 멤버 전원이 열 수 있게 된다(§3.4-나 가 권한을 주므로).
    const result = matchesTicket(ticket, actual({ parents: ['관리자-개인폴더'] }));
    expect(result.ok).toBe(false);
  });

  it('이름이 다르면 거부한다', () => {
    expect(matchesTicket(ticket, actual({ name: '다른파일.hwp' })).ok).toBe(false);
  });

  it('크기가 다르면 거부한다', () => {
    expect(matchesTicket(ticket, actual({ size: 999 })).ok).toBe(false);
  });

  it('휴지통에 든 파일은 거부한다', () => {
    expect(matchesTicket(ticket, actual({ trashed: true })).ok).toBe(false);
  });

  it('부모 폴더가 여럿이어도 부서 폴더가 그중에 있으면 통과', () => {
    expect(matchesTicket(ticket, actual({ parents: ['다른곳', FOLDER] })).ok).toBe(true);
  });

  it('거부 사유는 한국어로 준다', () => {
    const result = matchesTicket(ticket, actual({ parents: ['남의폴더'] }));
    if (result.ok) throw new Error('거부됐어야 한다');
    expect(result.message).toMatch(/[가-힣]/);
  });
});

describe('올리기 표의 유효성 (ADR-065)', () => {
  const ticket = (
    over: Partial<{
      uploaderEmail: string;
      createdAt: string;
      consumedAt: string | null;
    }> = {},
  ) => ({
    uploaderEmail: MEMBER.email,
    createdAt: new Date(NOW - 60_000).toISOString(),
    consumedAt: null,
    ...over,
  });

  it('갓 만든 표는 쓸 수 있다', () => {
    expect(isTicketUsable(ticket(), MEMBER.email, NOW)).toEqual({ ok: true });
  });

  it('★ 한 표를 두 번 쓸 수 없다', () => {
    const used = ticket({ consumedAt: new Date(NOW - 30_000).toISOString() });
    expect(isTicketUsable(used, MEMBER.email, NOW).ok).toBe(false);
  });

  it('★ 남의 표로는 등록할 수 없다', () => {
    expect(isTicketUsable(ticket(), OTHER.email, NOW).ok).toBe(false);
  });

  it('대소문자가 달라도 같은 사람으로 본다', () => {
    expect(isTicketUsable(ticket(), '  KIM@School.kr ', NOW).ok).toBe(true);
  });

  it('하루가 지나면 못 쓴다 (경계값)', () => {
    const old = ticket({ createdAt: new Date(NOW - UPLOAD_TICKET_TTL_MS - 1).toISOString() });
    expect(isTicketUsable(old, MEMBER.email, NOW).ok).toBe(false);

    const justInside = ticket({
      createdAt: new Date(NOW - UPLOAD_TICKET_TTL_MS + 1).toISOString(),
    });
    expect(isTicketUsable(justInside, MEMBER.email, NOW).ok).toBe(true);
  });

  it('만든 시각을 알 수 없으면 거부한다', () => {
    expect(isTicketUsable(ticket({ createdAt: '알수없음' }), MEMBER.email, NOW).ok).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// UltraQA 로 찾은 결함 재발 방지 (2026-08-22)
//
// 아래는 전부 **게이트 4종을 통과한 채로 살아 있던 결함**이다. tsc·lint·test·regression 은
// "타입이 맞는가"를 보지 "뜻이 맞는가"를 못 본다. 그래서 함수 원문을 글자로 읽어 잠근다.
// ══════════════════════════════════════════════════════════════════
describe('★ UltraQA 결함 재발 방지 — 자료실 서버 함수', () => {
  const source = readFileSync(
    resolve(__dirname, '../../../../supabase/functions/staffroom-library/index.ts'),
    'utf-8',
  );

  it('★ 등록(commit)은 파일을 넣을 공간을 **표에 적힌 것**으로 정한다', () => {
    // 결함: `module_id: archive.id` 를 쓰면 기본 자료실로 떨어진다.
    // 올리기 세션과 등록은 서로 다른 요청이고, 등록할 때 앱이 공간을 다시 알려주지 않는다.
    // 그래서 **갤러리에 올린 사진이 자료실로 들어가 갤러리가 영영 비어 보였다.**
    const commitBlock = source.slice(
      source.indexOf("if (action === 'commit')"),
      source.indexOf("if (action === 'previewSession')"),
    );
    expect(commitBlock).toContain('module_id: ticket.module_id');
    expect(commitBlock).not.toContain('module_id: archive.id');
  });

  it('★ 목록은 그 공간의 자료만 준다 — 안 좁히면 갤러리에 자료실 파일이 섞인다', () => {
    const listBlock = source.slice(
      source.indexOf("if (action === 'list')"),
      source.indexOf("if (action === 'uploadSession')"),
    );
    expect(listBlock).toContain("eq('module_id'");
  });

  it('★ 구글 연결 여부를 **용량 숫자로 판단하지 않는다**', () => {
    // 결함: `driveConnected: driveLimit > 0` 이면, 용량 무제한인 구글 워크스페이스
    // (학교 계정)는 총량을 안 알려줘 limit 이 0 으로 오고 → 제대로 연결한 관리자에게도
    // "구글을 연결하지 않았습니다"가 계속 떴다.
    expect(source).not.toContain('driveConnected: driveLimit > 0');
    expect(source).toContain("driveStatus: 'connected' | 'missing' | 'broken'");
  });

  it('★ "아직 연결 안 함"과 "연결이 끊어짐"을 **값으로** 구분한다', () => {
    // 조치가 다르다 — 앞은 처음 연결, 뒤는 다시 로그인이다.
    // ★ 한국어 문구에 특정 낱말이 있는지로 판단하면 문구를 다듬는 순간 조용히 어긋난다.
    expect(source).toContain('driveStatus = error.kind');
    expect(source).not.toMatch(/error\.message\.includes/);

    const drive = readFileSync(
      resolve(__dirname, '../../../../supabase/functions/_shared/staffroomDrive.ts'),
      'utf-8',
    );
    expect(drive).toContain('readonly kind: AdminTokenProblem');
    expect(drive).toContain("ADMIN_TOKEN_MISSING_MESSAGE, 'missing'");
    expect(drive).toContain("ADMIN_TOKEN_BROKEN_MESSAGE, 'broken'");
  });
});
