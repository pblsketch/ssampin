import { useState, useMemo, useEffect } from 'react';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import type {
  EventsShareFile,
  CategoryMapping,
  DuplicateInfo,
  DuplicateStrategy,
  ImportResult,
} from '@domain/entities/EventsShareFile';
import { autoMapCategories, detectDuplicates } from '@domain/rules/shareRules';
import { getCategoryColors } from '@adapters/presenters/categoryPresenter';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';

interface ImportModalProps {
  shareFile: EventsShareFile;
  myCategories: readonly CategoryItem[];
  myEvents: readonly SchoolEvent[];
  onClose: () => void;
}

type WizardStep = 1 | 2 | 3 | 'done';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

function formatEventDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD
  return dateStr.replace(/-/g, '.');
}

// ── Step Indicator ────────────────────────────────────────────────────────────

interface StepIndicatorProps {
  current: WizardStep;
}

const STEP_LABELS = ['파일 정보', '카테고리 매핑', '가져오기'];

function StepIndicator({ current }: StepIndicatorProps) {
  const activeNum = current === 'done' ? 4 : (current as number);

  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {STEP_LABELS.map((label, idx) => {
        const stepNum = idx + 1;
        const isCompleted = activeNum > stepNum;
        const isActive = activeNum === stepNum;

        return (
          <div key={stepNum} className="flex items-center">
            {/* Connector line (before all except first) */}
            {idx > 0 && (
              <div
                className={`w-12 h-px ${isCompleted ? 'bg-green-500' : 'bg-sp-border'}`}
              />
            )}

            <div className="flex flex-col items-center gap-1.5">
              {/* Circle */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${isCompleted
                  ? 'bg-green-500 text-white'
                  : isActive
                    ? 'bg-sp-accent text-white'
                    : 'bg-sp-surface border border-sp-border text-sp-muted'
                  }`}
              >
                {isCompleted ? (
                  <span className="material-symbols-outlined text-base">check</span>
                ) : (
                  stepNum
                )}
              </div>
              {/* Label */}
              <span
                className={`text-xs font-medium whitespace-nowrap ${isActive ? 'text-sp-accent' : isCompleted ? 'text-green-400' : 'text-sp-muted'
                  }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Color Dot ─────────────────────────────────────────────────────────────────

function ColorDot({ colorKey }: { colorKey: string }) {
  const colors = getCategoryColors(colorKey);
  return <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors.dot}`} />;
}

// ── Step 1: 파일 정보 확인 ────────────────────────────────────────────────────

interface Step1Props {
  shareFile: EventsShareFile;
  onNext: () => void;
}

function Step1({ shareFile, onNext }: Step1Props) {
  const { meta, categories, events } = shareFile;
  const previewEvents = events.slice(0, 10);
  const remaining = events.length - previewEvents.length;

  return (
    <div className="space-y-4">
      {/* Meta info */}
      <div className="bg-sp-surface rounded-xl p-4 space-y-2.5">
        <MetaRow label="작성자" value={meta.createdBy || '—'} />
        <MetaRow label="학교" value={meta.schoolName || '—'} />
        <MetaRow label="생성일" value={formatDate(meta.createdAt)} />
        {meta.description && (
          <MetaRow label="설명" value={meta.description} />
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 text-sm text-sp-muted">
        <span className="material-symbols-outlined text-base text-sp-accent">event</span>
        <span>
          <strong className="text-sp-text">{events.length}개</strong> 일정,{' '}
          <strong className="text-sp-text">{categories.length}개</strong> 카테고리
        </span>
      </div>

      {/* Event preview */}
      <div>
        <p className="text-xs text-sp-muted mb-2 font-medium">일정 미리보기</p>
        <div className="max-h-[200px] overflow-y-auto space-y-1 pr-1">
          {previewEvents.map((ev) => {
            const cat = shareFile.categories.find((c) => c.id === ev.category);
            const colors = getCategoryColors(cat?.color ?? 'gray');
            return (
              <div
                key={ev.id}
                className="flex items-center gap-2.5 py-1.5 px-3 rounded-lg bg-sp-surface"
              >
                <span className="text-xs text-sp-muted w-20 flex-shrink-0 font-mono">
                  {formatEventDate(ev.date)}
                </span>
                <span className="text-sm text-sp-text flex-1 truncate">{ev.title}</span>
                {cat && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${colors.bg} ${colors.text}`}
                  >
                    <ColorDot colorKey={cat.color} />
                    {cat.name}
                  </span>
                )}
              </div>
            );
          })}
          {remaining > 0 && (
            <p className="text-xs text-sp-muted text-center py-1.5">... 외 {remaining}개</p>
          )}
        </div>
      </div>

      {/* Next button */}
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={onNext}
          className="flex items-center gap-1.5 bg-sp-accent hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm"
        >
          다음
          <span className="material-symbols-outlined text-base">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-xs text-sp-muted w-14 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-sp-text">{value}</span>
    </div>
  );
}

