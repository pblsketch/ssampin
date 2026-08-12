/**
 * 모바일 화면 주소 모델.
 *
 * 지금까지 화면 전환이 전부 useState 였다. 주소가 없으니 안드로이드 하드웨어
 * 뒤로가기가 "돌아갈 데가 없다"고 판단해 앱을 종료시켰다. 이 모듈은 화면 상태를
 * 문자열 주소와 1:1로 옮기는 순수 함수만 담는다(React·DOM 의존 없음).
 *
 * 설계 원칙
 * - 쌤도구 14종을 App.tsx 의 유니온 리터럴로 나열하지 않는다. `/more/tools/:toolId`
 *   파라미터 하나로 접어서, 도구를 추가·재배치할 때 App.tsx 를 건드리지 않게 한다.
 * - 알 수 없는 주소는 던지지 않고 홈으로 폴백한다. 링크가 낡아도 앱이 죽지 않아야 한다.
 */

export type MobileTab = 'home' | 'students' | 'schedule' | 'more';
export type StudentsSeg = 'homeroom' | 'teaching';
export type ScheduleSeg = 'schedule' | 'todo';
export type AttendanceType = 'homeroom' | 'class';

/** 더보기 하위 중 도구가 아닌 것들. 도구는 toolId 파라미터로 따로 다룬다. */
export type MoreSection = 'settings' | 'memo' | 'bookmarks' | 'tools';

export type MobileRoute =
  | { kind: 'home' }
  | { kind: 'students'; seg: StudentsSeg }
  | { kind: 'schedule'; seg: ScheduleSeg }
  | { kind: 'more' }
  | { kind: 'moreSection'; section: MoreSection }
  | { kind: 'tool'; toolId: string }
  | {
      kind: 'attendance';
      classId: string;
      className: string;
      period: number;
      type: AttendanceType;
    };

export const HOME_ROUTE: MobileRoute = { kind: 'home' };

const MORE_SECTIONS: readonly MoreSection[] = ['settings', 'memo', 'bookmarks', 'tools'];

function isMoreSection(v: string): v is MoreSection {
  return (MORE_SECTIONS as readonly string[]).includes(v);
}

/**
 * 기존 `moreSub` 값('tool-traffic-light')과 주소 조각('traffic-light') 사이 변환.
 * 주소에는 접두사를 넣지 않는다 — `/more/tools/tool-dice` 는 어색하다.
 */
export function toolIdToLegacyKey(toolId: string): string {
  return `tool-${toolId}`;
}

export function legacyKeyToToolId(legacyKey: string): string {
  return legacyKey.startsWith('tool-') ? legacyKey.slice('tool-'.length) : legacyKey;
}

/** 화면 상태 → 주소 문자열. */
export function toPath(route: MobileRoute): string {
  switch (route.kind) {
    case 'home':
      return '/';
    case 'students':
      return `/students/${route.seg}`;
    case 'schedule':
      return route.seg === 'schedule' ? '/schedule' : '/schedule/todo';
    case 'more':
      return '/more';
    case 'moreSection':
      return `/more/${route.section}`;
    case 'tool':
      return `/more/tools/${route.toolId}`;
    case 'attendance': {
      const q = new URLSearchParams({
        classId: route.classId,
        className: route.className,
        period: String(route.period),
        type: route.type,
      });
      return `/attendance?${q.toString()}`;
    }
  }
}

/** 주소 문자열 → 화면 상태. 알 수 없으면 홈. */
export function parsePath(pathWithQuery: string): MobileRoute {
  const [rawPath = '', rawQuery = ''] = pathWithQuery.split('?');
  const segments = rawPath.split('/').filter(Boolean);

  if (segments.length === 0) return HOME_ROUTE;

  const [first, second, third] = segments;

  if (first === 'students') {
    if (second === 'teaching') return { kind: 'students', seg: 'teaching' };
    return { kind: 'students', seg: 'homeroom' };
  }

  if (first === 'schedule') {
    if (second === 'todo') return { kind: 'schedule', seg: 'todo' };
    return { kind: 'schedule', seg: 'schedule' };
  }

  if (first === 'more') {
    if (second === undefined) return { kind: 'more' };
    // /more/tools/<toolId> 는 도구, /more/tools 는 도구 목록
    if (second === 'tools' && third !== undefined) {
      return { kind: 'tool', toolId: third };
    }
    if (isMoreSection(second)) return { kind: 'moreSection', section: second };
    return { kind: 'more' };
  }

  if (first === 'attendance') {
    const q = new URLSearchParams(rawQuery);
    const classId = q.get('classId');
    const className = q.get('className');
    // classId 가 없으면 어느 반인지 알 수 없다. 잘못된 반에 기록이 들어가는 것보다
    // 홈으로 보내는 편이 안전하다.
    if (!classId) return HOME_ROUTE;
    const periodRaw = Number(q.get('period'));
    return {
      kind: 'attendance',
      classId,
      className: className ?? '',
      period: Number.isFinite(periodRaw) ? periodRaw : 0,
      type: q.get('type') === 'homeroom' ? 'homeroom' : 'class',
    };
  }

  return HOME_ROUTE;
}

/** 주소가 속한 하단 탭. 탭 강조 표시에 쓴다. */
export function tabOf(route: MobileRoute): MobileTab {
  switch (route.kind) {
    case 'home':
    case 'attendance':
      return 'home';
    case 'students':
      return 'students';
    case 'schedule':
      return 'schedule';
    case 'more':
    case 'moreSection':
    case 'tool':
      return 'more';
  }
}

/**
 * 뒤로가기가 히스토리 밖으로 나가려 할 때 대신 갈 곳(한 단계 위).
 * 홈이면 null — 더 올라갈 데가 없으니 앱을 벗어나도 되는 유일한 지점.
 */
export function parentOf(route: MobileRoute): MobileRoute | null {
  switch (route.kind) {
    case 'home':
      return null;
    case 'students':
    case 'schedule':
    case 'more':
    case 'attendance':
      return HOME_ROUTE;
    case 'moreSection':
      return { kind: 'more' };
    case 'tool':
      return { kind: 'moreSection', section: 'tools' };
  }
}
