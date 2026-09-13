const owners = new Map<string, symbol>();

export function acquireRecordMapExecution(runId: string, owner: symbol): boolean {
  const current = owners.get(runId);
  if (current !== undefined && current !== owner) return false;
  owners.set(runId, owner);
  return true;
}

export function releaseRecordMapExecution(runId: string, owner: symbol): void {
  if (owners.get(runId) === owner) owners.delete(runId);
}

export function isRecordMapExecuting(runId: string): boolean {
  return owners.has(runId);
}
