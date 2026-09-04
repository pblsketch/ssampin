/**
 * 성취기준 고르기 창.
 *
 * 고르는 주된 길은 **영역으로 접힌 목록**이다. 찾기는 보조다 — 부분 문자열 검사라
 * "함수"는 잘 찾아도 "그래프 그리기"는 못 찾기 때문에(`searchStandards` 주석 참조),
 * 찾기를 주된 길로 두면 선생님이 "내 성취기준이 없다"고 오해한다.
 *
 * 원문은 여기서 **보여 주기만** 한다. 고른 결과로 밖에 나가는 것은 코드뿐이고,
 * AI 근거에는 키워드만 실린다.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
import type { CurriculumStandard } from '@domain/data/curriculumStandards.types';
import {
  domainsOf,
  narrowStandards,
  normalizeStandardCode,
  searchStandards,
  type StandardScope,
} from '@domain/rules/curriculumStandardRules';
import { useCurriculumStandards } from '@adapters/hooks/useCurriculumStandards';

interface StandardPickerModalProps {
  /** 지금 선택된 코드 */
  selected: readonly string[];
  onConfirm: (codes: string[]) => void;
  onClose: () => void;
  scope: StandardScope;
  /** 창 제목 아래 한 줄 — 어느 수업의 성취기준을 고르는 중인지 */
  contextLabel?: string;
}

