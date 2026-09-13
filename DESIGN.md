# Design

## Source of truth

- Status: Active — 근거 지도 가지형 개선, ADR-111. 기존 앱 전체 디자인 규칙을 대체하지 않는다.
- Last refreshed: 2026-09-13
- Primary product surfaces: 학급 운영·수업 관리 > 생기부 초안 > 근거 정리 > 지도.
- Evidence reviewed: `docs/design-system.md`, `.impeccable.md`, `docs/architecture-rules.md`, `docs/coding-conventions.md`, ADR-103·106~109의 관련 결정 및 현재 지도 소스, 기존 실행 기록과 `tmp/e2e/map-scenelinks-1.png`·`map-scenelinks-2.png`, `design examples/ssampin_memo_and_notes_screen/screen.png`, 사용자 제공 Manyfast 이미지 3장, https://manyfast.io/ko/.
- 상세 계약: [근거 지도 비교·개선 설계](docs/02-design/features/record-evidence-map-manyfast.design.md). 근거·미검증 범위는 그 문서 §1을 따른다.
- Draft extension (2026-09-13): [여러 학생의 AI 지도 제안](docs/02-design/features/record-evidence-map-batch-ai.design.md). 대상 학생·확인 간격·뼈대 정책을 분리하고 학생별 검토 후 적용한다. 구현·실제 AI·사용성은 미검증이며 기존 Active 계약을 대체하지 않는다.

## Brand

- Personality: 신뢰감 있는, 깔끔한, 따뜻한.
- Trust signals: 원본 출처 유지, 교사 메모와 AI 제안 구분, 저장 상태와 되돌리기.
- Avoid: 반복된 큰 테두리, 네온, 장식용 스티커, 모든 카드를 같은 중요도로 강조하기.

## Product goals

- Goals: 지도에서 주제·장면·근거·메모의 관계를 읽고 필요한 부분만 고친 뒤 초안으로 이어 간다.
- Non-goals: 범용 마인드맵 앱, 근거 간 임의 화살표 편집기, 새 AI 문장 생성 정책.
- Success signals: 기본 크기로 주제와 장면을 읽을 수 있음, 메모 존재뿐 아니라 내용 일부가 보임, 한 번의 선택으로 근거 전문 확인.

## Personas and jobs

- Primary personas: 담임교사와 교과교사.
- User jobs: 모은 근거의 묶음 확인, 장면 간 연결 확인, 해석 메모 확인·수정, 초안에 쓸 근거 결정.
- Key contexts of use: Windows 노트북·데스크톱, 짧은 업무 시간, 학생별 왕복 작업.

## Information architecture

- Primary navigation: 기존 진입 경로와 학생·수업반·영역을 유지한다.
- Core routes/screens: 같은 근거 지도 안에서 가지를 접고 펼친다. 개요·편집을 별도 모드로 만들지 않는다.
- Content hierarchy: 학생 → 주제 → 장면 → 근거. 메모는 소유 대상에 붙인다.

## Design principles

- 결과를 먼저 보여 준다: 빈 칸과 편집 안내는 선택 후 나타난다.
- 읽을 수 있는 조망: 글자 축소보다 가지 접기를 우선한다.
- 뜻이 다른 선은 다르게 그린다: 소속은 화살촉 없는 곡선, 장면 순서는 방향 화살표, 메모는 짧은 점선.
- Tradeoffs: 모든 근거 전문을 한 화면에 담지 않는다. 접힌 수와 펼치는 길을 항상 제공한다.

## Visual language

- Color: 기존 sp-bg/surface/card/border/text/muted/accent/highlight. 메모도 테마 토큰으로 표현한다.
- Typography: 사용자 선택 폰트 유지, 기본 제목·본문 14px, 출처 12px, 행간 1.5. 중요 내용의 실제 표시 크기를 줄여 맞추지 않는다.
- Spacing/layout rhythm: 4px 배수, 카드 안 12~16px, 세로 간격 16~24px, 가지 간격 48~64px.
- Shape/radius/elevation: 기존 rounded-xl, 얇은 테두리·절제된 그림자. 큰 주제 외곽 상자는 제거한다.
- Motion: 선택한 가지가 보이는 최소 이동, 불필요한 전체 화면 재정렬 금지.
- Imagery/iconography: 기존 Material Symbols. 점 배경은 약하게, 의미 전달은 텍스트로 한다.

