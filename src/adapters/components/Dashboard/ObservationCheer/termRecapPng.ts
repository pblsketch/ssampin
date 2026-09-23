/**
 * 관찰 기록 응원 2·3차(ADR-137, 설계 §10) — 학기 돌아보기 그림 한 장(PNG).
 *
 * ★그림에 넣는 글자는 **다섯 가지뿐**이다: 학기 이름 · "기록한 주 N주" · "한 바퀴 N번"(모든 카드 합계,
 *   0이면 이 줄을 그리지 않는다 — "0"이 실패로 읽히지 않게) · 숫자 한 줄("수업 N차시 · 끝낸 할 일 N개 ·
 *   상담 N건", 돌아보기 spec 3-4 — ADR-137 결정 9를 바꿈) · 구석의 "쌤핀".
 *   반 이름·반별 숫자·학교·선생님 이름·학생에 관한 어떤 것도 넣지 않는다 — 선생님이 교사 커뮤니티에 올릴 수
 *   있는 한 장이라서다. 시험이 그리는 글자를 고정한다.
 * ★숫자 줄의 거르기(학기 중간부터 센 할 일 빼기·가져오지 못한 상담 빼기·0 빼기)는 이 파일 안에서 한다 —
 *   부르는 쪽이 걸러서 넘길 것이라 믿지 않는다.
 * ★새 외부 패키지 없이 `<canvas>` 로 그린다. 색은 저장하는 순간의 테마 값을 읽는다.
 */
import type { GrassWeek } from '@adapters/hooks/observationRecap';
import { grassLevel } from '@domain/rules/observationStreak';
import { pngWorkCountItems, workCountLine, type WorkCounts } from '@domain/rules/recapWorkCounts';

export interface TermRecapImageInput {
  /** '2026학년도 2학기' */
  readonly termLabel: string;
  readonly recordedWeeks: number;
  readonly lapTotal: number;
  readonly weeks: readonly GrassWeek[];
  /**
   * 관찰 밖 숫자(창의 숫자 줄과 같은 값). 상담은 가져오기에 성공했을 때만 숫자이고 그 밖에는 null.
   * `partialTodoTerm` 이면 끝낸 할 일을 그림에서 뺀다(안내 없이 퍼지는 그림이라서). 없으면 숫자 줄 없음.
   */
  readonly work?: {
    readonly counts: WorkCounts;
    readonly partialTodoTerm: boolean;
  } | null;
}

/**
 * 그림에 그리는 글자 — 학기 이름·기록한 주·한 바퀴 합계(0이면 null)·숫자 줄(없으면 null)·쌤핀.
 * 이 밖의 글자는 그리지 않는다.
 */
export function termRecapImageLines(input: TermRecapImageInput): {
  readonly term: string;
  readonly weeks: string;
  readonly laps: string | null;
  readonly work: string | null;
  readonly mark: string;
} {
  const work =
    input.work === null || input.work === undefined
      ? null
      : workCountLine(pngWorkCountItems(input.work.counts, input.work.partialTodoTerm));
  return {
    term: input.termLabel,
    weeks: `기록한 주 ${input.recordedWeeks}주`,
    laps: input.lapTotal > 0 ? `한 바퀴 ${input.lapTotal}번` : null,
    work,
    mark: '쌤핀',
  };
}

/** 그림에 그리는 글자 전부(그리는 순서). */
export function termRecapImageTexts(input: TermRecapImageInput): readonly string[] {
  const l = termRecapImageLines(input);
  return [l.term, l.weeks, l.laps, l.work, l.mark].filter((t): t is string => t !== null);
}

/** 기본 파일 이름(조정 가능) — '쌤핀_2026학년도2학기_잔디.png' */
export function termRecapFileName(termLabel: string): string {
  return `쌤핀_${termLabel.replace(/\s+/g, '')}_잔디.png`;
}

const WIDTH = 1080;
const HEIGHT = 1350;
const CELL = 22;
const GAP = 5;
const LEVEL_ALPHA: Record<1 | 2 | 3, number> = { 1: 0.3, 2: 0.7, 3: 1 };

interface Palette {
  readonly bg: string;
  readonly text: string;
  readonly muted: string;
  readonly accent: string;
  readonly border: string;
  readonly font: string;
}

function readPalette(): Palette {
  const read = (name: string, fallback: string): string => {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v.length > 0 ? v : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    bg: read('--sp-bg', '#ffffff'),
    text: read('--sp-text', '#1e293b'),
    muted: read('--sp-muted', '#64748b'),
    accent: read('--sp-accent', '#3b82f6'),
    border: read('--sp-border', '#cbd5e1'),
    font: read('--sp-font-family', "'Noto Sans KR', sans-serif"),
  };
}

