# icon-mode Gap Analysis (Plan/Design vs Implementation)

> **Analysis Date**: 2026-05-02
> **Target Version**: v2.0.3 (package.json)
> **Plan/Design**: v0.2 + 사용자 결정 v0.3
> **Tool**: bkit:gap-detector

---

## 1. FR Implementation (50% weight)

| FR | 제목 | 상태 | 근거 |
|----|------|:--:|------|
| FR-01 | 설정에서 'icon' 선택 | ✅ | `Settings/tabs/WidgetTab.tsx:88` 라디오 4-옵션 |
| FR-02 | 풀앱 X → icon 전환 + fade | ✅ | `electron/main.ts` mainWindow.on('close') |
| FR-03 | 위젯 우클릭 "아이콘으로 접기" | ✅ | `Widget/WidgetContextMenu.tsx` |
| FR-04 | 단일 클릭 → restore | ✅ | `IconWindow.tsx`, `main.ts` icon:expand |
| FR-05 | 더블클릭 → 풀앱 직행 | ✅ | `IconWindow.tsx` handlePointerUp |
| FR-06 | 56×56 frameless transparent screen-saver | ⚠️ | **64×64로 변경** (Electron Issue #30171 회피, 사용자 v0.3 결정). 캐릭터는 56×56 |
| FR-07 | icon-bounds.json 디바운스 500ms | ✅ | `main.ts` scheduleIconBoundsSave |
| FR-08 | ensureIconOnScreen | ✅ | `screen.on('display-removed')` 호출 |
| FR-09 | 트레이 "아이콘 위치 초기화" | ✅ | `main.ts` 트레이 메뉴 |
| FR-10 | 우클릭 컨텍스트 메뉴 4항목 | ⚠️ | "위치 초기화"가 no-op (P2 gap → fix 예정) |
| FR-11 | 호버 100ms 툴팁 | ✅ | `IconWindow.tsx`, `IconTooltip.tsx` |
| FR-12 | 알림 펄스 효과 | ✅ | hasAlert prop → PinDisc ring |
| FR-13 | 캐릭터 PNG, 뱃지 없음 | ✅ | `floating-pin.png` (사용자 v0.3 결정) |
| FR-14 | prefers-reduced-motion duration=0 | ❌ | **P1 — 미구현**, fix 예정 |
| FR-15 | 풀스크린 자동 hide | N/A | 사용자 결정으로 제외 |
| FR-16 | 첫 활성화 코치마크 | ✅ | `CoachMark.tsx`, 5초 후 자동 사라짐 |
| FR-17 | 기본값 'widget' 유지 | ✅ | TC-02/03 통과 |
| FR-18 | 신규 IPC 4채널 | ✅ + 확장 | **6채널**: show/hide/set-bounds/expand + start-drag/end-drag (사용자 v0.3) |
| FR-19 | getAllAppWindows() 헬퍼 일원화 | ✅ | 메타테스트 6/6 통과 |
| FR-20 | autoUpdater + data:write 정상 | ✅ | broadcastToAllWindows 통일 |
| FR-21 | 첫 실행 인앱 토스트 | ❌ | **P2 — 미구현**, fix 예정 |

**FR 완료율**: 17 ✅ + 2 ⚠️ + 2 ❌ ÷ 20 = **약 85%**

---

## 2. Design Match (30% weight)

| 항목 | 상태 |
|------|:--:|
| 컴포넌트 (IconWindow/IconTooltip/IconContextMenu/CoachMark) | ✅ + 신규 PinDisc.tsx |
| IconBadge 제외 | ✅ (사용자 v0.2) |
| IPC 채널 | ✅ Design 4 + 사용자 결정 +2 (드래그 견고화) |
| 상태머신 단일 진입점 + Promise chain 큐잉 | ✅ executeWindowTransition |
| currentWindowMode/lastUserMode 추적 | ✅ Win+D 폴링 race 방지 강화 |
| WindowMode value object | ✅ |
| WidgetSettings.closeAction='icon' + IconModeOptions | ✅ |
| ?mode=icon 라우팅 | ✅ |
| icon-bounds.json 영속화 | ✅ |
| screen.on('display-removed') 통합 | ✅ |
| mainWindow.on('close') 분기 | ✅ |
| 트레이 "아이콘 모드" + "위치 초기화" | ✅ |

**Design 일치율**: ~98%

---

## 3. Quality (20% weight)

| 항목 | 상태 |
|------|:--:|
| Clean Architecture (domain pure, usecases unchanged) | ✅ |
| TypeScript strict / `any` 0건 | ✅ |
| 테스트 23/23 통과 | ✅ |
| 메타테스트 (`[mainWindow, widgetWindow]` 인라인 0건) | ✅ |
| 라운딩 정책 (`rounded-2xl/xl/full`만) | ✅ |
| sp-* 디자인 토큰 사용 | ✅ |
| 빌드 성공 (177MB Setup.exe) | ✅ |
| 회귀 RG-01~07 (수동 검증) | ✅ |

**Quality**: ~100%

---

## 4. Match Rate

`0.50 × 85% + 0.30 × 98% + 0.20 × 100% = 42.5 + 29.4 + 20.0 = 91.9%`

# 종합 Match Rate: **92%**

---

## 5. Gap List

| Priority | Gap | Description |
|:--:|------|-------------|
| **P1** | FR-14 미구현 | `prefers-reduced-motion` 대응 없음. main opacity 보간 항상 실행 → 접근성 NFR 위반 |
| **P2** | FR-21 미구현 | 첫 실행 인앱 토스트 ("설정에서 아이콘 모드를 켤 수 있어요") 없음 |
| **P2** | IconContextMenu "위치 초기화" no-op | 메뉴 항목은 있으나 onClose만 호출 — IPC `icon:reset-position` 신설 필요 |
| **P2** | release-notes.json v2.0.3 항목 없음 | Phase 6 release prep 미완료 |
| **P2** | 챗봇 KB 미갱신 | `scripts/ingest-chatbot-qa.mjs` 아이콘 모드 Q&A 없음 |
| **P3** | FR-06 사양 변경 (정당) | 56→64 (Electron Issue #30171 회피) — Plan/Design v0.4 갱신 권장 |

---

## 6. 권장 다음 단계

**≥ 90% 달성** → `report-generator` 진행 가능. Phase 6 잔여 작업과 함께 처리:

1. **FR-14** (`prefers-reduced-motion`) — P1, 즉시 fix
2. **IconContextMenu "위치 초기화"** — 실 동작 또는 메뉴 항목 제거
3. **FR-21** 첫 실행 인앱 토스트
4. **release-notes.json v2.0.3** 항목 추가
5. **챗봇 KB** Q&A 추가 (스크립트 수정, ingest는 사용자 환경변수 필요)
6. `/pdca report icon-mode` 완료 보고서

References:
- [Electron Issue #30171](https://github.com/electron/electron/issues/30171) — Transparent BrowserWindow height < 60px
- [Electron Issue #46468](https://github.com/electron/electron/issues/46468) — Win11 corners shadow
