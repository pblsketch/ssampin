import { useSchoolIdentity } from './useSchoolDisclosure';
import { DisclosureSection } from './DisclosureSection';
import { EmptyNotice } from './EmptyNotice';

/** 동아리·방과후·상담 탭 — 동아리(56)·방과후(59)·상담(61)·학교폭력 예방교육(94). */
export function ActivitiesTab() {
  const identity = useSchoolIdentity();
  if (!identity) {
    return (
      <EmptyNotice
        icon="diversity_3"
        text="동아리·방과후·상담 현황을 보려면 설정에서 학교(주소 포함)를 등록해 주세요."
      />
    );
  }
  return (
    <div className="space-y-8">
      <DisclosureSection apiType="56" title="동아리 활동 현황" icon="diversity_3" />
      <DisclosureSection apiType="59" title="방과후학교 운영" icon="school" />
      <DisclosureSection apiType="61" title="학생·학부모 상담" icon="support_agent" />
      <DisclosureSection apiType="94" title="학교폭력 예방교육 실적" icon="shield" />
    </div>
  );
}
