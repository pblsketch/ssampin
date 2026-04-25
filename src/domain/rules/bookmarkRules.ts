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
 * URL 정규화 (중복 검사용) — 소문자 + 후행 / 제거
 */
export function normalizeUrl(url: string): string {
  return url.toLowerCase().replace(/\/+$/, '');
}

/**
 * URL 중복 체크
 */
export function isDuplicateUrl(
  bookmarks: readonly Bookmark[],
  url: string,
): boolean {
  const normalized = normalizeUrl(url);
  return bookmarks.some((b) => normalizeUrl(b.url) === normalized);
}

/**
 * 숨김 처리된 그룹을 제외한 그룹 목록 반환
 */
export function filterVisibleGroups(
  groups: readonly BookmarkGroup[],
  hiddenGroupIds: readonly string[],
): BookmarkGroup[] {
  if (hiddenGroupIds.length === 0) return [...groups];
  const hiddenSet = new Set(hiddenGroupIds);
  return groups.filter((g) => !hiddenSet.has(g.id));
}

/**
 * 숨김 처리된 개별 북마크를 제외한 북마크 목록 반환
 */
export function filterVisibleBookmarks(
  bookmarks: readonly Bookmark[],
  hiddenBookmarkIds: readonly string[],
): Bookmark[] {
  if (hiddenBookmarkIds.length === 0) return [...bookmarks];
  const hiddenSet = new Set(hiddenBookmarkIds);
  return bookmarks.filter((b) => !hiddenSet.has(b.id));
}

/**
 * 활성(아카이브 안 된) 그룹만 반환
 */
export function filterActiveGroups(
  groups: readonly BookmarkGroup[],
): BookmarkGroup[] {
  return groups.filter((g) => !g.archived);
}

/**
 * 아카이브된 그룹만 반환
 */
export function filterArchivedGroups(
  groups: readonly BookmarkGroup[],
): BookmarkGroup[] {
  return groups.filter((g) => g.archived);
}

/**
 * 검색 쿼리로 북마크 필터링 (name + url + ogTitle + ogDescription)
 * 단순 lowercase includes 매칭
 */
export function filterBookmarksBySearch(
  bookmarks: readonly Bookmark[],
  query: string,
): Bookmark[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [...bookmarks];
  return bookmarks.filter((b) => {
    const haystack = [
      b.name,
      b.url,
      b.ogTitle ?? '',
      b.ogDescription ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(trimmed);
  });
}

/** URL에서 호스트네임을 추출, www. 접두사 제거 */
export function extractDomain(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return null;
  }
}

/**
 * 도메인 → 프리셋 그룹 ID 매핑 테이블
 * 사용자가 이름을 바꿔도 동작하도록 그룹 ID로 매핑.
 */
export const DOMAIN_GROUP_MAP: Readonly<Record<string, string>> = {
  // 💼 업무
  'neis.go.kr': 'preset-work',
  'eduro.go.kr': 'preset-work',
  'gov.kr': 'preset-work',
  'moe.go.kr': 'preset-work',
  'schoolinfo.go.kr': 'preset-work',
  'kedi.re.kr': 'preset-work',
  // 📚 수업 준비
  'edunet.net': 'preset-prep',
  'ebs.co.kr': 'preset-prep',
  'ebsi.co.kr': 'preset-prep',
  'kice.re.kr': 'preset-prep',
  // 🛠️ 수업 도구
  'mentimeter.com': 'preset-tools',
  'padlet.com': 'preset-tools',
  'canva.com': 'preset-tools',
  'miricanvas.com': 'preset-tools',
  'kahoot.com': 'preset-tools',
  'quizlet.com': 'preset-tools',
  'jamboard.google.com': 'preset-tools',
  'docs.google.com': 'preset-tools',
  'youtube.com': 'preset-tools',
  // 🤖 AI·에듀테크
  'chat.openai.com': 'preset-ai',
  'chatgpt.com': 'preset-ai',
  'gemini.google.com': 'preset-ai',
  'claude.ai': 'preset-ai',
  'wrtn.ai': 'preset-ai',
  'riiid.com': 'preset-ai',
};

