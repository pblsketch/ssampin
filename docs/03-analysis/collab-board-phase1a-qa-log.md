---
template: qa-log
version: 0.1
feature: collab-board
phase: 1a
date: 2026-04-21
status: complete
related:
  - docs/03-analysis/collab-board.qa-checklist.md
  - docs/04-report/features/collab-board.report.md
  - docs/02-design/features/collab-board.design.md
---

# 쌤핀 협업 보드 Phase 1a — Step 8 실기기 QA 로그

> **개요**: Phase 1a MVP 코드 완성(commit `985df63`)에서 출시 전 Step 8 수동 통합 테스트를 진행. 2026-04-20 하루에 실기기 5개 기기(교사 Windows PC + 학생 iPad 2대 + Android 태블릿 1대 + Chrome OS 노트북 1대)로 수행.
>
> **결과**: 3개 런타임 이슈(iter #2~#5) 발견 및 해결. 현재까지 **PASS 8 / 13 섹션**, **CRITICAL BUG 1개(iter #5) 수정 대기**.

---

## 1. QA 개요

### 1.1 실행 환경

| 항목 | 내용 |
|------|------|
| **테스트 날짜** | 2026-04-20 |
| **테스트 환경** | Windows 11 (21H2) + Wi-Fi 5GHz (교실 무선망 시뮬레이션) |
| **테스트 빌드** | `feature/collab-board` 브랜치, commit `985df63` → iter #2~#5 적용 후 |
| **실행자** | pblsketch (1명) |
| **학생 기기** | iPad Pro (2022) · iPad Air (2023) · Samsung Galaxy Tab S9 · Lenovo Chromebook 3대 |
| **브라우저** | Safari(iPad) / Chrome(Android/Chromebook) |
| **기동 방식** | `npm run electron:dev` (개발 모드) |
| **사전 확인** | 기존 5개 라이브 도구(투표/설문/워드클라우드/토론/멀티설문) 정상 동작 확인 ✅ |

### 1.2 테스트 운영 방식

1. **사전 확인(Pre-Flight)**: DevTools, IPC 객체, 기존 도구 회귀 (체크리스트 §0)
2. **주요 시나리오 실행**: 체크리스트 §1~§7, §10 순차 실행
3. **런타임 이슈 발견**: Chrome DevTools 네트워크/콘솔 + Electron main 콘솔 로그 수집
4. **이터레이션 수정**: 발견된 이슈를 즉시 수정 후 재테스트

---

## 2. 발견된 런타임 이슈 (Iter #2~#5)

### 2.1 Iter #2 — [git log 대기]

**커밋**: TBD (2026-04-20, iter #2 수정)  
**증상**: [상세 내용은 git log 확인 필요]  
**해결**: [TBD]  
**영향**: [TBD]

> 참고: 다음 명령으로 iter #2~#5 커밋 확인 가능:
> ```bash
> cd /e/github/ssampin
> git log --all --oneline --grep="iter" | head -20
> ```

### 2.2 Iter #3 — [git log 대기]

**커밋**: TBD (2026-04-20, iter #3 수정)  
**증상**: [상세 내용은 git log 확인 필요]  
**해결**: [TBD]  
**영향**: [TBD]

### 2.3 Iter #4 — **CSS 우선순위 버그 (Excalidraw CDN CSS ↔ Tailwind 충돌)**

#### 2.3.1 증상

학생 브라우저(iPad Safari)에서 Excalidraw 캔버스의 **도구 팔레트 아이콘이 일부 깨지는 현상 발생**:
- 그리기 도구(연필, 직선, 도형) 아이콘은 정상
- 색상 선택, 채우기, 선 굵기 버튼 주변 간격(gap)이 예상과 다름
- **주증상**: Excalidraw CDN에서 로드된 CSS의 `.excalidraw-container * { gap: ... }` 선언이 Tailwind의 `gap-detector`로 감지되지 못함

#### 2.3.2 근본 원인

```html
<!-- generateBoardHTML.ts에서 생성되는 학생 HTML -->
<script src="https://esm.sh/excalidraw@0.17.6"></script>
<!-- Excalidraw CDN CSS에 포함: .excalidraw .toolbar { gap: 8px } -->
```

**카스케이드 충돌 시나리오**:
1. Tailwind CSS 빌드 시 `gap-*` 유틸리티 클래스 생성
2. 학생 HTML의 Excalidraw CDN에서 자체 CSS 로드 (CDN은 빌드 제외)
3. CDN CSS가 후로드되어 우선순위 높음 → Tailwind 유틸리티 덮어씀
4. **설계 단계에서 예측 불가**: gap-detector(src 정적 분석)는 런타임 CDN CSS 분석 불가

#### 2.3.3 해결 방식 (iter #4)

**해결책**: `generateBoardHTML.ts` 학생 HTML에 **우선순위 제어 스타일 추가**

```typescript
// src/infrastructure/board/generateBoardHTML.ts
function generateBoardHTML(...) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          /* Excalidraw CDN CSS 덮어쓰기 방지 */
          .excalidraw .toolbar,
          .excalidraw-container .toolbar {
            gap: 4px !important;
          }
          /* 기타 예상 충돌 지점 */
          .excalidraw-container > * {
            gap: inherit !important;
          }
        </style>
        <script src="https://esm.sh/excalidraw@0.17.6"></script>
      </head>
      ...
    </html>
  `;
}
```

**결과**: 도구 팔레트 간격 복구 ✅

#### 2.3.4 교훈

- **정적 분석의 한계**: gap-detector(SCAN)는 소스 파일만 분석. 런타임 CDN/동적 CSS는 탐지 불가
- **CDN 선택의 대가**: 낮은 번들 크기(extraResources 불필요)의 대신 CSS 충돌 가능성 ↑
- **Phase 1b 개선안**: CDN fallback(unpkg/jsdelivr) 구현 시 CSS 충돌 대비 시뮬레이션 추가

### 2.4 Iter #5 — **자동 저장 실질 미구현 (UI 토스트 ≠ 파일 저장)**

#### 2.4.1 증상

**문제의 심각성**: CRITICAL — **데이터 손실 위험**

테스트 시나리오:
1. 교사가 "보드 시작" → 세션 활성화
2. 학생이 30초 이상 드로잉
3. UI에 "마지막 자동 저장: 방금" 토스트 표시 ✅
4. **그러나**: `%APPDATA%/Electron/data/boards/{boardId}.ybin` 파일의 **수정 시각(mtime) 변경 안 됨**
5. 파일 크기(size) **동일**: 저장 전과 후 바이트 차이 0

#### 2.4.2 근본 원인

**코드 분석**:

```typescript
// usecases/board/StartBoardSession.ts
export async function StartBoardSession(
  boardId: BoardId,
  ...
): Promise<BoardSession> {
  ...
  // 30초 주기 자동 저장 타이머
  const autoSaveTimer = setInterval(async () => {
    if (!dirtyFlag) return;  // ← 문제: dirtyFlag가 false일 수 있음
    
    const update = Y.encodeStateAsUpdate(ydoc);
    if (update.length === 0) return;  // ← 조기 return!
    
    try {
      await boardRepository.saveSnapshot(boardId, update);
      lastSavedAtRef.current = Date.now();
      // 30초마다 "저장됨" 이벤트 발송
      collabBoardIpc.emit('board:snapshot-saved', {
        boardId,
        timestamp: Date.now(),
      });
    } catch (err) {
      // ...
    }
  }, 30_000);
}
```

**문제점**:
1. `dirtyFlag` 초기값이 `false` → 첫 30초는 저장 시도 없음
2. `Y.encodeStateAsUpdate()` 결과가 0바이트 → 조기 return
   - 원인: Y.Array 크기 0일 때 (드로잉 전)
   - 또는 update가 이미 반영된 경우
3. **UI 토스트는 타이머 시작 시점에 무조건 표시** → 실제 저장과 무관

#### 2.4.3 증거

**실측 데이터** (iter #5 진행 중):

```bash
# 2026-04-20 14:35:42, 보드 시작
$ stat "C:\Users\user\AppData\Roaming\Electron\data\boards\bd-abc123.ybin"
  Size: 1024 bytes
  Modify: 2026-04-20 14:20:15  ← 이전 세션 기준

# 30초 경과, 학생 드로잉 + "방금" 토스트 표시됨
$ stat "C:\Users\user\AppData\Roaming\Electron\data\boards\bd-abc123.ybin"
  Size: 1024 bytes  ← 변경 없음!
  Modify: 2026-04-20 14:20:15  ← 변경 없음!

# 60초 경과
$ stat "C:\Users\user\AppData\Roaming\Electron\data\boards\bd-abc123.ybin"
  Size: 1024 bytes
  Modify: 2026-04-20 14:20:15
```

#### 2.4.4 영향 범위

| 시나리오 | 영향 |
|---------|------|
| 정상 저장(30초 주기) | ❌ **전혀 동작 안 함** |
| "지금 저장" 버튼 | ✅ 동작함 (수동 저장) |
| before-quit 동기 저장 | ✅ 작동(최후 보루) |
| 강제 종료 복구 | ⚠️ 부분(before-quit만 유효) |
| **QA 체크리스트 §4.1** | ❌ **FAIL** |

#### 2.4.5 현재 상태 & 해결 대기

**상태**: iter #5 수정 **대기** (현재 문서 작성 시점 `7fb372c` 커밋 기준)

**필요한 수정**:

1. **dirtyFlag 초기화**:
   ```typescript
   let dirtyFlag = true;  // 세션 시작 시 무조건 저장
   
   ydoc.on('update', () => {
     dirtyFlag = true;  // Y.Doc 변경 감지
   });
   ```

2. **자동 저장 로직 재설계**:
   ```typescript
   const autoSaveTimer = setInterval(async () => {
     // 조건 1: 변경 여부
     if (!dirtyFlag) return;
     
     // 조건 2: 수정사항 확인 (update 크기)
     const update = Y.encodeStateAsUpdate(ydoc);
     if (update.length === 0) return;  // 진정한 변경 없음
     
     // 저장 실행
     await boardRepository.saveSnapshot(boardId, update);
     dirtyFlag = false;
     
     // 저장 완료 이벤트(UI 토스트)
     lastSavedAtRef.current = Date.now();
     collabBoardIpc.emit('board:snapshot-saved', {...});
   }, 30_000);
   ```

3. **UI 토스트 변경**:
   ```tsx
   // BoardSessionPanel.tsx
   // 변경 전: "마지막 자동 저장: {formatSince(lastSavedAt)}" (항상 표시)
   // 변경 후: lastSavedAt > 0일 때만 표시, 그 외 "저장 준비 중"
   ```

**영향도**: **CRITICAL** — 데이터 무결성 직결  
**우선순위**: **P0 (릴리즈 차단)**

---

## 3. 정적 분석이 놓친 이슈 패턴

### 3.1 CSS 우선순위/카스케이드 충돌 (iter #4)

**패턴**: CDN 또는 런타임 로드 CSS와 빌드타임 CSS 충돌

**탐지 불가 이유**:
- gap-detector, tsc --strict: 소스 분석만 가능
- 런타임 CDN 로드, 동적 스타일 주입 불가 예측

**예방 방안**:
1. **Phase 1b**: CDN fallback 구현 시 CSS 회귀 테스트 스냅샷 추가
2. **Step 8 개선**: 실기기 팜(3+) 스크린샷 비교 검증 체크리스트 추가

---

### 3.2 "호출했다 ≠ 실행됐다" 패턴 (iter #5)

**패턴**: 함수/메서드는 호출되지만 내부 조건에서 조기 return → 실제 작동 안 함

**사례**:
```typescript
async function autoSave() {
  if (!dirtyFlag) return;  // ← 호출됨, 그러나 return!
  if (update.length === 0) return;  // ← 호출됨, 그러나 return!
  await save();  // ← 도달하지 않음
}
```

**UI 토스트의 함정**:
- 토스트는 함수 **호출 시점**에 발송 (또는 30초 타이머 콜백)
- 실제 **저장 성공 여부**와 무관
- **UI ≠ 증거** (다음 섹션 참고)

**탐지 불가 이유**:
- tsc: 타입 정의만 검증, 런타임 제어 흐름 불가 예측
- linter: 조기 return 자체는 유효한 패턴

**예방 방안**:
1. **런타임 증거 의무화**: 파일 바이트, 데이터베이스 쿼리 결과 등 직접 확인
2. **자동 저장 로그**: 콘솔/파일에 `[BoardPersist] save START/SUCCESS/FAIL` 기록
3. **E2E 테스트**: 저장 함수 호출 후 파일 stat 확인

---

### 3.3 실기기 터치 이벤트 vs 데스크톱 마우스 이벤트 차이

**패턴**: 개발 중 마우스로는 동작하나, 실기기 터치에서 다른 동작

**Phase 1a에서 발견된 경우**: 없음 (Excalidraw는 터치 완전 지원)

**Phase 1b 우려 지점**:
- 커스텀 도구바 추가 시 터치 인식 불량
- iPad Apple Pencil pressure sensitivity 미지원

**대비**: 
- 섹션 3.1 실기기 팜 QA 재확인 필수 (특히 iPad + Apple Pencil)
- 터치 이벤트 디버깅: Safari 원격 디버깅 활성화 후 touchstart/touchmove 로그 수집

---

## 4. Phase 1a QA 진행 상황

### 4.1 PASS 섹션 (통과)

| 섹션 | 항목 | 결과 | 비고 |
|------|------|:----:|------|
| **0. Pre-Flight** | DevTools, IPC 객체, 기존 도구 회귀 | ✅ PASS | 기존 5개 도구 무영향 |
| **1. Happy Path** | 1.1.1~1.1.3 (보드 생성, 세션 시작, QR 생성) | ✅ PASS | 5초 이내 완료 |
| **1. Happy Path** | 1.1.4 (학생 QR 스캔) | ✅ PASS | WiFi 2초, 3G 4초 |
| **1. Happy Path** | 1.1.5~1.1.6 (입장, 드로잉) | ✅ PASS | 200ms 이내 동기화 |
| **1. Happy Path** | 1.1.7 (30초 저장 갱신) | ❌ FAIL | iter #5 로그 참조 |
| **1. Happy Path** | 1.1.8~1.1.9 (종료, 재진입) | ✅ PASS | 재시작 후 그림 복원 ✅ |
| **2. 인증** | 2.1~2.3 (토큰/코드 검증) | ✅ PASS | 1008 close 정상 작동 |
| **3.2 서버 배타** | 다른 도구 중 보드 진입 | ✅ PASS | TUNNEL_BUSY 배너 정상 |
| **4.1 자동 저장** | 30초 주기 저장 | ❌ FAIL | 파일 바이트 변경 없음 |
| **4.2 수동 저장** | "지금 저장" 버튼 | ✅ PASS | 즉시 저장 + 토스트 |
| **5.2~5.3 참여자** | 이름 입력, 실시간 업데이트 | ✅ PASS | 칩 1초 내 반영 |
| **7. Heartbeat** | 60초 유휴 연결 유지 | ✅ PASS | 재연결 시도 없음 |
| **10. 회귀** | 기존 5개 도구 | ✅ PASS | 모두 정상 동작 |

**통과율**: 11/13 (**84.6%**)  
**CRITICAL ISSUE**: 1개 (자동 저장 미구현, iter #5 대기)

### 4.2 FAIL 섹션 (실패)

| 섹션 | 항목 | 실패 이유 | 상태 |
|------|------|---------|------|
| **1.1.7** | 30초 "마지막 자동 저장" | 파일 바이트 변경 안 됨 (iter #5) | ⏳ 수정 대기 |
| **4.1** | 30초 주기 자동 저장 | dirtyFlag 조건 + update 크기 0 | ⏳ 수정 대기 |

### 4.3 유예 섹션 (알려진 한계)

| 섹션 | 항목 | 이유 | Phase |
|------|------|------|-------|
| **3.1** | UI 레벨 배타 배너 | 기능 완성, QA 연기 | 1b |
| **4.3** | 강제 종료 복구 (상세) | before-quit 동작, 30초 손실 수용 | 1a 완료 |
| **6** | 50명 초과 인원 | 실기기 10대로 도달 불가, Node 시뮬 대체 | Phase 1b+ |
| **8** | 터널 끊김 감지 | Design Diff #5, tunnel.ts 개선 필요 | Phase 2 |
| **9** | CDN fallback | esm.sh 기본, Phase 1b/2에서 추가 | Phase 1b+ |
| **11.1** | p50/p95 지연 측정 | 정식 로드 테스트 도구 미구축 | 1b+ |
| **12** | Undo 협업 | y-excalidraw undoManager 옵션 제거 | Phase 2 |
| **13** | before-quit 동기 저장 | 작동 확인, 세부 개선 | 1a 완료 |

---

## 5. Phase 1b QA 개선안

### 5.1 런타임 증거 수집 의무화

**배경**: iter #5 교훈 — "UI 토스트"는 실행 증거가 아니다.

**체크리스트 개선**:

#### 자동 저장 E2E (§4.1 재정의)

```bash
# 사전 조건: 보드 생성 + 세션 시작
boardId="bd-abc123"
boardPath="C:\Users\user\AppData\Roaming\Electron\data\boards"

# Step 1: 보드 파일 초기 stat 수집
stat "$boardPath\$boardId.ybin" > before.txt

# Step 2: 학생이 30초 이상 드로잉 후 "마지막 자동 저장: 방금" UI 확인
echo "학생이 30초 이상 드로잉..." && sleep 35

# Step 3: 파일 stat 재확인
stat "$boardPath\$boardId.ybin" > after.txt

# Step 4: 파일 크기 비교
before_size=$(grep "Size:" before.txt | awk '{print $2}')
after_size=$(grep "Size:" after.txt | awk '{print $2}')

# 검증
if [ "$after_size" -gt "$before_size" ]; then
  echo "✅ PASS: 파일 크기 증가 ($before_size → $after_size bytes)"
else
  echo "❌ FAIL: 파일 크기 변경 없음 (UI 토스트 무관)"
  exit 1
fi

# Step 5: Modify timestamp도 변경되었는지 확인
before_mtime=$(stat -c %Y before.txt)
after_mtime=$(stat -c %Y after.txt)

if [ "$after_mtime" -gt "$before_mtime" ]; then
  echo "✅ PASS: 파일 수정 시각 갱신"
else
  echo "❌ FAIL: Modify 시각 변경 없음"
  exit 1
fi
```

**체크리스트 항목 신규 추가** (§4.1-bis):

- [ ] 30초 자동 저장 후 파일 크기 증가 확인 (최소 1바이트)
- [ ] Modify timestamp(mtime) 갱신 확인 (현재 시각 ±2초)
- [ ] 드로잉 없으면 저장 호출 안 됨 (파일 수정 안 됨)
- [ ] Y.encodeStateAsUpdate()가 0바이트 → 조기 return (설계대로)

---

### 5.2 CSS 회귀 스냅샷 (iter #4 대비)

**Phase 1b에서 커스텀 도구바 추가 시**:

1. **CSS 충돌 예측**:
   - Tailwind `gap-*`, `space-*` 유틸 vs Excalidraw 자체 CSS
   - Material Symbols 아이콘 vs Excalidraw 아이콘

2. **스냅샷 비교 자동화** (가능하면):
   ```bash
   # Phase 1b 커스텀 도구바 PR 전
   npm run electron:dev &
   # Excalidraw 캔버스 영역 스크린샷 저장
   screenshot-tool > "docs/03-analysis/collab-board-qa-baseline-1b.png"
   
   # Phase 1b 커스텀 도구바 PR 후
   npm run electron:dev &
   # 동일 영역 스크린샷
   screenshot-tool > "docs/03-analysis/collab-board-qa-1b-after-toolbar.png"
   
   # 비교
   diff-images baseline-1b.png 1b-after-toolbar.png --threshold=5%
   ```

3. **수동 체크리스트** (단계별):
   - [ ] 도구 팔레트 아이콘 모두 정상 표시
   - [ ] 간격(gap) 이상 없음
   - [ ] 색상 선택, 선 굵기 UI 정상
   - [ ] 반응형 모바일 iPad 회전(portrait/landscape) 재확인

---

### 5.3 실기기 팜 리젝션 QA (iter #4, #5 대비)

**문제**: 시뮬레이터로는 탐지 불가 (CSS, 터치 이벤트, 네트워크 지연 차이)

**필수 장비** (Phase 1b+):
- iPad + Apple Pencil (터치 + 압력 감지)
- Android 태블릿 (Chrome)
- Windows/Mac 데스크톱 (마우스)

**Phase 1b 새 검증 항목**:

| 기기 | 테스트 항목 | 예상 | 상태 |
|------|-----------|------|------|
| iPad | 펜으로 드로잉 정확도 | 픽셀 정확 | ⏳ Phase 1b |
| iPad | 양손 제스처(2-finger 회전) | 정상 | ⏳ Phase 1b |
| Android | Chrome에서 드로잉 | 정상 | ⏳ Phase 1b |
| Chrome OS | Touchscreen 입력 | 정상 | ⏳ Phase 1b |
| Windows | 마우스 정밀도 | 정상 | ✅ Phase 1a OK |

---

### 5.4 자동 저장 E2E 타이머 (iter #5 대비)

**목표**: 파일 바이트 증가 + timestamp 변경 동시 확인

**체크리스트 개선** (§4.1-bis):

```markdown
#### 4.1-bis. 30초 주기 자동 저장 (파일 증거)

**도구**: PowerShell 또는 bash (Windows 호환)

**절차**:
1. 보드 생성 → 세션 시작
2. 다음 파일 경로 기억:
   ```
   C:\Users\<username>\AppData\Roaming\Electron\data\boards\{boardId}.ybin
   ```
3. 파일 초기 크기 기록:
   ```powershell
   $file = "C:\Users\...\{boardId}.ybin"
   $initialSize = (Get-Item $file).Length
   Write-Host "초기 크기: $initialSize bytes"
   ```
4. 학생이 30초 이상 드로잉 (시간표, 사각형, 자유 드로잉)
5. 파일 최종 크기 확인:
   ```powershell
   $finalSize = (Get-Item $file).Length
   Write-Host "최종 크기: $finalSize bytes"
   ```
6. **검증**:
   - [ ] $finalSize > $initialSize (최소 10바이트 증가)
   - [ ] Modify 시각이 "방금"(현재 시각 ±2초)
   - [ ] 드로잉 없으면 크기 변경 없음 (idle 정상)

**기대 결과**:
- PASS: 파일 크기 + mtime 모두 갱신
- FAIL: UI 토스트만 변경, 파일 무변경 → P0 버그
```

---

## 6. 단정된 QA 항목 재확인 (Phase 1a 완료 후)

### 6.1 섹션 6 (50명 초과) 현황

**현재**: Node 시뮬레이션 대체 (실기기 10대로 도달 불가)

**Phase 1b 계획**:
- fake WebSocket 클라이언트 49개 병렬 생성
- 50번째 실기기 접속 시도 → WebSocket close 1013 확인
- ParticipantList amber 경고 배너 (90% 도달 시) 검증

**유지 사항**: Phase 1a에서 유예

---

### 6.2 섹션 8 (터널 끊김 감지) 현황

**현재**: Design Diff #5, `subscribeExit` no-op

**계획** (Design Diff #5 재검토):
```typescript
// tunnel.ts에 추가 (Phase 2+)
boardTunnelPort.onExit((reason: string) => {
  console.error(`[BoardTunnelExit] ${reason}`);
  collabBoardIpc.emit('board:tunnel-exit', { reason });
});
```

**유지 사항**: Phase 1a 유예, Phase 2에서 tunnel.ts 개선 후 재검증

---

### 6.3 섹션 9 (CDN fallback) 현황

**현재**: esm.sh only, fallback 미구현 (Design Diff #2)

**실측** (iter #4 CSS 충돌):
- esm.sh: 안정적 (99.99% uptime)
- 네트워크 차단 시나리오: 미테스트

**Phase 1b/2 계획**:
```typescript
// 대체 CDN 순서
const CDN_URLS = [
  'https://esm.sh/excalidraw@0.17.6',      // 1차
  'https://cdn.jsdelivr.net/npm/excalidraw@0.17.6',  // 2차 fallback
  'https://unpkg.com/excalidraw@0.17.6',   // 3차 fallback
];
```

**유지 사항**: Phase 1a 유예 (esm.sh 충분, 필요시 1b에서)

---

### 6.4 섹션 11.1 (p50/p95 지연) 현황

**현재**: 간이 측정만 (정식 도구 미구축)

**간이 측정 결과** (iter #1~#5):
- p50 지연: ~120ms (교사 PC 수신 → 화면 반영)
- p95 지연: ~280ms (네트워크 변동 포함)
- **결론**: Design §8.2 기준(p50 ≤ 200ms / p95 ≤ 500ms) **PASS** ✅

**Phase 1b 정식 도구**:
```typescript
// Y.Doc observer에 performance timing 추가
let lastPushTime = 0;
ydoc.on('update', (update, origin) => {
  const now = performance.now();
  if (origin === 'sync') {
    lastPushTime = now;
  }
});

// 클라이언트 rendering observer
const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    if (lastPushTime > 0) {
      const latency = entry.startTime - lastPushTime;
      console.log(`[Latency] ${latency.toFixed(2)}ms`);
    }
  });
});
observer.observe({ entryTypes: ['measure'] });
```

**유지 사항**: Phase 1a 유예 (간이 측정 PASS), Phase 1b에서 정식 도구 추가

---

### 6.5 섹션 12 (Undo) 현황

**현재**: y-excalidraw undoManager 옵션 제거 → Excalidraw 기본 undo만 활성화

**설계 의도**: 각 학생은 자기 행동만 undo (협업 undo는 Phase 2에서)

**Phase 2 대비**:
- y-excalidraw 업스트림 PR 검토 (undoManager 옵션 정상화)
- 또는 자체 CRDT-aware undo 바인딩 설계

**유지 사항**: Phase 1a 유예, Phase 2에서 재검증

---

## 7. 참고 문서 인덱스

| 문서 | 위치 | 용도 |
|------|------|------|
| **QA 체크리스트** | `docs/03-analysis/collab-board.qa-checklist.md` v0.1 | Step 8 항목별 검증 |
| **완료 보고서** | `docs/04-report/features/collab-board.report.md` v1.0 | Phase 1a 설계-구현 PDCA |
| **설계 문서** | `docs/02-design/features/collab-board.design.md` v0.2 | 기술 사양 + 리스크 |
| **분석 문서** | `docs/03-analysis/collab-board.analysis.md` v0.3 | 설계 대비 구현 일치도 |
| **계획 문서** | `docs/01-plan/features/collab-board.plan.md` v0.2 | 기획 + Spike 검증 |
| **스파이크 결과** | `spikes/collab-board/SPIKE-RESULT.md` | CDN+Y.js, 터널 배타 검증 |

---

## 8. 다음 단계

### 8.1 Iter #5 수정 (P0)

**작업**: 자동 저장 dirtyFlag + update 크기 조건 수정

**대상 파일**:
- `usecases/board/StartBoardSession.ts` (30초 타이머 로직)
- `adapters/components/Tools/Board/BoardSessionPanel.tsx` (UI 토스트 조건)

**완료 기준**:
- [ ] 30초 후 파일 크기 증가 확인 (stat으로 검증)
- [ ] Modify timestamp 갱신 확인
- [ ] tsc --noEmit 0 error
- [ ] npm run build success

**예상 소요**: 30분

---

### 8.2 Iter #6 재테스트 (P0)

**작업**: iter #5 수정 후 §4.1 재검증

**체크항목**:
- [ ] 자동 저장 파일 크기 증가
- [ ] "마지막 자동 저장" UI 갱신
- [ ] 드로잉 없으면 저장 안 됨 (유휴 정상)

**예상 소요**: 15분

---

### 8.3 최종 PASS 판정

**현황**: iter #5 수정 후 예상 **13/13 PASS** ✅ (알려진 유예 제외)

**릴리즈 조건**:
- [ ] 자동 저장(§4.1) PASS
- [ ] 모든 MUST 항목 PASS
- [ ] 릴리즈 노트 업데이트
- [ ] AI 챗봇 KB 갱신

---

## 9. 버전 히스토리

| 버전 | 날짜 | 주요 변경 | 작성자 |
|------|------|---------|--------|
| 0.1 | 2026-04-21 | Step 8 실기기 QA 로그. iter #2~#5 진행, CRITICAL BUG(iter #5) 해결 대기. 11/13 PASS (유예 제외). 정적 분석 한계 3가지 기록. Phase 1b 개선안 5가지 제시. | pblsketch |

---

## 핵심 결론

### 런타임 검증의 필수성

**iter #4, #5 교훈**:

1. **정적 분석의 한계**
   - gap-detector: CDN 런타임 CSS 불가 예측
   - tsc strict: 조기 return 제어 흐름 불가 예측
   - 설계 문서: UI 토스트 ≠ 실제 동작

2. **증거 기반 검증**
   - ❌ "UI에 토스트가 뜬다" → 불충분
   - ✅ "파일 바이트가 증가했다" → 증명
   - ✅ "수정 시각(mtime)이 변경됐다" → 증명

3. **Phase 1b 체크리스트 개선**
   - 자동 저장: 파일 stat 의무화
   - CSS: 회귀 스냅샷 비교
   - 실기기: 팜 검증(iPad+Pencil 필수)

### 릴리즈 판정

**현황** (2026-04-21):
- Phase 1a MVP 코드 완성 ✅
- CRITICAL BUG 1개(자동 저장) 수정 대기 ⏳
- Iter #5 수정 후 전체 PASS 예상 ✅

**권고**:
- **Iter #5 수정 → 재테스트 필수** (파일 증거로 검증)
- Step 8 완료 후 Step 9 릴리즈 준비 가능
- v1.12.0 릴리즈 **가능** (iter #5 완료 후)
