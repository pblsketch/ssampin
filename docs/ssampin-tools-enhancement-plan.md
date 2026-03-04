# 쌤핀 쌤도구(Tools) 기능 개선 구현 계획서

> **작성일**: 2026년 3월 4일  
> **대상 버전**: v0.1.7 → v0.2.0  
> **예상 소요**: 4~5일

---

## 📋 구현 목표

| # | 기능 | 우선순위 | 난이도 |
|---|------|---------|--------|
| T1 | 룰렛/랜덤뽑기 프리셋 저장 | ⭐⭐⭐ | ⭐⭐ |
| T2 | 타이머 앱 내 볼륨 부스트 | ⭐⭐ | ⭐⭐ |
| T3 | 키보드 단축키 지원 | ⭐⭐⭐ | ⭐⭐ |

---

## 🏗 현재 코드 분석

### 관련 파일 구조

```
src/adapters/components/Tools/
├── ToolLayout.tsx         ← 공통 레이아웃 (헤더, 줌, 전체화면) 104줄
├── ToolsGrid.tsx          ← 도구 목록 그리드 80줄
├── ToolRoulette.tsx       ← 룰렛 297줄
├── ToolRandom.tsx         ← 랜덤뽑기 480줄
├── ToolTimer.tsx          ← 타이머/스톱워치 700줄+
├── ToolScoreboard.tsx     ← 점수판
├── ToolDice.tsx           ← 주사위
├── ToolCoin.tsx           ← 동전
├── ToolTrafficLight.tsx   ← 신호등
├── ToolPoll.tsx           ← 투표
├── ToolQRCode.tsx         ← QR코드
├── ToolSeatPicker.tsx     ← 자리뽑기
└── ToolWorkSymbols.tsx    ← 활동기호
```

### 현재 상태 요약

**룰렛 (ToolRoulette.tsx)**:
- 항목을 매번 수동 입력 또는 "우리 반 학생" 불러오기
- `items` 상태가 컴포넌트 로컬 → 페이지 벗어나면 사라짐
- 프리셋 저장/불러오기 기능 없음

**랜덤뽑기 (ToolRandom.tsx)**:
- 3가지 데이터소스: 학생/번호범위/직접입력
- `customText` 상태가 로컬 → 마찬가지로 사라짐
- 자주 쓰는 항목 저장 불가

**타이머 (ToolTimer.tsx)**:
- Web Audio API로 직접 합성 (beep, school-bell, alarm-clock 등 6종)
- 볼륨: 0~100% 슬라이더 존재 (settings.alarmSound.volume)
- 하지만 **앱 내 볼륨 부스트**(시스템 볼륨 이상으로 증폭)는 없음
- `AudioContext.gain` 값을 1.0 이상으로 올리면 부스트 가능

**키보드 단축키**:
- 현재 전무. ESC로 뒤로가기도 안 됨
- ToolLayout에 onBack 핸들러는 있으나 키보드 이벤트 미연결

---

## 📐 상세 설계

---

### T1. 룰렛/랜덤뽑기 프리셋 저장

#### 1-1. 프리셋 데이터 모델

```typescript
// src/domain/entities/ToolPreset.ts (신규)

export interface ToolPreset {
  readonly id: string;
  readonly name: string;           // "3학년 2반", "발표 주제", "모둠 이름"
  readonly type: 'roulette' | 'random';
  readonly items: readonly string[];
  readonly createdAt: string;      // ISO 8601
  readonly updatedAt: string;
}

export interface ToolPresetsData {
  readonly presets: readonly ToolPreset[];
}
```

#### 1-2. 저장 방식

기존 인프라(`IStoragePort`)를 활용하여 `tool-presets` 키로 저장:

```typescript
// src/adapters/stores/useToolPresetStore.ts (신규)

import { create } from 'zustand';
import type { ToolPreset } from '@domain/entities/ToolPreset';

const STORAGE_KEY = 'tool-presets';

interface ToolPresetState {
  presets: readonly ToolPreset[];
  loaded: boolean;
  
  load: () => Promise<void>;
  savePreset: (name: string, type: 'roulette' | 'random', items: string[]) => Promise<void>;
  updatePreset: (id: string, items: string[]) => Promise<void>;
  renamePreset: (id: string, name: string) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;
  getPresetsByType: (type: 'roulette' | 'random') => readonly ToolPreset[];
}
```

