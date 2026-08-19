import type { StudentPhoto } from '@domain/entities/StudentPhoto';

/**
 * 학생 사진 저장소.
 *
 * 관찰 첨부(`IObservationAttachmentRepository`)와 같은 구조다 —
 * 메타는 JSON('student-photos'), 사진 본체는 바이너리 스토어(storageRef)에 분리 저장한다.
 *
 * ⚠️ 모든 식별은 **불변 `studentId`** 로 한다. 학번으로 찾는 메서드를 여기에 추가하지 말 것 —
 * 학번은 전학·번호 재부여·학년도 전환에서 다른 학생을 가리키게 된다.
 */
export interface IStudentPhotoRepository {
  /** 전체 사진 메타 목록 */
  list(): Promise<readonly StudentPhoto[]>;

  /** 메타 + 사진 바이너리를 함께 저장 (같은 studentId 가 있으면 교체) */
  save(photo: StudentPhoto, bytes: Uint8Array): Promise<void>;

  /** 여러 장을 한 번에 저장 (명렬표 한 장 가져오기 = 반 전체) */
  saveMany(entries: ReadonlyArray<{ photo: StudentPhoto; bytes: Uint8Array }>): Promise<void>;

  /** 사진 바이너리 읽기. 메타·파일 미존재 시 null */
  readPhoto(studentId: string): Promise<Uint8Array | null>;

  /** 메타 + 바이너리 삭제 (미존재 시 no-op) */
  delete(studentId: string): Promise<void>;

  /** 한 명단(담임/수업반)의 사진 전부 삭제 — 개인정보 파기 경로 */
  deleteByOwner(ownerKind: StudentPhoto['ownerKind'], ownerKey: string): Promise<void>;

  /** 전체 삭제 — 설정의 "학생 사진 모두 지우기" */
  deleteAll(): Promise<void>;

  /**
   * 동기화용 동적 바이너리 키 목록 (Phase 2b 에서 사용).
   * 메타에 등록된 것만 돌려주므로 고아 바이너리는 자연히 대상에서 빠진다.
   */
  listBinaryKeys(): Promise<string[]>;
}
