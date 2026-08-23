/**
 * 자리 배치를 **숫자**로만 요약한다(순수 함수).
 *
 * ★좌석표 자체는 내보내지 않는다. 좌석표는 "몇 번 자리에 누가 앉는다"라서 통째로 개별 학생
 * 데이터다 — 어느 Phase 에서도 모델에 보내지 않는다(계획서 §2 영구 제외). 대신 배치 인원·빈
 * 자리 수만 보내고, 실제 표를 보고 싶으면 **앱 화면으로 안내**한다.
 *
 * 학생 id 는 "있다/없다"만 본다. 이 함수는 어떤 학생인지 알 필요가 없고, 알아서도 안 된다.
 */

/** summarizeSeating 이 필요로 하는 최소 필드 (SeatingData 와 호환) */
export interface SeatingLike {
  readonly rows: number;
  readonly cols: number;
  /** seats[row][col] = studentId | null */
  readonly seats: readonly (readonly (string | null)[])[];
  /** 'grid' | 'group' | 'freestyle' */
  readonly layout?: string;
  readonly groups?: readonly { readonly studentIds: readonly string[] }[];
  readonly freestyleDesks?: readonly { readonly studentId: string | null }[];
  readonly pairMode?: boolean;
}

export interface SummarizeSeatingOptions {
  /** 결과에 표시할 학급명 */
  readonly className: string;
}

export interface SeatingSummary {
  readonly className: string;
  /** '격자' | '모둠' | '자유 배치' */
  readonly layout: string;
  /** 격자일 때의 줄·칸. 다른 배치에서는 0 */
  readonly rows: number;
  readonly cols: number;
  /** 자리(또는 책상) 수 */
  readonly seatCount: number;
  /** 학생이 앉은 자리 수 */
  readonly assigned: number;
  /** 빈 자리 수 */
  readonly empty: number;
  /** 모둠 수. 모둠 배치가 아니면 0 */
  readonly groupCount: number;
  /** 짝꿍 모드인가(격자에서만 뜻이 있다) */
  readonly pairMode: boolean;
}

const LAYOUT_LABEL: Readonly<Record<string, string>> = {
  grid: '격자',
  group: '모둠',
  freestyle: '자유 배치',
};

export function summarizeSeating(
  seating: SeatingLike,
  opts: SummarizeSeatingOptions,
): SeatingSummary {
  const layout = seating.layout ?? 'grid';

  let seatCount: number;
  let assigned: number;

  if (layout === 'freestyle') {
    const desks = seating.freestyleDesks ?? [];
    seatCount = desks.length;
    assigned = desks.filter((d) => d.studentId !== null).length;
  } else if (layout === 'group') {
    const groups = seating.groups ?? [];
    // 모둠은 "자리"라는 개념이 없다 — 모둠에 든 학생 수가 곧 배치 인원이고, 빈 자리는 0 이다.
    assigned = groups.reduce((n, g) => n + g.studentIds.length, 0);
    seatCount = assigned;
  } else {
    const flat = seating.seats.flat();
    seatCount = flat.length;
    assigned = flat.filter((id) => id !== null && id !== '').length;
  }

  return {
    className: opts.className,
    layout: LAYOUT_LABEL[layout] ?? layout,
    rows: layout === 'grid' ? seating.rows : 0,
    cols: layout === 'grid' ? seating.cols : 0,
    seatCount,
    assigned,
    empty: Math.max(0, seatCount - assigned),
    groupCount: layout === 'group' ? (seating.groups ?? []).length : 0,
    pairMode: layout === 'grid' && seating.pairMode === true,
  };
}
