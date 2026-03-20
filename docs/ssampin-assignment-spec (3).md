# 쌤핀 과제수합 도구 설계서 (MVP)

> 작성일: 2026-03-09
> 버전: 1.1 (피드백 반영)
> 대상 앱: 쌤핀(SsamPin) v0.2.9+

---

## 1. 개요

### 1.1 목적
교사가 학생들에게 과제를 배포하고, 학생이 파일을 제출하면 교사의 구글 드라이브에 자동 저장되는 **과제 수합 도구**를 쌤핀 앱에 추가한다.

### 1.2 핵심 가치
- **교사 PC가 꺼져 있어도** 학생은 과제 제출 가능
- **서버 비용 0원** (구글 드라이브 + Supabase 무료 티어)
- **로그인 없는 학생 제출** (이름 + 번호만 입력)
- **기존 학급 명단 자동 연동** (좌석배치 Student 엔티티 재사용)

### 1.3 UI 위치
- 도구(Tools) 그리드에 **"과제수합"** 카드 추가
- Live Vote, Survey, Word Cloud와 동일한 카테고리

### 1.4 제약사항
- **인터넷 연결 필수**: 과제 생성, 제출 현황 조회, 학생 제출 모두 온라인에서만 동작
- 오프라인 상태 감지 시 "인터넷 연결이 필요합니다" 안내 UI 표시
- Google OAuth 미검증 상태에서 **테스트 사용자 100명 제한** (1.5절 참조)

### 1.5 Google OAuth 검증 계획
- **MVP 단계**: 테스트 사용자로 운영 (100명 이내). Google Cloud Console에서 테스트 사용자 수동 등록
- **정식 배포**: Google OAuth 검증(Verification) 완료 후 사용자 제한 해제
- **검증 일정**: MVP 안정화 후 1~2주 내 검증 신청 (drive.file scope는 비교적 빠른 승인 예상)
- **검증 요구사항**: 개인정보처리방침 페이지, 홈페이지, 앱 데모 영상 준비

---

## 2. 사용자 흐름

### 2.1 교사 흐름 (쌤핀 앱)

```
도구 → 과제수합 클릭
  → 과제 목록 페이지 (기존 과제 리스트)
  → [+ 새 과제] 클릭
  → 과제 생성 모달:
      ├── 제목 (필수)
      ├── 설명 (선택)
      ├── 마감일시 (필수)
      ├── 대상 선택: 학급 명단 (드롭다운)
      ├── 드라이브 저장 폴더명 입력 (자동 생성)
      ├── 파일 형식 제한: 전체 / 이미지만 / 문서만(PDF,HWP,DOCX)
      ├── 지각 제출 허용 여부 (토글, 기본: 허용)
      └── 재제출 허용 여부 (토글, 기본: 허용)
  → 과제 생성 완료 (admin_key 발급)
  → 공유 링크 & QR코드 표시 (복사 버튼)
  → 제출 현황 대시보드로 이동
```

### 2.2 학생 흐름 (모바일/PC 브라우저)

```
QR 스캔 or 링크 접속 (https://ssampin.com/submit/{id})
  → 과제 정보 표시 (제목, 설명, 마감일)
  → 이름 입력 (자동완성 지원: 명단 기반)
  → 번호 입력
  → 파일 선택 (카메라 촬영 or 파일 업로드)
  → [제출] 버튼
  → 제출 완료 화면 (✅ 제출되었습니다)
```

### 2.3 교사 제출 현황 확인

```
┌──────────────────────────────────────────────────────────┐
│ 📝 독서감상문                           마감: 3/15 23:59  │
│ 대상: 1학년 3반 (30명)                     제출: 18/30명  │
│                                                          │
│ ┌─ 제출 현황 ──────────────────────────────────────────┐ │
│ │  1번 김민수  ✅ 3/9 14:23   📄 독서감상문.pdf         │ │
│ │  2번 이서연  ✅ 3/9 15:01   📄 감상문_이서연.hwpx     │ │
│ │  3번 박지호  ❌ 미제출                                │ │
│ │  4번 최유진  ⚠️ 3/16 09:12  📄 report.pdf  (지각)    │ │
│ │  5번 정하늘  ✅ 3/10 11:30  📄 감상문.pdf             │ │
│ │  ...                                                  │ │
│ └───────────────────────────────────────────────────────┘ │
│                                                          │
│ [📋 미제출자 복사]  [📥 전체 다운로드]  [🔗 링크 복사]     │
│                                   [🔄 새로고침]           │
└──────────────────────────────────────────────────────────┘
```

---

## 3. 기능 상세

### 3.1 과제 생성

