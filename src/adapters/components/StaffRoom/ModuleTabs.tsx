/**
 * 온라인 교무실 — 공간(모듈) 탭 (M4)
 *
 * 계획서 §6 — "모듈은 **종류를 고르고 이름을 자유롭게 붙인다.**
 * 예: 자료실을 '공문 보관함', 갤러리를 '체육대회 사진'."
 *
 * 그래서 탭을 코드에 박아 두지 않고 부서의 공간 목록에서 그린다.
 * 관리자에게만 관리 단추가 보이고, 이름 바꾸기·순서·지우기도 여기서 한다.
 *
 * **셋으로 나눠 둔 이유** (2026-08-22 오너 지적):
 *   관리 단추가 공간 탭 바로 뒤에 붙어 있어서 '일정·업무 / 멤버 / 초대' 앞에 끼어
 *   줄 한가운데에 놓였다. 관리 단추는 탭이 아니라 **줄 전체의 오른쪽 끝**에 있어야 한다.
 *   그러려면 다른 탭들보다 뒤에 놓여야 하는데, 한 덩어리로 묶여 있으면 그 사이에
 *   다른 탭을 끼워 넣을 수 없다. 그래서 부모(DepartmentDetail)가 배치를 정하도록
 *   `ModuleTabList`(탭들) · `ModuleManageToggle`(관리 단추) · `ModuleManagePanel`(관리 패널)
 *   셋으로 나눴다.
 *
 *   패널도 이참에 탭 줄 **바깥**으로 내보냈다 — 전에는 `role="tablist"` 안에 들어가 있어서
 *   화면을 읽어 주는 도구에 "탭 목록 안의 패널"로 잘못 전달됐다.
 */
import { useState } from 'react';
import { useTextPrompt } from '@adapters/components/common/TextPromptModal';
import { useStaffRoomRoomsStore } from '@adapters/stores/useStaffRoomRoomsStore';
import {
  canDeleteModule,
  canManageModules,
  checkModuleName,
  defaultModuleName,
} from '@domain/rules/staffRoomRoomRules';
import {
  STAFFROOM_MODULE_ICONS,
  STAFFROOM_MODULE_NAME_MAX_LENGTH,
} from '@domain/entities/StaffRoomRooms';
import type { StaffRoomModule, StaffRoomModuleKind } from '@domain/entities/StaffRoomBoard';
import type { StaffRoomRole } from '@domain/entities/StaffRoom';

/** 만들 수 있는 종류 — 계획서 §6 의 다섯 가지 전부 */
const ADDABLE_KINDS: readonly StaffRoomModuleKind[] = [
  'board',
  'archive',
  'discussion',
  'gallery',
  'minutes',
];

interface ModuleTabListProps {
  modules: readonly StaffRoomModule[];
  activeModuleId: string | null;
  onSelect: (moduleId: string) => void;
}

/**
 * 공간 탭들. 부모의 탭 줄에 그대로 늘어놓을 수 있게 조각(fragment)으로 돌려준다 —
 * 감싸는 상자를 두면 '일정·업무 / 멤버 / 초대'와 한 줄로 정렬되지 않는다.
 */
