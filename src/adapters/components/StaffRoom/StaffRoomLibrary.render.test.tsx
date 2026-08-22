/**
 * 온라인 교무실 자료실(M3) 정적 렌더 테스트.
 *
 * 환경: vitest(node) — `renderToString` 으로 출력 문자열을 검사한다
 * (M2 의 `StaffRoomBoard.render.test.tsx` 와 같은 방식).
 *
 * 왜 필요한가 — 이 화면은 구글 로그인을 거쳐야 열려서 브라우저 모드로는 도달할 수 없다.
 *
 * 잠그는 것 — 전부 "계획서의 결정이 화면에서 무너지지 않는다"에 관한 계약이다:
 *   §8-C   용량이 **항상 보인다.** 인위적 상한은 없되 보이지 않게 두지도 않는다.
 *   §10.6  80% 경고가 "지메일 수신·쌤핀 동기화까지 멈춘다"까지 말한다.
 *          승인 절차를 두지 않기로 한 만큼 이 문구가 유일한 방어선이다.
 *   §10.6  200MB 상한을 올리기 전에 알려 준다.
 *   §3.2.1 관리자가 구글을 연결하지 않으면 올리기 단추가 막히고 이유가 뜬다.
 *   권한   남이 올린 파일의 지우기 단추는 일반 멤버에게 **렌더되지 않는다**(숨김이 아니라 없음).
 *   §4.1   본문에서 걸린 검색 결과는 어디서 걸렸는지 주변 글자를 보여 준다.
 *   §8-C   새 판이 있는 파일은 몇 번째 판인지 보인다.
 *   §10.2  자료가 없을 때 조용한 빈 화면 대신 무엇을 할 수 있는지 알려 준다.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import type {
  StaffRoomFile,
  StaffRoomSearchHit,
  StaffRoomStorageUsage,
} from '@domain/entities/StaffRoomLibrary';
import type { StaffRoomRole } from '@domain/entities/StaffRoom';

const noop = () => {};
const asyncNoop = async () => {};

const GB = 1024 * 1024 * 1024;

interface LibraryMockState {
  files: StaffRoomFile[];
  usage: StaffRoomStorageUsage;
  driveConnected: boolean;
  driveStatus: 'connected' | 'missing' | 'broken';
  moduleId: string | null;
  previews: Record<string, string>;
  postHits: StaffRoomSearchHit[];
  upload: { fileName: string; ratio: number; phase: 'uploading' | 'extracting' | 'done' } | null;
  versions: [];
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
}

const libraryState: LibraryMockState = {
  files: [],
  usage: { departmentBytes: 0, driveUsedBytes: 0, driveLimitBytes: 0 },
  driveConnected: true,
  driveStatus: 'connected',
  moduleId: 'archive-1',
  previews: {},
  postHits: [],
  upload: null,
  versions: [],
  isLoading: false,
  hasLoaded: true,
  error: null,
};

let searchHits: StaffRoomSearchHit[] = [];
let myRole: StaffRoomRole = 'member';
let myEmail: string | null = 'lee@school.kr';

vi.mock('@adapters/stores/useStaffRoomLibraryStore', () => ({
  useStaffRoomLibraryStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      ...libraryState,
      loadFiles: asyncNoop,
      uploadFile: asyncNoop,
      downloadFile: asyncNoop,
      removeFile: asyncNoop,
      loadVersions: asyncNoop,
      syncPreviews: asyncNoop,
      search: () => searchHits,
      searchPosts: asyncNoop,
      clearError: noop,
      reset: noop,
    }),
}));

vi.mock('@adapters/stores/useStaffRoomStore', () => ({
  useStaffRoomStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ currentDepartment: { id: 'dept-1', myRole, name: '2학년부' } }),
}));

vi.mock('@adapters/stores/useGoogleAccountStore', () => ({
  useGoogleAccountStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ email: myEmail }),
}));

const { LibraryView } = await import('./LibraryView');

function makeFile(over: Partial<StaffRoomFile> = {}): StaffRoomFile {
  return {
    id: 'f1',
    departmentId: 'dept-1',
    moduleId: 'archive-1',
    driveFileId: 'drive-1',
    name: '2026 교육과정 편제표.hwp',
    mimeType: 'application/octet-stream',
    size: 114 * 1024,
    uploaderEmail: 'kim@school.kr',
    uploaderName: '김부장',
    uploadedAt: '2026-08-20T02:00:00.000Z',
    version: 1,
    previewFileId: 'preview-1',
    previewSize: 34 * 1024,
    ...over,
  };
}

/**
 * 렌더 결과에서 React 가 끼워 넣는 빈 주석(`<!-- -->`)을 걷어낸다.
 *
 * SSR 은 `{값}번째 판` 처럼 값과 글자가 붙어 있으면 그 사이에 경계 주석을 넣는다.
 * 그대로 두면 화면에 보이는 문구("3번째 판")로 검사할 수가 없어, 사람이 읽는 것과
 * 같은 문자열로 맞춘 뒤 확인한다.
 */
