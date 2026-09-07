/**
 * 온라인 교무실 제출 과제 — 순수 판정·투영
 *
 * 계획서: .omc/plans/staffroom-submission-plan.md (S2-1 · D2)
 *
 * ── ★ 이 파일에 import 를 더 두지 않는다 ────────────────────────────
 * 허용되는 import 는 `./staffroomAccess.ts` 하나뿐이고, 값·타입 모두 된다.
 * 그 파일은 import 문이 0개라 안전하다(실측: 단독 tsc EXIT=0).
 *
 * `staffroomDb.ts` 는 **값으로든 타입으로든** 참조하면 안 된다. 그 파일이
 * `https://esm.sh/...` 와 `Deno` 전역을 물고 있어서, `import type` 으로만
 * 참조해도 TS2307·TS2304 가 딸려 와 프로젝트 타입 검사가 깨진다.
 * 그래서 데이터베이스를 읽는 일은 `staffroomDb.ts` 쪽에 두고, 여기는
 * **받은 줄을 판정하고 조립하기만** 한다. 그래야 `src/` 쪽 테스트가
 * 상대경로로 불러 CI 에서 실제로 돌 수 있다.
 * 이 규칙은 주석이 아니라 `staffroomModuleKindDrift.meta.test.ts` 가 지킨다.
 *
 * ── ★ 가리는 자리를 조립 함수 안에 둔다 ────────────────────────────
 * `toSubmissionSummary` 의 반환 타입에는 **제출 주체의 지메일·이름 칸이 없다.**
 * 담으려 해도 타입이 막는다. 부서 멤버의 지메일을 정당하게 돌려주는 함수는
 * `toTargetsList` **하나뿐**이고, 그 함수를 부르는 자리는 권한 판정을 지난
 * 곳 하나로 좁힌다. "권한 없으면 이름을 지운다"를 여기저기 적는 방식은
 * 한 줄만 빠뜨려도 새기 때문에 쓰지 않는다.
 */
import { norm, requireMember, type AccessMember, type AccessResult } from './staffroomAccess.ts';

// ══════════════════════════════════════════════════════════════════
// 기준값
// ══════════════════════════════════════════════════════════════════

/** 제출 과제 하나에 걸 수 있는 사람 수 */
export const SUBMISSION_TARGET_MAX = 100;

/** 제목 최대 길이 — 게시판 글과 같은 값 */
export const SUBMISSION_TITLE_MAX_LENGTH = 100;

/** 안내 문구 최대 길이 */
export const SUBMISSION_GUIDE_MAX_LENGTH = 500;

/**
 * 개인 할 일 화면에 함께 내려보내는 **완료분의 나이 상한(일)**.
 *
 * 개인 화면은 완료한 것도 체크된 채로 그린다 — 안 그러면 누르는 순간 줄이
 * 사라져 잘못 누른 것을 되돌릴 수 없다. 그런데 제출 과제는 학년도 전환·보관함
 * 대상이 아니라 계속 쌓이므로, 창을 두지 않으면 1년 뒤 개인 화면이 완료된
 * 과거 과제로 덮인다. **되돌릴 필요가 있는 것은 방금 누른 것뿐이다.**
 */
export const SUBMISSION_DONE_WINDOW_DAYS = 14;

// ══════════════════════════════════════════════════════════════════
// 권한 판정
// ══════════════════════════════════════════════════════════════════

/**
 * "냈음" 표시를 켜고 끌 수 있는가.
 *
 * **본인 · 만든 사람(취합자) · 관리자.** 취합자가 들어가는 이유 — 종이나
 * 메신저로 받은 것을 대신 체크할 수 있어야 현황판이 실제와 맞는다.
 * 그 밖의 멤버는 남의 칸을 건드릴 수 없다. 남이 껐다 켜면 실제로는 안 낸 일이
 * 낸 것으로 보인다.
 */
export function canToggleSubmissionDone(
  members: readonly AccessMember[],
  viewerEmail: string,
  targetEmail: string,
  authorEmail: string,
): AccessResult {
  const found = requireMember(members, viewerEmail);
  if (!found.ok) return found;
  if (found.member.role === 'admin') return found;
  if (norm(viewerEmail) === norm(targetEmail)) return found;
  if (norm(viewerEmail) === norm(authorEmail)) return found;
  return { ok: false, reason: 'not_author' };
}

/**
 * "누가 안 냈는지" 명단을 볼 수 있는가.
 *
 * **만든 사람(취합자)과 관리자뿐이다.** 일반 멤버에게는 진행률 숫자와
 * 자기 상태만 보인다 — 교무실 화면에 미제출자 이름이 회색으로 남아 있는 것은
 * 부장에게는 편하지만 그 사람에게는 다른 뜻이다(계획서 §8-E 와 같은 결).
 *
 * ★ 화면이 버튼을 감추는 것과 별개로 **서버가 명단을 안 보낸다.**
 */
