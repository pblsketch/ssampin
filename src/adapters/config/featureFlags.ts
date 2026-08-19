export const FEATURE_FLAGS = {
  inlineAutosave: import.meta.env.VITE_FEATURE_INLINE_AUTOSAVE !== 'false',
  /**
   * 학생 얼굴 사진 기능 — 사진 명렬표 가져오기 · 얼굴 카드 · 이름 쓰기 · 사진 삭제 화면.
   *
   * 구현과 QA 는 끝났지만 **수업반(교과) 사진 지원이 아직 없어** 담임 선생님만 쓸 수 있는
   * 반쪽 상태다. 그대로 내보내면 교과 담당 선생님에게는 안 되는 기능이 보이므로 출시를
   * 보류한다 (`docs/01-plan/features/photo-name-learning.plan.md` O7, 2026-08-19).
   *
   * 코드는 그대로 두고 **사용자가 닿는 입구만** 막는다 — 되돌릴 때 이 값 하나만 바꾸면 된다.
   * 막는 곳은 3군데뿐이다:
   *   1. 학급 명렬 관리 > "사진 명렬표" 버튼 (`RosterManagementTab`)
   *   2. 설정 > 백업/복원 > 학생 사진 관리 (`BackupTab`)
   *   3. 자리배치 > 이름 학습에 사진을 넘기는 통로 (`Seating`)
   *      → 사진이 안 넘어가면 "이름 쓰기" 모드는 스스로 잠기고 얼굴 카드도 안 뜬다.
   *
   * 개발·실기기 확인 중에는 `.env.local` 에 `VITE_FEATURE_STUDENT_PHOTOS=true` 를 넣어 켠다.
   */
  studentPhotos: import.meta.env.VITE_FEATURE_STUDENT_PHOTOS === 'true',
} as const;
