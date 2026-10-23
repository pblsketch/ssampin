/**
 * 내 API 키로 연결 — 선생님 본인 API 키(BYOK)를 넣는 카드 (ADR-143).
 *
 * 흐름: 1단계 서비스 고르기 → 2단계 [키 받으러 가기]와 번호 붙인 순서 → 3단계 붙여 넣고 [연결 확인] → 끝.
 * 연결되면 바로 그 키·추천 모델로 쓰게 하고(패널·생기부 초안 모두), 모델은 아래에서 바꾼다.
 *
 * ★키는 이 화면에 **잠깐만** 머문다. [연결 확인]이 성공하면 입력값을 곧바로 지우고, 다시 보여 주는
 *   통로도 없다(main 이 돌려주지 않는다). 화면이 아는 것은 끝 4자리뿐이다.
 * ★입력칸은 비밀번호 칸이다 — 화면 공유·수업 중 화면 송출에서 키가 보이지 않게. [보기]로 잠깐 볼 수 있다.
 * ★로고·상표를 쓰지 않고 평문 이름만 쓴다.
 */
import { useEffect, useId, useRef, useState } from 'react';

import {
  API_KEY_SERVICE_INFO,
  API_KEY_SERVICES,
  shortApiKeyModelLabel,
  type ApiKeyServiceId,
} from '@domain/entities/ApiKeyProvider';
import { apiKeySetupMessage } from '@domain/rules/apiKeyRules';
import { useApiKeyStatusStore } from '@adapters/stores/useApiKeyStatusStore';
import { useAssistStore } from '@adapters/stores/useAssistStore';

