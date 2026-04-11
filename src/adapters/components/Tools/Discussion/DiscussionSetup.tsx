import { useState, useCallback } from 'react';
import { TemplateSaveModal, TemplateLoadDropdown } from '../TemplateManager';
import { useToolTemplateStore } from '@adapters/stores/useToolTemplateStore';
import type { ToolTemplate } from '@domain/entities/ToolTemplate';

interface DiscussionSetupProps {
  toolType: 'valueline' | 'trafficlight';
  onStart: (topics: string[]) => void;
  onShowPastResults?: () => void;
}

const EXAMPLE_TOPICS_TRAFFIC = [
  '교복 자율화에 찬성한다',
  '인공지능이 교사를 대체할 수 있다',
  '사형제도를 폐지해야 한다',
  '동물실험은 필요하다',
  '기본소득제를 도입해야 한다',
];

const EXAMPLE_TOPICS_VALUE = [
  '환경 보호 vs 경제 성장, 무엇이 더 중요한가?',
  '개인의 자유 vs 사회 안전, 어디에 더 무게를 둘 것인가?',
  '결과 중심 vs 과정 중심, 평가는 어떻게 해야 하는가?',
  '전통 보존 vs 혁신 추구, 균형점은 어디인가?',
  '온라인 수업 vs 대면 수업, 미래 교육의 방향은?',
];

export function DiscussionSetup({ toolType, onStart, onShowPastResults }: DiscussionSetupProps) {
  const [topics, setTopics] = useState<string[]>(['']);

  const isTrafficLight = toolType === 'trafficlight';
  const title = isTrafficLight ? '신호등 토론' : '가치수직선 토론';
  const icon = isTrafficLight ? 'traffic' : 'straighten';
  const description = isTrafficLight
    ? '학생들이 논제에 대해 찬성(초록), 보류(노랑), 반대(빨강) 중 하나를 선택하여 입장을 표현합니다.'
    : '학생들이 논제에 대해 반대~찬성 사이 자신의 입장 위치를 수직선 위에 표시합니다.';
  const examples = isTrafficLight ? EXAMPLE_TOPICS_TRAFFIC : EXAMPLE_TOPICS_VALUE;
  const canStart = topics.some((t) => t.trim().length > 0);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const { addTemplate } = useToolTemplateStore();

  const updateTopic = useCallback((idx: number, value: string) => {
    setTopics((prev) => prev.map((t, i) => (i === idx ? value : t)));
  }, []);

  const addRound = useCallback(() => {
    setTopics((prev) => [...prev, '']);
  }, []);

  const removeRound = useCallback((idx: number) => {
    setTopics((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleStart = useCallback(() => {
    if (!canStart) return;
    const valid = topics.filter((t) => t.trim().length > 0);
    onStart(valid);
  }, [canStart, topics, onStart]);

  const applyExample = useCallback((example: string) => {
    setTopics((prev) => {
      // Fill the first empty slot, or replace the first slot
      const emptyIdx = prev.findIndex((t) => t.trim().length === 0);
      if (emptyIdx >= 0) {
        return prev.map((t, i) => (i === emptyIdx ? example : t));
      }
      return [...prev, example];
    });
  }, []);

  const handleSaveTemplate = useCallback((name: string) => {
    const validTopics = topics.filter((t) => t.trim().length > 0);
    if (validTopics.length === 0) return;
    void addTemplate(name, 'discussion', {
      type: 'discussion',
      toolType,
      topics: validTopics,
    });
    setShowSaveModal(false);
  }, [topics, toolType, addTemplate]);

  const handleLoadTemplate = useCallback((template: ToolTemplate) => {
    if (template.config.type === 'discussion') {
      setTopics([...template.config.topics]);
    }
  }, []);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Header with icon */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sp-accent/10 border border-sp-accent/20">
          <span className="material-symbols-outlined text-sp-accent text-3xl">{icon}</span>
        </div>
        <h2 className="text-2xl font-bold text-sp-text">{title}</h2>
        <p className="text-sm text-sp-muted leading-relaxed max-w-md mx-auto">
          {description}
        </p>
      </div>

      {/* Topic inputs */}
      <div className="space-y-3">
        <label className="text-xs font-bold text-sp-muted uppercase tracking-wider">논제 입력</label>
        {topics.map((topic, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-xs text-sp-accent font-bold w-8 shrink-0 text-center bg-sp-accent/10 rounded-md py-1">
              {idx + 1}
            </span>
            <input
              type="text"
              value={topic}
              onChange={(e) => updateTopic(idx, e.target.value)}
              placeholder="논제를 입력하세요..."
              className="flex-1 bg-sp-bg border border-sp-border rounded-xl px-4 py-3 text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none transition-colors"
              onKeyDown={(e) => { if (e.key === 'Enter' && canStart) handleStart(); }}
            />
            {topics.length > 1 && (
              <button
                onClick={() => removeRound(idx)}
                className="p-2 rounded-lg text-sp-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                title="삭제"
              >
                <span className="material-symbols-outlined text-icon-md">close</span>
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={addRound}
        className="w-full py-2.5 rounded-xl border border-dashed border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent transition-all text-sm"
      >
        + 라운드 추가
      </button>

      {/* Example topics */}
      <div className="space-y-2">
        <p className="text-xs text-sp-muted font-medium">예시 논제</p>
        <div className="flex flex-wrap gap-1.5">
          {examples.map((ex, idx) => (
            <button
              key={idx}
              onClick={() => applyExample(ex)}
              className="px-2.5 py-1.5 rounded-lg bg-sp-bg border border-sp-border text-xs text-sp-muted hover:text-sp-text hover:border-sp-accent/50 transition-all truncate max-w-[14rem]"
              title={ex}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {onShowPastResults && (
          <button
            onClick={onShowPastResults}
            className="px-4 py-2 rounded-xl bg-sp-card border border-sp-border text-sm text-sp-muted hover:text-sp-text hover:border-sp-accent/50 transition-all"
          >
            <span className="material-symbols-outlined text-icon-sm align-middle mr-1">history</span>
            지난 결과
          </button>
        )}
        <TemplateLoadDropdown toolType="discussion" onLoad={handleLoadTemplate} />
        <button
          onClick={() => setShowSaveModal(true)}
          disabled={!canStart}
          className="px-4 py-2 rounded-xl bg-sp-card border border-sp-border text-sm text-sp-muted hover:text-sp-text hover:border-sp-accent/50 transition-all disabled:opacity-40"
        >
          💾 논제 저장
        </button>
      </div>

      <button
        onClick={handleStart}
        disabled={!canStart}
        className="w-full py-3.5 rounded-xl bg-sp-accent text-white font-bold text-lg hover:bg-sp-accent/80 transition-colors shadow-lg shadow-sp-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        토론 시작
      </button>

      <TemplateSaveModal
        open={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSaveTemplate}
      />
    </div>
  );
}
