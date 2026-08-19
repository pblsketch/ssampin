/**
 * 그날 그 반에 수업이 있었는지 판정하는 규칙.
 *
 * ## 자동으로 빼는 것은 최소한만
 *
 * 자동 제외를 넓게 잡으면 숫자가 과소 추정되고, 좁게 잡으면 과대 추정된다.
 * **과대 추정이 낫다** — "예상보다 수업이 적었다"는 선생님이 학기 중에 알아채지만, **앱이
 * 조용히 빼 버린 날은 알아챌 방법이 없다.** 그래서 확실한 것만 뺀다.
 *
 * | 사유 | 자동 제외 | 왜 |
 * | --- | --- | --- |
 * | 시간표에 수업 없음 | ✅ | 시간표가 정본. 오판 여지 없음 |
 * | 공휴일 | ✅ | 법정 공휴일. 학교마다 갈리지 않음 |
 * | 방학 (단 `…식` 제외) | ✅ | 방학 중 수업은 예외적 |
 * | 시험기간 | ❌ 표시만 | 근거 정규식 `/시험\|평가\|고사/`가 **'수행평가 주간'·'진단평가'** 처럼 정상 수업일에 붙는 이름까지 잡는다 |
 * | 행사(체육대회·수학여행) | ❌ 표시만 | 나이스 수업공제일 구분이 '공휴일'이 아니라 그냥 행사로 들어온다. 이름으로 판단하면 오판한다 |
 *
 * ## `…식`으로 끝나는 방학 항목을 빼지 않는 이유
 *
 * `classifyNeisEvent`의 `/방학/`이 **'여름방학식'·'겨울방학식'까지** `vacation`으로 잡는다.
 * 그런데 학기 종료일 후보를 찾는 `termEndFromSchedule`은 **바로 그 행사를 쓴다.**
 * 그대로 두면 학기 마지막 등교일이 자동 제외되면서 동시에 학기 종료일이 되는 자기 모순이 생긴다.
 * 방학식·종업식은 **등교일**이므로 자동 제외에서 뺀다.
 *
 * Clean Architecture: 외부 의존 0 — 다른 모듈을 import하지 않는다. 학사일정 분류
 * (`classifyNeisEvent`)는 호출자가 미리 붙여서 넣는다.
 */

/** 자동 제외 사유. */
export type LessonDayExclusionReason =
  /** 사용자가 "이 날은 수업 없었어요"라고 직접 표시했다. 무엇보다 세다. */
  | 'userMarkedNoLesson'
  /** 법정 공휴일. */
  | 'holiday'
  /** 방학. */
  | 'vacation'
  /** 시간표에 이 반 수업이 없다(주말·공강 포함). */
  | 'noScheduledLesson';

/** 자동 제외는 하지 않지만 사용자가 확인해 볼 값이 있는 표시. */
export type LessonDayNoticeKind = 'exam' | 'event';

/** 학사일정 한 건 — 호출자가 분류 결과를 붙여서 넣는다. */
export interface LessonDayEvent {
  readonly title: string;
  /** `classifyNeisEvent` 결과. */
  readonly group: 'holiday' | 'exam' | 'vacation' | 'event' | 'etc';
}

export interface LessonDayExclusionInput {
  /** 'YYYY-MM-DD' */
  readonly date: string;
  /** 그 반·그 날짜에 대한 사용자 정정. 없으면 undefined. */
  readonly adjustment?: 'hasLesson' | 'noLesson';
  /** 그날의 공휴일 이름(`getHolidayName` 결과). 공휴일이 아니면 null/undefined. */
  readonly holidayName?: string | null;
  /** 그날의 학사일정. */
  readonly events?: readonly LessonDayEvent[];
  /** 시간표(변동 반영)가 그날 그 반에 주는 교시 수. */
  readonly scheduledPeriodCount: number;
}

export interface LessonDayExclusion {
  readonly reason: LessonDayExclusionReason;
  /** 사용자에게 보일 짧은 사유. */
  readonly label: string;
  /** 근거가 된 행사명·공휴일명. 시간표 사유면 없다. */
  readonly sourceLabel?: string;
  /**
   * 사용자가 "이 날은 수업했어요"로 되살릴 수 있는가.
   * 시간표가 0교시인 날은 되살릴 교시 자체가 없어 false다 — 화면은 버튼을 막아야 한다.
   * 눌러도 아무 일이 없으면 사용자는 버튼이 고장 났다고 읽는다.
   */
  readonly userOverridable: boolean;
}

export interface LessonDayNotice {
  readonly kind: LessonDayNoticeKind;
  readonly label: string;
  readonly sourceLabel: string;
}

const RESTORE_LABEL_BY_REASON: Readonly<Record<LessonDayExclusionReason, string>> = {
  userMarkedNoLesson: '수업 없음(직접 표시)',
  holiday: '공휴일',
  vacation: '방학',
  noScheduledLesson: '시간표에 수업 없음',
};

