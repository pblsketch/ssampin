import type {
  AdvancedAnswer,
  AdvancedPublicQuestion,
  AdvancedQuestion,
  QuadrantPoint,
} from '../entities/multiSurvey/AdvancedQuestion';
import { QUADRANT_MAX_POINTS_LIMIT } from '../entities/multiSurvey/AdvancedQuestion';

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * 가치수직선 응답이 담는 칸 이름 — 항목마다 하나.
 * 두 기준으로 재는 일은 2×2 매트릭스(`quadrant`)가 맡는다.
 */
export function valuelineKeys(q: AdvancedPublicQuestion | AdvancedQuestion): string[] {
  return q.settings.items.map((item) => `${item.id}:x`);
}

/**
 * 2×2 매트릭스에서 점이 어느 칸에 있는지.
 * 좌표는 **왼쪽 위가 (0,0)** 이다(이미지 위치 표시와 같은 규칙) — 위쪽 끝이 `yMaxLabel`.
 * 돌려주는 번호는 읽는 순서 [0 왼쪽 위, 1 오른쪽 위, 2 왼쪽 아래, 3 오른쪽 아래].
 */
export function quadrantIndexOf(point: { readonly x: number; readonly y: number }): number {
  return (point.y < 0.5 ? 0 : 2) + (point.x < 0.5 ? 0 : 1);
}

/** 학생 한 명이 놓을 수 있는 점 개수. 설정이 없으면 하나. */
export function quadrantMaxPoints(q: AdvancedPublicQuestion | AdvancedQuestion): number {
  const raw = q.settings.maxPoints ?? 1;
  if (!Number.isInteger(raw)) return 1;
  return Math.min(QUADRANT_MAX_POINTS_LIMIT, Math.max(1, raw));
}

/** 칸 이름 네 개. 적지 않았으면 빈 문자열이 온다. */
export function quadrantLabels(q: AdvancedPublicQuestion | AdvancedQuestion): readonly string[] {
  const labels = q.settings.quadrantLabels ?? [];
  return [0, 1, 2, 3].map((i) => labels[i] ?? '');
}