| 항목 | 타입 | 필수 | 설명 |
|------|------|------|------|
| 제목 | string | ✅ | 과제명 |
| 설명 | string | ❌ | 과제 상세 설명, 유의사항 |
| 마감일시 | datetime | ✅ | 마감 날짜 + 시간 |
| 대상 | enum | ✅ | 학급 명단 선택 |
| 드라이브 폴더명 | string | ✅ | 자동 생성될 서브폴더명 (기본값: "{과제명}_{날짜}") |
| 파일 형식 | enum | ✅ | all / image / document |
| 지각 제출 | boolean | ✅ | 마감 후 제출 허용 여부 (기본: true) |
| 재제출 | boolean | ✅ | 제출 후 수정 허용 여부 (기본: true) |

과제 생성 시:
- `admin_key`를 랜덤 생성하여 과제에 연결 (교사가 제출 현황을 조회할 때 사용)
- `teacher_id`는 Google OAuth 이메일로 설정

### 3.2 학생 명단 연동

과제 생성 시 대상 선택 드롭다운:

```
── 학급 ──────────────
  1학년 3반 (담임반)
```

- **학급 명단**: `useSeatingStore` 또는 학생 관리 스토어에서 Student 엔티티 배열을 가져옴
- **번호 체계**: 배열 인덱스 + 1로 번호 부여 (좌석배치 방식과 동일)
- **수업별 명단**: 향후 지원 예정 (Phase 4). 현재 useScheduleStore에 수업별 학생 목록이 없으므로 MVP에서는 학급 명단만 지원

> **Student 엔티티 참조**: `{ id: string, name: string, studentNumber?: number (10201 인코딩), isVacant?: boolean }`
> - `isVacant === true`인 학생은 명단에서 제외
> - Student.id는 과제 학생 목록에 포함하여 고유 식별자로 활용

### 3.3 구글 드라이브 연동

#### 3.3.1 최초 인증 (1회)
- 기존 `GoogleOAuthClient.ts`에 Drive scope 추가
  - `https://www.googleapis.com/auth/drive.file`
- OAuth 토큰을 Electron secure storage에 저장
- 토큰을 Supabase에도 **AES-256-GCM으로 암호화**하여 저장 (학생 제출 시 사용)
- `teacher_id` = Google OAuth 이메일 주소

#### 3.3.2 폴더 관리 (자동화)
- **첫 사용 시**: "쌤핀 과제" 루트 폴더를 교사 드라이브에 자동 생성
- **과제 생성 시**: "{과제명}_{날짜}" 서브폴더를 "쌤핀 과제" 하위에 자동 생성
  - 예: `쌤핀 과제/독서감상문_20260309`
- **폴더명 입력 필드**: 과제 생성 모달에서 서브폴더명을 직접 입력/수정 가능
  - 기본값: `{과제제목}_{YYYYMMDD}` (자동 채워짐)
- `drive.file` scope이므로 앱이 생성한 폴더만 접근 가능 → 폴더 피커 대신 이름 입력 방식이 더 직관적

#### 3.3.3 파일 저장 규칙
- 파일명: `{번호}_{이름}_{원본파일명}` (예: `01_김민수_감상문.pdf`)
- 재제출 시: 기존 파일 덮어쓰기 (Google Drive 자체 버전 관리 활용)

### 3.4 제출 현황 자동 체크

#### 데이터 흐름
```
학생 제출 → Supabase Edge Function
  ├── 1) 파일 → 교사 구글 드라이브 업로드
  └── 2) 메타데이터 → Supabase DB 저장
        {
          assignment_id,
          student_id,
          student_number,
          student_name,
          submitted_at,
          file_name,
          file_size,
          is_late
        }
```

#### 교사 앱에서 조회
- 쌤핀 앱 → Supabase DB에서 제출 메타데이터 조회 (admin_key로 인증)
- 학생 명단과 매칭하여 ✅/❌/⚠️ 표시
- **MVP**: 수동 새로고침 버튼 + 30초 자동 폴링 (Supabase Realtime은 Phase 4에서 지원)

### 3.5 지각 제출

| 설정 | 마감 전 | 마감 후 |
|------|---------|---------|
| 지각 허용 ON | ✅ 정상 제출 | ⚠️ 지각 표시 |
| 지각 허용 OFF | ✅ 정상 제출 | 🚫 제출 차단 |

- 지각 제출물은 제출 현황에서 ⚠️ 아이콘 + 주황색으로 구분
- 드라이브에는 동일하게 저장됨

### 3.6 재제출

| 설정 | 동작 |
|------|------|
| 재제출 허용 ON | 학생이 다시 업로드 시 기존 파일 덮어쓰기. 최종 제출 시간 업데이트 |
| 재제출 허용 OFF | 이미 제출한 학생은 "이미 제출되었습니다" 메시지 표시 |

- Google Drive 자체 버전 관리로 이전 버전 복원 가능

### 3.7 파일 형식 제한

| 옵션 | 허용 확장자 |
|------|------------|
| 전체 | 모든 파일 |
| 이미지만 | jpg, jpeg, png, gif, heic, webp |
| 문서만 | pdf, hwp, hwpx, docx, doc, pptx, xlsx, txt |

- 학생 제출 페이지의 `<input accept="">` 속성으로 1차 필터
- Edge Function에서 MIME type 2차 검증

