import { useMemo, useState } from 'react';
import { useToastStore } from '@adapters/components/common/Toast';
import {
  STICKER_PROMPT_TEMPLATES,
  PROMPT_THEMES,
  type PromptTemplate,
  type PromptTheme,
} from '@adapters/constants/stickerPromptTemplates';

/**
 * 이모티콘 제작 가이드 — 절차형 단일 흐름.
 *
 * Step 1) 생성형 AI로 이미지 만들기 (도구 + 프롬프트)
 * Step 2) 배경 지우기 (PNG로 투명 배경 만들기)
 * Step 3) 쌤핀에 등록하기
 *
 * - 모델명/버전 표기 없음 (도구 이름만)
 * - 외부 링크는 Electron shell.openExternal
 */

function openExternal(url: string): void {
  const api = window.electronAPI;
  if (api?.openExternal) {
    void api.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function StickerGuidePanel(): JSX.Element {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* 인트로 */}
      <header className="mb-10">
        <p className="text-detail font-sp-semibold uppercase tracking-wider text-sp-accent mb-2">
          이모티콘 만들기 가이드
        </p>
        <h1 className="text-2xl xl:text-3xl font-sp-bold text-sp-text leading-tight">
          나만의 이모티콘, 3단계로 끝!
        </h1>
        <p className="text-sp-muted mt-2 leading-relaxed">
          생성형 AI로 그리고, 배경을 지우고, 쌤핀에 등록하면 끝이에요. 천천히 한 단계씩 따라 해봐요.
        </p>
      </header>

      {/* Step 1 — AI로 그리기 */}
      <Step number={1} title="생성형 AI로 이미지 만들기" connector>
        <StepAIContent />
      </Step>

      {/* Step 2 — 배경 지우기 */}
      <Step number={2} title="이미지 배경 지우기" connector>
        <StepBackgroundRemovalContent />
      </Step>

      {/* Step 3 — 쌤핀 등록 */}
      <Step number={3} title="쌤핀에 등록하기">
        <p className="text-sp-text leading-relaxed mb-4">
          배경이 지워진 PNG 파일이 준비됐다면 이제 쌤핀에 등록해요.
        </p>

        <p className="text-sp-muted leading-relaxed mb-3">
          상단 <Kbd>+ 이모티콘 추가</Kbd> 버튼을 누르면 두 가지 방식 중 골라서 등록할 수 있어요.
        </p>

        <div className="space-y-3">
          <ActionRow
            badge="A"
            highlight
            title="개별 파일로 등록"
            description={
              <>
                낱장 PNG 파일을 한 장 또는 여러 장 한꺼번에 골라서 등록해요. 모달에 그대로 드래그해서 떨어뜨려도 되고, 이름은 prefix로 자동 매겨진 뒤 카드의 ✏️로 개별 수정할 수 있어요.
              </>
            }
          />
          <ActionRow
            badge="B"
            title="시트 분할로 한 번에"
            description={
              <>
                AI가 4×4 격자로 16개를 한 장에 그려줬다면, 시트 한 장을 자동으로 잘라서 한꺼번에 등록할 수 있어요. 빈 칸이나 이미 등록된 이미지는 자동으로 건너뛰어요.
              </>
            }
          />
        </div>

        <Tip>
          이모티콘마다 <strong className="text-sp-text">이름</strong>과 <strong className="text-sp-text">태그</strong>를 달아두면 나중에 검색이 정말 편해요. 예: 이름 "화이팅", 태그 "응원, 힘내".
        </Tip>
      </Step>

      <GuideFooter />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Step 컨테이너 (번호 배지 + 좌측 connector)
// ────────────────────────────────────────────────────────────

function Step({
  number,
  title,
  connector = false,
  children,
}: {
  number: number;
  title: string;
  connector?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="relative pl-14 md:pl-16 pb-12">
      {/* 번호 배지 */}
      <div
        aria-hidden="true"
        className="absolute left-0 top-0 w-10 h-10 md:w-12 md:h-12 rounded-full bg-sp-accent text-sp-accent-fg font-sp-bold text-base md:text-lg flex items-center justify-center shadow-sp-sm ring-4 ring-sp-bg"
      >
        {number}
      </div>

      {/* 좌측 connector 라인 */}
      {connector && (
        <div
          aria-hidden="true"
          className="absolute left-5 md:left-6 top-12 md:top-14 bottom-0 w-px bg-gradient-to-b from-sp-border via-sp-border to-transparent"
        />
      )}

      <h2 className="text-xl md:text-2xl font-sp-bold text-sp-text mb-4 leading-tight">{title}</h2>
      {children}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Step 1 — 생성형 AI
// ────────────────────────────────────────────────────────────

interface AITool {
  name: string;
  emoji: string;
  url: string;
}

const AI_TOOLS: readonly AITool[] = [
  { name: 'ChatGPT', emoji: '💬', url: 'https://chatgpt.com' },
  { name: '나노바나나', emoji: '🍌', url: 'https://pf.kakao.com/_qpJxlxj' },
  { name: 'Microsoft Designer', emoji: '🎨', url: 'https://designer.microsoft.com' },
  { name: '뤼튼', emoji: '✨', url: 'https://wrtn.ai' },
  { name: 'Canva', emoji: '🖼️', url: 'https://canva.com' },
];

function StepAIContent(): JSX.Element {
  return (
    <>
      <p className="text-sp-text leading-relaxed mb-5">
        아래 도구 중 하나를 열어 <strong>프롬프트</strong>를 붙여넣으면 이모티콘 이미지가 만들어져요.
        같은 캐릭터로 여러 표정을 한 번에 받고 싶다면 <strong>4×4 시트 프롬프트</strong>를 추천해요.
      </p>

      {/* 이미지 생성 지원 도구 */}
      <div className="mb-7">
        <h3 className="text-sm font-sp-semibold text-sp-text mb-3 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-icon-md text-sp-muted">apps</span>
          이미지 생성을 지원하는 도구
        </h3>
        <div className="flex flex-wrap gap-2">
          {AI_TOOLS.map((tool) => (
            <ToolPill key={tool.name} tool={tool} />
          ))}
        </div>
      </div>

      {/* 프롬프트 라이브러리 */}
      <PromptLibrary />

      {/* 사용 순서 */}
      <div className="mt-6 rounded-xl bg-sp-bg/40 ring-1 ring-sp-border p-4">
        <h3 className="text-sm font-sp-semibold text-sp-text mb-2 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-icon-md text-sp-accent">route</span>
          이렇게 진행하세요
        </h3>
        <ol className="space-y-1.5 text-sm text-sp-text leading-relaxed list-decimal list-inside marker:text-sp-muted">
          <li>위 도구 중 하나를 열어요</li>
          <li>마음에 드는 프롬프트를 복사해서 붙여넣어요</li>
          <li>생성된 이미지를 <strong>PNG</strong>로 다운로드해요</li>
          <li>다음 단계에서 배경을 지운 뒤 쌤핀에 등록해요</li>
        </ol>
      </div>
    </>
  );
}

function ToolPill({ tool }: { tool: AITool }): JSX.Element {
  return (
    <a
      href={tool.url}
      onClick={(e) => {
        e.preventDefault();
        openExternal(tool.url);
      }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sp-card ring-1 ring-sp-border text-detail font-sp-medium text-sp-text hover:ring-sp-accent/40 hover:text-sp-accent transition-all"
    >
      <span aria-hidden="true">{tool.emoji}</span>
      {tool.name}
      <span className="material-symbols-outlined text-icon-sm">open_in_new</span>
    </a>
  );
}

// ────────────────────────────────────────────────────────────
// 프롬프트 라이브러리 (5종 카드 + 테마 필터)
// ────────────────────────────────────────────────────────────

function PromptLibrary(): JSX.Element {
  const [themeFilter, setThemeFilter] = useState<PromptTheme | 'all'>('all');

  const filtered = useMemo(() => {
    if (themeFilter === 'all') return STICKER_PROMPT_TEMPLATES;
    return STICKER_PROMPT_TEMPLATES.filter((t) => t.theme === themeFilter);
  }, [themeFilter]);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <h3 className="text-sm font-sp-semibold text-sp-text flex items-center gap-1.5">
          <span className="material-symbols-outlined text-icon-md text-sp-muted">content_copy</span>
          추천 프롬프트
        </h3>
        <span className="text-detail text-sp-muted">{filtered.length}개</span>
      </div>

      {/* 테마 칩 */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {PROMPT_THEMES.map((t) => {
          const active = t.id === themeFilter;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setThemeFilter(t.id)}
              className={[
                'px-3 py-1 rounded-md text-detail font-sp-medium transition-all duration-sp-base ease-sp-out',
                active
                  ? 'bg-sp-accent/15 text-sp-accent ring-1 ring-sp-accent/30'
                  : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/5',
              ].join(' ')}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filtered.map((tpl) => (
          <PromptCard key={tpl.id} template={tpl} />
        ))}
      </div>
    </div>
  );
}

function PromptCard({ template }: { template: PromptTemplate }): JSX.Element {
  const [tipOpen, setTipOpen] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(template.prompt);
      useToastStore.getState().show(
        '프롬프트가 복사되었어요! AI 도구에 붙여넣어 보세요 ✨',
        'success',
      );
    } catch {
      useToastStore.getState().show('복사에 실패했어요. 다시 시도해 주세요.', 'error');
    }
  };

  return (
    <div className="rounded-xl bg-sp-card ring-1 ring-sp-border p-4 flex flex-col">
      <div className="flex items-start gap-2 mb-2">
        <div className="text-2xl shrink-0" aria-hidden="true">
          {template.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-sp-semibold text-sp-text leading-snug">{template.title}</h4>
          <p className="text-detail text-sp-muted mt-0.5">
            4×4 시트 · {template.resultCount}개
          </p>
        </div>
      </div>

      <p className="text-detail text-sp-text leading-relaxed mb-3 line-clamp-2">
        {template.description}
      </p>

      <div className="flex flex-wrap gap-1 mb-3">
        {template.tags.map((tag) => (
          <span
            key={tag}
            className="text-caption font-sp-medium text-sp-muted bg-sp-bg/60 px-1.5 py-0.5 rounded"
          >
            #{tag}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-1.5 mt-auto">
        <button
          type="button"
          onClick={handleCopy}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-sp-accent text-sp-accent-fg text-detail font-sp-semibold hover:brightness-110 transition-all active:scale-95"
        >
          <span className="material-symbols-outlined text-icon-sm">content_copy</span>
          복사
        </button>
        {template.tip && (
          <button
            type="button"
            onClick={() => setTipOpen((v) => !v)}
            aria-expanded={tipOpen}
            className={[
              'inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-detail font-sp-semibold ring-1 transition-all',
              tipOpen
                ? 'bg-sp-highlight/20 text-sp-highlight ring-sp-highlight/40'
                : 'text-sp-muted ring-sp-border hover:text-sp-text hover:ring-sp-accent/40',
            ].join(' ')}
          >
            <span aria-hidden="true">💡</span>
            팁
          </button>
        )}
      </div>

      {tipOpen && template.tip && (
        <div className="mt-3 rounded-md bg-sp-highlight/10 ring-1 ring-sp-highlight/30 px-3 py-2 text-detail text-sp-text leading-relaxed">
          {template.tip}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Step 2 — 배경 제거
// ────────────────────────────────────────────────────────────

const BG_REMOVAL_TOOLS: readonly AITool[] = [
  { name: 'remove.bg', emoji: '✂️', url: 'https://www.remove.bg' },
  { name: 'Photoroom', emoji: '🎯', url: 'https://www.photoroom.com' },
  { name: 'PicsArt', emoji: '🌈', url: 'https://picsart.com' },
  { name: 'Canva', emoji: '🖼️', url: 'https://canva.com' },
];

function StepBackgroundRemovalContent(): JSX.Element {
  return (
    <>
      <Callout tone="warning">
        AI가 그려준 이미지는 보통 흰색이나 색깔 배경이 깔려 있어요. 이대로 등록하면 이모티콘이 아니라 그냥 사진처럼 보이니, <strong className="text-sp-text">반드시 배경을 지우고 PNG로 저장</strong>해주세요.
      </Callout>

      <div className="mt-5 mb-6">
        <h3 className="text-sm font-sp-semibold text-sp-text mb-3 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-icon-md text-sp-muted">auto_fix_high</span>
          배경 제거를 지원하는 도구
        </h3>
        <div className="flex flex-wrap gap-2">
          {BG_REMOVAL_TOOLS.map((tool) => (
            <ToolPill key={tool.name} tool={tool} />
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-sp-bg/40 ring-1 ring-sp-border p-4">
        <h3 className="text-sm font-sp-semibold text-sp-text mb-2 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-icon-md text-sp-accent">route</span>
          이렇게 진행하세요
        </h3>
        <ol className="space-y-1.5 text-sm text-sp-text leading-relaxed list-decimal list-inside marker:text-sp-muted">
          <li>위 도구 중 하나에서 1단계에서 만든 이미지를 업로드해요</li>
          <li>배경이 자동으로 제거되면 <strong>PNG</strong>로 다운로드해요 (JPG는 투명 배경이 안 돼요!)</li>
          <li>4×4 시트로 만들었다면 통째로 배경 제거 → 다음 단계의 시트 분할 기능을 활용하세요</li>
        </ol>
      </div>

      <Tip>
        ChatGPT 같은 일부 도구는 처음부터 <strong className="text-sp-text">투명 배경(transparent background)</strong>으로 그려달라고 요청하면 배경 제거 단계를 건너뛸 수도 있어요. 결과가 깔끔하지 않다면 위 도구로 다시 다듬어주세요.
      </Tip>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// 작은 컴포넌트들
// ────────────────────────────────────────────────────────────

function Kbd({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-sp-bg/80 ring-1 ring-sp-border text-detail font-sp-semibold text-sp-text mx-0.5">
      {children}
    </kbd>
  );
}

function Tip({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="mt-4 rounded-xl bg-sp-highlight/10 border-l-4 border-sp-highlight p-4 text-sm text-sp-text leading-relaxed">
      <p className="flex items-start gap-2">
        <span aria-hidden="true" className="text-base shrink-0">
          💡
        </span>
        <span>{children}</span>
      </p>
    </div>
  );
}

function Callout({
  tone,
  children,
}: {
  tone: 'warning' | 'info';
  children: React.ReactNode;
}): JSX.Element {
  const styles = tone === 'warning'
    ? 'bg-sp-highlight/10 border-sp-highlight'
    : 'bg-sp-accent/10 border-sp-accent';
  const icon = tone === 'warning' ? '⚠️' : 'ℹ️';
  return (
    <div className={`rounded-xl border-l-4 ${styles} p-4 text-sm text-sp-text leading-relaxed`}>
      <p className="flex items-start gap-2">
        <span aria-hidden="true" className="text-base shrink-0">
          {icon}
        </span>
        <span>{children}</span>
      </p>
    </div>
  );
}

function ActionRow({
  badge,
  title,
  description,
  highlight,
}: {
  badge: string;
  title: string;
  description: React.ReactNode;
  highlight?: boolean;
}): JSX.Element {
  return (
    <div
      className={[
        'flex items-start gap-4 p-4 rounded-xl ring-1 transition-all',
        highlight
          ? 'bg-sp-accent/8 ring-sp-accent/30'
          : 'bg-sp-card ring-sp-border',
      ].join(' ')}
    >
      <div
        aria-hidden="true"
        className={[
          'shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-sp-bold',
          highlight ? 'bg-sp-accent text-sp-accent-fg' : 'bg-sp-bg text-sp-muted ring-1 ring-sp-border',
        ].join(' ')}
      >
        {badge}
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-sp-semibold text-sp-text mb-1">{title}</h4>
        <p className="text-sm text-sp-muted leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 푸터 (면책 조항)
// ────────────────────────────────────────────────────────────

function GuideFooter(): JSX.Element {
  return (
    <footer className="mt-12 pt-6 border-t border-sp-border">
      <p className="text-detail font-sp-semibold text-sp-muted mb-2 flex items-center gap-1.5">
        <span aria-hidden="true">ℹ️</span>
        안내
      </p>
      <ul className="space-y-1 text-detail text-sp-muted leading-relaxed list-disc list-inside marker:text-sp-muted/50">
        <li>AI로 생성한 이미지의 저작권 및 사용 범위는 각 도구의 약관을 따릅니다.</li>
        <li>
          카카오톡 이모티콘 스토어 판매를 원하시면 카카오 이모티콘 스튜디오의 심사 기준과 라이선스를 별도로 확인해주세요.
        </li>
        <li>본 가이드는 교사의 개인적 사용을 전제로 합니다.</li>
      </ul>
    </footer>
  );
}
