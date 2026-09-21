/**
 * ParticipationClassroom — 퀴즈·설문·토론의 **활동 목록**이자 이 도구의 진입점.
 *
 * 처음 쓰는 선생님에게는 안내가 필요하지만, 두 번째부터는 **내 활동이 첫 화면에** 와야 한다.
 * 그래서 큰 소개 영역은 활동이 하나도 없을 때만 보여 주고, 있으면 목록을 바로 올린다.
 *
 * 삭제는 [⋯ 더보기] 안에 둔다 — 목록에서 [열기] 옆에 붙어 있으면 잘못 누르기 쉽다.
 */

import { useState, type ReactNode } from 'react';
import { useMultiSurveyV2Store } from '@adapters/stores/useMultiSurveyV2Store';
import { ParticipationEditor, participationButton } from './ParticipationEditor';
import { LiveConsoleContainer } from './v2/Console/LiveConsoleContainer';
import { ParticipationResults } from './ParticipationResults';
import { ToolPoll } from '../Tools/ToolPoll';
import { ToolSurvey } from '../Tools/ToolSurvey';
import { ToolWordCloud } from '../Tools/ToolWordCloud';
import { ToolValueLine } from '../Tools/Discussion/ToolValueLine';
import { ToolTrafficLightDiscussion } from '../Tools/Discussion/ToolTrafficLightDiscussion';
import { PARTICIPATION_TOOL_NAME } from '@adapters/multiSurvey/participationBranding';
import { participationReadiness } from '@domain/rules/participationReadiness';

const primaryButton = `${participationButton} bg-sp-accent font-bold text-sp-accent-fg hover:border-sp-accent`;

/** "3분 전"처럼 읽기 쉬운 시각 */
function agoLabel(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return new Date(then).toLocaleDateString('ko-KR');
}

