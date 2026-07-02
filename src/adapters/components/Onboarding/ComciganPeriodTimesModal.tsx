import { useState, useEffect, useCallback, useRef } from 'react';
import { comciganPort } from '@adapters/di/container';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
import {
  ComciganError,
  getComciganErrorMessage,
  type ComciganSchool,
} from '@domain/entities/ComciganTimetable';
import { parseComciganPeriodTimes } from '@domain/rules/comciganRules';
import type { ParsedComciganPeriodTimes } from '@domain/rules/comciganRules';
import type { SchoolLevel } from '@domain/entities/Settings';

interface ComciganPeriodTimesModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 역산 실패 시 폴백 수업시간 계산용 학교급 */
  schoolLevel: SchoolLevel;
  /** 학교명 프리필 (온보딩에서 선택한 학교) */
  defaultQuery?: string;
  /** 교시 시각 파싱 성공 시 호출 */
  onImport: (parsed: ParsedComciganPeriodTimes) => void;
}

type Step = 'school' | 'loading' | 'noTimes' | 'error';

/**
 * 온보딩 전용 — 컴시간에서 '교시 시각'만 가져오는 경량 모달.
 * 학교 검색 → 전체 시간표 수신 → 일과시간 파싱. 학급/교사 선택은 하지 않는다.
 */
export function ComciganPeriodTimesModal({
  isOpen,
  onClose,
  schoolLevel,
  defaultQuery,
  onImport,
}: ComciganPeriodTimesModalProps) {
  const [schoolQuery, setSchoolQuery] = useState('');
  const [searchResults, setSearchResults] = useState<readonly ComciganSchool[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<ComciganSchool | null>(null);
  const [step, setStep] = useState<Step>('school');
  const [errorMsg, setErrorMsg] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStep('school');
    setSelectedSchool(null);
    setSearchResults([]);
    setSearched(false);
    setErrorMsg('');
    setSchoolQuery((defaultQuery ?? '').split(' (')[0] ?? '');
  }, [isOpen, defaultQuery]);

  useEffect(() => {
    if (!isOpen || step !== 'school' || selectedSchool) return;
    const query = schoolQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearched(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      comciganPort
        .searchSchools(query)
        .then((results) => {
          setSearchResults(results);
          setSearched(true);
        })
        .catch(() => {
          setSearchResults([]);
          setSearched(true);
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isOpen, step, schoolQuery, selectedSchool]);

  const handleSelectSchool = useCallback(
    async (school: ComciganSchool) => {
      setSelectedSchool(school);
      setStep('loading');
      setErrorMsg('');
      try {
        const data = await comciganPort.getSchoolData(school.code);
        const parsed = parseComciganPeriodTimes(data.dayTimes, schoolLevel);
        if (!parsed) {
          setStep('noTimes');
          return;
        }
        onImport(parsed);
        onClose();
      } catch (e) {
        setErrorMsg(
          e instanceof ComciganError
            ? getComciganErrorMessage(e.errorType)
            : getComciganErrorMessage('NETWORK_ERROR'),
        );
        setStep('error');
      }
    },
    [schoolLevel, onImport, onClose],
  );

  const backToSearch = () => {
    setStep('school');
    setSelectedSchool(null);
    setErrorMsg('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="컴시간에서 교시 시각 가져오기"
      srOnlyTitle
      size="md"
    >
      <div className="flex flex-col flex-1 min-h-0">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sp-border">
          <h3 className="text-lg font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-accent">schedule</span>
            컴시간에서 교시 시각 가져오기
          </h3>
          <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === 'school' && (
            <div className="space-y-4">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sp-muted text-lg">
                  search
                </span>
                <input
                  type="text"
                  value={schoolQuery}
                  onChange={(e) => setSchoolQuery(e.target.value)}
                  placeholder="학교명을 입력하세요..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-sp-surface border border-sp-border text-sm text-sp-text placeholder:text-sp-muted/50 focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent/50"
                  autoFocus
                />
              </div>

              {searching && (
                <div className="flex items-center gap-2 text-sp-muted text-sm py-2">
                  <div className="w-4 h-4 border-2 border-sp-accent/30 border-t-sp-accent rounded-full animate-spin" />
                  컴시간에서 학교를 찾는 중...
                </div>
              )}

              {!searching && searchResults.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {searchResults.map((school) => (
                    <button
                      key={school.code}
                      onClick={() => void handleSelectSchool(school)}
                      className="w-full text-left p-3 rounded-xl hover:bg-sp-surface border border-transparent hover:border-sp-border transition-colors"
                    >
                      <p className="text-sm font-medium text-sp-text">{school.name}</p>
                      <p className="text-xs text-sp-muted mt-0.5">{school.regionName}</p>
                    </button>
                  ))}
                </div>
              )}

              {!searching &&
                searched &&
                searchResults.length === 0 &&
                schoolQuery.trim() !== '' && (
                  <div className="p-3 bg-sp-surface rounded-xl border border-sp-border text-xs text-sp-muted">
                    검색 결과가 없어요. 컴시간알리미를 쓰지 않는 학교라면 아래 표에서 직접 교시
                    시각을 조정해주세요.
                  </div>
                )}

              <p className="text-xs text-sp-muted">
                컴시간알리미에 등록된 학교의 교시별 시각(점심시간 포함)을 자동으로 채워드려요.
              </p>
            </div>
          )}

          {step === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-10 h-10 border-3 border-sp-accent/30 border-t-sp-accent rounded-full animate-spin" />
              <p className="text-sm text-sp-muted">교시 시각을 불러오는 중...</p>
            </div>
          )}

          {step === 'noTimes' && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="w-14 h-14 rounded-full bg-amber-500/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-amber-400 text-3xl">info</span>
              </div>
              <p className="text-sm text-sp-text text-center px-4">
                <span className="font-semibold">{selectedSchool?.name}</span>은(는) 컴시간에 교시
                시각 정보가 없어요.
              </p>
              <p className="text-xs text-sp-muted text-center px-4">
                다른 학교를 찾아보거나, 이 창을 닫고 아래 표에서 직접 조정해주세요.
              </p>
              <button
                onClick={backToSearch}
                className="px-4 py-2 rounded-xl bg-sp-surface border border-sp-border text-sm font-medium text-sp-text hover:bg-sp-card transition-colors"
              >
                다른 학교 찾기
              </button>
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-400 text-3xl">error</span>
              </div>
              <p className="text-sm text-sp-text text-center px-4 whitespace-pre-line">
                {errorMsg}
              </p>
              <button
                onClick={backToSearch}
                className="px-4 py-2 rounded-xl bg-sp-surface border border-sp-border text-sm font-medium text-sp-text hover:bg-sp-card transition-colors"
              >
                다시 시도
              </button>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-sp-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-sp-border text-sm text-sp-muted hover:text-sp-text transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
