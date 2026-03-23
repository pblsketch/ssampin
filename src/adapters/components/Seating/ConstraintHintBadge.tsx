import { useSeatConstraintsStore } from '@adapters/stores/useSeatConstraintsStore';
import { ZONE_LABELS } from '@domain/entities/SeatConstraints';

interface ConstraintHintBadgeProps {
  studentId: string;
}

/**
 * 편집 모드에서 좌석 카드에 표시되는 공개 조건 배지
 * - 📍 영역 고정
 * - 📌 좌석 고정
 * - 관계 조건(분리/인접)은 절대 표시하지 않음
 */
export function ConstraintHintBadge({ studentId }: ConstraintHintBadgeProps) {
  const constraints = useSeatConstraintsStore((s) => s.constraints);

  const zone = constraints.zones.find((z) => z.studentId === studentId);
  const fixed = constraints.fixedSeats.find((f) => f.studentId === studentId);

  if (!zone && !fixed) return null;

  return (
    <div className="flex items-center gap-0.5">
      {zone && (
        <span
          className="text-caption leading-none"
          title={`영역 고정: ${ZONE_LABELS[zone.zone]}`}
        >
          📍
        </span>
      )}
      {fixed && (
        <span
          className="text-caption leading-none"
          title={`좌석 고정: ${fixed.row + 1}행 ${fixed.col + 1}열`}
        >
          📌
        </span>
      )}
    </div>
  );
}