## Components

- Existing components to reuse: EvidenceMapView/Node/SidePanel, 기존 원본 비교·가져오기·저장 기능.
- New/changed components: 주제 노드, 장면 노드, 메모 부착 표시, 가지 접기, 선택 영역 중심 이동.
- Variants and states: 상세 설계 §4~7. 근거 선택과 초안 포함 선택은 분리한다.
- Token/component ownership: 기존 디자인 토큰을 사용하고 지도 크기 상수는 지도 표시 계층에서 관리한다.

## Accessibility

- Target standard: 프로젝트 접근성 기준 유지, 키보드만으로 동일 작업이 가능하도록 검증한다.
- Keyboard/focus behavior: Tab 이동, Enter 상세, 방향키로 가지 이동, Esc 상세 닫기, 명시적 메뉴로 장면 배치·순서 변경.
- Contrast/readability: 색만으로 종류·제외 상태를 구분하지 않는다. 밝음·어두움·유리 모드에서 읽기 검증.
- Screen-reader semantics: 주제/장면 이름, 근거 수, 접힘 상태를 읽는다. 기존 보드 보기도 유지한다.
- Reduced motion and sensory considerations: 시스템 동작 줄이기 설정에서 화면 이동 애니메이션 생략.

## Responsive behavior

- Supported breakpoints/devices: 1280×800, 1440×900, 1920×1080 및 Windows 배율 125/150% 검증 예정.
- Layout adaptations: 기본 집중 공간에서 상위 메뉴를 짧은 경로로 접고 복귀 시 복원. 좁으면 근거 가지를 접고 내용 글자 크기는 유지한다.
- Touch/hover differences: hover로만 나오는 조작도 포커스·메뉴로 접근 가능하게 한다.

## Interaction states

- Loading: 학생 맥락과 제목 유지, 부분 로딩 표시.
- Empty: 근거 추가 한 입구. 빈 장면은 작은 노드, 자리 미정 0건은 숨김.
- Error: 입력과 제안 유지, 재시도 제공. 저장 성공 전 성공 표시 금지.
- Success: 저장 확인과 되돌리기. 가지 위치를 갑자기 바꾸지 않는다.
- Disabled: 저장 중 중복 적용 방지, 마친 주제는 읽기 가능.
- Offline/slow network: 지도·메모는 로컬 사용, AI 상태만 별도 표시.

## Content voice

- Tone: 짧고 구체적인 한국어.
- Terminology: 주제, 장면, 근거, 메모, 이음말. 노드·엣지는 제품 설명에 노출하지 않는다.
- Microcopy rules: 빈 곳마다 ‘추가’ 안내를 반복하지 않는다. 초안에 쓰는 수와 접힌 수를 혼동하지 않게 한다.

## Implementation constraints

- Framework/styling system: Electron + React + TypeScript + Tailwind + Zustand, 기존 4레이어 경계 유지.
- Design-token constraints: HEX 하드코딩 및 별도 테마 금지.
- Performance constraints: 200근거 합성 자료로 접기·확대·선택 부하 측정 후 판정.
- Compatibility constraints: threadId 소유, scenes 차례, evidenceIds 차례, 메모 원본, 기존 links 자료를 표시 변경으로 수정하지 않는다.
- Test/screenshot expectations: 로컬 구현·네 검증 게이트·브라우저 두 경로를 검증했다. 구체 결과와 미검증 범위는 docs/progress/2026-09.md를 따른다.

## Open questions

- [x] 사용자 시각 검토: 가지형 배치가 장면 열보다 이해하기 쉬운가? 사용자가 예시 방향을 승인하고 구현을 요청함.
- [ ] 교사 사용성 검증: 첫 진입에서 펼칠 근거 개수는 제안값(장면당 2건)으로 시작해 조정한다.
- [ ] 일반 보기와 집중 보기의 복귀 경험은 Windows 실제 앱에서 확인한다.
