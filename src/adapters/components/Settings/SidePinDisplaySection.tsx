import { useCallback, useEffect, useState } from 'react';
import { useToastStore } from '@adapters/components/common/Toast';

/**
 * 옆핀을 어느 모니터에 띄울지 고르는 설정.
 *
 * ## 왜 다른 설정과 저장 방식이 다른가
 *
 * 이 값은 **동기화하지 않는다.** 학교 컴퓨터와 집 노트북은 모니터 구성이 다르므로,
 * 동기화되는 설정 저장소에 넣으면 서로의 값을 계속 덮어쓴다. 그래서 `draft`/`patch`를
 * 받지 않고 electron 쪽 기기 전용 파일과 직접 주고받는다(`side-pin-device-state.json`).
 *
 * 다른 설정과 동작이 다르므로 화면에도 그 사실을 한 줄 적는다.
 *
 * ## 언제 안 보이는가
 *
 * - 브라우저 모드(`npm run dev`) — electron 통로가 없다
 * - 옛 preload 위에서 도는 중 — `listDisplays`가 아직 없다
 * - 모니터가 한 대뿐 — 고를 것이 없는 설정은 잡음이다
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

  useEffect(() => {
    void load();
  }, [load]);

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

  // 고를 것이 없으면 자리를 차지하지 않는다.
  if (!loaded || choices.length < 2) return null;

  return (
    <div className="space-y-1.5 pt-4 border-t border-sp-border">
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
    </div>
  );
}
