/**
 * 학생 사진 (얼굴-이름 학습용).
 *
 * ## 저장 원칙
 *
 * 관찰 첨부(`ObservationAttachment`)와 같은 방식이다 — **메타는 JSON, 사진 본체는 별도 바이너리 파일.**
 * base64 를 JSON 안에 넣지 않는다. 학생 사진은 한 반 22장 × 담당 반 수만큼 **상시 누적**되므로
 * JSON 에 인라인하면 그 파일이 수 MB 가 되고, 동기화가 매번 전량 전송·전량 병합이 된다
 * (v2.3.5·v2.3.6 동기화 충돌 사고와 같은 계열의 위험).
 *
 * ## 저장 키(`subjectKey`)는 명단 종류마다 다르다
 *
 * - **담임**: 불변 `Student.id`. 학번은 전학·번호 재부여·학년도 전환에서 다른 학생을
 *   가리키게 되므로 절대 쓰지 않는다(담임 출결이 학번으로 식별하다 기록이 오염된 전례가 있다).
 * - **수업반**: `{수업반 id}--{학년-반-번호}`. 수업반 학생에게는 불변 id 가 없고,
 *   출결·좌석·수업 기록이 이미 `학년-반-번호` 로 저장되고 있다. 사진만 더 엄격한 식별을
 *   요구할 이유가 없다는 판단(오너 확정)이며, 어긋나면 명렬표를 다시 넣어 바로잡는다.
 *   수업반 id 를 앞에 붙이는 이유는 **한 반의 사진을 지울 때 다른 반 것까지 사라지지 않게** 하기 위해서다.
 *
 * 학번·이름은 진단·표시용 사본으로만 둔다 — 식별에 쓰지 말 것.
 *
 * ## AI 브릿지 미러링 대상이 아니다
 *
 * 얼굴 사진은 외부로 나갈 이유가 없으므로 `ENTITY_FIELD_CONTRACT` 에 **일부러 등록하지 않는다.**
 */

/** 사진을 소유한 명단의 종류 — 반별 일괄 삭제의 단위가 된다 */
export type StudentPhotoOwnerKind = 'homeroom' | 'teaching-class';

export interface StudentPhoto {
  /** 저장 경로의 키 — 담임은 Student.id, 수업반은 `{반id}--{학년-반-번호}` (위 설명 참조) */
  readonly subjectKey: string;
  /** 어느 명단에서 들어온 사진인지 (반별 삭제·묶음 동기화의 단위) */
  readonly ownerKind: StudentPhotoOwnerKind;
  /** 담임이면 'homeroom', 수업반이면 TeachingClass.id */
  readonly ownerKey: string;
  /** 바이너리 상대경로: 'student-photos/{subjectKey}.jpg' */
  readonly storageRef: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  /** 표시·진단용 사본 (식별에 쓰지 말 것 — 식별은 subjectKey 로만) */
  readonly studentNumber?: number;
  readonly studentName?: string;
  /** ISO 8601 */
  readonly updatedAt: string;
}

export interface StudentPhotosData {
  readonly photos: readonly StudentPhoto[];
}

/**
 * 파일로 내보낼 때 그림 하나를 그리는 데 필요한 최소 정보.
 *
 * 자리배치표(PDF·엑셀·한글)를 만드는 코드는 사진 저장소를 모른다 — 부르는 쪽이 이 모양으로
 * 읽어서 넘겨준다. 그래야 학생용 화면에서 사진에 닿을 길이 원리적으로 막힌 상태가 유지된다
 * (빌드 게이트 `scripts/check-bundle-isolation.mjs` 가 검사하는 약속).
 */
export interface StudentPhotoImage {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  /**
   * 사진의 실제 픽셀 크기.
   *
   * ⚠️ 한글(.hwpx)에 넣을 때 필요하다. 한글 파일은 "원본이 몇 픽셀짜리인가"를 따로 적는데,
   * 이 값이 틀리면 일부 뷰어가 그림을 엉뚱한 배율로 늘린다(한컴은 알아서 고쳐 읽는다).
   */
  readonly width: number;
  readonly height: number;
}
