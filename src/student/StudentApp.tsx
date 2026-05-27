import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { StudentRealtimeWallApp } from './StudentRealtimeWallApp';

export type StudentAppMode = 'realtime-wall' | 'classroom-agreement';
type StudentRouteComponent = ComponentType | LazyExoticComponent<ComponentType>;

interface StudentAppLocationLike {
  readonly search?: string;
  readonly hash?: string;
}

interface StudentAppProps {
  readonly mode?: StudentAppMode;
}

const CLASSROOM_AGREEMENT_MODE_VALUES = new Set([
  'classroom-agreement',
  'classroomagreement',
  'classroom-agreements',
]);

const StudentClassroomAgreementApp = lazy(() =>
  import('./StudentClassroomAgreementApp').then((module) => ({
    default: module.StudentClassroomAgreementApp,
  })),
);

export function StudentApp({ mode = resolveStudentAppMode() }: StudentAppProps) {
  const Component = resolveStudentAppComponent(mode);
  if (mode === 'classroom-agreement') {
    return (
      <Suspense fallback={<StudentAppLoading />}>
        <Component />
      </Suspense>
    );
  }
  return <Component />;
}

export function resolveStudentAppComponent(mode: StudentAppMode): StudentRouteComponent {
  return mode === 'classroom-agreement' ? StudentClassroomAgreementApp : StudentRealtimeWallApp;
}

export function resolveStudentAppMode(location?: StudentAppLocationLike): StudentAppMode {
  const target = location ?? getBrowserLocation();
  const fromSearch = readModeFromSearchParams(target.search ?? '');
  if (fromSearch) return fromSearch;

  const fromHash = readModeFromHash(target.hash ?? '');
  if (fromHash) return fromHash;

  return 'realtime-wall';
}

function getBrowserLocation(): StudentAppLocationLike {
  if (typeof window === 'undefined') return {};
  return window.location;
}

function readModeFromHash(hash: string): StudentAppMode | null {
  const normalized = hash.replace(/^#\/?/, '').replace(/^\?/, '');
  return readModeFromSearchParams(normalized);
}

function readModeFromSearchParams(search: string): StudentAppMode | null {
  const normalized = search.startsWith('?') ? search.slice(1) : search;
  if (!normalized) return null;

  const params = new URLSearchParams(normalized);
  const rawMode = params.get('tool') ?? params.get('mode') ?? params.get('app');
  if (!rawMode) return null;

  const normalizedMode = rawMode.trim().toLowerCase();
  return CLASSROOM_AGREEMENT_MODE_VALUES.has(normalizedMode) ? 'classroom-agreement' : null;
}

function StudentAppLoading() {
  return (
    <div className="min-h-screen bg-sp-bg px-6 py-12 text-sp-text">
      <div className="mx-auto max-w-md rounded-xl border border-sp-border bg-sp-card p-8 text-center text-sm text-sp-muted">
        학생 앱을 불러오는 중입니다.
      </div>
    </div>
  );
}
