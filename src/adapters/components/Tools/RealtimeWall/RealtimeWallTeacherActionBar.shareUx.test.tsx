/**
 * realtime-wall-share-link-bug 회귀 방지 테스트 (2026-05-14)
 *
 * 사용자 신고: "학생 참여 시작"을 눌러도 학생 공유 링크/QR이 전혀 안 보임.
 * 근본 원인: 라이브 진입 후 공유 UI 진입점이 우측 56px 슬림 ActionBar 의 'share'
 * 아이콘 하나뿐인데, 사용자가 그 아이콘을 찾지 못해 "기능이 죽었다"고 인식.
 *
 * 이 테스트는 share UX 의 두 가지 핵심 invariant 를 회귀 방지로 못박는다:
 *
 *   1. ActionBar 의 share 버튼은 pre-live (`isLiveMode === false`) 단계에서는
 *      `disabled` 여야 한다 (사용자가 라이브 시작 전에 클릭해도 빈 drawer 가
 *      열리지 않도록).
 *   2. ActionBar 의 share 버튼은 라이브 (`isLiveMode === true`) 단계에서는
 *      클릭 가능해야 한다 (회귀 시 share 진입 자체가 불가능해진다).
 *
 * 테스트 환경: vitest + react-dom/server (jsdom 불필요, vitest.config.ts 의
 * `environment: 'node'` 와 정합 — 같은 패턴이 RealtimeWallCardMarkdown.fuzz.test.tsx 에 있음).
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { RealtimeWallTeacherActionBar } from './RealtimeWallTeacherActionBar';

interface ButtonAttrs {
  readonly disabled: boolean;
  readonly label: string;
}

/**
 * SSR 출력에서 button 의 aria-label 과 disabled 속성을 추출.
 * 매우 가벼운 attribute parsing — happy-dom/jsdom 없이도 invariant 검증 가능.
 */
function extractButtons(html: string): ButtonAttrs[] {
  const buttons: ButtonAttrs[] = [];
  const re = /<button\b([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1] ?? '';
    const labelMatch = /aria-label="([^"]*)"/.exec(attrs);
    const label = labelMatch?.[1];
    if (!label) continue;
    const disabled = /\bdisabled(?:="")?/.test(attrs);
    buttons.push({ label, disabled });
  }
  return buttons;
}

function findShareButton(html: string): ButtonAttrs | undefined {
  return extractButtons(html).find((b) => b.label.startsWith('공유'));
}

describe('RealtimeWallTeacherActionBar — share UX 회귀 방지', () => {
  const baseProps = {
    layoutMode: 'kanban' as const,
    pendingCount: 0,
    studentFormLocked: false,
    onOpenShare: () => {},
    onOpenDesign: () => {},
    onOpenColumns: () => {},
    onOpenApprovalQueue: () => {},
    onToggleStudentLock: () => {},
    onOpenExport: () => {},
    onAddTeacherCard: () => {},
  };

  it('pre-live 단계 (isLiveMode=false) 에서 공유 버튼은 disabled 여야 한다', () => {
    const html = renderToString(
      <RealtimeWallTeacherActionBar {...baseProps} isLiveMode={false} />,
    );
    const share = findShareButton(html);
    expect(share, 'share 버튼이 ActionBar 에 존재해야 한다').toBeDefined();
    expect(share?.disabled, 'pre-live 에서 share 버튼은 disabled').toBe(true);
    expect(share?.label).toContain('라이브 시작 후');
  });

  it('라이브 단계 (isLiveMode=true) 에서 공유 버튼은 클릭 가능해야 한다', () => {
    const html = renderToString(
      <RealtimeWallTeacherActionBar {...baseProps} isLiveMode={true} />,
    );
    const share = findShareButton(html);
    expect(share, 'share 버튼이 ActionBar 에 존재해야 한다').toBeDefined();
    expect(share?.disabled, '라이브 모드에서 share 버튼은 활성화').toBe(false);
    // 라이브 모드 라벨은 "공유 — QR / 주소" 로 시작
    expect(share?.label).toContain('QR');
  });

  it('layoutMode 와 무관하게 share 버튼은 항상 ActionBar 에 존재한다 (회귀 방지)', () => {
    for (const layoutMode of ['kanban', 'freeform', 'grid', 'stream'] as const) {
      const html = renderToString(
        <RealtimeWallTeacherActionBar
          {...baseProps}
          layoutMode={layoutMode}
          isLiveMode={true}
        />,
      );
      const share = findShareButton(html);
      expect(share, `layoutMode=${layoutMode} 에서 share 버튼 존재`).toBeDefined();
      expect(share?.disabled).toBe(false);
    }
  });
});

