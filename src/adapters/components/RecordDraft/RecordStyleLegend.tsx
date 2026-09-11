/**
 * 상단 영역 정보 바의 **작성 구성** 배지(ADR-099 보강 → ADR-103 에서 서사 기준으로 바뀜).
 *
 * 배경: 작성 방식이 7종이 되었는데 이 자리의 범례는 `교사 평가 · 동기·질문 · 과정 · 결과` 로 **고정**이었다.
 * 무엇을 골랐는지, 그 방식이 어떤 순서로 쓰는 글인지 화면 어디에서도 한눈에 알 수 없었다.
 *
 * 그래서 이 배지는 "색 안내"가 아니라 **"지금 고른 작성 방식 요약"** 이다:
 *   1. 무엇의 차례인지 늘 보여준다(주제 이름 또는 「전체 근거」). 형광펜 스위치와 무관하다.
 *   2. 구성 요소를 **번호를 붙여 순서대로** 보여준다. 「적용될 설정」의 세로 번호 목록과 같은 값·같은 어휘다.
 *   3. 색점은 형광펜을 켰을 때만 붙는다. 껐을 때는 본문에 칠해진 색이 없어 색 안내가 뜻을 잃는다.
 *
 * ★형광펜 색은 넷 그대로다(동기 sky · 과정 violet · 결과 emerald · 평가 amber). 방식마다 색을 늘리면
 *   옛 초안의 `roleMarks` 와 파서가 깨진다. 바뀌는 것은 **이름과 순서**뿐이다.
 * ★같은 색이 잇달아 나오는 방식이 있다(행동특성은 과정 셋). 색을 늘리지 않고 **번호와 이름**으로 가른다.
 *   색을 요소마다 따로 주면 본문에 칠해지는 색과 달라진다 — 모델이 붙이는 표식은 넷뿐이기 때문이다.
 * ★한 줄 높이를 지킨다: 좁아지면 요소를 줄바꿈하지 않고 접는다(막대가 두 줄이 되면 아래 본문이 출렁인다).
 * ★색만으로 뜻을 전하지 않는다 — 순번·이름·역할 이름을 `sr-only` 문장으로 함께 읽어 준다.
 */
import type { RecordModule } from '@domain/rules/recordStyleCatalog';
import { NARRATIVE_ROLE_LABELS } from '@domain/rules/narrativeParagraphs';
import { ROLE_DOT } from '@adapters/components/RecordDraft/narrativeRoleStyles';

export interface RecordStyleLegendProps {
  /**
   * 무엇의 차례인가 — 서사로 쓰면 **주제 이름**, 아니면 「전체 근거」(ADR-103).
   * ★예전에는 작성 방식 이름이었다. 그 고르개가 사라졌으므로 이 자리는 "지금 실제로 나갈 차례"를 말한다.
   */
  readonly title: string;
  /** 그 차례의 구성 요소. 부르는 쪽이 요청서와 **같은 `resolved`** 에서 뽑아 준다(둘이 갈리면 거짓말이 된다). */
  readonly modules: readonly RecordModule[];
  /** 형광펜 스위치. 켰을 때만 색점을 붙인다. */
  readonly highlightOn: boolean;
  /** 누르면 근거 정리(근거 지도)로 보낸다. 없으면 표시만 한다. */
  readonly onOpen?: () => void;
}

export function RecordStyleLegend({
  title,
  modules,
  highlightOn,
  onOpen,
}: RecordStyleLegendProps): React.JSX.Element {
  // 요소 이름이 곧 역할 이름인 자리(동기·질문)에서는 같은 말을 두 번 읽지 않는다.
  const spoken = `작성 구성: ${title}. 구성 순서 ${modules
    .map((m, i) => {
      const role = NARRATIVE_ROLE_LABELS[m.role];
      return `${i + 1}번째 ${m.label}${m.label === role ? '' : `(${role})`}`;
    })
    .join(', ')}.${onOpen === undefined ? '' : ' 눌러서 근거 정리로 갑니다.'}`;

  const visual = (
    <span aria-hidden="true" className="inline-flex min-w-0 items-center gap-1.5">
      <span className="material-symbols-outlined shrink-0 text-sm text-sp-muted">tune</span>
      <span className="max-w-[9rem] shrink-0 truncate font-semibold text-sp-text sm:max-w-[16rem]">
        {title}
      </span>
      {/* 구성 요소는 넉넉할 때만. 좁으면 단계 수로 줄인다. */}
      <span className="hidden items-center gap-2 text-sp-muted lg:inline-flex">
        {modules.map((m, i) => (
          <span key={m.id} className="inline-flex items-center gap-1 whitespace-nowrap">
            {/* 번호가 순서이자 낱낱의 이름표다: 같은 역할이 잇달아도 몇 번째 항목인지 갈린다. */}
            <span className="font-semibold text-sp-text">{i + 1}</span>
            {highlightOn && (
              <span
                data-testid="legend-role-dot"
                className={`h-2 w-2 rounded-full ${ROLE_DOT[m.role]}`}
              />
            )}
            {m.label}
          </span>
        ))}
      </span>
      <span className="text-sp-muted lg:hidden">· {modules.length}단계</span>
    </span>
  );

  if (onOpen === undefined) {
    return (
      <span data-testid="record-style-legend" className="inline-flex min-w-0 items-center">
        {visual}
        <span className="sr-only">{spoken}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      data-testid="record-style-legend"
      onClick={onOpen}
      title={`작성 구성: ${title} · 눌러서 근거 정리로 가기`}
      className="-my-0.5 inline-flex min-w-0 items-center rounded-full px-2 py-0.5 transition-colors hover:bg-sp-card"
    >
      {visual}
      <span className="sr-only">{spoken}</span>
    </button>
  );
}