/** 보내기 전에 꼭 알아야 할 것 — 펼치지 않아도 핵심 두 줄은 보인다. */
function PrivacyNotice() {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  return (
    <div className="mt-4 rounded-lg border border-sp-border border-l-2 border-l-sp-warning bg-sp-surface px-3 py-2.5 text-sm leading-relaxed text-sp-muted">
      <p>
        <strong className="text-sp-text">요금은 선생님 계정으로 나가요.</strong> 키 주인에게
        청구되니, 서비스 사이트에서 <strong className="text-sp-text">사용 한도</strong>를 정해
        두시길 권해요.
      </p>
      <p className="mt-1">
        질문과 쌤핀이 찾은 자료가 고른 서비스로 <strong className="text-sp-text">바로</strong>{' '}
        가요(쌤핀 서버는 거치지 않아요). 학생 이름은 ［이름1］처럼 가려서 보내요.
      </p>
      {open && (
        <ul id={detailId} className="mt-2 list-none space-y-1 text-xs">
          <li>
            · 키는 이 컴퓨터에만 운영체제 암호화로 보관해요. 백업 파일·구글 드라이브 동기화에
            들어가지 않아요.
          </li>
          <li>· 쌤핀은 키를 다시 보여 주지 않아요. 끝 4자리만 보여요.</li>
          <li>· 연락처·주민번호가 들어간 질문은 보내지 않고 멈춰요.</li>
          <li>· 이미지는 아직 이 방식으로 보낼 수 없어요.</li>
        </ul>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? detailId : undefined}
        className="mt-1.5 inline-flex items-center gap-0.5 rounded-md text-xs font-medium text-sp-accent hover:underline"
      >
        {open ? '간단히 보기' : '개인정보는 어떻게 되나요?'}
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
    </div>
  );
}

/** 1단계·2단계·3단계 제목 — 안쪽 순서 번호(①②③)와 헷갈리지 않게 "단계"를 붙인다. */
function StepTitle({ step, children }: { readonly step: number; readonly children: string }) {
  return (
    <>
      <span className="mr-2 text-sp-accent">{step}단계</span>
      {children}
    </>
  );
}

/** 1단계 서비스 고르기 — 라디오 묶음. 처음이면 추천(첫째)이 골라져 있다. */
function ServicePicker({
  value,
  connectedServices,
  locked,
  onChange,
}: {
  readonly value: ApiKeyServiceId;
  readonly connectedServices: readonly ApiKeyServiceId[];
  /** 키를 확인하는 동안은 서비스를 바꿀 수 없다(확인 중인 키가 엉뚱한 서비스로 보이지 않게). */
  readonly locked: boolean;
  readonly onChange: (s: ApiKeyServiceId) => void;
}) {
  const name = useId();
  return (
    <fieldset disabled={locked}>
      <legend className="text-sm font-sp-semibold text-sp-text">
        <StepTitle step={1}>어느 서비스의 키를 쓸까요?</StepTitle>
      </legend>
      <div className="mt-2 grid gap-2">
        {API_KEY_SERVICES.map((s, i) => {
          const info = API_KEY_SERVICE_INFO[s];
          const checked = value === s;
          return (
            <label
              key={s}
              className={[
                'flex gap-3 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-sp-accent',
                locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                checked
                  ? 'border-sp-accent bg-sp-card ring-1 ring-sp-accent'
                  : 'border-sp-border bg-sp-bg hover:bg-sp-card',
              ].join(' ')}
            >
              <input
                type="radio"
                name={name}
                value={s}
                checked={checked}
                onChange={() => onChange(s)}
                className="mt-0.5 shrink-0 accent-sp-accent"
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-sp-semibold text-sp-text">
                  {info.label}
                  {i === 0 && (
                    <span className="rounded-md border border-sp-accent px-1 text-[0.65rem] font-medium text-sp-accent">
                      처음이라면
                    </span>
                  )}
                  {connectedServices.includes(s) && (
                    <span className="rounded-md border border-sp-border px-1 text-[0.65rem] font-medium text-sp-muted">
                      키 있음
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-sp-muted">
                  {info.summary}
                </span>
                {checked && (
                  <span className="mt-0.5 block text-xs leading-relaxed text-sp-text">
                    요금: {info.billing}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** 2단계·3단계 키 받기 안내 + 붙여 넣기 */
function KeyEntry({
  service,
  replacing,
  onDone,
  onCancel,
  onCheckingChange,
}: {
  readonly service: ApiKeyServiceId;
  /** 이 서비스에 이미 키가 있다 — 새 키를 넣으면 바뀐다 */
  readonly replacing: boolean;
  readonly onDone: () => void;
  readonly onCancel: (() => void) | null;
  readonly onCheckingChange: (checking: boolean) => void;
}) {
  const info = API_KEY_SERVICE_INFO[service];
  const save = useApiKeyStatusStore((s) => s.save);
  const openKeyPage = useApiKeyStatusStore((s) => s.openKeyPage);
  const setOwnAiEnabled = useAssistStore((s) => s.setOwnAiEnabled);
  const setProvider = useAssistStore((s) => s.setProvider);

  const inputId = useId();
  const helpId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [key, setKey] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [opened, setOpened] = useState(false);
  /** 두 번 누르기 방지 — 상태는 늦게 바뀌어 두 호출이 같은 옛 값을 본다(ref 로 막는다). */
  const inFlight = useRef(false);

  // 서비스를 바꾸면 넣던 키와 오류를 비운다 — 다른 서비스 칸에 옛 키가 남지 않게.
  useEffect(() => {
    setKey('');
    setError(null);
    setReveal(false);
    setOpened(false);
  }, [service]);

  // 화면을 떠나면 입력값을 비운다(언마운트 시 상태는 사라지지만, 명시해 둔다).
  useEffect(() => () => setKey(''), []);

  // 확인하는 동안 위쪽 서비스 고르기를 잠근다. 사라질 때는 반드시 풀어 둔다.
  useEffect(() => {
    onCheckingChange(checking);
    return () => onCheckingChange(false);
  }, [checking, onCheckingChange]);

  // 실패하면 입력칸으로 돌아온다 — 확인 중에 칸이 잠기며 잃은 포커스를 되돌려 바로 고쳐 붙이게.
  useEffect(() => {
    if (!checking && error !== null) inputRef.current?.focus();
  }, [checking, error]);

  const submit = async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    setError(null);
    try {
      const r = await save(service, key);
      if (r.ok) {
        setKey('');
        setReveal(false);
        // 방금 연결한 키로 바로 쓰게 한다 — 패널·생기부 초안 모두 "내 API 키"로 답한다.
        setOwnAiEnabled(true);
        setProvider('apikey');
        onDone();
        return;
      }
      // 다른 서비스 키처럼 생겼으면 main 이 **보내지 않고** 돌려준다 — 고를 서비스를 알려 준다.
      setError(
        r.looksLike !== undefined
          ? `붙여 넣은 키는 ${API_KEY_SERVICE_INFO[r.looksLike].label} 키처럼 보여요. 1단계에서 그 서비스를 고른 뒤 다시 확인해 주세요. (키는 아무 데도 보내지 않았어요.)`
          : apiKeySetupMessage(r.reason),
      );
    } catch {
      setError(apiKeySetupMessage('key-provider-error'));
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  };

  return (
    <div className="mt-5 space-y-5 border-t border-sp-border pt-5">
      <div>
        <p className="text-sm font-sp-semibold text-sp-text">
          <StepTitle step={2}>키를 받아 와요</StepTitle>
        </p>
        <p className="mt-1 text-xs leading-relaxed text-sp-muted">
          키는 서비스 사이트에서 만들어 주는 긴 글자예요. 아래 순서대로 하면 돼요.
        </p>
        <ol className="mt-3 space-y-2 text-sm text-sp-muted">
          {info.steps.map((step, i) => (
            <li key={step} className="flex gap-2">
              <span
                aria-hidden="true"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sp-surface text-xs font-sp-semibold text-sp-text"
              >
                {i + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => {
            void openKeyPage(service);
            setOpened(true);
          }}
          className="mt-3 inline-flex items-center gap-1 rounded-lg border border-sp-border bg-sp-bg px-3 py-1.5 text-sm font-sp-semibold text-sp-text hover:bg-sp-card"
        >
          키 받으러 가기
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            open_in_new
          </span>
        </button>
        {opened && (
          <p role="status" className="mt-2 text-xs leading-relaxed text-sp-muted">
            브라우저에서 열었어요. 키를 복사한 뒤 쌤핀으로 돌아와 주세요. 열리지 않으면 이 주소를
            브라우저에 붙여 넣어요.{' '}
            <span className="select-all break-all font-mono text-sp-text">{info.keyPageUrl}</span>
          </p>
        )}
        {info.caution !== null && (
          <p className="mt-3 rounded-lg border border-sp-border border-l-2 border-l-sp-warning bg-sp-surface px-3 py-2 text-xs leading-relaxed text-sp-muted">
            {info.caution}
          </p>
        )}
      </div>

      <form
        className="border-t border-sp-border pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label htmlFor={inputId} className="text-sm font-sp-semibold text-sp-text">
          <StepTitle step={3}>복사한 키를 붙여 넣어요</StepTitle>
        </label>
        <p id={helpId} className="mt-1 text-xs leading-relaxed text-sp-muted">
          {replacing ? '이 서비스에는 이미 키가 있어요. 새 키를 넣으면 지금 키가 바뀌어요. ' : ''}
          칸을 누르고 Ctrl+V 로 붙여 넣으면 돼요. 앞뒤 빈칸은 알아서 지워요.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <input
              id={inputId}
              ref={inputRef}
              type={reveal ? 'text' : 'password'}
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                if (error) setError(null);
              }}
              placeholder="여기에 붙여 넣기"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              aria-invalid={error !== null}
              aria-describedby={error !== null ? `${helpId} ${errorId}` : helpId}
              disabled={checking}
              className="w-full rounded-lg border border-sp-border bg-sp-bg py-1.5 pl-3 pr-10 font-mono text-sm text-sp-text placeholder:font-sans placeholder:text-sp-muted disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-pressed={reveal}
              aria-label={reveal ? '키 가리기' : '키 보기'}
              title={reveal ? '키 가리기' : '키 보기'}
              disabled={checking}
              className="absolute inset-y-0 right-0 flex items-center rounded-r-lg px-2.5 text-sp-muted hover:text-sp-text disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                {reveal ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
          <button
            type="submit"
            disabled={checking || key.trim().length === 0}
            className="inline-flex items-center gap-1 rounded-lg bg-sp-accent px-3 py-1.5 text-sm font-sp-semibold text-sp-accent-fg disabled:opacity-60"
          >
            {checking && (
              <span
                className="material-symbols-outlined animate-spin text-base motion-reduce:animate-none"
                aria-hidden="true"
              >
                progress_activity
              </span>
            )}
            {checking ? '확인하는 중…' : '연결 확인'}
          </button>
          {onCancel !== null && (
            <button
              type="button"
              onClick={onCancel}
              disabled={checking}
              className="rounded-lg px-2 py-1.5 text-sm text-sp-muted hover:text-sp-text disabled:opacity-60"
            >
              그만두기
            </button>
          )}
        </div>
        {checking && (
          <p role="status" className="mt-2 text-xs text-sp-muted">
            서비스에 키가 맞는지 물어보고 있어요. 몇 초 걸릴 수 있어요.
          </p>
        )}
        {error !== null && (
          <div
            id={errorId}
            role="alert"
            className="mt-3 flex gap-2 rounded-lg border border-sp-border border-l-2 border-l-sp-warning bg-sp-surface px-3 py-2 text-sm leading-relaxed text-sp-text"
          >
            <span
              className="material-symbols-outlined shrink-0 text-base text-sp-warning"
              aria-hidden="true"
            >
              error
            </span>
            <span className="min-w-0">{error}</span>
          </div>
        )}
      </form>
    </div>
  );
}

/** 연결된 키 한 줄 */
function ConnectedRow({
  service,
  hint,
  persisted,
  active,
}: {
  readonly service: ApiKeyServiceId;
  readonly hint: string;
  readonly persisted: boolean;
  readonly active: boolean;
}) {
  const remove = useApiKeyStatusStore((s) => s.remove);
  const setActive = useApiKeyStatusStore((s) => s.setActive);
  const loadModels = useApiKeyStatusStore((s) => s.loadModels);
  const models = useApiKeyStatusStore((s) => s.models[service]);
  const activeModel = useApiKeyStatusStore((s) =>
    s.snapshot?.active?.service === service ? s.snapshot.active.model : null,
  );
  const storeProvider = useAssistStore((s) => s.provider);
  const setProvider = useAssistStore((s) => s.setProvider);
  const setOwnAiEnabled = useAssistStore((s) => s.setOwnAiEnabled);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const removeButtonRef = useRef<HTMLButtonElement>(null);
  const keepButtonRef = useRef<HTMLButtonElement>(null);
  const label = API_KEY_SERVICE_INFO[service].label;

  useEffect(() => {
    if (active) void loadModels(service);
  }, [active, service, loadModels]);

  // 지우기 확인이 뜨면 안전한 쪽([두기])에 포커스를 둔다 — 눌러서 사라진 단추의 포커스를 잃지 않게.
  useEffect(() => {
    if (confirmRemove) keepButtonRef.current?.focus();
  }, [confirmRemove]);

  const applyThisKey = async (): Promise<void> => {
    setBusy(true);
    setNotice(null);
    try {
      await loadModels(service);
      const ready = useApiKeyStatusStore.getState().models[service];
      const pick =
        ready?.state === 'ready'
          ? (ready.models.find((m) => m.recommended) ?? ready.models[0])
          : undefined;
      if (!pick) {
        setNotice(
          '모델 목록을 받지 못해 아직 바꾸지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.',
        );
        return;
      }
      await setActive(service, pick.id);
      // 지금 이 키로 쓰겠다는 뜻이므로 AI 패널·생기부 초안도 "내 API 키"로 답하게 한다.
      setOwnAiEnabled(true);
      setProvider('apikey');
    } catch {
      setNotice('바꾸지 못했어요. 잠시 뒤에 다시 눌러 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (): Promise<void> => {
    setBusy(true);
    try {
      await remove(service);
      // 이 키로 답하고 있었다면 끊긴 통로를 가리키지 않게 되돌린다.
      if (active && storeProvider === 'apikey') setProvider('ssampin');
    } finally {
      setBusy(false);
      setConfirmRemove(false);
    }
  };

  const cancelRemove = (): void => {
    setConfirmRemove(false);
    // 확인 단추가 사라진 뒤 [키 지우기]가 다시 그려지면 그리로 포커스를 돌려준다.
    requestAnimationFrame(() => removeButtonRef.current?.focus());
  };

  const options = models?.state === 'ready' ? models.models : [];

  return (
    <div className="rounded-xl border border-sp-border bg-sp-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="flex flex-wrap items-center gap-1.5 text-sm font-sp-semibold text-sp-text">
            {label}
            {active && (
              <span className="rounded-md border border-sp-accent px-1 text-[0.65rem] font-medium text-sp-accent">
                사용 중
              </span>
            )}
          </h4>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-sp-muted">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-sp-accent"
            />
            <span>
              연결됨 · 키 <span className="font-mono">{hint}</span>
            </span>
            {!active && <span>· 지금은 쓰지 않아요</span>}
          </p>
        </div>
        {!confirmRemove && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!active && (
              <button
                type="button"
                onClick={() => void applyThisKey()}
                disabled={busy}
                aria-label={`${label} 키로 쓰기`}
                className="rounded-lg bg-sp-accent px-3 py-1.5 text-sm font-sp-semibold text-sp-accent-fg disabled:opacity-60"
              >
                {busy ? '바꾸는 중…' : '이 키로 쓰기'}
              </button>
            )}
            <button
              ref={removeButtonRef}
              type="button"
              onClick={() => setConfirmRemove(true)}
              disabled={busy}
              aria-label={`${label} 키 지우기`}
              className="rounded-lg border border-sp-border bg-sp-bg px-3 py-1.5 text-sm text-sp-text disabled:opacity-60"
            >
              키 지우기
            </button>
          </div>
        )}
      </div>

      {notice !== null && (
        <p role="alert" className="mt-3 text-xs leading-relaxed text-sp-text">
          <span
            className="material-symbols-outlined mr-1 align-[-3px] text-base text-sp-warning"
            aria-hidden="true"
          >
            error
          </span>
          {notice}
        </p>
      )}

      {confirmRemove && (
        <div
          role="group"
          aria-label={`${label} 키 지우기 확인`}
          className="mt-3 rounded-lg border border-sp-border border-l-2 border-l-sp-warning bg-sp-surface px-3 py-2.5"
        >
          <p className="text-sm font-sp-semibold text-sp-text">이 컴퓨터에서 키를 지울까요?</p>
          <p className="mt-0.5 text-xs leading-relaxed text-sp-muted">
            쌤핀에서만 지워져요. 서비스 사이트에 만들어 둔 키는 그대로라, 완전히 없애려면 그곳에서도
            삭제해 주세요.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void onRemove()}
              disabled={busy}
              className="rounded-lg border border-sp-warning bg-sp-bg px-3 py-1.5 text-sm font-sp-semibold text-sp-text disabled:opacity-60"
            >
              {busy ? '지우는 중…' : '지우기'}
            </button>
            <button
              ref={keepButtonRef}
              type="button"
              onClick={cancelRemove}
              disabled={busy}
              className="rounded-lg border border-sp-border bg-sp-bg px-3 py-1.5 text-sm text-sp-text disabled:opacity-60"
            >
              그대로 두기
            </button>
          </div>
        </div>
      )}

      {active && (
        <>
          <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-sp-muted">사용할 모델</span>
            <select
              value={activeModel ?? ''}
              onChange={(e) => void setActive(service, e.target.value)}
              disabled={options.length === 0}
              className="min-w-0 max-w-full rounded-lg border border-sp-border bg-sp-bg px-2 py-1 text-sm text-sp-text disabled:opacity-60"
            >
              {activeModel !== null && !options.some((m) => m.id === activeModel) && (
                <option value={activeModel}>{shortApiKeyModelLabel(activeModel)}</option>
              )}
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.recommended ? ' (추천)' : ''}
                </option>
              ))}
            </select>
            {models?.state === 'loading' && (
              <span className="text-xs text-sp-muted">목록을 받는 중…</span>
            )}
          </label>
          {models?.state === 'error' && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-sp-muted">
              <span>목록을 받지 못했어요. {apiKeySetupMessage(models.reason)}</span>
              <button
                type="button"
                onClick={() => void loadModels(service, true)}
                className="rounded-md font-medium text-sp-accent hover:underline"
              >
                다시 받기
              </button>
            </p>
          )}
          <p className="mt-1 text-xs leading-relaxed text-sp-muted">
            추천 모델은 빠르고 값이 싸요. 생기부 초안 품질이 아쉬우면 더 큰 모델로 바꿔 보세요.
          </p>
        </>
      )}

      {!persisted && (
        <p className="mt-3 rounded-lg border border-sp-border border-l-2 border-l-sp-warning bg-sp-surface px-3 py-2 text-xs leading-relaxed text-sp-muted">
          이 컴퓨터에서는 키를 암호화해 보관할 수 없어 이번 실행 동안만 기억해요. 쌤핀을 다시 켜면
          키를 다시 넣어야 해요.
        </p>
      )}
    </div>
  );
}

export function ApiKeyConnectCard() {
  const available = useApiKeyStatusStore((s) => s.available);
  const snapshot = useApiKeyStatusStore((s) => s.snapshot);
  const refresh = useApiKeyStatusStore((s) => s.refresh);
  const [adding, setAdding] = useState(false);
  const [service, setService] = useState<ApiKeyServiceId>(API_KEY_SERVICES[0] ?? 'gemini');
  const [justConnected, setJustConnected] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connected = (snapshot?.services ?? []).filter((s) => s.configured);
  const connectedServices = connected.map((s) => s.service);
  const showEntry = connected.length === 0 || adding;

  return (
    <section
      className="rounded-xl bg-sp-card ring-1 ring-sp-border p-5"
      aria-labelledby="api-key-section-title"
    >
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sp-surface text-sp-accent">
          <span className="material-symbols-outlined" aria-hidden="true">
            key
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 id="api-key-section-title" className="text-base font-bold text-sp-text">
            내 API 키로 연결
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-sp-muted">
            AI 서비스에서 받은 &lsquo;API 키&rsquo;(비밀번호 같은 긴 글자)를 넣으면, 구독이 없어도
            쌤핀 AI 패널과 생기부 초안을 쓸 수 있어요. 키는 이 컴퓨터에만 보관해요.
          </p>
        </div>
      </div>

      {available === false ? (
        <div className="mt-4 flex gap-2 rounded-lg border border-sp-border bg-sp-surface px-3 py-2.5 text-sm leading-relaxed text-sp-muted">
          <span className="material-symbols-outlined shrink-0 text-base" aria-hidden="true">
            desktop_windows
          </span>
          <p>
            이 기능은 쌤핀 데스크톱 앱에서만 쓸 수 있어요. 컴퓨터에 설치한 쌤핀 앱의 설정에서 열어
            주세요.
          </p>
        </div>
      ) : available === null ? (
        <p role="status" className="mt-4 text-sm text-sp-muted">
          연결 상태를 확인하고 있어요…
        </p>
      ) : (
        <>
          {justConnected && connected.length > 0 && (
            <div
              role="status"
              className="mt-4 flex gap-2 rounded-lg border border-sp-accent bg-sp-surface px-3 py-2.5 text-sm leading-relaxed text-sp-text"
            >
              <span
                className="material-symbols-outlined shrink-0 text-base text-sp-accent"
                aria-hidden="true"
              >
                check_circle
              </span>
              <p>
                연결됐어요! 이제 쌤핀 AI 패널과 생기부 초안에서 &ldquo;내 API 키&rdquo;로 답해요.
                바로 AI 패널을 열어 아무거나 물어보세요.
              </p>
            </div>
          )}

          {connected.length > 0 && (
            <div className="mt-4 space-y-3">
              {connected.map((s) => (
                <ConnectedRow
                  key={s.service}
                  service={s.service}
                  hint={s.hint ?? '••••'}
                  persisted={s.persisted}
                  active={snapshot?.active?.service === s.service}
                />
              ))}
            </div>
          )}

          {/* 처음이면 키를 붙여 넣기 *전에* 요금·개인정보를 읽게 위에 둔다. */}
          {connected.length === 0 && <PrivacyNotice />}

          {showEntry ? (
            <div className="mt-4 rounded-xl border border-sp-border bg-sp-bg p-4">
              <ServicePicker
                value={service}
                connectedServices={connectedServices}
                locked={checking}
                onChange={(s) => {
                  setService(s);
                  setJustConnected(false);
                }}
              />
              <KeyEntry
                service={service}
                replacing={connectedServices.includes(service)}
                onDone={() => {
                  setAdding(false);
                  setJustConnected(true);
                }}
                onCancel={connected.length > 0 ? () => setAdding(false) : null}
                onCheckingChange={setChecking}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setJustConnected(false);
              }}
              className="mt-3 inline-flex items-center gap-1 rounded-lg border border-sp-border bg-sp-bg px-3 py-1.5 text-sm text-sp-text hover:bg-sp-surface"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                add
              </span>
              다른 키 추가 · 키 바꾸기
            </button>
          )}

          {connected.length > 0 && <PrivacyNotice />}
        </>
      )}
    </section>
  );
}
