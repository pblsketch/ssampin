import { useCallback, useEffect, useState } from 'react';
import { useToastStore } from '@adapters/components/common/Toast';
import { Toggle } from './shared/Toggle';

/**
 * 옆핀 관련 기기 전용 설정 두 가지 — 띄울 모니터 고르기, 발표 중 자동 숨기기.
 *
 * ## 왜 다른 설정과 저장 방식이 다른가
 *
 * 이 값들은 **동기화하지 않는다.** 학교 컴퓨터와 집 노트북은 모니터 구성이 다르므로,
 * 동기화되는 설정 저장소에 넣으면 서로의 값을 계속 덮어쓴다. 그래서 `draft`/`patch`를
 * 받지 않고 electron 쪽 기기 전용 파일과 직접 주고받는다(`side-pin-device-state.json`).
 *
 * 다른 설정과 동작이 다르므로 화면에도 그 사실을 한 줄 적는다.
 *
 * ## 언제 안 보이는가
 *
 * - 브라우저 모드(`npm run dev`) — electron 통로가 없다
 * - 옛 preload 위에서 도는 중 — 해당 API가 아직 없다
 * - 모니터 선택은 모니터가 한 대뿐이면 고를 것이 없는 설정이라 잡음이다.
 *   발표 중 자동 숨기기는 모니터가 한 대뿐이어도 쓸모가 있어 계속 보여준다.
 *
 * ## 트레이에도 같은 기능이 있다
 *
 * 트레이 우클릭 → "옆핀 모니터"가 1순위 진입점이다(옆핀이 접혀 있어도 닿는다).
 * 여기는 발견성을 위한 두 번째 자리다.
 */

type Choice = SidePinDisplayChoiceInfo;