#### 1-3. UI — 프리셋 저장/불러오기 패널

**룰렛 (ToolRoulette.tsx)** — 기존 입력 패널 상단에 추가:

```
┌─ 데이터 입력 ───────────────────────────────┐
│                                             │
│  📁 프리셋:  [3학년2반 ▼]  [💾저장] [📂열기]│
│  ──────────────────────────────────────────  │
│  [👩‍🎓 우리 반 학생]  [✏️ 직접 입력]          │
│                                             │
│  항목 입력...                        [추가] │
│  ● 항목 1                              ✕  │
│  ● 항목 2                              ✕  │
│  ● 항목 3                              ✕  │
└─────────────────────────────────────────────┘
```

**프리셋 저장 다이얼로그**:

```
┌─ 프리셋 저장 ────────────────────────────────┐
│                                             │
│  이름: [3학년 2반 학생 명단          ]       │
│  항목: 김민수, 박영희 외 28명               │
│                                             │
│         [취소]  [저장]                       │
└─────────────────────────────────────────────┘
```

**프리셋 불러오기 드롭다운**:

```
┌─ 프리셋 선택 ────────────────────────────────┐
│  📁 3학년 2반 학생 명단  (30개)    [🗑️]     │
│  📁 발표 주제 목록      (10개)    [🗑️]     │  
│  📁 모둠 이름           (6개)     [🗑️]     │
│  ──────────────────────────────────────────  │
│  + 현재 항목을 새 프리셋으로 저장            │
└─────────────────────────────────────────────┘
```

#### 1-4. 프리셋 컴포넌트 (공용)

룰렛과 랜덤뽑기에서 공유하는 프리셋 UI 컴포넌트:

```typescript
// src/adapters/components/Tools/PresetSelector.tsx (신규)

interface PresetSelectorProps {
  type: 'roulette' | 'random';
  currentItems: string[];
  onLoadPreset: (items: string[]) => void;
}

export function PresetSelector({ type, currentItems, onLoadPreset }: PresetSelectorProps) {
  const { presets, loaded, load, savePreset, deletePreset } = useToolPresetStore();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  
  const filteredPresets = presets.filter(p => p.type === type);
  
  // ... 드롭다운 + 저장 다이얼로그 렌더링
}
```

#### 1-5. 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `domain/entities/ToolPreset.ts` | 🆕 프리셋 엔티티 |
| `adapters/stores/useToolPresetStore.ts` | 🆕 Zustand 스토어 |
| `adapters/components/Tools/PresetSelector.tsx` | 🆕 공용 프리셋 UI |
| `adapters/components/Tools/ToolRoulette.tsx` | ✏️ PresetSelector 통합, 항목 로드/저장 |
| `adapters/components/Tools/ToolRandom.tsx` | ✏️ PresetSelector 통합 (custom 모드에서) |

---

### T2. 타이머 앱 내 볼륨 부스트

#### 2-1. 현재 볼륨 시스템

```typescript
// 현재: AudioContext gain을 0.0~1.0 범위로만 사용
const gain = ctx.createGain();
gain.gain.value = volume; // 0.0 ~ 1.0
```

시스템 볼륨이 낮으면 교실에서 소리가 안 들림.

#### 2-2. 볼륨 부스트 전략

**Web Audio API의 GainNode는 1.0 이상 값도 지원합니다.**  
클리핑(찢어지는 소리)을 방지하기 위해 **DynamicsCompressorNode**를 추가합니다:

```typescript
// 개선된 오디오 체인
function createBoostedAudio(volume: number, boost: number): {
  ctx: AudioContext;
  output: AudioNode;
} {
  const ctx = new AudioContext();
  
  // 1. Gain: 볼륨 × 부스트 배율
  const gain = ctx.createGain();
  const effectiveVolume = volume * boost; // boost: 1.0~4.0
  gain.gain.value = effectiveVolume;
  
  // 2. Compressor: 클리핑 방지
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -6;   // dB
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;
  
  // 체인: source → gain → compressor → destination
  gain.connect(compressor);
  compressor.connect(ctx.destination);
  
  return { ctx, output: gain };
}
```

#### 2-3. UI — 볼륨 부스트 슬라이더

기존 볼륨 슬라이더를 확장합니다:

