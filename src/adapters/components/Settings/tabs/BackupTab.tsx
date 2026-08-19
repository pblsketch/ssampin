import { BackupRestorePanel } from '../BackupRestorePanel';
import { StudentPhotoPrivacySection } from '../StudentPhotoPrivacySection';
import { FEATURE_FLAGS } from '@adapters/config/featureFlags';

export function BackupTab() {
  return (
    <>
      <BackupRestorePanel />
      {/* 학생 얼굴 사진은 이 앱에서 가장 민감한 자료다 —
          얼마나 있는지 보고 직접 지울 수 있어야 개인정보 파기 안내가 사실이 된다.
          사진 기능을 내보내기 전까지는 저장된 사진 자체가 없으므로 이 칸도 함께 숨긴다. */}
      {FEATURE_FLAGS.studentPhotos && <StudentPhotoPrivacySection />}
    </>
  );
}
