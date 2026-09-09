/**
 * 자기평가 추천 문항 — **슬롯을 달고 온다.**
 *
 * 설계의 핵심 장치가 여기 있다(설계서 §3-2). 교사가 문항을 자유롭게 쓰면 학생 답변이 슬롯과
 * 안 맞아 "같은 언어로 정렬한다"는 목적이 깨진다. 그래서 **추천 문항에 슬롯을 미리 달아 둔다.**
 * 교사가 추천을 고르면 그 답변이 자동으로 해당 갈래로 들어간다.
 *
 * ★교사 자율이 먼저다. 빈 칸에서 시작하고, 필요할 때 추천을 꺼낸다. 추천을 필수로 만들지 않는다.
 * ★슬롯 문자열은 `observationSlots` 의 값을 **그대로** 쓴다. 여기서 새로 만들면 교사 관찰과
 *   학생 성찰이 서로 다른 갈래가 되어 한자리에 모이지 않는다.
 *
 * 이 파일은 도메인이다. 외부 의존성 import 금지, 순수 함수만 둔다.
 *
 * ★**P2 착수 전까지 운영 소비자가 0건이다** — 지금 이 파일(과 `SelfAssessment.ts`)을 부르는 것은
 *   테스트뿐이다. 버그가 아니라 순서다. 문항 편집 화면(P2)이 그대로 소비한다.
 *   `TERM_REVIEW_PRESETS`·`uncoveredSlots`·`isPresetUsed` 는 아직 없는 P2 화면의 특정 UI 를
 *   가정한 **선반영**이라, 디자인 확정 과정에서 버려질 수 있다(UI 는 프론트엔드 디자인
 *   에이전트와 함께 정한다는 규칙이 있다). "왜 안 쓰이지?"로 시간 쓰지 말 것.
 */
import type { SelfAssessmentQuestion } from '@domain/entities/SelfAssessment';
import type { SlotContext } from '@domain/rules/observationSlots';
import { HOMEROOM_SLOTS, TEACHING_SLOTS } from '@domain/rules/observationSlots';

/** 추천 문항 하나 — 저장되는 문항과 달리 id 가 없다(고를 때 만든다). */
export interface SelfAssessmentPreset {
  /** `observationSlots` 의 슬롯 값. */
  readonly slot: string;
  /** 학생에게 보이는 물음. */
  readonly prompt: string;
}

/**
 * 교과(수업반) 추천 — 세특 서사의 갈래를 학생의 말로 묻는다.
 * 배열 순서는 `TEACHING_SLOTS` 와 같다(화면 칩 순서가 관찰 입력과 어긋나지 않게).
 */
export const TEACHING_PRESETS: readonly SelfAssessmentPreset[] = [
  { slot: '질문', prompt: '이 활동을 하면서 가장 궁금했던 건 무엇이었나요?' },
  { slot: '시도', prompt: '여러 방법 중에 무엇을 골랐고, 왜 그걸 골랐나요?' },
  { slot: '시행착오', prompt: '처음 생각대로 안 됐던 지점이 있나요? 어떻게 바꿨나요?' },
  { slot: '산출물', prompt: '이번에 만든 것 중 가장 잘 됐다고 생각하는 부분은 무엇인가요?' },
  { slot: '피드백', prompt: '선생님이나 친구의 말 중에 생각을 바꾸게 한 것이 있나요?' },
  { slot: '융합', prompt: '다른 과목에서 배운 것과 이어진 데가 있나요?' },
];

/**
 * 담임 추천 — 행동특성 및 종합의견의 갈래.
 *
 * ★`변화` 문항은 **학기말 회고용**이다. 활동 하나가 끝난 직후에 물으면 학생이 지어낸다.
 *   기재요령상 변화 서술은 시기 대비가 관찰된 경우에만 쓸 수 있다.
 */
export const HOMEROOM_PRESETS: readonly SelfAssessmentPreset[] = [
  { slot: '학습 태도', prompt: '이번 활동에서 스스로 잘했다고 생각하는 공부 습관이 있나요?' },
  { slot: '인성·관계', prompt: '함께한 친구들과 있었던 일 중 기억에 남는 장면을 적어 주세요.' },
  { slot: '학급 역할', prompt: '내가 맡은 역할에서 실제로 한 일은 무엇인가요?' },
  { slot: '변화', prompt: '학기 초의 나와 지금의 나를 견주면 달라진 점이 있나요?' },
  { slot: '아쉬운 점', prompt: '다시 한다면 무엇을 다르게 하고 싶나요?' },
  { slot: '진로', prompt: '이번 활동이 앞으로 하고 싶은 일과 이어지는 데가 있나요?' },
];

/** 맥락별 추천 목록. */
export function presetsForContext(context: SlotContext): readonly SelfAssessmentPreset[] {
  return context === 'teaching' ? TEACHING_PRESETS : HOMEROOM_PRESETS;
}

/**
 * 학기말 종합용 회고 문항.
 *
 * ★설계서 §3-4 의 "앞선 답변 보여주기"는 v1 에서 만들지 않는다(ADR-096 결정 4) — 학생 식별이
 *   번호·이름 타이핑뿐이라 남의 번호를 넣으면 **남의 지난 답변이 보인다.** 대신 문항 자체를
 *   회고형으로 두어 "기억에 남은 것만 쓰게" 한다(설계서가 "끌 때 좋은 점"으로 든 방식).
 */
export const TERM_REVIEW_PRESETS: readonly SelfAssessmentPreset[] = [
  { slot: '질문', prompt: '이번 학기에 품었던 물음 중 아직 안 풀린 것이 있나요?' },
  { slot: '시행착오', prompt: '이번 학기에 가장 크게 막혔던 일과, 그때 한 일을 적어 주세요.' },
  {
    slot: '산출물',
    prompt: '이번 학기 활동 중 남에게 보여 주고 싶은 것 하나를 고르고 이유를 적어 주세요.',
  },
];

/**
 * 추천 문항 → 저장할 문항. id 는 호출자가 만든 값을 받는다.
 *
 * ★id 를 이 함수가 만들지 않는 이유: 도메인은 순수해야 해서 `crypto.randomUUID` 나 시각을 쓸 수
 *   없다. 어댑터가 만들어 넘긴다.
 */
export function presetToQuestion(preset: SelfAssessmentPreset, id: string): SelfAssessmentQuestion {
  return { id, prompt: preset.prompt, slot: preset.slot };
}

/**
 * 이 추천이 이미 문항 목록에 들어 있는가 — 화면에서 칩을 흐리게 할 때 쓴다.
 * 물음 원문으로 견준다(교사가 문구를 고쳤으면 다른 문항으로 본다).
 */
export function isPresetUsed(
  preset: SelfAssessmentPreset,
  questions: readonly SelfAssessmentQuestion[],
): boolean {
  return questions.some((q) => q.prompt.trim() === preset.prompt.trim());
}

/**
 * 맥락의 기본 슬롯 중 아직 아무 문항도 겨냥하지 않은 갈래.
 * "무엇을 더 물으면 좋을지" 교사에게 보여 줄 때 쓴다. 표시 순서를 보존한다.
 *
 * ★재촉하지 않는다. 문항을 다 채우라는 뜻이 아니라 고를 거리를 보여 주는 목록이다.
 */
export function uncoveredSlots(
  questions: readonly SelfAssessmentQuestion[],
  context: SlotContext,
): string[] {
  const used = new Set(questions.map((q) => q.slot).filter((s): s is string => s !== undefined));
  const base = context === 'teaching' ? TEACHING_SLOTS : HOMEROOM_SLOTS;
  return base.filter((s) => !used.has(s));
}
