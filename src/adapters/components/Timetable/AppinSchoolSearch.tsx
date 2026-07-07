import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { neisPort, appinPort } from '@adapters/di/container';
import { NEIS_API_KEY } from '@domain/entities/Meal';
import type { SchoolSearchResult } from '@domain/entities/Meal';
import { appinRegionCandidates } from '@domain/rules/appinRules';
import {
  AppinError,
  getAppinErrorMessage,
  type AppinSchool,
} from '@domain/entities/AppinTimetable';

interface AppinSchoolSearchProps {
  /** 압핀 학교가 확정되면 호출 */
  onResolved: (school: AppinSchool) => void;
  /** 하단 참고 안내(모달별 다른 문구) */
  note?: ReactNode;
}

/**
 * 압핀 학교 검색 — 이름만으로.
 *
 * 압핀 getupdir 은 (정확한 시/군 + 정확한 학교명)을 요구해 부분검색이 안 된다.
 * 그래서 앱 내장 나이스 공용 키로 학교를 이름검색(전국·부분일치)해 후보를 보여주고,
 * 사용자가 고르면 그 학교 주소에서 시/군 후보를 뽑아 압핀 getupdir 로 코드를 해석한다.
 */
export function AppinSchoolSearch({ onResolved, note }: AppinSchoolSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly SchoolSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [resolvingCode, setResolvingCode] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── 이름 검색 디바운스 (나이스 공용키) ── */
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearched(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      setErrorMsg('');
      neisPort
        .searchSchool(NEIS_API_KEY, q)
        .then((list) => {
          setResults(list);
          setSearched(true);
        })
        .catch(() => {
          setResults([]);
          setSearched(true);
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  /* ── 후보 선택 → 압핀 코드 해석 (시/군 후보 순차) ── */
  const handlePick = useCallback(
    async (school: SchoolSearchResult) => {
      setResolvingCode(school.schoolCode);
      setErrorMsg('');
      try {
        const cities = appinRegionCandidates(school.address);
        // 주소가 없으면 학교명만으로는 못 찾으니 실패 처리
        for (const city of cities) {
          const resolved = await appinPort.resolveSchool(city, school.schoolName);
          if (resolved) {
            onResolved(resolved);
            return;
          }
        }
        setErrorMsg(
          `${school.schoolName}은(는) 압핀에 등록돼 있지 않은 것 같아요.\n이 학교는 압핀 대신 컴시간·나이스를 쓸 수 있어요.`,
        );
      } catch (e) {
        setErrorMsg(
          e instanceof AppinError
            ? getAppinErrorMessage(e.errorType)
            : getAppinErrorMessage('NETWORK_ERROR'),
        );
      } finally {
        setResolvingCode(null);
      }
    },
    [onResolved],
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sp-muted text-lg">
          search
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="학교명을 입력하세요..."
          autoFocus
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-sp-surface border border-sp-border text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent"
        />
      </div>

      {searching && (
        <div className="flex items-center gap-2 text-sp-muted text-sm py-2">
          <div className="w-4 h-4 border-2 border-sp-border border-t-sp-accent rounded-full animate-spin" />
          학교를 찾는 중...
        </div>
      )}

      {!searching && results.length > 0 && (
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {results.map((school) => {
            const isResolving = resolvingCode === school.schoolCode;
            return (
              <button
                key={school.schoolCode}
                onClick={() => void handlePick(school)}
                disabled={resolvingCode !== null}
                className="w-full text-left p-3 rounded-xl hover:bg-sp-surface border border-transparent hover:border-sp-border transition-colors disabled:opacity-50 flex items-center justify-between gap-2"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-sp-text">
                    {school.schoolName}
                  </span>
                  {school.address && (
                    <span className="block text-xs text-sp-muted mt-0.5 truncate">
                      {school.address}
                    </span>
                  )}
                </span>
                {isResolving && (
                  <span className="w-4 h-4 border-2 border-sp-border border-t-sp-accent rounded-full animate-spin shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {!searching && searched && results.length === 0 && query.trim() !== '' && (
        <div className="p-3 bg-sp-surface rounded-xl border border-sp-border text-xs text-sp-muted">
          <p className="font-semibold text-sp-text">검색 결과가 없어요</p>
          <p className="mt-1">학교명을 다시 확인해주세요.</p>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-red-500/5 rounded-xl border border-red-500/20 text-xs text-sp-text whitespace-pre-line">
          {errorMsg}
        </div>
      )}

      {note}
    </div>
  );
}
