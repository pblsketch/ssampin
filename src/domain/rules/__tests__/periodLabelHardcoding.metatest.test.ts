import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

/**
 * 교시 라벨 하드코딩 재발 방지 (period-label-rename P2e).
 *
 * "N교시"는 저장된 값이 아니라 만들어지는 문자열이다. 그래서 화면마다 따로 만들면
 * 교사가 붙인 교시 이름("창체")이 그 화면에서만 조용히 무시된다 — 실제로 이 기능을
 * 넣기 전 src/ 안에 50곳 넘게 흩어져 있었다.
 *
 * 정본은 @domain/rules/periodLabel 의 resolvePeriodLabel / periodTimeLabel /
 * resolvePeriodShortLabel 이며, Attendance.formatPeriodLabel(조회·종례 특례)와
 * periodPresenter.periodToLabel(방과후·종일·범위 특례)이 여기에 위임한다.
 *
 * 이 테스트는 그 외의 곳에서 교시 번호로부터 "N교시" 문자열을 직접 만들면 실패한다.
 */

const SRC = resolve(__dirname, '../../..');

/** 교시 번호를 보간해 라벨을 만드는 패턴 (템플릿 문자열 / JSX 중괄호) */
const HARDCODE = /\$\{[^}]*\}교시|\}교시/;

/**
 * 허용 목록 — 각 항목은 "왜 교시 이름 대상이 아닌지"를 함께 적는다.
 * 새 항목을 추가하려면 그 자리가 '특정 교시를 가리키는 이름'이 아님을 설명할 수 있어야 한다.
 */
const ALLOWLIST: readonly { file: string; why: string }[] = [
  {
    file: 'domain/rules/periodLabel.ts',
    why: '정본 — 이름이 없을 때의 기본 라벨을 만드는 곳',
  },
  {
    file: 'domain/valueObjects/PeriodTime.ts',
    why: 'label 필드 주석에서 기본 표기를 설명',
  },
  {
    file: 'adapters/presenters/periodPresenter.ts',
    why: '범위(N~M교시) 표기와 숫자가 아닌 교시 값의 폴백 — 내부적으로 정본에 위임',
  },
  {
    file: 'adapters/components/Settings/tabs/PeriodTab.tsx',
    why:
      '① 교시 열은 이름 열과 나란히 두고 번호 정체성을 그대로 보여준다(이름을 붙여도 몇 번째 줄인지 찾을 수 있어야 한다) ' +
      '② "N교시 후 점심" 위치 안내와 "총 N교시" 프리셋 요약은 개수·위치이지 교시 이름이 아니다',
  },
  {
    file: 'adapters/components/Timetable/TimetableEditor.tsx',
    why: '"N교시" 총 교시 수 표시(교시 추가·삭제 버튼 옆) — 개수',
  },
  {
    file: 'adapters/components/SchoolYearWizard/Step4Confirm.tsx',
    why: '새 학년도 프로필 요약의 총 교시 수 — 개수',
  },
  {
    file: 'adapters/components/Homeroom/Consultation/ConsultationCreateModal.tsx',
    why: '"공강만 상담 가능"의 공강 교시 개수 — 개수',
  },
  {
    file: 'adapters/components/Archive/ArchiveViewer.tsx',
    why: '보관된 지난 학년도 기록 — 현재 설정의 교시 이름을 입히면 과거 데이터를 잘못 설명한다',
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__') continue;
      walk(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    if (/\.test\.tsx?$/.test(name)) continue;
    out.push(full);
  }
  return out;
}

describe('교시 라벨 하드코딩 금지', () => {
  const offenders = walk(SRC)
    .filter((full) => HARDCODE.test(readFileSync(full, 'utf-8')))
    .map((full) => relative(SRC, full).replace(/\\/g, '/'))
    .filter((rel) => !ALLOWLIST.some((a) => a.file === rel));

  it('허용 목록 밖에서 "N교시"를 직접 만들지 않는다', () => {
    expect(offenders).toEqual([]);
  });

  it('허용 목록의 모든 항목에 사유가 적혀 있다', () => {
    for (const entry of ALLOWLIST) {
      expect(entry.why.trim().length).toBeGreaterThan(0);
    }
  });
});
