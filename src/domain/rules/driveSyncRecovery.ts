/**
 * 클라우드 백업을 "다시 만들어야만" 풀리는 동기화 오류를 가려낸다.
 *
 * ## 왜 필요한가
 *
 * SyncToCloud 는 장부(manifest)와 실제 Drive 파일이 어긋나면 **일부러 멈춘다**
 * (`SyncIntegrityError` 참고). 그대로 올리면 다른 기기 자료를 덮어쓸 수 있기 때문이다.
 * 문제는 그 다음이다 — 화면은 "클라우드 데이터를 다시 구성해 주세요"라고 하는데,
 * 정작 그 이름의 단추가 앱에 없었다. 실제 복구 경로는
 * 설정 → Google 통합 → 앱 데이터 백업 → 고급 설정 → 클라우드 데이터 전체 삭제 →
 * 지금 백업 실행 으로 네 겹 안쪽에 있었고, 선생님들은 거기까지 갈 수 없었다.
 *
 * ## 왜 화면이 아니라 여기서 판정하는가
 *
 * 오류는 store 를 거치며 문자열로 납작해진다(`error: err.message`). 그래서 화면이
 * 문구를 직접 뒤지는 수밖에 없는데, 그러면 던지는 쪽 문구를 한 글자만 고쳐도
 * 복구 단추가 조용히 사라진다. 그래서 **문구를 만드는 쪽과 판정하는 쪽을 한 파일에** 둔다.
 * SyncToCloud 는 아래 생성기를 쓰고, 화면은 아래 판정기를 쓴다. 둘은 어긋날 수 없다.
 *
 * ## 무엇을 일부러 제외하는가
 *
 * "원본 기기에서 …" 계열은 **이 기기에서 고치면 안 된다.** 그 자료를 올린 건 다른
 * 기기이고, 여기서 클라우드를 다시 만들면 그 기기의 자료가 사라진다. 문구 끝이 똑같이
 * "클라우드 데이터를 다시 구성해 주세요"라서 무심코 뭉뚱그리기 쉬운데, 뭉뚱그리는 순간
 * 안전장치가 데이터 유실 장치로 바뀐다.
 *
 * ## 알려진 한계 (일부러 좁게 둔 것)
 *
 * 충돌 해결 경로의 "체크섬이 장부와 일치하지 않습니다" 같은 문구도 뿌리는 같지만,
 * 여기서는 일부러 잡지 않는다. 넓게 잡을수록 **기다리면 풀릴 일에 클라우드를 통째로
 * 다시 만들게 할 위험**이 커진다. 좁게 틀려서 단추가 안 뜨면 선생님이 문의하면 되지만,
 * 넓게 틀려서 단추가 뜨면 자료가 사라진 뒤에야 안다. 두 오답의 무게가 다르다.
 */

/** 무결성 오류 문구 끝에 공통으로 붙는 안내. 판정의 표식 역할도 겸한다. */
export const CLOUD_REBUILD_HINT = '클라우드 데이터를 다시 구성해 주세요';

/**
 * 이 기기에서 복구하면 **안 되는** 계열의 표식.
 * 원본 기기가 따로 있으므로 여기서 클라우드를 다시 만들면 남의 자료가 사라진다.
 */
const ORIGIN_DEVICE_ONLY_MARKER = '원본 기기에서';

/**
 * 생성기를 거치지 않는 무결성 오류들 — v1 장부를 v2 로 옮기다 실패한 경우다.
 * DriveSyncAdapter(인프라)가 던지고 문구 형태가 달라, 표식 대신 형태로 알아본다.
 * 해결책은 같다: 클라우드를 다시 만든다.
 */
const LEGACY_INTEGRITY_PATTERNS: readonly RegExp[] = [
  /Google Drive의 이전 .+ 파일이 동기화 장부와 일치하지 않습니다/,
  /쌤핀 동기화 장부가 중복되어/,
];

/**
 * 장부 밖 파일이 "버려진 업로드"로 판정되기까지의 최소 나이 (조정 가능).
 *
 * 장부 밖 파일 = 드라이브에 있는데 원격 장부가 그 세대를 설명하지 못하는 파일.
 * 업로드 실행이 장부를 확정하기 전에 끊기면(창 닫기·절전·다른 기기의 장부 선점) 남는다.
 * 2026-11-08 실측: 다시 만들기가 101개를 올리고 장부 확정 전에 끊겨, 그 뒤 모든 동기화가
 * "클라우드 events 파일과 동기화 장부가 일치하지 않습니다"로 영원히 멈췄다.
 *
 * 이 나이보다 어리면 다른 기기가 지금 올리는 중일 수 있어 건드리지 않는다.
 * 업로드 실행은 장부를 중간중간 확정하므로(CHECKPOINT_EVERY_UPLOADS) 정상 실행이
 * 확정 없이 버티는 시간은 이보다 훨씬 짧다.
 */
