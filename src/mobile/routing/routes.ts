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

/**
 * 하단 탭.
 *
 * 담임(학급)과 수업이 따로인 이유: 앱 속은 원래 나뉘어 있었다. 저장소가
 * `useMobileStudentRecordsStore`(담임) / `useMobileObservationStore`(수업반)로 별개고
 * 화면 폴더도 `pages/students/` / `components/Class/` 로 갈라져 있는데, 겉의 탭만
 * "학생" 하나로 묶고 그 안에서 세그먼트로 다시 갈랐었다. 겉을 속에 맞춘 것이다.
 */
export type MobileTab = 'home' | 'homeroom' | 'teaching' | 'schedule' | 'more';
export type ScheduleSeg = 'schedule' | 'todo';
export type AttendanceType = 'homeroom' | 'class';

/**
 * 더보기 하위 중 도구가 아닌 것들. 도구는 toolId 파라미터로 따로 다룬다.
 *
 * 'tools'(도구 목록)가 빠진 이유: 도구 14종이 더보기 첫 화면에 바로 펼쳐지면서
 * 중간 문이 없어졌다. 옛 /more/tools 링크는 parsePath 가 더보기로 받아준다.
 */
export type MoreSection = 'settings' | 'memo' | 'bookmarks';

export type MobileRoute =
  | { kind: 'home' }
  | { kind: 'homeroom' }
  | { kind: 'teaching' }
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

const MORE_SECTIONS: readonly MoreSection[] = ['settings', 'memo', 'bookmarks'];

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
    case 'homeroom':
      return '/homeroom';
    case 'teaching':
      return '/teaching';
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

  if (first === 'homeroom') return { kind: 'homeroom' };
  if (first === 'teaching') return { kind: 'teaching' };

  // 옛 주소 호환 — 담임·수업이 "학생" 탭 하나에 세그먼트로 들어 있던 시절의 링크.
  // 아직 배포 전이지만, 테스트 중 남은 링크나 북마크가 죽지 않게 받아준다.
  if (first === 'students') {
    return second === 'teaching' ? { kind: 'teaching' } : { kind: 'homeroom' };
  }

  if (first === 'schedule') {
    if (second === 'todo') return { kind: 'schedule', seg: 'todo' };
    return { kind: 'schedule', seg: 'schedule' };
  }

  if (first === 'more') {
    if (second === undefined) return { kind: 'more' };
    // /more/tools/<toolId> 는 도구.
    // /more/tools 는 도구 목록이던 시절의 주소인데, 지금은 목록이 더보기 첫 화면에
    // 바로 있으므로 더보기로 받는다.
    if (second === 'tools') {
      return third !== undefined ? { kind: 'tool', toolId: third } : { kind: 'more' };
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
    case 'homeroom':
      return 'homeroom';
    case 'teaching':
      return 'teaching';
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
    case 'homeroom':
    case 'teaching':
    case 'schedule':
    case 'more':
    case 'attendance':
      return HOME_ROUTE;
    case 'moreSection':
      return { kind: 'more' };
    case 'tool':
      // 도구 목록이 더보기 첫 화면이 됐으므로 도구의 한 단계 위는 더보기다.
      return { kind: 'more' };
  }
}
