export const FEATURE_FLAGS = {
  inlineAutosave: import.meta.env.VITE_FEATURE_INLINE_AUTOSAVE !== 'false',
  /**
   * 학생 얼굴 사진 기능 — 사진 명렬표 가져오기 · 얼굴 카드 · 매칭하기 · 이름 쓰기 · 사진 삭제 화면.
   *
   * **2026-08-20 출시 결정** — 수업반 지원과 실기기 확인이 모두 끝나 기본값을 켬으로 바꿨다.
   * (O7 조건 충족: 담임·수업반 두 경로 모두 동작 확인)
   *
   * ⚠️ **기본값이 켬이라는 뜻은 "빌드하면 나간다"는 뜻이다.**
   * 예전에는 `=== 'true'` 라서 `.env.local` 이 없는 빌드 서버에서는 항상 꺼진 채로 나갔다.
   * 다시 막아야 할 일이 생기면 `VITE_FEATURE_STUDENT_PHOTOS=false` 로 끌 수 있다.
   *
   * 이 스위치가 여는 입구는 5군데다:
   *   1. 학급 명렬 관리 > "사진 명렬표" 버튼 (`RosterManagementTab`)
   *   2. 설정 > 백업/복원 > 학생 사진 관리 (`BackupTab`)
   *   3. 담임 자리배치 > 이름 학습에 사진을 넘기는 통로 (`Seating`)
   *   4. 수업 관리 명렬 > "사진 명렬표" 버튼과 모달 (`ClassRosterTab`)
   *   5. 수업반 자리배치 > 이름 학습에 사진을 넘기는 통로 (`ClassSeatingTab`)
   *      → 사진이 안 넘어가면 "매칭하기"·"이름 쓰기" 모드는 스스로 잠기고 얼굴 카드도 안 뜬다.
   */
  studentPhotos: import.meta.env.VITE_FEATURE_STUDENT_PHOTOS !== 'false',
} as const;
