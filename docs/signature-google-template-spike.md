# 서명받기 Google template/result 기술 스파이크

## 결론

- Google Drive 결과 파일 생성: 가능. `files.copy`로 교사 원본 Docs/Sheets를 복사한 뒤 결과 파일에 반영한다.
- Google Sheets 텍스트/공식 입력: 가능. `spreadsheets.values.update`로 셀·범위에 값을 쓴다.
- Google Docs 서명 이미지 삽입: 조건부 가능. Docs API `insertInlineImage`는 삽입 시점에 접근 가능한 이미지 URI를 가져와 문서에 복사한다. 따라서 짧은 signed URL은 “삽입 요청이 실행되는 동안 접근 가능”하면 후보가 된다.
- Google Sheets 셀 안 서명 이미지: 1차에서는 “자동 이미지 삽입 보장”으로 말하지 않는다. Sheets `IMAGE(url)` 함수는 URL을 셀에서 계속 참조하므로, 만료되는 signed URL 또는 `drive.google.com` URL은 내구성이 부족하다.

## 1차 구현 방침

1. Docs 결과물은 치환자(`{{이름}}`, `{{서명}}`) 기반으로 처리한다.
2. Sheets 결과물은 텍스트 값과 제출 시각을 우선 반영한다.
3. Sheets 서명 이미지는 `durable-public` URL이 확보된 경우에만 `=IMAGE("https://...",4,h,w)` 공식을 생성한다.
4. private/signed-short-lived 서명 이미지는 결과 현황에는 링크/상태로 남기고, 셀 이미지 삽입은 후속 검증으로 둔다.

## 확인한 공식 근거

- Drive `files.copy`: 원본 파일 복사 API.
  - https://developers.google.com/workspace/drive/api/reference/rest/v3/files/copy
- Sheets `spreadsheets.values.update`: 범위 값 업데이트 API.
  - https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/update
- Docs `insertInlineImage`: 이미지 URI가 공개 접근 가능해야 하며, 삽입 시 문서 내부 표시용 복사본을 저장한다.
  - https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/request
- Sheets `IMAGE`: URL 기반 셀 이미지 함수. `drive.google.com` 호스팅 URL은 직접 사용할 수 없고, URL은 따옴표 또는 셀 참조여야 한다.
  - https://support.google.com/docs/answer/3093333

## 남은 검증

- Supabase Storage signed URL 만료 시간이 Docs 삽입 요청 시간보다 충분히 길 때 안정적으로 삽입되는지 실제 샘플 문서로 확인.
- Sheets에서 durable-public 이미지 프록시를 운영할지, 아니면 서명 이미지는 별도 현황 링크로만 유지할지 제품 결정.
