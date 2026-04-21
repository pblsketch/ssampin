export class BuiltinFormProtectedError extends Error {
  constructor() {
    super('내장 서식은 삭제할 수 없습니다');
    this.name = 'BuiltinFormProtectedError';
  }
}

export class CategoryInUseError extends Error {
  readonly count: number;
  constructor(count: number) {
    super(`이 카테고리를 사용하는 서식이 ${count}개 있습니다`);
    this.name = 'CategoryInUseError';
    this.count = count;
  }
}

export class FormFileMissingError extends Error {
  readonly id: string;
  constructor(id: string) {
    super(`서식 파일을 찾을 수 없습니다: ${id}`);
    this.name = 'FormFileMissingError';
    this.id = id;
  }
}
