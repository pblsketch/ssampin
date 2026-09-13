/**
 * 근거 지도(ADR-106 · 장면 통합 ADR-107 · 장면 단위 화살표 ADR-108) : 근거 정리의 기본 보기.
 *
 * 주제 묶음이 세로로 쌓이고, 묶음 안은 둘 중 하나다.
 *  - **장면 열**(주제에 장면이 있으면): `[평가: 교사 판단] [동기: …] [과정: …] … [자리 미정]` 열이 가로로 놓이고 카드는 그 열에
 *    적힌 차례로 세로로 쌓인다. 열 = 글 순서. **화살표는 장면과 장면 사이**에만 있고(앞 열 → 다음 열), 그 위 라벨이 이음말이다.
 *    근거 사이에는 화살표를 긋지 않는다 : 근거의 앞뒤는 열 안 차례가 말한다(오너 결정 2026-09-11).
 *  - **날짜순 흐름**(장면이 없으면): 카드가 날짜순으로 왼쪽→오른쪽, 줄이 차면 아래로. 묶음 머리 [뼈대 깔기]로 열을 만든다.
 * 이어진 주제(앞 주제와 잇기)는 앞 주제 바로 아래에 오고, 둘 사이에 **이음말 라벨이 달린 화살표**가 그려진다.
 *
 * 화면 낱말: 근거 · 주제 · 장면(자리) · 이음말 · 뼈대 · 지도. ("서사·줄기·노드·엣지·캔버스"는 코드에만.)
 *
 * ★스토어를 구독하지 않는다. 자료도 동작도 전부 부모(`RecordEvidenceBoard`)가 props 로 준다 : 저장 관문은 한 곳(부모)에만.
 * ★놓는 곳 이름표는 보드와 같다(`drop:unclassified` · `drop:thread:{id}` · `drop:scene:…` · `drop:unplaced:…` · `drop:new`).
 * ★새 라이브러리 없음 : 카드는 절대 위치 div, 화살표는 SVG 하나, 이동은 컨테이너 스크롤, 확대는 CSS transform.
 * ★점선은 「AI 제안·저장 전」에만 : 자리 미정 열의 점선 **윤곽**(`outline-dashed`)은 옛 흐름 보기의 「자리 미정」 관례를 잇는다.
 */
import {
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useDroppable } from '@dnd-kit/core';

import type { InquiryThread, NarrativeScene } from '@domain/entities/InquiryThread';
import type { RecordEvidence } from '@domain/entities/RecordEvidence';
import type { NarrativeRole } from '@domain/rules/narrativeParagraphs';
import { EvidenceMapConnections, type MapConnectionChange } from './EvidenceMapConnections';
import { EvidenceMapNode } from '@adapters/components/RecordDraft/EvidenceMapNode';
import { ROLE_DOT } from '@adapters/components/RecordDraft/narrativeRoleStyles';
import { EVALUATION_EMPTY_SHORT } from '@adapters/components/RecordDraft/evaluationGuide';
import {
  layoutEvidenceMap,
  MAP_COLUMN_HEAD,
  MAP_SCENE_W,
  MAP_NODE_W,
  MAP_GROUP_HEAD,
  MAP_LINK_GAP,
  MAP_TOPIC_X,
  MAP_TOPIC_W,
  MAP_NOTE_H,
  type MapGroupBox,
  type MapOffset,
} from '@adapters/components/RecordDraft/evidenceMapLayout';

/** 묶음 안의 열 하나 : 장면(자리) 또는 「자리 미정」. */
export interface MapColumnModel {
  readonly linkedEvidenceCount?: number;
  readonly key: string;
  readonly kind: 'scene' | 'unplaced';
  /** 장면 열이면 그 장면(가상 평가 자리 포함). */
  readonly scene?: NarrativeScene;
  /** 저장된 장면이 아니라 화면이 끼워 넣은 평가 자리인가. */
  readonly virtual?: boolean;
  readonly role?: NarrativeRole;
  /** 자리 이름(동기·과정…)과 세부(카테고리/직접 적은 이름). 「자리 미정」은 slot 만. */
  readonly slot: string;
  readonly detail: string | null;
  readonly note?: string;
  /** 앞 장면에서 이 장면으로 넘어가는 이음말. 첫 장면·자리 미정에는 없다. */
  readonly leadIn?: string;
  readonly dropId: string;
  readonly items: readonly RecordEvidence[];
}

export interface EvidenceMapGroupModel {
  readonly key: string;
  /** 주제 묶음이면 그 주제. 「주제 미정 근거」 묶음은 없음. */
  readonly thread?: InquiryThread;
  readonly title: string;
  readonly items: readonly RecordEvidence[];
  /** 놓는 곳 이름표 : 보드와 같은 값. */
  readonly dropId: string;
  /** 닫힌 주제 : 카드를 받지 않는다. */
  readonly closed?: boolean;
  /** 접어 둔 묶음 : 머리만 보인다. 카드 수는 머리에 남는다. */
  readonly collapsed?: boolean;
  /** 주제 차례 ↑↓ : 이어진 묶음의 맨 앞 주제에만. 없으면 단추를 그리지 않는다. */
  readonly move?: { readonly up: boolean; readonly down: boolean; readonly groupSize: number };
  /** 장면 열(있으면 열 배치, 없으면 날짜순 흐름). */
  readonly columns?: readonly MapColumnModel[];
  /** 앞 주제에서 이어짐 : 앞 묶음에서 이 묶음으로 화살표 + 이음말 라벨. */
  readonly linkFrom?: { readonly threadId: string; readonly title: string; readonly note?: string };
}

