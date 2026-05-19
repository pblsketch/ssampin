# Architecture Rules — Clean Architecture 4 레이어

## 레이어 구조

```
infrastructure/ → Electron, 파일 I/O, API
  adapters/    → React, Zustand, DI
    usecases/  → 앱 로직
      domain/  → 핵심 비즈니스 규칙 (순수 TypeScript)
```

## 의존성 규칙 (절대 위반 금지)

```
✅ infrastructure/ → domain/ (포트 인터페이스 구현)
✅ adapters/       → domain/ + usecases/
✅ usecases/       → domain/만
❌ domain/         → 아무것도 import 안 함
❌ usecases/       → adapters/, infrastructure/ import 금지
```

**유일한 예외**: `adapters/di/container.ts`는 infrastructure/를 import하여 의존성을 조립한다.

## Import 규칙

```typescript
// ✅ 올바른 import
import { Student } from '@domain/entities/Student';
import { SwapSeats } from '@usecases/seating/SwapSeats';
import { useSeatingStore } from '@adapters/stores/useSeatingStore';

// ❌ 금지된 import
import { useSeatingStore } from '@adapters/stores/...'; // usecases에서 adapters → 금지
import { ElectronStorageAdapter } from '@infrastructure/...'; // usecases에서 infra → 금지
```

## Path Alias (tsconfig.json)

```json
{
  "paths": {
    "@domain/*": ["src/domain/*"],
    "@usecases/*": ["src/usecases/*"],
    "@adapters/*": ["src/adapters/*"],
    "@infrastructure/*": ["src/infrastructure/*"]
  }
}
```

## 데이터 저장

- **Electron**: `app.getPath('userData')/data/{filename}.json`
- **브라우저(개발)**: `localStorage` 폴백
- **추상화**: `IStoragePort` 인터페이스로 환경 자동 감지
- 스키마 변경 시 마이그레이션 로직을 Repository 구현체에 추가
- 파일 저장/로드: DI 컨테이너 → Repository → IStoragePort 경로 필수

## 프로젝트 구조 요약

```
ssampin/
├── electron/           # Electron 메인 프로세스 (main.ts, preload.ts)
├── src/
│   ├── domain/         # 엔티티, 값객체, 규칙, 포트, 리포지토리 인터페이스
│   ├── usecases/       # schedule, seating, events, memo, todo, studentRecords
│   ├── adapters/       # components, stores, hooks, repositories, presenters, di
│   └── infrastructure/ # storage, weather, export
├── design examples/    # UI 디자인 레퍼런스 (Google Stitch)
├── docs/               # 01-plan, 02-design, 03-analysis, 04-report
└── _workspace/         # 작업 중인 계획 문서
```
