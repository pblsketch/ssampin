/**
 * 쌤핀 AI — 도구 등급제의 뼈대 (egress 4중 그물 ①)
 *
 * 순수 TypeScript — 외부 의존성 import 금지(Clean Architecture domain 규칙).
 * 이 파일에 import 가 없어야 단위 테스트에서 함정 픽스처를 그대로 먹여 볼 수 있다.
 *
 * 설계 근거: docs/01-plan/features/in-app-chatbot-zen.plan.md §4
 * 서명 문장: "이름은 화면에 남고, 숫자만 밖으로 나간다."
 */

/** 도구가 다루는 데이터의 민감도 등급 */
export type AssistToolGrade = 1 | 2 | 3;

/**
 * 이 도구를 쓸 때 **무엇이 앱 밖으로 나가는가**.
 *
 * 읽기 도구는 *결과*가 나가고, 쓰기 도구는 *인자*가 나간다.
 * 쓰기 도구는 모델이 저장할 문장을 직접 지어내므로 등급제로 막을 수 없다 — 그래서 구분한다.
 */
export type AssistToolOutbound = 'result' | 'args' | 'none';

/** 도구 식별자. 레지스트리(assistToolRegistry)가 정의한다. */
export type AssistToolId = string;

export interface AssistToolDef {
  readonly id: AssistToolId;
  /**
   * ★optional 이 아니다. 빠뜨리면 컴파일이 실패한다.
   * 사람이 등급을 기억하는 설계는 6개월 뒤에 무너지므로 타입으로 강제한다.
   */
  readonly grade: AssistToolGrade;
  readonly outbound: AssistToolOutbound;
  /** 화면·프롬프트에 쓰는 한국어 설명 */
  readonly description: string;
  /**
   * 모델에게 돌려줄 때 허용되는 **최상위** 필드 이름 목록.
   * sanitizeToolResult 가 이 목록만으로 **새 객체를 만든다**(필드를 지우는 방식이 아니다).
   */
  readonly resultFields: readonly string[];
  /**
   * 중첩 구조의 허용 필드. 최상위 키 → 그 안 객체의 허용 필드 목록.
   *
   * ★없으면 그 필드는 **참조가 그대로 복사된다** — depth 1 에서 그물 ②가 뚫린다.
   * 예: `{ items: store.todos }` 를 넘기면 `subTasks`·`googleTaskId` 가 통째로 나간다.
   * 계획서 §4.2 의 화이트리스트가 `{ items: [{ title, due, done }] }` 처럼 **중첩 단위**로
   * 적혀 있으므로, 코드도 그 깊이를 강제해야 한다.
   */
  readonly nestedFields?: Readonly<Record<string, readonly string[]>>;
  /**
   * **선생님이 자유롭게 친 문자열**이 들어가는 필드 이름.
   *
   * 전송 직전 관문(assertNoPii)이 이 필드에만 생년월일 패턴까지 검사한다.
   * 구조화된 필드(날짜·숫자·학급명)에 그 패턴을 켜면 `date: '2026-08-21'` 같은
   * **정상 값이 전부 차단된다** — 실제로 그렇게 만들었다가 잡혔다.
   *
   * 예: 할 일·일정의 `title` 에는 선생님이 "김지훈 상담 전화"처럼 적는다.
   */
  readonly freeTextFields: readonly string[];
  /**
   * **기계가 만든 식별자** 필드 — 패턴 검사에서 제외한다(이름 대조는 그대로 적용).
   *
   * ★왜 필요한가: UUID 는 전화번호 정규식에 걸린다. 전화 패턴의 앞 경계가 `(?<![\d-])` 라
   * 앞이 16진수 문자면 통과하기 때문이다. 실측으로 **UUID 30만 개 중 717개(0.24%)가 매치**했다.
   * 예: `a4755b0f-69b8-4b05-9129-3171a4a53e17` -> `05-9129-3171`
   *
   * 걸린 id 는 **결정론적으로 매번** 걸리므로, 그 학급을 가진 교사는 해당 도구를 **영구히** 못 쓴다.
   * 1차 검토에서 잡힌 치명 결함(생년월일 패턴이 정상 날짜를 막던 것)과 **같은 부류**다 —
   * "오탐이 기능을 죽인다".
   *
   * 식별자에는 사람이 읽는 정보가 없으므로 패턴 검사를 뺀다. 이름 대조는 계속 돈다.
   */
  readonly opaqueFields?: readonly string[];
}

/**
 * 모델에 노출이 허용된 등급. **영구 경계다 (ADR-061 결정 7).**
 *
 * `[1, 2]` 로 바꾸지 않는다 — 쌤핀은 무료를 원칙으로 하므로(ADR-061 결정 6)
 * 업스테이지 이용약관 제22조의 "학습에 활용될 수 있으며 · 옵트아웃 없음"이 계속 적용된다.
 * 따라서 경계를 풀 조건이 성립하지 않는다.
 *
 * 이 상수를 바꾸면 계약 테스트가 **어떤 도구가 새로 열리는지 즉시 빨간불로 드러낸다.**
 */
export const ALLOWED_GRADES: readonly AssistToolGrade[] = [1];

/** 해당 등급이 모델에 노출 가능한가 */
export function isGradeAllowed(grade: AssistToolGrade): boolean {
  return ALLOWED_GRADES.includes(grade);
}

declare const modelSafeBrand: unique symbol;

/**
 * 화이트리스트 재구성을 통과한 값에만 붙는 표식(브랜드 타입).
 *
 * 중계 함수로 보내는 자리가 `ModelSafe<T>` 만 받으므로,
 * **재구성 함수를 거치지 않은 객체는 타입 시스템이 거부한다**(그물 ②).
 * 이 표식은 런타임에 존재하지 않는다 — 순수 컴파일 타임 장치다.
 */
export type ModelSafe<T> = T & { readonly [modelSafeBrand]: true };

/** 이 도구의 반환값에 자유 입력 문자열이 섞이는가 */
export function hasFreeText(tool: AssistToolDef): boolean {
  return tool.freeTextFields.length > 0;
}