```
┌─ 볼륨 ──────────────────────────────────────┐
│                                             │
│ 🔊 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100%    │
│                                             │
│ 🔊 부스트:  [1x] [2x] [3x] [4x]            │
│ ⚠️ 부스트 사용 시 소리가 커집니다            │
└─────────────────────────────────────────────┘
```

#### 2-4. Settings 엔티티 변경

```typescript
// domain/entities/Settings.ts — AlarmSoundSettings 확장

export interface AlarmSoundSettings {
  readonly selectedSound: AlarmSoundId;
  readonly customAudioName: string | null;
  readonly volume: number;      // 0.0 ~ 1.0 (기존)
  readonly boost: number;       // 1.0 ~ 4.0 (신규 — 볼륨 배율)
}
```

#### 2-5. 모든 사운드 함수 수정

기존 6개 사운드 함수(`playBeep`, `playSchoolBell` 등)에 boost 파라미터 추가:

```typescript
function playAlarmSound(
  soundId: AlarmSoundId,
  volume: number,
  boost: number,          // ✅ 추가
  customDataUrl: string | null,
): void {
  const effectiveVolume = Math.min(volume * boost, 4.0);
  // ... DynamicsCompressor 적용
}
```

커스텀 오디오의 경우:

```typescript
function playCustomAudio(dataUrl: string, volume: number, boost: number): void {
  const audio = new Audio(dataUrl);
  
  // HTMLAudioElement는 volume이 1.0까지만 → AudioContext로 우회
  if (boost > 1.0) {
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    gain.gain.value = boost;
    
    const compressor = ctx.createDynamicsCompressor();
    source.connect(gain);
    gain.connect(compressor);
    compressor.connect(ctx.destination);
    
    audio.volume = volume;
    audio.play();
  } else {
    audio.volume = volume;
    audio.play();
  }
}
```

#### 2-6. 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `domain/entities/Settings.ts` | ✏️ `AlarmSoundSettings.boost` 추가 |
| `adapters/components/Tools/ToolTimer.tsx` | ✏️ 부스트 UI + 모든 playXxx 함수에 boost 적용 |
| `adapters/stores/useSettingsStore.ts` | ✏️ boost 기본값 1.0 마이그레이션 |

---

### T3. 키보드 단축키 지원

#### 3-1. 단축키 목록

**글로벌 (모든 쌤도구 공통)**:

| 키 | 동작 | 위치 |
|----|------|------|
| `Escape` | 뒤로가기 (쌤도구 목록으로) | ToolLayout |
| `F11` | 전체화면 토글 | ToolLayout |

**타이머 전용**:

| 키 | 동작 |
|----|------|
| `Space` | 시작/일시정지 토글 |
| `R` | 리셋 |
| `Enter` | 시간 종료 시 확인 (dismiss) |

**룰렛 전용**:

| 키 | 동작 |
|----|------|
| `Space` / `Enter` | 돌리기 |

**랜덤뽑기 전용**:

| 키 | 동작 |
|----|------|
| `Space` / `Enter` | 뽑기 |
| `R` | 전체 초기화 |

**점수판 전용**:

| 키 | 동작 |
|----|------|
| `1~9` | 해당 팀 +1점 |
| `Shift + 1~9` | 해당 팀 -1점 |

#### 3-2. 구현 방식 — ToolLayout에 통합

ToolLayout에 `keyboardShortcuts` prop을 추가하여, 각 도구가 자신의 단축키를 등록합니다:

```typescript
// ToolLayout.tsx 변경

interface KeyboardShortcut {
  key: string;             // 'Escape', 'Space', 'r', 'Enter' 등
  modifiers?: ('shift' | 'ctrl' | 'alt')[];
  action: () => void;
  description: string;     // 툴팁/도움말용
  when?: () => boolean;    // 조건부 활성화
}

interface ToolLayoutProps {
  title: string;
  emoji: string;
  onBack: () => void;
  isFullscreen: boolean;
  children: React.ReactNode;
  shortcuts?: KeyboardShortcut[];  // ✅ 추가
}
```

#### 3-3. 글로벌 키보드 리스너

