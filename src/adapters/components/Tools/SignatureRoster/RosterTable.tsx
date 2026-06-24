/**
 * 서명받기 — 명단 미리보기·편집 테이블.
 *
 * 불러온 명단을 표로 보여 주고 셀을 바로 고칠 수 있다.
 * 열 편집기에서 추가한 커스텀 열이 즉시 표에 나타나므로
 * "열 편집 ↔ 명단"이 한 화면에서 맞물려 보인다.
 */
import { useMemo } from 'react';
import type { ColumnDef, RosterMember } from '@domain/entities/SignatureRoster';
import { makeMemberId, rosterInputColumns } from './signatureRosterLogic';

interface RosterTableProps {
  readonly members: readonly RosterMember[];
  readonly columns: readonly ColumnDef[];
  readonly onChange: (members: RosterMember[]) => void;
}

export function RosterTable({ members, columns, onChange }: RosterTableProps) {
  const inputColumns = useMemo(() => rosterInputColumns(columns), [columns]);

  const updateMember = (id: string, patch: Partial<RosterMember>) => {
    onChange(members.map((member) => (member.id === id ? { ...member, ...patch } : member)));
  };

  const updateField = (id: string, key: string, value: string) => {
    onChange(
      members.map((member) =>
        member.id === id ? { ...member, fields: { ...member.fields, [key]: value } } : member,
      ),
    );
  };

  const removeMember = (id: string) => {
    onChange(members.filter((member) => member.id !== id));
  };

  const addMember = () => {
    onChange([
      ...members,
      {
        id: makeMemberId(),
        name: '',
        affiliation: undefined,
        fields: { no: String(members.length + 1) },
      },
    ]);
  };

  const clearAll = () => {
    const ok = window.confirm(`명단 ${members.length}명을 모두 지울까요?`);
    if (ok) onChange([]);
  };

  if (members.length === 0) {
    return (
      <div className="rounded-xl bg-sp-card p-4 text-center">
        <p className="text-sm text-sp-muted">
          아직 명단이 비어 있어요. 위에서 학급 명렬을 불러오거나 붙여넣기로 채워 주세요.
        </p>
        <button
          type="button"
          onClick={addMember}
          className="mt-3 rounded-lg border border-sp-border px-3 py-1.5 text-xs font-bold text-sp-text transition hover:border-sp-accent/60"
        >
          + 직접 한 명씩 입력하기
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="w-full overflow-x-auto rounded-xl border border-sp-border">
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full min-w-[480px] border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-sp-card">
              <tr>
                <th className="border-b border-sp-border p-2 text-left text-xs font-bold text-sp-muted">
                  연번
                </th>
                {inputColumns.map((column) => (
                  <th
                    key={column.key}
                    className="border-b border-sp-border p-2 text-left text-xs font-bold text-sp-muted"
                  >
                    {column.label}
                  </th>
                ))}
                <th className="w-10 border-b border-sp-border p-2" aria-label="행 삭제" />
              </tr>
            </thead>
            <tbody>
              {members.map((member, index) => (
                <tr key={member.id} className="bg-sp-surface">
                  <td className="border-b border-sp-border/50 p-2 text-xs text-sp-muted">
                    {member.fields.no ?? index + 1}
                  </td>
                  {inputColumns.map((column) => (
                    <td key={column.key} className="border-b border-sp-border/50 p-1.5">
                      <input
                        value={cellValue(member, column.key)}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (column.key === 'name') {
                            updateMember(member.id, { name: value });
                          } else if (column.key === 'affiliation') {
                            updateMember(member.id, { affiliation: value || undefined });
                          } else {
                            updateField(member.id, column.key, value);
                          }
                        }}
                        placeholder={column.key === 'name' ? '이름' : undefined}
                        className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm text-sp-text transition placeholder:text-sp-muted/60 hover:border-sp-border focus:border-sp-accent focus:bg-sp-card focus:outline-none"
                      />
                    </td>
                  ))}
                  <td className="border-b border-sp-border/50 p-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => removeMember(member.id)}
                      title={`${member.name || '이 행'} 삭제`}
                      className="rounded-lg p-1 text-sp-muted transition hover:bg-red-500/10 hover:text-red-300"
                    >
                      <span className="material-symbols-outlined text-icon-sm">close</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-sp-muted">
          총 <span className="font-bold text-sp-text">{members.length}명</span> · 칸을 눌러 바로
          고칠 수 있어요
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={addMember}
            className="rounded-lg border border-sp-border px-3 py-1.5 text-xs font-bold text-sp-text transition hover:border-sp-accent/60"
          >
            + 한 명 추가
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-500/10"
          >
            전체 비우기
          </button>
        </div>
      </div>
    </div>
  );
}

function cellValue(member: RosterMember, key: string): string {
  if (key === 'name') return member.name;
  if (key === 'affiliation') return member.affiliation ?? '';
  return member.fields[key] ?? '';
}
