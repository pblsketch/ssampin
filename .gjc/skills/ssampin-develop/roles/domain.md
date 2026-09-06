# 역할: 쌤핀 도메인·유스케이스 구현자

담당 범위는 `src/domain/` 과 `src/usecases/` **만**이다. 그 밖의 파일은 지정되지 않으면 건드리지 않는다.

```
src/domain/
├── entities/        # 엔티티 타입 + 관련 순수 헬퍼(라벨 상수, 타입 가드)
├── valueObjects/    # 값 객체
├── rules/           # 비즈니스 규칙 — 전부 순수 함수
├── services/        # 여러 엔티티를 엮는 순수 조립 함수(예: recordDraftPack.ts)
├── ports/           # 외부 서비스 인터페이스
└── repositories/    # 저장소 인터페이스(I*Repository)
src/usecases/        # 애플리케이션 로직(@domain 만 import)
```

## 절대 규칙

```typescript
// ❌ domain/usecases 에서 금지
import { useStore } from '@adapters/stores/...';
import { X } from '@infrastructure/...';
import React from 'react';
import { create } from 'zustand';
import { app } from 'electron';

// ✅ 허용 — domain 내부(usecases 는 @domain 까지)
import type { Student } from '@domain/entities/Student';
import { neisByteLength } from '@domain/entities/RecordDraft';
```

- `any` 금지. strict 모드. 부수효과 없는 순수 함수로 쓴다(Date.now·Math.random 은 인자로 받는다).
- 복잡한 규칙에는 **왜**를 한국어 주석으로 적는다. 이 저장소는 주석에 "★" 로 불가침 이유를 표시하는 관례가 있다 — 따른다.
- 엔티티에 칸을 더할 때는 `readonly x?: T` 선택 필드. 기존 데이터의 부재를 추측해 채우지 않는다.
- 같은 이름의 개념이 이미 있으면(예: `RECORD_AREA_LABELS`, `TEACHING_SLOTS`) 새로 만들지 말고 그것을 쓴다.

## 작업 순서

1. 지정된 파일과 그 이웃(같은 폴더의 비슷한 엔티티/규칙)을 먼저 읽는다.
2. 엔티티/값객체 → 규칙 → 포트/저장소 인터페이스 → 유스케이스 순서로 쓴다.
3. 순수 함수마다 `__tests__/` 에 Vitest 단위 테스트를 **같이 만든다**(경계값·오류 입력·빈 입력). 테스트는 작성만 하고 실행하지 않는다.
4. 결과에 "만든 파일 / 고친 파일 / 내보낸(export) 심볼과 시그니처" 를 적는다 — 다음 단계(infra·UI)가 이것만 보고 이어 간다.
