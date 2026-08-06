/**
 * ArchiveRosterCarryover — 학생 승계(S4.3) opt-in 액션 (보관함 뷰어 명렬 탭).
 *
 * 담임 연속(같은 학생들을 새 학년도에도 담임) 케이스: 전환 후 담임 명렬이 비어 있을 때만
 * 나타나는 **명시 버튼 + 확인 다이얼로그** 경로다. 자동 연결은 절대 하지 않는다
 * (S4.3 AC — 잘못된 매칭 = 개인정보 오병합).
 *
 *  - 읽기: 이미 열람 중인 아카이브 students.json(체크섬 검증된 archive:read 결과)만 사용.
 *  - 쓰기: 기존 명렬 가져오기 경로 그대로 — planImport(기존 참조 보존) → applyImportPlan
 *    → useStudentStore.updateStudents. 신규 저장 경로 0, 아카이브 무변경.
 *  - 라이브 명렬이 비어 있지 않으면 버튼 자체가 나타나지 않는다(덮어쓰기 여지 차단).
 */

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useToastStore } from '@adapters/components/common/Toast';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { planRosterCarryover } from '@domain/rules/rosterCarryover';
import { planImport } from '@domain/rules/rosterImportPlan';
import { applyImportPlan } from '@usecases/roster/applyImportPlan';
// 기존 명렬 가져오기(RosterManagementTab)와 동일한 id 발급기 — DI 예외 선례.
/* eslint-disable-next-line no-restricted-imports */
import { generateUUID } from '@infrastructure/utils/uuid';
import { formatTermKo } from '@domain/rules/academicCalendar';

interface Props {
  readonly term: string;
  /** useArchiveFile(term, 'students.json')의 파싱 결과 — 부재·오류면 null. */
  readonly data: unknown;
}

export function ArchiveRosterCarryover({ term, data }: Props) {
  const students = useStudentStore((s) => s.students);
  const loaded = useStudentStore((s) => s.loaded);
  const showToast = useToastStore((s) => s.show);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  // 라이브 명렬 로드 보장(가드 있는 load — 이미 로드됐으면 no-op, 파일 쓰기 없음).
  useEffect(() => {
    if (!loaded) void useStudentStore.getState().load();
  }, [loaded]);

  const plan = useMemo(() => planRosterCarryover(data), [data]);

  // 명시 조건: 담임 명렬이 비어 있고, 보관함에 승계 가능한 재학생이 있을 때만.
  if (!loaded || students.length > 0 || plan.importable.length === 0) return null;

  const apply = async () => {
    setApplying(true);
    try {
      const live = useStudentStore.getState().students;
      if (live.length > 0) {
        // 확인 다이얼로그가 열려 있는 사이 다른 경로로 명렬이 생겼다면 중단(오병합 방지).
        showToast('담임 명렬이 이미 등록되어 있어 가져오지 않았어요.', 'error');
        return;
      }
      // planImport: 기존 학생 참조(id) 보존 매칭. 빈 명렬이면 전원 신규,
      // 충돌은 자동 병합하지 않고 기존 유지(skip 기본값) — 오병합 금지.
      const importPlan = planImport(live, plan.importable);
      const next = applyImportPlan(live, importPlan, new Map(), generateUUID);
      await useStudentStore.getState().updateStudents(next);
      showToast(
        `${formatTermKo(term)} 명렬 ${plan.importable.length}명을 가져왔어요 (보관함은 그대로 남아요)`,
      );
      setConfirmOpen(false);
    } catch (err) {
      showToast(
        `명렬 가져오기에 실패했어요: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      );
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <div className="mb-3 flex items-start gap-3 rounded-lg border border-sp-border bg-sp-card px-4 py-3">
        <span aria-hidden className="material-symbols-outlined text-icon-md text-sp-accent">
          move_group
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-sp-text">올해도 같은 학생들을 담임하시나요?</p>
          <p className="mt-0.5 text-xs leading-relaxed text-sp-muted">
            지금 담임 명렬이 비어 있어요. 이 보관함의 명렬 {plan.importable.length}명
            {plan.excludedInactive > 0 && ` (전출·휴학 등 ${plan.excludedInactive}명 제외)`}을 새
            학년도 담임 명렬로 가져올 수 있어요. 자동으로 연결되지 않아요 — 이 버튼으로만 가져와요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="shrink-0 rounded-lg bg-sp-accent px-3 py-1.5 text-xs font-semibold text-sp-accent-fg transition-all hover:brightness-110 active:scale-95"
        >
          명렬 가져오기
        </button>
      </div>

      <Modal
        isOpen={confirmOpen}
        onClose={() => !applying && setConfirmOpen(false)}
        title="보관된 명렬 가져오기"
        srOnlyTitle
        size="sm"
        closeOnBackdrop={false}
      >
        <div className="p-6" data-modal-fallback tabIndex={-1}>
          <h3 className="text-lg font-bold text-sp-text">
            {formatTermKo(term)} 명렬을 가져올까요?
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-sp-muted">
            재학생 <strong className="text-sp-text">{plan.importable.length}명</strong>이 새 학년도
            담임 명렬로 등록돼요.
            {plan.excludedInactive > 0 &&
              ` 전출·휴학 등 비활성 학생 ${plan.excludedInactive}명은 제외돼요.`}{' '}
            보관함의 기록은 바뀌지 않고 그대로 남아요.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={applying}
              className="rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-muted transition-colors hover:text-sp-text disabled:opacity-40"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void apply()}
              disabled={applying}
              className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-semibold text-sp-accent-fg transition-all hover:brightness-110 disabled:opacity-40"
            >
              {applying ? '가져오는 중…' : `${plan.importable.length}명 가져오기`}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
