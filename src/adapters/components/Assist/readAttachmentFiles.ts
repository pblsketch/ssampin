/**
 * 파일 선택·붙여넣기·끌어다 놓기로 들어온 `File` 을 첨부 후보로 읽는다(base64).
 *
 * 형식·크기 판정은 하지 않는다 — 그건 스토어(`addAttachments`)가 도메인 규칙으로 한다.
 * 여기는 브라우저 API(FileReader)를 만지는 자리일 뿐이다.
 */
import type { AssistAttachmentCandidate } from '@domain/entities/AssistAttachment';

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : '';
      // "data:image/png;base64,....." 에서 본문만.
      const comma = url.indexOf(',');
      resolve(comma >= 0 ? url.slice(comma + 1) : '');
    };
    reader.readAsDataURL(file);
  });
}

/** 붙여넣은 스크린샷은 이름이 "image.png" 로 온다 — 여러 장이면 구분이 안 돼 번호를 붙인다. */
function displayName(file: File, index: number, total: number): string {
  if (file.name && file.name !== 'image.png') return file.name;
  const ext = file.type.split('/')[1] ?? 'png';
  return total > 1 ? `붙여넣은 이미지 ${index + 1}.${ext}` : `붙여넣은 이미지.${ext}`;
}

export async function readAttachmentFiles(
  files: Iterable<File>,
): Promise<AssistAttachmentCandidate[]> {
  const list = [...files];
  const out: AssistAttachmentCandidate[] = [];
  for (const [i, file] of list.entries()) {
    out.push({
      id: newId(),
      name: displayName(file, i, list.length),
      mediaType: file.type,
      bytes: file.size,
      dataBase64: await readAsBase64(file),
    });
  }
  return out;
}

/** 클립보드·드롭 자료에서 이미지 파일만 골라낸다. 글만 붙여넣은 경우엔 빈 배열. */
export function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const f = item.getAsFile();
    if (f) out.push(f);
  }
  return out;
}
