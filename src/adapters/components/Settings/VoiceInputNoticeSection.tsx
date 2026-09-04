/**
 * 음성 입력 고지 — "말한 것이 어디로 가는가"를 한 줄로 밝힌다.
 *
 * ## 왜 필요한가
 *
 * 관찰 기록을 말로 남길 때 **학생 이름이 목소리에 섞인다.** 그런데 그 음성을 글자로 바꾸는
 * 것은 쌤핀이 아니라 운영체제·브라우저를 만든 회사(마이크로소프트·구글·애플)다. 쌤핀 서버는
 * 이 경로에 아예 끼어 있지 않다. 선생님이 그 사실을 모르고 말하는 일이 없도록 **켜기 전에**
 * 눈에 보이는 자리에 적는다.
 *
 * 쌤핀은 음성 인식기를 넣지 않는다(오너 결정 2026-09-04) — 그래서 "우리가 처리한다"고
 * 쓸 수 없고, 쓰면 사실이 아니다. 학생 사진 고지(`StudentPhotoPrivacySection`)와 같은
 * 태도로 **정확히 어디에 남는지**만 담담하게 적는다.
 *
 * ## 어디에 붙어 있나
 *
 * 설정 → **학생 관찰 기록**(`record-reminder`) 탭 아래쪽(`SettingsLayout.tsx`).
 * 관찰 기록을 세우러 온 선생님이 보는 자리이고, 마이크 버튼이 실제로 뜨는 곳도 관찰
 * 입력 칸이다. 실험실 탭이 아닌 이유는 말로 남기기가 실험실 스위치에 매여 있지 않기
 * 때문이다 — 데스크톱 앱이면 늘 보인다. (T6 이 계획서 §6 T1 요청 2번대로 꽂았다.)
 */
import { SettingsSection } from './shared/SettingsSection';

export const VOICE_INPUT_NOTICE =
  '음성은 OS 제조사(마이크로소프트·구글·애플) 서버에서 글자로 바뀝니다.';

export function VoiceInputNoticeSection() {
  return (
    <SettingsSection
      icon="mic"
      iconColor="bg-sp-surface text-sp-muted"
      title="말로 남기기"
      description="관찰 기록을 말로 적을 때 알아 두실 점"
    >
      <div className="space-y-2">
        <p className="text-sm text-sp-text">{VOICE_INPUT_NOTICE}</p>
        <p className="text-xs text-sp-muted">
          쌤핀은 음성 인식 기능을 직접 갖고 있지 않습니다. 받아쓰기는 윈도우·휴대폰이 하고, 쌤핀
          서버로는 목소리가 전송되지 않습니다.
        </p>
        <p className="text-xs text-sp-muted">
          윈도우에서 [설정 → 접근성 → 음성]의{' '}
          <b className="font-sp-semibold">음성 입력 시작 도구</b>를 켜 두시면, 글자 칸을 클릭할
          때마다 마이크가 저절로 나타납니다.
        </p>
      </div>
    </SettingsSection>
  );
}