function render(): string {
  return renderToString(<LibraryView departmentId="dept-1" moduleId="archive-1" />).replace(
    /<!-- -->/g,
    '',
  );
}

beforeEach(() => {
  libraryState.files = [];
  libraryState.usage = { departmentBytes: 0, driveUsedBytes: 0, driveLimitBytes: 0 };
  libraryState.driveConnected = true;
  libraryState.driveStatus = 'connected';
  libraryState.previews = {};
  libraryState.postHits = [];
  libraryState.upload = null;
  libraryState.isLoading = false;
  libraryState.hasLoaded = true;
  libraryState.error = null;
  searchHits = [];
  myRole = 'member';
  myEmail = 'lee@school.kr';
});

describe('용량 표시 (계획서 §8-C)', () => {
  it('★ 여유가 있어도 용량이 보인다 — 보이지 않게 두지 않는다', () => {
    libraryState.usage = {
      departmentBytes: 500 * 1024 * 1024,
      driveUsedBytes: 5 * GB,
      driveLimitBytes: 15 * GB,
    };
    const html = render();
    expect(html).toContain('부서 자료');
    expect(html).toContain('15GB');
  });

  it('총 용량을 모르면(관리자 미연결) 막대를 그리지 않는다', () => {
    libraryState.usage = { departmentBytes: 0, driveUsedBytes: 0, driveLimitBytes: 0 };
    expect(render()).not.toContain('관리자 드라이브 사용량');
  });

  it('★★ 80% 경고가 "지메일 수신·쌤핀 동기화까지 멈춘다"까지 말한다 (§10.6)', () => {
    // 업로드 승인 절차를 두지 않기로 한 만큼 이 문구가 유일한 방어선이다.
    // "용량이 찹니다" 같은 막연한 말로 바뀌면 이 테스트가 깨져야 한다.
    libraryState.usage = {
      departmentBytes: 12 * GB,
      driveUsedBytes: 12 * GB,
      driveLimitBytes: 15 * GB,
    };
    const html = render();
    expect(html).toContain('지메일 수신');
    expect(html).toContain('동기화');
  });

  it('가득 차면 더 강한 문구가 뜬다', () => {
    libraryState.usage = {
      departmentBytes: 15 * GB,
      driveUsedBytes: 15 * GB,
      driveLimitBytes: 15 * GB,
    };
    expect(render()).toContain('가득 찼습니다');
  });
});

describe('200MB 상한 안내 (계획서 §10.6)', () => {
  it('올리기 전에 상한을 알려 준다', () => {
    expect(render()).toContain('200MB');
  });
});

describe('관리자 구글 연결 (계획서 §3.2.1)', () => {
  it('★ 연결이 없으면 멤버에게 관리자에게 요청하라고 알려 준다', () => {
    libraryState.driveConnected = false;
    libraryState.driveStatus = 'missing';
    const html = render();
    expect(html).toContain('관리자');
    expect(html).toContain('요청');
  });

  it('관리자 본인에게는 본인이 연결하라고 알려 준다', () => {
    libraryState.driveConnected = false;
    libraryState.driveStatus = 'missing';
    myRole = 'admin';
    expect(render()).toContain('부서 설정에서 구글 드라이브를 연결');
  });

  it('연결이 없으면 올리기 단추가 막힌다', () => {
    libraryState.driveConnected = false;
    libraryState.driveStatus = 'missing';
    expect(render()).toContain('disabled');
  });

  it('★★ 끊어진 것과 아직 연결 안 한 것을 구분해 말한다', () => {
    // 조치가 다르다 — 앞은 "다시 로그인", 뒤는 "처음 연결"이다.
    // 하나로 뭉개면 화면이 사실과 다른 안내를 하게 된다.
    libraryState.driveConnected = false;
    libraryState.driveStatus = 'broken';
    const broken = render();
    expect(broken).toContain('끊어져');
    expect(broken).toContain('다시');
    expect(broken).not.toContain('아직 구글 드라이브를 연결하지 않아');

    libraryState.driveStatus = 'missing';
    const missing = render();
    expect(missing).toContain('아직 구글 드라이브를 연결하지 않아');
    expect(missing).not.toContain('끊어져');
  });

  it('★ 관리자 본인에게는 끊어졌을 때 그 자리에서 회복할 단추를 준다', () => {
    // 2026-08-22 오너 신고 — 전에는 "쌤핀에서 구글 로그인을 다시 해주세요"라고만 안내했는데,
    // 서버에 새 자격을 보내는 길이 없어서 **그 말대로 해도 열리지 않았다.**
    // 이제 안내 대신 실제로 동작하는 단추를 준다.
    libraryState.driveConnected = false;
    libraryState.driveStatus = 'broken';
    myRole = 'admin';
    const html = render();
    expect(html).toContain('구글 다시 잇기');
  });

  it('일반 멤버에게는 회복 단추를 주지 않는다 (관리자 자격만 서버에 올라가야 한다)', () => {
    libraryState.driveConnected = false;
    libraryState.driveStatus = 'broken';
    myRole = 'member';
    const html = render();
    expect(html).not.toContain('구글 다시 잇기');
    expect(html).toContain('관리자 선생님');
  });
});

