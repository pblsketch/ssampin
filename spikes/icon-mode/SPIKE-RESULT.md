# Icon Mode — Spike Results

> 사용자가 PoC를 직접 실행한 후 이 문서에 결과를 기록한다.
>
> **PoC 코드**: [`spikes/icon-mode/fullscreen-fade-spike/`](./fullscreen-fade-spike/)
> **실행 방법**: [`README.md`](./README.md) 참조

---

## 검증 결과 (2026-05-01)

| PoC | 환경 | 결과 | 비고 |
|-----|------|------|------|
| #1-a — Windows PPT 슬라이드쇼 | Win11 + PowerPoint | ✅ PASS | 빨간 동그라미가 슬라이드쇼 위에 그대로 보임 |
| #1-b — Windows 브라우저 F11 | Win11 + Chrome F11 | ✅ PASS | — |
| #1-c — Windows YouTube 풀스크린 | Win11 + Chrome YouTube | ✅ PASS | — |
| #3 — Fade 220ms 체감 | Win11 + Ctrl+Shift+F | ✅ PASS | 220ms 자연스러움 |
| #3 — 즉시 vs Fade 비교 | Ctrl+Shift+S vs F | ✅ PASS | Fade가 확실히 부드러움 |
| 보너스 — 드래그 | Win11 마우스 드래그 | ✅ PASS | -webkit-app-region: drag 정상 동작 |
| #2 — macOS Keynote | (대기) | ⏳ | GitHub Actions Mac 빌드 후 별도 |

**범례**: ✅ PASS / ❌ FAIL / ⚠️ PARTIAL / ⏳ 대기

---

## 종합 판정 (2026-05-01)

- [x] PoC #1 통과 (Windows 전부 — PPT, F11, YouTube 모두)
- [ ] PoC #2 통과 (macOS) — Phase 5 단계 또는 v2.0.2 빌드 시 검증 예정
- [x] PoC #3 통과 (Fade 자연스러움)
- [x] 보너스 드래그 통과

→ **Phase 0 진입 결정**: `getAllAppWindows()` 헬퍼 추출 + 메타테스트 추가
→ macOS 검증은 v2.0.2 빌드 시 GitHub Actions로 사전 점검 (Phase 6 직전)

---

## 추가 발견 사항

(PoC 실행 중 예상치 못한 동작 없음 — 모두 설계대로 동작)

---

## 결정 사항 (확정)

| 파라미터 | 확정값 | 근거 |
|----------|--------|------|
| 윈도우 크기 | **56×56 px** | UX 검토 + 시각 확인 — 적정 크기 |
| 아이콘 위치 기본값 | **우하단 24px 마진** | 시각 확인 — 자연스러운 위치 |
| Fade-in duration | **220ms** | PoC #3 체감 PASS |
| Fade-out duration | **180ms** | PoC #3 체감 PASS |
| Easing | **ease-out cubic** (`1 - (1-t)^3`) | PoC #3 체감 PASS — overshoot 불필요 |
| alwaysOnTop level | **`'screen-saver'`** | PPT/F11/YouTube 모두 통과 |
| visibleOnFullScreen | **`true`** | PPT/F11/YouTube 모두 통과 |
| 드래그 영역 | **`-webkit-app-region: drag`** (전체) | 보너스 검증 PASS |

---

## 다음 단계

Phase 0 (선결 커밋): `getAllAppWindows()` 헬퍼 추출 + 메타테스트 → Phase 2~6 본 기능 구현.
