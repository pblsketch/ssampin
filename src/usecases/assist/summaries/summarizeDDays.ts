/**
 * 디데이를 모델에 보낼 요약으로 바꾼다(순수 함수).
 *
 * ★남은 날짜(daysLeft)를 **여기서 계산해** 사실로 보낸다. 할 일의 overdue 와
 * 같은 이유다 — 모델은 오늘이 며칠인지 모르고, 날짜 셈을 모델 추측에 맡기면
 * 지난 기한을 "남았다"고 답한 실사고(2026-08-23)가 재발한다.
 *
 * 제목은 선생님 자유 입력이라 학생 이름이 들어갈 수 있다 — freeTextFields 대상.
 */

/** summarizeDDays 가 필요로 하는 최소 필드 (DDayItem 과 호환) */
export interface DDayLike {
  readonly title: string;
  /** YYYY-MM-DD */
  readonly targetDate: string;
  readonly pinned: boolean;
}

export interface SummarizeDDaysOptions {
  /** 오늘(YYYY-MM-DD). daysLeft 의 기준이다 */
  readonly today: string;
}

export interface DDaysSummary {
  readonly items: readonly {
    readonly title: string;
    readonly date: string;
    /** 양수 = 앞으로 N일, 0 = 오늘, 음수 = 지난 지 N일 */
    readonly daysLeft: number;
    readonly pinned: boolean;
  }[];
}

/**
 * YYYY-MM-DD 두 날짜의 일수 차. UTC 로 셈해 서머타임·시간대 함정을 피한다
 * (한국은 서머타임이 없지만, 로컬 Date 셈은 환경에 따라 하루 어긋난 전례가 있는 패턴이다).
 */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const a = Date.UTC(fy ?? 0, (fm ?? 1) - 1, fd ?? 1);
  const b = Date.UTC(ty ?? 0, (tm ?? 1) - 1, td ?? 1);
  return Math.round((b - a) / 86_400_000);
}

export function summarizeDDays(
  items: readonly DDayLike[],
  opts: SummarizeDDaysOptions,
): DDaysSummary {
  return {
    items: items
      .map((d) => ({
        title: d.title,
        date: d.targetDate,
        daysLeft: daysBetween(opts.today, d.targetDate),
        pinned: d.pinned,
      }))
      // 가까운 순 — 지난 것은 뒤로
      .sort((a, b) => {
        const aPast = a.daysLeft < 0 ? 1 : 0;
        const bPast = b.daysLeft < 0 ? 1 : 0;
        if (aPast !== bPast) return aPast - bPast;
        return Math.abs(a.daysLeft) - Math.abs(b.daysLeft);
      }),
  };
}
