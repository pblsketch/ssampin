/**
 * v2.0 신규 — 실시간 담벼락 전용 XLSX exporter.
 *
 * exceljs를 dynamic import로만 사용 — static import 절대 금지.
 * student SPA bundle에 exceljs가 leak되지 않도록 격리.
 * (bundle-01/02 메타테스트가 이를 검증)
 */

import type { RealtimeWallBoard, RealtimeWallPost } from '@domain/entities/RealtimeWall';
import { DEFAULT_TAB_ID, type RealtimeWallTabConfig } from '@domain/entities/RealtimeWallTabConfig';

export interface ExportToXlsxOptions {
  readonly includeNickname: boolean;
  readonly currentTabOnly: boolean;
  readonly currentTabId?: string;
}

/**
 * 담벼락 보드를 XLSX Buffer로 내보낸다.
 *
 * 9 칼럼 (한국어 헤더):
 *   작성일시 / [닉네임] / 탭ID / 탭이름 / 내용 / 색상 / 좋아요 / 댓글수 / 상태
 *
 * @param board — 내보낼 보드 (RealtimeWallBoard 또는 tabs 있는 스냅샷)
 * @param options — 닉네임 포함 여부 + 현재 탭만 여부
 */
export async function exportWallBoardToXlsx(
  board: RealtimeWallBoard & { tabs?: readonly RealtimeWallTabConfig[] },
  options: ExportToXlsxOptions,
): Promise<Buffer> {
  // dynamic import — student SPA에 exceljs 포함되지 않도록 격리
  const ExcelJS = await import('exceljs');

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('보드');

  // 9 칼럼 (닉네임은 옵션) — Partial<Column>으로 선언해 exceljs 내부 필드 충돌 회피
  type ColDef = { header: string; key: string; width: number };
  const columns: ColDef[] = [{ header: '작성일시', key: 'timestamp', width: 22 }];
  if (options.includeNickname) {
    columns.push({ header: '닉네임', key: 'nickname', width: 15 });
  }
  columns.push(
    { header: '탭ID', key: 'tabId', width: 12 },
    { header: '탭이름', key: 'tabName', width: 15 },
    { header: '내용', key: 'content', width: 50 },
    { header: '색상', key: 'color', width: 10 },
    { header: '좋아요', key: 'likes', width: 8 },
    { header: '댓글수', key: 'commentsCount', width: 8 },
    { header: '상태', key: 'status', width: 12 },
  );
  sheet.columns = columns as unknown as import('exceljs').Column[];

  const tabsMap = new Map<string, RealtimeWallTabConfig>((board.tabs ?? []).map((t) => [t.id, t]));

  const posts: readonly RealtimeWallPost[] =
    options.currentTabOnly && options.currentTabId
      ? board.posts.filter(
          (p) => ((p as { tabId?: string }).tabId ?? DEFAULT_TAB_ID) === options.currentTabId,
        )
      : board.posts;

  for (const post of posts) {
    const tabId = (post as { tabId?: string }).tabId ?? DEFAULT_TAB_ID;
    const tab = tabsMap.get(tabId);
    const row: Record<string, unknown> = {
      timestamp: new Date(post.submittedAt).toISOString(),
      tabId,
      // 인프라 레이어는 UI 문자열을 import 하지 않는다 — tab metadata 부재 시 id 자체를 fallback.
      // 어댑터가 tabs 배열을 전달할 때 default 탭에 DEFAULT_TAB_TITLE을 채워 넣는다.
      tabName: tab?.title ?? tabId,
      content: post.text,
      color: post.color ?? 'white',
      likes: post.likes ?? 0,
      commentsCount: post.comments?.length ?? 0,
      status: post.status,
    };
    if (options.includeNickname) {
      row.nickname = post.nickname;
    }
    sheet.addRow(row);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
