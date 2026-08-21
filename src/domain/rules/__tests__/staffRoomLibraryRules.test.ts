import { describe, it, expect } from 'vitest';
import {
  canDeleteFile,
  canUploadVersion,
  checkUpload,
  fileExtension,
  formatBytes,
  isSearchable,
  makeSnippet,
  matchesQuery,
  normalizeQuery,
  previewKindOf,
  shouldExtractPreview,
  storageLevel,
  storageMessage,
  storageRatio,
  truncatePreview,
} from '../staffRoomLibraryRules';
import {
  STAFFROOM_FILE_MAX_BYTES,
  STAFFROOM_PREVIEW_MAX_CHARS,
  type StaffRoomStorageUsage,
} from '@domain/entities/StaffRoomLibrary';

const ME = 'kim@school.kr';
const OTHER = 'lee@school.kr';

describe('확장자 뽑기', () => {
  it('마지막 점 뒤를 소문자로 준다', () => {
    expect(fileExtension('교육과정 편제표.HWP')).toBe('hwp');
    expect(fileExtension('2026.학년도.계획.hwpx')).toBe('hwpx');
  });

  it('확장자가 없으면 빈 문자열', () => {
    expect(fileExtension('README')).toBe('');
    expect(fileExtension('.gitignore')).toBe(''); // 앞에 이름이 없으면 확장자로 보지 않는다
    expect(fileExtension('끝에점만.')).toBe('');
  });
});

describe('미리보기 종류 판정 (계획서 §4)', () => {
  it('kordoc 이 읽는 문서는 글자로 미리 본다', () => {
    for (const name of ['a.hwp', 'a.hwpx', 'a.docx', 'a.xls', 'a.xlsx', 'a.pdf']) {
      expect(previewKindOf(name)).toBe('text');
    }
  });

  it('★ pptx 는 kordoc 목록에 없어 구글 뷰어로 간다', () => {
    expect(previewKindOf('발표자료.pptx')).toBe('viewer');
    expect(previewKindOf('발표자료.ppt')).toBe('viewer');
  });

  it('그림은 그대로 띄운다', () => {
    expect(previewKindOf('사진.jpg')).toBe('image');
    expect(previewKindOf('사진.PNG')).toBe('image');
  });

  it('HTML 은 격리 칸에서 연다', () => {
    expect(previewKindOf('index.html')).toBe('html');
    expect(previewKindOf('page.htm')).toBe('html');
  });

  it('모르는 종류는 미리보기 없이 내려받는다', () => {
    expect(previewKindOf('자료.zip')).toBe('none');
    expect(previewKindOf('이름없음')).toBe('none');
  });

  it('글자를 뽑아 둘 파일은 text 종류뿐이다', () => {
    expect(shouldExtractPreview('계획.hwpx')).toBe(true);
    expect(shouldExtractPreview('발표.pptx')).toBe(false); // 구글 뷰어라 뽑지 않는다
    expect(shouldExtractPreview('사진.png')).toBe(false);
  });
});

describe('올리기 전 검사 (계획서 §10.6 — 200MB 상한)', () => {
  it('보통 파일은 통과한다', () => {
    expect(checkUpload('교육과정 편제표.hwp', 114 * 1024)).toEqual({
      ok: true,
      name: '교육과정 편제표.hwp',
    });
  });

  it('앞뒤 공백은 다듬는다', () => {
    const result = checkUpload('  계획서.hwpx  ', 1024);
    expect(result).toEqual({ ok: true, name: '계획서.hwpx' });
  });

  it('★ 200MB 를 넘으면 막고, 얼마나 큰지 알려준다', () => {
    const result = checkUpload('큰파일.zip', STAFFROOM_FILE_MAX_BYTES + 1);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('막혔어야 한다');
    expect(result.message).toContain('200MB');
  });

  it('딱 200MB 는 통과한다 (경계값)', () => {
    expect(checkUpload('딱맞음.zip', STAFFROOM_FILE_MAX_BYTES).ok).toBe(true);
  });

  it('빈 파일은 막는다', () => {
    expect(checkUpload('빈파일.hwp', 0).ok).toBe(false);
  });

  it('이름이 없으면 막는다', () => {
    expect(checkUpload('', 100).ok).toBe(false);
    expect(checkUpload('   ', 100).ok).toBe(false);
    expect(checkUpload(null, 100).ok).toBe(false);
  });

  it('이름에 경로 구분자가 있으면 막는다', () => {
    expect(checkUpload('../../비밀.hwp', 100).ok).toBe(false);
    expect(checkUpload('폴더\\파일.hwp', 100).ok).toBe(false);
  });

  it('크기를 모르면 막는다', () => {
    expect(checkUpload('파일.hwp', undefined).ok).toBe(false);
    expect(checkUpload('파일.hwp', -1).ok).toBe(false);
    expect(checkUpload('파일.hwp', Number.NaN).ok).toBe(false);
  });
});

describe('바이트 표기', () => {
  it('단위를 올려가며 읽기 쉽게 준다', () => {
    expect(formatBytes(0)).toBe('0B');
    expect(formatBytes(512)).toBe('512B');
    expect(formatBytes(1024)).toBe('1KB');
    expect(formatBytes(1536)).toBe('1.5KB');
    expect(formatBytes(200 * 1024 * 1024)).toBe('200MB');
    expect(formatBytes(15 * 1024 * 1024 * 1024)).toBe('15GB');
  });
});

