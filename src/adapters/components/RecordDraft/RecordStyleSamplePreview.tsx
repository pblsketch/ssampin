/**
 * 작성 방식 예시 초안 미리보기(ADR-099 보강 5) — [바꾸기] 목록에서 펼친 카드 아래에 붙는다.
 *
 * ★문단 색은 실제 초안 미리보기와 **같은 `ROLE_BG`** 다. 예시·배지·본문이 서로 다른 색 언어를 쓰면
 *   "형광펜은 이런 뜻"이라는 학습이 이어지지 않는다(디자인 검토 2026-09-09).
 * ★자르지 않는다. 앞 두 문단만 보이면 그 방식이 가장 잘 드러나는 마무리(결과)가 잘린다. 대신 높이를
 *   제한하고 안에서 스크롤한다.
 * ★가상의 학생임을 첫 줄에 적는다. 실존 기록으로 오해되면 안 된다.
 */
import type { RecordFocusId } from '@domain/entities/RecordWritingStyle';
import { RECORD_STYLE_SAMPLES } from '@domain/rules/recordStyleSamples';
import { NARRATIVE_ROLE_LABELS } from '@domain/rules/narrativeParagraphs';
import { ROLE_BG } from '@adapters/components/RecordDraft/narrativeRoleStyles';

export function RecordStyleSamplePreview({
  focusId,
}: {
  readonly focusId: RecordFocusId;
}): React.JSX.Element {
  const sample = RECORD_STYLE_SAMPLES[focusId];
  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg bg-sp-bg p-2"
      data-testid="style-sample-preview"
      data-focus={focusId}
    >
      <p className="text-xs text-sp-muted">가상의 학생을 예로 든 글이에요 · {sample.setting}</p>
      <div className="flex max-h-[280px] flex-col gap-1.5 overflow-y-auto pr-1">
        {sample.paragraphs.map((p, i) => (
          <p
            key={i}
            className={`rounded-lg px-2 py-1.5 text-xs leading-relaxed text-sp-text ${ROLE_BG[p.role]}`}
          >
            <span className="sr-only">{NARRATIVE_ROLE_LABELS[p.role]}: </span>
            {p.text}
          </p>
        ))}
      </div>
    </div>
  );
}
