import { useState, useCallback } from 'react';
import { SyncStatus } from '@mobile/components/More/SyncStatus';
import { MobileShareModal } from '@mobile/components/Share/MobileShareModal';
import { MOBILE_APP_VERSION } from '@mobile/version';
import { useMobileRecentToolsStore } from '@mobile/stores/useMobileRecentToolsStore';
import { TOOL_GROUPS, findTool, searchTools, type ToolItem } from '@mobile/pages/more/toolCatalog';

interface Props {
  onNavigate: (page: string) => void;
}

interface MenuItemProps {
  icon: string;
  /** 아이콘 배경 Tailwind 클래스 — 미지정 시 sp-accent 톤. */
  iconBg?: string;
  /** 아이콘 글자 Tailwind 클래스 — 미지정 시 sp-accent 톤. */
  iconText?: string;
  label: string;
  description: string;
  onClick: () => void;
}

function MenuItem({
  icon,
  iconBg = 'bg-sp-accent/15',
  iconText = 'text-sp-accent',
  label,
  description,
  onClick,
}: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 w-full px-4 py-4 glass-card active:scale-[0.98] transition-transform text-left min-h-[64px]"
    >
      <div className={`flex items-center justify-center w-11 h-11 rounded-xl shrink-0 ${iconBg}`}>
        <span className={`material-symbols-outlined text-icon-xl ${iconText}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sp-text font-semibold text-sm">{label}</p>
        <p className="text-sp-muted text-xs mt-0.5">{description}</p>
      </div>
      <span
        className="material-symbols-outlined text-sp-muted text-icon-lg shrink-0"
        aria-hidden="true"
      >
        chevron_right
      </span>
    </button>
  );
}

/** 도구 한 칸 — 4열 그리드용. 라벨이 두 줄까지 자연스럽게 들어가도록 높이를 고정하지 않는다. */
function ToolTile({ tool, onOpen }: { tool: ToolItem; onOpen: (id: string) => void }) {
  return (
    <button
      onClick={() => onOpen(tool.id)}
      className="flex flex-col items-center gap-1.5 rounded-xl glass-card px-1 py-3 active:scale-[0.97] transition-transform"
      style={{ minHeight: 76 }}
    >
      <span className="material-symbols-outlined text-icon-xl text-sp-accent" aria-hidden="true">
        {tool.icon}
      </span>
      <span className="text-[11px] leading-tight text-sp-text text-center px-0.5">{tool.name}</span>
    </button>
  );
}

export function MorePage({ onNavigate }: Props) {
  const [showShare, setShowShare] = useState(false);
  const [query, setQuery] = useState('');

  const recentToolIds = useMobileRecentToolsStore((s) => s.recentToolIds);
  const markToolUsed = useMobileRecentToolsStore((s) => s.markUsed);

  /**
   * 도구 열기. 최근 사용에 남기고 이동한다.
   * 이 화면이 도구로 가는 유일한 입구이므로 여기서만 기록하면 된다.
   */
  const openTool = useCallback(
    (toolId: string) => {
      markToolUsed(toolId);
      onNavigate(toolId);
    },
    [markToolUsed, onNavigate],
  );

  const searchResult = searchTools(query);
  const recentTools = recentToolIds
    .map((id) => findTool(id))
    .filter((t): t is ToolItem => t !== undefined);

  const handleShared = useCallback(() => {
    // 분석은 MobileShareModal 내부에서 처리 가능하지만
    // 여기서는 간단히 모달 닫기만 처리
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        {/* 도구 찾기 — 14개 규모에서는 "타" 두 글자면 타이머가 걸린다.
            예전에는 더보기 → 쌤도구 → 도구로 세 번 눌러야 했고, 14개 중 눈으로 찾아야 했다. */}
        <label
          className="flex items-center gap-2 px-3 rounded-xl glass-card"
          style={{ minHeight: 44 }}
        >
          <span className="material-symbols-outlined text-sp-muted text-icon-lg" aria-hidden="true">
            search
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="도구 찾기"
            aria-label="도구 찾기"
            className="flex-1 min-w-0 bg-transparent text-sm text-sp-text placeholder:text-sp-muted outline-none py-2"
          />
          {query !== '' && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="검색어 지우기"
              /* 보이는 크기는 그대로 두고 누를 수 있는 넓이만 44px 로 넓힌다(음수 마진으로 상쇄). */
              className="grid place-items-center w-11 h-11 -my-1.5 -mr-1.5 rounded-lg text-sp-muted active:bg-black/5 dark:active:bg-white/10"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                close
              </span>
            </button>
          )}
        </label>

        {searchResult !== null ? (
          /* 검색 중 — 그룹을 접고 결과만 보여준다 */
          <section>
            {searchResult.length === 0 ? (
              <p className="text-sp-muted text-sm text-center py-8">
                &lsquo;{query}&rsquo; 와 맞는 도구가 없어요
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {searchResult.map((tool) => (
                  <ToolTile key={tool.id} tool={tool} onOpen={openTool} />
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {/* 최근 사용 — 순서 정렬일 뿐 점수·보상이 아니다.
                아래 그룹 목록의 순서는 고정이라 손이 위치를 기억할 수 있다. */}
            {recentTools.length > 0 && (
              <section>
                <h3 className="text-sp-muted text-xs font-semibold tracking-wider mb-2 px-1">
                  최근 사용
                </h3>
                <div className="grid grid-cols-4 gap-3">
                  {recentTools.map((tool) => (
                    <ToolTile key={tool.id} tool={tool} onOpen={openTool} />
                  ))}
                </div>
              </section>
            )}

            {TOOL_GROUPS.map((group) => (
              <section key={group.title}>
                <h3 className="text-sp-muted text-xs font-semibold tracking-wider mb-2 px-1">
                  {group.title}
                </h3>
                <div className="grid grid-cols-4 gap-3">
                  {group.tools.map((tool) => (
                    <ToolTile key={tool.id} tool={tool} onOpen={openTool} />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}

        {/* 메뉴 항목 */}
        <section>
          <h3 className="text-sp-muted text-xs font-semibold uppercase tracking-wider mb-2 px-1">
            메뉴
          </h3>
          <div className="space-y-3">
            <MenuItem
              icon="sticky_note_2"
              iconBg="bg-sp-warning/12"
              iconText="text-sp-warning"
              label="메모"
              description="포스트잇 메모 관리"
              onClick={() => onNavigate('memo')}
            />
            <MenuItem
              icon="bookmark"
              iconBg="bg-sp-success/12"
              iconText="text-sp-success"
              label="즐겨찾기"
              description="PC에서 등록한 링크 열기"
              onClick={() => onNavigate('bookmarks')}
            />
            <MenuItem
              icon="contacts"
              iconBg="bg-sp-accent/12"
              iconText="text-sp-accent"
              label="연락처"
              description="교직원·학생·보호자에게 바로 전화"
              onClick={() => onNavigate('contacts')}
            />
            {/* '쌤도구' 항목을 없앴다. 도구 14종이 이 화면 위쪽에 바로 펼쳐져 있어
                한 단계를 더 들어갈 이유가 없다(3번 → 2번). */}
            <MenuItem
              icon="settings"
              label="설정"
              description="학교, 교사, 학급 정보 확인"
              onClick={() => onNavigate('settings')}
            />
            <MenuItem
              icon="mail"
              iconBg="bg-sp-highlight/12"
              iconText="text-sp-highlight"
              label="지인에게 추천"
              description="동료 선생님께 쌤핀을 알려주세요"
              onClick={() => setShowShare(true)}
            />
          </div>
        </section>

        {/* 구글 드라이브 동기화 */}
        <section>
          <h3 className="text-sp-muted text-xs font-semibold uppercase tracking-wider mb-2 px-1">
            구글 드라이브 동기화
          </h3>
          <SyncStatus />
        </section>

        {/* 버전 */}
        <div className="flex items-center justify-center pt-2">
          <p className="text-sp-muted text-xs">쌤핀 모바일 {MOBILE_APP_VERSION}</p>
        </div>
      </div>

      {/* 공유 모달 */}
      <MobileShareModal
        isOpen={showShare}
        onClose={() => setShowShare(false)}
        onShared={handleShared}
      />
    </div>
  );
}
