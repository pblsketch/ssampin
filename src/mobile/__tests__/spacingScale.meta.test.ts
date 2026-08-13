/**
 * 메타 테스트 — 모바일 화면의 간격이 정해진 격자 안에 있는지 검사한다.
 *
 * 왜 필요한가 — 제품 오너에게서 "카드 간 간격이 잘 안 맞는 것 같다"는 지적을 받았다.
 * 재어 보니 한 화면에 8·12·16px 이 섞여 있었고, 화면끼리도 달랐다(홈은 섹션 16/카드 12,
 * 더보기는 섹션 20/카드 8). 값 하나하나는 틀리지 않았지만 **기준이 없어서** 새 화면을
 * 만들 때마다 그때그때 골랐고, 그게 쌓여 "안 맞아 보이는" 화면이 됐다.
 *
 * 격자를 코드로 잠가 두면 다음 화면은 고를 필요 없이 이 표에서 꺼내 쓰면 된다.
 *
 * ── 간격 격자 ────────────────────────────────────────────────────────────
 *  2px (0.5) 아이콘 위/아래 아주 작은 라벨 (하단 탭바처럼 세로로 겹치는 쌍)
 *  4px (1)   한 줄 안에서 붙어야 하는 글자 묶음
 *  6px (1.5) 아이콘 ↔ 바로 옆 라벨 (가로 인라인 쌍 전용)
 *  8px (2)   한 덩어리 안의 요소들
 * 12px (3)   카드·항목 사이          ← "카드끼리"는 항상 이것
 * 16px (4)   섹션 사이               ← "묶음끼리"는 항상 이것
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 세로 스택(space-y-*)에는 6px 단계를 두지 않는다. 6px 은 아이콘 옆 라벨용이고,
 * 세로로 쌓이는 것들은 4 → 8 → 12 → 16 으로 충분히 구분된다.
 *
 * 새 값이 필요하다고 느끼면 대개는 격자가 부족한 게 아니라 구조가 어긋난 것이다.
 * 그래도 필요하면 이 목록을 먼저 늘리고 이유를 여기 적을 것.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');

/** 가로 간격으로 허용하는 Tailwind 키. */
const ALLOWED_GAP = new Set(['0.5', '1', '1.5', '2', '3', '4']);
/** 세로 스택으로 허용하는 Tailwind 키 (1.5 없음 — 위 주석 참고). */
const ALLOWED_SPACE_Y = new Set(['0.5', '1', '2', '3', '4']);

const GAP_RE = /\bgap-(\d+(?:\.\d+)?)\b/g;
const SPACE_Y_RE = /\bspace-y-(\d+(?:\.\d+)?)\b/g;

function collect(source: string, re: RegExp): string[] {
  return [...source.matchAll(re)].map((m) => m[1]!);
}

const FILES = globSync('src/mobile/**/*.tsx', { cwd: ROOT }).filter((f) => !f.includes('.test.'));

describe('간격 격자 (meta)', () => {
  it('검사할 화면 파일을 실제로 찾았다 (빈 통과 방지)', () => {
    // 글롭이 빗나가면 아래 두 검사가 "0건 검사하고 통과"가 된다.
    expect(FILES.length).toBeGreaterThan(50);
  });

  it('가로 간격(gap-*)이 전부 격자 안에 있다', () => {
    const offGrid: string[] = [];
    for (const rel of FILES) {
      const source = readFileSync(resolve(ROOT, rel), 'utf8');
      for (const v of collect(source, GAP_RE)) {
        if (!ALLOWED_GAP.has(v)) offGrid.push(`${rel} → gap-${v}`);
      }
    }
    expect(
      offGrid,
      `격자 밖 가로 간격입니다. 허용: gap-${[...ALLOWED_GAP].join(' / gap-')}\n` +
        `가장 가까운 값으로 맞추거나, 정말 새 단계가 필요하면 이 테스트의 표를 먼저 고치세요.\n` +
        offGrid.join('\n'),
    ).toEqual([]);
  });

  it('세로 스택(space-y-*)이 전부 격자 안에 있다', () => {
    const offGrid: string[] = [];
    for (const rel of FILES) {
      const source = readFileSync(resolve(ROOT, rel), 'utf8');
      for (const v of collect(source, SPACE_Y_RE)) {
        if (!ALLOWED_SPACE_Y.has(v)) offGrid.push(`${rel} → space-y-${v}`);
      }
    }
    expect(
      offGrid,
      `격자 밖 세로 간격입니다. 허용: space-y-${[...ALLOWED_SPACE_Y].join(' / space-y-')}\n` +
        `특히 space-y-5(20px)는 섹션 간격이므로 space-y-4(16px)로, ` +
        `space-y-2.5(10px)는 space-y-2(8px)로 맞춥니다.\n` +
        offGrid.join('\n'),
    ).toEqual([]);
  });

  /**
   * 카드끼리는 12px 이라는 규칙의 대표 지점을 못 박는다.
   * 홈의 "오늘 남은 일"이 혼자 8px 이어서 지적을 받은 자리다.
   */
  it('홈 "오늘 남은 일"과 더보기 메뉴는 카드 간 12px 을 쓴다', () => {
    const todayRemaining = readFileSync(
      resolve(ROOT, 'src/mobile/components/Today/TodayRemaining.tsx'),
      'utf8',
    );
    expect(todayRemaining, '홈 "오늘 남은 일" 카드 사이는 12px(space-y-3)').toMatch(
      /<div className="space-y-3">/,
    );

    const morePage = readFileSync(resolve(ROOT, 'src/mobile/pages/MorePage.tsx'), 'utf8');
    expect(morePage, '더보기 도구 타일 사이는 12px(gap-3)').toMatch(/grid-cols-4 gap-3/);
    expect(morePage, '더보기 섹션 사이는 16px(space-y-4)').toMatch(/space-y-4/);
  });
});
