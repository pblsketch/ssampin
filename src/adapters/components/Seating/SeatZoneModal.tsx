import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSeatConstraintsStore } from '@adapters/stores/useSeatConstraintsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useSeatingStore } from '@adapters/stores/useSeatingStore';
import type { ZoneId, ZoneConstraint, FixedSeatConstraint } from '@domain/entities/SeatConstraints';
import { ZONE_LABELS } from '@domain/entities/SeatConstraints';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';

interface SeatZoneModalProps {
  open: boolean;
  onClose: () => void;
}

const ZONE_IDS: ZoneId[] = [
  'front1', 'front2', 'front3',
  'back1', 'back2',
  'left1', 'right1',
  'center',
];

export function SeatZoneModal({ open, onClose }: SeatZoneModalProps) {
  const {
    constraints,
    loaded,
    load,
    addZone,
    removeZone,
    addFixedSeat,
    removeFixedSeat,
  } = useSeatConstraintsStore();

  const activeStudents = useStudentStore((s) => s.activeStudents);
  const seating = useSeatingStore((s) => s.seating);

  // 영역 고정 폼 상태
  const [zoneStudentId, setZoneStudentId] = useState('');
  const [zoneId, setZoneId] = useState<ZoneId>('front1');
  const [zoneReason, setZoneReason] = useState('');

  // 좌석 고정 폼 상태
  const [fixedStudentId, setFixedStudentId] = useState('');
  const [fixedRow, setFixedRow] = useState<number | null>(null);
  const [fixedCol, setFixedCol] = useState<number | null>(null);
  const [fixedReason, setFixedReason] = useState('');

  // 탭 상태
  const [tab, setTab] = useState<'zone' | 'fixed'>('zone');

  useEffect(() => {
    if (open && !loaded) {
      void load();
    }
  }, [open, loaded, load]);

  const students = useMemo(() => activeStudents(), [activeStudents]);

  // 이미 영역 조건이 있는 학생 ID
  const zoneStudentIds = useMemo(
    () => new Set(constraints.zones.map((z) => z.studentId)),
    [constraints.zones],
  );

  // 이미 좌석 고정된 학생 ID
  const fixedStudentIds = useMemo(
    () => new Set(constraints.fixedSeats.map((f) => f.studentId)),
    [constraints.fixedSeats],
  );

  // 영역 추가 가능한 학생 (이미 영역 조건 없고, 좌석 고정도 안 된 학생)
  const availableForZone = useMemo(
    () => students.filter((s) => !zoneStudentIds.has(s.id) && !fixedStudentIds.has(s.id)),
    [students, zoneStudentIds, fixedStudentIds],
  );

  // 좌석 고정 가능한 학생 (이미 좌석 고정 안 됨, 영역도 안 됨)
  const availableForFixed = useMemo(
    () => students.filter((s) => !fixedStudentIds.has(s.id) && !zoneStudentIds.has(s.id)),
    [students, fixedStudentIds, zoneStudentIds],
  );

  const handleAddZone = useCallback(async () => {
    if (!zoneStudentId) return;
    const constraint: ZoneConstraint = {
      studentId: zoneStudentId,
      zone: zoneId,
      reason: zoneReason.trim(),
    };
    await addZone(constraint);
    setZoneStudentId('');
    setZoneReason('');
  }, [zoneStudentId, zoneId, zoneReason, addZone]);

  const handleAddFixed = useCallback(async () => {
    if (!fixedStudentId || fixedRow === null || fixedCol === null) return;
    const constraint: FixedSeatConstraint = {
      studentId: fixedStudentId,
      row: fixedRow,
      col: fixedCol,
      reason: fixedReason.trim(),
    };
    await addFixedSeat(constraint);
    setFixedStudentId('');
    setFixedRow(null);
    setFixedCol(null);
    setFixedReason('');
  }, [fixedStudentId, fixedRow, fixedCol, fixedReason, addFixedSeat]);

  const getStudentName = useCallback(
    (id: string) => {
      const s = students.find((st) => st.id === id);
      return s ? `${s.studentNumber ?? ''}번 ${s.name}` : id;
    },
    [students],
  );

  return (
    <Modal isOpen={open} onClose={onClose} title="배치 조건" srOnlyTitle size="lg">
      <div className="flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-sp-border">
          <h3 className="text-lg font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-accent">tune</span>
            배치 조건
          </h3>
          <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
        </div>

        {/* 탭 */}
        <div className="flex border-b border-sp-border">
          <button
            onClick={() => setTab('zone')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === 'zone'
                ? 'text-sp-accent border-b-2 border-sp-accent bg-sp-accent/5'
                : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            📍 영역 고정
          </button>
          <button
            onClick={() => setTab('fixed')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === 'fixed'
                ? 'text-sp-accent border-b-2 border-sp-accent bg-sp-accent/5'
                : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            📌 좌석 고정
          </button>
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tab === 'zone' && (
            <>
              {/* 영역 추가 폼 */}
              <div className="space-y-3">
                <div className="flex gap-2">
                  <select
                    value={zoneStudentId}
                    onChange={(e) => setZoneStudentId(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-sp-bg border border-sp-border text-sm text-sp-text"
                  >
                    <option value="">학생 선택</option>
                    {availableForZone.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.studentNumber ?? ''}번 {s.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={zoneId}
                    onChange={(e) => setZoneId(e.target.value as ZoneId)}
                    className="w-32 px-3 py-2 rounded-lg bg-sp-bg border border-sp-border text-sm text-sp-text"
                  >
                    {ZONE_IDS.map((z) => (
                      <option key={z} value={z}>{ZONE_LABELS[z]}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={zoneReason}
                    onChange={(e) => setZoneReason(e.target.value)}
                    placeholder="사유 (선택)"
                    className="flex-1 px-3 py-2 rounded-lg bg-sp-bg border border-sp-border text-sm text-sp-text placeholder:text-sp-muted"
                  />
                  <button
                    onClick={() => void handleAddZone()}
                    disabled={!zoneStudentId}
                    className="px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                  >
                    추가
                  </button>
                </div>
              </div>

              {/* 영역 목록 */}
              {constraints.zones.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-sp-muted uppercase tracking-wider">
                    설정된 영역 ({constraints.zones.length})
                  </h4>
                  {constraints.zones.map((z) => (
                    <div
                      key={z.studentId}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-sp-bg border border-sp-border"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-sp-text font-medium">
                          {getStudentName(z.studentId)}
                        </span>
                        <span className="text-sp-accent text-xs px-2 py-0.5 rounded bg-sp-accent/10">
                          {ZONE_LABELS[z.zone]}
                        </span>
                        {z.reason && (
                          <span className="text-sp-muted text-xs">({z.reason})</span>
                        )}
                      </div>
                      <button
                        onClick={() => void removeZone(z.studentId)}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/20 text-sp-muted hover:text-red-400 transition-colors"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                          close
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {constraints.zones.length === 0 && (
                <p className="text-sm text-sp-muted text-center py-4">
                  영역 고정 조건이 없습니다.
                  <br />
                  특정 학생을 앞줄, 뒷줄 등 원하는 영역에 배치할 수 있습니다.
                </p>
              )}
            </>
          )}

          {tab === 'fixed' && (
            <>
              {/* 좌석 고정 추가 폼 */}
              <div className="space-y-3">
                <select
                  value={fixedStudentId}
                  onChange={(e) => {
                    setFixedStudentId(e.target.value);
                    setFixedRow(null);
                    setFixedCol(null);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-sp-bg border border-sp-border text-sm text-sp-text"
                >
                  <option value="">학생 선택</option>
                  {availableForFixed.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.studentNumber ?? ''}번 {s.name}
                    </option>
                  ))}
                </select>

                {/* 미니맵 좌석 그리드 */}
                {fixedStudentId && (
                  <div className="space-y-2">
                    <p className="text-xs text-sp-muted">고정할 좌석을 클릭하세요 (교탁 방향 ↑)</p>
                    <div
                      className="grid gap-1 mx-auto"
                      style={{
                        gridTemplateColumns: `repeat(${seating.cols}, minmax(0, 1fr))`,
                        maxWidth: `${seating.cols * 48}px`,
                      }}
                    >
                      {Array.from({ length: seating.rows }, (_, r) =>
                        Array.from({ length: seating.cols }, (_, c) => {
                          const isSelected = fixedRow === r && fixedCol === c;
                          const isOccupiedByFixed = constraints.fixedSeats.some(
                            (f) => f.row === r && f.col === c,
                          );
                          return (
                            <button
                              key={`${r}-${c}`}
                              onClick={() => {
                                setFixedRow(r);
                                setFixedCol(c);
                              }}
                              disabled={isOccupiedByFixed}
                              className={`w-10 h-10 rounded text-xs font-mono transition-colors ${
                                isSelected
                                  ? 'bg-sp-accent text-white ring-2 ring-sp-accent/50'
                                  : isOccupiedByFixed
                                    ? 'bg-sp-border/50 text-sp-muted cursor-not-allowed'
                                    : 'bg-sp-bg border border-sp-border hover:border-sp-accent/50 text-sp-muted'
                              }`}
                            >
                              {r + 1},{c + 1}
                            </button>
                          );
                        }),
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={fixedReason}
                    onChange={(e) => setFixedReason(e.target.value)}
                    placeholder="사유 (선택)"
                    className="flex-1 px-3 py-2 rounded-lg bg-sp-bg border border-sp-border text-sm text-sp-text placeholder:text-sp-muted"
                  />
                  <button
                    onClick={() => void handleAddFixed()}
                    disabled={!fixedStudentId || fixedRow === null || fixedCol === null}
                    className="px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                  >
                    추가
                  </button>
                </div>
              </div>

              {/* 고정 좌석 목록 */}
              {constraints.fixedSeats.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-sp-muted uppercase tracking-wider">
                    고정된 좌석 ({constraints.fixedSeats.length})
                  </h4>
                  {constraints.fixedSeats.map((f) => (
                    <div
                      key={f.studentId}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-sp-bg border border-sp-border"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-sp-text font-medium">
                          {getStudentName(f.studentId)}
                        </span>
                        <span className="text-sp-highlight text-xs px-2 py-0.5 rounded bg-sp-highlight/10">
                          {f.row + 1}행 {f.col + 1}열
                        </span>
                        {f.reason && (
                          <span className="text-sp-muted text-xs">({f.reason})</span>
                        )}
                      </div>
                      <button
                        onClick={() => void removeFixedSeat(f.studentId)}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/20 text-sp-muted hover:text-red-400 transition-colors"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                          close
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {constraints.fixedSeats.length === 0 && (
                <p className="text-sm text-sp-muted text-center py-4">
                  좌석 고정 조건이 없습니다.
                  <br />
                  특정 학생을 항상 같은 자리에 배치할 수 있습니다.
                </p>
              )}
            </>
          )}
        </div>

        {/* 푸터 */}
        <div className="p-4 border-t border-sp-border">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
