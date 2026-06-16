import { useSchoolIdentity } from './useSchoolDisclosure';
import { DisclosureSection } from './DisclosureSection';
import { EmptyNotice } from './EmptyNotice';

/** 학교 현황 탭 — 학생수(09)·학교현황(62)·급식 운영(34). */
export function OverviewTab() {
  const identity = useSchoolIdentity();
  if (!identity) {
    return (
      <EmptyNotice
        icon="school"
        text="학교 현황을 보려면 설정에서 학교(주소 포함)를 등록해 주세요. (직접 설정한 학교급은 조회되지 않아요)"
      />
    );
  }
  return (
    <div className="space-y-8">
      <p className="text-sm font-sp-semibold text-sp-text">{identity.schoolName}</p>
      <DisclosureSection apiType="09" title="학년별·학급별 학생수" icon="groups" />
      <DisclosureSection apiType="62" title="학교 현황" icon="apartment" />
      <DisclosureSection apiType="34" title="급식 운영 현황" icon="restaurant" />
    </div>
  );
}