export const ABANDONED_UPLOAD_MIN_AGE_MS = 30 * 60 * 1000;

/** 바이너리·아카이브를 이만큼 올릴 때마다 장부를 중간 확정한다 (조정 가능). */
export const CHECKPOINT_EVERY_UPLOADS = 5;

/**
 * 한 실행이 장부를 확인하지 않고 버틸 수 있는 최대 간격.
 *
 * 절전·백그라운드는 실행을 죽이지 않고 멈춘다. 멈춘 동안 다른 기기가 이 실행의 업로드를
 * "버려진 것"으로 보고 정리했을 수 있으므로, 깨어난 실행이 그대로 장부를 확정하면 실제
 * 파일과 다른 내용을 장부에 적는다. 그래서 간격이 이보다 길면 확정하지 않고 멈춘다.
 * 버려진 업로드 판정 나이의 절반이라, 다른 기기가 정리에 손대기 전에 반드시 걸린다.
 */
export const SYNC_RUN_LEASE_MS = ABANDONED_UPLOAD_MIN_AGE_MS / 2;

/**
 * 버려진 업로드를 장부에 편입할 때 적는 업로드 기기 표식.
 * 누가 올렸는지 알 수 없다. 비워 두면 받기 쪽이 장부 최상위 deviceId(= 편입한 이 기기)로
 * 채워 "내가 올린 데이터"로 오판해 받지 않는다.
 */
export const UNKNOWN_UPLOADER = 'unknown-abandoned-upload';

/** 실행이 오래 멈췄다가 이어졌을 때 — 일시 오류다(복구 단추 대상 아님). */
export const SYNC_RUN_LEASE_EXPIRED_MESSAGE =
  '동기화가 중간에 오래 멈춰 있었습니다. 안전을 위해 이번 동기화를 멈췄습니다. 다시 동기화해 주세요.';

export type UnledgeredFileAge = 'abandoned' | 'recent' | 'unknown';

/**
 * 장부 밖 파일의 나이를 가른다.
 * - 'abandoned': 버려진 업로드 — 멈추지 않고 정리해도 된다.
 * - 'recent': 다른 기기가 올리는 중일 수 있다 — 이번 회차는 건너뛴다.
 * - 'unknown': 수정 시각을 알 수 없다 — 판정할 수 없으니 기존처럼 멈춘다.
 *
 * nowMs 는 이 기기의 시계, modifiedTime 은 구글 서버 시계다. 둘이 기준보다 크게
 * 어긋나면 틀릴 수 있다(알고 받아들인 한계). 미래 시각은 'recent' 로 본다.
 */
export function classifyUnledgeredFileAge(modifiedTime: string, nowMs: number): UnledgeredFileAge {
  if (!modifiedTime) return 'unknown';
  const modifiedMs = Date.parse(modifiedTime);
  if (Number.isNaN(modifiedMs)) return 'unknown';
  return nowMs - modifiedMs > ABANDONED_UPLOAD_MIN_AGE_MS ? 'abandoned' : 'recent';
}

/** 장부와 실제 클라우드 파일의 내용이 다를 때. target 예: 'events', '아카이브' */
export function buildManifestMismatchMessage(target: string): string {
  return `클라우드 ${target} 파일과 동기화 장부가 일치하지 않습니다. ${CLOUD_REBUILD_HINT}.`;
}

/** 같은 이름의 클라우드 파일이 둘 이상이라 무엇이 진짜인지 알 수 없을 때. */
export function buildDuplicateFileMessage(target: string): string {
  return `클라우드 ${target} 파일이 중복되어 안전하게 동기화할 수 없습니다. ${CLOUD_REBUILD_HINT}.`;
}

/**
 * 이 오류가 "이 기기에서 클라우드를 다시 만들면 풀리는" 종류인가.
 *
 * true 일 때만 화면에 [클라우드 백업 다시 만들기] 를 띄운다. 일시적 실패(네트워크,
 * 다른 기기가 동시에 동기화 중)에까지 띄우면, 기다리면 저절로 풀릴 일에 선생님이
 * 클라우드를 통째로 다시 만들게 된다.
 */
export function isCloudRebuildRequiredError(message: string): boolean {
  if (!message) return false;
  // 순서 중요 — 제외 판정이 먼저다. 이 계열도 문구 끝은 표식과 같다.
  if (message.includes(ORIGIN_DEVICE_ONLY_MARKER)) return false;
  if (message.includes(CLOUD_REBUILD_HINT)) return true;
  return LEGACY_INTEGRITY_PATTERNS.some((pattern) => pattern.test(message));
}
