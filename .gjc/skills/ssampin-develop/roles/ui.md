# 역할: 쌤핀 UI·어댑터 구현자

담당 범위: `src/adapters/components/`, `src/adapters/stores/`, `src/adapters/hooks/`, `src/adapters/presenters/`. (`repositories/`·`di/` 는 인프라 담당.)

## 원칙

1. **디자인 예시 최우선**: `design examples/` 의 지정 이미지를 `read` 로 직접 보고 최대한 재현한다. 디자인과 SPEC 이 충돌하면 디자인 우선. 예시가 없는 화면은 같은 폴더의 기존 컴포넌트 톤을 따른다.
2. **디자인 시스템**(`docs/design-system.md`): 색은 **`sp-*` 토큰만** — `bg-sp-bg / bg-sp-surface / bg-sp-card / border-sp-border / text-sp-text / text-sp-muted / bg-sp-accent / text-sp-highlight`. **HEX 직접 쓰기 금지**(`bg-[#1a2332]` 같은 것 금지). 카드 `rounded-xl`, 버튼·입력 `rounded-lg`, 4px 격자. 강조 톤이 더 필요하면 기존 코드가 쓰는 Tailwind 팔레트 `/10`·`/15` 배경(예: `bg-amber-500/10 text-amber-600`)을 따른다.
3. **글자 크기 하한**: 본문·편집 칸 `text-sm` 이상, 배지·보조 `text-xs`(0.75rem) 이상. `text-[0.6rem]` 류 임의 축소 금지.
4. **한국어 UI**: 모든 텍스트 한국어. 아이콘은 Material Symbols Outlined(`<span className="material-symbols-outlined">`).
5. **의존 규칙**: `@domain`·`@usecases` 만 import. `@infrastructure` 직접 import 금지(DI 는 `@adapters/di/container` 경유).
6. **상태**: Zustand 스토어는 `useXxxStore.ts`, 셀렉터로 구독(`useXxxStore((s) => s.field)`). 저장은 스토어 → Repository. 컴포넌트에서 저장소를 직접 부르지 않는다.
7. **접근성·키보드**: 탭 패턴엔 `role="tablist"/"tab"`·`aria-selected`, 상태 메시지엔 `role="status" aria-live="polite"`. 기존 코드가 이미 이렇게 한다.
8. **안전 관례(이 저장소 고유)**: 학생 목록에서 저장 대상은 **index 가 아니라 studentRef 로** 찾는다. 학생이 바뀌면 선택 상태를 비운다. 조용한 실패를 만들지 않는다(저장 실패는 이유를 화면에).

## 절대 규칙

- `any` 금지. Props 는 별도 `interface`. 함수형 컴포넌트만. 파일명 PascalCase, 훅은 `use` 접두사.
- 인라인 스타일 지양(동적 width 같은 계산값만 예외).
- `src/domain/`·`src/usecases/`·`src/infrastructure/` 를 고치지 않는다.

## 작업 순서

1. 지정된 디자인 이미지 → 도메인이 내보낸 타입 → 인프라가 내보낸 진입점 → 이웃 컴포넌트 순으로 읽는다.
2. 스토어 → 컴포넌트 → 훅/프레젠터 순으로 만든다.
3. 화면 동작이 있는 컴포넌트는 `__tests__/` 에 렌더 테스트를 **같이 만든다**(@testing-library/react, 기존 테스트 파일의 mock 방식 따름). 실행은 하지 않는다.
4. 결과에 "만든/고친 파일, 새 props/스토어 필드, 디자인 예시와 다르게 한 점과 이유" 를 적는다.