export function ModuleTabList({ modules, activeModuleId, onSelect }: ModuleTabListProps) {
  return (
    <>
      {modules.map((module) => (
        <button
          key={module.id}
          type="button"
          role="tab"
          aria-selected={activeModuleId === module.id}
          onClick={() => onSelect(module.id)}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-sp-medium transition-colors ${
            activeModuleId === module.id
              ? 'border-sp-accent text-sp-text'
              : 'border-transparent text-sp-muted hover:text-sp-text'
          }`}
        >
          <span className="material-symbols-outlined text-icon-sm">
            {STAFFROOM_MODULE_ICONS[module.kind] ?? 'widgets'}
          </span>
          {module.name}
        </button>
      ))}
    </>
  );
}

interface ModuleManageToggleProps {
  myRole: StaffRoomRole;
  managing: boolean;
  onToggle: () => void;
}

/**
 * 공간 관리 단추 — 관리자에게만.
 *
 * `ml-auto` 로 탭 줄의 **오른쪽 끝**으로 민다. 탭이 아니라 패널을 여닫는 단추라서
 * `role="tab"` 을 주지 않고 `aria-expanded` 로 열림 상태를 알린다.
 */
export function ModuleManageToggle({ myRole, managing, onToggle }: ModuleManageToggleProps) {
  if (!canManageModules(myRole)) return null;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="공간 관리"
      aria-expanded={managing}
      title="공간 관리"
      className={`-mb-px ml-auto border-b-2 px-2.5 py-2.5 transition-colors ${
        managing
          ? 'border-sp-accent text-sp-text'
          : 'border-transparent text-sp-muted hover:text-sp-text'
      }`}
    >
      <span className="material-symbols-outlined text-icon-sm">tune</span>
    </button>
  );
}

interface ModuleManagePanelProps {
  departmentId: string;
  modules: readonly StaffRoomModule[];
  myRole: StaffRoomRole;
}

/** 공간 관리 패널 — 탭 줄 바깥(아래)에 그린다 */
export function ModuleManagePanel({ departmentId, modules, myRole }: ModuleManagePanelProps) {
  const { prompt, promptElement } = useTextPrompt();
  const addModule = useStaffRoomRoomsStore((s) => s.addModule);
  const renameModule = useStaffRoomRoomsStore((s) => s.renameModule);
  const moveModule = useStaffRoomRoomsStore((s) => s.moveModule);
  const removeModule = useStaffRoomRoomsStore((s) => s.removeModule);

  const [adding, setAdding] = useState(false);
  const [newKind, setNewKind] = useState<StaffRoomModuleKind>('discussion');
  const [newName, setNewName] = useState(defaultModuleName('discussion'));

  const isAdmin = canManageModules(myRole);

  const submitAdd = async () => {
    const named = checkModuleName(newName);
    if (!named.ok) return;
    const ok = await addModule(departmentId, newKind, named.value);
    if (ok) {
      setAdding(false);
      setNewKind('discussion');
      setNewName(defaultModuleName('discussion'));
    }
  };

  const handleRename = async (module: StaffRoomModule) => {
    // window.prompt 는 Electron 에서 동작하지 않아 이름 바꾸기가 먹통이었다(2026-09-01).
    // 검사는 모달 안에서 한다 — 닫고 나서 "안 된다"고 알리면 쓴 내용이 날아간다.
    const next = await prompt({
      title: '공간 이름 바꾸기',
      label: `"${module.name}"의 새 이름을 적어주세요.`,
      initialValue: module.name,
      confirmLabel: '바꾸기',
      validate: (value) => {
        const check = checkModuleName(value);
        return check.ok ? null : check.message;
      },
    });
    if (next === null) return;
    const named = checkModuleName(next);
    if (!named.ok) return;
    await renameModule(departmentId, module.id, named.value);
  };

  const handleDelete = async (module: StaffRoomModule) => {
    // 마지막 게시판·자료실은 서버도 막지만, 여기서 먼저 이유를 알려준다
    const decision = canDeleteModule(
      modules.map((m) => ({ id: m.id, kind: m.kind })),
      module.id,
    );
    if (!decision.ok) {
      window.alert(decision.message);
      return;
    }
    const ok = window.confirm(
      `"${module.name}"을(를) 지울까요?\n\n안에 있던 글과 자료도 함께 사라지고 되돌릴 수 없습니다.`,
    );
    if (ok) await removeModule(departmentId, module.id);
  };

  if (!isAdmin) return null;

  return (
    <>
      {promptElement}
      <div className="mb-6 rounded-xl border border-sp-border bg-sp-card p-4">
        <h4 className="text-sm font-sp-semibold text-sp-text">공간 관리</h4>
        <p className="mt-1 text-xs leading-relaxed text-sp-muted">
          이름을 부서에서 실제로 부르는 말로 바꿀 수 있습니다. 예를 들어 자료실을 &lsquo;공문
          보관함&rsquo;으로.
        </p>

        <ul className="mt-3 space-y-1.5">
          {modules.map((module, index) => (
            <li
              key={module.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-sp-border bg-sp-surface px-3 py-2"
            >
              <span className="material-symbols-outlined text-icon-sm text-sp-muted">
                {STAFFROOM_MODULE_ICONS[module.kind] ?? 'widgets'}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-sp-text">{module.name}</span>

              <button
                type="button"
                onClick={() => void moveModule(departmentId, module.id, 'up')}
                disabled={index === 0}
                aria-label={`${module.name} 앞으로`}
                className="rounded-lg p-1.5 text-sp-muted transition-colors hover:text-sp-text disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-icon-sm">arrow_upward</span>
              </button>
              <button
                type="button"
                onClick={() => void moveModule(departmentId, module.id, 'down')}
                disabled={index === modules.length - 1}
                aria-label={`${module.name} 뒤로`}
                className="rounded-lg p-1.5 text-sp-muted transition-colors hover:text-sp-text disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-icon-sm">arrow_downward</span>
              </button>
              <button
                type="button"
                onClick={() => void handleRename(module)}
                aria-label={`${module.name} 이름 바꾸기`}
                className="rounded-lg p-1.5 text-sp-muted transition-colors hover:text-sp-text"
              >
                <span className="material-symbols-outlined text-icon-sm">edit</span>
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(module)}
                aria-label={`${module.name} 지우기`}
                className="rounded-lg p-1.5 text-sp-muted transition-colors hover:text-sp-danger"
              >
                <span className="material-symbols-outlined text-icon-sm">delete</span>
              </button>
            </li>
          ))}
        </ul>

        {adding ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={newKind}
              onChange={(e) => {
                const kind = e.target.value as StaffRoomModuleKind;
                setNewKind(kind);
                setNewName(defaultModuleName(kind));
              }}
              aria-label="공간 종류"
              className="rounded-xl border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text focus:border-sp-accent focus:outline-none"
            >
              {ADDABLE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {defaultModuleName(kind)}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={STAFFROOM_MODULE_NAME_MAX_LENGTH}
              placeholder="부를 이름"
              aria-label="공간 이름"
              className="min-w-0 flex-1 rounded-xl border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void submitAdd()}
              disabled={!checkModuleName(newName).ok}
              className="rounded-xl bg-sp-accent px-4 py-2 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out hover:shadow-sp-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              만들기
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-xl border border-sp-border px-3 py-2 text-sm font-sp-medium text-sp-text transition-colors hover:bg-sp-surface"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-3 flex items-center gap-1.5 rounded-xl border border-sp-border px-3 py-2 text-sm font-sp-medium text-sp-text transition-colors hover:bg-sp-surface"
          >
            <span className="material-symbols-outlined text-icon-sm">add</span>새 공간 만들기
          </button>
        )}
      </div>
    </>
  );
}
