# 쌤핀 NEIS 학사일정 연동 기능 계획서

## 📋 개요

| 항목 | 내용 |
|------|------|
| **기능명** | NEIS 학사일정 자동 동기화 |
| **목표** | NEIS 오픈 API에서 학교별 학사일정을 가져와 기존 일정 관리 시스템과 자연스럽게 통합 |
| **기존 시스템** | 구글 캘린더 연동 + 직접 입력(수동 추가/편집) |
| **핵심 원칙** | "API로 초벌 + 수동 보정" — 자동 동기화하되, 교사가 수정/삭제/추가 가능 |

---

## 🏗️ 아키텍처 설계

### 현재 일정 데이터 소스 (기존)
```
┌─────────────────────────────────────────────┐
│              쌤핀 일정 관리                    │
│                                             │
│  [직접 입력] ──→ 로컬 저장소 (electron-store) │
│  [구글 캘린더] ──→ 양방향 동기화               │
│                                             │
└─────────────────────────────────────────────┘
```

### 추가 후 일정 데이터 소스
```
┌──────────────────────────────────────────────────┐
│                 쌤핀 일정 관리                      │
│                                                  │
│  [직접 입력] ───→ 로컬 저장소 (electron-store)     │
│  [구글 캘린더] ──→ 양방향 동기화                    │
│  [NEIS 학사일정] ──→ 단방향 동기화 (읽기 전용 베이스)│
│       ↓                                          │
│  자동 가져오기 → "NEIS" 카테고리 → 수동 편집 가능   │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 데이터 흐름
```
NEIS API ──fetch──→ 파싱 ──→ 중복 검사 ──→ 로컬 저장
                                              ↓
                                    일정 목록에 표시
                                    (카테고리: "학사일정")
                                    (출처 배지: "NEIS")
                                              ↓
                                    사용자 편집 가능
                                    (수정/삭제/숨기기)
```

---

## 📡 NEIS API 상세

### 엔드포인트
```
GET https://open.neis.go.kr/hub/SchoolSchedule
```

### 필수 파라미터
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `KEY` | STRING | 인증키 (open.neis.go.kr에서 발급) |
| `Type` | STRING | `json` |
| `pIndex` | INTEGER | 페이지 번호 (1부터) |
| `pSize` | INTEGER | 페이지당 건수 (최대 1000) |
| `ATPT_OFCDC_SC_CODE` | STRING | 시도교육청코드 (예: N10=충남) |
| `SD_SCHUL_CODE` | STRING | 표준학교코드 (예: 8140062=온양여고) |

### 선택 파라미터
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `AA_YMD` | STRING | 학사일자 (YYYYMMDD) |
| `AA_FROM_YMD` | STRING | 학사시작일자 |
| `AA_TO_YMD` | STRING | 학사종료일자 |
| `SCHUL_CRSE_SC_NM` | STRING | 학교과정명 (초등학교/중학교/고등학교) |

### 응답 구조 (실제 온양여고 데이터 기반)
```json
{
  "SchoolSchedule": [
    { "head": [{ "list_total_count": 10 }, { "RESULT": { "CODE": "INFO-000" } }] },
    {
      "row": [
        {
          "ATPT_OFCDC_SC_CODE": "N10",
          "SD_SCHUL_CODE": "8140062",
          "AY": "2025",
          "AA_YMD": "20250301",            // 학사일자 (YYYYMMDD)
          "SCHUL_NM": "온양여자고등학교",
          "EVENT_NM": "3·1절",             // 행사명 ← 일정 제목으로 사용
          "EVENT_CNTNT": "",               // 행사내용 (대부분 빈 값)
          "ONE_GRADE_EVENT_YN": "Y",       // 1학년 해당 여부
          "TW_GRADE_EVENT_YN": "Y",        // 2학년 해당 여부
          "THREE_GRADE_EVENT_YN": "Y",     // 3학년 해당 여부
          "SBTR_DD_SC_NM": "공휴일",       // 수업공제일 구분 (공휴일/해당없음)
          "LOAD_DTM": "20260305"           // 데이터 적재일
        }
      ]
    }
  ]
}
```

### 학교 검색 API (학교코드 조회용)
```
GET https://open.neis.go.kr/hub/schoolInfo
  ?Type=json&SCHUL_NM={학교명}
```
→ `ATPT_OFCDC_SC_CODE` + `SD_SCHUL_CODE` 획득

---

## 🎨 UI/UX 설계

### Phase 1: 설정 마법사 (학교 연결)

쌤핀에 이미 NEIS 시간표/급식 연동을 위한 학교 설정이 있으므로, **별도 설정 없이 기존 학교 정보를 재활용**합니다.

```
[설정] → [학교 정보] (기존)
  ├── 학교명: 온양여자고등학교 ✓
  ├── 교육청: 충청남도교육청 (N10) ✓  
  ├── 학교코드: 8140062 ✓
  └── [NEW] 학사일정 동기화: ON/OFF 토글
         └── 마지막 동기화: 2026-03-05 09:30
         └── [지금 동기화] 버튼
