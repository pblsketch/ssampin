/**
 * FileUserTemplateRepo — IUserTemplateRepo 구현 (PDCA-4 / G006)
 *
 * `userData/data/boards/templates/{templateId}.json` 파일 단위 저장.
 * BoardFilePersistence 와 같은 디렉터리 트리(boards/) 아래에 templates/ 를
 * 추가해 보드 관련 산출물을 한 곳에 모은다.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import type {
  OpaqueBoardElement,
  UserTemplate,
  UserTemplateMeta,
} from '@domain/entities/UserTemplate';
import type { IUserTemplateRepo } from '@domain/ports/IUserTemplateRepo';

import { BOARDS_DIR_NAME } from './constants';

export const USER_TEMPLATES_DIR_NAME = 'templates';
const USER_TEMPLATE_ID_PREFIX = 'tpl-';
const USER_TEMPLATE_ID_SUFFIX_LENGTH = 14;

interface UserTemplateFile {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly versionSchema: string;
  readonly elements: ReadonlyArray<OpaqueBoardElement>;
}

export class FileUserTemplateRepo implements IUserTemplateRepo {
  private readonly templatesDir: string;

  constructor(userDataDir: string) {
    this.templatesDir = path.join(userDataDir, 'data', BOARDS_DIR_NAME, USER_TEMPLATES_DIR_NAME);
    if (!fs.existsSync(this.templatesDir)) {
      fs.mkdirSync(this.templatesDir, { recursive: true });
    }
  }

  private filePath(id: string): string {
    return path.join(this.templatesDir, `${id}.json`);
  }

  async listAll(): Promise<UserTemplateMeta[]> {
    const files = await fs.promises.readdir(this.templatesDir);
    const metas: UserTemplateMeta[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await fs.promises.readFile(path.join(this.templatesDir, f), 'utf8');
        const data = JSON.parse(raw) as UserTemplateFile;
        if (typeof data.id !== 'string' || !Array.isArray(data.elements)) continue;
        metas.push({
          id: data.id,
          name: data.name,
          createdAt: data.createdAt,
          versionSchema: data.versionSchema,
          elementCount: data.elements.length,
        });
      } catch {
        // 손상된 템플릿 파일은 목록에서 제외 (보드 메타와 동일한 관용 정책)
      }
    }
    metas.sort((a, b) => b.createdAt - a.createdAt);
    return metas;
  }

  async load(id: string): Promise<UserTemplate | null> {
    const p = this.filePath(id);
    if (!fs.existsSync(p)) return null;
    try {
      const raw = await fs.promises.readFile(p, 'utf8');
      const data = JSON.parse(raw) as UserTemplateFile;
      if (!Array.isArray(data.elements)) return null;
      return { ...data, elementCount: data.elements.length };
    } catch {
      return null;
    }
  }

  async save(input: {
    readonly name: string;
    readonly versionSchema: string;
    readonly elements: ReadonlyArray<OpaqueBoardElement>;
  }): Promise<UserTemplate> {
    const id = generateUserTemplateId();
    const file: UserTemplateFile = {
      id,
      name: input.name,
      createdAt: Date.now(),
      versionSchema: input.versionSchema,
      elements: input.elements,
    };
    await fs.promises.writeFile(this.filePath(id), JSON.stringify(file, null, 2), 'utf8');
    return { ...file, elementCount: file.elements.length };
  }

  async delete(id: string): Promise<void> {
    const p = this.filePath(id);
    if (fs.existsSync(p)) {
      await fs.promises.unlink(p);
    }
  }
}

/** `tpl-` + 14자 url-safe — FileBoardRepository.generateBoardId 와 동일 관습 */
function generateUserTemplateId(): string {
  const raw = crypto
    .randomBytes(11)
    .toString('base64')
    .replace(/\+/g, '_')
    .replace(/\//g, '-')
    .replace(/=/g, '')
    .slice(0, USER_TEMPLATE_ID_SUFFIX_LENGTH);
  return `${USER_TEMPLATE_ID_PREFIX}${raw}`;
}
