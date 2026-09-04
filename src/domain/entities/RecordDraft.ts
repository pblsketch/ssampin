/**
 * RecordDraft 엔티티 — AI 브릿지가 작성한 NEIS 영역별 생활기록부 초안(write-back 수신처).
 *
 * 브릿지(ssampin-ai-bridge core)의 RecordDraft 계약을 본체에서 미러한다(본체는 브릿지를 import 하지 않음).
 * 영역별 바이트 한도·작성주체 결속·neisByteLength 는 브릿지와 값이 일치해야 한다(UI 카운터가 같은 한도를 본다).
 *
 * 저장: record-drafts.json = { records: RecordDraft[] }. 키 = (area + studentRef + subject?).
 * 모든 레코드는 requiresTeacherReview=true — 자동 확정 경로는 없으며 교사 최종 검토가 강제된다.
 */

/** 학교급. */
export type SchoolLevel = 'elementary' | 'middle' | 'high';

/**
 * 생활기록부 영역. 유효 영역 집합은 학교급 × 작성주체(담임/교과)로 갈린다(AREAS_BY_LEVEL 단일 진실원천).
 */
export type RecordArea =
  | 'autonomy' // 자율·자치활동(담임)
  | 'career' // 진로활동(담임) — 유일하게 한도가 큼
  | 'behavior' // 행동특성 및 종합의견(담임)
  | 'subject' // 과목별 세부능력 및 특기사항(중·고 교과)
  | 'individualSubject' // 개인별 세부능력 및 특기사항(중·고 교과)
  | 'club' // 동아리활동(중·고=지도교사 / 초등=담임)
  | 'subjectDev'; // 교과학습발달상황(초등 — 세특 대응)

export const RECORD_AREAS: readonly RecordArea[] = [
  'autonomy',
  'career',
  'behavior',
  'subject',
  'individualSubject',
  'club',
  'subjectDev',
];

const RECORD_AREA_SET: ReadonlySet<string> = new Set(RECORD_AREAS);

export function isRecordArea(v: unknown): v is RecordArea {
  return typeof v === 'string' && RECORD_AREA_SET.has(v);
}

/** UI 탭·표 제목용 영역 한국어 라벨. */
export const RECORD_AREA_LABELS: Readonly<Record<RecordArea, string>> = {
  autonomy: '자율·자치활동',
  career: '진로활동',
  behavior: '행동특성 및 종합의견',
  subject: '과목별 세부능력 및 특기사항',
  individualSubject: '개인별 세부능력 및 특기사항',
  club: '동아리활동',
  subjectDev: '교과학습발달상황',
};

/** 초안 상태 — draft(작성) → reviewing(검토중) → confirmed(확정). confirmed 는 잠금(브릿지 재write 거부). */
export type RecordDraftStatus = 'draft' | 'reviewing' | 'confirmed';

export interface RecordDraft {
  readonly id: string;
  readonly area: RecordArea;
  /** 학생 신원 키(담임=Student.id / 수업반='tc:{classId}:{studentKey}'). 브릿지 identity 와 동일. */
  readonly studentRef: string;
  /** 수업반/세특이면 TeachingClass.id. */
  readonly classId?: string;
  /** 수업반 학생 번호 키(반 내 번호). teaching 일 때. */
  readonly studentKey?: string;
  /** 담임 학생 id. homeroom 일 때. */
  readonly studentId?: string;
  /** 과목명(subject/subjectDev). 같은 학생의 과목별 복수 초안을 분리. */
  readonly subject?: string;
  readonly content: string;
  /** NEIS 바이트 길이(한글 3B/그 외 1B). */
  readonly byteLength: number;
  readonly basisObservationIds: readonly string[];
  /** checkGrounding/leakScan 경고 flag(승인 신호 아님). */
  readonly groundingFlags?: readonly string[];
  /** 항상 true — 자동 확정 경로 없음. */
  readonly requiresTeacherReview: true;
  readonly status: RecordDraftStatus;
  /**
   * 학기 epoch 스탬프('2026-1'). 초안에는 `date` 가 없어 **저장 시각의 학기**를 부착한다
   * (관찰·누가기록의 `withDerivedTerm` 과 같은 형식). 구 데이터에는 없다 — 추측 부착 금지.
   *
   * ★지금은 표식일 뿐이다. upsert 키(area+studentRef+subject)에는 아직 들어가지 않아 학년이 바뀌면
   *   같은 키의 초안을 덮어쓰는 문제는 그대로다. 키에 넣는 일은 학년도 전환 작업과 함께 본다
   *   (브릿지 write 계약도 같이 바뀌어야 한다). 표식이 먼저 있어야 그때 데이터를 가를 수 있다.
   */
  readonly term?: string;
  /**
   * 이 초안이 딛고 선 **탐구 흐름(주제)** — `InquiryThread.id`.
   *
   * 선택 필드다. 주제를 안 쓰는 선생님도 그대로 쓰고, 부재는 "주제 없음"이지 빈 값이 아니다
   * (병합에서 덮지 말 것). 이 칸이 생기면서 "이 주제로 쓴 초안" 조회가 가능해진다.
   *
   * ★AI 의 주제별 초안 자체는 이 칸 **없이도** 이미 동작한다
   *   (`get_inquiry_threads` → `get_record_evidence(threadToken)`). 이 칸은 그 결과를
   *   앱에서 되짚기 위한 것이다.
   */
  readonly threadId?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface RecordDraftsData {
  readonly records: readonly RecordDraft[];
}

/**
 * NEIS 바이트 길이 — 한글(및 비ASCII 다바이트 문자) 3B, 그 외(영문·숫자·공백·개행) 1B.
 * 코드포인트 단위 순회(서로게이트 페어=1 코드포인트=3B). 브릿지 core 의 neisByteLength 와 동일.
 */
export function neisByteLength(s: string): number {
  let bytes = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    bytes += cp <= 0x7f ? 1 : 3;
  }
  return bytes;
}