export function ParticipationClassroom({
  onBack,
  isFullscreen,
  renderLegacy,
}: {
  onBack: () => void;
  isFullscreen: boolean;
  renderLegacy: (back: () => void) => ReactNode;
}) {
  const sessions = useMultiSurveyV2Store((s) => s.sessions);
  const results = useMultiSurveyV2Store((s) => s.participationResults);
  const live = useMultiSurveyV2Store((s) => s.liveSession);
  const [editing, setEditing] = useState<string | null>(null);
  const [legacy, setLegacy] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (live)
    return <LiveConsoleContainer onExit={() => useMultiSurveyV2Store.getState().exitLive()} />;
  const back = () => setLegacy(null);
  if (legacy === 'multi') return <>{renderLegacy(back)}</>;
  if (legacy === 'poll') return <ToolPoll onBack={back} isFullscreen={isFullscreen} />;
  if (legacy === 'survey') return <ToolSurvey onBack={back} isFullscreen={isFullscreen} />;
  if (legacy === 'wordcloud') return <ToolWordCloud onBack={back} isFullscreen={isFullscreen} />;
  if (legacy === 'valueline') return <ToolValueLine onBack={back} isFullscreen={isFullscreen} />;
  if (legacy === 'traffic')
    return <ToolTrafficLightDiscussion onBack={back} isFullscreen={isFullscreen} />;

  const current = sessions.find((s) => s.id === editing);
  if (current?.purpose)
    return (
      <ParticipationEditor key={current.id} session={current} onBack={() => setEditing(null)} />
    );

  const result = results.find((r) => r.id === resultId);
  if (result)
    return (
      <div className="h-full overflow-auto bg-sp-bg p-6 text-sp-text">
        <button className={participationButton} onClick={() => setResultId(null)}>
          목록으로
        </button>
        <h1 className="my-5 text-2xl font-bold">{result.survey.title} · 활동 결과</h1>
        <ParticipationResults survey={result.survey} live={result.live} />
      </div>
    );

  const create = () => {
    try {
      const session = useMultiSurveyV2Store
        .getState()
        .createSession({ title: '새 활동', purpose: 'activity' });
      setEditing(session.id);
    } catch {
      setError('활동을 저장하지 못했어요. 저장 공간을 확인하고 다시 시도해 주세요.');
    }
  };

  const activities = sessions.filter((s) => s.purpose);
  // 가장 최근에 고친 활동이 맨 위 — 이어서 하기 쉽게
  const ordered = [...activities].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const resume = ordered[0];
  const rest = ordered.slice(1);
  const empty = activities.length === 0;

  const duplicate = (id: string) => {
    const source = sessions.find((s) => s.id === id);
    if (!source) return;
    try {
      const store = useMultiSurveyV2Store.getState();
      const copy = store.createSession({ title: `${source.title} 사본`, purpose: 'activity' });
      store.updateSession(copy.id, {
        questions: source.questions.map((q) => ({ ...q, id: crypto.randomUUID() })),
        competitionMode: source.competitionMode,
      });
      setMenuId(null);
      setEditing(copy.id);
    } catch {
      setError('활동을 복제하지 못했어요. 다시 시도해 주세요.');
    }
  };

  return (
    <div className="h-full overflow-auto bg-sp-bg p-6 text-sp-text">
      <div className="mx-auto max-w-4xl">
        <button className={participationButton} onClick={onBack}>
          쌤도구로
        </button>

        <header className="flex flex-wrap items-end justify-between gap-3 py-5">
          <div>
            <h1 className="text-xl font-bold">{PARTICIPATION_TOOL_NAME}</h1>
            <p className="mt-1 text-sm text-sp-muted">
              문항을 자유롭게 섞고, 하나의 링크로 함께 참여해요.
            </p>
          </div>
          <button onClick={create} className={primaryButton}>
            + 새 활동 만들기
          </button>
        </header>

        {error && (
          <p role="alert" className="mb-4 text-sp-highlight">
            {error}
          </p>
        )}

        {/* 큰 소개는 첫 사용 안내로만 쓴다 — 활동이 생기면 목록이 첫 화면을 차지한다. */}
        {empty && (
          <section className="rounded-3xl border-2 border-dashed border-sp-border p-8">
            <h2 className="text-2xl font-bold">첫 활동을 만들어 볼까요?</h2>
            <p className="mt-3 text-sp-muted">
              퀴즈·토론·설문 문항을 한 활동에 섞을 수 있어요. 문항 유형을 고를 때 학생 화면을 직접
              체험해 보고 추가하세요.
            </p>
            <ol className="mt-4 space-y-1 text-sm text-sp-muted">
              <li>1. [새 활동 만들기]를 누르고 문항을 더해요.</li>
              <li>2. [학생 초대하기]로 링크·코드를 띄우고 학생이 들어오면 시작해요.</li>
              <li>3. 응답을 마감하고, 결과와 정답을 원하는 때에 공개해요.</li>
            </ol>
            <button onClick={create} className={`${primaryButton} mt-5`}>
              + 새 활동 만들기
            </button>
          </section>
        )}

        {resume && (
          <section className="mt-2">
            <h2 className="mb-2 text-sm font-bold">이어서 하기</h2>
            <ActivityRow
              title={resume.title}
              count={resume.questions.length}
              updatedAt={resume.updatedAt}
              incomplete={participationReadiness(resume).length > 0}
              highlighted
              onOpen={() => setEditing(resume.id)}
              onMenu={() => setMenuId(menuId === resume.id ? null : resume.id)}
              menuOpen={menuId === resume.id}
              onDuplicate={() => duplicate(resume.id)}
              onDelete={() => {
                setMenuId(null);
                setDeleteId(resume.id);
              }}
            />
          </section>
        )}

        {rest.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-bold">내 활동 {rest.length}개</h2>
            <div className="space-y-2">
              {rest.map((s) => (
                <ActivityRow
                  key={s.id}
                  title={s.title}
                  count={s.questions.length}
                  updatedAt={s.updatedAt}
                  incomplete={participationReadiness(s).length > 0}
                  onOpen={() => setEditing(s.id)}
                  onMenu={() => setMenuId(menuId === s.id ? null : s.id)}
                  menuOpen={menuId === s.id}
                  onDuplicate={() => duplicate(s.id)}
                  onDelete={() => {
                    setMenuId(null);
                    setDeleteId(s.id);
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {deleteId && (
          <div
            role="alertdialog"
            aria-label="활동 삭제 확인"
            className="my-4 flex flex-wrap items-center gap-3 rounded-xl border border-sp-border p-4"
          >
            <p className="flex-1">활동을 삭제할까요? 이전 실행 결과는 남겨 둡니다.</p>
            <button
              className={participationButton}
              onClick={() => {
                try {
                  useMultiSurveyV2Store.getState().deleteSession(deleteId);
                  setDeleteId(null);
                } catch {
                  setError('삭제하지 못했어요. 다시 시도해 주세요.');
                }
              }}
            >
              삭제 확인
            </button>
            <button className={primaryButton} onClick={() => setDeleteId(null)}>
              취소
            </button>
          </div>
        )}

        {results.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-2 text-sm font-bold">지난 활동 결과</h2>
            <div className="space-y-2">
              {[...results].reverse().map((r) => (
                <button
                  key={r.id}
                  className={`${participationButton} flex w-full items-center justify-between gap-3 bg-sp-card text-left`}
                  onClick={() => setResultId(r.id)}
                >
                  <span className="min-w-0 truncate">{r.survey.title}</span>
                  <span className="shrink-0 text-sm text-sp-muted">
                    {new Date(r.live.startedAt).toLocaleString('ko-KR')} · {r.live.students.length}
                    명
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <details className="mt-10 border-t border-sp-border py-5">
          <summary className="cursor-pointer text-sp-muted">이전 도구와 저장 자료 열기</summary>
          <p className="my-3 text-sm text-sp-muted">
            이전에 만든 설문과 논제는 그대로 사용할 수 있어요.
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              ['multi', '복합 설문·퀴즈'],
              ['poll', '객관식 설문'],
              ['survey', '주관식 설문'],
              ['wordcloud', '워드클라우드'],
              ['valueline', '가치수직선 토론'],
              ['traffic', '신호등 토론'],
            ].map(([id, label]) => (
              <button key={id} className={participationButton} onClick={() => setLegacy(id!)}>
                {label}
              </button>
            ))}
          </div>
        </details>
      </div>

      {/* 더보기 메뉴가 열린 채로 다른 곳을 누르면 닫는다 */}
      {menuId && (
        <button
          aria-hidden="true"
          tabIndex={-1}
          className="fixed inset-0 cursor-default"
          onClick={() => setMenuId(null)}
        />
      )}
    </div>
  );
}

function ActivityRow({
  title,
  count,
  updatedAt,
  incomplete,
  highlighted = false,
  onOpen,
  onMenu,
  menuOpen,
  onDuplicate,
  onDelete,
}: {
  title: string;
  count: number;
  updatedAt: string;
  incomplete: boolean;
  highlighted?: boolean;
  onOpen: () => void;
  onMenu: () => void;
  menuOpen: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <article
      className={`relative flex items-center gap-3 rounded-xl bg-sp-card p-3 ${
        highlighted ? 'border-2 border-sp-accent' : 'border border-sp-border'
      }`}
    >
      <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <h3 className="truncate font-bold">{title}</h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-sp-muted">
          <span>{count}문항</span>
          <span aria-hidden="true">·</span>
          <span>{agoLabel(updatedAt)} 수정</span>
          {incomplete && (
            <span className="rounded-full border border-sp-highlight px-2 text-xs text-sp-highlight">
              ! 아직 실행할 수 없어요
            </span>
          )}
        </p>
      </button>
      <button className={participationButton} onClick={onOpen}>
        열기
      </button>
      <button
        className={participationButton}
        aria-label={`${title} 더보기`}
        aria-expanded={menuOpen}
        onClick={onMenu}
      >
        ⋯
      </button>
      {menuOpen && (
        // 유리 모드에서 카드 안 배경이 지워지지 않게 떠 있는 면임을 표시한다(회귀 #64).
        <div
          data-sp-floating
          className="absolute right-3 top-full z-10 mt-1 w-40 rounded-xl border border-sp-border bg-sp-card p-1 shadow-sp-md"
        >
          <button
            className="block min-h-11 w-full rounded-lg px-3 text-left hover:bg-sp-surface"
            onClick={onDuplicate}
          >
            복제하기
          </button>
          <button
            className="block min-h-11 w-full rounded-lg px-3 text-left text-sp-muted hover:bg-sp-surface"
            onClick={onDelete}
          >
            삭제하기
          </button>
        </div>
      )}
    </article>
  );
}
