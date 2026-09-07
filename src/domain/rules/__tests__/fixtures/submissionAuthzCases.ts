/**
 * 제출 과제 권한 케이스 표 — **한 벌만 둔다.**
 *
 * 같은 판정이 두 곳에 있다:
 *   화면용  src/domain/rules/staffRoomRoomRules.ts            → boolean
 *   서버용  supabase/functions/_shared/staffroomSubmissions.ts → AccessResult
 *
 * Deno 엣지 함수가 `src/` 를 import 할 수 없어 일부러 복제한 것이다. 어긋나면
 * **화면은 막는데 서버는 통과**하거나 그 반대가 되고, 검사 4종은 전부 초록이다.
 *
 * 그래서 표를 여기 한 파일에 두고 두 테스트가 각각 import 한다.
 * **표를 복사해 두 벌로 만들지 말 것** — 그 순간 이 장치가 무의미해진다.
 *
 * ★ 서버 테스트는 반드시 `src/infrastructure/supabase/__tests__/` 아래에 둔다.
 *   `supabase/functions/**` 아래에 두면 vitest include 밖이라 **한 번도 안 돈다**
 *   (`_shared/sigRetention.test.ts` 가 이미 그 상태다).
 */

export const ADMIN_EMAIL = 'admin@school.kr';
/** 과제를 만든 사람. 관리자가 아닌 일반 멤버다 — 취합은 부장만 하는 일이 아니다 */
export const AUTHOR_EMAIL = 'author@school.kr';
/** 제출 주체로 걸린 일반 멤버 */
export const TARGET_EMAIL = 'target@school.kr';
/**
 * "남의 칸" 검사에 쓰는 **또 다른** 주체.
 *
 * ★ 보는 사람과 절대 겹치지 않아야 한다. TARGET_EMAIL 을 그대로 쓰면
 *   TARGET 선생님이 볼 때는 그게 "자기 칸"이 되어 검사가 헛돈다.
 */
export const OTHER_TARGET_EMAIL = 'other-target@school.kr';
/** 주체도 만든이도 아닌 그냥 멤버 */
export const BYSTANDER_EMAIL = 'bystander@school.kr';
/** 부서 밖 사람 */
export const OUTSIDER_EMAIL = 'outsider@other.kr';

export interface SubmissionAuthzCase {
  /** 무엇을 확인하는 줄인가 — 실패했을 때 이 글이 그대로 보인다 */
  readonly what: string;
  readonly viewerEmail: string;
  /** 부서 밖 사람이면 null */
  readonly viewerRole: 'admin' | 'member' | null;
  /** 내 칸을 켜고 끌 수 있는가 (주체 = 나) */
  readonly canToggleOwn: boolean;
  /** 남의 칸을 켜고 끌 수 있는가 (주체 = OTHER_TARGET_EMAIL, 보는 사람과 절대 안 겹친다) */
  readonly canToggleOther: boolean;
  /** "안 낸 분" 명단을 볼 수 있는가 */
  readonly canSeeList: boolean;
}

/**
 * 9가지 경우.
 *
 * 핵심은 3행과 4행이다 — **주체도 만든이도 아닌 일반 멤버는 남의 칸도, 명단도
 * 건드릴 수 없다.** 여기가 뚫리면 미제출자 이름이 부서 전원에게 보인다.
 */
export const SUBMISSION_AUTHZ_CASES: readonly SubmissionAuthzCase[] = [
  {
    what: '관리자는 남의 칸도 켜고 끄고 명단도 본다',
    viewerEmail: ADMIN_EMAIL,
    viewerRole: 'admin',
    canToggleOwn: true,
    canToggleOther: true,
    canSeeList: true,
  },
  {
    what: '만든이(일반 멤버)는 취합자다 — 남의 칸도 대신 체크하고 명단도 본다',
    viewerEmail: AUTHOR_EMAIL,
    viewerRole: 'member',
    canToggleOwn: true,
    canToggleOther: true,
    canSeeList: true,
  },
  {
    what: '주체로 걸린 일반 멤버는 자기 칸만 — 남의 칸도 명단도 안 된다',
    viewerEmail: TARGET_EMAIL,
    viewerRole: 'member',
    canToggleOwn: true,
    canToggleOther: false,
    canSeeList: false,
  },
  {
    what: '주체도 만든이도 아닌 멤버는 아무것도 못 한다',
    viewerEmail: BYSTANDER_EMAIL,
    viewerRole: 'member',
    canToggleOwn: true, // 자기가 주체인 과제라면 자기 칸은 가능하다
    canToggleOther: false,
    canSeeList: false,
  },
  {
    what: '부서 밖 사람은 부서가 있는지조차 알 수 없다',
    viewerEmail: OUTSIDER_EMAIL,
    viewerRole: null,
    canToggleOwn: false,
    canToggleOther: false,
    canSeeList: false,
  },
  {
    what: '대소문자가 달라도 같은 사람이다 — 만든이',
    viewerEmail: AUTHOR_EMAIL.toUpperCase(),
    viewerRole: 'member',
    canToggleOwn: true,
    canToggleOther: true,
    canSeeList: true,
  },
  {
    what: '대소문자가 달라도 같은 사람이다 — 주체',
    viewerEmail: TARGET_EMAIL.toUpperCase(),
    viewerRole: 'member',
    canToggleOwn: true,
    canToggleOther: false,
    canSeeList: false,
  },
  {
    what: '앞뒤 공백이 있어도 같은 사람이다',
    viewerEmail: `  ${AUTHOR_EMAIL}  `,
    viewerRole: 'member',
    canToggleOwn: true,
    canToggleOther: true,
    canSeeList: true,
  },
  {
    what: '부서 밖 사람은 관리자 흉내를 낼 수 없다',
    viewerEmail: OUTSIDER_EMAIL.toUpperCase(),
    viewerRole: null,
    canToggleOwn: false,
    canToggleOther: false,
    canSeeList: false,
  },
];