### 3.8 미제출자 목록 복사

[📋 미제출자 복사] 버튼 클릭 시 클립보드에 복사:

```
[독서감상문] 미제출 학생 (12명)
3번 박지호, 8번 한소희, 11번 오준서, 14번 송예린, 
17번 강도윤, 19번 임하은, 21번 조민재, 23번 윤서아, 
25번 신재현, 27번 배수빈, 29번 홍지민, 30번 류하윤

마감: 2026년 3월 15일 23:59
```

- 카카오톡, 문자로 바로 붙여넣기 가능

### 3.9 과제 목록 관리

```
┌─────────────────────────────────────────────────────────┐
│ 📋 과제수합                              [+ 새 과제]     │
│                                                         │
│ ── 진행중 ──────────────────────────────────────────── │
│ 📝 독서감상문        1학년3반   3/15 마감    18/30명    │
│ 📝 과학탐구보고서    1학년3반   3/20 마감     5/30명    │
│                                                         │
│ ── 마감완료 ────────────────────────────────────────── │
│ ✅ 진로탐색 워크시트  1학년3반   3/10 마감    30/30명    │
│ ✅ 수학 문제풀이     1학년3반   3/8 마감     29/30명    │
└─────────────────────────────────────────────────────────┘
```

- 진행중 / 마감완료 자동 분류
- 과제별 독립적인 드라이브 폴더, 링크, QR
- 과제 삭제 시 드라이브 파일은 유지 (안전)

### 3.10 오프라인 안내

인터넷 연결이 끊긴 경우:
```
┌──────────────────────────────────┐
│                                  │
│           📡                     │
│   인터넷 연결이 필요합니다         │
│                                  │
│  과제수합 기능은 온라인에서만       │
│  사용할 수 있습니다.               │
│                                  │
│  인터넷 연결을 확인한 후           │
│  다시 시도해주세요.                │
│                                  │
│        [ 🔄 다시 시도 ]           │
└──────────────────────────────────┘
```

- `navigator.onLine` + `online`/`offline` 이벤트로 감지
- 교사 앱, 학생 제출 페이지 모두 적용

---

## 4. 아키텍처

### 4.1 시스템 구조

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  쌤핀 앱     │────▶│  Supabase        │◀────│  학생 브라우저     │
│  (Electron)  │     │  - Edge Function │     │  (Vercel 페이지)   │
│              │     │  - PostgreSQL DB │     │  ssampin.vercel    │
│  과제 생성   │     │  - 토큰 보관      │     │  .app/submit/{id}  │
│  현황 조회   │     │                  │     │                    │
└──────┬───────┘     └────────┬─────────┘     └──────────────────┘
       │                      │
       │ OAuth                │ Drive API
       ▼                      ▼
┌──────────────────────────────────────────┐
│           Google Drive                    │
│  교사 계정의 드라이브에 파일 저장          │
│  폴더: 쌤핀 과제/{과제명}_{날짜}/         │
│  파일: {번호}_{이름}_{파일명}             │
└──────────────────────────────────────────┘
```

### 4.2 Clean Architecture 레이어 배치

```
src/
├── domain/
│   ├── entities/
│   │   └── Assignment.ts              # 과제 엔티티
│   ├── valueObjects/
│   │   ├── SubmissionStatus.ts         # 제출 상태 (submitted/late/missing)
│   │   └── FileType.ts                # 파일 형식 제한 (all/image/document)
│   └── repositories/
│       └── IAssignmentRepository.ts    # 과제 저장소 인터페이스
│
├── usecases/
│   └── assignment/
│       ├── CreateAssignment.ts         # 과제 생성 + 드라이브 폴더 생성
│       ├── GetAssignments.ts           # 과제 목록 조회
│       ├── GetSubmissions.ts           # 제출 현황 조회 (Supabase)
│       ├── DeleteAssignment.ts         # 과제 삭제
│       └── CopyMissingList.ts          # 미제출자 목록 텍스트 생성
│
├── adapters/
│   ├── components/
│   │   └── Tools/Assignment/
│   │       ├── AssignmentTool.tsx       # 도구 진입점 (과제 목록)
│   │       ├── AssignmentCreateModal.tsx # 과제 생성 모달
│   │       ├── AssignmentDetail.tsx     # 제출 현황 상세
│   │       ├── DriveFolderInput.tsx     # 드라이브 폴더명 입력 UI
│   │       ├── OfflineNotice.tsx        # 오프라인 안내 UI
│   │       └── ShareLinkModal.tsx       # QR + 링크 공유 모달
│   ├── stores/
│   │   └── useAssignmentStore.ts       # Zustand 스토어
│   └── repositories/
│       └── JsonAssignmentRepository.ts # 로컬 JSON 저장소 구현체
│
├── infrastructure/
│   └── google/
│       ├── GoogleOAuthClient.ts        # (기존) scope 추가
│       ├── GoogleDriveClient.ts        # (신규) Drive API 클라이언트
│       └── GoogleCalendarApiClient.ts  # (기존)
│
└── App.tsx                             # 라우팅에 Assignment 도구 추가
```

### 4.3 학생 제출 페이지 (Next.js 랜딩 프로젝트)

기존 쌤핀 랜딩 페이지 프로젝트(`ssampin.com`)에 `/submit` 경로를 추가한다.
Next.js App Router 구조를 따른다.

```
landing/
├── src/
│   ├── app/
│   │   └── submit/
│   │       └── [id]/
│   │           └── page.tsx           # 학생 제출 메인 페이지 (서버 컴포넌트)
│   └── components/
│       └── submit/
│           ├── SubmitForm.tsx         # 제출 폼 (클라이언트 컴포넌트)
│           ├── SubmitSuccess.tsx      # 제출 완료
│           ├── SubmitExpired.tsx      # 마감됨
│           ├── OfflineNotice.tsx      # 오프라인 안내
│           └── submitApi.ts          # Supabase Edge Function 호출
```

**URL 구조**: `https://ssampin.com/submit/{assignment_id}`

