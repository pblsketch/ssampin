/**
 * 나이스 시간표 조회 — 학기 축 자동 결정 + 반대 학기 1회 재시도.
 *
 * 나이스 시간표 API는 학년도(AY)·학기(SEM)와 날짜 구간을 **함께** 받는데, 셋이 어긋나면 오류가
 * 아니라 **빈 결과**가 온다. 그래서 학기를 한 칸 잘못 잡으면 "학교가 등록 안 했다"와 구분되지
 * 않는 조용한 실패가 된다.
 *
 * 경계가 흔들리는 지점은 8월이다. 학사 달력은 8월을 1학기로 보지만(academicCalendar), 8월
 * 중순에 2학기를 개학하는 학교의 나이스에는 그 주 수업이 2학기로 등록돼 있다. 어느 쪽인지는
 * 학교만 알고 앱은 알 수 없으므로(ADR-037 — 개학일로 구간을 단정하지 않는다), 날짜에서 파생한
 * 축으로 먼저 조회하고 **비면 반대 학기로 한 번 더** 조회한다.
 *
 * 재시도는 축을 바꿔 1회뿐이다(무한 탐색 금지). 두 축 모두 비면 그건 정말로 "학교가 아직
 * 등록하지 않았다"이며, 호출자는 그 사실을 그대로 안내해야 한다.
 */
import type { INeisPort } from '@domain/ports/INeisPort';
import type { NeisTimetableRow, SchoolLevel, NeisTermAxis } from '@domain/entities/NeisTimetable';
import { neisTermAxisForDate, otherNeisTermAxis } from '@domain/entities/NeisTimetable';

/** 학기 축(AY·SEM)을 뺀 조회 파라미터 — 축은 이 UseCase가 정한다. */
export interface NeisTimetableQuery {
  readonly apiKey: string;
  readonly officeCode: string;
  readonly schoolCode: string;
  readonly schoolLevel: SchoolLevel;
  readonly grade: string;
  readonly className: string;
  readonly fromDate: string; // YYYYMMDD
  readonly toDate: string; // YYYYMMDD
}

export interface NeisTimetableFetchResult {
  readonly rows: readonly NeisTimetableRow[];
  /** 실제로 결과를 얻은(또는 마지막으로 시도한) 축 — 이후 조회에 재사용한다. */
  readonly axis: NeisTermAxis;
  /** 첫 축이 비어 반대 학기로 재시도해 얻은 결과인지 (안내 문구 분기용) */
  readonly usedFallbackSemester: boolean;
}

/**
 * 날짜에서 학기 축을 정해 조회하고, 비면 반대 학기로 1회 재시도한다.
 *
 * @param preferredAxis 이미 확정된 축(같은 마법사 안에서 여러 학급을 조회할 때 재사용).
 *   주면 그 축으로 먼저 조회한다 — 학급마다 재시도를 반복하지 않기 위함.
 */
export async function fetchNeisTimetableWithSemesterFallback(
  neisPort: INeisPort,
  query: NeisTimetableQuery,
  preferredAxis?: NeisTermAxis,
): Promise<NeisTimetableFetchResult> {
  const primary = preferredAxis ?? neisTermAxisForDate(query.fromDate);
  // 날짜 형식이 깨졌으면 축을 지어내지 않는다 — 조회 자체가 성립하지 않는다.
  if (primary === null) {
    throw new Error('조회 기간의 날짜 형식이 올바르지 않습니다.');
  }

  const first = await neisPort.getTimetable({ ...query, ...primary });
  if (first.length > 0) {
    return { rows: first, axis: primary, usedFallbackSemester: false };
  }

  const fallback = otherNeisTermAxis(primary);
  const second = await neisPort.getTimetable({ ...query, ...fallback });
  if (second.length > 0) {
    return { rows: second, axis: fallback, usedFallbackSemester: true };
  }

  // 둘 다 비었다 — 축 문제가 아니라 등록 자체가 없는 것. 처음 축을 그대로 돌려준다.
  return { rows: [], axis: primary, usedFallbackSemester: false };
}