export interface EvidenceMapViewProps {
  onConnectionChange?: (change: MapConnectionChange) => Promise<void>;
  onConnectionEditingChange?: (editing: boolean) => void;
  readonly studentName?: string;
  readonly scopeKey?: string;
  readonly groups: readonly EvidenceMapGroupModel[];
  readonly selectedIds: readonly string[];
  /** 오른쪽 상세가 보고 있는 카드. */
  readonly focusedId: string | null;
  /** 오른쪽에서 열려 있는 장면(`threadId:sceneId`) / 장면 이음(`threadId:sceneId`, 뒤 장면) / 주제 / 주제 이음(뒤 주제 id). 눌린 상태 표시용. */
  readonly selectedSceneKey?: string | null;
  readonly selectedSceneLinkKey?: string | null;
  readonly selectedThreadId?: string | null;
  readonly selectedThreadLinkId?: string | null;
  readonly offsets: ReadonlyMap<string, MapOffset>;
  readonly zoom: number;
  readonly hasCustomPositions: boolean;
  readonly expanded?: boolean;
  isMirror: (id: string) => boolean;
  differsFromSource: (e: RecordEvidence) => boolean;
  onSelectNode: (id: string) => void;
  onToggleNodeSelected?: (id: string) => void;
  /** 열 머리를 눌렀다 : 오른쪽에 장면 상세. */
  onSelectScene?: (threadId: string, sceneId: string) => void;
  /** 장면 사이 화살표의 이음말 라벨을 눌렀다(뒤 장면 id) : 오른쪽에 장면 이음. */
  onSelectSceneLink?: (threadId: string, sceneId: string) => void;
  /** 묶음 제목을 눌렀다 : 오른쪽에 주제 상세. */
  onSelectThread?: (threadId: string) => void;
  /** 주제 사이 이음말 라벨을 눌렀다(뒤 주제 id). */
  onSelectThreadLink?: (threadId: string) => void;
  /** 장면이 없는 주제의 [뼈대 깔기] : 뼈대 고르기를 연다. */
  onLayScaffold?: (threadId: string) => void;
  onAddScene?: (threadId: string) => void;
  onOpenThread: (threadId: string) => void;
  /** 묶음 머리 ↑↓ : 주제 차례를 바꾼다(저장). 없으면 단추를 그리지 않는다. */
  onMoveGroup?: (threadId: string, dir: -1 | 1) => void;
  /** 묶음 접기/펼치기(화면 상태). */
  onToggleGroupCollapsed?: (threadId: string) => void;
  onZoom: (zoom: number) => void;
  onResetPositions: () => void;
  onToggleExpanded?: () => void;
  /** 그 묶음 위에 띄울 AI 제안(점선). 없으면 아무것도 그리지 않는다. */
  renderGhost?: (groupKey: string) => ReactNode;
  /** 맨 끝 [+ 주제] 칸(놓는 곳). 부모가 그려 준다. */
  readonly newThreadZone?: ReactNode;
}

const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;

const iconBtn =
  'rounded-lg p-1 text-sp-muted transition-colors hover:bg-sp-card hover:text-sp-text disabled:opacity-30';

