import type { Settings } from '@domain/entities/Settings';
import { InAppAssistCard } from '../aiBridge/InAppAssistCard';
import { CoolMessengerSection } from '../CoolMessengerSection';
import { SettingsSection } from '../shared/SettingsSection';
import { Toggle } from '../shared/Toggle';

/**
 * 실험실 기능 탭 (2026-08-24 오너 결정).
 *
 * ## 왜 한곳에 모았는가
 * 새로 나온 기능은 아직 실사용 피드백이 쌓이지 않았다. 모든 선생님 화면에 바로 얹는 대신,
 * 여기서 **직접 켠 선생님에게만** 진입점이 나타난다. 안정화되면 기본 기능으로 옮긴다.
 *
 * ## 저장 방식이 카드마다 다르다 — 의도된 차이
 * - 쌤핀 AI: 스위치를 누르는 즉시 적용된다(별도 저장 없음). 개인정보 고지를 확인하는
 *   순간과 켜지는 순간이 갈라지면 안 되기 때문이다.
 * - 온라인 교무실·쿨메신저: 다른 설정과 같은 초안(draft) 방식 — 상단 [저장]을 눌러야 적용된다.
 */

interface Props {
  readonly draft: Settings;
  readonly patch: (p: Partial<Settings>) => void;
}

/** 온라인 교무실 켜기/끄기 — 켜야 사이드바 메뉴와 달력·할 일의 부서 겹쳐 보기가 나타난다 */
function StaffRoomLabSection({ draft, patch }: Props) {
  const enabled = draft.staffRoomEnabled === true;

  return (
    <SettingsSection icon="groups" iconColor="bg-blue-500/10 text-blue-400" title="온라인 교무실">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-sp-text">부서 단위 공지·자료 공간 쓰기</p>
            <p className="text-xs text-sp-muted">
              학년부·교과부처럼 부서 단위로 공지, 자료실, 회의록, 일정·업무 분담을 나눕니다. 켜면
              사이드바에 &ldquo;온라인 교무실&rdquo; 메뉴가 생깁니다.
            </p>
          </div>
          <Toggle
            checked={enabled}
            onChange={(v) =>
              // 켤 때는 사이드바 숨김 목록에서도 빼 준다 — "켜면 메뉴가 생깁니다" 약속이
              // 숨김 설정(온보딩·수동)에 가려 거짓이 되면 안 된다 (ADR-070).
              patch(
                v
                  ? {
                      staffRoomEnabled: true,
                      hiddenMenus: (draft.hiddenMenus ?? []).filter((id) => id !== 'staffroom'),
                    }
                  : { staffRoomEnabled: false },
              )
            }
          />
        </div>
        <p className="text-xs text-sp-muted">
          인터넷 연결이 필요한 기능입니다. 부서에 참여할 때 Google 로그인으로 본인 확인을 거치며, 꺼
          두면 서버에 아무것도 요청하지 않습니다.
        </p>
      </div>
    </SettingsSection>
  );
}

export function LabsTab({ draft, patch }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-sp-text">실험실 기능</h2>
        <p className="mt-1 text-sm text-sp-muted">
          새로 나온 기능을 먼저 켜 볼 수 있는 곳입니다. 기본은 모두 꺼짐이고, 여기서 켠 기능만
          화면에 나타납니다. 충분히 다듬어지면 기본 기능이 됩니다.
        </p>
      </div>

      {/* 쌤핀 AI — 스위치 즉시 적용(고지 확인과 켜짐이 한 동작이어야 한다) */}
      <InAppAssistCard />

      {/* 온라인 교무실·쿨메신저 — 상단 [저장]으로 적용되는 초안 방식 */}
      <StaffRoomLabSection draft={draft} patch={patch} />

      <CoolMessengerSection draft={draft} patch={patch} />
    </div>
  );
}