export function StandardPickerModal({
  selected,
  onConfirm,
  onClose,
  scope,
  contextLabel,
}: StandardPickerModalProps) {
  const { data, isLoading, error } = useCurriculumStandards(scope.schoolLevel);
  const [query, setQuery] = useState('');
  const [openDomain, setOpenDomain] = useState<string | null>(null);
  const [picked, setPicked] = useState<readonly string[]>(selected);

  const pool = useMemo(
    () => (data ? narrowStandards(data.bundle.standards, scope) : []),
    [data, scope],
  );
  const found = useMemo(() => searchStandards(pool, query), [pool, query]);
  const domains = useMemo(() => domainsOf(found), [found]);
  const searching = query.trim().length > 0;

  // 영역이 하나뿐이면 접어 둘 이유가 없다 — 바로 펼쳐 준다.
  useEffect(() => {
    if (!searching && domains.length === 1 && openDomain === null)
      setOpenDomain(domains[0] ?? null);
  }, [searching, domains, openDomain]);

  const pickedSet = useMemo(() => new Set(picked.map((c) => normalizeStandardCode(c))), [picked]);

  function toggle(code: string) {
    const key = normalizeStandardCode(code);
    setPicked((prev) =>
      pickedSet.has(key) ? prev.filter((c) => normalizeStandardCode(c) !== key) : [...prev, code],
    );
  }

  /**
   * 🚨 `document.body` 로 내보내야 한다(createPortal).
   *
   * 이 창은 **항상 다른 창 안에서 열린다** — 진도 빠른 입력, 과제 만들기, 루브릭 편집 모두 모달이다.
   * 그런데 `Modal` 의 뒷배경에는 `backdrop-blur` 가 걸려 있고, `backdrop-filter` 가 걸린 요소는
   * 그 안의 `position: fixed` 를 **화면이 아니라 자기 상자에 가둔다.** 그대로 두면 이 창이
   * 부모 창 안쪽에 우그러져 뜬다. 게이트 4종으로는 안 잡히는 종류의 결함이라 여기 적어 둔다.
   */
  return createPortal(
    <Modal isOpen onClose={onClose} title="성취기준 고르기" srOnlyTitle size="lg">
      <div className="flex flex-col flex-1 min-h-0 max-h-[80vh]">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-sp-border/40 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-sp-text">성취기준 고르기</h3>
            <p className="mt-0.5 text-xs text-sp-muted truncate">
              {contextLabel ?? '2022 개정 교육과정'}
            </p>
          </div>
          <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
        </div>

        <div className="px-5 py-3 border-b border-sp-border/40 shrink-0">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="낱말이나 코드로 찾기 (예: 일차함수, 9수02)"
            className="w-full px-3 py-2 bg-sp-card border border-sp-border rounded-lg
                       text-sp-text text-sm placeholder:text-sp-muted
                       focus:outline-none focus:border-sp-accent"
          />
          <p className="mt-1.5 text-[11px] text-sp-muted">
            찾기는 적힌 낱말이 그대로 있을 때만 걸립니다. 아래 영역에서 골라도 됩니다.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading && <p className="text-sm text-sp-muted">성취기준을 불러오는 중입니다…</p>}

          {error !== null && (
            <p className="text-sm text-sp-highlight">{error} 창을 닫고 코드를 직접 적어 주세요.</p>
          )}

          {data !== null && pool.length === 0 && (
            <p className="text-sm text-sp-muted">이 과목·학년에 해당하는 성취기준이 없습니다.</p>
          )}

          {data !== null && searching && found.length === 0 && (
            <p className="text-sm text-sp-muted">
              찾는 말이 들어간 성취기준이 없습니다. 다른 낱말로 찾거나 영역에서 골라 보세요.
            </p>
          )}

          {/* 찾는 중에는 영역을 접지 않고 결과를 그대로 펼친다 */}
          {data !== null && searching && found.length > 0 && (
            <ul className="space-y-1.5">
              {found.map((s) => (
                <StandardRow
                  key={s.code}
                  standard={s}
                  checked={pickedSet.has(normalizeStandardCode(s.code))}
                  onToggle={() => toggle(s.code)}
                  showDomain
                />
              ))}
            </ul>
          )}

          {data !== null && !searching && (
            <div className="space-y-2">
              {domains.map((domain) => {
                const rows = found.filter((s) => s.domain === domain);
                const open = openDomain === domain;
                const pickedHere = rows.filter((s) =>
                  pickedSet.has(normalizeStandardCode(s.code)),
                ).length;
                return (
                  <section key={domain} className="border border-sp-border rounded-xl bg-sp-card">
                    <button
                      type="button"
                      onClick={() => setOpenDomain(open ? null : domain)}
                      aria-expanded={open}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                    >
                      <span
                        aria-hidden
                        className="material-symbols-outlined text-lg text-sp-muted transition-transform duration-sp-base"
                        style={open ? { transform: 'rotate(90deg)' } : undefined}
                      >
                        chevron_right
                      </span>
                      <span className="flex-1 min-w-0 truncate text-sm font-medium text-sp-text">
                        {domain}
                      </span>
                      {pickedHere > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-sp-accent/15 text-sp-accent">
                          {pickedHere}
                        </span>
                      )}
                      <span className="text-xs text-sp-muted">{rows.length}</span>
                    </button>
                    {open && (
                      <ul className="px-2 pb-2 space-y-1.5">
                        {rows.map((s) => (
                          <StandardRow
                            key={s.code}
                            standard={s}
                            checked={pickedSet.has(normalizeStandardCode(s.code))}
                            onToggle={() => toggle(s.code)}
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-sp-border/40 shrink-0">
          <span className="text-xs text-sp-muted">{picked.length}개 선택됨</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg border border-sp-border text-sm text-sp-muted
                         transition-colors hover:text-sp-text"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => onConfirm([...picked])}
              className="px-4 py-2 rounded-lg bg-sp-accent text-sm font-medium text-white
                         transition-opacity hover:opacity-90"
            >
              선택 반영
            </button>
          </div>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}

function StandardRow({
  standard,
  checked,
  onToggle,
  showDomain = false,
}: {
  standard: CurriculumStandard;
  checked: boolean;
  onToggle: () => void;
  showDomain?: boolean;
}) {
  return (
    <li>
      <label
        className={`flex gap-2.5 px-2.5 py-2 rounded-lg border cursor-pointer transition-colors ${
          checked
            ? 'bg-sp-accent/15 border-sp-accent/30'
            : 'bg-sp-surface border-transparent hover:border-sp-border'
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-0.5 accent-sp-accent"
        />
        <span className="min-w-0">
          <span className="flex items-baseline gap-2">
            <span
              className={`text-xs font-semibold ${checked ? 'text-sp-accent' : 'text-sp-text'}`}
            >
              {standard.code}
            </span>
            {showDomain && standard.domain.length > 0 && (
              <span className="text-[11px] text-sp-muted truncate">{standard.domain}</span>
            )}
          </span>
          <span className="block mt-0.5 text-sm leading-snug text-sp-text">
            {standard.textBroken === true || standard.text.length === 0
              ? // 원문을 그대로 보여 주면 열이 뒤섞인 글이 나온다. 사실대로 적는다.
                '원문 추출이 불완전합니다 — 코드로만 확인해 주세요.'
              : standard.text}
          </span>
        </span>
      </label>
    </li>
  );
}