```typescript
// ToolLayout.tsx 내부

useEffect(() => {
  const allShortcuts: KeyboardShortcut[] = [
    // 글로벌 단축키
    { key: 'Escape', action: onBack, description: '뒤로가기' },
    { key: 'F11', action: toggleFullscreen, description: '전체화면' },
    // 도구별 단축키
    ...(shortcuts ?? []),
  ];
  
  const handler = (e: KeyboardEvent) => {
    // input/textarea에 포커스 중이면 무시
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      // Escape만 허용
      if (e.key !== 'Escape') return;
    }
    
    for (const shortcut of allShortcuts) {
      if (e.key !== shortcut.key) continue;
      
      const needShift = shortcut.modifiers?.includes('shift') ?? false;
      const needCtrl = shortcut.modifiers?.includes('ctrl') ?? false;
      
      if (needShift !== e.shiftKey) continue;
      if (needCtrl !== e.ctrlKey) continue;
      if (shortcut.when && !shortcut.when()) continue;
      
      e.preventDefault();
      shortcut.action();
      return;
    }
  };
  
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [onBack, toggleFullscreen, shortcuts]);
```

#### 3-4. 단축키 도움말 표시

화면 우하단에 작은 `?` 버튼 → 클릭 시 단축키 목록 표시:

```
┌─ ⌨️ 키보드 단축키 ──────────────────────────┐
│                                             │
│  ESC        뒤로가기                        │
│  F11        전체화면                        │
│  Space      시작/일시정지                    │
│  R          리셋                            │
│                                             │
└─────────────────────────────────────────────┘
```

#### 3-5. 각 도구에 단축키 등록 예시

```typescript
// ToolTimer.tsx
<ToolLayout 
  title="타이머" emoji="⏱️" 
  onBack={onBack} isFullscreen={isFullscreen}
  shortcuts={[
    { 
      key: ' ', // Space
      action: () => state === 'running' ? pause() : start(),
      description: '시작/일시정지',
      when: () => state !== 'finished',
    },
    {
      key: 'r',
      action: reset,
      description: '리셋',
    },
    {
      key: 'Enter',
      action: dismiss,
      description: '확인',
      when: () => state === 'finished',
    },
  ]}
>
```

```typescript
// ToolRoulette.tsx
<ToolLayout
  title="룰렛" emoji="🎯"
  onBack={onBack} isFullscreen={isFullscreen}
  shortcuts={[
    {
      key: ' ', // Space
      action: spin,
      description: '돌리기',
      when: () => !isSpinning && items.length >= 2,
    },
  ]}
>
```

#### 3-6. 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `adapters/components/Tools/ToolLayout.tsx` | ✏️ `shortcuts` prop 추가, 글로벌 keydown 리스너, 도움말 UI |
| `adapters/components/Tools/ToolTimer.tsx` | ✏️ Space/R/Enter 단축키 등록 |
| `adapters/components/Tools/ToolRoulette.tsx` | ✏️ Space 단축키 등록 |
| `adapters/components/Tools/ToolRandom.tsx` | ✏️ Space/R 단축키 등록 |
| `adapters/components/Tools/ToolScoreboard.tsx` | ✏️ 1~9/Shift+1~9 단축키 등록 |
| `adapters/components/Tools/ToolTrafficLight.tsx` | ✏️ Space 단축키 등록 |

---

## 📊 전체 수정 파일 매트릭스

| 파일 | T1 프리셋 | T2 볼륨부스트 | T3 단축키 |
|------|:---------:|:------------:|:---------:|
| `domain/entities/ToolPreset.ts` | 🆕 | | |
| `domain/entities/Settings.ts` | | ✏️ | |
| `adapters/stores/useToolPresetStore.ts` | 🆕 | | |
| `adapters/stores/useSettingsStore.ts` | | ✏️ | |
| `adapters/components/Tools/PresetSelector.tsx` | 🆕 | | |
| `adapters/components/Tools/ToolLayout.tsx` | | | ✏️ |
| `adapters/components/Tools/ToolRoulette.tsx` | ✏️ | | ✏️ |
| `adapters/components/Tools/ToolRandom.tsx` | ✏️ | | ✏️ |
| `adapters/components/Tools/ToolTimer.tsx` | | ✏️ | ✏️ |
| `adapters/components/Tools/ToolScoreboard.tsx` | | | ✏️ |
| `adapters/components/Tools/ToolTrafficLight.tsx` | | | ✏️ |

✏️ = 수정, 🆕 = 신규 생성

---

## 🗓 구현 일정 (4~5일)

### Day 1: T3 키보드 단축키 (가장 광범위)

