/**
 * 흩어진 학생 데이터 → 생기부 근거 자료(RecordEvidence) 변환 (순수 함수).
 *
 * ⚠️ 불가침(P2 — 점수 로컬 전용 제1원칙 + AI 브릿지 점수 제외 정책):
 *   수행평가·성적의 **점수/배점/석차/성취도 숫자는 절대 evidence content 에 넣지 않는다.**
 *   근거 본문은 get_record_evidence 로 외부 AI 에 그대로 노출되므로, 질적 정보(수준 이름·설명·
 *   교사 메모·피드백·제출 사실)만 담는다. 이 규칙은 evidenceImport.test.ts 회귀 가드로 고정한다.
 *
 * 순수 함수(스토어/IO/React 비의존) — 단위 테스트로 "점수 미포함"을 검증한다.
 */
import type { EvidenceSourceType } from '@domain/entities/RecordEvidence';
import type { Assignment, Submission } from '@domain/entities/Assignment';
import type { ObservationAttachment } from '@domain/entities/ObservationAttachment';
import type { Rubric, RubricGrading } from '@domain/entities/Rubric';
import type {
  AssessmentPlanItem,
  PerformanceAssessmentResult,
  SemesterGradeResult,
} from '@domain/entities/GradeAnalysis';
import { extensionOf } from '@domain/rules/observationAttachmentRules';
import { FILE_TYPE_EXTENSIONS } from '@domain/valueObjects/FileTypeRestriction';

/** 변환 결과 — RecordEvidence add 입력의 부분집합(studentRef/areas/classId 는 호출자가 채움). */
export interface ImportedEvidence {
  readonly content: string;
  readonly sourceType: EvidenceSourceType;
  readonly sourceId: string;
  readonly date?: string;
  /**
   * 원본 기록에서 이어받은 관찰 슬롯("어떤 장면인가").
   * 원본에 없으면 이 칸도 만들지 않는다(부재 != 빈 배열).
   */
  readonly slots?: readonly string[];
}

/** ISO 8601(또는 YYYY-MM-DD) → YYYY-MM-DD. 비면 undefined. */
function toDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined;
}

function withDate(base: Omit<ImportedEvidence, 'date'>, date?: string): ImportedEvidence {
  return date !== undefined ? { ...base, date } : base;
}

/**
 * 파일 본문이 없을 때 남기는 한 줄.
 *
 * 조용히 파일명만 남기면 교사도 AI 도 "이 파일 안에 뭐가 있었는지"를 알 수 없고, 없는 내용을
 * 있는 것처럼 지어낼 여지를 준다. 왜 없는지까지 적어야 교사가 다음 행동을 고른다
 * (사진이면 눈으로 보고 관찰로 옮겨 적는 수밖에 없다).
 */
function missingBodyNote(fileName: string): string {
  const ext = extensionOf(fileName);
  return FILE_TYPE_EXTENSIONS.image.includes(ext)
    ? '(사진 파일: 본문 추출 불가)'
    : '(본문 추출 안 됨)';
}

/**
 * 학생 제출 과제물 → 근거. 텍스트 제출 내용 + **파일 본문** + 파일명 참조.
 *
 * 파일 본문(`extractedText`)은 과제 제출 파일을 내려받아 뽑아 둔 것이다(ExtractSubmissionTexts).
 * 예전에는 파일명만 실려서, 같은 파일이라도 "관찰 첨부"로 올리면 본문이 들어오고 "과제수합"으로
 * 내면 안 들어오는 비대칭이 있었다 — 그걸 없앤다.
 *
 * ⚠️ 파일 크기 숫자는 여전히 넣지 않는다. 다만 **본문은 학생이 쓴 글 그대로**이므로 그 안에
 *    숫자가 있을 수 있다(첨부 `extractedText` 도 지금 같은 성질이다). 이 함수의 불가침 규칙은
 *    "앱이 들고 있는 점수·배점 필드를 싣지 않는다"이지 "숫자가 한 글자도 없다"가 아니다.
 */
export function submissionToEvidence(sub: Submission, assignment?: Assignment): ImportedEvidence {
  const title = assignment?.title?.trim() || '과제';
  const parts: string[] = [`[과제: ${title}]`];
  const text = sub.textContent?.trim();
  if (text) parts.push(text);
  if (sub.fileName) {
    parts.push(`제출 파일: ${sub.fileName}`);
    const body = sub.extractedText?.trim();
    parts.push(body ? body : missingBodyNote(sub.fileName));
  }
  if (sub.isLate) parts.push('(지각 제출)');
  return withDate(
    { content: parts.join('\n'), sourceType: 'assignment', sourceId: sub.id },
    toDate(sub.submittedAt),
  );
}