/** 작성 주체 — 'homeroom'(담임) | 'teaching'(수업반·동아리). */
export type RecordAuthorKind = 'homeroom' | 'teaching';

interface AreaSpec {
  readonly author: RecordAuthorKind | 'both';
  readonly limit: number;
  readonly limitVerified: boolean;
}

const LIMIT_CAREER = 2_100; // 진로활동 700자
const LIMIT_DEFAULT = 1_500; // 그 외 500자(고·중)

/**
 * (학교급 × 영역) 단일 진실원천 — 유효 영역·작성주체 결속·바이트 한도. 브릿지 AREAS_BY_LEVEL 미러.
 * 초등 한도는 원문 미확인(limitVerified=false). 진로 2,100B / 그 외 1,500B(고·중).
 */
const AREAS_BY_LEVEL: Readonly<Record<SchoolLevel, Partial<Record<RecordArea, AreaSpec>>>> = {
  middle: {
    autonomy: { author: 'homeroom', limit: LIMIT_DEFAULT, limitVerified: true },
    career: { author: 'homeroom', limit: LIMIT_CAREER, limitVerified: true },
    behavior: { author: 'homeroom', limit: LIMIT_DEFAULT, limitVerified: true },
    subject: { author: 'teaching', limit: LIMIT_DEFAULT, limitVerified: true },
    individualSubject: { author: 'teaching', limit: LIMIT_DEFAULT, limitVerified: true },
    club: { author: 'teaching', limit: LIMIT_DEFAULT, limitVerified: true },
  },
  high: {
    autonomy: { author: 'homeroom', limit: LIMIT_DEFAULT, limitVerified: true },
    career: { author: 'homeroom', limit: LIMIT_CAREER, limitVerified: true },
    behavior: { author: 'homeroom', limit: LIMIT_DEFAULT, limitVerified: true },
    subject: { author: 'teaching', limit: LIMIT_DEFAULT, limitVerified: true },
    individualSubject: { author: 'teaching', limit: LIMIT_DEFAULT, limitVerified: true },
    club: { author: 'teaching', limit: LIMIT_DEFAULT, limitVerified: true },
  },
  elementary: {
    subjectDev: { author: 'both', limit: LIMIT_DEFAULT, limitVerified: false },
    autonomy: { author: 'homeroom', limit: LIMIT_DEFAULT, limitVerified: false },
    club: { author: 'homeroom', limit: LIMIT_DEFAULT, limitVerified: false },
    career: { author: 'homeroom', limit: LIMIT_CAREER, limitVerified: false },
    behavior: { author: 'homeroom', limit: LIMIT_DEFAULT, limitVerified: false },
  },
};

/**
 * 설정 학교급(elementary|middle|high|custom 등)을 생기부 학교급으로 보정.
 * custom·미지값은 보수적으로 고등 기준(영역 집합이 가장 넓고 한도 확인됨)을 적용한다.
 */
export function coerceSchoolLevel(v: string): SchoolLevel {
  return v === 'elementary' || v === 'middle' || v === 'high' ? v : 'high';
}

/** 영역별 바이트 한도. unknown level/area 는 throw(조용한 폴백 금지 — 브릿지와 동일). */
export function resolveAreaLimit(area: RecordArea, level: SchoolLevel): number {
  const spec = AREAS_BY_LEVEL[level][area];
  if (!spec) {
    throw new Error(`${level} 학교급에 없는 생기부 영역입니다: ${area}`);
  }
  return spec.limit;
}

/** 한도 수치가 공식 확인됐는지(초등은 false → 초과해도 경고). */
export function isAreaLimitVerified(area: RecordArea, level: SchoolLevel): boolean {
  return AREAS_BY_LEVEL[level][area]?.limitVerified ?? false;
}

/** 작성 주체(담임/교과)가 이 (영역 × 학교급)을 작성할 수 있는지. */
export function isAuthorAllowedForArea(
  area: RecordArea,
  level: SchoolLevel,
  author: RecordAuthorKind,
): boolean {
  const spec = AREAS_BY_LEVEL[level][area];
  if (!spec) return false;
  return spec.author === 'both' || spec.author === author;
}

/**
 * 작성주체(담임/교과) 컨텍스트에서 노출할 유효 영역 목록(탭 순서). 학교급별 분기.
 */
export function areasForContext(level: SchoolLevel, author: RecordAuthorKind): RecordArea[] {
  return (Object.keys(AREAS_BY_LEVEL[level]) as RecordArea[]).filter((area) =>
    isAuthorAllowedForArea(area, level, author),
  );
}

/** 학생 신원 키 — 담임=Student.id 그대로 / 수업반='tc:{classId}:{studentKey}'(브릿지 identity 와 동일). */
export function homeroomStudentRef(studentId: string): string {
  return studentId;
}
export function teachingStudentRef(classId: string, studentKey: string): string {
  return `tc:${classId}:${studentKey}`;
}
