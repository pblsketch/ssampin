; 쌤핀 커스텀 NSIS 스크립트
; 설치 시 Windows 방화벽 인바운드 규칙 추가 → 학생 참여 링크 사용 시 방화벽 팝업 방지

!macro customInstall
  ; 기존 규칙이 있으면 먼저 삭제 (중복 방지)
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="쌤핀 (SsamPin)"'
  ; 인바운드 TCP 허용 규칙 추가 (투표/설문/워드클라우드 로컬 서버용)
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="쌤핀 (SsamPin)" dir=in action=allow program="$INSTDIR\쌤핀.exe" enable=yes protocol=TCP'
!macroend

!macro customUnInstall
  ; 언인스톨 시 방화벽 규칙 제거
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="쌤핀 (SsamPin)"'
!macroend