/**
 * 방학식·종업식 같은 **등교일** 항목인가. 이런 날은 자동 제외하지 않는다.
 *
 * ⚠️ `endsWith('식')`으로 판정하면 `'여름방학식(1~2학년)'`·`'여름방학식 및 방과후 안내'`처럼
 * 뒤에 뭐가 붙는 순간 뚫린다. 그러면 그 날이 방학으로 자동 제외되면서 동시에
 * `termEndFromSchedule`이 학기 종료일 후보로 올려, 이 파일 머리말이 피하려던 자기 모순이
 * 그대로 되살아난다. 그래서 위치가 아니라 **포함**으로 본다.
 */
function isCeremonyEvent(title: string): boolean {
  const n = title.replace(/\s+/g, '');
  return n.includes('방학식') || n.includes('종업식');
}

/**
 * 그날의 제외 사유. 수업일이면 `null`.
 *
 * 판정 우선순위: **사용자 정정 > 공휴일 > 방학 > 시간표.**
 * 시험·행사는 이 순위에 없다 — 자동 제외 대상이 아니기 때문이다(`collectLessonDayNotices` 참조).
 *
 * 예외를 던지지 않는다.
 */
export function classifyLessonDayExclusion(
  input: LessonDayExclusionInput,
): LessonDayExclusion | null {
  const scheduled = Number.isFinite(input.scheduledPeriodCount)
    ? Math.max(0, Math.trunc(input.scheduledPeriodCount))
    : 0;

  // 사용자 정정이 모든 자동 판정을 이긴다 — 단 되살릴 교시가 있어야 한다.
  if (input.adjustment === 'hasLesson') {
    if (scheduled > 0) return null;
    // 되살릴 교시가 없다. 이때 '공휴일'을 사유로 돌려주면 버튼이 왜 막혔는지 설명이 안 된다
    // ("공휴일이라 못 되살린다"는 거짓이다 — 공휴일이어도 교시가 있으면 되살아난다).
    // 사용자가 손댈 수 있는 진짜 이유는 시간표 쪽이므로 그것을 돌려준다.
    return {
      reason: 'noScheduledLesson',
      label: RESTORE_LABEL_BY_REASON.noScheduledLesson,
      userOverridable: false,
    };
  }

  if (input.adjustment === 'noLesson') {
    return {
      reason: 'userMarkedNoLesson',
      label: RESTORE_LABEL_BY_REASON.userMarkedNoLesson,
      userOverridable: scheduled > 0,
    };
  }

  const events = input.events ?? [];

  if (typeof input.holidayName === 'string' && input.holidayName !== '') {
    return {
      reason: 'holiday',
      label: RESTORE_LABEL_BY_REASON.holiday,
      sourceLabel: input.holidayName,
      userOverridable: scheduled > 0,
    };
  }

  const holidayEvent = events.find((e) => e.group === 'holiday');
  if (holidayEvent !== undefined) {
    return {
      reason: 'holiday',
      label: RESTORE_LABEL_BY_REASON.holiday,
      sourceLabel: holidayEvent.title,
      userOverridable: scheduled > 0,
    };
  }

  // 방학 — 단 방학식·종업식은 등교일이라 제외하지 않는다(위 주석 참조).
  const vacationEvent = events.find((e) => e.group === 'vacation' && !isCeremonyEvent(e.title));
  if (vacationEvent !== undefined) {
    return {
      reason: 'vacation',
      label: RESTORE_LABEL_BY_REASON.vacation,
      sourceLabel: vacationEvent.title,
      userOverridable: scheduled > 0,
    };
  }

  if (scheduled === 0) {
    return {
      reason: 'noScheduledLesson',
      label: RESTORE_LABEL_BY_REASON.noScheduledLesson,
      // 되살릴 교시가 없다. 시간표에서 먼저 등록해야 한다.
      userOverridable: false,
    };
  }

  return null;
}

/**
 * 자동 제외는 하지 않되 사용자가 확인해 볼 값이 있는 표시들.
 *
 * 시험기간과 행사가 여기 들어온다. **뺄지 말지는 사용자가 정한다** — 시험기간에도 수업하는
 * 학교가 있고, 체육대회가 하루 종일인지 오전만인지 앱은 모른다.
 */
export function collectLessonDayNotices(
  events: readonly LessonDayEvent[] | undefined,
): readonly LessonDayNotice[] {
  if (events === undefined) return [];
  const notices: LessonDayNotice[] = [];
  for (const e of events) {
    if (e.group === 'exam') {
      notices.push({ kind: 'exam', label: '시험 기간 — 확인해 주세요', sourceLabel: e.title });
    } else if (e.group === 'event') {
      notices.push({ kind: 'event', label: '학교 행사 — 확인해 주세요', sourceLabel: e.title });
    }
  }
  return notices;
}
