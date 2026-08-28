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