// ── Step 2: 카테고리 매핑 ─────────────────────────────────────────────────────

interface Step2Props {
  shareFile: EventsShareFile;
  myCategories: readonly CategoryItem[];
  mappings: CategoryMapping[];
  onMappingChange: (sourceId: string, targetId: string | null) => void;
  onPrev: () => void;
  onNext: () => void;
}

function Step2({ myCategories, mappings, onMappingChange, onPrev, onNext }: Step2Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-sp-muted">
        파일의 카테고리를 내 카테고리에 연결합니다. "새로 생성"을 선택하면 해당 카테고리가 자동으로 추가됩니다.
      </p>

      <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
        {mappings.map((mapping) => (
          <MappingRow
            key={mapping.sourceId}
            mapping={mapping}
            myCategories={myCategories}
            onChange={(targetId) => onMappingChange(mapping.sourceId, targetId)}
          />
        ))}
      </div>

      <div className="flex justify-between pt-1">
        <button
          type="button"
          onClick={onPrev}
          className="flex items-center gap-1.5 border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          이전
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex items-center gap-1.5 bg-sp-accent hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm"
        >
          다음
          <span className="material-symbols-outlined text-base">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}

interface MappingRowProps {
  mapping: CategoryMapping;
  myCategories: readonly CategoryItem[];
  onChange: (targetId: string | null) => void;
}

function MappingRow({ mapping, myCategories, onChange }: MappingRowProps) {
  // Current select value: targetId or empty string = '새로 생성'
  const selectValue = mapping.targetId ?? '';

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    onChange(val === '' ? null : val);
  }

  return (
    <div className="flex items-center gap-3 bg-sp-surface rounded-xl px-4 py-3">
      {/* Source */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <ColorDot colorKey={mapping.sourceColor} />
        <span className="text-sm text-sp-text truncate">{mapping.sourceName}</span>
        {mapping.autoMatched && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-900/60 text-green-400 flex-shrink-0">
            자동
          </span>
        )}
      </div>

      {/* Arrow */}
      <span className="material-symbols-outlined text-sp-muted text-base flex-shrink-0">
        arrow_forward
      </span>

      {/* Target select */}
      <div className="flex-1 min-w-0">
        <select
          value={selectValue}
          onChange={handleChange}
          className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-1.5 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent"
        >
          {myCategories.map((cat) => {
            return (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            );
          })}
          <option value="">새로 생성</option>
        </select>
      </div>
    </div>
  );
}

// ── Step 3: 중복 확인 및 가져오기 ────────────────────────────────────────────

interface Step3Props {
  duplicates: readonly DuplicateInfo[];
  duplicateStrategy: DuplicateStrategy;
  isImporting: boolean;
  onStrategyChange: (s: DuplicateStrategy) => void;
  onPrev: () => void;
  onImport: () => void;
}