/**
 * realtime-wall-share-link-bug Phase 2 (2026-05-14) — ActionBar viewport overflow 회귀 방지.
 *
 * 사용자 신고 (인용): "학생 참여 시작 버튼을 클릭하면 설정, 공유 등의 사이드바가 맨
 * 왼쪽에 가려져서 보이지 않는 거였어. 좌우 스크롤을 활용해 창을 이동해야지 보이네"
 *
 * 근본 원인 (frontend-architect 진단):
 *   1) [ToolRealtimeWall.tsx](src/adapters/components/Tools/ToolRealtimeWall.tsx)
 *      의 라이브 모드 grid 가 `xl:grid-cols-[...]` prefix 를 가져 1280px 미만에서
 *      적용 안 됨 → ActionBar 가 블록 흐름으로 떨어져 viewport 밖 push.
 *   2) `useLiveContainerRect` 가 Sidebar transition 중 stale main rect 캡처 시
 *      `fixed` 컨테이너 width 가 viewport 전폭 → 그 안의 `1fr + auto` grid 가
 *      BrowserWindow 가로 스크롤 유발.
 *
 * 수정 (C안): `xl:` 제거 + `auto` → 명시적 `56px`. 모든 breakpoint 동작 + stale
 * rect 라도 grid 가 부모 폭 안에 레이아웃 완성.
 *
 * 회귀 방지 invariant (jsdom 한계로 className-level 검증):
 *   I-1. grid template 은 `xl:` prefix 없이 항상 적용된다 (responsive breakpoint
 *        에 의존하지 않음).
 *   I-2. grid template 마지막 트랙은 명시적 `56px` (=`auto` 가 아님) — kanban 내부
 *        의 `overflow-x-auto` 컨텐츠가 ActionBar 폭을 침범하지 못함.
 *   I-3. ActionBar 자체는 `w-14 shrink-0` 을 유지한다 — grid 가 축소 압력을 ActionBar
 *        에 전달해도 56px 미만으로 줄어들지 않음.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TOOL_PATH = path.resolve(
  __dirname,
  '..',
  'ToolRealtimeWall.tsx',
);
const ACTION_BAR_PATH = path.resolve(__dirname, 'RealtimeWallTeacherActionBar.tsx');

describe('ToolRealtimeWall — 라이브 grid ActionBar viewport overflow 회귀 방지 (Phase 2)', () => {
  const toolSource = readFileSync(TOOL_PATH, 'utf8');
  const actionBarSource = readFileSync(ACTION_BAR_PATH, 'utf8');

  it('I-1: 라이브 grid 에 `xl:grid-cols-` prefix 가 남아 있지 않다', () => {
    // 회귀 시 1280px 미만에서 grid 미적용 → ActionBar 가 블록 흐름으로 빠짐.
    // 라이브 영역 외 다른 곳에 xl:grid-cols 가 미래에 추가되더라도, 라이브 grid
    // 만큼은 unconditional 이어야 함. 가장 확실한 가드: 라이브 grid 정규식 매치
    // 후 그 라인에 xl: prefix 가 없는지 확인.
    expect(toolSource).toMatch(/grid-cols-\[280px_minmax\(0,1fr\)_56px\]/);
    expect(toolSource).toMatch(/grid-cols-\[minmax\(0,1fr\)_56px\]/);
    // 라이브 grid 트랙 정의 라인에 xl: 가 붙어있으면 fail
    expect(toolSource).not.toMatch(/xl:grid-cols-\[[^\]]*minmax\(0,1fr\)/);
  });

  it('I-2: 라이브 grid 마지막 트랙은 명시적 56px 이며 auto 가 아니다', () => {
    // `auto` 트랙은 grid item 의 min-content 폭으로 결정되어 kanban 내부 컨텐츠
    // 폭에 의해 강제 확장될 위험. 56px 고정값으로 invariant 보장.
    expect(toolSource).toMatch(/_56px\]/);
    // 이전 회귀 패턴 (`xl:grid-cols-[... _auto]`) 이 라이브 grid 에 없는지 확인.
    expect(toolSource).not.toMatch(/xl:grid-cols-\[280px_minmax\(0,1fr\)_auto\]/);
    expect(toolSource).not.toMatch(/xl:grid-cols-\[minmax\(0,1fr\)_auto\]/);
  });

  it('I-3: RealtimeWallTeacherActionBar aside 는 w-14 shrink-0 을 유지한다', () => {
    // grid track 이 56px 로 명시되어도, ActionBar 자체가 shrink 허용하면 내부
    // 콘텐츠 압력에 따라 줄어들 수 있음. 본 invariant 가 56px 의 마지막 방어선.
    // [RealtimeWallTeacherActionBar.tsx:139](src/adapters/components/Tools/RealtimeWall/RealtimeWallTeacherActionBar.tsx#L139)
    expect(actionBarSource).toMatch(/className="[^"]*\bw-14\b[^"]*\bshrink-0\b/);
  });

  it('I-4: 라이브 grid wrapper 는 data-testid 로 식별 가능하다 (향후 e2e 진입점)', () => {
    // jsdom 한계로 layout assert 는 불가능하지만, e2e/playwright 진입점은 마련.
    expect(toolSource).toMatch(/data-testid="realtime-wall-live-grid"/);
  });
});
