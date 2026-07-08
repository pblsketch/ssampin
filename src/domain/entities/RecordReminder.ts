/**
 * 학생 관찰 기록 알림 (Observation Record Reminder) — 도메인 타입.
 *
 * '오래 기록이 비어있는 학생'을 감지해 교사에게 리마인더를 띄우는 기능의 계약을 정의한다.
 * 감지·선정·로테이션·스케줄 계산은 순수함수(`domain/rules/recordReminderRules.ts`)가 담당하며,
 * 이 파일은 그 입출력 타입만 정의한다.
 *
 * 레이어 규칙: domain 은 외부 의존 import 금지. (계획서: docs/01-plan/features/observation-record-reminder.plan.md)
 */

/** 알림 강도 프리셋. `custom` 은 직접설정. */
export type ReminderPreset = 'light' | 'normal' | 'thorough' | 'custom';

/** 알림 대상 반 유형 (담임반 / 수업반). */
export type ReminderTarget = 'homeroom' | 'subject';

/**
 * 알림 본문에 학생 이름을 얼마나 드러낼지.
 * - `full`:    실명 그대로 (기본값 — 사용자 결정, 사용성 우선)
 * - `initial`: 성 + '○○' (예: '김서연' → '김○○')
 * - `none`:    완전 무명 ('기록할 학생이 있어요')
 */
export type NameExposure = 'full' | 'initial' | 'none';

/**
 * 사용자 리마인더 설정. `Settings` 엔티티에 옵셔널(`recordReminder?`)로 편승해
 * `settings` 동기화 도메인을 통해 기기 간 공유된다. (런타임 상태는 별도 로컬 스토어)
 */
export interface ReminderSettings {
  /** 기능 전체 on/off (기본 false — 선생님이 켜야 동작). */
  readonly enabled: boolean;
  readonly preset: ReminderPreset;
  /** 알림 요일 (0=일 ~ 6=토). 빈 배열이면 '매일'. */
  readonly weekdays: readonly number[];
  /** 발화 시각 'HH:mm'. */
  readonly time: string;
  /** 이 일수 이상 기록이 없으면 '공백'으로 간주. */
  readonly staleDays: number;
  /** 한 번에 물어볼 학생 수 (1~3). */
  readonly perNudge: number;
  /** 하루 최대 발화 횟수 (피로 상한). */
  readonly dailyFireCap: number;
  /** 미리 예약할 기간(일) — 렌더러 사망 중에도 발화가 유지되도록 미래 예약. */
  readonly horizonDays: number;
  /** 방해금지 시작 'HH:mm' (자정 넘김 허용). null 이면 미설정. */
  readonly doNotDisturbStart: string | null;
  readonly doNotDisturbEnd: string | null;
  /** 실명 노출 정책 (기본 'full'). */
  readonly nameExposure: NameExposure;
  /** 은은형(앱 내부 배지·팝오버) 사용. */
  readonly subtleEnabled: boolean;
  /** 능동형(OS 토스트) 사용. */
  readonly osToastEnabled: boolean;
  /** 알림 대상 (담임반/수업반). */
  readonly targets: readonly ReminderTarget[];
  /** 알림에서 제외할 학생 id. */
  readonly excludedStudentIds: readonly string[];
  /** 더 자주 챙길 관심 학생 id (공백 임계를 절반으로 낮춰 우선 노출). */
  readonly focusedStudentIds: readonly string[];
}

/** 리마인더 대상이 되는 학생의 최소 형태. */
export interface ReminderStudent {
  readonly id: string;
  readonly name: string;
}

/**
 * 학생 id → 마지막 기록일('YYYY-MM-DD') 조회 함수. null 이면 기록 전무.
 * 담임(`useStudentRecordsStore`)·수업반(`useObservationStore`) 저장처가 다르므로,
 * 순수 규칙은 이 provider 를 주입받아 저장처를 알지 못한 채 동작한다.
 */
export type LastRecordDateProvider = (studentId: string) => string | null;

/** 공백 순위 산정 결과. */
export interface RankedStudent {
  readonly student: ReminderStudent;
  /** 마지막 기록일 'YYYY-MM-DD' 또는 null(기록 전무). */
  readonly lastRecordDate: string | null;
  /** 마지막 기록 후 경과 일수. 기록 전무면 `Number.POSITIVE_INFINITY`. */
  readonly daysSinceLastRecord: number;
}

/**
 * Electron main 으로 넘길 발화 예약 1건.
 * 학생 식별 정보는 `reminderId` 뒤에 숨기고(레이어·프라이버시), main 은 이를 해석하지 않는다.
 * `body` 는 렌더러가 `nameExposure` 정책을 이미 적용한 최종 문자열.
 */
export interface ReminderScheduleItem {
  readonly reminderId: string;
  /** 발화 예정 시각 (Unix ms). */
  readonly fireAt: number;
  readonly title: string;
  readonly body: string;
  readonly target: ReminderTarget;
  /** 피로 dedup 키 `${studentId}:${YYYY-MM-DD}`. */
  readonly studentDedupKey: string;
}

/**
 * 리마인더 기본 설정. 기본값은 **전체 OFF** + 보수적 프리셋(가볍게 주1).
 * `Settings` 엔티티에 옵셔널 필드로 들어가므로 기존 사용자 마이그레이션은 불필요.
 */
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  preset: 'light',
  weekdays: [2, 4], // 화·목
  time: '16:00',
  staleDays: 14,
  perNudge: 1,
  dailyFireCap: 2,
  horizonDays: 7,
  doNotDisturbStart: null,
  doNotDisturbEnd: null,
  nameExposure: 'full', // 사용자 결정: 실명 노출 기본 ON
  subtleEnabled: true,
  osToastEnabled: false,
  targets: ['homeroom'],
  excludedStudentIds: [],
  focusedStudentIds: [],
};
