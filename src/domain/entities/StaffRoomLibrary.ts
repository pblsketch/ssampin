/**
 * 온라인 교무실 — 자료실 엔티티 (M3)
 *
 * 계획서: docs/01-plan/features/online-staffroom.plan.md
 *   §3.2.1 올리는 길만이 아니라 **읽는 길도** 서버를 거쳐야 한다
 *   §3.4-가 미리보기·검색 글자도 드라이브에 둔다 (서버에 쌓지 않는다)
 *   §3.4-나 내려받기는 서버가 **권한만 주고 빠진다**
 *   §4     kordoc 미리보기 · pptx 는 구글 뷰어 · HTML 은 격리
 *   §8-C   같은 파일 새 버전 · 부서 용량 표시
 *   §10.6  파일당 200MB 상한
 *
 * ── 이 파일이 다루지 않는 것 ────────────────────────────────────────
 * 파일의 **바이트**는 여기에도, 쌤핀 서버에도 남지 않는다. 원본도 미리보기 글자도
 * 전부 관리자 선생님의 구글 드라이브에 있고, 이 엔티티는 **그 파일을 가리키는 표찰**만
 * 들고 있다(드라이브 파일 id · 이름 · 크기 · 올린 사람).
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */

/**
 * 자료실에 올라온 파일 하나.
 *
 * `driveFileId` 는 **관리자 드라이브의 파일 id** 다. 멤버가 이걸 그대로 열 수는 없다 —
 * `drive.file` 권한은 계정마다 따로 걸리므로(§3.2.1), 내려받으려면 서버에 부탁해
 * 내 지메일에 읽기 권한을 받아야 한다(§3.4-나).
 */
export interface StaffRoomFile {
  readonly id: string;
  readonly departmentId: string;
  readonly moduleId: string;
  /** 관리자 드라이브의 파일 id. 이것만으로는 멤버가 열 수 없다 */
  readonly driveFileId: string;
  readonly name: string;
  readonly mimeType: string;
  /** 바이트 수 */
  readonly size: number;
  readonly uploaderEmail: string;
  /** 올린 사람이 부서에서 쓰는 이름. 안 정했으면 null 이고 화면이 지메일을 보여준다 */
  readonly uploaderName: string | null;
  readonly uploadedAt: string;
  /** 몇 번째 판인가. 새 버전을 올리면 1씩 오른다(§8-C) */
  readonly version: number;
  /**
   * 미리보기 글자가 담긴 드라이브 파일 id. 아직 안 뽑았거나 뽑을 수 없는 종류면 null.
   * 글자 자체는 서버에 없다(§3.4-가) — 각 선생님 PC 가 드라이브에서 받아 둔다.
   */
  readonly previewFileId: string | null;
  /** 미리보기 글자 크기(바이트). 받아 둘지 판단할 때 쓴다 */
  readonly previewSize: number;
}

/** 이전 판 — 새 버전을 올리면 접혀 들어간다(§8-C "최종_최종2_진짜최종" 문제) */
export interface StaffRoomFileVersion {
  readonly id: string;
  readonly fileId: string;
  readonly version: number;
  readonly driveFileId: string;
  readonly name: string;
  readonly size: number;
  readonly uploaderEmail: string;
  readonly uploaderName: string | null;
  readonly uploadedAt: string;
}

/**
 * 파일을 어떻게 보여줄 것인가.
 *
 * 계획서 §4 의 실측 결과를 그대로 옮긴 것이다.
 *  - `text`   kordoc 이 글자·표를 뽑을 수 있다 (hwp · hwpx · docx · xls · xlsx · pdf)
 *  - `image`  그대로 표시
 *  - `viewer` kordoc 파서 목록에 없어 구글 뷰어로 띄운다 (pptx)
 *  - `html`   미니앱과 같은 격리 칸에서 연다 (§4.2)
 *  - `none`   미리볼 방법이 없다. 내려받아서 본다
 */
export type StaffRoomPreviewKind = 'text' | 'image' | 'viewer' | 'html' | 'none';

