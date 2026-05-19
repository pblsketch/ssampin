# Coding Conventions — 쌤핀

## TypeScript

- **strict 모드** 필수 (`noImplicitAny`, `strictNullChecks`)
- `any` 타입 사용 금지
- Props는 별도 `interface` 정의
- 에러 처리 필수 (try-catch)

## React

- 함수형 컴포넌트만 사용
- 커스텀 훅은 `use` 접두사
- 컴포넌트 파일명: PascalCase (예: `DashboardTimetable.tsx`)

## 스타일

- 들여쓰기: 2 spaces
- 세미콜론: 사용
- 따옴표: 작은따옴표
- 후행 쉼표: 사용
- Tailwind CSS 유틸리티 클래스 사용 (인라인 스타일 지양)

## Electron + 브라우저 호환

- Electron과 브라우저 모두에서 동작해야 함 (`npm run dev`로 브라우저 테스트)
- `domain/` 레이어는 절대 외부 의존성 금지 (React, Zustand, Electron 등)