### 4.4 Supabase 구성

#### Edge Function: `get-assignment-public` (학생 제출 페이지용)

```typescript
// 학생 제출 페이지에서 과제 정보 조회 — 민감 정보 제외
async function handleGetAssignmentPublic(req: Request) {
  const { assignmentId } = await req.json();

  // service_role로 DB 조회 (RLS 우회)
  const assignment = await getAssignment(assignmentId);
  if (!assignment) {
    return error(404, '과제를 찾을 수 없습니다');
  }

  // 민감 정보 제외, 필요한 필드만 반환
  return success({
    id: assignment.id,
    title: assignment.title,
    description: assignment.description,
    deadline: assignment.deadline,
    fileTypeRestriction: assignment.file_type_restriction,
    allowLate: assignment.allow_late,
    allowResubmit: assignment.allow_resubmit,
    // student_list에서 이름/번호만 반환 (id 제외)
    students: assignment.student_list.map(
      (s: { number: number; name: string }) => ({ number: s.number, name: s.name })
    ),
  });
  // ❌ admin_key, teacher_id, student_list의 id는 절대 반환하지 않음
}
```

#### Edge Function: `create-assignment` (교사 과제 생성)

```typescript
// 교사 과제 생성 — Google access_token으로 교사 인증
async function handleCreateAssignment(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const googleAccessToken = authHeader?.replace('Bearer ', '');

  // 1. Google userinfo API로 교사 이메일 검증
  const teacherEmail = await verifyGoogleToken(googleAccessToken);
  if (!teacherEmail) {
    return error(401, '인증에 실패했습니다');
  }

  const body = await req.json();

  // 2. admin_key 랜덤 생성
  const adminKey = crypto.randomUUID();

  // 3. 과제 DB 저장 (service_role로 RLS 우회)
  const assignment = await insertAssignment({
    teacher_id: teacherEmail,
    admin_key: adminKey,
    ...body,
  });

  return success({ id: assignment.id, adminKey });
}
```

#### Edge Function: `submit-assignment` (학생 제출)

```typescript
// 학생 제출 처리
async function handleSubmit(req: Request) {
  const { assignmentId, studentId, studentNumber, studentName, file } = await parseForm(req);

  // 0. 파일 크기 체크 (MVP: 10MB 제한)
  if (file.size > 10 * 1024 * 1024) {
    return error(400, '파일 크기는 10MB 이하만 가능합니다');
  }

  // 1. 과제 정보 조회 (DB, service_role)
  const assignment = await getAssignment(assignmentId);

  // 2. 마감 체크
  if (isPastDeadline(assignment) && !assignment.allowLate) {
    return error(403, '마감되었습니다');
  }

  // 3. 재제출 체크
  if (!assignment.allowResubmit && hasSubmitted(assignmentId, studentNumber)) {
    return error(403, '이미 제출되었습니다');
  }

  // 4. 파일 형식 체크
  if (!isAllowedFileType(file, assignment.fileTypeRestriction)) {
    return error(400, '허용되지 않는 파일 형식입니다');
  }

  // 5. 교사 OAuth 토큰 조회 + AES-256-GCM 복호화
  const tokenRecord = await getTeacherToken(assignment.teacherId);
  const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
  let accessToken = decryptToken(
    tokenRecord.encrypted_access_token,
    tokenRecord.access_iv,
    tokenRecord.access_tag,
    encryptionKey,
  );

  // 6. 토큰 만료 시 refresh (최대 1회 리트라이)
  if (isTokenExpired(tokenRecord.expires_at)) {
    const refreshToken = decryptToken(
      tokenRecord.encrypted_refresh_token,
      tokenRecord.refresh_iv,
      tokenRecord.refresh_tag,
      encryptionKey,
    );
    try {
      const newTokens = await refreshGoogleToken(refreshToken);
      await updateTeacherToken(assignment.teacherId, newTokens, encryptionKey);
      accessToken = newTokens.access_token;
    } catch (e) {
      // 경쟁 조건으로 다른 인스턴스가 이미 갱신했을 수 있음 → DB에서 재조회
      const retryRecord = await getTeacherToken(assignment.teacherId);
      accessToken = decryptToken(
        retryRecord.encrypted_access_token,
        retryRecord.access_iv,
        retryRecord.access_tag,
        encryptionKey,
      );
    }
  }

  // 7. 구글 드라이브 업로드
  const driveFile = await uploadToDrive(accessToken, {
    folderId: assignment.driveFolderId,
    fileName: `${String(studentNumber).padStart(2,'0')}_${studentName}_${file.name}`,
    file: file,
  });

  // 8. 메타데이터 저장 (upsert)
  await saveSubmission({
    assignment_id: assignmentId,
    student_id: studentId || null,
    student_number: studentNumber,
    student_name: studentName,
    submitted_at: new Date(),
    file_name: file.name,
    file_size: file.size,
    drive_file_id: driveFile.id,
    is_late: isPastDeadline(assignment),
  });

  return success('제출 완료');
}
```