/** 장면 열 하나 : 머리(첫 줄: 장면 단추 · 둘째 줄: 앞 장면에서 오는 이음말) + 놓는 곳. 카드는 부모(지도)가 절대 좌표로 그 위에 그린다. */
function MapColumn({
  column,
  ordinal,
  prev,
  threadId,
  x,
  y,
  w,
  locked,
  pressed,
  linkPressed,
  onSelectScene,
  onSelectSceneLink,
}: {
  readonly column: MapColumnModel;
  readonly ordinal: number;
  /** 바로 앞 열(장면이면 화살표가 온다). */
  readonly prev: MapColumnModel | undefined;
  readonly threadId: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly locked: boolean;
  readonly pressed: boolean;
  readonly linkPressed: boolean;
  onSelectScene?: (threadId: string, sceneId: string) => void;
  onSelectSceneLink?: (threadId: string, sceneId: string) => void;
}): ReactElement {
  const { setNodeRef, isOver } = useDroppable({
    id: column.dropId,
    disabled: locked,
    data: { label: column.kind === 'scene' ? `${column.slot} 장면` : '자리 미정' },
  });
  const isScene = column.kind === 'scene';
  const note = column.note?.trim() ?? '';
  const leadIn = column.leadIn?.trim() ?? '';
  const hasIncoming = isScene && prev !== undefined && prev.kind === 'scene';
  const head = `${column.slot}${column.detail === null ? '' : `: ${column.detail}`}`;
  return (
    <div
      ref={setNodeRef}
      data-map-column={column.key}
      data-sp-floating
      data-drop-over={isOver ? '' : undefined}
      style={{ left: x, top: y, width: w, height: MAP_COLUMN_HEAD }}
      className={`absolute rounded-lg transition-colors ${
        isOver
          ? 'bg-sp-card ring-2 ring-sp-accent'
          : isScene
            ? 'bg-sp-card ring-1 ring-sp-border'
            : 'outline-dashed outline-1 outline-sp-border'
      }`}
    >
      {isScene && column.scene !== undefined ? (
        <button
          type="button"
          onClick={() => onSelectScene?.(threadId, column.scene!.id)}
          aria-pressed={pressed}
          aria-label={`${head} 장면, 근거 ${column.linkedEvidenceCount ?? column.items.length}건${note.length > 0 ? `, 메모 있음` : ''}${
            column.virtual === true ? ', 아직 저장되지 않은 자리' : ''
          }`}
          title={note.length > 0 ? `메모: ${note}` : '장면을 눌러 카테고리·메모·순서를 고칩니다'}
          style={{ height: MAP_COLUMN_HEAD }}
          className={`flex w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors hover:bg-sp-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sp-accent ${
            pressed ? 'ring-2 ring-sp-accent' : ''
          }`}
        >
          {column.role !== undefined && (
            <span
              aria-hidden="true"
              className={`h-2 w-2 shrink-0 rounded-full ${ROLE_DOT[column.role]}`}
            />
          )}
          <span className="min-w-0 font-semibold text-sp-text">
            {ordinal}. {column.slot}
            {column.detail !== null && (
              <span className="line-clamp-2 font-normal text-sp-muted">{column.detail}</span>
            )}
          </span>
          {note.length > 0 && (
            <span
              aria-hidden="true"
              className="material-symbols-outlined shrink-0 text-sm text-sp-muted"
            >
              sticky_note_2
            </span>
          )}
          <span className="ml-auto shrink-0 text-sp-muted" title="이 장면에 연결된 근거 수">
            {column.linkedEvidenceCount ?? column.items.length}
          </span>
        </button>
      ) : (
        <div
          style={{ height: 36 }}
          className="flex items-center gap-1.5 px-2 text-xs"
          aria-label={`자리 미정, 근거 ${column.items.length}건`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-sm text-sp-muted">
            inbox
          </span>
          <span className="font-semibold text-sp-muted">자리 미정</span>
          <span className="ml-auto text-sp-muted">{column.items.length}</span>
        </div>
      )}
      {/* 둘째 줄 : 앞 장면에서 오는 이음말. 화살표(SVG)는 지도가 이 줄 높이로 그린다. */}
      <div
        style={{ top: -34, left: 36, width: w - 40 }}
        data-sp-floating
        className="absolute flex items-center px-1.5"
      >
        {hasIncoming && column.scene !== undefined && (
          <button
            type="button"
            data-map-scene-link={`${threadId}:${column.scene.id}`}
            aria-pressed={linkPressed}
            aria-label={`${prev!.slot}에서 ${column.slot}로 이어짐${leadIn.length > 0 ? `, 이음말 ${leadIn}` : ', 이음말 없음'}`}
            title={
              leadIn.length > 0
                ? `이음: ${leadIn}`
                : '앞 장면에서 이 장면으로 넘어가는 이음말을 적으려면 누르세요'
            }
            onClick={() => onSelectSceneLink?.(threadId, column.scene!.id)}
            className={`flex min-w-0 max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sp-accent ${
              linkPressed
                ? 'bg-blue-500/10 text-sp-accent ring-sp-accent'
                : leadIn.length > 0
                  ? 'bg-sp-surface text-sp-text ring-sp-border hover:ring-sp-accent'
                  : 'text-sp-muted ring-transparent hover:ring-sp-border'
            }`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-sm text-sp-muted">
              subdirectory_arrow_right
            </span>
            <span className="line-clamp-2">
              {column.scene?.leadInNeedsCheck ? '확인 필요 · ' : ''}
              {leadIn.length > 0 ? leadIn : '이음말 적기'}
            </span>
          </button>
        )}
      </div>
      {note.length > 0 && (
        <button
          type="button"
          data-map-note
          title={note}
          onClick={() => column.scene && onSelectScene?.(threadId, column.scene.id)}
          style={{ top: MAP_COLUMN_HEAD + 12 }}
          data-sp-floating
          className="absolute w-full rounded-lg border border-sp-highlight/30 bg-sp-card px-3 py-2 text-left text-sm text-sp-text shadow-sm"
        >
          <span className="block text-xs text-sp-highlight">
            {column.scene?.noteSource === 'ai' ? 'AI 제안 메모' : '교사 메모'}
          </span>
          <span className="line-clamp-2">{note}</span>
        </button>
      )}
      {column.items.length === 0 && (
        <p
          style={{ left: MAP_SCENE_W + 48, top: 12, width: MAP_NODE_W }}
          data-sp-floating
          className="absolute rounded-lg border border-dashed border-sp-border px-3 py-2 text-xs leading-snug text-sp-muted"
        >
          {/* 빈 평가 열은 "비워 두어도 된다"고 말한다 : 초안이 근거 전체로 채운다(ADR-109). */}
          {(column.linkedEvidenceCount ?? 0) > 0
            ? '다른 장면에 표시된 근거를 함께 참조합니다.'
            : !isScene
              ? '이 주제의 근거가 모두 장면에 들어갔습니다'
              : column.role === 'evaluation'
                ? EVALUATION_EMPTY_SHORT
                : '카드를 여기에 끌어 놓으세요'}
        </p>
      )}
    </div>
  );
}

function MapGroup({
  group,
  box,
  children,
  selectedSceneKey,
  selectedSceneLinkKey,
  threadPressed,
  onOpenThread,
  onMoveGroup,
  onToggleCollapsed,
  onSelectThread,
  onSelectScene,
  onSelectSceneLink,
  onLayScaffold,
  onAddScene,
}: {
  readonly group: EvidenceMapGroupModel;
  readonly box: MapGroupBox;
  readonly children: ReactNode;
  readonly selectedSceneKey: string | null;
  readonly selectedSceneLinkKey: string | null;
  readonly threadPressed: boolean;
  onOpenThread: (threadId: string) => void;
  onMoveGroup?: (threadId: string, dir: -1 | 1) => void;
  onToggleCollapsed?: (threadId: string) => void;
  onSelectThread?: (threadId: string) => void;
  onSelectScene?: (threadId: string, sceneId: string) => void;
  onSelectSceneLink?: (threadId: string, sceneId: string) => void;
  onLayScaffold?: (threadId: string) => void;
  onAddScene?: (threadId: string) => void;
}): ReactElement {
  const { setNodeRef, isOver } = useDroppable({
    id: group.dropId,
    disabled: group.closed === true,
    data: { label: group.title },
  });
  const count = group.items.length;
  const collapsed = group.collapsed === true;
  const thread = group.thread;
  const hasColumns = !collapsed && group.columns !== undefined && box.columns !== undefined;
  return (
    <section
      ref={setNodeRef}
      aria-label={`${group.title} · 근거 ${count}건`}
      data-map-group={group.key}
      data-drop-over={isOver ? '' : undefined}
      style={{ top: box.y, height: box.h }}
      className={`absolute left-0 right-0 transition-colors ${
        isOver && !hasColumns ? 'ring-2 ring-sp-accent' : ''
      } ${group.closed === true ? 'opacity-70' : ''}`}
    >
      {/* 머리 한 줄: 접기 · 제목 · 건수 · (hover) ↑↓ · [뼈대 깔기] · ⋯ */}
      <header
        style={{
          left: MAP_TOPIC_X,
          top: box.topicY,
          width: MAP_TOPIC_W,
          minHeight: MAP_GROUP_HEAD,
        }}
        data-sp-floating
        className="group/head absolute flex flex-wrap items-center gap-1 rounded-xl bg-sp-card px-3 py-2 text-sm shadow-sm ring-1 ring-sp-border"
      >
        {thread !== undefined && onToggleCollapsed !== undefined && (
          <button
            type="button"
            onClick={() => onToggleCollapsed(thread.id)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? `${group.title} 펼치기` : `${group.title} 접기`}
            title={collapsed ? '카드를 다시 펼칩니다' : '제목만 남기고 접습니다'}
            className={iconBtn}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-base">
              {collapsed ? 'chevron_right' : 'expand_more'}
            </span>
          </button>
        )}
        {thread !== undefined && onSelectThread !== undefined ? (
          <button
            type="button"
            onClick={() => onSelectThread(thread.id)}
            aria-pressed={threadPressed}
            title="주제를 눌러 이름·앞 주제·뼈대·초안 쓰기를 다룹니다"
            className={`min-w-0 flex-1 line-clamp-2 rounded-lg px-1 text-left font-semibold text-sp-text transition-colors hover:bg-sp-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent ${
              threadPressed ? 'bg-blue-500/10 text-sp-accent' : ''
            }`}
          >
            {group.title}
          </button>
        ) : (
          <h4 className="min-w-0 truncate px-1 font-semibold text-sp-text" title={group.title}>
            {group.title}
          </h4>
        )}
        <span className="shrink-0 text-xs text-sp-muted">{count}건</span>
        {group.closed === true && (
          <span className="shrink-0 rounded bg-sp-card px-1.5 py-0.5 text-xs text-sp-muted">
            마친 주제
          </span>
        )}
        {thread !== undefined && group.move !== undefined && onMoveGroup !== undefined && (
          <span
            data-sp-floating
            className="absolute -bottom-8 left-4 z-10 flex items-center rounded-lg bg-sp-card opacity-0 transition-opacity focus-within:opacity-100 group-hover/head:opacity-100"
          >
            <button
              type="button"
              disabled={!group.move.up}
              onClick={() => onMoveGroup(thread.id, -1)}
              aria-label={
                group.move.groupSize > 1
                  ? `이어진 주제 ${group.move.groupSize}개를 함께 위로 옮기기`
                  : `${group.title} 위로 옮기기`
              }
              title="주제 차례를 위로 (초안 내용은 바뀌지 않습니다)"
              className={iconBtn}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-base">
                arrow_upward
              </span>
            </button>
            <button
              type="button"
              disabled={!group.move.down}
              onClick={() => onMoveGroup(thread.id, 1)}
              aria-label={
                group.move.groupSize > 1
                  ? `이어진 주제 ${group.move.groupSize}개를 함께 아래로 옮기기`
                  : `${group.title} 아래로 옮기기`
              }
              title="주제 차례를 아래로 (초안 내용은 바뀌지 않습니다)"
              className={iconBtn}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-base">
                arrow_downward
              </span>
            </button>
          </span>
        )}
        {thread !== undefined &&
          !collapsed &&
          group.columns === undefined &&
          onLayScaffold !== undefined &&
          group.closed !== true && (
            <button
              type="button"
              onClick={() => onLayScaffold(thread.id)}
              title="장면 자리(평가·동기·과정·결과)를 깔아 글 순서를 정합니다"
              className="order-last flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-sp-muted ring-1 ring-sp-border transition-colors hover:bg-sp-card hover:text-sp-text"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-sm">
                view_agenda
              </span>
              뼈대 깔기
            </button>
          )}
        {thread !== undefined && !collapsed && !group.closed && onAddScene && (
          <button
            type="button"
            onClick={() => onAddScene(thread.id)}
            aria-label={`${group.title}에 장면 추가`}
            className="order-last w-full rounded-lg px-2 py-1 text-xs text-sp-muted ring-1 ring-sp-border hover:bg-sp-card hover:text-sp-text"
          >
            + 장면 추가
          </button>
        )}
        {thread !== undefined && (
          <button
            type="button"
            onClick={() => onOpenThread(thread.id)}
            aria-label={`${group.title} 주제 설정`}
            title="키워드·역량·다음 메모를 고치거나 주제를 닫습니다"
            className={iconBtn}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-base">
              more_horiz
            </span>
          </button>
        )}
      </header>
      {!collapsed && count === 0 && group.columns === undefined && (
        <p
          style={{ left: MAP_TOPIC_X + MAP_TOPIC_W + 48, top: box.topicY }}
          data-sp-floating
          className="absolute max-w-60 px-3 text-sm text-sp-muted"
        >
          {thread === undefined
            ? '모든 근거가 주제에 들어갔습니다.'
            : '아직 근거가 없습니다. 카드를 여기에 끌어 놓으세요.'}
        </p>
      )}
      {hasColumns &&
        thread !== undefined &&
        group.columns!.map((col, i) => {
          const cb = box.columns![i];
          if (cb === undefined) return null;
          const key = col.scene === undefined ? null : `${thread.id}:${col.scene.id}`;
          return (
            <MapColumn
              key={col.key}
              column={col}
              ordinal={i + 1}
              prev={i > 0 ? group.columns![i - 1] : undefined}
              threadId={thread.id}
              x={cb.x}
              y={cb.y}
              w={cb.w}
              locked={group.closed === true}
              pressed={key !== null && selectedSceneKey === key}
              linkPressed={key !== null && selectedSceneLinkKey === key}
              {...(onSelectScene === undefined ? {} : { onSelectScene })}
              {...(onSelectSceneLink === undefined ? {} : { onSelectSceneLink })}
            />
          );
        })}
      {children}
    </section>
  );
}

export function EvidenceMapView({
  studentName = '선택한 학생',
  scopeKey = 'default',
  groups,
  selectedIds,
  focusedId,
  selectedSceneKey = null,
  selectedSceneLinkKey = null,
  selectedThreadId = null,
  selectedThreadLinkId = null,
  offsets,
  zoom,
  hasCustomPositions,
  expanded = false,
  isMirror,
  differsFromSource,
  onSelectNode,
  onToggleNodeSelected,
  onSelectScene,
  onSelectSceneLink,
  onSelectThread,
  onSelectThreadLink,
  onLayScaffold,
  onAddScene,
  onOpenThread,
  onMoveGroup,
  onToggleGroupCollapsed,
  onZoom,
  onResetPositions,
  onToggleExpanded,
  renderGhost,
  onConnectionChange,
  onConnectionEditingChange,
  newThreadZone,
}: EvidenceMapViewProps): ReactElement {
  const markerId = useId();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(960);
  const [overview, setOverview] = useState(false);
  const [expandedBranches, setExpandedBranches] = useState<readonly string[]>([]);
  const [foldedBranches, setFoldedBranches] = useState<readonly string[]>([]);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const sourceGroups = useMemo(
    () => groups.filter((g) => g.thread !== undefined || g.items.length > 0),
    [groups],
  );
  groups = useMemo(
    () =>
      sourceGroups.map((g) => ({
        ...g,
        ...(g.columns === undefined
          ? { items: overview ? [] : g.items }
          : {
              columns: g.columns
                .filter((c) => c.kind !== 'unplaced' || c.items.length > 0)
                .map((c) => ({
                  ...c,
                  items:
                    overview || foldedBranches.includes(c.key)
                      ? []
                      : g.items.length <= 8 || expandedBranches.includes(c.key)
                        ? c.items
                        : c.items.slice(0, 2),
                })),
            }),
      })),
    [sourceGroups, overview, expandedBranches, foldedBranches],
  );
  useLayoutEffect(() => {
    const strings = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    try {
      const saved = JSON.parse(
        localStorage.getItem(`ssampin:map-view-v2:${scopeKey}`) ?? '{}',
      ) as Record<string, unknown>;
      setOverview(saved.overview === true);
      setExpandedBranches(strings(saved.expanded));
      setFoldedBranches(strings(saved.folded));
      const position = JSON.parse(
        localStorage.getItem(`ssampin:map-scroll-v2:${scopeKey}`) ?? '{}',
      ) as Record<string, unknown>;
      const frame = requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = typeof position.top === 'number' ? position.top : 0;
          scrollRef.current.scrollLeft = typeof position.left === 'number' ? position.left : 0;
        }
      });
      setLoadedScope(scopeKey);
      return () => cancelAnimationFrame(frame);
    } catch {
      setOverview(false);
      setExpandedBranches([]);
      setFoldedBranches([]);
      setLoadedScope(scopeKey);
    }
  }, [scopeKey]);
  useEffect(() => {
    if (loadedScope !== scopeKey) return;
    try {
      localStorage.setItem(
        `ssampin:map-view-v2:${scopeKey}`,
        JSON.stringify({ overview, expanded: expandedBranches, folded: foldedBranches }),
      );
    } catch {
      /* 표시 설정을 저장하지 못해도 근거 편집은 계속한다. */
    }
  }, [scopeKey, loadedScope, overview, expandedBranches, foldedBranches]);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const target = Array.from(
      viewport.querySelectorAll<HTMLElement>('[data-map-node], [data-map-column]'),
    ).find((el) =>
      focusedId !== null
        ? el.dataset.mapNode === focusedId
        : el.dataset.mapColumn === selectedSceneKey,
    );
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      const box = target.getBoundingClientRect();
      const area = viewport.getBoundingClientRect();
      if (box.right > area.right - 16) viewport.scrollLeft += box.right - area.right + 24;
      if (box.left < area.left + 16) viewport.scrollLeft -= area.left - box.left + 24;
      if (box.bottom > area.bottom - 48) viewport.scrollTop += box.bottom - area.bottom + 56;
      if (box.top < area.top + 16) viewport.scrollTop -= area.top - box.top + 24;
    });
    return () => cancelAnimationFrame(frame);
  }, [focusedId, selectedSceneKey, viewportWidth]);

  // 보이는 영역 너비 : 묶음이 최소한 이만큼은 채운다. jsdom 에서는 0 이라 기본값을 쓴다.
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    const measure = (): void => {
      const w = el.clientWidth;
      if (w > 0) setViewportWidth(Math.max(320, w - 32));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(
    () =>
      layoutEvidenceMap(
        groups.map((g) => ({
          key: g.key,
          items: g.items,
          ...(g.collapsed === true ? { collapsed: true } : {}),
          ...(g.columns === undefined
            ? {}
            : {
                columns: g.columns.map((c) => ({
                  key: c.key,
                  items: c.items,
                  ...(c.note ? { note: c.note } : {}),
                })),
              }),
          ...(g.linkFrom === undefined ? {} : { linkedFrom: true }),
        })),
        offsets,
        viewportWidth,
      ),
    [groups, offsets, viewportWidth],
  );
  const evidenceById = useMemo(() => {
    const m = new Map<string, RecordEvidence>();
    for (const g of groups) for (const e of g.items) m.set(e.id, e);
    return m;
  }, [groups]);

  const fit = (): void => {
    setOverview((value) => !value);
  };
  const step = (dir: -1 | 1): void => {
    onZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((zoom + dir * ZOOM_STEP) * 10) / 10)));
  };

  const totalEvidence = sourceGroups.reduce((n, g) => n + g.items.length, 0);
  const boxByKey = useMemo(() => new Map(layout.groups.map((b) => [b.key, b] as const)), [layout]);

  /** 주제 사이 이음 : 앞 묶음 아래에서 뒤 묶음 위로. 라벨은 그 사이 간격의 가운데. */
  const threadLinks = groups.flatMap((g) => {
    if (g.thread === undefined || g.linkFrom === undefined) return [];
    const to = boxByKey.get(g.key);
    const from = boxByKey.get(g.linkFrom.threadId);
    if (to === undefined || from === undefined) return [];
    return [{ group: g, from, to }];
  });

  /** 장면 사이 화살표 : 앞 열 오른쪽 가장자리에서 다음 열 왼쪽으로, 열 머리 둘째 줄 높이. 자리 미정 열로는 가지 않는다. */
  const sceneArrows = groups.flatMap((g) => {
    if (g.collapsed === true || g.columns === undefined) return [];
    const box = boxByKey.get(g.key);
    if (box?.columns === undefined) return [];
    const out: {
      key: string;
      x1: number;
      x2: number;
      y: number;
      y2: number;
      selected: boolean;
      hasNote: boolean;
    }[] = [];
    g.columns.forEach((col, i) => {
      const prev = i > 0 ? g.columns![i - 1] : undefined;
      const cb = box.columns![i];
      const pb = i > 0 ? box.columns![i - 1] : undefined;
      if (col.kind !== 'scene' || prev?.kind !== 'scene' || cb === undefined || pb === undefined)
        return;
      const key = `${g.key}:${col.scene?.id ?? col.key}`;
      out.push({
        key,
        x1: cb.x + 24,
        x2: cb.x + 24,
        y: box.y + pb.y + pb.h + (prev.note?.trim() ? MAP_NOTE_H : 0),
        y2: box.y + cb.y - 8,
        selected: selectedSceneLinkKey === key,
        hasNote: (col.leadIn?.trim().length ?? 0) > 0,
      });
    });
    return out;
  });

  return (
    <div data-testid="evidence-map-view" className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {sourceGroups.map((g) => (
        <div key={`proposal:${g.key}`} className="max-h-72 shrink-0 overflow-auto">
          {renderGhost?.(g.key)}
        </div>
      ))}
      <div
        ref={scrollRef}
        data-map-viewport
        className="min-h-0 min-w-0 flex-1 overflow-auto p-4"
        style={{
          backgroundImage: 'radial-gradient(var(--sp-border) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
        onScroll={(e) => {
          try {
            localStorage.setItem(
              `ssampin:map-scroll-v2:${scopeKey}`,
              JSON.stringify({ left: e.currentTarget.scrollLeft, top: e.currentTarget.scrollTop }),
            );
          } catch {
            /* 기기별 위치 설정만 생략한다. */
          }
        }}
        onPointerDown={(e) => {
          if (
            e.button !== 0 ||
            (e.target as HTMLElement).closest('button,input,textarea,[data-map-node]')
          )
            return;
          pan.current = {
            x: e.clientX,
            y: e.clientY,
            left: e.currentTarget.scrollLeft,
            top: e.currentTarget.scrollTop,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (pan.current) {
            e.currentTarget.scrollLeft = pan.current.left - e.clientX + pan.current.x;
            e.currentTarget.scrollTop = pan.current.top - e.clientY + pan.current.y;
          }
        }}
        onPointerUp={() => {
          pan.current = null;
        }}
        onPointerCancel={() => {
          pan.current = null;
        }}
      >
        <div
          style={{ width: layout.width * zoom, height: (layout.height + 120) * zoom }}
          className="relative"
        >
          <div
            style={{
              width: layout.width,
              height: layout.height + 120,
              transform: `scale(${zoom})`,
              transformOrigin: '0 0',
            }}
            className="relative"
          >
            <div
              data-map-student
              data-sp-floating
              className="absolute rounded-xl bg-sp-card p-3 text-sm shadow-sm ring-1 ring-sp-border"
              style={{ left: 24, top: (layout.groups[0]?.topicY ?? 0) + 24, width: 144 }}
            >
              <p className="font-semibold text-sp-text">{studentName}</p>
              <p className="mt-1 text-xs text-sp-muted">
                주제 {sourceGroups.filter((g) => g.thread).length}개
              </p>
            </div>
            {layout.groups.map((box, i) => {
              const g = groups[i];
              if (g === undefined) return null;
              return (
                <MapGroup
                  key={g.key}
                  group={{
                    ...g,
                    items: sourceGroups[i]?.items ?? g.items,
                    ...(g.columns
                      ? {
                          columns: g.columns.map((c) => ({
                            ...c,
                            items:
                              sourceGroups[i]?.columns?.find((original) => original.key === c.key)
                                ?.items ?? c.items,
                          })),
                        }
                      : {}),
                  }}
                  box={box}
                  selectedSceneKey={selectedSceneKey}
                  selectedSceneLinkKey={selectedSceneLinkKey}
                  threadPressed={g.thread !== undefined && selectedThreadId === g.thread.id}
                  onOpenThread={onOpenThread}
                  {...(onMoveGroup === undefined ? {} : { onMoveGroup })}
                  {...(onToggleGroupCollapsed === undefined
                    ? {}
                    : { onToggleCollapsed: onToggleGroupCollapsed })}
                  {...(onSelectThread === undefined ? {} : { onSelectThread })}
                  {...(onSelectScene === undefined ? {} : { onSelectScene })}
                  {...(onSelectSceneLink === undefined ? {} : { onSelectSceneLink })}
                  {...(onLayScaffold === undefined ? {} : { onLayScaffold })}
                  {...(onAddScene === undefined ? {} : { onAddScene })}
                >
                  {box.nodes.map((n) => {
                    const ev = evidenceById.get(n.id);
                    if (ev === undefined) return null;
                    return (
                      <div key={ev.id}>
                        <EvidenceMapNode
                          key={ev.id}
                          evidence={ev}
                          locked={g.closed === true}
                          selected={selectedIds.includes(ev.id)}
                          focused={focusedId === ev.id}
                          mirror={isMirror(ev.id)}
                          differsFromSource={differsFromSource(ev)}
                          style={{ left: n.x, top: n.y - box.y, width: n.w, height: n.h }}
                          onSelect={() => onSelectNode(ev.id)}
                          {...(onToggleNodeSelected
                            ? { onToggleSelected: () => onToggleNodeSelected(ev.id) }
                            : {})}
                        />
                        {ev.note?.trim() && (
                          <button
                            type="button"
                            data-map-note
                            title={ev.note}
                            onClick={() => onSelectNode(ev.id)}
                            style={{ left: n.x, top: n.y - box.y + n.h + 12, width: n.w }}
                            data-sp-floating
                            className="absolute rounded-lg border border-sp-highlight/30 bg-sp-card px-3 py-2 text-left text-sm text-sp-text shadow-sm"
                          >
                            <span className="block text-xs text-sp-highlight">근거 메모</span>
                            <span className="line-clamp-2">{ev.note}</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {box.columns?.map((cb, j) => {
                    const original = sourceGroups[i]?.columns?.find((c) => c.key === cb.key);
                    const shown = g.columns?.[j]?.items.length ?? 0;
                    const hidden = (original?.items.length ?? 0) - shown;
                    const unfold = (): void => {
                      setExpandedBranches((prev) => [...new Set([...prev, cb.key])]);
                      setFoldedBranches((prev) => prev.filter((key) => key !== cb.key));
                      setOverview(false);
                    };
                    return (
                      <div key={`branch-control:${cb.key}`}>
                        {(original?.items.length ?? 0) > 0 && (
                          <button
                            type="button"
                            aria-label={`${original?.slot} 근거 ${shown > 0 ? '접기' : '펼치기'}`}
                            aria-expanded={shown > 0}
                            style={{ left: cb.x + cb.w + 4, top: cb.y + 8 }}
                            data-sp-floating
                            className="absolute rounded bg-sp-card px-1 text-sm text-sp-muted"
                            onClick={() =>
                              shown > 0 ? setFoldedBranches((prev) => [...prev, cb.key]) : unfold()
                            }
                          >
                            {shown > 0 ? '−' : '+'}
                          </button>
                        )}
                        {hidden > 0 && (
                          <button
                            type="button"
                            style={{ left: cb.x + cb.w + 48, top: cb.y + cb.branchHeight + 8 }}
                            data-sp-floating
                            className="absolute rounded-lg bg-sp-card px-3 py-1 text-sm text-sp-muted ring-1 ring-sp-border"
                            onClick={unfold}
                          >
                            근거 {hidden}건 더 보기
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {overview &&
                    g.columns === undefined &&
                    g.items.length === 0 &&
                    (sourceGroups[i]?.items.length ?? 0) > 0 && (
                      <button
                        type="button"
                        data-sp-floating
                        className="absolute rounded-lg bg-sp-card px-3 py-2 text-sm text-sp-muted ring-1 ring-sp-border"
                        style={{ left: MAP_TOPIC_X + MAP_TOPIC_W + 48, top: box.topicY }}
                        onClick={() => setOverview(false)}
                      >
                        근거 {sourceGroups[i]?.items.length}건 펼치기
                      </button>
                    )}
                </MapGroup>
              );
            })}

            {/* 화살표 : 장면 사이(열 머리 둘째 줄)와 주제 사이(묶음 왼쪽). 지도 전체 좌표에 한 겹으로 그린다. 클릭은 통과한다. */}
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 overflow-visible"
              width={layout.width}
              height={layout.height + 120}
            >
              <defs>
                <marker
                  id={`${markerId}-arrow`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                </marker>
              </defs>
              {layout.groups.map((box) => (
                <g key={`branches:${box.key}`}>
                  <path
                    data-map-branch="student-topic"
                    d={`M 168 ${(layout.groups[0]?.topicY ?? 0) + 64} C 192 ${(layout.groups[0]?.topicY ?? 0) + 64}, 192 ${box.y + box.topicY + 40}, ${MAP_TOPIC_X} ${box.y + box.topicY + 40}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    className="text-sp-muted"
                  />
                  {box.columns?.map((c) => (
                    <path
                      key={c.key}
                      data-map-branch="topic-scene"
                      d={`M ${MAP_TOPIC_X + MAP_TOPIC_W} ${box.y + box.topicY + 40} C ${MAP_TOPIC_X + MAP_TOPIC_W + 24} ${box.y + box.topicY + 40}, ${c.x - 24} ${box.y + c.y + 44}, ${c.x} ${box.y + c.y + 44}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.25"
                      className="text-sp-muted"
                    />
                  ))}
                  {(onConnectionChange && box.columns ? [] : box.nodes).map((n) => {
                    const c = box.columns?.[n.layer];
                    const x = c ? c.x + c.w : MAP_TOPIC_X + MAP_TOPIC_W;
                    const y = box.y + (c ? c.y + 44 : box.topicY + 40);
                    return (
                      <path
                        key={n.id}
                        data-map-branch="evidence"
                        d={`M ${x} ${y} C ${x + 24} ${y}, ${n.x - 24} ${n.y + n.h / 2}, ${n.x} ${n.y + n.h / 2}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.25"
                        className="text-sp-muted"
                      />
                    );
                  })}
                </g>
              ))}
              {/* 장면 사이 : 위로 살짝 부푼 곡선(오너 요청 2026-09-11: 직선보다 흐름이 읽힌다). */}
              {sceneArrows.map((a) => (
                <path
                  key={`sa:${a.key}`}
                  d={`M ${a.x1} ${a.y} L ${a.x2} ${a.y2}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  markerEnd={`url(#${markerId}-arrow)`}
                  className={
                    a.selected ? 'text-sp-accent' : a.hasNote ? 'text-sp-text' : 'text-sp-muted'
                  }
                />
              ))}
              {threadLinks.map(({ group, from, to }) => {
                const x = MAP_TOPIC_X + 24;
                const selected = selectedThreadLinkId === group.thread!.id;
                return (
                  <path
                    key={`tl:${group.key}`}
                    // 주제 사이 : 왼쪽으로 살짝 부푼 곡선. 앞 묶음 아래에서 나와 뒤 묶음 위로 들어간다.
                    d={`M ${x} ${from.y + from.topicY + MAP_GROUP_HEAD} C ${x - 24} ${from.y + from.h}, ${x - 24} ${to.y}, ${x} ${to.y + to.topicY}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={selected ? 2.5 : 2}
                    markerEnd={`url(#${markerId}-arrow)`}
                    className={selected ? 'text-sp-accent' : 'text-sp-muted'}
                  />
                );
              })}
            </svg>
            {onConnectionChange && (
              <EvidenceMapConnections
                key={scopeKey}
                groups={sourceGroups}
                layout={layout}
                onChange={onConnectionChange}
                {...(onConnectionEditingChange
                  ? { onEditingChange: onConnectionEditingChange }
                  : {})}
              />
            )}

            {/* 주제 이음말 라벨 : 앞 묶음과 뒤 묶음 사이. */}
            {threadLinks.map(({ group, to }) => {
              const note = group.linkFrom!.note?.trim() ?? '';
              const selected = selectedThreadLinkId === group.thread!.id;
              return (
                <button
                  key={`tll:${group.key}`}
                  type="button"
                  data-map-thread-link={group.thread!.id}
                  data-sp-floating
                  aria-pressed={selected}
                  aria-label={`${group.linkFrom!.title}에서 ${group.title}로 이어진 주제${
                    note.length > 0 ? `, 이음말 ${note}` : ', 이음말 없음'
                  }`}
                  title={note.length > 0 ? `이음: ${note}` : '이음말을 적으려면 누르세요'}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSelectThreadLink?.(group.thread!.id);
                  }}
                  style={{ left: MAP_TOPIC_X + 40, top: to.y - MAP_LINK_GAP / 2 }}
                  className={`absolute z-10 flex -translate-y-1/2 items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sp-accent ${
                    selected
                      ? 'bg-blue-500/10 text-sp-accent ring-sp-accent'
                      : 'bg-sp-card text-sp-text ring-sp-border hover:ring-sp-accent'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-sm text-sp-muted"
                  >
                    subdirectory_arrow_right
                  </span>
                  <span className="max-w-[240px] truncate">
                    {note.length > 0 ? note : `${group.linkFrom!.title}에서 이어짐`}
                  </span>
                </button>
              );
            })}

            {newThreadZone !== undefined && (
              <div
                style={{ top: layout.height + 16, left: MAP_TOPIC_X }}
                data-sp-floating
                className="absolute w-48"
              >
                {newThreadZone}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 지도 조작 : 아래 오른쪽 고정. 아이콘마다 한국어 이름·툴팁. [카드 위치 정돈]은 손으로 옮긴 카드가 있을 때만 나타난다. */}
      <div
        role="toolbar"
        aria-label="지도 조작"
        data-sp-floating
        className="absolute bottom-3 right-3 z-10 flex items-center gap-0.5 rounded-xl bg-sp-card p-1 shadow-lg ring-1 ring-sp-border"
      >
        <button
          type="button"
          onClick={fit}
          aria-label="전체 구조"
          aria-pressed={overview}
          title="근거 가지를 접어 전체 구조를 봅니다"
          className="rounded-lg p-1.5 text-sp-muted hover:bg-sp-surface hover:text-sp-text"
        >
          <span className="px-1 text-xs">{overview ? '근거 펼치기' : '전체 구조'}</span>
        </button>
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={zoom <= ZOOM_MIN}
          aria-label="축소"
          title="축소"
          className="rounded-lg p-1.5 text-sp-muted hover:bg-sp-surface hover:text-sp-text disabled:opacity-40"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-base">
            remove
          </span>
        </button>
        <span
          className="min-w-10 text-center text-xs tabular-nums text-sp-muted"
          aria-live="polite"
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={zoom >= ZOOM_MAX}
          aria-label="확대"
          title="확대"
          className="rounded-lg p-1.5 text-sp-muted hover:bg-sp-surface hover:text-sp-text disabled:opacity-40"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-base">
            add
          </span>
        </button>
        {hasCustomPositions && (
          <>
            <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-sp-border" />
            <button
              type="button"
              onClick={onResetPositions}
              aria-label="카드 위치 정돈"
              title="손으로 옮긴 카드를 자동 배치로 되돌립니다 (내용은 바뀌지 않습니다)"
              className="flex items-center gap-1 rounded-lg px-1.5 py-1.5 text-xs text-sp-muted hover:bg-sp-surface hover:text-sp-text"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-base">
                restart_alt
              </span>
              정돈
            </button>
          </>
        )}
        {onToggleExpanded !== undefined && (
          <>
            <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-sp-border" />
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-pressed={expanded}
              aria-label={expanded ? '원래 크기로' : '넓게 보기'}
              title={expanded ? '원래 크기로' : '근거 정리만 화면 가득 펼칩니다'}
              className="rounded-lg p-1.5 text-sp-muted hover:bg-sp-surface hover:text-sp-text"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-base">
                {expanded ? 'close_fullscreen' : 'open_in_full'}
              </span>
            </button>
          </>
        )}
      </div>

      {totalEvidence === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-sp-muted">
          아직 근거가 없습니다. 위쪽 [+ 근거]로 넣거나 관찰 기록을 남기면 여기에 모입니다.
        </p>
      )}
    </div>
  );
}
