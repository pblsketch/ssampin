import { BackupRestorePanel } from '../BackupRestorePanel';
import { StudentPhotoPrivacySection } from '../StudentPhotoPrivacySection';

export function BackupTab() {
  return (
    <>
      <BackupRestorePanel />
      {/* 학생 얼굴 사진은 이 앱에서 가장 민감한 자료다 —
          얼마나 있는지 보고 직접 지울 수 있어야 개인정보 파기 안내가 사실이 된다 */}
      <StudentPhotoPrivacySection />
    </>
  );
}
