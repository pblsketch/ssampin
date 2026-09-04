import type {
  Assignment,
  AssignmentTarget,
  AssignmentsData,
  SubmitType,
} from '@domain/entities/Assignment';
import type { FileTypeRestriction } from '@domain/valueObjects/FileTypeRestriction';
import type { IAssignmentRepository } from '@domain/repositories/IAssignmentRepository';
import type { IGoogleDrivePort } from '@domain/ports/IGoogleDrivePort';
import type { IAssignmentServicePort } from '@domain/ports/IAssignmentServicePort';
import { SITE_URL } from '@config/siteUrl';

export interface CreateAssignmentParams {
  readonly title: string;
  readonly description?: string;
  readonly deadline: string;
  readonly target: AssignmentTarget;
  readonly driveFolderName: string;
  readonly submitType: SubmitType;
  readonly fileTypeRestriction: FileTypeRestriction;
  readonly allowLate: boolean;
  readonly allowResubmit: boolean;
  /** true면 제출 폼에서 학년/반/번호 숨기고 이름만으로 매칭 */
  readonly identifyByName?: boolean;
  /** 이 과제가 겨냥한 성취기준 코드(선택). 서버로는 보내지 않고 로컬에만 남는다. */
  readonly standardCodes?: readonly string[];
  /** 2022 개정 자료가 없는 학년에서 직접 적은 성취기준 문장(선택). */
  readonly standardText?: string;
}

export class CreateAssignment {
  constructor(
    private readonly assignmentRepo: IAssignmentRepository,
    private readonly drivePort: IGoogleDrivePort,
    private readonly servicePort: IAssignmentServicePort,
    private readonly getAccessToken: () => Promise<string>,
    /**
     * 지금 로그인된 구글 계정(이메일)을 알려준다.
     * 학생 파일은 서버가 이 계정의 토큰으로 올리므로, 나중에 다른 계정으로 갈아탄 걸
     * 알아채려면 만든 계정을 과제에 남겨 둬야 한다. 못 얻으면 그냥 비워 둔다.
     */
    private readonly getTeacherEmail?: () => Promise<string | null>,
  ) {}

  async execute(params: CreateAssignmentParams): Promise<Assignment> {
    const accessToken = await this.getAccessToken();
    const teacherEmail = (await this.getTeacherEmail?.()) ?? undefined;

    // ① 구글 드라이브: 루트 폴더 조회/생성 → 서브폴더 생성
    const rootFolder = await this.drivePort.getOrCreateRootFolder();
    const subFolder = await this.drivePort.createSubFolder(params.driveFolderName, rootFolder.id);

    // ② Supabase Edge Function으로 과제 생성 (DB 저장 + admin_key 발급)
    const result = await this.servicePort.createAssignment(accessToken, {
      title: params.title,
      description: params.description,
      deadline: params.deadline,
      targetType: params.target.type,
      targetName: params.target.name,
      studentList: params.target.students.map((s) => ({
        id: s.id,
        number: s.number,
        name: s.name,
        grade: s.grade,
        classNum: s.classNum,
      })),
      driveFolderId: subFolder.id,
      driveRootFolderId: rootFolder.id,
      submitType: params.submitType,
      fileTypeRestriction: params.fileTypeRestriction,
      allowLate: params.allowLate,
      allowResubmit: params.allowResubmit,
      identifyByName: params.identifyByName,
    });

    // ③ Assignment 객체 구성
    const assignment: Assignment = {
      id: result.id,
      title: params.title,
      description: params.description,
      deadline: params.deadline,
      target: params.target,
      driveFolder: {
        id: subFolder.id,
        name: subFolder.name,
        rootFolderId: rootFolder.id,
      },
      submitType: params.submitType,
      fileTypeRestriction: params.fileTypeRestriction,
      allowLate: params.allowLate,
      allowResubmit: params.allowResubmit,
      identifyByName: params.identifyByName,
      shareUrl: `${SITE_URL}/submit/${result.id}`,
      adminKey: result.adminKey,
      createdAt: new Date().toISOString(),
      teacherEmail,
      // 성취기준은 **로컬에만** 남긴다 — 위 servicePort.createAssignment 에 넣지 않았다.
      // 학생 제출 화면이 알 필요가 없는 정보를 서버로 보내지 않는다.
      ...(params.standardCodes && params.standardCodes.length > 0
        ? { standardCodes: [...params.standardCodes] }
        : {}),
      ...(params.standardText && params.standardText.trim().length > 0
        ? { standardText: params.standardText.trim() }
        : {}),
    };

    // ④ 로컬 JSON 저장
    const data = await this.assignmentRepo.getAssignments();
    const existing = data?.assignments ?? [];
    const updatedData: AssignmentsData = {
      assignments: [...existing, assignment],
    };
    await this.assignmentRepo.saveAssignments(updatedData);

    return assignment;
  }
}