export function canSeeUnsubmittedList(
  members: readonly AccessMember[],
  viewerEmail: string,
  authorEmail: string,
): AccessResult {
  const found = requireMember(members, viewerEmail);
  if (!found.ok) return found;
  if (found.member.role === 'admin') return found;
  if (norm(viewerEmail) === norm(authorEmail)) return found;
  return { ok: false, reason: 'not_author' };
}

// ══════════════════════════════════════════════════════════════════
// 입력 다듬기
// ══════════════════════════════════════════════════════════════════

/** 제출 주체를 다듬은 결과 */
export interface NormalizedAssignees {
  /** 실제로 걸릴 지메일 (소문자, 중복 없음) */
  readonly kept: readonly string[];
  /** 부서 멤버가 아니라 빠진 사람 수 — 화면이 만든이에게 알린다 */
  readonly dropped: number;
}

/**
 * 제출 주체 목록을 다듬는다 — **이 부서 멤버만** 남긴다.
 *
 * ★ 빠진 사람을 조용히 버리지 않고 수를 돌려준다. 만든이는 B 선생님을 걸었다고
 *   믿는데 B 화면에 아무것도 안 뜨면 아무도 원인을 모른다.
 *
 * ★ 같은 사람을 두 번 적은 것은 `dropped` 에 세지 않는다. 그건 실수가 아니라
 *   그냥 중복이고, 알릴 일이 아니다. (데이터베이스에도 UNIQUE 가 걸려 있다)
 */
export function normalizeAssignees(
  members: readonly AccessMember[],
  raw: unknown,
): NormalizedAssignees {
  if (!Array.isArray(raw)) return { kept: [], dropped: 0 };

  const kept: string[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const entry of raw.slice(0, SUBMISSION_TARGET_MAX)) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      dropped += 1;
      continue;
    }
    const target = norm(entry);
    if (seen.has(target)) continue; // 중복은 실수가 아니다 — 세지 않는다
    const found = members.find((m) => norm(m.email) === target);
    if (!found) {
      dropped += 1;
      continue;
    }
    seen.add(target);
    kept.push(norm(found.email));
  }

  return { kept, dropped };
}

// ══════════════════════════════════════════════════════════════════
// 투영 — 무엇을 내보내고 무엇을 안 내보내는가
// ══════════════════════════════════════════════════════════════════

/** 데이터베이스에서 읽어 온 제출 주체 한 줄 */
export interface SubmissionTargetRow {
  readonly member_email: string;
  readonly display_name_snapshot: string | null;
  readonly done_at: string | null;
}

