export interface ChangelogEntry {
  version: string;
  date: string;
  highlights: string[];
  changes: { type: 'feat' | 'fix' | 'improve'; text: string }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.2.9',
    date: '2026-03-08',
    highlights: [
      '진도관리에서 다른 반 불러오기 시 날짜 수정 가능',
      '좌석배치 크기 조정 시 학생 유실 버그 수정',
    ],
    changes: [
      { type: 'feat', text: '진도관리 다른 반 불러오기 시 날짜 수정 기능 추가' },
      { type: 'fix', text: '좌석배치 행/열 축소 시 학생이 사라지는 버그 수정' },
      { type: 'fix', text: '온보딩 입력 필드 텍스트 색상 가독성 개선' },
      { type: 'improve', text: '업데이트 시 변경 내역 안내 UI 추가' },
    ],
  },
  {
    version: '0.2.8',
    date: '2026-03-06',
    highlights: [
      'AI 챗봇 도움말 위젯 추가',
      '랜딩페이지 AI 챗봇 연동',
    ],
    changes: [
      { type: 'feat', text: '앱 내 AI 도움말 챗봇 위젯 추가' },
      { type: 'feat', text: '랜딩페이지 AI 챗봇 위젯 추가' },
      { type: 'fix', text: '건의사항 모달 Tawk.to를 AI 챗봇으로 대체' },
      { type: 'fix', text: '에스컬레이션 이메일 인코딩 수정' },
    ],
  },
];

export function getChangelog(version: string): ChangelogEntry | undefined {
  return CHANGELOG.find((e) => e.version === version);
}
