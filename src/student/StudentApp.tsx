import type { ComponentType } from 'react';
import { StudentRealtimeWallApp } from './StudentRealtimeWallApp';
import { StudentClassroomAgreementApp } from './StudentClassroomAgreementApp';

export type StudentAppMode = 'realtime-wall' | 'classroom-agreement';

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

export function StudentApp({ mode = resolveStudentAppMode() }: StudentAppProps) {
  const Component = resolveStudentAppComponent(mode);
  return <Component />;
}

export function resolveStudentAppComponent(mode: StudentAppMode): ComponentType {
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