/**
 * URL에 매칭되는 프리셋 그룹 ID 추천
 * - 정확 매칭 또는 서브도메인 매칭 (예: docs.google.com → 정확, www.padlet.com → 부모)
 * - 추천 그룹이 현재 존재하고 archived가 아니어야 반환
 * - 사용자 정의 그룹은 자동 추천 대상이 아님 (preset-* ID만)
 */
export function recommendGroupId(
  url: string,
  groups: readonly BookmarkGroup[],
): string | null {
  const domain = extractDomain(url);
  if (!domain) return null;

  let matched: string | null = null;
  for (const [pattern, groupId] of Object.entries(DOMAIN_GROUP_MAP)) {
    if (domain === pattern || domain.endsWith('.' + pattern)) {
      matched = groupId;
      break;
    }
  }
  if (!matched) return null;

  const exists = groups.some((g) => g.id === matched && !g.archived);
  return exists ? matched : null;
}

/** 미사용 북마크 임계값 (일) */
export const DAYS_FORGOTTEN_THRESHOLD = 30;

interface FindForgottenOptions {
  daysThreshold?: number;
  limit?: number;
  now?: Date;
}

/**
 * 잊고 있던 북마크 찾기 — 위젯/카드 뱃지에서 활용
 * - 폴더 제외
 * - lastClickedAt이 null이거나 N일 이상 경과
 * - 정렬: null 우선 → 가장 오래된 순
 */
export function findForgottenBookmarks(
  bookmarks: readonly Bookmark[],
  options: FindForgottenOptions = {},
): Bookmark[] {
  const {
    daysThreshold = DAYS_FORGOTTEN_THRESHOLD,
    limit = 3,
    now = new Date(),
  } = options;

  const cutoffMs = now.getTime() - daysThreshold * 24 * 60 * 60 * 1000;

  const candidates = bookmarks.filter((b) => {
    if (b.type === 'folder') return false;
    if (!b.lastClickedAt) return true;
    const t = Date.parse(b.lastClickedAt);
    if (Number.isNaN(t)) return true;
    return t < cutoffMs;
  });

  // null/invalid 우선 → 오래된 순 (오름차순)
  candidates.sort((a, b) => {
    const aMs = a.lastClickedAt ? Date.parse(a.lastClickedAt) : NaN;
    const bMs = b.lastClickedAt ? Date.parse(b.lastClickedAt) : NaN;
    const aNull = !a.lastClickedAt || Number.isNaN(aMs);
    const bNull = !b.lastClickedAt || Number.isNaN(bMs);
    if (aNull && !bNull) return -1;
    if (!aNull && bNull) return 1;
    if (aNull && bNull) return 0;
    return aMs - bMs;
  });

  return candidates.slice(0, limit);
}

/**
 * 북마크가 "잊혀진" 상태인지 단건 판정 — 카드 뱃지 표시용
 */
export function isBookmarkForgotten(
  bookmark: Bookmark,
  daysThreshold: number = DAYS_FORGOTTEN_THRESHOLD,
  now: Date = new Date(),
): boolean {
  if (bookmark.type === 'folder') return false;
  if (!bookmark.lastClickedAt) return true;
  const t = Date.parse(bookmark.lastClickedAt);
  if (Number.isNaN(t)) return true;
  const cutoffMs = now.getTime() - daysThreshold * 24 * 60 * 60 * 1000;
  return t < cutoffMs;
}

/**
 * Chrome/Edge 등 브라우저 북마크 HTML(`Netscape Bookmark File Format`)을 파싱.
 * - 폴더(`<H3>`) → BookmarkGroup, 1단계만 사용 (중첩 폴더는 부모 그룹에 병합)
 * - 링크(`<A HREF="...">이름</A>`) → Bookmark
 * - 폴더가 없는 최상위 링크는 "가져온 즐겨찾기" 그룹에 모음
 *
 * 외부 라이브러리 없이 정규식 기반. cheerio/jsdom 추가 안 함.
 */
