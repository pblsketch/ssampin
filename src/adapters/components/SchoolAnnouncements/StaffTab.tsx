import { useSelectedSchool } from './SchoolDisclosureContext';
import { DisclosureSection } from './DisclosureSection';
import { EmptyNotice } from './EmptyNotice';

/**
 * 교원·직원 탭 — 직위별 교원(22)·자격종별 교원(64)·직원(68).
 * 직위×성별 매트릭스라 0 값을 숨겨(hideZero) 실제 인원이 있는 항목만 보여준다.
 * (표시과목별 교원 24는 학교알리미가 더 이상 공시하지 않아 제외)
 */
export function StaffTab() {
  const identity = useSelectedSchool();
  if (!identity) {
    return (
      <EmptyNotice
        icon="badge"
        text="교원·직원 현황을 보려면 설정에서 학교(주소 포함)를 등록해 주세요."
      />
    );
  }
  return (
    <div className="space-y-8">
      <DisclosureSection apiType="22" title="직위별 교원" icon="badge" hideZero />
      <DisclosureSection apiType="64" title="자격종별 교원" icon="workspace_premium" hideZero />
      <DisclosureSection apiType="68" title="직원" icon="groups" hideZero />
    </div>
  );
}
