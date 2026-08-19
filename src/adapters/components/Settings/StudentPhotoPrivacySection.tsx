/**
 * 학생 사진 관리 — 얼마나 저장돼 있는지 보여 주고, 지울 수 있게 한다.
 *
 * ## 왜 지우기 버튼이 반드시 있어야 하는가
 *
 * 얼굴 사진은 이 앱이 다루는 자료 중 성격이 가장 민감하고, 구글 드라이브로 동기화된다.
 * 지울 방법이 없으면 개인정보 처리방침의 "파기" 항목이 사실이 아니게 된다.
 * 기기를 넘기거나 학년이 끝났을 때 **선생님이 직접, 확실히 지울 수 있어야 한다.**
 *
 * ## 결과를 정직하게 알린다
 *
 * 인터넷이 끊겼거나 로그인이 풀렸으면 클라우드에서 못 지울 수 있다.
 * 그때 "삭제 완료"라고만 하면 거짓말이 된다 — **몇 장이 어디에 남았는지 그대로 말한다.**
 */

import { useCallback, useEffect, useState } from 'react';
import { useToastStore } from '@adapters/components/common/Toast';
import { SettingsSection } from './shared/SettingsSection';
import { studentPhotoRepository } from '@adapters/di/container';
import { deleteStudentPhotos } from '@usecases/studentPhoto/DeleteStudentPhotos';
import { resolveStudentPhotoCloud } from '@adapters/repositories/studentPhotoCloudGateway';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function StudentPhotoPrivacySection() {
  const showToast = useToastStore((s) => s.show);
  const [count, setCount] = useState<number | null>(null);
  const [totalBytes, setTotalBytes] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const photos = await studentPhotoRepository.list();
      setCount(photos.length);
      setTotalBytes(photos.reduce((sum, p) => sum + p.byteSize, 0));
    } catch {
      setCount(0);
      setTotalBytes(0);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDeleteAll = useCallback(async () => {
    setBusy(true);
    try {
      const cloud = await resolveStudentPhotoCloud();
      const result = await deleteStudentPhotos(
        { repository: studentPhotoRepository, ...(cloud ? { cloud } : {}) },
        { scope: 'all' },
      );
      await refresh();
      setConfirming(false);

      if (result.cloudFailures.length > 0) {
        // 조용히 성공한 척하지 않는다 — 어디에 몇 장이 남았는지 그대로 알린다
        showToast(
          `이 컴퓨터에서는 ${result.deletedCount}장을 지웠어요. 다만 클라우드에 ${result.cloudFailures.length}장이 아직 남아 있어요. 인터넷에 연결한 뒤 다시 시도해 주세요.`,
          'error',
        );
        return;
      }
      showToast(
        cloud
          ? `학생 사진 ${result.deletedCount}장을 이 컴퓨터와 클라우드에서 모두 지웠어요.`
          : `학생 사진 ${result.deletedCount}장을 지웠어요.`,
        'success',
      );
    } catch (err) {
      showToast(
        `사진을 지우지 못했어요: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      );
    } finally {
      setBusy(false);
    }
  }, [refresh, showToast]);

  return (
    <SettingsSection
      icon="account_box"
      iconColor="bg-blue-500/10 text-sp-accent"
      title="학생 사진"
      description="얼굴 보고 이름 외우기에 쓰는 사진이에요"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-sp-text">
            {count === null ? (
              '확인하는 중…'
            ) : count === 0 ? (
              '저장된 사진이 없어요.'
            ) : (
              <>
                <strong>{count}장</strong> 저장돼 있어요 (약 {formatBytes(totalBytes)})
              </>
            )}
          </p>
          {count !== null && count > 0 && !confirming && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="px-4 py-2 rounded-lg border border-red-500/30 bg-sp-card hover:bg-red-500/10 text-sm font-medium text-red-400 transition-colors"
            >
              사진 모두 지우기
            </button>
          )}
        </div>

        <p className="text-xs text-sp-muted break-keep">
          사진은 이 컴퓨터에 저장되고, 동기화를 켜 두면 선생님의 구글 드라이브에도 함께 보관돼요.
          학생 화면·바탕화면 위젯에는 표시되지 않아요.
        </p>

        {confirming && (
          <div
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 space-y-3"
          >
            <p className="text-sm text-sp-text break-keep">
              저장된 사진 <strong>{count}장</strong>을 모두 지울까요? 이 컴퓨터와 클라우드에서 함께
              지워지고, <strong>되돌릴 수 없어요.</strong> 다시 쓰려면 사진 명렬표를 다시 넣어야
              해요.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDeleteAll()}
                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {busy ? '지우는 중…' : '네, 모두 지울게요'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="px-4 py-2 rounded-lg bg-sp-card hover:bg-sp-surface text-sm text-sp-text ring-1 ring-sp-border disabled:opacity-50"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
