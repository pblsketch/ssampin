import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { academicTerm } from '@domain/rules/academicCalendar';

/**
 * AI 브릿지 고위험 게이트 고지 확인 기록 (v-ai-bridge+).
 *
 * 배경: 채점 쓰기·생기부 초안 쓰기는 학생 평가에 쓰이는 '고영향 AI' 활용에 해당할 수 있어,
 * 인공지능기본법상 교사는 학생·학부모에게 외부 AI 활용 사실을 알릴 의무가 있다. 이 스토어는
 * "교사가 그 안내를 보고 확인했다"는 기록을 남겨, 같은 학기·같은 고지문 버전 안에서는 토글을
 * 켤 때마다 반복해서 묻지 않도록(경고 피로 회피) 게이팅한다.
 *
 * 설계 결정: 이 기록은 **순수 UI 게이팅 상태**라 브릿지가 읽는 capability.json(게이트 파일)을
 * 건드리지 않고 앱 로컬에만 둔다 — 브릿지 계약/IPC 변경 없이 회귀 위험을 최소화한다.
 *
 * 재확인 규칙: 학사 학기(예: '2026-1')가 바뀌거나 고지문 버전이 오르면 다음 첫 ON 시 1회 재확인.
 * 같은 학기·버전 안에서는 무마찰. 앱 재시작만으로는 절대 재노출하지 않는다(영속 기록).
 */

/** 고지문 버전 — 본문이 실질적으로 바뀌면 올려서 재확인을 유도한다. */
export const AI_BRIDGE_NOTICE_VERSION = 1;

/** 고지 확인이 필요한 고위험 게이트(공식 성적·법정 기록 쓰기). */
export type HighRiskGate = 'allowGradeWrite' | 'allowRecordWrite';

export interface AiBridgeConsentState {
  /** key=`${gate}|${term}|v${version}` → 확인 시각(Unix ms). */
  acks: Record<string, number>;
}

export interface AiBridgeConsentActions {
  /** 고지 확인 기록 — 해당 게이트·학기·버전에 확인 시각을 남긴다. */
  acknowledge: (gate: HighRiskGate, term: string, version?: number) => void;
  /** 모든 확인 기록 초기화(디버그/테스트용). */
  reset: () => void;
}

export type AiBridgeConsentStore = AiBridgeConsentState & AiBridgeConsentActions;

/**
 * 한국 학사 학기 키(예: '2026-1') — 정본은 domain/rules/academicCalendar.
 * 기존 호출처 호환을 위해 re-export 유지(ackKey 값 불변).
 */
export { academicTerm } from '@domain/rules/academicCalendar';

/** 확인 기록 맵의 합성 키. */
export function ackKey(gate: HighRiskGate, term: string, version: number): string {
  return `${gate}|${term}|v${version}`;
}

/**
 * 이 게이트를 켜기 전에 고지 확인이 필요한가.
 * 해당 학기·버전의 확인 기록이 없으면 true(인라인 확인을 띄워야 함).
 */
export function needsConsent(
  gate: HighRiskGate,
  acks: Record<string, number>,
  now: Date = new Date(),
  version: number = AI_BRIDGE_NOTICE_VERSION,
): boolean {
  return acks[ackKey(gate, academicTerm(now), version)] === undefined;
}

const INITIAL_STATE: AiBridgeConsentState = {
  acks: {},
};

export const useAiBridgeConsentStore = create<AiBridgeConsentStore>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      acknowledge: (gate, term, version = AI_BRIDGE_NOTICE_VERSION) =>
        set((s) => ({
          acks: { ...s.acks, [ackKey(gate, term, version)]: Date.now() },
        })),

      reset: () => set(INITIAL_STATE),
    }),
    {
      name: 'ssampin-aibridge-consent-v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({ acks: state.acks }),
    },
  ),
);