export function validateAdvancedQuestion(q: AdvancedQuestion): string[] {
  const s = q.settings;
  const errors: string[] = [];
  if (!s) return ['문항 설정이 없습니다.'];
  if (['order', 'ranking', 'allocation', 'matrix', 'rating'].includes(q.type)) {
    if (
      s.items.length < 2 ||
      s.items.length > 12 ||
      s.items.some((i) => !i.text.trim()) ||
      new Set(s.items.map((i) => i.id)).size !== s.items.length
    )
      errors.push('서로 다른 항목을 2~12개 입력해 주세요.');
  }
  // 가치수직선은 항목 하나(질문 자체를 재는 경우)부터 허용한다.
  // 항목이 둘 이상일 때만 각 항목의 이름을 요구한다.
  if (q.type === 'valueline') {
    if (
      s.items.length < 1 ||
      s.items.length > 12 ||
      new Set(s.items.map((i) => i.id)).size !== s.items.length ||
      (s.items.length > 1 && s.items.some((i) => !i.text.trim()))
    )
      errors.push('서로 다른 항목을 1~12개 입력하고, 두 개 이상이면 이름을 적어 주세요.');
    if (!(s.xMaxLabel ?? '').trim() || !(s.xMinLabel ?? '').trim())
      errors.push('가치수직선 양 끝의 이름을 적어 주세요.');
  }
  if (q.type === 'quadrant') {
    const ends = [s.xMinLabel, s.xMaxLabel, s.yMinLabel, s.yMaxLabel];
    if (ends.some((label) => !(label ?? '').trim()))
      errors.push('가로와 세로 양 끝의 이름을 모두 적어 주세요.');
    if (
      !Number.isInteger(s.maxPoints ?? 1) ||
      (s.maxPoints ?? 1) < 1 ||
      (s.maxPoints ?? 1) > QUADRANT_MAX_POINTS_LIMIT
    )
      errors.push(`놓을 수 있는 점은 1~${QUADRANT_MAX_POINTS_LIMIT}개입니다.`);
    if (s.quadrantLabels && s.quadrantLabels.length !== 4)
      errors.push('칸 이름은 네 개를 모두 두거나 비워 두세요.');
  }
  if (
    ['numeric', 'matrix', 'rating', 'valueline'].includes(q.type) &&
    (!finite(s.min) || !finite(s.max) || s.min >= s.max || !finite(s.step) || s.step <= 0)
  )
    errors.push('최솟값·최댓값·간격을 확인해 주세요.');
  if (q.type === 'allocation' && (!Number.isSafeInteger(s.total) || s.total < 1 || s.total > 10000))
    errors.push('배분할 총점은 1~10000의 정수여야 합니다.');
  if (q.type === 'pin' && !isSafeQuestionImage(s.imageUrl)) errors.push('이미지를 등록해 주세요.');
  if (
    q.type === 'brainstorm' &&
    (!Number.isInteger(s.maxIdeas) || s.maxIdeas < 1 || s.maxIdeas > 5)
  )
    errors.push('아이디어는 1~5개까지 받을 수 있어요.');
  if (q.solution) {
    if (
      q.type === 'order' &&
      (!q.solution.order ||
        !isPermutation(
          q.solution.order,
          s.items.map((i) => i.id),
        ))
    )
      errors.push('정답 순서를 확인해 주세요.');
    else if (
      q.type === 'numeric' &&
      (!finite(q.solution.number) ||
        q.solution.number < s.min ||
        q.solution.number > s.max ||
        !finite(q.solution.tolerance) ||
        q.solution.tolerance < 0)
    )
      errors.push('정답 수치와 허용 오차를 확인해 주세요.');
    else if (q.type === 'pin') {
      const r = q.solution.region;
      if (
        !r ||
        ![r.x, r.y, r.width, r.height].every(finite) ||
        r.x < 0 ||
        r.y < 0 ||
        r.width <= 0 ||
        r.height <= 0 ||
        r.x + r.width > 1 ||
        r.y + r.height > 1
      )
        errors.push('정답 영역을 이미지 안에 지정해 주세요.');
    } else if (!['order', 'numeric'].includes(q.type))
      errors.push('이 유형은 정답을 설정하지 않습니다.');
  }
  return errors;
}

export function isSafeQuestionImage(url: string): boolean {
  return (
    /^https:\/\//i.test(url) || /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(url)
  );
}

function isPermutation(value: readonly unknown[], ids: readonly string[]): boolean {
  return (
    value.length === ids.length &&
    new Set(value).size === ids.length &&
    value.every((id) => typeof id === 'string' && ids.includes(id))
  );
}

