import { useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { ONECLICK_PORTAL_TASKS } from '@adapters/constants/oneclickPortalTasks';

/** 원클릭업무포털 공식 배포처. 설치 파일은 저작자 채널로만 배포한다(쌤핀이 대신 받아주지 않는다). */
export const ONECLICK_PORTAL_SITE = 'https://원클릭업무포털.com';

export type OneClickPortalModalMode = 'first-run' | 'not-installed' | 'task-picker';

interface OneClickPortalLaunchModalProps {
  readonly open: boolean;
  /**
   * 'task-picker'  = 설치돼 있고 업무 바로 열기를 쓸 수 있음 (v0.1.15 이상)
   * 'first-run'    = 설치돼 있으나 업무 바로 열기를 모르는 구버전 · 첫 실행
   * 'not-installed'= 아직 설치 전
   */
  readonly mode: OneClickPortalModalMode;
  /** 첫 실행 고지(외부 프로그램·시작 프로그램 등록)를 함께 보일지 */
  readonly showNotice?: boolean;
  readonly onClose: () => void;
  /** 실행하기 — `skipNextTime` 이 true 면 다음부터 이 안내를 건너뛴다 */
  readonly onLaunch: (skipNextTime: boolean) => void;
  /** 업무 고르기에서 하나를 골랐다. 인자가 없으면 '프로그램만 열기'. */
  readonly onSelectTask?: (task?: string) => void;
  /** 설치하러 가기 — 공식 배포처를 기본 브라우저로 연다 */
  readonly onOpenSite: () => void;
}

/**
 * 원클릭업무포털 실행 안내 모달.
 *
 * 이 모달이 있는 이유는 두 가지를 반드시 알려야 하기 때문이다.
 *  1. **쌤핀이 만든 기능이 아니라는 것.** 밝히지 않으면 문제가 생겼을 때 쌤핀으로 문의가 오고,
 *     반대로 좋으면 만든 분이 아니라 쌤핀이 칭찬받는다. 둘 다 잘못된 상황이다.
 *  2. **처음 실행하면 그 프로그램이 스스로 윈도우 시작 프로그램에 등록한다는 것.**
 *     쌤핀 카드를 눌러 처음 켜진 경우, 선생님은 "쌤핀에서 뭘 눌렀더니 부팅 때 뭐가 뜬다"고 느낀다.
 *     (근거: docs/03-analysis/oneclick-portal/integration-surface.analysis.md §4.5)
 *
 * 다만 이 도구의 존재 이유가 "클릭 줄이기"라서 매번 띄우면 본말이 전도된다.
 * 그래서 '다음부터 바로 실행' 체크박스로 **첫 회만** 보이게 한다.
 *
 * 체크박스를 쓴 이유 — '다시 보지 않기'를 버튼으로 두면 '실행하기'와 나란히 놓였을 때
 * 어느 쪽이 실행인지 헷갈린다. 체크박스는 선택과 실행을 분리해 그 혼동이 없다.
 */
export function OneClickPortalLaunchModal({
  open,
  mode,
  showNotice = false,
  onClose,
  onLaunch,
  onSelectTask,
  onOpenSite,
}: OneClickPortalLaunchModalProps) {
  const [skipNextTime, setSkipNextTime] = useState(false);
  const isFirstRun = mode === 'first-run';

  // 업무 고르기는 안내가 아니라 선택 화면이라 위 두 모드와 짜임새가 다르다.
  // 한 덩어리에 세 갈래를 섞으면 읽기 어려워져 따로 그린다.
  if (mode === 'task-picker') {
    return (
      <OneClickPortalTaskPicker
        open={open}
        showNotice={showNotice}
        onClose={onClose}
        onSelectTask={onSelectTask}
      />
    );
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={isFirstRun ? '원클릭업무포털 실행' : '원클릭업무포털 설치 안내'}
      srOnlyTitle
      size="sm"
    >
      <div className="p-6">
        <div className="flex items-start gap-3">
          <div
            className="flex-shrink-0 w-10 h-10 rounded-lg bg-sp-accent/10 flex items-center justify-center text-2xl"
            aria-hidden="true"
          >
            🏫
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-sp-text">
              {isFirstRun ? '원클릭업무포털을 실행합니다' : '아직 설치되지 않았어요'}
            </h2>
            <p className="mt-1 text-sm text-sp-muted">쌤핀이 만든 기능이 아닙니다</p>
          </div>
        </div>

        <p className="mt-4 text-sm text-sp-text leading-relaxed">
          {isFirstRun
            ? '업무포털에 로그인한 뒤 복무·출장·기안·품의 화면까지 가는 클릭을 줄여 주는 프로그램입니다. 청완초등학교 온영범 선생님이 만드셨고, 쌤핀은 실행만 도와드립니다.'
            : '원클릭업무포털은 청완초등학교 온영범 선생님이 만드신 무료 프로그램입니다. 공식 홈페이지에서 받으실 수 있어요.'}
        </p>

        {isFirstRun ? (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-sp-highlight/10">
            <span
              className="material-symbols-outlined text-sp-highlight text-icon shrink-0"
              aria-hidden="true"
            >
              info
            </span>
            <p className="text-sm text-sp-text leading-relaxed">
              이 프로그램은 처음 실행할 때 윈도우 시작 프로그램에 스스로 등록됩니다. 원하지 않으시면
              프로그램 설정에서 끄실 수 있어요.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-sp-muted leading-relaxed">
            설치한 뒤 이 카드를 다시 누르면 바로 실행됩니다.
          </p>
        )}

        {isFirstRun && (
          <label className="mt-4 flex items-center gap-2 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={skipNextTime}
              onChange={(e) => setSkipNextTime(e.target.checked)}
              className="accent-sp-accent"
            />
            <span className="text-sm text-sp-text">다음부터 바로 실행</span>
          </label>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-sp-border text-sp-text hover:bg-sp-text/5 transition-colors"
          >
            {isFirstRun ? '취소' : '닫기'}
          </button>
          {isFirstRun ? (
            <button
              type="button"
              onClick={() => onLaunch(skipNextTime)}
              className="px-4 py-2 text-sm rounded-lg bg-sp-accent text-sp-accent-fg hover:opacity-90 transition-opacity"
            >
              실행하기
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenSite}
              className="px-4 py-2 text-sm rounded-lg bg-sp-accent text-sp-accent-fg hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
            >
              설치하러 가기
              <span className="material-symbols-outlined text-icon-sm" aria-hidden="true">
                open_in_new
              </span>
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

interface OneClickPortalTaskPickerProps {
  readonly open: boolean;
  readonly showNotice: boolean;
  readonly onClose: () => void;
  readonly onSelectTask?: (task?: string) => void;
}

/**
 * 업무 고르기 — 원클릭업무포털 v0.1.15 부터 쓸 수 있다.
 *
 * 쌤도구 카드를 6장으로 늘리지 않고 이 모달을 둔 이유: 쌤도구에는 이미 도구가 29개라
 * 한 프로그램이 카드 6장을 차지하면 목록이 그 프로그램으로 뒤덮인다.
 *
 * '프로그램만 열기'를 남겨 둔 이유: 여기 없는 화면(설정·교육청 변경 등)을 쓰시려는 분에게는
 * 업무를 고르는 것이 오히려 걸림돌이 된다.
 *
 * 고지는 첫 회에만 붙인다(`showNotice`). 이 도구의 목적이 클릭 줄이기라 매번 읽히면
 * 본말이 전도되지만, 남이 만든 프로그램이라는 사실과 시작 프로그램 등록은 반드시 한 번은
 * 알려야 한다. (근거: docs/03-analysis/oneclick-portal/integration-surface.analysis.md §4.5)
 */
function OneClickPortalTaskPicker({
  open,
  showNotice,
  onClose,
  onSelectTask,
}: OneClickPortalTaskPickerProps) {
  return (
    <Modal isOpen={open} onClose={onClose} title="원클릭업무포털 업무 선택" srOnlyTitle size="sm">
      <div className="p-6">
        <div className="flex items-start gap-3">
          <div
            className="flex-shrink-0 w-10 h-10 rounded-lg bg-sp-accent/10 flex items-center justify-center text-2xl"
            aria-hidden="true"
          >
            🏫
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-sp-text">어떤 업무를 여시겠어요?</h2>
            <p className="mt-1 text-sm text-sp-muted">
              원클릭업무포털이 그 화면까지 대신 이동합니다
            </p>
          </div>
        </div>

        {showNotice && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-sp-highlight/10">
            <span
              className="material-symbols-outlined text-sp-highlight text-icon shrink-0"
              aria-hidden="true"
            >
              info
            </span>
            <p className="text-sm text-sp-text leading-relaxed">
              쌤핀이 만든 기능이 아니라 청완초등학교 온영범 선생님이 만드신 프로그램입니다. 처음
              실행할 때 윈도우 시작 프로그램에 스스로 등록되며, 원하지 않으시면 그 프로그램 설정에서
              끄실 수 있어요.
            </p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2">
          {ONECLICK_PORTAL_TASKS.map((task) => (
            <button
              key={task.key}
              type="button"
              onClick={() => onSelectTask?.(task.key)}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-sp-border text-sp-text hover:border-sp-accent hover:bg-sp-accent/5 transition-colors"
            >
              <span className="text-2xl" aria-hidden="true">
                {task.icon}
              </span>
              <span className="text-sm font-medium">{task.label}</span>
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs text-sp-muted leading-relaxed">
          업무포털에 아직 로그인하지 않으셨다면 로그인 화면이 먼저 열립니다.
        </p>

        <div className="mt-6 flex justify-between gap-2">
          <button
            type="button"
            onClick={() => onSelectTask?.()}
            className="px-4 py-2 text-sm rounded-lg border border-sp-border text-sp-text hover:bg-sp-text/5 transition-colors"
          >
            프로그램만 열기
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg text-sp-muted hover:bg-sp-text/5 transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </Modal>
  );
}
