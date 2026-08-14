/**
 * 앱 뒤에 깔리는 배경 레이어.
 *
 * 유리는 **뒤에 비칠 것이 있어야** 성립한다. 이 레이어가 그 역할을 한다.
 *
 * 배경(2026-08-14) — 시안을 만들며 배운 두 가지가 이 구현을 결정했다.
 *
 * 1. **매끈한 그라데이션은 아무리 흐려도 티가 안 난다.** 흐림은 경계를 뭉개는 처리라
 *    뭉갤 경계가 없으면 결과가 원본과 같다. 그래서 색 덩어리와 미세한 결(grain)을
 *    일부러 넣는다.
 * 2. **밝기를 통제하지 않으면 글자가 죽는다.** 배경 위에 테마 배경색을 옅게 덮어
 *    (scrim) 최소 대비를 확보한다. 이게 없으면 사용자가 밝은 사진을 골랐을 때
 *    "배경에 묻혀 글자가 안 보이는" 문제가 그대로 재발한다.
 *
 * 색은 테마 토큰에서 파생한다. 어떤 테마를 쓰든 그 테마의 색으로 배경이 만들어지므로
 * 따로 이미지를 담아둘 필요가 없고, 용량도 늘지 않는다.
 */
import { useEffect, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

/** 흐림이 실제로 뭉갤 미세한 결. 이것이 없으면 흐림 설정이 눈에 보이지 않는다. */
const GRAIN_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E";

export function AppBackdrop() {
  const backdrop = useSettingsStore((s) => s.settings.widget?.backdrop);
  const wantsOs = backdrop === 'os';
  const active = backdrop === 'generated' || wantsOs;

  /**
   * OS 재질이 실제로 걸렸는가. `null` 은 아직 확인 전.
   *
   * 윈도우 11 22H2 미만·윈도우 10·macOS·브라우저에서는 걸리지 않는다. 그때는 앱이 만드는
   * 배경으로 되돌아간다 — "켰는데 아무 변화가 없다"를 막기 위해서다.
   */
  const [osApplied, setOsApplied] = useState<boolean | null>(null);

  useEffect(() => {
    const api = window.electronAPI?.setBackdropMaterial;
    if (!api) {
      setOsApplied(false);
      return;
    }
    let cancelled = false;
    void api(wantsOs)
      .then((r) => {
        if (!cancelled) setOsApplied(r.ok);
      })
      .catch(() => {
        if (!cancelled) setOsApplied(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wantsOs]);

  useEffect(() => {
    // 앱 껍데기의 배경색을 비워야 뒤가 보인다. 앱이 만든 배경이든 OS 재질이든 같다.
    document.documentElement.classList.toggle('sp-backdrop-on', active);
    return () => document.documentElement.classList.remove('sp-backdrop-on');
  }, [active]);

  // OS 재질이 걸렸으면 앱이 배경을 그리지 않는다. 두 겹을 깔면 OS 가 만든 유리가 가려진다.
  if (!active) return null;
  if (wantsOs && osApplied !== false) return null;

  return (
    <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none">
      {/*
        색 덩어리 + 결. 테마의 강조색·포인트색에서 파생하므로 테마를 바꾸면 배경도 따라간다.
        `color-mix` 를 쓰는 이유는 sp-* 토큰에 Tailwind 투명도 수식이 듣지 않기 때문이다
        (2,950곳이 같은 함정에 걸려 있다 — 계획서 ① 참조).
      */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: 'var(--sp-bg)',
          backgroundImage: [
            'radial-gradient(60rem 45rem at 12% 22%, color-mix(in srgb, var(--sp-accent) 45%, transparent), transparent 70%)',
            'radial-gradient(45rem 38rem at 85% 30%, color-mix(in srgb, var(--sp-highlight) 40%, transparent), transparent 68%)',
            'radial-gradient(52rem 40rem at 68% 88%, color-mix(in srgb, var(--sp-accent) 32%, transparent), transparent 66%)',
            `url("${GRAIN_SVG}")`,
          ].join(', '),
          backgroundSize: 'auto, auto, auto, 220px 220px',
          backgroundRepeat: 'no-repeat, no-repeat, no-repeat, repeat',
        }}
      />
      {/*
        가독성 덮개. 테마 배경색을 옅게 덮어 배경이 아무리 화려해도 글자가 살아남게 한다.
        시안에서 45% 를 씌웠더니 배경이 통째로 뭉개져 유리로 보이지 않았다 — 28% 가
        "비치기는 하되 글자는 안전한" 지점이었다.
      */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'color-mix(in srgb, var(--sp-bg) 28%, transparent)' }}
      />
    </div>
  );
}
