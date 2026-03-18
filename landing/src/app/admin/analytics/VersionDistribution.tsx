'use client';

import { useState } from 'react';

interface VersionEntry {
  app_version: string;
  users: number;
  last_seen: string;
}

interface Props {
  versions: VersionEntry[];
}

type SortMode = 'users' | 'version';

function parseSemver(v: string): [number, number, number] | null {
  const parts = v.split('.').map(Number);
  if (parts.length < 1 || parts.some(isNaN)) return null;
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa && !pb) return 0;
  if (!pa) return 1;  // unknowns to bottom
  if (!pb) return -1;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export default function VersionDistribution({ versions }: Props) {
  const [sortMode, setSortMode] = useState<SortMode>('users');

  const sorted = [...versions].sort((a, b) => {
    if (sortMode === 'users') {
      return b.users - a.users;
    }
    // version: descending semver (newest at top), unknowns at bottom
    return compareSemver(b.app_version, a.app_version);
  });

  const maxUsers = Math.max(...sorted.map((x) => x.users), 1);
  const topVersion = sorted[0]?.app_version;

  if (versions.length === 0) {
    return <p className="text-gray-500 text-sm">데이터 없음</p>;
  }

  return (
    <div>
      <div className="flex justify-end gap-1 mb-3">
        <button
          onClick={() => setSortMode('users')}
          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
            sortMode === 'users'
              ? 'bg-gray-700 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-gray-300'
          }`}
        >
          사용자순
        </button>
        <button
          onClick={() => setSortMode('version')}
          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
            sortMode === 'version'
              ? 'bg-gray-700 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-gray-300'
          }`}
        >
          버전순
        </button>
      </div>
      <div className="space-y-2">
        {sorted.map((v) => {
          const isTop = v.app_version === topVersion;
          return (
            <div key={v.app_version} className="flex items-center gap-3">
              <span
                className={`w-16 text-sm font-mono ${isTop ? 'text-green-400' : 'text-gray-400'}`}
              >
                v{v.app_version}
              </span>
              <div className="flex-1 bg-gray-800 rounded-full h-5 overflow-hidden">
                <div
                  className={`h-full rounded-full flex items-center justify-end pr-2 text-xs font-medium ${
                    isTop ? 'bg-green-500' : 'bg-gray-600'
                  }`}
                  style={{
                    width: `${Math.min(100, (v.users / maxUsers) * 100)}%`,
                    minWidth: '2rem',
                  }}
                >
                  {v.users}명
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
