/**
 * v2.0 신규 — 실시간 담벼락 어댑터 레이어 UI 상수.
 *
 * 도메인(`RealtimeWallTabConfig.ts`)이 identity sentinel(`DEFAULT_TAB_ID`)을 소유하고,
 * 어댑터(이 파일)가 사용자-가시 UI 문자열을 소유한다. 인프라(`XlsxExporter.ts` 등)는
 * 어느 쪽도 import 하지 않으며, fallback이 필요할 때는 id 자체를 사용한다.
 *
 * 분리 근거: Clean Architecture 4-layer 규칙 — 도메인 레이어는 외부 의존성 0
 * (Korean UI 문자열은 i18n 가능한 사용자-가시 copy이므로 어댑터에 위치).
 */

/**
 * 기본 탭 표시명 — 학생/교사 UI에서 default 탭을 가리키는 한국어 라벨.
 *
 * normalizer가 default 탭을 주입할 때, BoardListView 가 thumbnail 라벨을 그릴 때,
 * 교사 탭 strip이 default 탭 카드를 표시할 때 모두 이 상수를 참조한다.
 *
 * XlsxExporter 등 인프라 레이어는 이 상수를 import 하지 않는다 (id 자체를 fallback으로 사용).
 */
export const DEFAULT_TAB_TITLE = '전체' as const;