/**
 * 그림을 그려 PNG 로 만든다.
 * @param createCanvas 시험에서 가짜 캔버스를 넣는 자리(기본: 문서의 canvas)
 */
export async function renderTermRecapPng(
  input: TermRecapImageInput,
  createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas'),
): Promise<Blob> {
  const {
    term: termText,
    weeks: weeksText,
    laps: lapsText,
    work: workText,
    mark: markText,
  } = termRecapImageLines(input);
  const p = readPalette();
  const canvas = createCanvas();
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('그림을 만들 수 없어요');

  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 학기 잔디 — 5행(월~금) × 주. 가로가 넘치면 칸을 줄인다.
  const cols = Math.max(1, input.weeks.length);
  const maxGridWidth = WIDTH - 160;
  const cell = Math.min(CELL, Math.floor((maxGridWidth - GAP * (cols - 1)) / cols));
  const gridWidth = cols * cell + (cols - 1) * GAP;
  const gridHeight = 5 * cell + 4 * GAP;
  // 제목(위 96px)~마지막 줄 덩어리를 세로 가운데에 둔다. 줄 위치는 잔디 아래에서 잰다.
  const lapsY = 190;
  const lastBigY = lapsText !== null ? lapsY : 110;
  const workY = lastBigY + 80;
  const blockHeight = 96 + gridHeight + (workText !== null ? workY : lastBigY);
  const blockTop = Math.round((HEIGHT - blockHeight) / 2);

  ctx.textAlign = 'center';
  ctx.fillStyle = p.text;
  ctx.font = `bold 40px ${p.font}`;
  ctx.fillText(termText, WIDTH / 2, blockTop);

  const left = (WIDTH - gridWidth) / 2;
  const top = blockTop + 96;
  input.weeks.forEach((w, x) => {
    w.days.forEach((d, y) => {
      if (!d.inTerm) return;
      const cx = left + x * (cell + GAP);
      const cy = top + y * (cell + GAP);
      const level = d.future ? 0 : grassLevel(d.count);
      if (level === 0) {
        ctx.globalAlpha = d.future ? 0.4 : 1;
        ctx.strokeStyle = p.border;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx + 1, cy + 1, cell - 2, cell - 2);
      } else {
        ctx.globalAlpha = LEVEL_ALPHA[level];
        ctx.fillStyle = p.accent;
        ctx.fillRect(cx, cy, cell, cell);
      }
      ctx.globalAlpha = 1;
    });
  });
  const gridBottom = top + gridHeight;

  ctx.fillStyle = p.text;
  ctx.font = `bold 48px ${p.font}`;
  ctx.fillText(weeksText, WIDTH / 2, gridBottom + 110);
  if (lapsText !== null) ctx.fillText(lapsText, WIDTH / 2, gridBottom + lapsY);
  // 숫자 줄 — 위 두 숫자보다 한 단 작게(곁줄). 넘치면 좁혀 그린다.
  if (workText !== null) {
    ctx.font = `bold 36px ${p.font}`;
    ctx.fillText(workText, WIDTH / 2, gridBottom + workY, WIDTH - 160);
  }

  ctx.font = `22px ${p.font}`;
  ctx.fillStyle = p.muted;
  ctx.textAlign = 'right';
  ctx.fillText(markText, WIDTH - 80, HEIGHT - 60);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG 생성 실패'))),
      'image/png',
    );
  });
}

/**
 * 저장 — 쌤핀 앱에서는 저장 위치를 묻고, 브라우저에서는 내려받기로 저장한다(기존 내보내기와 같은 길).
 * @returns 저장했으면 true(취소하면 false)
 */
export async function saveTermRecapPng(
  input: TermRecapImageInput,
  notify: (message: string, onOpen?: () => void) => void,
): Promise<boolean> {
  const blob = await renderTermRecapPng(input);
  const filename = termRecapFileName(input.termLabel);
  const api = window.electronAPI;
  if (api) {
    const saved = await api.showSaveDialog({
      title: '학기 돌아보기 그림 저장',
      defaultPath: filename,
      filters: [{ name: 'PNG 이미지', extensions: ['png'] }],
    });
    if (!saved) return false;
    await api.writeFile(saved.handle, await blob.arrayBuffer());
    notify('그림을 저장했어요', () => void api.openFile(saved.handle));
    return true;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  notify('그림을 저장했어요');
  return true;
}