- [ ] ToolLayout에 `shortcuts` prop 및 keydown 리스너 구현
- [ ] ESC/F11 글로벌 단축키 동작 확인
- [ ] 도움말 `?` 버튼 + 단축키 목록 팝오버
- [ ] ToolTimer에 Space/R/Enter 등록
- [ ] ToolRoulette에 Space 등록
- [ ] ToolRandom에 Space/R 등록
- [ ] ToolScoreboard에 숫자키 등록
- [ ] input/textarea 포커스 시 단축키 비활성화 처리

### Day 2-3: T1 프리셋 저장

- [ ] `ToolPreset` 엔티티 정의
- [ ] `useToolPresetStore` 구현 (CRUD + localStorage/Electron 저장)
- [ ] `PresetSelector` 공용 컴포넌트 구현
- [ ] ToolRoulette에 PresetSelector 통합
- [ ] ToolRandom의 custom 모드에 PresetSelector 통합
- [ ] 프리셋 저장 다이얼로그, 불러오기 드롭다운 UI

### Day 4: T2 볼륨 부스트

- [ ] Settings에 `boost` 필드 추가 + 마이그레이션
- [ ] `DynamicsCompressorNode` 기반 부스트 오디오 체인 구현
- [ ] 6개 내장 사운드 함수에 boost 적용
- [ ] 커스텀 오디오 부스트 처리 (`createMediaElementSource` 활용)
- [ ] 부스트 UI (1x/2x/3x/4x 버튼)
- [ ] ⚠️ 경고 메시지 ("소리가 커집니다")

### Day 5: QA & 마무리

- [ ] 키보드 단축키 전체 테스트 (각 도구별)
- [ ] 프리셋 저장/불러오기/삭제 테스트
- [ ] 볼륨 부스트 클리핑 테스트 (4x에서도 깨지지 않는지)
- [ ] 전체화면 모드에서 동작 확인
- [ ] 다크/라이트 모드 UI 확인

---

## ⚠️ 기술적 고려사항

### 프리셋 저장 용량

- 프리셋당 최대 20개 항목 × 10자 = 200자
- 프리셋 최대 20개로 제한 → 총 ~8KB
- localStorage 한도(5~10MB) 대비 매우 작음

### 볼륨 부스트 주의사항

- `GainNode.gain.value > 1.0` → 클리핑(왜곡) 발생 가능
- `DynamicsCompressorNode`로 완화하지만 4x에서는 약간의 왜곡 가능
- UI에 ⚠️ 경고 표시 필수
- 기본값은 1x (부스트 없음)

### 키보드 단축키 충돌

- `Space`: 브라우저 기본 스크롤 동작과 충돌 → `e.preventDefault()` 필수
- `F11`: 일부 OS에서 시스템 단축키 → Electron에서는 별도 처리 필요
- input/textarea 포커스 시: ESC만 동작, 나머지는 무시 (텍스트 입력 방해 방지)

---

## 🎯 기대 효과

| 기능 | Before | After |
|------|--------|-------|
| 프리셋 | 매번 항목 재입력 | 저장 후 원클릭 불러오기 |
| 볼륨 | 시스템 볼륨에만 의존 | 앱 내 최대 4배 부스트 (교실용) |
| 단축키 | 마우스만 사용 | ESC=뒤로, Space=시작, R=리셋 |

### 교사 실사용 시나리오

**시나리오 1: 룰렛 프리셋**
> 3학년 2반 학생 명단을 프리셋으로 저장.  
> 다음 수업 시작할 때 "3학년2반" 프리셋 클릭 → 바로 룰렛 돌리기.  
> 발표 주제 목록도 별도 프리셋으로 저장해두고 수업마다 활용.

**시나리오 2: 교실 볼륨 부스트**
> 교실 PC 볼륨이 작아서 타이머 종료 소리가 안 들림.  
> 볼륨 부스트 3x로 설정 → 교실 뒤쪽까지 충분히 들림.

**시나리오 3: 키보드로 수업 진행**
> 프로젝터 앞에서 발표 중. 마우스 없이 키보드로:  
> Space = 타이머 시작, ESC = 쌤도구로 돌아가기, F11 = 전체화면.

---

*이 문서는 Claude Code(듀이)가 쌤핀 v0.1.7 코드 분석을 기반으로 작성했습니다.*
