/**
 * 온라인 교무실 — 글 분류 규칙 (말머리·해시태그, 마이그레이션 054)
 *
 * 여기서 하는 일은 **적힌 대로 저장하지 않고 다듬어서 저장하는 것**이다.
 * 다듬지 않으면 같은 뜻인데 다른 값으로 갈려서, 걸러 보기가 쓸모없어진다.
 * `#체육대회` · `체육대회` · ` 체육대회 ` 가 각각 다른 태그가 되면 아무것도
 * 못 찾는다.
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */

/** 말머리 이름 최대 길이 — 목록에서 한 줄을 넘지 않을 만큼 */
export const STAFFROOM_CATEGORY_NAME_MAX_LENGTH = 12;

/** 한 부서가 가질 수 있는 말머리 수 — 너무 많으면 고르는 것 자체가 일이 된다 */
export const STAFFROOM_CATEGORY_MAX_COUNT = 20;

/** 해시태그 하나의 최대 길이 */
export const STAFFROOM_TAG_MAX_LENGTH = 20;

/** 글 하나에 붙일 수 있는 해시태그 수 */
export const STAFFROOM_POST_MAX_TAGS = 10;

/**
 * 말머리 이름 다듬기.
 *
 * 못 쓰는 값이면 `null` 을 준다 — 부르는 쪽이 "이 이름은 쓸 수 없어요"를
 * 한국어로 알린다. 조용히 빈 이름을 만들면 목록에 빈 칸이 생기고, 그걸 고르면
 * 무슨 말머리인지 아무도 모른다.
 *
 * 대괄호를 떼는 이유: 선생님들이 `[공지]` 라고 적는 습관이 있는데, 화면이 이미
 * 말머리를 칸으로 감싸 보여주므로 그대로 두면 `[[공지]]` 처럼 보인다.
 */
export function normalizeStaffRoomCategoryName(raw: string): string | null {
  let name = raw.trim();
  // 감싼 괄호가 있으면 한 겹만 벗긴다 (`[공지]` → `공지`)
  if (name.length >= 2 && name.startsWith('[') && name.endsWith(']')) {
    name = name.slice(1, -1).trim();
  }
  // 줄바꿈·탭이 들어오면 목록이 무너진다 — 공백 하나로 모은다
  name = name.replace(/\s+/g, ' ');

  if (name === '') return null;
  if (name.length > STAFFROOM_CATEGORY_NAME_MAX_LENGTH) return null;
  return name;
}

/**
 * 해시태그 하나 다듬기.
 *
 * 못 쓰는 값이면 `null`. 태그는 여러 개를 한꺼번에 받으므로, 하나가 이상하다고
 * 전부 거부하지 않고 **그것만 빼는** 방식이 낫다(부르는 쪽에서 그렇게 쓴다).
 *
 * 다듬는 규칙과 그 이유:
 *  - 앞의 `#` 를 뗀다 — 붙여 쓴 사람과 안 붙인 사람의 태그가 갈리지 않게.
 *    여러 개 붙인 경우(`##체육`)도 전부 뗀다.
 *  - 안쪽 공백을 없앤다 — `체육 대회` 는 태그 하나로 본다. 공백을 남기면
 *    화면에서 두 태그처럼 보이고, 띄어쓰기 습관에 따라 갈린다.
 *  - 쉼표는 태그를 나누는 기호라 태그 안에 들어올 수 없다.
 */
export function normalizeStaffRoomTag(raw: string): string | null {
  let tag = raw.trim();
  // 앞의 # 를 전부 뗀다
  tag = tag.replace(/^#+/, '');
  // 공백류를 통째로 제거 (앞뒤 + 안쪽)
  tag = tag.replace(/\s+/g, '');
  // 나누는 기호가 값 안에 남아 있으면 나중에 다시 쪼개진다
  tag = tag.replace(/,/g, '');

  if (tag === '') return null;
  if (tag.length > STAFFROOM_TAG_MAX_LENGTH) return null;
  return tag;
}

/**
 * 태그 여러 개를 한 번에 다듬는다.
 *
 * - 못 쓰는 것은 조용히 뺀다(전부 거부하지 않는다).
 * - 같은 태그가 두 번 들어오면 하나만 남긴다. 다듬은 **뒤에** 견주므로
 *   `#체육대회` 와 `체육대회` 는 같은 것으로 본다.
 * - 개수 상한을 넘으면 **앞에서부터 잘라 남긴다.** 통째로 거부하면 선생님은
 *   무엇을 지워야 할지 모른 채 글을 못 올린다.
 * - 순서는 적은 순서를 지킨다 — 화면에 보이는 차례가 매번 바뀌면 어지럽다.
 */
export function normalizeStaffRoomTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of raw) {
    const tag = normalizeStaffRoomTag(item);
    if (tag === null) continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= STAFFROOM_POST_MAX_TAGS) break;
  }
  return out;
}

/**
 * 한 줄로 적은 태그를 쪼갠다.
 *
 * 선생님이 `#체육대회 #2학기, 준비물` 처럼 한 칸에 몰아 적는 걸 받아 주기 위한
 * 것이다. 쉼표와 공백을 둘 다 나누는 기호로 본다 — 어느 쪽 습관이든 통하게.
 */
export function splitStaffRoomTagInput(raw: string): string[] {
  return normalizeStaffRoomTags(raw.split(/[,\s]+/));
}

/** 화면에 보일 때 붙이는 `#` — 저장값에는 없다 */
export function formatStaffRoomTag(tag: string): string {
  return `#${tag}`;
}
