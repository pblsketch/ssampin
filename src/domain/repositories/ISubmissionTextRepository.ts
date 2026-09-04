/**
 * 제출 파일에서 뽑아낸 본문 **캐시** — 원본은 드라이브에 있고 이건 파생 자료다.
 *
 * 왜 두는가: 근거 창고가 읽는 제출 목록은 메모리에만 있어서, 캐시가 없으면 교사가 과제 상세를
 * 열 때마다 학급 전체의 제출 파일을 처음부터 다시 내려받는다(학교 회선에서 눈에 띄는 비용).
 *
 * ★엔티티(`src/domain/entities/`)가 아니라 여기 두는 이유: `Submission` 은 서버에서 오는 기록이고
 *  이건 우리 기기에서 만든 캐시라 수명·소유가 다르다. 동기화(syncRegistry)에도 넣지 않는다 —
 *  학생이 쓴 원문을 기기 사이로 실어 나르는 것은 별개의 결정이다.
 */

/**
 * 추출 결과의 상태. **"본문이 없다"의 이유가 서로 다르다** — 이유를 안 남기면 교사가
 * 고칠 수 없는 것에 [다시 시도]를 누르게 된다.
 */
export type SubmissionTextStatus =
  /** 본문을 뽑았다. */
  | 'ok'
  /** 글자를 뽑을 수 있는 형식이 아니다(사진·zip·영상·txt 등) — 내려받지도 않았다. */
  | 'unsupported'
  /** 사진 파일이다 — 내려받지 않았다. */
  | 'image_only'
  /** 너무 커서 건너뛰었다. */
  | 'too_large'
  /** 문서는 열렸는데 글자가 사실상 없다(빈 문서). */
  | 'empty'
  /** 사진으로만 된 문서(스캔본)라 글자가 없다. */
  | 'scanned'
  /** 드라이브에 파일이 없다(교사가 지움) — 다시 시도해도 낫지 않는다. */
  | 'missing'
  /** 실패했다 — 잠시 뒤 다시 해볼 수 있다. */
  | 'failed';

export interface SubmissionTextRecord {
  readonly submissionId: string;
  readonly assignmentId: string;
  readonly driveFileId: string;
  /**
   * 제출 시각. **재제출 감지의 핵심**이다 — 서버는 다시 낸 파일을 *같은* driveFileId 에
   * 덮어쓰고(`submit-assignment` 의 updateDriveFile) 이 값만 새로 쓴다. 그래서 파일 id 만
   * 보고 캐시를 판단하면 학생이 고쳐 낸 글이 옛 본문에 영원히 가린다.
   */
  readonly submittedAt: string;
  readonly fileSize: number;
  readonly status: SubmissionTextStatus;
  /** status==='ok' 일 때만 있다. */
  readonly text?: string;
  /** 시도 횟수 — 오프라인·데스크톱 아님처럼 "아직 못 해 본" 경우에는 올리지 않는다. */
  readonly attempts: number;
  /** ISO 8601 */
  readonly updatedAt: string;
}

export interface SubmissionTextsData {
  readonly records: readonly SubmissionTextRecord[];
}

export interface ISubmissionTextRepository {
  getSubmissionTexts(): Promise<SubmissionTextsData | null>;
  saveSubmissionTexts(data: SubmissionTextsData): Promise<void>;
}
