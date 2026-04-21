# PDF Exporter 재작성 — 완료 보고서 (원 계획 포함)

> **원 계획 작성일**: 2026-04-20
> **실행 기간**: 2026-04-20 ~ 2026-04-21 (약 2 실제일 / 계획 5영업일 대비 단축)
> **계획 주체**: Prometheus (Strategic Planning Consultant)
> **실행**: Claude Code (executor)
> **상태**: Day 1~4 완료, Day 5 (bundle 측정 / 문서 rename / tsc 공식검증) 완료
> **Match Rate**: **94%** (bkit gap-detector, 2026-04-21)
> **배경 문서**: [위노트 경쟁 분석](./위노트_경쟁분석_노트서식.md), [서식 관리 계획서](./계획_서식-관리.md)

---

## 🎯 실행 완료 요약

### 구현 산출물 (계획 전부 충족 + 초과)

| 카테고리 | 계획 | 실제 |
|---|---|---|
| 공개 API | 3 메서드 (`printCurrentView`/`renderTemplate`/`fillFormFields`) | ✅ 모두 구현 + factory 패턴 |
| 테스트 | 3 메서드 × 2 케이스 = 6 | **36 tests** (6배 초과) |
| tsc 통과 | 0 errors | ✅ 공식 `EXIT=0` 확인 |
| 번들 사이즈 | +1.5~2.5 MB 예상 | **+7.6 MB 실측** (§4-3 초과 — 아래 "계획 vs 실제" 참조) |
| Clean Architecture | `Export.tsx:206` 직접 호출 제거 | ✅ `createPdfExporter()` 경유로 전환 |
| 폰트 오프라인 동작 | Noto Sans KR 서브셋 번들 | ✅ Regular + Bold 2종, `public/fonts/` 내장 |
| 테스트 Korean 커버 | "홍길동" 렌더링 기대 | ✅ `pdfjs-dist` 재추출로 "쌤핀" (KS X 1001 외) 포함 실측 |

### Gap 분석 결과 (2026-04-21 @ 완료 직전)

| Gap | 우선순위 | 상태 |
|---|:---:|:---:|
| GAP-1: 문서 rename | LOW | ✅ 본 문서 |
| GAP-2: 번들 사이즈 측정 | LOW | ✅ §실측 번들 사이즈 참조 |
| GAP-3: pdfjs-dist 썸네일 | NONE | Phase 2 이월 (계획 §4-1 허용) |
| GAP-4: 폰트 크기 초과 | LOW | ✅ 아래 "계획 vs 실제 Day 1 폰트" 참조 |
| GAP-5: 테스트 초과 | NONE | 긍정적 이탈 |

---

## 📊 실측 번들 사이즈 (GAP-2 해결)

`npm run build` 실행 결과 (2026-04-21, vite 6.1.0):

| Chunk | 크기 | gzip | 설명 |
|---|---:|---:|---|
| `PrintCurrentView-*.js` | 0.59 kB | 0.33 kB | Day 2 래퍼 (Electron IPC 호출) |
| `FillFormFields-*.js` | 1.29 kB | 0.80 kB | Day 3 입구점 (실 의존성은 FontRegistry에 포함) |
| `FontRegistry-*.js` | 919.77 kB | 451.88 kB | `pdf-lib` + `@pdf-lib/fontkit` 번들 |
| `RenderTemplate-*.js` | 1,182.77 kB | 430.61 kB | `@pdfme/generator` + `@pdfme/schemas` (text plugin) |
| **JS 소계** | **~2.10 MB** | **~884 kB** | 동적 import로 4 chunk 분할됨 |
| `NotoSansKR-Regular.subset.ttf` | 2.77 MB | — | 별도 정적 자산 |
| `NotoSansKR-Bold.subset.ttf` | 2.77 MB | — | 별도 정적 자산 |
| **폰트 소계** | **5.54 MB** | — | |
| **PDF 관련 총합** | **~7.64 MB** | — | |

**§4-3 계획 예상 vs 실제**:
- 계획: `~1.5~2.5MB` (pdfjs 제외)
- 실제: `~7.64MB` (폰트 포함)
- 초과 원인: 폰트 글리프 범위 확장 (아래 §계획 vs 실제 Day 1 폰트)

**§9-5 LOW 리스크 트리거됨** ("+5MB 이상" 임계). 완화 조치:
- 동적 import 분할 이미 적용됨 → 대시보드 인쇄만 쓰는 사용자는 ~900 kB만 로드
- `@pdfme/schemas`에서 `text` 외 플러그인 미사용 확인 (tree-shake 기대치 부분 달성)
- 폰트 서브셋은 "쌤" 등 학생 이름 안전성 우선으로 유지 (아래 참조)
- 차기 최적화 옵션: Phase 2에서 `@pdfme/generator` 대신 `pdf-lib` 직접 사용으로 전환 시 ~1 MB 추가 절감 가능

---

## 🔀 계획 vs 실제 (의도적 이탈 3건 + 초과 달성 2건)

### Day 1 폰트 범위: KS X 1001 → 전체 한글 음절 (LOW GAP-4)

| 항목 | 계획 §6-1 | 실제 |
|---|---|---|
| 글리프 범위 | KS X 1001 2,350자 + 영문/숫자/기호 | **U+AC00-D7A3 (한글 음절 전체 11,172자)** + Latin + 구두점 + 기호 |
| 파일 크기 (weight당) | ~166~404 KB (§3-3 추정) | **~2.70 MB** (약 7배) |
| 합계 (Regular+Bold) | ~600 KB~1 MB | **~5.40 MB** (약 5배) |

**근거**: 앱 이름 "쌤핀"의 "쌤"(U+C2BC) 조차 KS X 1001 2,350자 외. 학생 이름은 사용자 입력이라 희귀 한글 음절(U+AC00-D7A3 전역)이 등장할 수 있고, 누락 시 `▯` 박스로 렌더링되어 사용자 신뢰 손상. 교사용 앱에서 학생 이름 오류는 용납 불가.