#### Edge Function: `get-submissions` (교사 조회용)

```typescript
// 교사 제출 현황 조회 — admin_key 인증
async function handleGetSubmissions(req: Request) {
  const { assignmentId, adminKey } = await req.json();

  // admin_key 검증 (service_role로 DB 조회)
  const assignment = await getAssignment(assignmentId);
  if (assignment.admin_key !== adminKey) {
    return error(403, '접근 권한이 없습니다');
  }

  const submissions = await getSubmissions(assignmentId);
  return success(submissions);
}
```

#### DB 테이블

```sql
-- 과제 정보 (교사가 생성)
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id TEXT NOT NULL,              -- Google OAuth 이메일
  admin_key TEXT NOT NULL,               -- 랜덤 생성 키 (교사 조회용)
  title TEXT NOT NULL,
  description TEXT,
  deadline TIMESTAMPTZ NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'class',  -- MVP: 'class'만 지원
  target_name TEXT NOT NULL,             -- '1학년 3반'
  student_list JSONB NOT NULL,           -- [{id: 'abc', number: 1, name: '김민수'}, ...]
  drive_folder_id TEXT NOT NULL,
  drive_root_folder_id TEXT,             -- "쌤핀 과제" 루트 폴더 ID
  file_type_restriction TEXT NOT NULL DEFAULT 'all',
  allow_late BOOLEAN NOT NULL DEFAULT true,
  allow_resubmit BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 제출 기록
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  student_id TEXT,                        -- Student.id (nullable: 명단 외 학생)
  student_number INTEGER NOT NULL,
  student_name TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  drive_file_id TEXT,
  is_late BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(assignment_id, student_number)   -- 학생당 1건 (재제출 시 upsert)
);

-- 교사 OAuth 토큰 (AES-256-GCM 암호화 저장)
-- ⚠️ access_token과 refresh_token은 각각 별도의 IV/tag를 사용해야 함
--    (같은 키+같은 IV로 두 평문을 암호화하면 AES-GCM 보안이 깨짐)
CREATE TABLE teacher_tokens (
  teacher_id TEXT PRIMARY KEY,            -- Google OAuth 이메일
  encrypted_access_token TEXT NOT NULL,
  access_iv TEXT NOT NULL,                -- access_token용 AES-GCM IV (Base64)
  access_tag TEXT NOT NULL,               -- access_token용 AES-GCM 인증 태그 (Base64)
  encrypted_refresh_token TEXT NOT NULL,
  refresh_iv TEXT NOT NULL,               -- refresh_token용 AES-GCM IV (Base64)
  refresh_tag TEXT NOT NULL,              -- refresh_token용 AES-GCM 인증 태그 (Base64)
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS 정책: 모든 테이블 직접 접근 차단 → Edge Function (service_role)을 통해서만 접근
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_tokens ENABLE ROW LEVEL SECURITY;

-- assignments: 직접 접근 전면 차단 (student_list에 학생 개인정보, admin_key 포함)
-- 학생 제출 페이지는 get-assignment-public Edge Function을 통해 필요한 필드만 조회
CREATE POLICY "deny_all_assignments" ON assignments
  FOR ALL USING (false);

-- submissions: 직접 접근 전면 차단
-- INSERT/SELECT 모두 Edge Function (service_role)을 통해서만 처리
CREATE POLICY "deny_all_submissions" ON submissions
  FOR ALL USING (false);

-- teacher_tokens: 모든 직접 접근 차단 (Edge Function service_role로만 접근)
CREATE POLICY "deny_all_teacher_tokens" ON teacher_tokens
  FOR ALL USING (false);
```

---

## 5. 데이터 모델

### 5.1 Assignment 엔티티 (Domain)

