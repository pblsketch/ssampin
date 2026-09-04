/**
 * 성취기준 자료 JSON 의 **타입만** 알려 준다.
 *
 * 왜 이 파일이 필요한가: `resolveJsonModule` 이 켜져 있으면 TypeScript 가 JSON 을 직접 읽어
 * 3,838개 항목의 리터럴 타입을 전부 추론한다. 그 비용이 실측으로 **타입 검사 65초 → 120초**였다.
 * 어차피 우리는 `CurriculumStandardsBundle` 로 다룰 것이라 리터럴 타입이 아무 쓸모가 없으므로,
 * 여기서 모양을 선언해 TS 가 파일을 열지 않게 한다.
 *
 * 자료 자체는 `scripts/fetch-curriculum-standards.mjs` 가 만든다.
 */
declare module '@domain/data/curriculumStandards.elementary.json' {
  const bundle: import('./curriculumStandards.types').CurriculumStandardsBundle;
  export default bundle;
}

declare module '@domain/data/curriculumStandards.secondary.json' {
  const bundle: import('./curriculumStandards.types').CurriculumStandardsBundle;
  export default bundle;
}
