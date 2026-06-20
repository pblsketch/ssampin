import { useSelectedSchool } from './SchoolDisclosureContext';
import { DisclosureSection } from './DisclosureSection';
import { EmptyNotice } from './EmptyNotice';
import { CurriculumEvaluationSection } from './CurriculumEvaluationSection';

/**
 * 교육과정 탭 — 수업일수·시수(08)·교육운영 특색사업(67)·자유학기제(04, 중학교 전용) 공시 +
 * 우리 학교 평가계획 문서를 직접 파싱한 학년별 교육과정 편성(CurriculumEvaluationSection).
 * 자유학기제는 중학교(schulKndCode '03')만 공시되므로 다른 학교급에서는 표시하지 않는다.
 */
export function CurriculumTab() {
  const identity = useSelectedSchool();
  if (!identity) {
    return (
      <EmptyNotice
        icon="auto_stories"
        text="교육과정 운영을 보려면 설정에서 학교(주소 포함)를 등록해 주세요."
      />
    );
  }
  const isMiddleSchool = identity.schulKndCode === '03';
  return (
    <div className="space-y-8">
      <DisclosureSection apiType="08" title="수업일수·수업시수" icon="event_available" />
      <DisclosureSection apiType="67" title="교육운영 특색사업" icon="auto_awesome" />
      {isMiddleSchool && <DisclosureSection apiType="04" title="자유학기제 운영" icon="explore" />}
      <CurriculumEvaluationSection />
    </div>
  );
}