**Trade-off**: 번들 5.4 MB 추가 vs. 글리프 누락 0건. 인스톨러 ~200 MB 대비 2.7% 증가.

**Phase 2 최적화 여지**: 초기 로드 대신 실제 사용 시점에 폰트 동적 로드 (단, 오프라인 원칙 유지하려면 app.asar 내부)

### Day 1 폰트 포맷: OTF → TTF (이탈 아님 — 계획이 허용)

| 계획 §6-1 | 실제 |
|---|---|
| "OTF (pdf-lib/fontkit는 OTF와 TTF 둘 다 지원). 단 pdfme가 TTF만 받는 경우 TTF로 전환 — Day 1에 실측 후 확정" | **TTF 채택** |

**근거**: Google Fonts `google/fonts` 저장소의 Noto Sans KR은 variable TTF로만 제공. pdf-lib + fontkit + pdfme 모두 TTF 정상 처리 확인. `build-subset.py` 는 variable TTF → weight별 static TTF 인스턴스 → 서브셋 TTF 파이프라인 사용.

### Day 2 `printCurrentView`의 title/author silent drop (이탈 아님 — 타입-구현 차등 명시)

| 계획 §5-2 | 실제 `PrintCurrentView.ts:11-14` |
|---|---|
| `PdfOptions.title`/`author` 정의 | 주석 명시 후 IPC로 전달하지 않고 silent drop |

**근거**: Electron `webContents.printToPDF()` API 자체가 PDF 메타데이터 설정을 지원하지 않음. `renderTemplate`/`fillFormFields` 에서는 pdf-lib 후처리로 정상 구현됨. 필요 시 추후 `printToPDF()` 출력을 pdf-lib로 재오픈해 메타데이터 주입하는 후처리 단계 추가 가능.

### 초과 달성 1: 테스트 커버리지

| 계획 DoD #5 | 실제 |
|---|---|
| 3 메서드 × 2 케이스 = 6 tests | **36 tests** across 8 files (6배 초과) |

### 초과 달성 2: `PdfPageSize` 옵션

| 계획 §5-2 | 실제 types.ts |
|---|---|
| `'A4' \| 'A3' \| 'Letter' \| {w,h}` (4종) | `'A4'\|'A3'\|'A5'\|'Letter'\|'Legal'\|'Tabloid'\|{w,h}` (7종) |

**근거**: Electron `printToPDF` 네이티브 지원 전체. 추가 기능 제공에 번들 영향 0.

---

## 📁 최종 산출 파일 일람

### 신규 (infrastructure + adapters)
- `src/infrastructure/export/pdf/types.ts` (공개 타입, 외부 의존 0)
- `src/infrastructure/export/pdf/PrintCurrentView.ts` + `PrintCurrentView.test.ts`
- `src/infrastructure/export/pdf/RenderTemplate.ts` + `RenderTemplate.test.ts`
- `src/infrastructure/export/pdf/FillFormFields.ts` + `FillFormFields.test.ts`
- `src/infrastructure/export/pdf/FontRegistry.ts` + `FontRegistry.test.ts`
- `src/adapters/presenters/pdfTemplatePresenter.ts` + `pdfTemplatePresenter.test.ts`

### 재작성 (infrastructure)
- `src/infrastructure/export/PdfExporter.ts` (8줄 stub → factory + deprecated wrapper)
- `src/infrastructure/export/index.ts` (6개 타입 + `createPdfExporter` re-export)

### 수정 (adapters + electron + types)
- `src/adapters/components/Export/Export.tsx:204-215` (리팩터링)
- `electron/main.ts:1118-1138` (IPC options 확장)
- `electron/preload.ts:42-56`
- `src/global.d.ts:35-48`

### 신규 정적 자산
- `public/fonts/NotoSansKR-Regular.subset.ttf` (2.70 MB)
- `public/fonts/NotoSansKR-Bold.subset.ttf` (2.70 MB)

### 신규 스크립트 (개발용, 런타임 번들 제외)
- `scripts/font-subset/build-subset.py` (Google Fonts variable → 정적 서브셋)
- `scripts/font-subset/poc-pdfme-korean.mjs` (Day 1 POC)
- `scripts/font-subset/verify-korean-text.mjs` (pdfjs-dist 재추출 검증)

### 신규 devDependency
- `pdfjs-dist` (POC + 테스트에서만 사용 — 런타임 번들에 포함되지 않음)

---

## ⏭️ Phase 2 이월 항목

1. **썸네일 미리보기** (pdfjs-dist를 adapters 레이어에 통합) — 서식 관리 Phase 2
2. **내장 서식 10종 제작** — 별도 계획 `계획_서식-관리.md` Phase 2
3. **`printCurrentView` 메타데이터 지원** — pdf-lib 후처리 단계 추가 시 활성화
4. **Radio/Dropdown/Signature 필드 지원** — `FillFormFields.applyRowToForm` 확장
5. **@pdfme/generator → pdf-lib 직접 구현 검토** — 번들 ~1 MB 추가 감소 여지

---

# ──────── 이하 원 계획 문서 ────────

# PDF Exporter 재작성 계획서

> **작성일**: 2026-04-20
> **작성 주체**: Prometheus (Strategic Planning Consultant)
> **배경 문서**: [위노트 경쟁 분석](./위노트_경쟁분석_노트서식.md), [서식 관리 계획서](./계획_서식-관리.md)
> **범위**: PDF 엔진 재작성 + `Export.tsx` 리팩터링 (내장 서식 10종 제작은 서식 관리 Phase 2에서 처리, 본 계획 **범위 외**)
> **기간**: 5영업일

---

## 1. 개요 & 목표

### 1-1. 왜 지금 재작성하는가

쌤핀 PDF 출력은 현재 실질적으로 동작하지 않는 **8줄 스텁** 상태다 ([`src/infrastructure/export/PdfExporter.ts`](../src/infrastructure/export/PdfExporter.ts)). 서식 관리 기능(위노트 경쟁 분석에서 차별화 포인트로 식별됨)의 전제 조건인 PDF 생성 능력을 **세 가지 용도 모두** 충족하도록 재작성한다.

