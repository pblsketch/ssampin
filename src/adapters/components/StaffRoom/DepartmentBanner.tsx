/**
 * 온라인 교무실 — 부서 배너 (M4)
 *
 * 계획서 §6 — "배너 (골라 놓은 그림 또는 올린 사진 + 부서 이름·한 줄 소개)"
 *
 * ★ 하드코딩 HEX 를 쓰지 않는다. 고르는 값은 `sp-*` 토큰 이름이라
 *   다크 모드에서 함께 어두워진다. 색을 직접 박으면 밤에 눈이 아프다.
 *
 * ★ 사진 배너는 아직 고를 수 없다. 그림을 띄우려면 `drive.file` 권한 탓에
 *   서버가 권한을 준 뒤 구글 뷰어로 열어야 하는데(§3.2.1), 배너처럼 화면에
 *   늘 떠 있는 자리에는 그 방식이 맞지 않는다. 색과 준비된 그림만 고른다.
 */
import { useState } from 'react';
import { useStaffRoomRoomsStore } from '@adapters/stores/useStaffRoomRoomsStore';
import { canManageModules } from '@domain/rules/staffRoomRoomRules';
import {
  STAFFROOM_BANNER_COLORS,
  type StaffRoomBanner,
  type StaffRoomBannerColor,
} from '@domain/entities/StaffRoomRooms';
import type { StaffRoomRole } from '@domain/entities/StaffRoom';

interface DepartmentBannerProps {
  departmentId: string;
  name: string;
  description: string | null;
  memberCount: number;
  myRole: StaffRoomRole;
}

/** 색 이름 → 배경 클래스. 토큰만 쓴다(하드코딩 HEX 금지) */
const COLOR_CLASS: Readonly<Record<StaffRoomBannerColor, string>> = {
  accent: 'bg-sp-accent',
  highlight: 'bg-sp-highlight',
  success: 'bg-sp-success',
  info: 'bg-sp-info',
  muted: 'bg-sp-muted',
};

/** 색 이름 → 사람이 읽는 이름 */
const COLOR_LABEL: Readonly<Record<StaffRoomBannerColor, string>> = {
  accent: '기본',
  highlight: '노랑',
  success: '초록',
  info: '파랑',
  muted: '회색',
};

/** 고른 색이 목록에 없으면 기본으로 (예전 값이나 잘못된 값이 와도 화면이 깨지지 않게) */
function colorOf(banner: StaffRoomBanner): StaffRoomBannerColor {
  const found = STAFFROOM_BANNER_COLORS.find((c) => c === banner.value);
  return found ?? 'accent';
}

export function DepartmentBanner({
  departmentId,
  name,
  description,
  memberCount,
  myRole,
}: DepartmentBannerProps) {
  const banner = useStaffRoomRoomsStore((s) => s.banner);
  const saveBanner = useStaffRoomRoomsStore((s) => s.saveBanner);
  const [picking, setPicking] = useState(false);

  const isAdmin = canManageModules(myRole);
  const color = colorOf(banner);

  return (
    <div>
      <div className={`relative overflow-hidden rounded-2xl ${COLOR_CLASS[color]} px-6 py-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-sp-bold text-white">{name}</h1>
            {description && <p className="mt-1 text-sm text-white/85">{description}</p>}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-sp-medium text-white">
              <span className="material-symbols-outlined text-icon-sm">group</span>
              멤버 {memberCount}명
            </span>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setPicking((v) => !v)}
                aria-label="배너 꾸미기"
                title="배너 꾸미기"
                aria-expanded={picking}
                className="rounded-full bg-white/20 p-1.5 text-white transition-colors hover:bg-white/30"
              >
                <span className="material-symbols-outlined text-icon-sm">palette</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {isAdmin && picking && (
        <div className="mt-2 rounded-xl border border-sp-border bg-sp-card p-4">
          <h4 className="text-sm font-sp-semibold text-sp-text">배너 색</h4>
          <p className="mt-1 text-xs leading-relaxed text-sp-muted">
            부서가 여럿일 때 목록에서 한눈에 갈라 보이라고 두는 색입니다. 다크 모드에서는 함께
            어두워집니다.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {STAFFROOM_BANNER_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => void saveBanner(departmentId, { kind: 'color', value: option })}
                aria-label={`${COLOR_LABEL[option]} 배너`}
                aria-pressed={color === option}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-sp-medium transition-colors ${
                  color === option
                    ? 'border-sp-accent text-sp-text'
                    : 'border-sp-border text-sp-muted hover:text-sp-text'
                }`}
              >
                <span className={`h-4 w-4 rounded-full ${COLOR_CLASS[option]}`} />
                {COLOR_LABEL[option]}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-sp-muted">사진 배너는 다음 작업에서 열립니다.</p>
        </div>
      )}
    </div>
  );
}
