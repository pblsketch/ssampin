import type { Bookmark, BookmarkGroup, BookmarkData, BookmarkType } from '../entities/Bookmark';

/**
 * URL이 유효한 http/https 프로토콜인지 검증
 */
export function validateBookmarkUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Windows 폴더 경로 검증
 * C:\Users\..., \\server\share\... 형태의 절대 경로인지 확인
 */
export function validateFolderPath(path: string): boolean {
  return /^[A-Za-z]:\\/.test(path) || /^\\\\/.test(path);
}

/**
 * 타입에 따른 통합 검증
 */
export function validateBookmark(url: string, type: BookmarkType = 'url'): boolean {
  return type === 'folder' ? validateFolderPath(url) : validateBookmarkUrl(url);
}

/**
 * order 기준 즐겨찾기 정렬
 */
export function sortBookmarksByOrder(
  bookmarks: readonly Bookmark[],
): Bookmark[] {
  return [...bookmarks].sort((a, b) => a.order - b.order);
}

/**
 * order 기준 그룹 정렬
 */
export function sortGroupsByOrder(
  groups: readonly BookmarkGroup[],
): BookmarkGroup[] {
  return [...groups].sort((a, b) => a.order - b.order);
}

/**
 * 특정 그룹의 즐겨찾기 필터
 */
export function getBookmarksByGroup(
  bookmarks: readonly Bookmark[],
  groupId: string,
): Bookmark[] {
  return sortBookmarksByOrder(
    bookmarks.filter((b) => b.groupId === groupId),
  );
}

/**
 * URL 중복 체크
 */
export function isDuplicateUrl(
  bookmarks: readonly Bookmark[],
  url: string,
): boolean {
  const normalized = url.toLowerCase().replace(/\/+$/, '');
  return bookmarks.some(
    (b) => b.url.toLowerCase().replace(/\/+$/, '') === normalized,
  );
}

/**
 * 교사용 기본 프리셋 데이터 (4개 그룹, 16개 사이트)
 */
export function getDefaultPresets(): BookmarkData {
  const now = new Date().toISOString();

  const groups: BookmarkGroup[] = [
    { id: 'preset-work', name: '업무', emoji: '💼', order: 0, collapsed: false, createdAt: now },
    { id: 'preset-prep', name: '수업 준비', emoji: '📚', order: 1, collapsed: false, createdAt: now },
    { id: 'preset-tools', name: '수업 도구', emoji: '🛠️', order: 2, collapsed: false, createdAt: now },
    { id: 'preset-ai', name: 'AI·에듀테크', emoji: '🤖', order: 3, collapsed: false, createdAt: now },
  ];

  const bookmarks: Bookmark[] = [
    // 💼 업무
    { id: 'preset-b-1', name: '대국민 나이스', url: 'https://www.neis.go.kr', iconType: 'emoji', iconValue: '🏛️', groupId: 'preset-work', order: 0, createdAt: now, updatedAt: now },
    { id: 'preset-b-4', name: '정부24', url: 'https://plus.gov.kr', iconType: 'emoji', iconValue: '🇰🇷', groupId: 'preset-work', order: 1, createdAt: now, updatedAt: now },

    // 📚 수업 준비
    { id: 'preset-b-5', name: '에듀넷', url: 'https://www.edunet.net', iconType: 'emoji', iconValue: '📖', groupId: 'preset-prep', order: 0, createdAt: now, updatedAt: now },
    { id: 'preset-b-6', name: 'EBS', url: 'https://www.ebs.co.kr', iconType: 'emoji', iconValue: '📺', groupId: 'preset-prep', order: 1, createdAt: now, updatedAt: now },
    { id: 'preset-b-8', name: '한국교육과정평가원', url: 'https://www.kice.re.kr', iconType: 'emoji', iconValue: '📊', groupId: 'preset-prep', order: 2, createdAt: now, updatedAt: now },
    { id: 'preset-b-9', name: '학교알리미', url: 'https://www.schoolinfo.go.kr', iconType: 'emoji', iconValue: '🔔', groupId: 'preset-prep', order: 3, createdAt: now, updatedAt: now },
    { id: 'preset-b-18', name: 'PBL스케치', url: 'https://pblsketch.xyz', iconType: 'emoji', iconValue: '🎯', groupId: 'preset-prep', order: 4, createdAt: now, updatedAt: now },

    // 🛠️ 수업 도구
    { id: 'preset-b-10', name: '멘티미터', url: 'https://www.mentimeter.com', iconType: 'emoji', iconValue: '📊', groupId: 'preset-tools', order: 0, createdAt: now, updatedAt: now },
    { id: 'preset-b-11', name: '패들렛', url: 'https://padlet.com', iconType: 'emoji', iconValue: '📌', groupId: 'preset-tools', order: 1, createdAt: now, updatedAt: now },
    { id: 'preset-b-12', name: '띵커벨', url: 'https://www.tkbell.co.kr', iconType: 'emoji', iconValue: '🔔', groupId: 'preset-tools', order: 2, createdAt: now, updatedAt: now },
    { id: 'preset-b-13', name: '캔바', url: 'https://www.canva.com', iconType: 'emoji', iconValue: '🎨', groupId: 'preset-tools', order: 3, createdAt: now, updatedAt: now },
    { id: 'preset-b-14', name: '미리캔버스', url: 'https://www.miricanvas.com', iconType: 'emoji', iconValue: '🖼️', groupId: 'preset-tools', order: 4, createdAt: now, updatedAt: now },

    // 🤖 AI·에듀테크
    { id: 'preset-b-15', name: '뤼튼', url: 'https://wrtn.ai', iconType: 'emoji', iconValue: '✨', groupId: 'preset-ai', order: 0, createdAt: now, updatedAt: now },
    { id: 'preset-b-16', name: 'ChatGPT', url: 'https://chat.openai.com', iconType: 'emoji', iconValue: '🤖', groupId: 'preset-ai', order: 1, createdAt: now, updatedAt: now },
    { id: 'preset-b-19', name: 'Gemini', url: 'https://gemini.google.com', iconType: 'emoji', iconValue: '💎', groupId: 'preset-ai', order: 2, createdAt: now, updatedAt: now },
    { id: 'preset-b-20', name: 'Claude', url: 'https://claude.ai', iconType: 'emoji', iconValue: '🧠', groupId: 'preset-ai', order: 3, createdAt: now, updatedAt: now },
  ];

  return { groups, bookmarks };
}