/** 교사 저장 자료/학생 제출 파일(첨부) → 근거. 추출 원문(있으면) + 파일명 + 출처 라벨. */
export function attachmentToEvidence(att: ObservationAttachment): ImportedEvidence {
  const srcLabel = att.source === 'student' ? '학생 제출물' : '교사 자료';
  const parts: string[] = [`[${srcLabel}: ${att.fileName}]`];
  const text = att.extractedText?.trim();
  if (text) parts.push(text);
  return withDate(
    { content: parts.join('\n'), sourceType: 'attachment', sourceId: att.id },
    toDate(att.createdAt),
  );
}

/**
 * 수행평가 채점 → 근거. 요소별 **수준 이름(+성취 설명)** + 요소 메모 + 총평.
 * ⚠️ RubricLevel.score(배점 숫자)는 절대 포함하지 않는다.
 */
export function rubricGradingToEvidence(g: RubricGrading, rubric?: Rubric): ImportedEvidence {
  const title = rubric?.title?.trim() || '수행평가';
  const lines: string[] = [`[수행평가: ${title}]`];
  if (rubric) {
    const ordered = [...rubric.criteria].sort((a, b) => a.order - b.order);
    for (const crit of ordered) {
      const levelId = g.marks[crit.id];
      const level = crit.levels.find((l) => l.id === levelId);
      // 수준 "이름"과 "성취 설명"만 — 배점(level.score)은 의도적으로 읽지 않는다.
      const levelText = level
        ? `${level.name}${level.description?.trim() ? `: ${level.description.trim()}` : ''}`
        : g.status === 'absent'
          ? '결시'
          : '미채점';
      const note = g.criterionNotes[crit.id]?.trim();
      lines.push(`· ${crit.name}: ${levelText}${note ? ` (${note})` : ''}`);
    }
  }
  const feedback = g.overallFeedback?.trim();
  if (feedback) lines.push(`총평: ${feedback}`);
  return withDate(
    { content: lines.join('\n'), sourceType: 'evaluation', sourceId: g.id },
    toDate(g.gradedAt),
  );
}

/**
 * 수행평가 성적 결과 → 근거. **교사 서술(증거 메모·메모)만**.
 * ⚠️ score/rawScore/석차/성취도 등 숫자·등급은 절대 포함하지 않는다.
 */
export function gradeToEvidence(
  perf: PerformanceAssessmentResult,
  plan?: AssessmentPlanItem,
): ImportedEvidence {
  const title = plan ? `${plan.subject} ${plan.title}`.trim() : '평가';
  const lines: string[] = [`[평가: ${title}]`];
  const note = perf.evidenceNote?.trim();
  if (note) lines.push(note);
  const memo = perf.memo?.trim();
  if (memo) lines.push(`메모: ${memo}`);
  return withDate(
    { content: lines.join('\n'), sourceType: 'evaluation', sourceId: perf.id },
    toDate(plan?.plannedAt),
  );
}

/**
 * 학기 성적 산출 결과 → 근거. **성취도(A~E 등급)만** 담는다.
 * 성취도는 NEIS 생기부 기재 항목이라 노출 가능(브릿지 gradeAnalysis 정책과 일치)하지만,
 * ⚠️ 원점수·환산점·석차·과목평균 숫자는 절대 포함하지 않는다. 숫자가 섞인 비정상 성취도 값은 오염으로 보고 제외(null).
 * 유효 성취도가 없으면 null 을 반환해 호출자가 후보에서 제외한다(빈/점수형 근거 방지).
 */
export function semesterGradeToEvidence(
  s: SemesterGradeResult,
  subject?: string,
): ImportedEvidence | null {
  const level = s.achievementLevel?.trim();
  if (!level || /\d/.test(level)) return null; // 성취도 없음 또는 숫자 오염 → 제외
  const title = subject?.trim() ? subject.trim() : '성적';
  return {
    content: `[${title}] ${s.semester}학기 성취도 ${level}`,
    sourceType: 'evaluation',
    sourceId: s.id,
  };
}
