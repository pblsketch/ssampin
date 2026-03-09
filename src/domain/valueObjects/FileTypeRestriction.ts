export type FileTypeRestriction = 'all' | 'image' | 'document';

export const FILE_TYPE_RESTRICTIONS: readonly FileTypeRestriction[] = [
  'all',
  'image',
  'document',
] as const;

/** 허용 파일 확장자 목록 */
export const FILE_TYPE_EXTENSIONS: Record<FileTypeRestriction, readonly string[]> = {
  all: [],
  image: ['jpg', 'jpeg', 'png', 'gif', 'heic', 'webp'],
  document: ['pdf', 'hwp', 'hwpx', 'docx', 'doc', 'pptx', 'xlsx', 'txt'],
};

/** 보안상 항상 차단하는 확장자 */
export const BLOCKED_EXTENSIONS: readonly string[] = [
  'exe', 'bat', 'cmd', 'scr', 'msi', 'com', 'pif',
  'js', 'vbs', 'wsf', 'ps1', 'sh',
] as const;

/** 파일 확장자가 허용되는지 확인 */
export function isAllowedFileType(
  fileName: string,
  restriction: FileTypeRestriction,
): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return false;
  }

  if (restriction === 'all') {
    return true;
  }

  return FILE_TYPE_EXTENSIONS[restriction].includes(ext);
}

/** HTML input accept 속성용 문자열 생성 */
export function getAcceptAttribute(restriction: FileTypeRestriction): string {
  if (restriction === 'all') {
    return '*/*';
  }

  return FILE_TYPE_EXTENSIONS[restriction]
    .map((ext) => `.${ext}`)
    .join(',');
}