describe('용량 경고 (계획서 §8-C · §10.6)', () => {
  const usage = (usedGb: number, limitGb = 15): StaffRoomStorageUsage => ({
    departmentBytes: 1024,
    driveUsedBytes: usedGb * 1024 * 1024 * 1024,
    driveLimitBytes: limitGb * 1024 * 1024 * 1024,
  });

  it('여유가 있으면 조용하다', () => {
    expect(storageLevel(usage(5))).toBe('ok');
    expect(storageMessage(usage(5))).toBeNull();
  });

  it('80% 에서 경고한다 (경계값)', () => {
    expect(storageLevel(usage(12))).toBe('warn'); // 12/15 = 정확히 80%
    expect(storageLevel(usage(11.9))).toBe('ok');
  });

  it('가득 차면 full', () => {
    expect(storageLevel(usage(15))).toBe('full');
  });

  it('★ 경고 문구가 "지메일 수신과 쌤핀 동기화도 멈춘다"까지 말한다', () => {
    // 계획서 §10.6: 승인 절차를 두지 않기로 한 만큼 안내 문구가 유일한 방어선이다.
    const warn = storageMessage(usage(12));
    expect(warn).toContain('지메일 수신');
    expect(warn).toContain('동기화');

    const full = storageMessage(usage(15));
    expect(full).toContain('지메일 수신');
    expect(full).toContain('동기화');
  });

  it('총량을 모르면 0 으로 보고 경고하지 않는다', () => {
    const unknown: StaffRoomStorageUsage = {
      departmentBytes: 0,
      driveUsedBytes: 100,
      driveLimitBytes: 0,
    };
    expect(storageRatio(unknown)).toBe(0);
    expect(storageLevel(unknown)).toBe('ok');
  });
});

describe('미리보기 글자 자르기 (계획서 §3.4-다 — 5만 자)', () => {
  it('짧은 문서는 그대로 둔다', () => {
    expect(truncatePreview('시간표 표')).toEqual({ text: '시간표 표', truncated: false });
  });

  it('5만 자에서 자르고 잘렸다고 표시한다', () => {
    const long = '가'.repeat(STAFFROOM_PREVIEW_MAX_CHARS + 100);
    const result = truncatePreview(long);
    expect(result.text.length).toBe(STAFFROOM_PREVIEW_MAX_CHARS);
    expect(result.truncated).toBe(true);
  });

  it('딱 5만 자는 자르지 않는다 (경계값)', () => {
    const exact = '가'.repeat(STAFFROOM_PREVIEW_MAX_CHARS);
    expect(truncatePreview(exact).truncated).toBe(false);
  });
});

describe('검색 (계획서 §4.1)', () => {
  it('검색어를 다듬는다', () => {
    expect(normalizeQuery('  교육   과정  ')).toBe('교육 과정');
    expect(normalizeQuery('HWPX')).toBe('hwpx');
  });

  it('한 글자로는 찾지 않는다 (전부 걸린다)', () => {
    expect(isSearchable('가')).toBe(false);
    expect(isSearchable('  가  ')).toBe(false);
    expect(isSearchable('가나')).toBe(true);
  });

  it('★ 조사가 붙어도 글자 그대로 훑어 찾는다', () => {
    // 한국어는 어간 분석이 잘 안 들어서 부분 일치로 간다(§3.4-다)
    expect(matchesQuery('교육과정을 편성한다', '교육과정')).toBe(true);
    expect(matchesQuery('교육과정에서', '교육과정')).toBe(true);
  });

  it('대소문자를 가리지 않는다', () => {
    expect(matchesQuery('2026 Curriculum 계획', 'curriculum')).toBe(true);
  });

  it('없으면 못 찾는다', () => {
    expect(matchesQuery('교육과정 편제표', '급식')).toBe(false);
    expect(matchesQuery('아무거나', '')).toBe(false);
  });

  it('찾은 낱말 주변을 잘라 보여준다', () => {
    const text = '앞'.repeat(100) + '급식비 지원' + '뒤'.repeat(100);
    const snippet = makeSnippet(text, '급식비');
    expect(snippet).toContain('급식비');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet.length).toBeLessThan(text.length);
  });

  it('짧은 글은 생략 표시 없이 준다', () => {
    expect(makeSnippet('급식비 지원 안내', '급식비')).toBe('급식비 지원 안내');
  });
});

describe('권한', () => {
  it('올린 사람 본인은 지울 수 있다', () => {
    expect(canDeleteFile(ME, 'member', ME)).toBe(true);
  });

  it('관리자는 남의 파일도 지울 수 있다', () => {
    expect(canDeleteFile(ME, 'admin', OTHER)).toBe(true);
  });

  it('남의 파일을 일반 멤버가 지울 수는 없다', () => {
    expect(canDeleteFile(ME, 'member', OTHER)).toBe(false);
  });

  it('대소문자·공백이 달라도 같은 사람으로 본다', () => {
    expect(canDeleteFile('  KIM@school.kr ', 'member', ME)).toBe(true);
  });

  it('★ 새 판 올리기는 멤버 누구나 — 이전 판이 남으므로 되돌릴 수 있다', () => {
    expect(canUploadVersion('member')).toBe(true);
    expect(canUploadVersion('admin')).toBe(true);
  });
});
