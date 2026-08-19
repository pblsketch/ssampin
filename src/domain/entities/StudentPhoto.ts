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
 * ## 저장 키가 학번이 아니라 `studentId` 인 이유
 *
 * ⚠️ 학번은 **바뀐다.** 전학·번호 재부여·학년도 전환 때 같은 학번이 다른 학생을 가리킨다.
 * 이 저장소에는 이미 같은 원인의 사고 기록이 있다(담임 출결이 학번으로 학생을 식별해
 * 번호가 겹치자 기록이 통째로 오염된 건). 사진은 얼굴이라 오염되면 더 나쁘다.
 * 그래서 **불변 `Student.id`** 를 키로 쓴다. 학번·이름은 진단·표시용 사본으로만 둔다.
 *
 * ## AI 브릿지 미러링 대상이 아니다
 *
 * 얼굴 사진은 외부로 나갈 이유가 없으므로 `ENTITY_FIELD_CONTRACT` 에 **일부러 등록하지 않는다.**
 */

/** 사진을 소유한 명단의 종류 — 반별 일괄 삭제의 단위가 된다 */
export type StudentPhotoOwnerKind = 'homeroom' | 'teaching-class';

export interface StudentPhoto {
  /** 불변 Student.id — 저장 경로의 키 */
  readonly studentId: string;
  /** 어느 명단에서 들어온 사진인지 (반별 삭제·묶음 동기화의 단위) */
  readonly ownerKind: StudentPhotoOwnerKind;
  /** 담임이면 'homeroom', 수업반이면 TeachingClass.id */
  readonly ownerKey: string;
  /** 바이너리 상대경로: 'student-photos/{studentId}.jpg' */
  readonly storageRef: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  /** 표시·진단용 사본 (식별에 쓰지 말 것 — 식별은 studentId 로만) */
  readonly studentNumber?: number;
  readonly studentName?: string;
  /** ISO 8601 */
  readonly updatedAt: string;
}

export interface StudentPhotosData {
  readonly photos: readonly StudentPhoto[];
}
