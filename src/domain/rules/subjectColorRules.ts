import { COLOR_PRESETS, DEFAULT_SUBJECT_COLORS } from '../valueObjects/SubjectColor';
import type { SubjectColorId, SubjectColorMap } from '../valueObjects/SubjectColor';

/**
 * 과목명 유사도 기반 색상 추론
 * "공통영어1" → "영어"의 색상 상속
 * "통합사회1" → "사회"의 색상 상속
 */
function inferSubjectColor(
  subject: string,
  existingColors: SubjectColorMap,
): SubjectColorId | null {
  const baseSubjects = Object.keys(existingColors);

  // 기본 과목명이 포함되어 있으면 같은 색상
  for (const base of baseSubjects) {
    if (subject.includes(base)) {
      return existingColors[base] ?? null;
    }
  }

  // 키워드 매핑
  const keywordMap: Record<string, readonly string[]> = {
    '국어': ['국어', '문학', '화법', '독서', '언어', '작문', '매체', '심화국어', '실용국어'],
    '수학': ['수학', '확률', '통계', '미적분', '기하', '대수', '심화수학', '실용수학'],
    '영어': ['영어', 'English', '영문', '영어회화', '영어독해', '심화영어', '실용영어'],
    '과학': ['과학', '물리', '화학', '생명', '지구', '천문', '환경', '생활과학', '융합과학'],
    '사회': ['사회', '역사', '지리', '정치', '경제', '윤리', '한국사', '세계사', '동아시아', '법과', '사회문화', '생활과윤리', '윤리와사상', '한국지리', '세계지리'],
    '체육': ['체육', '운동', '스포츠', '건강', '체력'],
    '음악': ['음악'],
    '미술': ['미술', '디자인', '공예', '서예', '만화', '애니'],
    '창체': ['창체', '자율', '자치', '동아리', '진로', '봉사'],
    '기술': ['기술', '가정', '정보', '프로그래밍', '로봇', 'AI', '인공지능', '코딩'],
    '제2외국어': ['일본어', '중국어', '프랑스어', '독일어', '스페인어', '러시아어', '아랍어', '베트남어'],
    '한문': ['한문'],
    '교양': ['철학', '논리', '심리', '교육학', '종교', '논술', '실용'],
  };

  for (const [base, keywords] of Object.entries(keywordMap)) {
    if (keywords.some((kw) => subject.includes(kw))) {
      return existingColors[base] ?? DEFAULT_SUBJECT_COLORS[base] ?? null;
    }
  }

  return null;
}

/**
 * 스마트 자동 색상 배정: 유사도 추론 우선, 실패 시 미사용 색상 배정
 *
 * - 기존 매핑은 절대 변경하지 않음 (보존)
 * - 유사한 과목명이 있으면 같은 색상 상속
 * - 매칭 안 되면 아직 안 쓰인 색상부터 순서대로 배정
 */
export function smartAutoAssignColors(
  existingColors: SubjectColorMap,
  newSubjects: readonly string[],
): SubjectColorMap {
  const merged = { ...DEFAULT_SUBJECT_COLORS, ...existingColors };
  const result: Record<string, SubjectColorId> = { ...merged };

  const usedColorIds = new Set(Object.values(result));
  const allColorIds = COLOR_PRESETS.map((p) => p.id);
  const unusedColors = allColorIds.filter((id) => !usedColorIds.has(id));
  let unusedIdx = 0;

  for (const subject of newSubjects) {
    if (subject in result) continue;

    // 1차: 유사도 추론
    const inferred = inferSubjectColor(subject, result);
    if (inferred) {
      result[subject] = inferred;
      continue;
    }

    // 2차: 미사용 색상 배정
    if (unusedIdx < unusedColors.length) {
      result[subject] = unusedColors[unusedIdx]!;
      unusedIdx++;
    } else {
      // 전부 쓰였으면 순환
      result[subject] = allColorIds[unusedIdx % allColorIds.length]!;
      unusedIdx++;
    }
  }

  return result;
}

/**
 * 시간표 데이터에서 모든 과목명 추출
 */
export function extractSubjectsFromSchedule(
  scheduleData: Record<string, readonly { subject: string }[]>,
): string[] {
  const subjects = new Set<string>();
  for (const periods of Object.values(scheduleData)) {
    for (const p of periods) {
      if (p.subject && p.subject.trim() !== '' && p.subject !== '(미정)') {
        subjects.add(p.subject.trim());
      }
    }
  }
  return [...subjects];
}
