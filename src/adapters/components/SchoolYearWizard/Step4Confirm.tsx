/**
 * Step4Confirm — 학년도 마무리 마법사 ④ 요약 + 실행 (S2.3).
 *
 * 구버전 기기 감지기(P2 출시 조건 3) 실측 결과:
 * 동기화 매니페스트(DriveSyncManifest)의 `version`은 모든 앱 버전에서 상수 1(스키마 리터럴)이고
 * 앱 버전·파일별 기록 버전이 어디에도 실리지 않는다(SyncToCloud.ts:218/225 실측) —
 * 즉 "최근에 구버전이 업로드한 흔적"을 매니페스트로는 판별할 수 없다.
 * → 계획의 대체 경로 채택: 동기화 사용 중이면 고정 안내 + 확인 체크박스가
 *   실행 버튼의 활성화 조건이 된다. 동기화를 꺼둔 사용자는 기기가 하나이므로 생략한다.
 */

import { formatTermKo } from '@domain/rules/academicCalendar';
import type { ArchiveScopeCount } from './archiveScope';
import { ARCHIVE_SCOPE_ITEMS } from './archiveScope';
import type { WizardProfileDraft } from './wizardProgress';

interface Props {
  readonly closingTerm: string;
  readonly nextTerm: string;
  readonly profile: WizardProfileDraft;
  readonly counts: ReadonlyMap<string, ArchiveScopeCount> | null;
  /** Drive 동기화 사용 여부 — true면 구버전 기기 확인 체크박스가 필수. */
  readonly syncEnabled: boolean;
  readonly devicesConfirmed: boolean;
  readonly onDevicesConfirmedChange: (checked: boolean) => void;
  /** 중단된 전환 이어하기로 진입했는지. */
  readonly resuming: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  homeroom: '담임교사',
  subject: '교과교사',
  admin: '관리자/부장',
};

export function Step4Confirm({
  closingTerm,
  nextTerm,
  profile,
  counts,
  syncEnabled,
  devicesConfirmed,
  onDevicesConfirmedChange,
  resuming,
}: Props) {
  const totalCount =
    counts === null
      ? null
      : ARCHIVE_SCOPE_ITEMS.reduce((sum, item) => {
          const c = counts.get(item.key);
          return sum + (c?.count ?? 0);
        }, 0);
  const storedKinds =
    counts === null ? null : ARCHIVE_SCOPE_ITEMS.filter((i) => counts.get(i.key)?.exists).length;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-sp-text">
          {resuming ? '중단된 전환을 이어서 마무리해요' : '마지막으로 확인해 주세요'}
        </h3>
        <p className="mt-1 text-sm text-sp-muted">
          {resuming
            ? '지난번 전환이 중간에 멈췄어요. 안전 백업부터 다시 확인하며 같은 자리에서 이어가요.'
            : '실행하면 안전 백업 → 보관함 복사 → 검증 → 새 학기 준비 순서로 진행돼요. 어느 단계에서 멈춰도 데이터는 그대로 남아요.'}
        </p>
        {/* F6(M1): 이어하기 = 전 파일 재정리 — 중단 이후 입력분 소거를 실행 직전에 재고지 */}
        {resuming && (
          <p className="mt-1.5 text-xs leading-relaxed text-amber-400/90">
            중단된 뒤에 새로 입력한 내용이 있다면 이어하기 때 함께 정리돼요. 필요하면 안전 백업에서
            복구할 수 있어요.
          </p>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-sp-border bg-sp-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-sp-muted">보관</p>
          <p className="mt-1 text-sm font-bold text-sp-text">{formatTermKo(closingTerm)}</p>
          <p className="mt-1 text-xs text-sp-muted">
            {counts === null
              ? '보관할 기록 확인 중…'
              : `${storedKinds}종 · 셀 수 있는 기록 ${totalCount?.toLocaleString()}건`}
          </p>
        </div>
        <div className="rounded-xl border border-sp-border bg-sp-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-sp-muted">새 시작</p>
          <p className="mt-1 text-sm font-bold text-sp-text">{formatTermKo(nextTerm)}</p>
          <p className="mt-1 text-xs text-sp-muted">
            {profile.schoolName || '학교 미입력'}
            {' · '}
            {profile.teacherRoles.length > 0
              ? profile.teacherRoles.map((r) => ROLE_LABELS[r] ?? r).join('·')
              : '역할 미선택'}
            {profile.teacherRoles.includes('homeroom') && profile.className
              ? ` · ${profile.className}`
              : ''}
            {' · '}
            {profile.maxPeriods}교시
          </p>
        </div>
      </div>

      {/* 구버전 기기 확인 — Drive 동기화 사용자만 (실측: 매니페스트로 자동 감지 불가) */}
      {syncEnabled && (
        <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-2">
            <span aria-hidden className="material-symbols-outlined text-icon-md text-amber-400">
              devices
            </span>
            <div className="text-xs leading-relaxed text-sp-text">
              <p className="font-bold">Google Drive 동기화를 사용 중이에요</p>
              <p className="mt-1 text-sp-muted">
                다른 기기(폰·다른 PC)의 쌤핀이 구버전이면, 전환 후 그 기기가 올린 옛 데이터가 새
                학년도에 섞여 들어올 수 있어요. 전환 전에{' '}
                <strong className="text-sp-text">
                  다른 기기를 모두 최신 버전으로 업데이트하고 동기화를 한 번씩 마쳐
                </strong>{' '}
                주세요.
              </p>
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-sp-border bg-sp-bg px-3 py-2.5">
            <input
              type="checkbox"
              checked={devicesConfirmed}
              onChange={(e) => onDevicesConfirmedChange(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="text-xs text-sp-text">
              다른 기기들을 모두 최신 버전으로 업데이트하고 동기화를 마쳤어요 (기기가 이 PC 하나라면
              그대로 체크해 주세요)
            </span>
          </label>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-sp-border bg-sp-bg px-3 py-2.5">
        <span aria-hidden className="material-symbols-outlined text-icon-md text-sp-muted">
          undo
        </span>
        <p className="text-xs leading-relaxed text-sp-muted">
          전환이 끝난 뒤에도 이 설정 탭의 <strong className="text-sp-text">전환 취소</strong>로 보관
          시점 그대로 되돌릴 수 있어요. 보관 사본이 있는 한 언제든 가능해요.
        </p>
      </div>
    </div>
  );
}
