/**
 * 현재 학기 · 개학일 · 마지막 수업일 설정 섹션.
 *
 * 쌤핀은 원래 달력만 보고 학기를 정했다(3~8월 1학기, 9~12월 2학기). 그래서 8월 중순에 2학기를
 * 개학한 학교는 9월 1일이 되기 전까지 앱 전체가 1학기로 보였고, 시간표 갱신 안내도 그때까지
 * 뜨지 않았다. 앱이 개학일을 알 방법은 없으므로(ADR-037) 학교가 알려주는 창구가 이 섹션이다.
 *
 * 설계 의도 — **설정값이 아니라 결과를 보여준다.** 선생님이 확인해야 하는 것은 "termStartDates에
 * 무엇이 저장됐는가"가 아니라 "그래서 앱이 지금 몇 학기로 아는가"다. 그래서 미리보기 문장이
 * 이 카드의 주인공이고, 입력은 그 문장을 바꾸는 수단으로만 배치했다.
 *
 * ## 마지막 수업일도 여기서 받는다
 *
 * 종료일은 진도 관리에서만 쓰이므로 처음엔 그 화면에서만 물었다. 그런데 **학기의 시작과 끝은
 * 선생님 머릿속에서 한 쌍이다** — 개학일을 고치러 온 김에 종료일도 손보는 게 자연스럽고,
 * 진도를 아직 안 쓰는 학기의 날짜를 미리 넣어 두려면 진도 화면 말고는 갈 곳이 없다.
 *
 * 두 날짜는 **같은 학기 탭·같은 저장 버튼**을 쓴다. 저장을 따로 두면 한쪽만 누르고 나가는 일이
 * 생기고, 그때 화면은 저장됐다고 보이는데 값은 안 바뀐 상태가 된다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { findTermStartCandidates } from '@domain/rules/termStartFromSchedule';
import { findTermEndCandidates } from '@domain/rules/termEndFromSchedule';
import {
  formatSchoolYearKo,
  formatTermKo,
  formatMonthDayKo,
  schoolYearOf,
} from '@domain/rules/academicCalendar';
import {
  resolveCurrentTerm,
  nominalTermStartDate,
  toLocalIsoDate,
} from '@domain/rules/schoolTermStart';
import { isEndBeforeStart, isOutsideSchoolYear } from '@domain/rules/termDateInput';
import { useCurrentTerm } from '@adapters/hooks/useCurrentTerm';

export function CurrentTermSection() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const showToast = useToastStore((s) => s.show);

  const activeTerm = useCurrentTerm();
  const todayIso = toLocalIsoDate(new Date());

  /** 편집 대상 학년도 — 지금 앱이 아는 학기의 학년도를 따른다. */
  const year = schoolYearOf(activeTerm) ?? new Date().getFullYear();

  const [semester, setSemester] = useState<1 | 2>(() => (activeTerm.endsWith('-2') ? 2 : 1));

  const editingTerm = `${year}-${semester}`;
  const registered = settings.termStartDates?.[editingTerm];
  const registeredEnd = settings.termEndDates?.[editingTerm];

  /**
   * 학사일정에서 찾은 개학일 후보 — 나이스 학사일정을 동기화한 학교라면 '개학식'이 이미 앱 안에
   * 있다. 시간표 신호보다 정확하고(하한선이 아니라 날짜 자체) 더 넓게 먹힌다(나이스에 시간표를
   * 올리지 않은 학교도 학사일정은 있다). 자동 적용은 하지 않고 채워 두기만 한다.
   */
  const events = useEventsStore((s) => s.events);

  /**
   * 그 학년도 두 학기의 후보를 **모두** 뽑는다.
   *
   * 한 학기만 보면 놓친다 — 8월에 이 화면을 열면 지금 학기(2학기) 탭이 선택되는데, 3월 개학
   * 학교는 개학식이 1학기 것뿐이라 아무것도 안 나온다. 반대 상황도 같다. 그래서 다른 학기에
   * 후보가 있으면 그쪽으로 넘어갈 수 있게 알려 준다.
   */
  const yearCandidates = useMemo(
    () =>
      findTermStartCandidates(
        events.map((e) => ({ date: e.date, title: e.title, neisEventName: e.neis?.eventName })),
        [`${year}-1`, `${year}-2`],
      ).filter((c) => settings.termStartDates?.[c.term] === undefined),
    [events, year, settings.termStartDates],
  );

  const scheduleCandidate = yearCandidates.find((c) => c.term === editingTerm) ?? null;
  const otherTermCandidate = yearCandidates.find((c) => c.term !== editingTerm) ?? null;

  /**
   * 마지막 수업일 후보 — 개학일과 같은 방식으로 학사일정의 방학식·종업식에서 찾는다.
   * 이미 등록된 학기는 제안하지 않는다(사용자가 확정한 값을 흔들지 않는다).
   */
  const endCandidate = useMemo(
    () =>
      findTermEndCandidates(
        events.map((e) => ({ date: e.date, title: e.title, neisEventName: e.neis?.eventName })),
        [editingTerm],
      ).filter((c) => settings.termEndDates?.[c.term] === undefined)[0] ?? null,
    [events, editingTerm, settings.termEndDates],
  );

  const [startDate, setStartDate] = useState<string>(registered ?? '');
  const [endDate, setEndDate] = useState<string>(registeredEnd ?? '');
  const [saving, setSaving] = useState(false);
  /** 후보를 이미 채워 넣은 학기 — 사용자가 지운 뒤 다시 밀어 넣지 않게 기억한다. */
  const [prefilledTerms, setPrefilledTerms] = useState<readonly string[]>([]);
  const [prefilledEndTerms, setPrefilledEndTerms] = useState<readonly string[]>([]);

  // 등록 전이고 손대지 않은 칸에만 후보를 채운다(사용자 입력을 덮지 않는다).
  useEffect(() => {
    if (scheduleCandidate === null) return;
    if (prefilledTerms.includes(editingTerm)) return;
    if (startDate !== '') return;
    setPrefilledTerms((prev) => [...prev, editingTerm]);
    setStartDate(scheduleCandidate.startIso);
  }, [scheduleCandidate, editingTerm, startDate, prefilledTerms]);

  useEffect(() => {
    if (endCandidate === null) return;
    if (prefilledEndTerms.includes(editingTerm)) return;
    if (endDate !== '') return;
    setPrefilledEndTerms((prev) => [...prev, editingTerm]);
    setEndDate(endCandidate.endIso);
  }, [endCandidate, editingTerm, endDate, prefilledEndTerms]);

  /** 학기 탭을 바꾸면 그 학기에 등록된 날짜를 불러온다(없으면 빈 칸). */
  const selectSemester = useCallback(
    (next: 1 | 2) => {
      setSemester(next);
      setStartDate(settings.termStartDates?.[`${year}-${next}`] ?? '');
      setEndDate(settings.termEndDates?.[`${year}-${next}`] ?? '');
    },
    [settings.termStartDates, settings.termEndDates, year],
  );

  /** 저장하면 앱이 몇 학기로 알게 되는지 — 이 카드의 주인공. */
  const preview = useMemo(() => {
    const draft: Record<string, string> = { ...(settings.termStartDates ?? {}) };
    if (startDate === '') delete draft[editingTerm];
    else draft[editingTerm] = startDate;

    const resolved = resolveCurrentTerm({
      today: new Date(`${todayIso}T00:00:00`),
      termStartDates: draft,
      currentTerm: settings.currentTerm,
    });

    // 개학일이 아직 오지 않았으면 "언제부터 바뀐다"까지 말해 준다 — 미리 등록하는 정상 흐름에서
    // "왜 아직 1학기지?"라는 오해를 없앤다.
    const upcoming = startDate !== '' && startDate > todayIso;
    return { resolved, upcoming };
  }, [settings.termStartDates, settings.currentTerm, startDate, editingTerm, todayIso]);

  /** 그 학년도 바깥 날짜는 실수다(2026학년도 = 2026-03-01 ~ 2027-02-28). 알려만 주고 막지 않는다. */
  const outOfRange = isOutsideSchoolYear(startDate, year) || isOutsideSchoolYear(endDate, year);

  /**
   * 끝이 시작보다 앞이면 **저장을 막는다.** 다른 실수는 숫자가 이상해지는 정도지만 이건
   * 진도 화면이 아예 계산을 포기하는 상태(`invalidTerm`)를 만든다 — 저장한 뒤 다른 화면에서
   * 고장을 만나게 두느니 여기서 멈추는 편이 낫다.
   */
  const endBeforeStart = isEndBeforeStart(startDate, endDate);

  const dirty = (registered ?? '') !== startDate || (registeredEnd ?? '') !== endDate;

  const handleSave = useCallback(async () => {
    if (endBeforeStart) return;
    setSaving(true);
    try {
      const next: Record<string, string> = { ...(settings.termStartDates ?? {}) };
      if (startDate === '') delete next[editingTerm];
      else next[editingTerm] = startDate;

      const nextEnd: Record<string, string> = { ...(settings.termEndDates ?? {}) };
      if (endDate === '') delete nextEnd[editingTerm];
      else nextEnd[editingTerm] = endDate;

      // 두 날짜를 한 번에 저장한다 — 나눠 쓰면 뒤엣것이 앞엣것을 덮을 여지가 생긴다.
      await updateSettings({ termStartDates: next, termEndDates: nextEnd });

      showToast(
        startDate === ''
          ? `${formatTermKo(editingTerm)} 개학일을 지웠어요 — 달력 기준으로 돌아가요`
          : `${formatTermKo(preview.resolved)} 기준으로 맞췄어요`,
      );
    } finally {
      setSaving(false);
    }
  }, [
    settings.termStartDates,
    settings.termEndDates,
    startDate,
    endDate,
    endBeforeStart,
    editingTerm,
    updateSettings,
    showToast,
    preview.resolved,
  ]);

  return (
    <section className="rounded-xl border border-sp-border bg-sp-card p-5">
      <div className="flex items-start gap-4">
        <div className="shrink-0 rounded-xl bg-sp-surface p-3">
          <span aria-hidden className="material-symbols-outlined text-3xl text-sp-accent">
            calendar_month
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-sp-text">현재 학기</h3>
          <p className="mt-1 text-sm leading-relaxed text-sp-muted">
            쌤핀은 기본적으로 3~7월을 1학기, 8~2월을 2학기로 봐요. 우리 학교 개학일이 다르면 여기서
            알려 주세요 — 시간표 갱신 안내와 &lsquo;이번 학기&rsquo; 통계가 그 날짜에 맞춰져요.
            마지막 수업일까지 알려 주시면 진도 관리에서 이번 학기 차시도 세어드려요.
          </p>

          {/* 결과 문장 — 이 카드에서 선생님이 실제로 확인하는 것 */}
          <div className="mt-4 rounded-lg border border-sp-accent/40 bg-sp-surface px-4 py-3">
            <p className="text-sm leading-relaxed text-sp-text">
              지금 쌤핀은{' '}
              <span className="font-bold text-sp-accent">{formatTermKo(preview.resolved)}</span>로
              알고 있어요.
              {preview.upcoming && (
                <>
                  {' '}
                  <span className="text-sp-muted">
                    {formatMonthDayKo(startDate)}이 되면 {formatTermKo(editingTerm)}로 바뀌어요.
                  </span>
                </>
              )}
            </p>
          </div>

          {/* 학기 선택 */}
          <div className="mt-5">
            <p className="text-xs font-semibold text-sp-muted">
              {formatSchoolYearKo(year)} — 날짜를 알려줄 학기
            </p>
            <div
              role="group"
              aria-label="학기 선택"
              className="mt-2 inline-flex rounded-lg border border-sp-border bg-sp-surface p-0.5"
            >
              {([1, 2] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => selectSemester(s)}
                  aria-pressed={semester === s}
                  className={`rounded-md px-4 py-1.5 text-sm transition-all duration-sp-base ease-sp-out ${
                    semester === s
                      ? 'bg-sp-card font-sp-semibold text-sp-text shadow-sp-sm'
                      : 'font-sp-medium text-sp-muted hover:text-sp-text'
                  }`}
                >
                  {s}학기
                  {/* 점 하나면 "이 학기는 뭐라도 알려줬다"는 표시로 충분하다 — 두 날짜를 각각
                      표시하면 탭이 설정 대시보드처럼 되어 정작 고를 대상이 안 보인다. */}
                  {(settings.termStartDates?.[`${year}-${s}`] !== undefined ||
                    settings.termEndDates?.[`${year}-${s}`] !== undefined) && (
                    <span aria-hidden className="ml-1.5 text-sp-accent">
                      •
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 개학일 입력 */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label htmlFor="term-start-date" className="text-sm text-sp-muted">
              개학일
            </label>
            <input
              id="term-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-sp-border bg-sp-bg px-3 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none"
              style={{ colorScheme: 'light dark' }}
            />
            <button
              type="button"
              onClick={() => setStartDate(todayIso)}
              className="rounded-lg border border-sp-border px-3 py-1.5 text-xs font-sp-medium text-sp-muted transition-all duration-sp-base ease-sp-out hover:text-sp-text active:scale-95"
            >
              오늘부터
            </button>
            {startDate !== '' && (
              <button
                type="button"
                onClick={() => setStartDate('')}
                className="rounded-lg border border-sp-border px-3 py-1.5 text-xs font-sp-medium text-sp-muted transition-all duration-sp-base ease-sp-out hover:text-sp-text active:scale-95"
              >
                비우기
              </button>
            )}
          </div>

          {/* 학사일정 근거 — "왜 이 날짜가 들어와 있는지"를 밝힌다. 출처를 안 밝히면
              선생님 입장에서는 앱이 임의로 날짜를 지어낸 것처럼 보인다. */}
          {scheduleCandidate !== null && startDate === scheduleCandidate.startIso && (
            <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-sp-muted">
              <span aria-hidden className="material-symbols-outlined text-sm text-sp-accent">
                event_available
              </span>
              <span>
                학사일정의 &lsquo;{scheduleCandidate.sourceLabel}&rsquo;(
                {formatMonthDayKo(scheduleCandidate.startIso)})에서 찾은 날짜예요. 맞으면 그대로
                두고, 다르면 고쳐 주세요.
              </span>
            </p>
          )}

          {/* 다른 학기에만 후보가 있을 때 — 탭을 안 눌러 보면 영영 못 만난다. */}
          {scheduleCandidate === null && otherTermCandidate !== null && (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs leading-relaxed text-sp-muted">
              <span aria-hidden className="material-symbols-outlined text-sm text-sp-accent">
                event_available
              </span>
              <span>
                학사일정에는 {formatTermKo(otherTermCandidate.term)} 개학일(
                {formatMonthDayKo(otherTermCandidate.startIso)}, {otherTermCandidate.sourceLabel})이
                있어요.
              </span>
              <button
                type="button"
                onClick={() => selectSemester(otherTermCandidate.term.endsWith('-2') ? 2 : 1)}
                className="rounded-lg border border-sp-border px-2 py-1 font-sp-medium text-sp-text transition-all duration-sp-base ease-sp-out hover:border-sp-accent active:scale-95"
              >
                그 학기 보기
              </button>
            </p>
          )}

          {startDate === '' && (
            <p className="mt-2 text-xs leading-relaxed text-sp-muted">
              비워 두면 달력 기준({semester === 1 ? '3월 1일' : '8월 1일'}
              {nominalTermStartDate(editingTerm) !== null && ' 시작'})으로 봐요.
            </p>
          )}

          {/* 마지막 수업일 입력 — 개학일과 같은 학기 탭·같은 저장 버튼을 쓴다. */}
          <div className="mt-4 border-t border-sp-border pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="term-end-date" className="text-sm text-sp-muted">
                마지막 수업일
              </label>
              <input
                id="term-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-sp-border bg-sp-bg px-3 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none"
                style={{ colorScheme: 'light dark' }}
              />
              {endDate !== '' && (
                <button
                  type="button"
                  onClick={() => setEndDate('')}
                  className="rounded-lg border border-sp-border px-3 py-1.5 text-xs font-sp-medium text-sp-muted transition-all duration-sp-base ease-sp-out hover:text-sp-text active:scale-95"
                >
                  비우기
                </button>
              )}
            </div>

            {/* 후보의 출처 — 밝히지 않으면 앱이 날짜를 지어낸 것처럼 보인다(개학일과 같은 이유). */}
            {endCandidate !== null && endDate === endCandidate.endIso && (
              <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-sp-muted">
                <span aria-hidden className="material-symbols-outlined text-sm text-sp-accent">
                  event_available
                </span>
                <span>
                  학사일정의 &lsquo;{endCandidate.sourceLabel}&rsquo;(
                  {formatMonthDayKo(endCandidate.endIso)})에서 찾은 날짜예요. 맞으면 그대로 두고,
                  다르면 고쳐 주세요.
                </span>
              </p>
            )}

            <p className="mt-2 text-xs leading-relaxed text-sp-muted">
              {endDate === ''
                ? '방학 날짜는 학교마다 달라서 쌤핀이 혼자 정하지 않아요. 비워 두면 진도 관리에서 이번 학기 예상 차시를 세지 않고 이 날짜를 물어봐요.'
                : '진도 관리의 이번 학기 예상 차시와 학기 기준 진도율을 이 날짜까지로 계산해요. 적어 두신 진도 기록은 날짜를 바꿔도 그대로예요.'}
            </p>
          </div>

          {endBeforeStart && (
            <p className="mt-3 rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-xs leading-relaxed text-sp-text">
              마지막 수업일({formatMonthDayKo(endDate)})이 개학일({formatMonthDayKo(startDate)})보다
              앞서요. 두 날짜를 확인해 주세요.
            </p>
          )}

          {outOfRange && (
            <p className="mt-2 rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-xs leading-relaxed text-sp-muted">
              {formatSchoolYearKo(year)} 범위(3월 1일 ~ 다음 해 2월 말) 밖의 날짜예요. 학년도가
              맞는지 확인해 주세요.
            </p>
          )}

          <div className="mt-4">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!dirty || saving || endBeforeStart}
              className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-semibold text-sp-accent-fg transition-all duration-sp-base ease-sp-out hover:brightness-110 active:scale-95 disabled:opacity-40"
            >
              {saving ? '맞추는 중…' : '이 학기로 맞추기'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
