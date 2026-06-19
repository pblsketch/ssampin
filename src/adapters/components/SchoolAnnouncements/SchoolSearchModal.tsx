import { useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { importEvaluationPlan } from '@adapters/di/container';
import {
  identifyFromAddressKind,
  type SchoolDisclosureIdentity,
} from '@domain/services/schoolIdentify';
import type { EvaluationSchool } from '@domain/entities/EvaluationPlan';

interface SchoolSearchModalProps {
  onSelect: (identity: SchoolDisclosureIdentity) => void;
  onClose: () => void;
}

/**
 * 다른 학교 검색 모달 — 전국 학교명 검색(importEvaluationPlan.searchSchools, 키 불필요) →
 * 선택한 학교의 주소·학교급으로 공시 식별자를 만들어 onSelect 로 넘긴다.
 */
export function SchoolSearchModal({ onSelect, onClose }: SchoolSearchModalProps) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<readonly EvaluationSchool[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    const q = query.trim();
    if (q.length < 2) {
      setError('학교 이름을 2글자 이상 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await importEvaluationPlan.searchSchools(q);
      setHits(r);
      setSearched(true);
      if (r.length === 0) setError('검색 결과가 없어요. 학교 이름을 다시 확인해 주세요.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '검색에 실패했어요.');
    } finally {
      setBusy(false);
    }
  }

  function pick(hit: EvaluationSchool) {
    const identity = identifyFromAddressKind({
      address: hit.address,
      kindName: hit.kind,
      schoolName: hit.name,
    });
    if (!identity) {
      setError(`${hit.name}의 지역·학교급을 해석하지 못했어요. 다른 학교를 골라보세요.`);
      return;
    }
    onSelect(identity);
  }

  return (
    <Modal isOpen onClose={onClose} title="다른 학교 검색" srOnlyTitle size="md">
      <div className="flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-sp-border shrink-0">
          <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-sp-accent">search</span>
            다른 학교 검색
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3 overflow-y-auto">
          <p className="text-xs text-sp-muted leading-relaxed">
            학교 이름으로 전국 학교를 검색해 그 학교의 공시(학생수·동아리·옆 학교 비교)를 볼 수
            있어요.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSearch();
              }}
              placeholder="학교 이름 (예: 온양여자고)"
              aria-label="학교 이름 검색"
              className="flex-1 min-w-0 bg-sp-card border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted outline-none focus:border-sp-accent transition-colors"
            />
            <button
              type="button"
              onClick={() => void handleSearch()}
              disabled={busy}
              className="px-4 py-2 bg-sp-accent text-white rounded-lg hover:brightness-110 text-sm font-medium disabled:opacity-40 transition-all shrink-0"
            >
              {busy ? '검색 중...' : '검색'}
            </button>
          </div>

          {error !== null && (
            <div className="rounded-lg bg-sp-text/5 border border-sp-border px-3 py-2 text-xs text-sp-text">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {hits.map((s) => (
              <button
                key={s.shlIdfCd}
                type="button"
                onClick={() => pick(s)}
                className="text-left px-3 py-2.5 rounded-lg bg-sp-surface border border-sp-border hover:border-sp-accent transition-colors"
              >
                <p className="text-sm text-sp-text font-medium">{s.name}</p>
                <p className="text-xs text-sp-muted mt-0.5 truncate">
                  {[s.kind, s.address].filter((x) => x.length > 0).join(' · ')}
                </p>
              </button>
            ))}
            {searched && hits.length === 0 && !busy && error === null && (
              <p className="text-xs text-sp-muted py-4 text-center">검색 결과가 없어요.</p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
