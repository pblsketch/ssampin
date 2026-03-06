import type { RecordTemplate } from '../entities/RecordTemplate';

export const DEFAULT_TEMPLATES: readonly RecordTemplate[] = [
  {
    id: 'tpl-parent-phone',
    name: '학부모 전화 상담',
    category: 'counseling',
    subcategory: '학부모상담',
    method: 'phone',
    contentTemplate: '상담 내용:\n합의 사항:\n후속 조치:',
  },
  {
    id: 'tpl-student-1on1',
    name: '학생 1:1 상담',
    category: 'counseling',
    subcategory: '학생상담',
    method: 'face',
    contentTemplate: '상담 사유:\n학생 이야기:\n교사 소견:\n후속 계획:',
  },
  {
    id: 'tpl-life-guidance',
    name: '생활지도 기록',
    category: 'life',
    subcategory: '생활지도',
    contentTemplate: '상황:\n지도 내용:\n학생 반응:',
  },
  {
    id: 'tpl-attendance-note',
    name: '출결 특이사항',
    category: 'attendance',
    subcategory: '',
    contentTemplate: '사유:\n학부모 연락 여부:\n조치:',
  },
];