```

### Phase 2: 일정 목록에서의 표시

기존 카테고리 시스템(`학교/학급/부서/나무학교/기타 + 사용자 정의`)에 **"학사일정(NEIS)"** 카테고리 자동 추가:

```
카테고리 목록:
  ☑ 학교          🟦
  ☑ 학급          🟩
  ☑ 부서          🟨
  ☑ 나무학교      🟫
  ☑ 기타          ⬜
  ☑ 학사일정(NEIS) 🟪  ← NEW (자동 생성, 보라색 기본)
  ☑ 구글 캘린더    🔵  (기존)
```

### Phase 3: 일정 아이템 UI

NEIS에서 가져온 일정은 출처 표시 + 학년 배지:

```
┌──────────────────────────────────────┐
│ 📅 3월 4일 (화)                       │
│                                      │
│ 🟪 입학식                  NEIS  1학년 │
│ 🟪 시업식                  NEIS  전학년 │
│ 🟦 학급 자치 회의                      │
│ 🔵 나무학교 정기모임 (구글)             │
│ 🟩 1-3반 학급회의                      │
│                                      │
│ 📅 3월 10일 (월)                      │
│ 🟪 1학기 중간고사 시작      NEIS  전학년 │
└──────────────────────────────────────┘
```

- `NEIS` 배지: 회색 작은 라벨로 출처 표시
- 학년 배지: 해당 학년 표시 (1학년/2학년/3학년/전학년)
- 공휴일/수업공제일은 빨간색 글씨 or 배경색 처리

### Phase 4: NEIS 일정 편집

```
[NEIS 일정 클릭 시]
┌─────────────────────────────────┐
│ 입학식                    NEIS  │
│ 2026-03-04 (화)                 │
│ 해당학년: 1학년                  │
│                                 │
│ ⚠️ 이 일정은 NEIS에서 가져온     │
│    일정입니다.                   │
│                                 │
│ [편집] [숨기기] [삭제]           │
│                                 │
│ 💡 다음 동기화 시 복원될 수       │
│    있습니다.                     │
└─────────────────────────────────┘
```

편집 옵션:
- **편집**: 제목/날짜/메모 수정 가능 → `isModified: true` 플래그 → 다음 동기화에서 덮어쓰지 않음
- **숨기기**: 목록에서 숨김 → `isHidden: true` → 복원 가능
- **삭제**: 로컬에서 완전 삭제 → 다음 동기화 시 다시 나타남 (또는 "영구 무시" 옵션)

---

## 💾 데이터 모델

### 기존 일정 모델 (추정)
```typescript
interface ScheduleEvent {
  id: string;
  title: string;
  date: string;           // YYYY-MM-DD
  endDate?: string;
  category: string;       // 카테고리 ID
  isAllDay: boolean;
  memo?: string;
  repeat?: RepeatConfig;
  reminders?: Reminder[];
  source: 'local' | 'google';
  googleEventId?: string;
}
```

### NEIS 일정 확장 모델
```typescript
interface ScheduleEvent {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  category: string;
  isAllDay: boolean;
  memo?: string;
  repeat?: RepeatConfig;
  reminders?: Reminder[];

  // 소스 구분 (기존 확장)
  source: 'local' | 'google' | 'neis';

  // NEIS 전용 필드
  neis?: {
    eventId: string;        // `${AA_YMD}_${EVENT_NM}` 고유 키
    eventName: string;      // 원본 행사명
    schoolYear: string;     // 학년도
    gradeYn: {              // 학년별 해당 여부
      grade1: boolean;
      grade2: boolean;
      grade3: boolean;
    };
    subtractDayType: string; // 수업공제일 구분 (공휴일/해당없음)
    loadDate: string;        // 데이터 적재일
    lastSyncAt: string;      // 마지막 동기화 시간
  };

  // 사용자 수정 추적
  isModified?: boolean;     // 사용자가 편집했으면 true → 동기화 시 보호
  isHidden?: boolean;       // 숨기기 처리
  isDeleted?: boolean;      // 영구 무시 처리
}
```

### NEIS 설정 모델
```typescript
interface NeisScheduleConfig {
  enabled: boolean;
  // 학교 정보 (기존 NEIS 설정에서 가져옴)
  schoolCode: string;       // SD_SCHUL_CODE
  eduOfficeCode: string;    // ATPT_OFCDC_SC_CODE
  apiKey: string;           // NEIS 인증키

  // 동기화 설정
  autoSync: boolean;        // 앱 시작 시 자동 동기화
  syncIntervalHours: number; // 자동 동기화 주기 (기본: 24시간)
  lastSyncAt: string | null;

  // 카테고리 설정
  categoryId: string;       // 학사일정 카테고리 ID
  categoryColor: string;    // 기본 보라색 (#8B5CF6)