function Step3({
  duplicates,
  duplicateStrategy,
  isImporting,
  onStrategyChange,
  onPrev,
  onImport,
}: Step3Props) {
  const hasDuplicates = duplicates.length > 0;

  return (
    <div className="space-y-4">
      {hasDuplicates ? (
        <>
          {/* Duplicate warning */}
          <div className="flex items-center gap-2.5 bg-yellow-900/30 border border-yellow-700/40 rounded-xl px-4 py-3">
            <span className="material-symbols-outlined text-yellow-400 text-xl">warning</span>
            <span className="text-sm text-yellow-300 font-medium">
              {duplicates.length}개 중복 일정 발견
            </span>
          </div>

          {/* Duplicate list */}
          <div className="max-h-[160px] overflow-y-auto space-y-1 pr-1">
            {duplicates.map((dup, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 py-1.5 px-3 rounded-lg bg-sp-surface"
              >
                <span className="text-xs text-sp-muted w-20 flex-shrink-0 font-mono">
                  {formatEventDate(dup.incomingEvent.date)}
                </span>
                <span className="text-sm text-sp-text flex-1 truncate">
                  {dup.incomingEvent.title}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-900/50 text-yellow-400 flex-shrink-0">
                  중복
                </span>
              </div>
            ))}
          </div>

          {/* Strategy selection */}
          <div className="bg-sp-surface rounded-xl p-4 space-y-2.5">
            <p className="text-xs text-sp-muted font-medium mb-3">중복 처리 방식</p>
            {(['skip', 'overwrite'] as const).map((strategy) => (
              <label key={strategy} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="radio"
                  name="duplicateStrategy"
                  value={strategy}
                  checked={duplicateStrategy === strategy}
                  onChange={() => onStrategyChange(strategy)}
                  className="w-4 h-4 text-sp-accent bg-sp-bg border-sp-border focus:ring-sp-accent"
                />
                <div>
                  <span className="text-sm text-sp-text font-medium group-hover:text-sp-text transition-colors">
                    {strategy === 'skip' ? '건너뛰기' : '덮어쓰기'}
                  </span>
                  <p className="text-xs text-sp-muted">
                    {strategy === 'skip'
                      ? '중복 일정은 가져오지 않습니다'
                      : '기존 일정을 새 일정으로 교체합니다'}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </>
      ) : (
        /* No duplicates */
        <div className="flex flex-col items-center gap-3 py-6">
          <span className="material-symbols-outlined text-5xl text-green-400">check_circle</span>
          <p className="text-sm text-sp-muted">중복 일정이 없습니다</p>
          <p className="text-xs text-sp-muted">모든 일정을 바로 가져올 수 있습니다.</p>
        </div>
      )}

      <div className="flex justify-between pt-1">
        <button
          type="button"
          onClick={onPrev}
          disabled={isImporting}
          className="flex items-center gap-1.5 border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          이전
        </button>
        <button
          type="button"
          onClick={onImport}
          disabled={isImporting}
          className="flex items-center gap-2 bg-sp-accent hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isImporting ? (
            <>
              <svg
                className="w-4 h-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8z"
                />
              </svg>
              가져오는 중...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-base">download</span>
              가져오기
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Step Done: 결과 요약 ──────────────────────────────────────────────────────

interface StepDoneProps {
  result: ImportResult;
  onClose: () => void;
}

function StepDone({ result, onClose }: StepDoneProps) {
  return (
    <div className="flex flex-col items-center gap-5 py-4">
      <span className="material-symbols-outlined text-6xl text-green-400">check_circle</span>
      <h3 className="text-xl font-bold text-sp-text">가져오기 완료</h3>

      <div className="w-full bg-sp-surface rounded-xl p-4 grid grid-cols-2 gap-3">
        <ResultStat
          icon="add_circle"
          iconColor="text-green-400"
          label="추가"
          value={result.imported}
          unit="개"
        />
        <ResultStat
          icon="skip_next"
          iconColor="text-sp-muted"
          label="건너뜀"
          value={result.skipped}
          unit="개"
        />
        <ResultStat
          icon="autorenew"
          iconColor="text-yellow-400"
          label="덮어쓰기"
          value={result.overwritten}
          unit="개"
        />
        <ResultStat
          icon="label"
          iconColor="text-sp-accent"
          label="새 카테고리"
          value={result.newCategories}
          unit="개"
        />
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full bg-sp-accent hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm mt-1"
      >
        닫기
      </button>
    </div>
  );
}

interface ResultStatProps {
  icon: string;
  iconColor: string;
  label: string;
  value: number;
  unit: string;
}

function ResultStat({ icon, iconColor, label, value, unit }: ResultStatProps) {
  return (
    <div className="flex items-center gap-3 bg-sp-card rounded-lg px-3 py-2.5">
      <span className={`material-symbols-outlined text-xl ${iconColor}`}>{icon}</span>
      <div>
        <p className="text-xs text-sp-muted">{label}</p>
        <p className="text-base font-bold text-sp-text">
          {value}
          <span className="text-xs font-normal ml-0.5">{unit}</span>
        </p>
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export function ImportModal({
  shareFile,
  myCategories,
  myEvents,
  onClose,
}: ImportModalProps) {
  const importEvents = useEventsStore((s) => s.importEvents);

  const [step, setStep] = useState<WizardStep>(1);
  const [mappings, setMappings] = useState<CategoryMapping[]>([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Initialize mappings on mount
  useEffect(() => {
    const initial = autoMapCategories(myCategories, shareFile.categories);
    setMappings([...initial]);
  }, [myCategories, shareFile.categories]);

  const duplicates = useMemo<readonly DuplicateInfo[]>(
    () => detectDuplicates(myEvents, shareFile.events),
    [myEvents, shareFile.events],
  );

  function handleMappingChange(sourceId: string, targetId: string | null) {
    setMappings((prev) =>
      prev.map((m) => {
        if (m.sourceId !== sourceId) return m;
        const targetCat = targetId !== null ? myCategories.find((c) => c.id === targetId) : null;
        return {
          ...m,
          targetId,
          targetName: targetCat?.name ?? m.sourceName,
          autoMatched: false,
        };
      }),
    );
  }

  async function handleImport() {
    setIsImporting(true);
    try {
      const result = await importEvents(shareFile, mappings, duplicateStrategy);
      setImportResult(result);
      setStep('done');
    } finally {
      setIsImporting(false);
    }
  }

  // Compute step title
  const stepTitle =
    step === 1
      ? '일정 가져오기'
      : step === 2
        ? '카테고리 매핑'
        : step === 3
          ? '중복 확인'
          : '가져오기 완료';

  const canCloseNow = step !== 'done' && !isImporting;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={stepTitle}
      srOnlyTitle
      size="lg"
      closeOnBackdrop={canCloseNow}
      closeOnEsc={canCloseNow}
    >
      <div className="overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-sp-border">
          <h3 className="text-lg font-bold text-sp-text">{stepTitle}</h3>
          {step !== 'done' && (
            <IconButton
              icon="close"
              label="닫기"
              variant="ghost"
              size="md"
              onClick={onClose}
              disabled={isImporting}
            />
          )}
        </div>

          {/* Body */}
          <div className="p-6">
            {/* Step indicator (not shown on done) */}
            {step !== 'done' && <StepIndicator current={step} />}

            {step === 1 && (
              <Step1 shareFile={shareFile} onNext={() => setStep(2)} />
            )}

            {step === 2 && (
              <Step2
                shareFile={shareFile}
                myCategories={myCategories}
                mappings={mappings}
                onMappingChange={handleMappingChange}
                onPrev={() => setStep(1)}
                onNext={() => setStep(3)}
              />
            )}

            {step === 3 && (
              <Step3
                duplicates={duplicates}
                duplicateStrategy={duplicateStrategy}
                isImporting={isImporting}
                onStrategyChange={setDuplicateStrategy}
                onPrev={() => setStep(2)}
                onImport={handleImport}
              />
            )}

            {step === 'done' && importResult !== null && (
              <StepDone result={importResult} onClose={onClose} />
            )}
          </div>
      </div>
    </Modal>
  );
}
