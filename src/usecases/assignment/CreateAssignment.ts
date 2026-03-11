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
}

export class CreateAssignment {
  constructor(
    private readonly assignmentRepo: IAssignmentRepository,
    private readonly drivePort: IGoogleDrivePort,
    private readonly servicePort: IAssignmentServicePort,
    private readonly getAccessToken: () => Promise<string>,
  ) {}

  async execute(params: CreateAssignmentParams): Promise<Assignment> {
    const accessToken = await this.getAccessToken();

    // ① 구글 드라이브: 루트 폴더 조회/생성 → 서브폴더 생성
    const rootFolder = await this.drivePort.getOrCreateRootFolder();
    const subFolder = await this.drivePort.createSubFolder(
      params.driveFolderName,
      rootFolder.id,
    );

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
      shareUrl: `https://ssampin.vercel.app/submit/${result.id}`,
      adminKey: result.adminKey,
      createdAt: new Date().toISOString(),
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