/** 미리보기 글자 — 드라이브에서 받아 각 선생님 PC 에 둔다(§3.4-가) */
export interface StaffRoomFilePreview {
  readonly fileId: string;
  /** kordoc 이 뽑은 마크다운. 앞부분 5만 자까지만(§3.4-다) */
  readonly text: string;
  /** 5만 자에서 잘렸는가 — 화면이 "뒷부분은 내려받아 보세요"라고 알린다 */
  readonly truncated: boolean;
  /** 이 글자를 뽑은 시각 */
  readonly extractedAt: string;
}

/** 부서가 관리자 드라이브에서 쓰고 있는 용량 (§8-C · §10.6) */
export interface StaffRoomStorageUsage {
  /** 이 부서 자료실이 쓰는 바이트 */
  readonly departmentBytes: number;
  /** 관리자 드라이브 전체 사용량 — 부서 자료 말고 그 선생님 개인 파일까지 포함 */
  readonly driveUsedBytes: number;
  /** 관리자 드라이브 총 용량 (보통 15GB) */
  readonly driveLimitBytes: number;
}

/** 업로드를 시작하기 위해 서버에서 받은 것 (§3.4-나 의 올리기 판) */
export interface StaffRoomUploadTicket {
  /**
   * 구글이 내준 업로드 세션 주소.
   *
   * ★ 파일 바이트는 이 주소로 **구글에 곧장** 간다. 쌤핀 서버를 통과하지 않는다.
   *   무료 등급 전송량 5GB 를 자료실이 혼자 먹지 않게 하는 핵심이다(§3.4).
   */
  readonly uploadUrl: string;
  /** 업로드를 마친 뒤 서버에 알려줄 때 쓰는 표 */
  readonly ticketId: string;
}

/** 파일 올리기 입력 */
export interface UploadStaffRoomFileInput {
  readonly moduleId: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  /** 새 판으로 올릴 때 — 덮을 파일 id. 새 파일이면 null */
  readonly replacesFileId: string | null;
}

/** 자료실 검색 결과 한 줄 (§8-A 부서 전체 검색) */
export interface StaffRoomSearchHit {
  /** 무엇에서 찾았는가 */
  readonly kind: 'post' | 'file';
  readonly id: string;
  readonly moduleId: string;
  readonly title: string;
  /** 찾은 낱말 주변 글자 — 어디서 걸렸는지 보여준다 */
  readonly snippet: string;
  /** 파일 본문에서 걸렸는가(제목이 아니라) */
  readonly matchedInContent: boolean;
  readonly updatedAt: string;
}

// ══════════════════════════════════════════════════════════════════
// 상한과 기준값
// ══════════════════════════════════════════════════════════════════

/**
 * 파일 하나의 크기 상한 — **200MB** (§10.6 오너 결정).
 *
 * 자료는 관리자 선생님의 **개인** 드라이브 15GB 에 쌓인다. 상한이 없으면 멤버 누구나
 * 그 선생님의 드라이브를 채울 수 있고, 드라이브가 차면 교무실만 멈추는 게 아니라
 * **그 선생님의 지메일 수신과 쌤핀 동기화까지 함께 멈춘다.**
 */
export const STAFFROOM_FILE_MAX_BYTES = 200 * 1024 * 1024;

/**
 * 미리보기로 저장하는 글자 수 상한 — 앞부분 5만 자 (§3.4-다).
 *
 * 실측(계획서 §3.4-다): 학교 문서는 대부분 1~2KB 다. 평균 44KB 는 12만 자짜리
 * 생기부 문서 한 건이 끌어올린 값이라, 평균이 아니라 **상한으로** 관리한다.
 */
export const STAFFROOM_PREVIEW_MAX_CHARS = 50_000;

/**
 * 드라이브 용량 경고 문턱 — 80% (§8-C).
 *
 * 오너 결정대로 **막지는 않는다.** 인위적 상한을 두지 않되 보이지 않게 두지도 않는다.
 */
export const STAFFROOM_STORAGE_WARN_RATIO = 0.8;

/** 파일 이름 최대 길이 */
export const STAFFROOM_FILE_NAME_MAX_LENGTH = 200;
