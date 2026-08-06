/**
 * Step1Intro — 학년도 마무리 마법사 ① 안내 (S2.3).
 * 무엇이 보관되고 무엇이 유지되는지, 상담 제외·로컬 전용 제약을 실행 전에 분명히 말한다.
 */

import { formatTermKo } from '@domain/rules/academicCalendar';
import { ARCHIVE_SCOPE_ITEMS, KEPT_ITEM_LABELS } from './archiveScope';

interface Props {
  readonly closingTerm: string;
}

export function Step1Intro({ closingTerm }: Props) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div className="shrink-0 rounded-xl bg-sp-surface p-3">
          <span aria-hidden className="material-symbols-outlined text-3xl text-sp-accent">
            inventory_2
          </span>
        </div>
        <div>
          <h3 className="text-lg font-bold text-sp-text">
            {formatTermKo(closingTerm)}를 캐비닛에 넣어둘 준비를 해요
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-sp-muted">
            지금까지의 기록을 <strong className="text-sp-text">보관함에 그대로 복사</strong>해 두고,
            책상 위(라이브 화면)는 새 학년도 것만 남겨요. 보관은 삭제가 아니에요 — 보관된 기록은
            언제든 다시 꺼내 볼 수 있고, 전환 자체를 되돌릴 수도 있어요.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-sp-border bg-sp-surface p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-sp-text">
            <span aria-hidden className="material-symbols-outlined text-icon-md text-sp-accent">
              archive
            </span>
            보관함으로 옮겨지는 것 ({ARCHIVE_SCOPE_ITEMS.length}종)
          </p>
          <p className="mt-2 text-xs leading-relaxed text-sp-muted">
            학생 명렬·출결·학생 기록(누가기록)·관찰 기록·진도·좌석 배치·설문·과제·루브릭·성적 분석
            등 이번 학년도의 학생 관련 기록 전부예요. 성적 등급 기준·서명 명렬처럼 이 PC에만 저장된
            데이터도 함께 담아요.
          </p>
        </div>
        <div className="rounded-xl border border-sp-border bg-sp-surface p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-sp-text">
            <span aria-hidden className="material-symbols-outlined text-icon-md text-sp-highlight">
              push_pin
            </span>
            그대로 유지되는 것
          </p>
          <ul className="mt-2 space-y-1 text-xs text-sp-muted">
            {KEPT_ITEM_LABELS.map((label) => (
              <li key={label} className="flex items-center gap-1.5">
                <span aria-hidden className="material-symbols-outlined text-sm">
                  check
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-start gap-2 rounded-lg border border-sp-border bg-sp-bg px-3 py-2.5">
          <span aria-hidden className="material-symbols-outlined text-icon-md text-sp-muted">
            chat_bubble
          </span>
          <p className="text-xs leading-relaxed text-sp-muted">
            <strong className="text-sp-text">상담 기록은 보관 대상이 아니에요.</strong> 상담은
            서버에 저장되는 별도 데이터라 이번 정리와 무관하게 그대로 유지돼요.
          </p>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-sp-border bg-sp-bg px-3 py-2.5">
          <span aria-hidden className="material-symbols-outlined text-icon-md text-sp-muted">
            computer
          </span>
          <p className="text-xs leading-relaxed text-sp-muted">
            <strong className="text-sp-text">보관함은 이 PC에만 저장돼요.</strong> 다른 PC로
            옮기려면 설정 &gt; 백업/복원에서 백업 파일로 내보내면 보관함까지 함께 담겨요.
          </p>
        </div>
      </div>
    </div>
  );
}
