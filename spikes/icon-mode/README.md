# Icon Mode — PoC Spike

> **목적**: 본격 구현 전에 핵심 가정을 검증하는 mini Electron PoC 모음
>
> **위치**: `spikes/icon-mode/`
> **관련 문서**: [`docs/01-plan/features/icon-mode.plan.md`](../../docs/01-plan/features/icon-mode.plan.md), [`docs/02-design/features/icon-mode.design.md`](../../docs/02-design/features/icon-mode.design.md)

---

## PoC 목록

| ID | 이름 | 검증 항목 | 통과 기준 |
|----|------|-----------|-----------|
| **PoC #1** | Windows 풀스크린 가시성 | PPT/F11 풀스크린 위에 56×56 transparent 윈도우가 보이는가 | 슬라이드쇼 시작 후에도 아이콘이 화면에 남아있음 |
| **PoC #2** | macOS 풀스크린 가시성 | Keynote/Safari 풀스크린 위에 보이는가 | GitHub Actions Mac 빌드로 검증 (별도) |
| **PoC #3** | Fade 체감 | opacity 0→1 fade 220ms가 "확장처럼" 느껴지는가 | 사용자 1명 체감 PASS |

PoC #1 + #3은 한 번에 검증 가능하므로 통합 spike로 작성됨 (`fullscreen-fade-spike/`).

---

## 실행 방법

### 사전 조건

- 메인 프로젝트(`e:/github/ssampin`)의 의존성이 설치되어 있어야 함 (`npm install` 완료 상태)
- Electron이 `node_modules/.bin/electron`에 존재해야 함

### PoC #1 + #3 통합 — Windows 가시성 + Fade 체감

```bash
# 메인 프로젝트 루트에서 실행
cd e:/github/ssampin
npx electron spikes/icon-mode/fullscreen-fade-spike/main.js
```

또는 npm script 추가하지 않고 직접:

```bash
node_modules/.bin/electron spikes/icon-mode/fullscreen-fade-spike/main.js
```

실행하면 화면 **우하단**에 56×56 빨간 동그라미 아이콘이 뜹니다.

### 키보드 단축키 (포커스 무관 — 글로벌)

| 키 | 동작 |
|----|------|
| `Ctrl+Shift+F` | Fade out (180ms) → Fade in (220ms) 토글 |
| `Ctrl+Shift+S` | 즉시 표시/숨김 (fade 없이, 비교용) |
| `Ctrl+Shift+Q` | 종료 |

### 검증 절차

#### PoC #1: Windows 풀스크린 가시성

1. spike 실행 → 우하단에 빨간 아이콘 확인
2. PowerPoint 또는 LibreOffice Impress 열기 → 슬라이드쇼 시작 (F5)
3. **체크**: PPT 슬라이드쇼 화면 위에 빨간 아이콘이 그대로 보이는가?
   - ✅ PASS: 보임 → `alwaysOnTop='screen-saver'` + `visibleOnFullScreen:true` 전략 유효
   - ❌ FAIL: PPT가 아이콘을 덮음 → 본 기능 재검토 필요 (예: Tray 모드로 fallback)
4. 보너스 체크: 듀얼 모니터 환경이라면, 다른 모니터에서 PPT 풀스크린 시 아이콘은 그대로?
5. 보너스 체크: 브라우저 풀스크린(F11)에서도 확인

#### PoC #3: Fade 220ms 체감

1. spike 실행 후 아이콘 표시된 상태에서
2. `Ctrl+Shift+F` 누르기 → Fade out → Fade in (220ms each)
3. **체크**: "확장처럼" 자연스러운가? 너무 빠르거나 느리지 않은가?
   - ✅ PASS: 자연스러움 → 220ms 확정
   - 조정 필요: 너무 빠름 → 280ms로 / 너무 느림 → 180ms로
4. `Ctrl+Shift+S`로 즉시 표시/숨김과 비교 → fade 효과의 가치 확인

---

## 결과 보고

검증 후 [`SPIKE-RESULT.md`](./SPIKE-RESULT.md)에 결과 기록.

```markdown
| PoC | 환경 | 결과 | 비고 |
|-----|------|------|------|
| #1 Windows | Win11 + PPT 2021 슬라이드쇼 | ✅ PASS | 아이콘이 PPT 위에 그대로 보임 |
| #1 Windows | Win11 + 브라우저 F11 | ✅ PASS | — |
| #1 Windows | Win11 + 듀얼모니터 PPT | ✅ PASS | — |
| #2 macOS | (대기) | — | GitHub Actions 빌드 후 별도 |
| #3 Fade | Win11 + Ctrl+Shift+F | ✅ PASS | 220ms 적정. 약간 빠르다 느낌도 있으나 OK |
```

전부 PASS → Phase 0 (`getAllAppWindows()` 헬퍼 추출) 진입.
실패 → Plan/Design 재검토.
