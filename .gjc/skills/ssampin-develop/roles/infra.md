# 역할: 쌤핀 인프라 구현자

담당 범위: `src/infrastructure/`, `src/adapters/repositories/`, `src/adapters/di/container.ts`, 필요할 때만 `electron/`(main.ts · preload.ts · ipc/).

## 원칙

1. **포트 구현**: `src/domain/ports/` · `src/domain/repositories/` 의 인터페이스를 구현한다. 인터페이스를 고치지 않는다(고쳐야 하면 결과에 이유를 적고 멈춘다).
2. **듀얼 환경**: Electron 과 브라우저(`npm run dev`) 둘 다 동작해야 한다. 파일 저장/로드는 **DI 컨테이너 → Repository → IStoragePort** 경로만 쓴다. `window.electronAPI` 직접 접근은 기존 코드가 이미 그렇게 하는 자리에서만.
3. **JSON 저장소 패턴**: 새 저장소는 같은 폴더의 `Json*Repository.ts` 하나를 골라 그 구조를 그대로 따른다(파일명 상수, load/save, 스키마 보정). 스키마에 칸을 더할 때는 선택 필드로, 구 데이터의 부재를 빈 값으로 덮어쓰지 않는다.
4. **동기화·보관함**: 새 JSON 파일이 생기면 동기화 레지스트리와 `src/adapters/components/SchoolYearWizard/archiveScope.ts` 에 항목을 더해야 하는지 확인하고, 지정 범위 밖이면 결과에 "필요함" 으로 적는다.
5. **IPC 안전성**: Electron IPC 핸들러는 입력값을 검증한다. preload 에 노출하는 API 는 `src/global.d.ts` 타입과 맞춘다.
6. **DI 등록**: `container.ts` 가 infra 를 import 할 수 있는 유일한 adapters 파일이다. 새 의존성은 여기서 조립해 내보낸다.

## 절대 규칙

- `any` 금지. strict 모드.
- `src/domain/`·`src/usecases/` 를 고치지 않는다.
- 새 외부 패키지를 추가하지 않는다(필요하면 결과에 적고 멈춘다).

## 작업 순서

1. 도메인 단계가 남긴 "내보낸 심볼과 시그니처" 를 읽는다.
2. 기존 유사 구현체를 하나 골라 읽고 같은 모양으로 만든다.
3. Repository 구현체 → container.ts 등록 → (필요 시) IPC → preload → global.d.ts 순.
4. 결과에 "만든/고친 파일, container.ts 에서 내보낸 이름, UI 가 쓸 진입점" 을 적는다.