```typescript
interface Assignment {
  id: string;                           // UUID
  title: string;                        // 과제 제목
  description?: string;                 // 설명
  deadline: string;                     // ISO 8601 마감일시
  target: {
    type: 'class';                      // MVP: 학급만 지원
    name: string;                       // '1학년 3반'
    students: StudentInfo[];            // 학생 명단
  };
  driveFolder: {
    id: string;                         // Google Drive 폴더 ID (서브폴더)
    name: string;                       // 폴더명
    rootFolderId?: string;              // "쌤핀 과제" 루트 폴더 ID
  };
  fileTypeRestriction: 'all' | 'image' | 'document';
  allowLate: boolean;
  allowResubmit: boolean;
  shareUrl: string;                     // https://ssampin.com/submit/{id}
  adminKey: string;                     // 교사 조회용 랜덤 키
  createdAt: string;
}

// Student 엔티티 기반 (좌석배치 호환)
interface StudentInfo {
  id: string;                           // Student.id (고유 식별자)
  number: number;                       // 배열 인덱스+1 (좌석배치 방식과 동일)
  name: string;                         // Student.name
}

interface Submission {
  id: string;
  assignmentId: string;
  studentId?: string;                   // Student.id (명단 외 학생은 null)
  studentNumber: number;
  studentName: string;
  submittedAt: string;
  fileName: string;
  fileSize: number;
  driveFileId?: string;
  isLate: boolean;
}

type SubmissionStatus = 'submitted' | 'late' | 'missing';
```

### 5.2 로컬 저장 (JSON)

```json
// assignments.json — 교사 PC 로컬
{
  "assignments": [
    {
      "id": "uuid-1",
      "title": "독서감상문",
      "description": "1학기 독서 과제",
      "deadline": "2026-03-15T23:59:00+09:00",
      "target": {
        "type": "class",
        "name": "1학년 3반",
        "students": [
          { "id": "stu-abc", "number": 1, "name": "김민수" },
          { "id": "stu-def", "number": 2, "name": "이서연" }
        ]
      },
      "driveFolder": {
        "id": "1AbCdEfGhIjKlMnOpQrStUvWxYz",
        "name": "독서감상문_20260309",
        "rootFolderId": "1RootFolderIdHere"
      },
      "fileTypeRestriction": "document",
      "allowLate": true,
      "allowResubmit": true,
      "shareUrl": "https://ssampin.com/submit/uuid-1",
      "adminKey": "rnd-admin-key-abc123",
      "createdAt": "2026-03-09T14:00:00+09:00"
    }
  ]
}
```

---

## 6. Google Drive API 연동

### 6.1 OAuth Scope 추가

기존 Calendar scope에 Drive scope 추가:

```typescript
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',   // 기존
  'https://www.googleapis.com/auth/drive.file',          // 신규: 앱이 생성한 파일만 접근
];
```

`drive.file` scope는 앱이 생성하거나 열어준 파일만 접근 가능 → 교사의 전체 드라이브를 볼 수 없어서 보안상 안전.

### 6.2 GoogleDriveClient 주요 메서드

```typescript
class GoogleDriveClient {
  // "쌤핀 과제" 루트 폴더 조회 또는 생성
  async getOrCreateRootFolder(): Promise<DriveFolder>;
  
  // 서브폴더 생성 (과제별)
  async createSubFolder(name: string, parentId: string): Promise<DriveFolder>;
  
  // 파일 업로드
  async uploadFile(folderId: string, fileName: string, file: Blob): Promise<DriveFile>;
  
  // 파일 덮어쓰기 (재제출)
  async updateFile(fileId: string, file: Blob): Promise<DriveFile>;
  
  // 폴더 내 파일 목록
  async listFiles(folderId: string): Promise<DriveFile[]>;
}
```

### 6.3 폴더명 입력 UI

