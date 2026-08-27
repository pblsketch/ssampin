import { useAssignmentStore } from '@adapters/stores/useAssignmentStore';
import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';
import { useToastStore } from '@adapters/components/common/Toast';

/**
 * 과제수합 화면들의 [Google 계정 연결하기] 동작.
 *
 * **왜 훅으로 모았나** — 과제수합 화면은 셋이다(담임 과제·쌤도구 과제·수업반 과제).
 * 화면마다 이 동작을 따로 구현해 두었더니, 고칠 때 수업반 화면 하나가 옛 코드로 남아
 * 그 화면 교사만 복구가 안 되는 일이 실제로 있었다. 한 곳에서만 고치도록 훅으로 묶는다.
 *
 * **왜 로그인만으로 끝내면 안 되나** — 학생이 낸 파일은 서버가 교사 토큰으로 대신
 * 드라이브에 올린다. 앱에서 다시 로그인해도 서버가 들고 있는 토큰은 그대로라서,
 * reconnectGoogleDrive 로 서버 쪽까지 바꿔 줘야 학생 제출이 실제로 다시 된다.
 */
export function useAssignmentGoogleConnect(): () => Promise<void> {
  const reconnectGoogleDrive = useAssignmentStore((s) => s.reconnectGoogleDrive);
  const loadAssignments = useAssignmentStore((s) => s.loadAssignments);
  const startAuth = useCalendarSyncStore((s) => s.startAuth);
  const showToast = useToastStore((s) => s.show);

  return async function handleGoogleConnect(): Promise<void> {
    try {
      await startAuth();
    } catch {
      // startAuth 는 취소·거부·폴백을 스스로 처리하므로 보통 throw 하지 않는다.
      // 그래도 던지는 경우엔 여기서 끝낸다 (startAuth 가 이미 안내를 띄웠다).
      return;
    }

    // startAuth 는 실패해도 throw 하지 않고 스토어에 상태만 남긴다.
    // 그래서 throw 를 기다리지 말고 실제로 이어졌는지를 읽어야 한다.
    // 이걸 빼면 사용자가 인증 창을 그냥 닫았을 때도 성공한 것처럼 진행된다.
    //
    // 참고: 이 확인은 **아직 안 이어진 사용자**의 취소만 걸러낸다. 이미 이어져 있던 교사가
    // 창을 닫으면 isConnected 가 true 그대로라 아래로 진행하는데, 그때 하는 일이
    // "지금 갖고 있는 토큰을 서버에 다시 올리기"라 어차피 우리가 원하던 복구 동작이다.
    if (!useCalendarSyncStore.getState().isConnected) return;

    const ok = await reconnectGoogleDrive();
    if (!ok) {
      // 실패 사유(로그인 필요 / 서버 저장 실패)는 스토어가 문구로 남긴다 — 그대로 보여 준다.
      showToast(useAssignmentStore.getState().error ?? 'Google 계정 연결에 실패했습니다.', 'error');
      return;
    }

    await loadAssignments();
  };
}