/** 데이터베이스에서 읽어 온 제출 과제 한 줄 */
export interface SubmissionRow {
  readonly id: string;
  readonly module_id: string;
  readonly department_id: string;
  readonly author_email: string;
  readonly title: string;
  readonly due_on: string | null;
  readonly guide: string;
  readonly doc_url: string;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * 목록에 실어 보내는 제출 과제 한 줄.
 *
 * ★ **제출 주체의 지메일·이름 칸이 없다.** 진행률은 숫자로만, 내 상태는
 *   내 것만 담는다. 담을 자리가 타입에 없으므로 실수로 담으려 하면 타입 검사가
 *   막는다 — 이게 이 설계의 핵심이다.
 * ★ `authorName` 도 없다. 이 저장소의 다른 응답이 전부 이름을 함께 주기 때문에
 *   무심코 붙이기 쉬운데, 그러면 "만든이 말고는 아무 멤버 이름도 응답에 없다"는
 *   계약이 깨진다. 화면은 만든이를 "내가 올린 과제" 표시로만 그린다.
 */
export interface SubmissionSummary {
  readonly id: string;
  readonly moduleId: string;
  readonly title: string;
  readonly dueOn: string | null;
  readonly guide: string;
  readonly docUrl: string;
  /** 만든이(취합자). 화면이 "안 낸 분 보기"를 그릴지 판정하는 데 필요한 유일한 예외 */
  readonly authorEmail: string;
  /** 낸 사람 수 — 부서를 나간 사람은 빼고 센다 */
  readonly doneCount: number;
  /** 내야 하는 사람 수 — 부서를 나간 사람은 빼고 센다 */
  readonly totalCount: number;
  /** 내가 낸 시각. 내가 주체가 아니거나 아직 안 냈으면 null */
  readonly myDoneAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * 제출 과제 한 줄을 목록용으로 조립한다.
 *
 * ★ 주체 줄을 **인자로 받되 내보내지는 않는다.** 진행률을 세려면 받아야 하고,
 *   내보내면 안 되는 것은 반환 타입이 막는다.
 *
 * ★ 부서를 나간 사람은 분모에서도 분자에서도 뺀다. 안 빼면 그 과제는
 *   `11/12` 에서 영원히 안 채워져 "끝났다"를 말할 수 없다. 분자만 빼거나
 *   분모만 빼면 `12/11` 같은 숫자가 나온다.
 */
export function toSubmissionSummary(
  row: SubmissionRow,
  targets: readonly SubmissionTargetRow[],
  viewerEmail: string,
  activeMemberEmails: readonly string[],
): SubmissionSummary {
  const active = new Set(activeMemberEmails.map(norm));
  const counted = targets.filter((t) => active.has(norm(t.member_email)));
  const me = norm(viewerEmail);

  return {
    id: row.id,
    moduleId: row.module_id,
    title: row.title,
    dueOn: row.due_on,
    guide: row.guide,
    docUrl: row.doc_url,
    authorEmail: row.author_email,
    doneCount: counted.filter((t) => t.done_at !== null).length,
    totalCount: counted.length,
    myDoneAt: targets.find((t) => norm(t.member_email) === me)?.done_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 명단에 실리는 한 사람 */
export interface SubmissionTargetView {
  readonly email: string;
  /** 화면에 보일 이름. 아직 아무도 이름을 안 정했으면 null */
  readonly name: string | null;
  readonly doneAt: string | null;
}

/**
 * 제출 주체 명단 — **부서 멤버의 지메일을 정당하게 돌려주는 유일한 함수.**
 *
 * 그래서 이 함수를 부르는 자리는 `canSeeUnsubmittedList` 를 지난 곳 하나뿐이어야
 * 하고, 회귀 검사가 그 호출을 글자로 고정한다.
 *
 * 세 구역으로 나눈다:
 *   done     냈다 — 취합자가 실수로 켠 것을 되돌리려면 이게 보여야 한다
 *   pending  아직 안 냈다 (진행률 분모에 든다)
 *   excluded 부서를 나갔다 (분모에서 뺀 사람들. 왜 빠졌는지 보이게 남긴다)
 *
 * ★ 이름 고르는 순서: 지금 멤버면 **산 이름** → 없으면 **걸 때 복사해 둔 이름**
 *   → 그것도 없으면 null. 구글이 이름을 안 주므로 본인이 안 정했으면 처음부터
 *   없을 수 있다. 화면이 그때 "이름 없는 선생님"으로 그린다.
 */
export function toTargetsList(
  targets: readonly SubmissionTargetRow[],
  members: readonly AccessMember[],
  nameOf: Readonly<Record<string, string | null>> = {},
): {
  readonly done: readonly SubmissionTargetView[];
  readonly pending: readonly SubmissionTargetView[];
  readonly excluded: readonly SubmissionTargetView[];
} {
  const active = new Set(members.map((m) => norm(m.email)));

  const done: SubmissionTargetView[] = [];
  const pending: SubmissionTargetView[] = [];
  const excluded: SubmissionTargetView[] = [];

  for (const target of targets) {
    const email = norm(target.member_email);
    const view: SubmissionTargetView = {
      email,
      name: nameOf[email] ?? target.display_name_snapshot,
      doneAt: target.done_at,
    };
    if (!active.has(email)) excluded.push(view);
    else if (target.done_at !== null) done.push(view);
    else pending.push(view);
  }

  return { done, pending, excluded };
}

/** 안 낸 사람 명단 — `toTargetsList` 의 파생이다. 조립 자리를 둘로 만들지 않는다 */
export function toUnsubmittedList(
  targets: readonly SubmissionTargetRow[],
  members: readonly AccessMember[],
  nameOf: Readonly<Record<string, string | null>> = {},
): {
  readonly pending: readonly SubmissionTargetView[];
  readonly excluded: readonly SubmissionTargetView[];
} {
  const { pending, excluded } = toTargetsList(targets, members, nameOf);
  return { pending, excluded };
}

/**
 * 개인 화면에 함께 내려보낼 완료분의 경계 시각.
 *
 * 이 시각보다 나중에 낸 것만 싣는다. 순수 함수라 단위 테스트로 고정할 수 있다 —
 * 15일을 기다려 확인할 수는 없기 때문이다.
 */
export function doneWindowStart(now: Date): string {
  const start = new Date(now.getTime() - SUBMISSION_DONE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return start.toISOString();
}