export function parseAdvancedAnswer(
  q: AdvancedPublicQuestion,
  raw: unknown,
): AdvancedAnswer | null {
  if (typeof raw !== 'string' || raw.length > 16000) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  const s = q.settings;
  const ids = s.items.map((i) => i.id);
  switch (q.type) {
    case 'order':
    case 'ranking':
      return Array.isArray(v) && isPermutation(v, ids) ? (v as string[]) : null;
    case 'numeric':
      return finite(v) && v >= s.min && v <= s.max ? v : null;
    case 'brainstorm':
      return Array.isArray(v) &&
        v.length > 0 &&
        v.length <= s.maxIdeas &&
        v.every((x) => typeof x === 'string' && x.trim().length > 0 && x.length <= 200)
        ? v.map((x: string) => x.trim())
        : null;
    case 'quadrant': {
      const max = quadrantMaxPoints(q);
      if (!Array.isArray(v) || v.length < 1 || v.length > max) return null;
      const points: QuadrantPoint[] = [];
      for (const item of v) {
        if (!object(item)) return null;
        if (Object.keys(item).some((key) => !['x', 'y', 'text'].includes(key))) return null;
        if (!finite(item.x) || !finite(item.y)) return null;
        if (item.x < 0 || item.x > 1 || item.y < 0 || item.y > 1) return null;
        if (s.collectPointText) {
          if (typeof item.text !== 'string') return null;
          const text = item.text.trim();
          if (!text || text.length > 100) return null;
          points.push({ x: item.x, y: item.y, text });
        } else {
          if (item.text !== undefined) return null;
          points.push({ x: item.x, y: item.y });
        }
      }
      return points;
    }
    case 'pin':
      return object(v) &&
        Object.keys(v).length === 2 &&
        finite(v.x) &&
        finite(v.y) &&
        v.x >= 0 &&
        v.x <= 1 &&
        v.y >= 0 &&
        v.y <= 1
        ? { x: v.x, y: v.y }
        : null;
    default: {
      if (!object(v)) return null;
      const keys =
        q.type === 'matrix'
          ? ids.flatMap((id) => [id + ':x', id + ':y'])
          : q.type === 'valueline'
            ? valuelineKeys(q)
            : ids;
      if (!isPermutation(Object.keys(v), keys)) return null;
      const numbers: Record<string, number> = {};
      for (const key of keys) {
        const n = v[key];
        if (!finite(n)) return null;
        if (
          q.type === 'allocation'
            ? !Number.isSafeInteger(n) || n < 0 || n > s.total
            : n < s.min || n > s.max
        )
          return null;
        numbers[key] = n;
      }
      if (q.type === 'allocation' && Object.values(numbers).reduce((a, b) => a + b, 0) !== s.total)
        return null;
      return numbers;
    }
  }
}

export function advancedCorrect(q: AdvancedQuestion, raw: unknown): boolean | undefined {
  if (!q.solution) return undefined;
  const v = parseAdvancedAnswer(q, raw);
  if (v === null) return false;
  if (q.type === 'order') return JSON.stringify(v) === JSON.stringify(q.solution.order);
  if (q.type === 'numeric')
    return (
      typeof v === 'number' &&
      Math.abs(v - (q.solution.number ?? NaN)) <= (q.solution.tolerance ?? 0) + Number.EPSILON * 8
    );
  if (q.type === 'pin' && object(v) && q.solution.region) {
    const r = q.solution.region;
    return (
      finite(v.x) &&
      finite(v.y) &&
      v.x >= r.x &&
      v.x <= r.x + r.width &&
      v.y >= r.y &&
      v.y <= r.y + r.height
    );
  }
  return undefined;
}

export function advancedAnswerLabel(q: AdvancedPublicQuestion, raw: unknown): string {
  const v = parseAdvancedAnswer(q, raw);
  if (v === null) return '유효하지 않은 응답';
  if (q.type === 'quadrant') {
    const labels = quadrantLabels(q);
    return (v as readonly QuadrantPoint[])
      .map((point) => {
        const where = labels[quadrantIndexOf(point)]?.trim();
        const place =
          where || ['왼쪽 위', '오른쪽 위', '왼쪽 아래', '오른쪽 아래'][quadrantIndexOf(point)];
        return point.text ? `${point.text} (${place})` : place;
      })
      .join(' · ');
  }
  if (Array.isArray(v))
    return v
      .map((id) => q.settings.items.find((i) => i.id === id)?.text ?? id)
      .join(q.type === 'brainstorm' ? ' · ' : ' → ');
  if (typeof v === 'number') return `${v}${q.settings.unit}`;
  const record = v as Readonly<Record<string, number>>;
  if (q.type === 'pin')
    return `가로 ${Math.round(record.x! * 100)}%, 세로 ${Math.round(record.y! * 100)}%`;
  if (q.type === 'valueline') {
    const single = q.settings.items.length === 1;
    return q.settings.items
      .map((i) => `${single && !i.text.trim() ? '' : `${i.text}: `}${record[i.id + ':x']}`)
      .join(' · ');
  }
  return q.settings.items
    .map((i) =>
      q.type === 'matrix'
        ? `${i.text}: ${q.settings.xLabel} ${record[i.id + ':x']}, ${q.settings.yLabel} ${record[i.id + ':y']}`
        : `${i.text}: ${record[i.id]}`,
    )
    .join(' · ');
}
