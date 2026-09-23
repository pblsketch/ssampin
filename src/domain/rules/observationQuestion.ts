/**
 * 관찰 기록 응원 2·3차(ADR-137) — 글쓰기 창의 '질문 한 줄'.
 *
 * - 그 학생에게 그 카드(담임반 / 그 수업반)에서 **이번 학기**에 아직 기록이 없는 **기본 장면**을
 *   묻는다. 선생님이 더한 장면은 묻지 않는다(직접 만든 칸을 재촉하지 않는다 — `emptySlots` 와 같다).
 * - 빈 장면이 여럿이면 돌아가며 묻는다. 어느 장면을 물을지는 날짜와 학생으로 정해진다 —
 *   같은 학생이라도 날마다 달라진다. 따로 저장하는 값은 없다.
 * - 빈 장면이 없으면 줄이 없다.
 * - 선생님만 보는 창이라 실명을 쓴다(기록 알림 창과 같다).
 */
import { emptySlots, type SlotContext } from './observationSlots';

/**
 * 장면마다 질문 문구(조정 가능). `{name}` 자리에 학생 이름이 들어간다.
 * 이름 뒤 조사는 이름마다 달라 '학생'을 붙여 맞춘다.
 */
export const SCENE_QUESTIONS: Readonly<Record<string, readonly string[]>> = {
  // 교과
  질문: ['{name} 학생이 궁금해서 되물은 순간이 있었나요?'],
  시도: ['{name} 학생이 스스로 골라서 해 본 것이 있었나요?'],
  시행착오: ['{name} 학생이 막혔다가 다시 해 본 순간이 있었나요?'],
  산출물: ['{name} 학생이 만들거나 발표한 것이 있었나요?'],
  피드백: ['{name} 학생이 조언을 듣고 어떻게 바꿨나요?'],
  융합: ['{name} 학생이 다른 과목과 이어 생각한 순간이 있었나요?'],
  // 담임
  '학습 태도': ['{name} 학생이 수업에 임하는 모습이 눈에 띈 순간이 있었나요?'],
  '인성·관계': ['{name} 학생이 친구와 지내는 모습에서 기억나는 일이 있었나요?'],
  '학급 역할': ['{name} 학생이 반을 위해 맡아서 한 일이 있었나요?'],
  변화: ['{name} 학생이 학기 초와 달라진 모습이 있었나요?'],
  '아쉬운 점': ['{name} 학생에게 더 도와주고 싶은 점이 보였나요?'],
  진로: ['{name} 학생이 관심을 보인 분야가 있었나요?'],
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 로컬 날짜의 일련번호(1970-01-01 = 0). */
function dayIndex(date: string): number {
  if (!DATE_RE.test(date)) return 0;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** 문자열의 작은 해시(결정론, 음수 아님). */
function smallHash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * 이번 학기 그 학생 기록 가운데 아직 없는 기본 장면(표시 순서).
 * 오늘 뒤 날짜 기록(날짜를 잘못 고른 기록)은 그날이 올 때까지 세지 않는다.
 */
export function emptyDefaultScenesThisTerm(
  studentRecords: ReadonlyArray<{ readonly date: string; readonly slots?: readonly string[] }>,
  context: SlotContext,
  termStart: string,
  today: string,
): string[] {
  return emptySlots(
    studentRecords.filter((r) => r.date >= termStart && r.date <= today),
    context,
  );
}

/** 오늘 물을 장면 — 빈 장면이 없으면 null. 날짜·학생으로 정해지고 날마다 돌아간다. */
export function pickQuestionScene(
  emptyScenes: readonly string[],
  today: string,
  studentRef: string,
): string | null {
  if (emptyScenes.length === 0) return null;
  const idx = (dayIndex(today) + smallHash(studentRef)) % emptyScenes.length;
  return emptyScenes[idx] ?? null;
}

/** 질문 문구. 장면 문구가 없으면 null. */
export function sceneQuestionText(scene: string, studentName: string): string | null {
  const pool = SCENE_QUESTIONS[scene];
  const template = pool?.[0];
  if (template === undefined) return null;
  return template.replace('{name}', studentName.trim());
}