### 1-2. 목표 3가지

| 목표 | 구현 수단 | 본 계획 범위 |
|------|----------|--------------|
| **정적 보고서 인쇄** (HTML → PDF) | Electron `webContents.printToPDF()` 래핑 | O |
| **템플릿+데이터 주입** (JSON 템플릿 → PDF) | pdfme 계열 런타임 | O (엔진만) |
| **PDF 폼 필드 채움** (mail-merge) | pdf-lib `PDFForm` + `@pdf-lib/fontkit` | O |
| 내장 서식 10종 제작 | — | **X (Phase 2)** |
| 썸네일 미리보기 UI | pdfjs-dist | **선택 (여유 있으면)** |

### 1-3. 성공 기준 (Definition of Done)

- [ ] `PdfExporter` 모듈이 3가지 공개 메서드를 노출한다: `printCurrentView()`, `renderTemplate()`, `fillFormFields()`
- [ ] Clean Architecture 의존성 규칙을 위반하지 않는다. `adapters/components/Export/Export.tsx:206`의 `window.electronAPI.printToPDF()` 직접 호출이 제거되고 `PdfExporter` 경유로 바뀐다.
- [ ] Noto Sans KR 서브셋(Regular + Bold)이 번들 내장되어, 네트워크 없이 한글 PDF가 생성된다.
- [ ] 기존 `exportToPdf()` 함수 시그니처는 **호환성 wrapper**로 유지하거나 deprecation 주석을 남긴다 (호출처 없으므로 단순 제거 가능 — §2-2 참조).
- [ ] Vitest 단위 테스트가 3종 메서드 각각에 대해 "바이트 생성 검증" 수준으로 통과한다.

---

## 2. 현재 상태 분석

### 2-1. PdfExporter.ts 원본 (8줄)

```ts
// e:/github/ssampin/src/infrastructure/export/PdfExporter.ts
export async function exportToPdf(): Promise<ArrayBuffer | null> {
  if (window.electronAPI) {
    return window.electronAPI.printToPDF();
  }
  // 브라우저 폴백: window.print()
  window.print();
  return null;
}
```

### 2-2. 사용처 전수 조사 (Grep 결과)

| 파일 | 줄 | 내용 | 영향도 |
|------|-----|------|--------|
| `src/infrastructure/export/PdfExporter.ts` | 1~8 | 스텁 본체 | **재작성 대상** |
| `src/infrastructure/export/index.ts` | 20 | `exportToPdf` re-export | 새 API로 교체 |
| `src/global.d.ts` | 35 | `printToPDF: () => Promise<ArrayBuffer \| null>` 타입 선언 | 유지 (메인 프로세스 IPC는 변경 없음) |
| `src/adapters/components/Export/Export.tsx` | 206 | `window.electronAPI.printToPDF()` **직접 호출** | **리팩터링 필수** — 현재 `PdfExporter`를 우회하고 있어 Clean Architecture 위반 |

**핵심 발견**: `exportToPdf()` 함수는 `index.ts`에서 re-export되지만, **실제로 어디에서도 import되지 않는다** (Grep 결과에 import 사이트 없음). 즉 스텁은 **죽은 코드**이며, 유일한 실사용처인 `Export.tsx:206`은 전역 `window.electronAPI.printToPDF()`를 직접 부른다. 이는 **adapters → global object → main process**의 단축 경로로, `infrastructure/` 레이어를 우회한다.

### 2-3. 형제 Exporter 패턴 (참고용)

- [`HwpxExporter.ts`](../src/infrastructure/export/HwpxExporter.ts): `@ubermensch1218/hwpxcore` 의존, `exportClassScheduleToHwpx`, `exportSeatingToHwpx` 등 **도메인별 엔트리 함수** 제공. `domain/entities/*`를 인자로 받고 `ArrayBuffer` 반환.
- [`ExcelExporter.ts`](../src/infrastructure/export/ExcelExporter.ts): `exceljs` 의존, 동일 패턴 + `ExcelExporter.test.ts` Vitest 테스트 존재. **PdfExporter도 같은 규약을 따르는 것이 일관성 측면에서 유리**.

### 2-4. 기존 Electron IPC 상태

`global.d.ts:35`에 `printToPDF: () => Promise<ArrayBuffer | null>`가 이미 정의되어 있다. 본 계획에서는 이를 **유지하되**, HTML→PDF 전용 저수준 핸들로 간주하고 `PdfExporter.printCurrentView()`가 이를 래핑한다.

---

## 3. 라이브러리 조사 결과 (2026-04 기준, WebSearch 검증)

### 3-1. 라이브러리별 사실 표

