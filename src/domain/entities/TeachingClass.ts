export interface TeachingClassStudent {
  readonly number: number;
  readonly name: string;
  readonly memo?: string;
}

export interface TeachingClass {
  readonly id: string;
  readonly name: string;
  readonly subject: string;
  readonly students: readonly TeachingClassStudent[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TeachingClassesData {
  readonly classes: readonly TeachingClass[];
}
