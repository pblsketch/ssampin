export interface ClassRoster {
  readonly id: string;
  readonly name: string;
  readonly studentNames: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ClassRostersData {
  readonly rosters: readonly ClassRoster[];
}