export function parseBrowserBookmarksHtml(html: string): {
  groups: BookmarkGroup[];
  bookmarks: Bookmark[];
} {
  const now = new Date().toISOString();
  const groups: BookmarkGroup[] = [];
  const bookmarks: Bookmark[] = [];

  const fallbackGroup: BookmarkGroup = {
    id: 'imported-default',
    name: '가져온 즐겨찾기',
    emoji: '📥',
    order: 0,
    collapsed: false,
    createdAt: now,
  };

  const tokenRe = /<H3[^>]*>([\s\S]*?)<\/H3>|<A\s+([^>]*?)>([\s\S]*?)<\/A>/gi;
  let groupIndex = 0;
  let bookmarkOrderInGroup = new Map<string, number>();
  let currentGroupId: string | null = null;

  const ensureFallbackUsed = (): string => {
    if (!groups.find((g) => g.id === fallbackGroup.id)) {
      groups.push(fallbackGroup);
      bookmarkOrderInGroup.set(fallbackGroup.id, 0);
    }
    return fallbackGroup.id;
  };

  const decode = (s: string): string =>
    s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim();

  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(html)) !== null) {
    if (match[1] !== undefined) {
      // <H3> 폴더
      const folderName = decode(match[1]);
      if (!folderName) continue;
      const id = `imported-${groupIndex}`;
      groups.push({
        id,
        name: folderName,
        emoji: '📁',
        order: groupIndex,
        collapsed: false,
        createdAt: now,
      });
      bookmarkOrderInGroup.set(id, 0);
      currentGroupId = id;
      groupIndex += 1;
    } else if (match[2] !== undefined && match[3] !== undefined) {
      // <A> 링크
      const attrs = match[2];
      const linkText = decode(match[3]);
      const hrefMatch = attrs.match(/HREF\s*=\s*"([^"]+)"/i);
      if (!hrefMatch) continue;
      const href = decode(hrefMatch[1]!);
      if (!validateBookmarkUrl(href)) continue;

      const targetGroupId = currentGroupId ?? ensureFallbackUsed();
      const order = bookmarkOrderInGroup.get(targetGroupId) ?? 0;
      bookmarkOrderInGroup.set(targetGroupId, order + 1);

      bookmarks.push({
        id: `imported-b-${bookmarks.length}`,
        name: linkText || href,
        url: href,
        iconType: 'emoji',
        iconValue: '🔗',
        groupId: targetGroupId,
        order,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return { groups, bookmarks };
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
    { id: 'preset-b-21', name: '킹수학', url: 'https://xn--9p4bn1ysod.com/', iconType: 'emoji', iconValue: '👑', groupId: 'preset-tools', order: 5, createdAt: now, updatedAt: now },

    // 🤖 AI·에듀테크
    { id: 'preset-b-15', name: '뤼튼', url: 'https://wrtn.ai', iconType: 'emoji', iconValue: '✨', groupId: 'preset-ai', order: 0, createdAt: now, updatedAt: now },
    { id: 'preset-b-16', name: 'ChatGPT', url: 'https://chat.openai.com', iconType: 'emoji', iconValue: '🤖', groupId: 'preset-ai', order: 1, createdAt: now, updatedAt: now },
    { id: 'preset-b-19', name: 'Gemini', url: 'https://gemini.google.com', iconType: 'emoji', iconValue: '💎', groupId: 'preset-ai', order: 2, createdAt: now, updatedAt: now },
    { id: 'preset-b-20', name: 'Claude', url: 'https://claude.ai', iconType: 'emoji', iconValue: '🧠', groupId: 'preset-ai', order: 3, createdAt: now, updatedAt: now },
  ];

  return { groups, bookmarks };
}