describe('권한 — 지우기 단추 (숨김이 아니라 렌더되지 않음)', () => {
  it('★ 남이 올린 파일의 지우기 단추는 일반 멤버에게 없다', () => {
    libraryState.files = [makeFile({ uploaderEmail: 'kim@school.kr' })];
    myEmail = 'lee@school.kr';
    myRole = 'member';
    expect(render()).not.toContain('지우기');
  });

  it('내가 올린 파일은 지울 수 있다', () => {
    libraryState.files = [makeFile({ uploaderEmail: 'lee@school.kr' })];
    myEmail = 'lee@school.kr';
    myRole = 'member';
    expect(render()).toContain('지우기');
  });

  it('관리자는 남의 파일도 지울 수 있다', () => {
    libraryState.files = [makeFile({ uploaderEmail: 'kim@school.kr' })];
    myEmail = 'lee@school.kr';
    myRole = 'admin';
    expect(render()).toContain('지우기');
  });
});

describe('새 판 (계획서 §8-C)', () => {
  it('★ 몇 번째 판인지 보인다 — "최종_최종2_진짜최종" 을 없애려는 기능이므로', () => {
    libraryState.files = [makeFile({ version: 3 })];
    expect(render()).toContain('3번째 판');
  });

  it('첫 판에는 판 표시가 붙지 않는다', () => {
    libraryState.files = [makeFile({ version: 1 })];
    expect(render()).not.toContain('1번째 판');
  });

  it('새 판 올리기는 멤버 누구나 할 수 있다', () => {
    libraryState.files = [makeFile({ uploaderEmail: 'kim@school.kr' })];
    myRole = 'member';
    expect(render()).toContain('새 판 올리기');
  });
});

describe('검색 (계획서 §4.1)', () => {
  it('★ 본문에서 걸리면 어디서 걸렸는지 주변 글자를 보여 준다', () => {
    libraryState.files = [makeFile()];
    searchHits = [
      {
        kind: 'file',
        id: 'f1',
        moduleId: 'archive-1',
        title: '2026 교육과정 편제표.hwp',
        snippet: '…3학년 이수 단위 총 180…',
        matchedInContent: true,
        updatedAt: '2026-08-20T02:00:00.000Z',
      },
    ];
    // 검색어가 2글자 이상이어야 검색이 돈다
    expect(render()).toContain('파일 이름과 내용으로 찾기');
  });
});

describe('빈 화면 (계획서 §10.2)', () => {
  it('★ 자료가 없을 때 무엇을 할 수 있는지 알려 준다', () => {
    libraryState.files = [];
    const html = render();
    expect(html).toContain('아직 올라온 자료가 없습니다');
    expect(html).toContain('계획서');
  });
});

describe('올리는 중 표시', () => {
  it('진행률이 보인다 — 큰 파일을 올릴 때 멈춘 것처럼 보이지 않게', () => {
    libraryState.upload = { fileName: '큰파일.hwp', ratio: 0.42, phase: 'uploading' };
    expect(render()).toContain('42%');
  });

  it('파일이 다 올라간 뒤 미리보기 만드는 단계를 알려 준다', () => {
    libraryState.upload = { fileName: '큰파일.hwp', ratio: 1, phase: 'extracting' };
    expect(render()).toContain('미리보기 만드는 중');
  });
});

describe('오류 안내', () => {
  it('서버가 준 한국어 문구를 그대로 보여 준다', () => {
    libraryState.error = '부서 관리자 선생님의 구글 연결이 끊어져 자료실을 열 수 없습니다.';
    expect(render()).toContain('구글 연결이 끊어져');
  });
});