export function SidePinDisplaySection() {
  const showToast = useToastStore((s) => s.show);
  const [choices, setChoices] = useState<readonly Choice[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // 발표 중 자동 숨기기 — 기본값은 켜짐이다. 아직 저장된 값을 못 읽어온 사이에도
  // "기본은 켜짐"이 맞으므로 초기값을 true로 둔다.
  const [hideOnPresentation, setHideOnPresentation] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    const listDisplays = window.electronAPI?.sidePin?.listDisplays;
    if (!listDisplays) {
      setLoaded(true);
      return;
    }
    try {
      const result = await listDisplays();
      setChoices(result.displays);
      setSelected(result.selectedDisplayId);
    } catch {
      // 목록을 못 읽으면 아무것도 보여주지 않는다 — 고를 수 없는 목록은 오해만 만든다.
      setChoices([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  const loadHideOnPresentation = useCallback(async (): Promise<void> => {
    const getHideOnPresentation = window.electronAPI?.sidePin?.getHideOnPresentation;
    if (!getHideOnPresentation) return;
    try {
      setHideOnPresentation(await getHideOnPresentation());
    } catch {
      // 못 읽으면 기본값(켜짐)을 그대로 보여준다 — 모니터 선택과 달리 고를 목록이
      // 아니라 켜고 끄는 값이라, 읽기 실패가 곧 "숨김"으로 이어질 이유가 없다.
    }
  }, []);

  useEffect(() => {
    void load();
    void loadHideOnPresentation();
  }, [load, loadHideOnPresentation]);

  const handleSelect = async (displayId: string | null): Promise<void> => {
    const setDisplay = window.electronAPI?.sidePin?.setDisplay;
    if (!setDisplay) return;

    // 먼저 화면에 반영한다 — 라디오가 늦게 따라오면 안 눌린 것처럼 보인다.
    const previous = selected;
    setSelected(displayId);

    try {
      const result = await setDisplay(displayId);
      if (result === 'deferred') {
        // 실패가 아니다. 저장은 끝났고 창만 나중에 옮긴다.
        showToast('메모 작성이 끝나면 옆핀이 그 모니터로 옮겨집니다.', 'info');
        return;
      }
      if (result === 'unknown-display') {
        setSelected(previous);
        showToast('그 모니터를 찾지 못했습니다. 연결 상태를 확인해 주세요.', 'error');
        void load();
        return;
      }
      if (result === 'save-failed') {
        showToast('지금은 옮겼지만 저장하지 못했습니다. 앱을 다시 켜면 되돌아갑니다.', 'error');
      }
    } catch {
      setSelected(previous);
      showToast('옆핀 모니터를 바꾸지 못했습니다.', 'error');
    }
  };

  const handleToggleHideOnPresentation = async (next: boolean): Promise<void> => {
    const setHideOnPresentationApi = window.electronAPI?.sidePin?.setHideOnPresentation;
    if (!setHideOnPresentationApi) return;

    // 먼저 화면에 반영한다 — 토글이 늦게 따라오면 안 눌린 것처럼 보인다.
    setHideOnPresentation(next);

    try {
      const ok = await setHideOnPresentationApi(next);
      if (!ok) {
        setHideOnPresentation(!next);
        showToast('발표 중 자동 숨기기 설정을 저장하지 못했습니다.', 'error');
      }
    } catch {
      setHideOnPresentation(!next);
      showToast('발표 중 자동 숨기기 설정을 저장하지 못했습니다.', 'error');
    }
  };

  // electron 통로가 아예 없거나(브라우저 모드) 옛 preload 위에서 도는 중이면 없는 기능이다.
  const hideOnPresentationSupported =
    typeof window.electronAPI?.sidePin?.getHideOnPresentation === 'function' &&
    typeof window.electronAPI?.sidePin?.setHideOnPresentation === 'function';
  const showMonitorPicker = loaded && choices.length >= 2;

  // 보여줄 것이 하나도 없으면 자리를 차지하지 않는다.
  if (!hideOnPresentationSupported && !showMonitorPicker) return null;

  return (
    <div className="space-y-1.5 pt-4 border-t border-sp-border">
      {hideOnPresentationSupported && (
        <div className="flex items-center justify-between gap-4 px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-sp-text">발표 중 옆핀 자동 숨기기</p>
            <p className="text-xs text-sp-muted mt-1">
              파워포인트 슬라이드쇼처럼 화면을 가득 채운 프로그램이 뜨면 옆핀을 스스로 감춥니다.
              <br />
              모니터가 두 대일 때는 한쪽에서 발표해도 양쪽 옆핀이 함께 숨습니다. 그게 불편하면 이
              기능을 꺼 두세요.
              <br />이 설정은 이 컴퓨터에만 저장됩니다.
            </p>
          </div>
          <Toggle
            checked={hideOnPresentation}
            onChange={(v) => void handleToggleHideOnPresentation(v)}
          />
        </div>
      )}

      {showMonitorPicker && (
        <>
          <span className="text-sm font-medium text-sp-text">옆핀 모니터</span>
          <p className="text-xs text-sp-muted mb-2">
            옆핀을 어느 모니터에 띄울지 선택합니다. 고른 모니터의 오른쪽 가장자리에 붙습니다.
            <br />이 설정은 이 컴퓨터에만 저장됩니다.
          </p>

          <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sp-surface/50 cursor-pointer transition-colors">
            <input
              type="radio"
              name="sidePinDisplay"
              checked={selected === null}
              onChange={() => void handleSelect(null)}
              className="w-3.5 h-3.5 text-sp-accent focus:ring-sp-accent"
            />
            <div>
              <span className="text-xs font-medium text-sp-text">자동</span>
              <p className="text-caption text-sp-muted">주 모니터에 띄웁니다</p>
            </div>
          </label>

          {choices.map((choice) => (
            <label
              key={choice.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sp-surface/50 cursor-pointer transition-colors"
            >
              <input
                type="radio"
                name="sidePinDisplay"
                checked={selected === choice.id}
                onChange={() => void handleSelect(choice.id)}
                className="w-3.5 h-3.5 text-sp-accent focus:ring-sp-accent"
              />
              <div>
                <span className="text-xs font-medium text-sp-text">{choice.name}</span>
                <p className="text-caption text-sp-muted">
                  {choice.isPrimary ? '주 모니터' : choice.position} · {choice.resolution}
                  {choice.scalePercent === 100 ? '' : ` · 배율 ${choice.scalePercent}%`}
                </p>
              </div>
            </label>
          ))}
        </>
      )}
    </div>
  );
}
