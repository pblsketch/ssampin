import type { OwnAiProviderId } from '../entities/OwnAiProvider';

export type RecordDraftDetail = 'grounded';

export function recordDraftDetailForModel(
  provider: OwnAiProviderId | null,
  model: string | undefined,
): RecordDraftDetail | undefined {
  return provider === 'codex' && (model === 'gpt-5.6-terra' || model === 'gpt-5.6-luna')
    ? 'grounded'
    : undefined;
}

export const GROUNDED_RECORD_DETAIL_INSTRUCTION =
  '구체적으로 쓰기: 근거가 충분한 주요 장면에서는 학생이 다룬 대상, 판단 기준, 확인한 자료나 조건, ' +
  '기존 생각이나 근거를 어떻게 수정했는지와 그 결과를 연결해 씁니다. ' +
  '자료에 있는 명칭, 수치, 기간, 처리 조건을 일반적인 말로 뭉뚱그리지 마세요. ' +
  '사실을 판정했다면 무엇을 판정했는지 명제의 부정어와 조건을 보존하고, 판정이 달라질 조건도 근거에 있을 때 씁니다. ' +
  '자료를 읽은 일을 학생이 직접 실험하거나 수행한 일로 바꾸지 마세요. ' +
  '일반적인 칭찬, 같은 사실의 반복, 근거에 없는 활동으로 분량을 늘리지 마세요. ' +
  '지정된 장면 차례와 분량 한도 안에서 핵심 과정의 구체성을 살리되, 문장 수나 장면 수를 임의로 고정하지 않습니다. ' +
  '영어 메모나 작성 과정 설명 없이 초안 본문만 출력하세요.';