```
┌── 구글 드라이브 저장 폴더 ──────────────────────────┐
│                                                      │
│  저장 위치: 쌤핀 과제 / [독서감상문_20260309     ]    │
│                         ↑ 자동 채워짐, 수정 가능     │
│                                                      │
│  ※ "쌤핀 과제" 폴더 하위에 자동 생성됩니다            │
│  ※ 첫 사용 시 "쌤핀 과제" 루트 폴더가 생성됩니다      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

`drive.file` scope 제한으로 앱이 생성한 폴더만 접근 가능하므로, 복잡한 폴더 피커 대신 **폴더명 직접 입력** 방식을 사용한다. 교사가 기존 드라이브 폴더를 선택하려면 `drive` 전체 scope가 필요하며, 이는 Google 검증이 필요하므로 MVP에서는 지원하지 않는다.

---

## 7. 학생 제출 페이지

### 7.1 화면 구성

#### 제출 폼 화면

```
┌──────────────────────────────────┐
│         📝 쌤핀 과제수합          │
│                                  │
│  독서감상문                       │
│  1학기 자유 독서 후 감상문을 작성  │
│  하여 제출하세요.                 │
│                                  │
│  마감: 2026년 3월 15일 23:59     │
│  남은 시간: 6일 9시간             │
│                                  │
│  ─────────────────────────────  │
│                                  │
│  번호  [    ]                     │
│  이름  [    ] (자동완성)           │
│                                  │
│  파일  [📎 파일 선택]             │
│        또는 [📷 카메라 촬영]      │
│        허용: PDF, HWP, DOCX      │
│                                  │
│  ──────────────────────────────  │
│                                  │
│        [ 📤 제출하기 ]            │
│                                  │
│  Powered by 쌤핀                 │
└──────────────────────────────────┘
```

#### 제출 완료 화면

```
┌──────────────────────────────────┐
│                                  │
│           ✅                     │
│     제출되었습니다!               │
│                                  │
│  과제: 독서감상문                 │
│  이름: 2번 이서연                 │
│  파일: 감상문_이서연.pdf          │
│  시간: 2026/3/9 15:01            │
│                                  │
│  ──────────────────────────────  │
│  ⚠️ 잘못 제출했다면 다시 제출     │
│     할 수 있습니다.               │
│                                  │
│        [ 🔄 다시 제출 ]           │
│                                  │
└──────────────────────────────────┘
```

#### 마감 화면

```
┌──────────────────────────────────┐
│                                  │
│           🚫                     │
│     마감되었습니다                │
│                                  │
│  과제: 독서감상문                 │
│  마감: 2026년 3월 15일 23:59     │
│                                  │
│  선생님께 문의하세요.             │
│                                  │
└──────────────────────────────────┘
```

#### 오프라인 화면

```
┌──────────────────────────────────┐
│                                  │
│           📡                     │
│   인터넷 연결이 필요합니다         │
│                                  │
│  과제 제출은 온라인에서만           │
│  가능합니다.                      │
│                                  │
│  인터넷 연결을 확인한 후           │
│  다시 시도해주세요.                │
│                                  │
│        [ 🔄 다시 시도 ]           │
└──────────────────────────────────┘
```

### 7.2 학생 이름 자동완성

- 번호 입력 시 → 해당 번호의 이름 자동 표시
- 이름 입력 시 → 명단에서 자동완성 제안
- 명단에 없는 이름/번호 → "명단에 없는 학생입니다" 경고 (제출은 허용)
- 학생 명단은 과제 생성 시 Supabase DB에 함께 저장되어 있으므로, 학생 페이지에서 조회 가능

### 7.3 파일 업로드

- 최대 파일 크기: **10MB** (Supabase Edge Function body 크기 제한 고려)
  - Google Drive API 자체는 25MB까지 단순 업로드 지원
  - Edge Function 경유 시 body 크기 제한이 있으므로 MVP에서는 10MB로 제한
  - Phase 4에서 Presigned URL 방식으로 25MB 지원 예정
- 모바일: 카메라 촬영 직접 업로드 지원 (`capture="environment"`)
- 업로드 진행률 표시 (프로그레스 바)
- 네트워크 오류 시 재시도 안내

---

## 8. 보안

### 8.1 교사 토큰 보호

- OAuth access/refresh token은 **Supabase DB에 AES-256-GCM으로 암호화 저장**
  - 암호화 키: Edge Function 환경변수 `ENCRYPTION_KEY` (AES-256, 32바이트)
  - **각 토큰은 별도의 IV/tag를 사용** (같은 키+같은 IV로 두 평문 암호화 시 보안 깨짐)
  - access_token 저장: `encrypt(token, key)` → `{ciphertext, access_iv, access_tag}`
  - refresh_token 저장: `encrypt(token, key)` → `{ciphertext, refresh_iv, refresh_tag}`
  - 복호화: `decrypt(ciphertext, key, iv, tag)` → 원본 토큰 복원
- Edge Function만 토큰에 접근 가능 (클라이언트 노출 없음)
- 학생 페이지에서는 과제 ID만으로 제출 → 토큰은 서버 사이드에서 처리

### 8.2 교사 인증 체계

- `teacher_id` = Google OAuth 이메일 (예: `teacher@gmail.com`)
- 과제 생성 시 `admin_key` 랜덤 발급 (crypto.randomUUID 기반)
- 제출 현황 조회 시 `admin_key`로 교사 본인 확인
- Supabase RLS로 직접 DB 접근 차단, Edge Function(service_role)을 통해서만 데이터 접근

### 8.3 과제 접근 제어

- 과제 ID는 UUID v4 → 추측 불가
- 마감된 과제 (지각 미허용) → 제출 차단
- Rate limiting: 같은 IP에서 분당 10회 제출 제한 (악용 방지)

### 8.4 파일 검증

- MIME type 서버 측 검증
- 파일 크기 검증 (10MB 이하, Phase 4에서 25MB 확대 예정)
- 악성 파일 확장자 차단 (.exe, .bat, .cmd, .ps1 등)

---

## 9. 비용 분석

| 항목 | 비용 | 근거 |
|------|------|------|
| 파일 저장 | **0원** | 교사 구글 드라이브 (15GB 무료) |
| Supabase DB | **0원** | 메타데이터만, 500MB 무료 |
| Supabase Edge Function | **0원** | 월 50만 건 무료 |
| 학생 페이지 호스팅 | **0원** | 기존 Vercel 배포에 포함 |
| Google API | **0원** | Drive API 무료 |
| **월간 총 비용** | **0원** | |

**한계점**: 교사 구글 드라이브 15GB 소진 시 → 교사가 정리하거나 Google One 구독 필요

---

## 10. 개발 로드맵

### Phase 1: 핵심 기능 (1주)

- [ ] Domain 레이어: Assignment 엔티티 (StudentInfo에 id 포함), VO, Repository 인터페이스
- [ ] GoogleDriveClient 구현 (OAuth scope 추가, 루트 폴더 자동 생성, 서브폴더 CRUD)
- [ ] UseCase 레이어: CreateAssignment (admin_key 발급), GetAssignments, GetSubmissions
- [ ] Supabase: 테이블 생성 (RLS 포함), Edge Function 배포 (토큰 암호화/복호화)
- [ ] 학생 제출 페이지 (landing/src/app/submit/[id]/page.tsx)

### Phase 2: UI 구현 (1주)

- [ ] 도구 그리드에 과제수합 카드 추가
- [ ] AssignmentTool 과제 목록 페이지
- [ ] AssignmentCreateModal 과제 생성 모달 (학급 명단만)
- [ ] DriveFolderInput 폴더명 입력 UI
- [ ] AssignmentDetail 제출 현황 대시보드 (30초 폴링)
- [ ] ShareLinkModal QR + 링크 공유 (기존 QR 컴포넌트 재사용)
- [ ] OfflineNotice 오프라인 안내 UI

### Phase 3: 부가 기능 (3일)

- [ ] 지각 제출 처리
- [ ] 재제출 처리
- [ ] 파일 형식 제한
- [ ] 미제출자 목록 복사
- [ ] 학생 이름 자동완성

### Phase 4 (향후): 고도화

- [ ] **수업별 학생 명단 지원** (useScheduleStore 확장 필요)
- [ ] **파일 크기 25MB 지원** (Presigned URL 방식: Edge Function이 Drive upload URL 발급 → 학생 브라우저에서 직접 업로드)
- [ ] **Supabase Realtime** (실시간 제출 알림 → 폴링 대체)
- [ ] 교사 피드백/코멘트
- [ ] 채점 (점수 입력)
- [ ] 텍스트 직접 입력 제출
- [ ] 과제 템플릿 저장
- [ ] 학교+반+번호 간편 인증 (3단계 전환)
- [ ] 구글 드라이브 백업 옵션 → 로컬 저장 선택지 추가

---

## 11. 기존 코드 영향도

| 파일/모듈 | 변경 사항 |
|-----------|-----------|
| `GoogleOAuthClient.ts` | Drive scope 추가 |
| `App.tsx` | 과제 도구 라우팅 추가 |
| `global.d.ts` | 신규 IPC 추가 불필요 (기존 OAuth IPC 재사용) |
| `도구 그리드 컴포넌트` | 과제수합 카드 1개 추가 |
| `.env.example` | Supabase 관련 변수 (이미 존재) |
| `package.json` | 신규 의존성 없음 (기존 패키지로 충분) |
| `landing/` | `/submit/[id]` 페이지 + 컴포넌트 추가 (Next.js) |

**기존 코드 수정 최소화**: GoogleOAuthClient scope 추가 + 도구 그리드에 카드 추가 정도.
나머지는 전부 신규 파일 추가.

---

## 12. 제약사항 및 참고

### 12.1 Google Drive API 제약
- `drive.file` scope: 앱이 생성한 파일/폴더만 접근 가능
- 단순 업로드: 25MB 이하 (멀티파트: 5TB까지 가능하나 MVP에서는 Edge Function 경유로 **10MB 제한**)
- API 호출 한도: 일 10억 건 (사실상 무제한)

### 12.2 Supabase 무료 티어 제약
- DB: 500MB, Edge Function: 월 50만 호출
- 학교 1개 기준 하루 과제 5개 × 학생 30명 = 150건/일 → **충분**

### 12.3 인터넷 연결 필수
- 과제수합 기능은 Supabase + Google Drive API에 의존하므로 **온라인에서만 동작**
- 오프라인 감지 시 교사 앱, 학생 제출 페이지 모두 안내 UI 표시
- 로컬 캐싱/오프라인 큐는 Phase 4 이후 검토

### 12.4 Google OAuth 100명 제한
- Google OAuth 검증 미완료 시 테스트 사용자 100명으로 제한
- MVP 단계에서는 테스트 사용자로 운영
- 정식 배포 전 Google OAuth 검증 완료 필요 (1.5절 참조)

### 12.5 향후 확장 시 고려사항
- 사용자 수 증가 시 Supabase 유료 전환 필요 가능
- 교사 여러 명이 사용 시 teacher_id 기반 멀티테넌시 자연 지원