/**
 * 동기화가 "어디까지 갔다가 멈췄는지" 기록.
 *
 * 왜 필요한가 — 모바일 진행률의 분모는 SYNC_FILES 31개로 고정이라, 파일을 하나라도
 * 처리하면 화면은 곧바로 3%가 된다. 따라서 "0%에서 안 올라간다"는 신고는 파일 루프에
 * 들어가기 전 준비 단계에서 멈췄다는 뜻인데, 그 구간이 여러 개라 어디였는지 알 수 없었다
 * (2026-08-28 신고 때 실제로 코드만으로는 지목하지 못했다). 단계를 남겨두면 다음 재발
 * 때는 추측 없이 한 곳을 짚을 수 있다.
 *
 * ⚠️ 여기 담기는 값은 아래 고정 리터럴뿐이다. 파일명·이메일·토큰 같은 개인정보나
 *    비밀값은 절대 싣지 않는다 — 이 문자열은 오류 메시지로 화면에 그대로 노출된다.
 */
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';

/** 준비 단계 구분. null = 진행 중인 동기화 없음. */
export type SyncStage = 'settings' | 'token' | 'folder' | 'manifest' | 'list' | 'files' | 'commit';

/** 사용자에게 보여줄 단계 이름 (기술 용어 금지 — 선생님이 읽는 문구다). */
export const SYNC_STAGE_LABEL: Record<SyncStage, string> = {
  settings: '설정 불러오기',
  token: '구글 로그인 확인',
  folder: '동기화 폴더 확인',
  manifest: '동기화 목록 읽기',
  list: '클라우드 파일 확인',
  files: '파일 주고받기',
  commit: '동기화 목록 저장',
};

/**
 * 정체로 중단됐을 때 띄울 안내.
 * 어디서 멈췄는지 + 사용자가 지금 할 수 있는 행동을 함께 준다.
 */
export function stalledSyncMessage(stage: SyncStage | null): string {
  const where = stage === null ? '준비 중' : SYNC_STAGE_LABEL[stage];
  return `동기화가 '${where}' 단계에서 응답이 없어 중단했어요. 다시 시도해 주세요. 계속 같은 자리에서 멈추면 앱을 완전히 닫았다가 다시 열어주세요.`;
}

/**
 * 단계 진행 순서. 기록은 앞으로만 간다.
 *
 * 업로드는 파일을 올린 뒤 장부(manifest)를 다시 손대고, 요청마다 토큰을 먼저 확인한다.
 * 그때마다 단계를 되돌리면 "가장 멀리 간 지점"이 지워져 정작 어디서 멈췄는지 못 본다.
 * 정지 진단이 목적이므로 최대 도달 지점만 남긴다.
 */
const STAGE_ORDER: readonly SyncStage[] = [
  'settings',
  'token',
  'folder',
  'manifest',
  'list',
  'files',
  'commit',
];

/** next 가 current 보다 뒤 단계인가 (기록을 갱신할 값인가). */
export function isForwardStage(current: SyncStage | null, next: SyncStage): boolean {
  if (current === null) return true;
  return STAGE_ORDER.indexOf(next) > STAGE_ORDER.indexOf(current);
}

/** IDriveSyncPort 메서드 → 그 메서드가 속한 단계. 여기 없는 메서드는 단계를 바꾸지 않는다. */
const STAGE_BY_METHOD: Partial<Record<keyof IDriveSyncPort, SyncStage>> = {
  getOrCreateSyncFolder: 'folder',
  getSyncManifest: 'manifest',
  // 장부 '쓰기'는 파일 루프 뒤에 오는 마무리 단계다. 읽기와 같은 'manifest' 로 묶으면
  // 전진 규칙에 막혀 "파일 주고받기에서 멈춤" 으로 잘못 안내된다(경합이 몰리는 지점이라
  // 실제로 여기서 잘 멈춘다).
  updateSyncManifest: 'commit',
  updateSyncManifestIfUnchanged: 'commit',
  listSyncFiles: 'list',
  downloadSyncFile: 'files',
  uploadSyncFile: 'files',
  createSyncFileIfMissing: 'files',
  uploadSyncFileIfUnchanged: 'files',
};

/**
 * 드라이브 포트를 감싸 호출 직전에 단계를 보고한다.
 *
 * Proxy 로 감싸는 이유 — 메서드를 하나씩 옮겨 적으면 포트에 메서드가 늘어날 때마다
 * 조용히 누락된다. 여기서는 이름만 표에 없으면 단계를 안 바꾸고 그대로 통과시킨다.
 * SyncToCloud·SyncFromCloud 의 시그니처는 건드리지 않는다.
 *
 * ⚠️ 속성 접근마다 새 함수 객체를 만든다. 즉 `port.x === port.x` 가 false 이고
 *    `vi.spyOn(port, 'x')` 가 원본에 닿지 않는다. 테스트에서는 감싸기 전 객체를 쓸 것.
 */
export function withStageReporting(
  port: IDriveSyncPort,
  report: (stage: SyncStage) => void,
): IDriveSyncPort {
  return new Proxy(port, {
    get(target, prop) {
      const value = Reflect.get(target, prop) as unknown;
      if (typeof value !== 'function') return value;
      const stage = STAGE_BY_METHOD[prop as keyof IDriveSyncPort];
      const method = value as (...args: unknown[]) => unknown;
      return (...args: unknown[]): unknown => {
        if (stage !== undefined) report(stage);
        return method.apply(target, args);
      };
    },
  });
}
