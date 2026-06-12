/**
 * FileUserTemplateRepo 라운드트립 테스트 (PDCA-4 / G006, plan AC-4.x)
 * save → list → load → delete + 손상 파일 관용.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { FileUserTemplateRepo } from './FileUserTemplateRepo';

let tmpDir: string;
let repo: FileUserTemplateRepo;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssampin-tpl-'));
  repo = new FileUserTemplateRepo(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const ELEMENTS = [
  { id: 'el-1', type: 'rectangle', x: 0, y: 0, isDeleted: false },
  { id: 'el-2', type: 'text', text: '메모', containerId: 'el-1', isDeleted: false },
];

describe('FileUserTemplateRepo', () => {
  it('save → load 라운드트립: 요소 verbatim + 메타 보존', async () => {
    const saved = await repo.save({
      name: '수업 시작 보드',
      versionSchema: '0.17.6',
      elements: ELEMENTS,
    });
    expect(saved.id.startsWith('tpl-')).toBe(true);
    expect(saved.elementCount).toBe(2);

    const loaded = await repo.load(saved.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.name).toBe('수업 시작 보드');
    expect(loaded?.versionSchema).toBe('0.17.6');
    expect(loaded?.elements).toEqual(ELEMENTS);
  });

  it('파일이 templates/ 디렉터리에 {id}.json 으로 생긴다 (plan AC-4.1)', async () => {
    const saved = await repo.save({
      name: 't',
      versionSchema: '0.17.6',
      elements: ELEMENTS,
    });
    const p = path.join(tmpDir, 'data', 'boards', 'templates', `${saved.id}.json`);
    expect(fs.existsSync(p)).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(p, 'utf8')) as { elements: unknown[] };
    expect(onDisk.elements).toHaveLength(2);
  });

  it('listAll 은 최신순 메타만 돌려준다 (요소 페이로드 없음)', async () => {
    const a = await repo.save({ name: 'A', versionSchema: '0.17.6', elements: ELEMENTS });
    // createdAt 차이 보장
    await new Promise((r) => setTimeout(r, 5));
    const b = await repo.save({ name: 'B', versionSchema: '0.17.6', elements: [ELEMENTS[0]!] });

    const list = await repo.listAll();
    expect(list.map((t) => t.id)).toEqual([b.id, a.id]);
    expect(list[0]!.elementCount).toBe(1);
    expect('elements' in list[0]!).toBe(false);
  });

  it('delete 는 파일을 지우고, 없는 id 는 조용히 무시한다 (plan AC-4.3)', async () => {
    const saved = await repo.save({ name: 't', versionSchema: '0.17.6', elements: ELEMENTS });
    await repo.delete(saved.id);
    expect(await repo.load(saved.id)).toBeNull();
    expect(await repo.listAll()).toEqual([]);
    await expect(repo.delete('tpl-nonexistent')).resolves.toBeUndefined();
  });

  it('손상된 JSON 파일은 목록·로드에서 조용히 제외한다', async () => {
    const good = await repo.save({ name: 'ok', versionSchema: '0.17.6', elements: ELEMENTS });
    const dir = path.join(tmpDir, 'data', 'boards', 'templates');
    fs.writeFileSync(path.join(dir, 'tpl-corrupted0001.json'), '{not json', 'utf8');

    const list = await repo.listAll();
    expect(list.map((t) => t.id)).toEqual([good.id]);
    expect(await repo.load('tpl-corrupted0001')).toBeNull();
  });
});
