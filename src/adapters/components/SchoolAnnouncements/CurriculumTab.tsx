import { useSelectedSchool } from './SchoolDisclosureContext';
import { DisclosureSection } from './DisclosureSection';
import { EmptyNotice } from './EmptyNotice';

/**
 * 교육과정 탭 — 수업일수·시수(08)·교육운영 특색사업(67)·자유학기제(04, 중학교 전용).
 * 자유학기제는 중학교(schulKndCode '03')만 공시되므로 다른 학교급에서는 표시하지 않는다.
 *
 * 학년별 교육과정 편제표(시간·단위 배당)는 학교알리미 정형 공시에 없고, 학교가 올린
 * 평가계획 문서(hwp/pdf)에 함께 담기므로 평가계획 탭으로 안내한다.
 */
export function CurriculumTab({ onGoToEvaluation }: { onGoToEvaluation?: () => void }) {
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

      {/* 학년별 교육과정 편제·시수 안내 — 평가계획 문서로 연결 */}
      <div className="rounded-xl border border-sp-border bg-sp-card p-4 flex items-start gap-3">
        <span className="material-symbols-outlined text-icon-md text-sp-accent shrink-0">
          description
        </span>
        <div className="min-w-0">
          <p className="text-sm font-sp-semibold text-sp-text">
            학년별 교육과정 편제가 궁금하세요?
          </p>
          <p className="text-xs text-sp-muted mt-1 leading-relaxed">
            과목별 시간·단위 배당(편제표)과 학년별 평가 운영 계획은 학교가 올린 문서에 담겨 있어요.{' '}
            <span className="text-sp-text font-sp-medium">평가계획</span> 탭에서 학년별 문서로
            확인할 수 있습니다.
          </p>
          {onGoToEvaluation && (
            <button
              type="button"
              onClick={onGoToEvaluation}
              className="mt-2 inline-flex items-center gap-1 text-xs font-sp-semibold text-sp-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent rounded"
            >
              평가계획 탭으로 가기
              <span className="material-symbols-outlined text-icon-sm">arrow_forward</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
