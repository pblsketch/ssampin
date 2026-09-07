/**
 * RecordAiDraft 엔티티 — 구독 AI 가 쓴 생기부 초안 **한 판(버전)**.
 *
 * 왜 따로 두나(오너 결정 2026-09-06, ADR-085): AI 가 만든 초안은 **만든 것마다 전부** 남긴다. 선생님이
 * 반영한 것·뒤에 붙인 것·그냥 두고 다른 판을 만든 것 모두. 그래야 "아까 그 판이 더 나았는데"가 되고,
 * 내 글과 좌우로 비교할 수 있다. 반대로 **[버리기]는 삭제**다 — 버린 판은 남지 않는다.
 *
 * 개인정보: 저장 시점에 이미 실명으로 되돌린 글이다. 별칭 ↔ 실명 매핑은 저장하지 않는다(기존 원칙).
 * 수위는 `RecordDraft` 와 같다 — 같은 폴더·같은 백업·같은 보관함·같은 동기화(snapshot).
 *
 * 저장: record-ai-drafts.json = { records: RecordAiDraft[] }.
 * 상한: 학생·영역(+과목)당 `RECORD_AI_DRAFT_MAX` 개. 넘으면 가장 오래된 **미반영** 판부터 지운다.
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지.
 */
import type { RecordArea } from './RecordDraft';
import type { NarrativeParagraph } from '../rules/narrativeParagraphs';

/** 어느 초안 칸의 판인가 — `RecordDraft` 의 upsert 키와 같은 축(area + studentRef + subject). */
export interface RecordAiDraftKey {
  readonly area: RecordArea;
  readonly studentRef: string;
  readonly subject?: string;
  readonly classId?: string;
}

export interface RecordAiDraft {
  readonly id: string;
  readonly draftKey: RecordAiDraftKey;
  /** 어느 주제로 썼나(없으면 전체 근거). */
  readonly threadId?: string;
  readonly provider: 'claude' | 'codex';
  readonly model?: string;
  /**
   * 이 초안을 만들 때 쓴 **작성 규정(1층 프롬프트)의 판본**. 서버가 배급하면서 함께 준다.
   *
   * ★없을 수 있다: 이 칸이 생기기 전에 만들어진 판, 그리고 규정을 못 받아 만료된 캐시로
   *   쓴 경우(그때도 그 캐시의 판본이 들어간다). 부재는 "옛 판"이라는 뜻이다.
   * ★왜 남기나: 규정은 학사 기재요령을 따르므로 고쳐질 수 있고, 고친 뒤에 **어느 초안이
   *   옛 규정으로 만들어졌는지** 골라낼 수 있어야 한다(ADR-089). 서버는 전부터 판본을
   *   내려보내고 있었는데 앱이 버리고 있었다.
   */
  readonly promptVersion?: number;
  /** 실명 복원·표식 분리가 끝난 문단들. 표식이 없던 문단은 role=null. */
  readonly paragraphs: readonly NarrativeParagraph[];
  /** "제외됨 N건 (…)" 요약. 빠진 게 없으면 빈 문자열. */
  readonly excluded: string;
  /** [반영]·[뒤에 붙이기]한 시각. 없으면 아직 안 반영. */
  readonly appliedAt?: number;
  /**
   * 이 판이 **분량 조절**로 만들어졌으면 그 내역. 부재 = 새로 쓴 판(병합에서 덮지 말 것).
   *
   * ★`sourceText` 를 판 안에 함께 넣는 이유: 판 상한이 20개이고 `enforceAiDraftCap` 이
   *   **미반영 판부터** 지우기 때문에, `sourceVersionId` 가 가리키던 원문 판이 먼저 지워질 수
   *   있다. 그러면 [원문과 비교]가 빈 화면이 된다. 스냅숏이 있으면 그때도 비교가 산다.
   * ★개인정보·용량 절충: 한도를 넘어 `record-drafts.json` 에는 저장이 거부된 본문이
   *   여기에는 스냅숏으로 남고 동기화된다. 사실상 한도 강제를 우회해 보관하는 셈이다(ADR-086).
   */
  readonly adjust?: RecordAiDraftAdjust;
  readonly createdAt: number;
}

/** 분량 조절 내역. 조절로 만들어진 판에만 붙는다. */
export interface RecordAiDraftAdjust {
  readonly kind: 'shrink' | 'expand';
  /** 선생님이 고른 목표 바이트(최종 저장 본문 기준). */
  readonly targetBytes: number;
  /** 조절 대상이 된 판의 id. 대상이 "직접 쓴 글"이었으면 없다. */
  readonly sourceVersionId?: string;
  /** 조절 직전 원문 스냅숏. [원문과 비교]가 이걸 쓴다. */
  readonly sourceText: string;
  /** 앱이 최종 본문으로 **실제로 센** 바이트. 모델이 말한 숫자가 아니다. */
  readonly resultBytes: number;
  /** 실제 CLI 왕복 횟수. 1 = 한 번에 나옴, 2 = 자동 재조정이 돌았음. */
  readonly attempts: 1 | 2;
  /** 선생님이 고른 쪽. `attempts: 2` 인데 1차를 골랐으면 1이다. */
  readonly pickedAttempt: 1 | 2;
}

export interface RecordAiDraftData {
  readonly records: readonly RecordAiDraft[];
}

export const RECORD_AI_DRAFT_MAX = 20;

const subjectKey = (s?: string): string => s ?? '';

/** 같은 초안 칸의 판인가. `classId` 는 키에 넣지 않는다 — `RecordDraft` 의 upsert 키와 같은 축을 쓴다. */
export function sameAiDraftKey(a: RecordAiDraftKey, b: RecordAiDraftKey): boolean {
  return (
    a.area === b.area &&
    a.studentRef === b.studentRef &&
    subjectKey(a.subject) === subjectKey(b.subject)
  );
}

/** 한 판의 본문 — 문단을 빈 줄로 이은 순수 텍스트(표식 없음). */
export function aiDraftText(draft: Pick<RecordAiDraft, 'paragraphs'>): string {
  // ★생기부는 한 덩어리 글이다 — 문단을 빈 줄로 잇지 않고 **공백 하나**로 잇는다(오너 결정 2026-09-06).
  // 문단의 흔적은 `roleMarks` 에만 남고, 화면에서는 인라인 형광펜 색이 구조를 보여 준다.
  return draft.paragraphs
    .map((p) => p.text.trim())
    .filter((t) => t.length > 0)
    .join(' ');
}

/**
 * 상한 적용 — 같은 칸의 판이 `max` 를 넘으면 오래된 **미반영** 판부터, 그래도 넘치면 오래된 반영 판을 지운다.
 * 다른 칸의 판은 건드리지 않는다. 반환은 새 배열(원본 불변).
 */
export function enforceAiDraftCap(
  records: readonly RecordAiDraft[],
  key: RecordAiDraftKey,
  max: number = RECORD_AI_DRAFT_MAX,
): RecordAiDraft[] {
  const mine = records.filter((r) => sameAiDraftKey(r.draftKey, key));
  if (mine.length <= max) return [...records];
  const excess = mine.length - max;
  const byAge = (a: RecordAiDraft, b: RecordAiDraft): number => a.createdAt - b.createdAt;
  const unapplied = mine.filter((r) => r.appliedAt === undefined).sort(byAge);
  const applied = mine.filter((r) => r.appliedAt !== undefined).sort(byAge);
  const victims = new Set<string>();
  for (const r of [...unapplied, ...applied]) {
    if (victims.size >= excess) break;
    victims.add(r.id);
  }
  return records.filter((r) => !victims.has(r.id));
}
