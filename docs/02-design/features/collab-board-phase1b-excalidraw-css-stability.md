---
template: research-report
version: 0.1
feature: collab-board-phase1b
topic: excalidraw-css-customization-stability
date: 2026-04-21
status: research
depends_on: collab-board-phase1b.plan.md §3.2, §5
---

# Excalidraw 0.17.6 CSS 커스터마이징 안정성 점검 보고서

## 요약

Excalidraw 0.17.6을 버전 핀으로 고정하는 전제 하에, `.App-toolbar` 등 내부 CSS 클래스에 의존한 툴바 커스터마이징은 **Low~Medium 리스크**이며 실용적으로 허용 가능하다. 공식 API(`UIOptions`, `renderTopRightUI`, `renderTopLeftUI`)는 기본 툴바 숨김·교체를 지원하지 않으므로 Phase 1b 목표(좌측 세로 툴바 + 색상 팔레트 6색 고정)에 CSS 오버라이드가 불가피하다. y-excalidraw 2.0.12가 0.18 미지원인 한 버전 핀이 유지되어 CSS 해킹은 안전하다.

---

## 조사 방법

- Excalidraw 공식 문서: UIOptions, Render Props, Customizing Styles
- GitHub 저장소: `excalidraw/excalidraw` master 브랜치 `packages/excalidraw/css/styles.scss`
- GitHub Issues/PR: #7583, #5745, #3012, PR #8909
- GitHub 릴리즈 노트: v0.17.3, v0.17.6, v0.18.0
- y-excalidraw 저장소: `RahulBadenkal/y-excalidraw`

---

## 발견 사항

### 1. Excalidraw 0.17.6 CSS 클래스 인벤토리

**툴바 영역**
| CSS 클래스 | 역할 |
|---|---|
| `.App-toolbar` | 메인 툴바 컨테이너 (숨김 대상) |
| `.App-toolbar--mobile` | 모바일 변형 |
| `.App-toolbar-content` | 툴바 내부 래퍼 |
| `.App-top-bar` | 상단 바 전체 |
| `.Island` | 툴바 섹션 패딩 래퍼 |
| `.ToolIcon__icon` | 툴 아이콘 요소 |
| `.undo-redo-buttons` | 실행취소/다시실행 버튼 그룹 |

**메뉴/레이아웃**
| CSS 클래스 | 역할 |
|---|---|
| `.App-menu`, `.App-menu_top` | 메인 메뉴 레이아웃 |
| `.App-menu_left`, `.App-menu_right` | 좌우 메뉴 슬롯 |
| `.main-menu`, `.main-menu-trigger` | 햄버거 메뉴 |

**공식 커스터마이징 셀렉터** (안정 보장): `.excalidraw`, `.excalidraw.theme--dark` 두 가지만 공식 문서에서 명시. 나머지는 모두 내부 구현.

### 2. 버전별 CSS 변경 이력

- **0.17.3 → 0.17.6** (patch 3회): CSS 클래스 rename 없음
- **0.17.6 → 0.18.0**: 공식 breaking changes에 CSS 클래스 rename 없음. 단 UMD → ESM 전환, CSS import 경로 변경, stats/sidebar 관련 구조 변경 존재.

**결론**: `.App-toolbar` 등 메인 툴바 클래스 자체는 0.17.x → 0.18.x 기간 중 rename 없음.

### 3. 공식 API 대안 존재 여부

| API | 가능한 것 | 한계 |
|---|---|---|
| `UIOptions.canvasActions` | 메뉴 항목 on/off | 툴바 자체 제어 불가 |
| `UIOptions.tools.image` | 이미지 툴 숨김 | 단일 항목만 |
| `renderTopRightUI` | 우상단 커스텀 UI 추가 | 기본 툴바 대체 불가 |
| `renderTopLeftUI` (PR #8909) | 좌상단 UI 추가 | 추가만 가능 |
| `<Sidebar>` children | 우측 커스텀 사이드바 | 좌측 툴바 배치 아님 |

**핵심 한계**: 기본 툴바를 숨기거나 이동하는 공식 API 없음. 수년째 미구현 이슈 3건 존재. 좌측 세로 툴바 + 색상 6색 고정은 CSS 오버라이드 없이 불가능.

### 4. CDN CSS 로드 경로 및 오버라이드 방법

**esm.sh 0.17.6 CSS 경로**:
```
https://esm.sh/@excalidraw/excalidraw@0.17.6/dist/dev/index.css
https://esm.sh/@excalidraw/excalidraw@0.17.6/dist/prod/index.css
```

**권장 오버라이드**: 인라인 `<style>` 방식. `<link rel="stylesheet">` 직후 배치로 로드 순서 확실.

```html
<link rel="stylesheet" href="https://esm.sh/@excalidraw/excalidraw@0.17.6/dist/prod/index.css">
<style>
  .excalidraw .App-toolbar { display: none !important; }
  /* 좌측 커스텀 툴바는 별도 DOM 요소로 주입 */
</style>
```

### 5. 리스크 평가

| 리스크 | 수준 | 근거 |
|---|---|---|
| 버전 핀 상태 CSS 안정성 | **Low** | 0.17.6 고정 시 변동 없음 |
| esm.sh CDN 구버전 가용성 | **Medium** | SLA 없음, 장기 self-host 검토 |
| 0.18+ 업그레이드 CSS 재작업 | **Medium** | rename 없으나 ESM/경로 변경 |
| y-excalidraw 업그레이드 블록 | **High (외부)** | 0.18 peerDeps 추가 전 버전 핀 강제 |
| 내부 클래스 rename | **Low (단기)** | 현재 계획된 rename 없음 |

---

## 권장안

**Phase 1b 목표는 공식 API만으로 달성 불가능.** CSS 오버라이드가 유일 경로. 단 다음 조건 충족:

1. **버전 핀 유지**: `@excalidraw/excalidraw@0.17.6` CDN URL 명시. `@latest` 금지.
2. **인라인 `<style>` 오버라이드**: `generateBoardHTML.ts` 내 CDN CSS 링크 바로 뒤.
3. **오버라이드 셀렉터 최소화**: `.App-toolbar` 관련만. 공유 클래스는 `.excalidraw .App-toolbar > .Island`처럼 범위 좁힘.
4. **업그레이드 트리거 모니터링**: `RahulBadenkal/y-excalidraw` 릴리즈 주기 확인. 0.18 peerDeps 추가 시 CSS 오버라이드 재검증 체크리스트 추가.

**0.17.6 EOL 시**: jsdelivr / unpkg 전환. 근본 해결은 y-excalidraw의 0.18 지원 대기 후 전체 업그레이드.

---

## 참고 링크

- [UIOptions](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/ui-options)
- [Render Props](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/render-props)
- [Customizing Styles](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/customizing-styles)
- [styles.scss](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/css/styles.scss)
- [Issue #7583](https://github.com/excalidraw/excalidraw/issues/7583)
- [Issue #5745](https://github.com/excalidraw/excalidraw/issues/5745)
- [Issue #3012](https://github.com/excalidraw/excalidraw/issues/3012)
- [PR #8909](https://github.com/excalidraw/excalidraw/pull/8909)
- [v0.18.0 Release](https://github.com/excalidraw/excalidraw/releases/tag/v0.18.0)
- [y-excalidraw](https://github.com/RahulBadenkal/y-excalidraw)
