import { describe, it, expect } from 'vitest';
import {
  CLOUD_REBUILD_HINT,
  buildDuplicateFileMessage,
  buildManifestMismatchMessage,
  isCloudRebuildRequiredError,
} from './driveSyncRecovery';
import { GOOGLE_AUTH_BLOCKED_MESSAGE } from './calendarSyncRules';

describe('buildManifestMismatchMessage', () => {
  it('신고에 찍힌 문구를 그대로 만든다', () => {
    expect(buildManifestMismatchMessage('events')).toBe(
      '클라우드 events 파일과 동기화 장부가 일치하지 않습니다. 클라우드 데이터를 다시 구성해 주세요.',
    );
  });

  it('아카이브도 같은 틀을 쓴다', () => {
    expect(buildManifestMismatchMessage('아카이브')).toBe(
      '클라우드 아카이브 파일과 동기화 장부가 일치하지 않습니다. 클라우드 데이터를 다시 구성해 주세요.',
    );
  });
});

describe('buildDuplicateFileMessage', () => {
  it('중복 파일 문구를 만든다', () => {
    expect(buildDuplicateFileMessage('todos')).toBe(
      '클라우드 todos 파일이 중복되어 안전하게 동기화할 수 없습니다. 클라우드 데이터를 다시 구성해 주세요.',
    );
  });
});

describe('isCloudRebuildRequiredError', () => {
  it('생성기가 만든 문구는 모두 복구 대상이다', () => {
    expect(isCloudRebuildRequiredError(buildManifestMismatchMessage('events'))).toBe(true);
    expect(isCloudRebuildRequiredError(buildManifestMismatchMessage('아카이브'))).toBe(true);
    expect(isCloudRebuildRequiredError(buildDuplicateFileMessage('todos'))).toBe(true);
  });

  it('v1→v2 장부 이전 실패도 같은 방법으로 풀린다', () => {
    expect(
      isCloudRebuildRequiredError(
        'Google Drive의 이전 events 파일이 동기화 장부와 일치하지 않습니다.',
      ),
    ).toBe(true);
    expect(
      isCloudRebuildRequiredError(
        'Google Drive의 이전 쌤핀 동기화 장부가 중복되어 안전하게 이전할 수 없습니다.',
      ),
    ).toBe(true);
    expect(
      isCloudRebuildRequiredError(
        'Google Drive의 v2 쌤핀 동기화 장부가 중복되어 안전하게 열 수 없습니다.',
      ),
    ).toBe(true);
  });

  // ★ 이 두 건이 이 파일에서 가장 중요한 단언이다.
  //   문구 끝이 표식과 똑같아서 뭉뚱그리기 쉬운데, 여기서 true 를 주면
  //   원본 기기의 자료를 이 기기가 지워 버린다.
  it('원본 기기에서 고쳐야 하는 오류는 이 기기의 복구 대상이 아니다', () => {
    expect(
      isCloudRebuildRequiredError(
        '소유 기기를 확인할 수 없는 클라우드 obs-attachments/a.png 파일입니다. 원본 기기에서 클라우드 데이터를 다시 구성해 주세요.',
      ),
    ).toBe(false);
    expect(
      isCloudRebuildRequiredError(
        '다른 기기가 올린 클라우드 obs-attachments/a.png 파일을 찾지 못했습니다. 원본 기기에서 클라우드 데이터를 다시 구성해 주세요.',
      ),
    ).toBe(false);
  });

  it('기다리면 풀리는 일시적 실패는 복구 대상이 아니다', () => {
    expect(
      isCloudRebuildRequiredError(
        '클라우드 동기화 장부가 다른 기기에서 변경되었습니다. 다시 동기화해 주세요.',
      ),
    ).toBe(false);
    expect(
      isCloudRebuildRequiredError('드라이브 events 파일이 동기화 중 다시 변경되었습니다.'),
    ).toBe(false);
    expect(
      isCloudRebuildRequiredError(
        '이전 버전 기기가 동기화 중입니다. 잠시 후 다시 동기화해 주세요.',
      ),
    ).toBe(false);
  });

  // ★★ 가장 위험한 거짓 양성.
  //   구버전 쌤핀이 이 단추를 띄우면, 최신 버전이 만든 자료를 구버전이 통째로 지운다.
  it('구버전이 최신 자료를 보고 있을 때는 절대 복구 대상이 아니다', () => {
    expect(
      isCloudRebuildRequiredError(
        '더 최신 버전의 쌤핀이 만든 동기화 데이터입니다. 앱을 업데이트해 주세요.',
      ),
    ).toBe(false);
  });

  // 폴더가 둘이면 다시 만들기도 실패한다(getOrCreateSyncFolder 가 같은 이유로 던진다).
  // 장부 중복과 문구가 닮았지만 해결책이 다르므로 갈라 둔다.
  it('동기화 폴더 자체가 중복된 경우는 복구 대상이 아니다', () => {
    expect(
      isCloudRebuildRequiredError(
        'Google Drive에 쌤핀 동기화 폴더가 중복되어 안전하게 열 수 없습니다.',
      ),
    ).toBe(false);
  });

  it('병합 중 경합은 복구 대상이 아니다', () => {
    expect(isCloudRebuildRequiredError('클라우드 events 장부가 병합 중 다시 변경되었습니다.')).toBe(
      false,
    );
    expect(isCloudRebuildRequiredError('클라우드 events 파일이 병합 중 다시 변경되었습니다.')).toBe(
      false,
    );
  });

  it('무관한 오류에는 반응하지 않는다', () => {
    expect(isCloudRebuildRequiredError('')).toBe(false);
    expect(isCloudRebuildRequiredError('Failed to fetch')).toBe(false);
    expect(isCloudRebuildRequiredError('네트워크 연결을 확인해주세요.')).toBe(false);
    expect(isCloudRebuildRequiredError(GOOGLE_AUTH_BLOCKED_MESSAGE)).toBe(false);
  });

  it('표식 상수가 실제 문구에 들어 있다', () => {
    expect(buildManifestMismatchMessage('events')).toContain(CLOUD_REBUILD_HINT);
    expect(buildDuplicateFileMessage('events')).toContain(CLOUD_REBUILD_HINT);
  });
});
