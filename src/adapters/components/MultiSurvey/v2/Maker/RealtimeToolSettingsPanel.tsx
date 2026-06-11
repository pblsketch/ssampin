/**
 * RealtimeToolSettingsPanel — 11종 토글 3그룹 아코디언 (인라인, ModalCoordinator 불요)
 *
 * 그룹 구성 (toggle-placement.md 결정 완료):
 * - 발표 설정 (그룹 1, 기본 ON): showCumulativeScore / revealExplanation / allowReentry
 * - 응답 설정 (그룹 2, 기본 OFF): explicitSubmitButton / autoAdvance / fastSolveBonus / streakBonus / randomBonus
 * - 표시 설정 (그룹 3, 기본 OFF): teacherFocusMode / showPerQuestionScore
 *
 * DN-01: 옵션 변경은 store action을 직접 동기 호출
 * sp-* 토큰: sp-surface, sp-border, sp-text, sp-muted, sp-accent, sp-duration-slow
 */

import { useMultiSurveyV2Store } from '@adapters/stores/useMultiSurveyV2Store';
import type {
  PresentationOpts,
  ResponseOpts,
  DisplayOpts,
} from '@domain/entities/multiSurvey/MultiSurveyV2';
import { ToggleGroup } from './ToggleGroup';
import { SettingToggle } from './SettingToggle';

interface RealtimeToolSettingsPanelProps {
  readonly sessionId: string;
  readonly presentationOpts: PresentationOpts;
  readonly responseOpts: ResponseOpts;
  readonly displayOpts: DisplayOpts;
}

export function RealtimeToolSettingsPanel({
  sessionId,
  presentationOpts,
  responseOpts,
  displayOpts,
}: RealtimeToolSettingsPanelProps): JSX.Element {
  const updatePresentationOpts = useMultiSurveyV2Store((s) => s.updatePresentationOpts);
  const updateResponseOpts = useMultiSurveyV2Store((s) => s.updateResponseOpts);
  const updateDisplayOpts = useMultiSurveyV2Store((s) => s.updateDisplayOpts);

  return (
    <div
      className={[
        'flex flex-col gap-3 p-3 bg-sp-surface border-l border-sp-border h-full overflow-y-auto',
        'transition-colors duration-sp-slow motion-reduce:transition-none',
      ].join(' ')}
      aria-label="실시간 도구 설정"
    >
      <header className="mb-1">
        <h2 className="text-base font-sp-semibold text-sp-text">설정</h2>
        <p className="mt-0.5 text-xs text-sp-muted">11개 옵션을 한 번에 조정하세요</p>
      </header>

      {/* 그룹 1 — 발표 설정 (기본 ON) */}
      <ToggleGroup title="발표 설정" subtitle="학습 UX 차원" defaultOpen>
        <SettingToggle
          label="누적 점수 표시"
          description="라운드마다 누적된 점수를 학생 화면에 표시합니다."
          checked={presentationOpts.showCumulativeScore}
          onChange={(next) => updatePresentationOpts(sessionId, { showCumulativeScore: next })}
        />
        <SettingToggle
          label="해설 노출"
          description="정답 공개 시 문항 해설을 함께 보여줍니다."
          checked={presentationOpts.revealExplanation}
          onChange={(next) => updatePresentationOpts(sessionId, { revealExplanation: next })}
        />
        <SettingToggle
          label="재입장 허용"
          description="세션 중 접속이 끊긴 학생이 다시 들어올 수 있습니다."
          checked={presentationOpts.allowReentry}
          onChange={(next) => updatePresentationOpts(sessionId, { allowReentry: next })}
        />
      </ToggleGroup>

      {/* 그룹 2 — 응답 설정 (기본 OFF) */}
      <ToggleGroup title="응답 설정" subtitle="설문(퀴즈) 메카닉" defaultOpen={false}>
        <SettingToggle
          label="정답 제출 버튼"
          description="학생이 명시적으로 [제출] 버튼을 눌러야 응답이 기록됩니다."
          checked={responseOpts.explicitSubmitButton}
          onChange={(next) => updateResponseOpts(sessionId, { explicitSubmitButton: next })}
        />
        <SettingToggle
          label="자동 넘김"
          description="문항 타이머 종료 시 다음 문항으로 자동 진행합니다."
          checked={responseOpts.autoAdvance}
          onChange={(next) => updateResponseOpts(sessionId, { autoAdvance: next })}
        />
        <p className="px-1 pb-2 text-xs text-sp-muted leading-relaxed">
          ℹ️ 자동 진행은 타이머 설정 + 문항별 점수 공개 OFF + 이 설정 ON 일 때 작동합니다.
        </p>
        <SettingToggle
          label="빠른 풀이 보너스"
          description="제한시간 안에 빠르게 답할수록 추가 점수를 부여합니다."
          checked={responseOpts.fastSolveBonus}
          onChange={(next) => updateResponseOpts(sessionId, { fastSolveBonus: next })}
        />
        <SettingToggle
          label="연속 정답 보너스"
          description="연속으로 정답을 맞히면 추가 점수를 부여합니다."
          checked={responseOpts.streakBonus}
          onChange={(next) => updateResponseOpts(sessionId, { streakBonus: next })}
        />
        <SettingToggle
          label="랜덤 보너스"
          description="특정 문항에 랜덤 보너스가 추첨됩니다."
          checked={responseOpts.randomBonus}
          onChange={(next) => updateResponseOpts(sessionId, { randomBonus: next })}
        />
      </ToggleGroup>

      {/* 그룹 3 — 표시 설정 (기본 OFF) */}
      <ToggleGroup title="표시 설정" subtitle="교사 UX" defaultOpen={false}>
        <SettingToggle
          label="교사 집중 모드"
          description="학생 화면 일부 정보를 가려 교사 화면에 집중하도록 합니다."
          checked={displayOpts.teacherFocusMode}
          onChange={(next) => updateDisplayOpts(sessionId, { teacherFocusMode: next })}
        />
        <SettingToggle
          label="문항별 점수 확인"
          description="문항별 라운드 결과를 별도 단계로 보여줍니다."
          checked={displayOpts.showPerQuestionScore}
          onChange={(next) => updateDisplayOpts(sessionId, { showPerQuestionScore: next })}
        />
      </ToggleGroup>
    </div>
  );
}