  // 필터 설정
  showHolidays: boolean;    // 공휴일 표시 여부
  gradeFilter: number[];    // 특정 학년만 표시 (빈 배열 = 전체)
}
```

---

## 🔄 동기화 로직

### 동기화 알고리즘
```
1. NEIS API에서 현재 학년도 학사일정 전체 조회
   - 조회 범위: 3월~다음해 2월 (학년도 기준)
   - 페이지네이션: pSize=1000으로 한번에 조회 (대부분 학교 200건 이내)

2. 응답 데이터 파싱 & 정규화
   - AA_YMD → YYYY-MM-DD 변환
   - EVENT_NM → title
   - 학년별 Y/N → gradeYn 객체
   - 같은 날짜 + 같은 행사명 중복 제거 (API에서 중복 올 수 있음)

3. 기존 NEIS 일정과 비교 (neis.eventId 기준)
   - 새 일정: 추가
   - 기존 일정 (isModified=false): 업데이트
   - 기존 일정 (isModified=true): 스킵 (사용자 수정 보호)
   - 기존 일정 (isHidden/isDeleted=true): 스킵
   - API에 없는 기존 일정: 유지 (학교가 삭제한 경우 → 다음 동기화에서 자연 정리)

4. 로컬 저장소 업데이트

5. UI 갱신 & lastSyncAt 업데이트
```

### 동기화 타이밍
- **앱 시작 시**: 마지막 동기화가 24시간 이상 전이면 자동 실행
- **수동 트리거**: 설정에서 [지금 동기화] 버튼
- **학기 초 안내**: 3월/9월에 "학사일정을 동기화하시겠습니까?" 토스트 알림

### 에러 처리
```typescript
// API 응답 코드 처리
switch (result.CODE) {
  case 'INFO-000': // 정상
    return parseSchedule(data);
  case 'INFO-200': // 데이터 없음
    return { events: [], message: '등록된 학사일정이 없습니다.' };
  case 'INFO-300': // 인증키 오류
    throw new NeisAuthError('NEIS 인증키를 확인해주세요.');
  default:
    throw new NeisApiError(`API 오류: ${result.MESSAGE}`);
}
```

---

## 📐 구현 단계

### Phase 1: 기반 작업 (1~2일)
- [ ] NEIS 학사일정 API 서비스 모듈 (`src/services/neisSchedule.ts`)
- [ ] API 호출, 파싱, 에러 처리 로직
- [ ] 데이터 모델 확장 (기존 ScheduleEvent에 `neis` 필드 추가)
- [ ] electron-store 스키마 업데이트

### Phase 2: 동기화 엔진 (1~2일)
- [ ] 동기화 알고리즘 구현 (비교, 병합, 충돌 해결)
- [ ] 백그라운드 동기화 (앱 시작 시 + 주기적)
- [ ] 동기화 상태 관리 (진행중/완료/에러)

### Phase 3: UI 연동 (2~3일)
- [ ] 설정 페이지: 학사일정 동기화 ON/OFF 토글 + 마지막 동기화 시간
- [ ] "학사일정(NEIS)" 카테고리 자동 생성
- [ ] 일정 목록에서 NEIS 배지 + 학년 배지 표시
- [ ] NEIS 일정 클릭 시 상세 보기 (편집/숨기기/삭제)
- [ ] 학년 필터 (특정 학년 일정만 보기)

### Phase 4: 마무리 (1일)
- [ ] 공휴일/수업공제일 시각적 구분 (빨간색)
- [ ] 동기화 실패 시 토스트 에러 메시지
- [ ] "이 학교는 학사일정이 등록되지 않았습니다" 안내
- [ ] 학기 초(3월/9월) 자동 동기화 권유 알림

**총 예상 기간: 5~8일**

---

## ⚠️ 고려사항

### NEIS API 제한
- 인증키 없이는 5건만 조회 가능 → **사용자가 본인 인증키를 발급받아 설정**해야 함
- 기존 급식/시간표 기능에서 이미 인증키를 받았다면 동일 키 사용 가능
- 일일 호출 제한이 있으므로 불필요한 반복 호출 방지 (캐싱 필수)

### 데이터 품질
- 학교마다 입력 성실도가 다름 → "데이터가 불완전할 수 있습니다" 안내 필요
- 학기 초에는 데이터가 없을 수 있음 → 빈 결과 시 친절한 안내
- 같은 날짜에 같은 행사가 중복으로 올 수 있음 → 중복 제거 로직 필수

### 기존 기능과의 조화
- 구글 캘린더 일정과 NEIS 일정이 겹칠 수 있음 (예: 둘 다 "중간고사" 등록)
  → 중복 감지는 하지 않되, 카테고리/출처 배지로 시각적 구분
- 직접 입력한 일정과 NEIS 일정의 우선순위
  → 동일 레벨, 카테고리 필터로 사용자가 선택
- 내보내기(한글/엑셀) 시 NEIS 일정도 포함

---

## 🎯 성공 지표
- 설정 완료까지 30초 이내 (기존 학교 정보 활용)
- 동기화 완료까지 3초 이내 (API 응답 + 파싱 + 저장)
- 기존 일정과 혼동 없이 구분 가능 (카테고리 + 배지)
- 사용자 수정 일정이 동기화에 의해 덮어써지지 않음
