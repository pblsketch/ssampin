# Ralph Handoff: 위젯 화면 이탈 방지 및 가시성 보장

> 생성일: 2026-08-17  
> 상태: READY_FOR_IMPLEMENTATION  
> 관련 계획: `docs/01-plan/features/widget-desktop-screen-boundary-clamp.plan.md`

---

## 1. 개요 및 구현 배경

사용자 진단 로그(`native-desktop-diag.log`)를 통해 사용자가 위젯을 드래그하여 화면 맨 밑바닥(`Y=1063`)으로 이동시켜 화면 밖으로 완전히 밀려난 상태가 확인되었습니다. 위젯의 화면 이탈을 방지하고, 화면 밖으로 나간 위젯을 자동으로 가시 영역 내로 되돌려주는 보정 로직을 구현합니다.

---

## 2. 세부 태스크 목록

### [Task 1] 순수 화면 경계 Clamping 도메인 서비스 구현

- **파일**: `src/domain/services/screenBoundsClamp.ts` (및 테스트 `src/domain/services/screenBoundsClamp.test.ts`)
- **구현 내용**:
  - `clampWidgetBoundsToWorkArea(bounds, workArea, options)`
  - `isWidgetVisibleInWorkArea(bounds, workArea, minVisibleHeight)`
  - 헤더 최소 가시 높이(기본 40px), 최소 가로폭(기본 100px) 보장

### [Task 2] `win32Desktop.ts` 헤더 드래그 시 실시간 Clamping 적용

- **파일**: `electron/platform/win32Desktop.ts`
- **구현 내용**:
  - 헤더 드래그 중 `moveWidget` 호출 전 `clampPhysicalBounds`를 적용하여 사용자가 마우스를 모니터 밖으로 밀어도 위젯 헤더가 화면 안에 남도록 제한

### [Task 3] 위젯 모드 전환/시작 시 가시성 자동 검증 및 복구

- **파일**: `electron/desktopWidgetManager.ts`, `electron/main.ts`
- **구현 내용**:
  - `ensureWidgetVisibleOnScreen(win: BrowserWindow)` 헬퍼 추가
  - `attachAndShow()`, `executeWindowTransition('widget')` 시 호출하여 화면 밖 위젯을 화면 안으로 자동 복구

### [Task 4] 모달 단축키 1초 등록/해제 루프 방어

- **파일**: `src/adapters/hooks/useDesktopModeFallback.ts` 또는 관련 모달 관리 훅
- **구현 내용**:
  - 상태 변경 없이 1초 주기로 전역 Escape 단축키가 toggle되는 렌더링 루프 점검 및 제거

---

## 3. 검증 명령어

```bash
npx tsc --noEmit
npm run lint
npm run test
npm run regression-check
```