| 라이브러리 | 최신 버전 | 최근 활동 | 한글 지원 | AcroForm | 번들 영향 | 라이선스 | 비고 |
|-----------|----------|----------|----------|----------|----------|----------|------|
| **pdf-lib** | 1.17.1 (2024-02 릴리즈 기준, 확인 필요) | 8.4k stars / 유지관리 중(maintainer 주당 ~5시간) | `@pdf-lib/fontkit` 조합으로 TTF/OTF subset 임베딩 가능 | **Full** (PDFForm API, 텍스트/체크박스/라디오/드롭다운) | 라이브러리만 ~350KB 추정 (Bundlephobia 재확인 필요) | MIT | **폼 필드 채움의 표준** |
| **pdfme** (@pdfme/generator) | 6.0.6 (13일 전 릴리즈) | 활발 | 커스텀 폰트 API 존재, CJK 구체 예제 **확인 필요** | **미지원** (issue #1187이 open) | 확인 필요 (plugins 별도) | MIT | 내부적으로 pdf-lib 사용 (@pdfme/pdf-lib fork) |
| **pdfjs-dist** | 5.6.205 (21일 전) | Mozilla 유지 | N/A (뷰어/렌더러) | 렌더만 | ~1MB+ worker 별도 | Apache-2.0 | **썸네일/미리보기 전용**, 생성 기능 없음 |
| **@react-pdf/renderer** | @react-pdf/font 4.0.4 (2개월 전) | 유지 중이나 한글 관련 open issues 다수 (#806, #2681) | **불안정** — Noto Sans KR TTF 적용 시 blank 화면 버그 리포트 존재 | 미지원 | 큼 (renderer + fontkit + React 런타임) | MIT | **본 계획에서 비권장** |
| **jsPDF + html2canvas** | — | 유지 중 | UTF-8/CJK는 커스텀 폰트 강제 필요, html 메서드에서 커스텀 폰트 누락 이슈 다수 | 제한적 | jsPDF 자체 작음 / html2canvas 래스터 변환 비용 큼 | MIT | **본 계획에서 비권장** (Electron에 Chromium 내장되어 있어 불필요) |
| **pdfkit** | (npm 검색으로 확인 필요) | 유지 | TTF 임베딩 가능 | 제한적 | Node.js 중심, 스트림 API | MIT | 저수준 제어 우수하나 PDF 파싱/수정은 pdf-lib 대비 약함 |
| **puppeteer / puppeteer-core** | — | 활발 | Chromium 호출이므로 시스템 폰트 의존 | — | Chromium 바이너리 ~150MB (쌤핀 번들에 추가 불가) | Apache-2.0 | **쌤핀은 Electron 내부 Chromium이 있으므로 불필요** — `webContents.printToPDF()`가 동일 기능 제공 |

> **확인 필요 항목** (본 계획에 포함된 "추측 금지" 원칙):
> - pdf-lib 1.17.1의 정확한 릴리즈 일자 — npm 페이지에서 실측 필요
> - pdfme의 CJK 구체 작동 사례 — pdfme.com/docs/custom-fonts 상에서 Korean 명시 여부 확인 필요
> - 각 라이브러리의 Bundlephobia 측정 수치 (본 문서에 적힌 수치는 범위 추정, 구현 Day 1에 재확인)

### 3-2. Electron `webContents.printToPDF()` (2026 API)

`pageSize` 옵션이 A3/A4/A5/Legal/Letter/Tabloid 및 micron 단위 `{width, height}` 객체 지원, `landscape: boolean` 기본값 false, `marginsType: 0|1|2` (0=default, 1=none, 2=minimum) 지원. `@page` CSS at-rule이 있으면 `landscape` 무시됨. 이미 쌤핀 IPC에 연결되어 있으므로 추가 설치 불요.

### 3-3. Noto Sans KR 서브셋 현황

`bek9/notosanskr-light` 기준 KS X 1001 3,432자 서브셋은 **weight별 166~404KB** 범위. Regular + Bold 2종 내장 시 약 **600KB ~ 1MB**(예상, 실측 필요) — 당초 사용자 제시 "~6MB"보다 훨씬 작다. 전체 11,172자 원본은 weight별 773KB~2.5MB. → **본 계획은 서브셋 내장 권장**.

### 3-4. 조사 출처 (§10에 통합 링크 정리)

- npm @pdfme/generator 6.0.6 ([npm](https://www.npmjs.com/package/@pdfme/generator))
- npm pdfjs-dist 5.6.205 ([npm](https://www.npmjs.com/package/pdfjs-dist))
- pdf-lib maintenance ([Discussion #1346](https://github.com/Hopding/pdf-lib/discussions/1346))
- pdf-lib PDFForm ([docs](https://pdf-lib.js.org/docs/api/classes/pdfform))
- pdfme AcroForm issue ([#1187](https://github.com/pdfme/pdfme/issues/1187))
- @react-pdf Korean 버그 ([#806](https://github.com/diegomura/react-pdf/issues/806), [#2681](https://github.com/diegomura/react-pdf/issues/2681))
- Noto Sans KR 서브셋 ([bek9/notosanskr-light](https://github.com/bek9/notosanskr-light))

---

## 4. 권장 스택 & 근거

### 4-1. 결정: **3-엔진 조합**

| 용도 | 담당 라이브러리 | 근거 |
|------|----------------|------|
| HTML → PDF (정적 인쇄) | **Electron `webContents.printToPDF()`** | Chromium 렌더링 엔진이 이미 번들에 있음. 시스템 폰트 + @font-face 조합으로 한글 문제 없음. 외부 의존 0. |
| 템플릿 + 데이터 주입 | **pdfme (@pdfme/generator)** | TypeScript 네이티브, JSON 템플릿이 도메인 엔티티와 궁합 좋음, 서식 관리 Phase 2의 디자이너 UI와도 호환(@pdfme/ui). 한글 폰트 등록 API 있음. |
| PDF 폼 필드 채움 (mail-merge) | **pdf-lib + @pdf-lib/fontkit** | `PDFForm.getTextField().setText()` 등 AcroForm API가 유일한 표준. `subset: true` 옵션으로 폰트 임베딩 최소화. pdfme는 AcroForm 미지원이므로 대체 불가. |
| 썸네일 미리보기 (선택) | **pdfjs-dist (legacy build)** | Mozilla 공식. Vite 통합은 worker 경로 수동 지정 필요(§5-5 참조). Day 5에 여유 있으면 포함, 없으면 Phase 2로 이월. |

### 4-2. 명시적으로 배제한 것

| 라이브러리 | 배제 근거 |
|-----------|----------|
| @react-pdf/renderer | Noto Sans KR 블랭크 화면 버그 미해결 (#2681), 한글 TTF 호환성 불안정 (#806). 쌤핀 한국어 100% 환경에서 위험 과다 |
| jsPDF + html2canvas | HTML 전환은 Electron의 네이티브 Chromium이 더 정확. 한글 커스텀 폰트 관련 이슈 다수. **중복 기능** |
| puppeteer / puppeteer-core | 독자 Chromium 바이너리(~150MB) 번들 불가. Electron 내부 Chromium으로 대체 가능 |
| pdfkit | pdf-lib가 상위 호환. 폼 필드 지원 부족 |

### 4-3. 번들 영향 예상 합계

| 항목 | 예상 크기 |
|------|----------|
| pdf-lib + fontkit | ~400~500KB (tree-shake 후, **실측 필요**) |
| @pdfme/generator (core만) | ~300~500KB (**실측 필요** — 디자이너 UI는 Phase 2에서 별도 로드) |
| pdfjs-dist (선택) | ~1MB + worker 별도 |
| Noto Sans KR Regular+Bold 서브셋 | ~600KB~1MB |
| **합계 (pdfjs 제외)** | **~1.5~2.5MB** |

쌤핀 인스톨러 ~200MB 대비 1% 내외. 수용 가능.

---

## 5. 아키텍처 설계

### 5-1. Clean Architecture 레이어 배치

```
┌─────────────────────────────────────────────────────────────────┐
│ infrastructure/export/                                          │
│   PdfExporter.ts      — 공개 API (3 메서드)                     │
│   pdf/                                                          │
│     ├── PrintCurrentView.ts   — Electron printToPDF 래퍼        │
│     ├── RenderTemplate.ts     — pdfme 엔진                      │
│     ├── FillFormFields.ts     — pdf-lib + fontkit              │
│     ├── FontRegistry.ts       — Noto Sans KR 로더 (싱글톤)      │
│     └── types.ts              — PdfExporter 인터페이스 타입     │
├─────────────────────────────────────────────────────────────────┤
│ adapters/components/Export/Export.tsx                           │
│   ✅ import { PdfExporter } from '@infrastructure/export'       │
│   ❌ window.electronAPI.printToPDF() 직접 호출 금지             │
└─────────────────────────────────────────────────────────────────┘
```

**의존성 규칙 준수:**
- `PdfExporter` 모듈은 `infrastructure/` 내부에 위치 (Electron API·파일 I/O와 맞닿음).
- `domain/entities/*`를 **인자로 받되 import만 하고**, 저장은 `IStoragePort` 호출자(adapters 레이어)의 책임.
- `adapters → infrastructure` 방향 import만 허용. 역방향 없음.

### 5-2. 공개 인터페이스 (TypeScript)

```ts
// src/infrastructure/export/pdf/types.ts
import type { Student } from '@domain/entities/Student';
import type { StudentRecord } from '@domain/entities/StudentRecord';

/** PDF 페이지 크기 옵션 (Electron printToPDF와 호환) */
export type PdfPageSize = 'A4' | 'A3' | 'Letter' | { width: number; height: number };

/** 공통 PDF 생성 옵션 */
export interface PdfOptions {
  pageSize?: PdfPageSize;       // 기본 'A4'
  landscape?: boolean;           // 기본 false
  marginsType?: 0 | 1 | 2;       // Electron 호환 (default/none/minimum)
  title?: string;                // PDF 메타데이터 Title
  author?: string;               // 기본 '쌤핀'
}

/** 템플릿 렌더용 인풋 (pdfme 스키마 호환) */
export interface PdfTemplateInput {
  template: PdfTemplateSchema;   // pdfme Template 타입 re-export
  inputs: Array<Record<string, string>>;  // 각 요소 = 1 페이지
}
export type PdfTemplateSchema = unknown; // @pdfme/common의 Template 타입을 re-export로 좁힘

/** 폼 필드 채움 인풋 */
export interface PdfFormFillInput {
  sourcePdf: ArrayBuffer;                       // AcroForm이 있는 원본 PDF
  rows: Array<Record<string, string | boolean>>; // 각 row = 1명분 (mail-merge)
  fieldMap?: Record<string, string>;            // { 학생명: 'name', 학번: 'id' } 같은 별칭
}
```

```ts
// src/infrastructure/export/PdfExporter.ts
import type {
  PdfOptions,
  PdfTemplateInput,
  PdfFormFillInput,
} from './pdf/types';

export interface PdfExporter {
  /**
   * 현재 렌더된 화면을 PDF로 저장.
   * Electron 환경: webContents.printToPDF()
   * 브라우저 환경: window.print() + null 반환
   */
  printCurrentView(options?: PdfOptions): Promise<ArrayBuffer | null>;

  /**
   * 템플릿 + 데이터로 새 PDF 생성 (pdfme 기반).
   * 예: 학생 기록부 템플릿 + students[] → PDF
   */
  renderTemplate(input: PdfTemplateInput, options?: PdfOptions): Promise<ArrayBuffer>;

  /**
   * 기존 AcroForm PDF에 값 주입 (pdf-lib 기반).
   * mail-merge: rows 길이만큼 페이지를 복제하며 각 페이지의 폼 필드를 채움.
   * 반환은 하나의 합쳐진 PDF ArrayBuffer (페이지 append 방식).
   */
  fillFormFields(input: PdfFormFillInput, options?: PdfOptions): Promise<ArrayBuffer>;
}

export function createPdfExporter(): PdfExporter {
  return {
    printCurrentView: (opts) => import('./pdf/PrintCurrentView').then((m) => m.printCurrentView(opts)),
    renderTemplate:   (inp, opts) => import('./pdf/RenderTemplate').then((m) => m.renderTemplate(inp, opts)),
    fillFormFields:   (inp, opts) => import('./pdf/FillFormFields').then((m) => m.fillFormFields(inp, opts)),
  };
}
```

**설계 포인트**:
- `createPdfExporter()` 팩토리 + 동적 import(`import()`)로 **트리쉐이킹**. pdfme나 pdf-lib을 쓰지 않는 사용자는 해당 청크를 로드하지 않음.
- 팩토리 패턴은 DI 컨테이너와의 통합 여지 확보 (`adapters/di/container.ts`에 주입 가능).
- 하위 호환성 유지: 기존 `exportToPdf()`는 `createPdfExporter().printCurrentView()` 래퍼로 한 줄 유지 (barrel `index.ts`에서 re-export).

### 5-3. 폰트 로더 설계

```ts
// src/infrastructure/export/pdf/FontRegistry.ts
import fontkit from '@pdf-lib/fontkit';
import type { PDFDocument, PDFFont } from 'pdf-lib';

let cached: { regular: ArrayBuffer; bold: ArrayBuffer } | null = null;

/** 번들에 포함된 Noto Sans KR 서브셋을 한 번만 fetch 하여 캐시 */
export async function loadKoreanFontBuffers(): Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> {
  if (cached) return cached;
  const [regRes, boldRes] = await Promise.all([
    fetch(new URL('/fonts/NotoSansKR-Regular.subset.otf', window.location.origin)),
    fetch(new URL('/fonts/NotoSansKR-Bold.subset.otf', window.location.origin)),
  ]);
  cached = {
    regular: await regRes.arrayBuffer(),
    bold: await boldRes.arrayBuffer(),
  };
  return cached;
}

/** pdf-lib 문서에 한글 폰트 등록 (subset embed) */
export async function embedKoreanFonts(doc: PDFDocument): Promise<{ regular: PDFFont; bold: PDFFont }> {
  doc.registerFontkit(fontkit);
  const buffers = await loadKoreanFontBuffers();
  const regular = await doc.embedFont(buffers.regular, { subset: true });
  const bold = await doc.embedFont(buffers.bold, { subset: true });
  return { regular, bold };
}
```

### 5-4. 사용 예 (Export.tsx 리팩터링 후)

```ts
// src/adapters/components/Export/Export.tsx  (after)
import { createPdfExporter } from '@infrastructure/export';

// ... (기존 로직 내부)
} else if (selectedFormat === 'pdf') {
  const pdf = createPdfExporter();
  const buf = await pdf.printCurrentView({ pageSize: 'A4', landscape: item === 'seating' });
  if (buf) {
    data = buf;
    defaultFileName = item === 'seating' ? '학급자리배치도.pdf' : '학교일정.pdf';
  } else {
    continue; // 브라우저 환경: window.print() 이미 호출됨
  }
}
```

### 5-5. Vite + Electron 빌드 통합

- `public/fonts/NotoSansKR-Regular.subset.otf` 등으로 배치. Vite는 `public/` 경로를 dev·build 모두에서 정적 자산으로 취급.
- `electron-builder.json`의 `extraResources`는 **추가 불필요** — Vite가 이미 `dist/` 출력에 포함시키고 electron-builder가 이를 app.asar에 묶음.
- pdfjs-dist worker는 (포함 시) `import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'`로 처리.

---

## 6. 한글 폰트 처리 방안

### 6-1. 결정 사항

| 항목 | 결정 |
|------|------|
| 폰트 선택 | **Noto Sans KR** (SIL OFL 1.1, 상업 배포 자유) |
| 포함 weight | **Regular (400) + Bold (700)** 2종 |
| 글리프 범위 | **KS X 1001 2,350자 + 영문/숫자/기호** (bek9 방식) |
| 포맷 | OTF (pdf-lib/fontkit는 OTF와 TTF 둘 다 지원). 단 pdfme가 TTF만 받는 경우 TTF로 전환 — **Day 1에 실측 후 확정** |
| 배포 | Vite `public/fonts/` → app.asar 자동 포함, 런타임 `fetch()`로 로드 |
| 네트워크 | **오프라인 완전 동작 원칙 준수**, CDN/런타임 다운로드 **금지** |

### 6-2. 서브셋 생성 절차 (1회성 작업, Day 1 수행)

```bash
# pyftsubset (fonttools) 사용 — 1회성으로 개발자 로컬에서 실행
pip install fonttools brotli
pyftsubset NotoSansKR-Regular.otf \
  --unicodes-file=ksx1001.txt \
  --output-file=NotoSansKR-Regular.subset.otf \
  --layout-features='*' \
  --no-hinting
pyftsubset NotoSansKR-Bold.otf \
  --unicodes-file=ksx1001.txt \
  --output-file=NotoSansKR-Bold.subset.otf \
  --layout-features='*' \
  --no-hinting
```

- `ksx1001.txt`는 bek9/notosanskr-light 저장소나 KS X 1001 표준에서 가져옴.
- 생성된 파일을 `public/fonts/`에 커밋. `scripts/build-font-subset.mjs`에 절차를 README로 남겨 재생성 가능성 확보.

### 6-3. pdfme의 폰트 등록 예

```ts
import { generate } from '@pdfme/generator';
import { loadKoreanFontBuffers } from './FontRegistry';

export async function renderTemplate(input, options) {
  const { regular, bold } = await loadKoreanFontBuffers();
  const font = {
    NotoSansKR: { data: regular, fallback: true },
    'NotoSansKR-Bold': { data: bold },
  };
  const pdf = await generate({
    template: input.template,
    inputs: input.inputs,
    options: { font },
  });
  return pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
}
```

### 6-4. 리스크: pdfme의 한글 CJK 실제 작동

pdfme가 커스텀 폰트 API를 제공한다는 사실은 확인되었으나, **Korean 특정 동작 사례 문서가 부족**하다. Day 2 구현 착수 시점에 **5분 POC**(간단한 템플릿 + 한글 데이터 → PDF)로 먼저 검증하고, 실패하면 §9-1의 대응책 발동.

---

## 7. 구현 단계 (5일 일정)

### Day 1 — 스캐폴드 & 의존성 + 폰트 준비

| 작업 | 검증 기준 |
|------|----------|
| npm install: `pdf-lib`, `@pdf-lib/fontkit`, `@pdfme/generator`, `@pdfme/common` | `package.json` 업데이트, `npx tsc --noEmit` 에러 0 |
| `src/infrastructure/export/pdf/` 디렉터리 + types.ts + 빈 스텁 파일들 생성 | `import type { PdfExporter }` 가 컴파일 됨 |
| Noto Sans KR 서브셋 2종 생성 및 `public/fonts/` 커밋 | 파일 존재, 크기 합계 1MB 이하 실측 기록 |
| `FontRegistry.ts` 구현 + 단위 테스트 | `loadKoreanFontBuffers()` 가 ArrayBuffer 2개 반환 (mock fetch 기반 테스트) |
| pdfme + 한글 폰트 POC 스크린샷 | Hello + "안녕하세요" 1장짜리 PDF가 생성되어 저장 가능 |

**체크포인트**: 이 날의 POC가 실패하면 §9-1 plan B로 전환. 성공 시에만 Day 2 진입.

### Day 2 — `printCurrentView()` 구현 & Export.tsx 리팩터링

| 작업 | 검증 기준 |
|------|----------|
| `PrintCurrentView.ts` 구현 (기존 IPC 래핑 + options 전달) | 기존 `Export.tsx`에서 좌석배치 PDF 저장 성공 |
| `Export.tsx:206` 직접 호출 제거 → `createPdfExporter().printCurrentView()` | `adapters → infrastructure` 경로만 남음, lint no-restricted-imports 통과 |
| `index.ts`의 `exportToPdf` export 유지(호환) 또는 deprecation 주석 | 기존 API가 한 줄 래퍼로 유지 |
| E2E 수동 테스트: `npm run electron:dev` → 좌석배치 PDF 저장 | 바이트 동일 또는 더 나은 품질 |

### Day 3 — `fillFormFields()` 구현 (pdf-lib)

| 작업 | 검증 기준 |
|------|----------|
| `FillFormFields.ts` 구현: PDFDocument.load → form 조회 → row별 페이지 복제 + setText | Vitest: 샘플 AcroForm PDF(픽스처) + rows 3개 → 페이지 수 3, 각 페이지 필드 값 일치 |
| `fieldMap` 별칭 로직 (예: `{ '학생명': 'name' }`) | 한글 필드명도 매핑 가능 |
| 한글 폰트 임베딩 (setFont + subset) | 폼 필드에 "홍길동" 렌더링이 정상 |
| 에러 경로: 원본 PDF에 AcroForm이 없으면 명시적 throw | 에러 메시지가 서비스 레이어에서 toast로 노출 가능 |

### Day 4 — `renderTemplate()` 구현 (pdfme)

| 작업 | 검증 기준 |
|------|----------|
| `RenderTemplate.ts`: pdfme `generate()` 호출 + 폰트 주입 | Vitest: mini 템플릿 JSON + inputs 2개 → 2페이지 PDF 바이트 반환 |
| pdfme Template 타입을 `PdfTemplateSchema`로 re-export | TypeScript 엄격 모드 통과 |
| 도메인 Presenter 추가 (예: `adapters/presenters/pdfTemplatePresenter.ts`): `Student[]` → pdfme inputs 변환 | 변환 함수 단위 테스트 |

### Day 5 — 테스트 보강 + 문서화 + 선택 썸네일

| 작업 | 검증 기준 |
|------|----------|
| Vitest `PdfExporter.test.ts` 작성: 3 메서드 × 각 2케이스(성공/에러) | 테스트 6개 통과 |
| `npx tsc --noEmit` 에러 0 | CI 통과 |
| 번들 사이즈 측정 (`vite build` 전후 비교) | dist 사이즈 증가분 기록 |
| (선택) `pdfjs-dist` 썸네일 프로토타입 | 여유 있으면 Day 5 오후, 없으면 Phase 2 이월 |
| `docs/계획_PDF-Exporter.md` → `docs/완료_PDF-Exporter.md` 이름 변경 + 실제 결과 기록 | 계획과 실제 차이 섹션 추가 |

---

## 8. 테스트 전략 (Vitest)

### 8-1. 테스트 파일 위치 & 네이밍

`src/infrastructure/export/pdf/*.test.ts` — `ExcelExporter.test.ts` 규약과 동일.

### 8-2. 테스트 대상 & 픽스처

| 메서드 | 핵심 검증 | 픽스처 |
|--------|----------|--------|
| `printCurrentView` | Electron 환경 mock (`window.electronAPI.printToPDF`)에서 ArrayBuffer 반환, 브라우저 환경에서 `window.print` 호출 + null 반환 | jsdom + vi.mock |
| `renderTemplate` | 최소 템플릿 + 한글 입력 → PDF 헤더(`%PDF-`)로 시작하는 바이트 반환 | pdfme 스키마 minimal JSON |
| `fillFormFields` | 샘플 AcroForm PDF(test-fixtures에 1개 커밋) + 2행 입력 → 2페이지, 각 페이지 필드 값 조회 가능 | `test/fixtures/acroform-sample.pdf` (1회 생성 후 커밋) |
| `FontRegistry` | fetch mock → regular/bold 2개 ArrayBuffer 캐시 | vi.mock('fetch') |

### 8-3. Red Flags (Addy Osmani 철학 적용)

- "바이트가 돌아오니까 검증됨" 이라고 끝내지 말 것. 실제로 **PDF.js나 Adobe Reader에서 열어 한글 깨짐 없는지** 수동 확인 절차를 체크리스트에 포함.
- 폼 필드 채움 테스트는 생성된 PDF를 **다시 pdf-lib로 파싱**하여 값이 들어갔는지 조회. "setText 호출됨" 수준의 단언은 금지.
- pdfme가 "폰트 등록 성공" 로그만 내고 실제로는 한글이 박스로 렌더링될 수 있음. **실제 PDF를 열어 스크린샷 첨부** 단계를 Day 4 완료 조건에 포함.

---

## 9. 리스크 & 완화

### 9-1. [HIGH] pdfme가 Noto Sans KR과 결합했을 때 한글 렌더링 실패

| 구분 | 내용 |
|------|------|
| 증상 예상 | 글자가 ▯로 표시되거나 PDF가 비어있음 |
| 원인 후보 | OTF vs TTF 호환성, CJK glyph substitution 미처리, pdfme 내부의 pdf-lib fork가 subset 미지원 |
| 완화 | Day 1 POC로 즉시 검증. 실패 시 **Plan B**: `renderTemplate`을 pdfme 대신 **pdf-lib 직접 구현**으로 전환 (pdfme 제거). 템플릿 디자이너 UI 연동은 Phase 2로 이월. |
| 신호 감지 | Day 1 POC 스크린샷에서 한글이 보이지 않으면 즉시 에스컬레이션 |

### 9-2. [MED] Electron `printToPDF`의 `pageSize` micron 검증 실패

| 구분 | 내용 |
|------|------|
| 증상 | 커스텀 사이즈 지정 시 "width_microns minimum 353" 오류 |
| 완화 | A4/A3/Letter 등 프리셋만 v1 지원. 커스텀 사이즈는 Phase 2. |

### 9-3. [MED] `@pdf-lib/fontkit`이 Electron renderer에서 Node 모듈 충돌

| 구분 | 내용 |
|------|------|
| 증상 | `require is not defined` 또는 fontkit 내부 `createCanvas` 오류 |
| 완화 | Vite 설정에서 fontkit을 브라우저 번들 대상으로 명시. 필요 시 `optimizeDeps.include` 추가. Day 1 POC 중 발견하면 설정 보강. |

### 9-4. [LOW] AcroForm PDF의 한글 필드 이름이 PDF 스펙에서 깨짐

| 구분 | 내용 |
|------|------|
| 증상 | `form.getTextField('학생명')`이 undefined 반환 |
| 완화 | `fieldMap`으로 영문 별칭 제공. 내장 서식 10종은 모두 영문 필드명으로 설계 (Phase 2 규약). 사용자 업로드 PDF의 경우 Exporter가 필드명 목록을 미리 읽어서 UI에 표시. |

### 9-5. [LOW] 번들 사이즈 예상 초과

| 구분 | 내용 |
|------|------|
| 증상 | Day 5 측정에서 +5MB 이상 증가 |
| 완화 | pdfme의 plugins를 필요한 것만 명시적으로 import. pdfjs-dist는 Phase 2로 이월. |

---

## 10. 참고 링크 (모두 실측 가능한 URL)

### 라이브러리 공식/저장소
- [pdf-lib 공식 사이트](https://pdf-lib.js.org/)
- [pdf-lib GitHub (Hopding)](https://github.com/Hopding/pdf-lib)
- [pdf-lib PDFForm API](https://pdf-lib.js.org/docs/api/classes/pdfform)
- [@pdf-lib/fontkit npm](https://www.npmjs.com/package/@pdf-lib/fontkit)
- [pdfme 공식](https://pdfme.com/)
- [pdfme GitHub](https://github.com/pdfme/pdfme)
- [pdfme Custom Fonts 문서](https://pdfme.com/docs/custom-fonts)
- [pdfme AcroForm 지원 이슈 #1187](https://github.com/pdfme/pdfme/issues/1187)
- [@pdfme/generator npm](https://www.npmjs.com/package/@pdfme/generator)
- [pdfjs-dist npm](https://www.npmjs.com/package/pdfjs-dist)
- [Mozilla pdf.js](https://github.com/mozilla/pdf.js/)
- [@react-pdf Korean 이슈 #806](https://github.com/diegomura/react-pdf/issues/806)
- [@react-pdf Korean PdfViewer blank 이슈 #2681](https://github.com/diegomura/react-pdf/issues/2681)

### Electron / 빌드
- [Electron webContents API](https://www.electronjs.org/docs/latest/api/web-contents)
- [Electron printToPDF 이슈 #40254](https://github.com/electron/electron/issues/40254)

### 폰트
- [Noto Sans Korean (Google Fonts)](https://fonts.google.com/noto/specimen/Noto+Sans+KR)
- [bek9/notosanskr-light (KS X 1001 서브셋 참고)](https://github.com/bek9/notosanskr-light)
- [TetraTheta/NotoSansKR-subset](https://github.com/TetraTheta/NotoSansKR-subset)
- [Fontkit (내부 엔진)](https://www.npmjs.com/package/@pdf-lib/fontkit)

### 내부 문서 & 코드
- [`src/infrastructure/export/PdfExporter.ts`](../src/infrastructure/export/PdfExporter.ts)
- [`src/infrastructure/export/index.ts`](../src/infrastructure/export/index.ts)
- [`src/infrastructure/export/HwpxExporter.ts`](../src/infrastructure/export/HwpxExporter.ts)
- [`src/infrastructure/export/ExcelExporter.ts`](../src/infrastructure/export/ExcelExporter.ts)
- [`src/infrastructure/export/ExcelExporter.test.ts`](../src/infrastructure/export/ExcelExporter.test.ts)
- [`src/adapters/components/Export/Export.tsx`](../src/adapters/components/Export/Export.tsx) (206행 리팩터링 대상)
- [`src/global.d.ts`](../src/global.d.ts) (35행)
- [CLAUDE.md](../CLAUDE.md) (아키텍처 규칙)
- [위노트 경쟁 분석](./위노트_경쟁분석_노트서식.md)
- [서식 관리 계획서](./계획_서식-관리.md)

---

## 11. 핸드오프 (Plan → Executor)

본 계획 승인 후:

1. `/oh-my-claudecode:start-work 계획_PDF-Exporter` 로 실행
2. Day 1 POC 결과에 따라 Plan A(pdfme) / Plan B(pdf-lib 직접) 분기 결정 (executor가 §9-1 체크포인트 통과 여부 보고)
3. Day 5 완료 시 `docs/완료_PDF-Exporter.md`로 rename 후 실제 번들 크기·테스트 결과 기록
4. 내장 서식 10종 제작은 본 계획 범위 밖 — 별도 `계획_서식-관리_Phase2.md`에서 진행

---

## 부록 A — "확인 필요" 항목 체크리스트 (추측 금지 원칙)

Day 1 착수 시점에 executor가 **실측**으로 확정해야 할 항목:

- [ ] pdf-lib 1.17.1 (또는 그 이후) npm 공개 릴리즈 일자
- [ ] @pdfme/generator 6.0.6의 정확한 번들 크기 (Bundlephobia)
- [ ] pdfme의 Korean 렌더링 실제 결과 (POC 스크린샷 첨부)
- [ ] Noto Sans KR Regular+Bold 서브셋 실제 파일 크기
- [ ] pdfjs-dist worker를 Vite + Electron renderer에서 로드하는 경로 (legacy vs modern build)
- [ ] `@pdf-lib/fontkit`의 Electron renderer 호환성 (브라우저 빌드 여부)

이 항목들이 실측 전까지는 계획서 본문의 해당 수치를 "추정값"으로 간주할 것.
