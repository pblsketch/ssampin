/**
 * 「내 작성 방식」 목록 다루기 — 저장·복제·이름 바꾸기·삭제(순수).
 *
 * ★스토어가 아니라 **순수 함수**로 둔다. 목록을 다루는 규칙(상한·이름 중복·정렬·읽을 수 없는 값 버리기)은
 *   화면이 아니라 여기서 검사해야 테스트로 고정된다.
 * ★학생 원문·근거·초안 본문은 들어오지 않는다. 이름과 구성뿐이다.
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지.
 */
import {
  RECORD_STYLE_CATALOG_VERSION,
  RECORD_STYLE_INSTRUCTION_MAX,
  RECORD_STYLE_PRESET_MAX,
  type RecordStylePreset,
  type RecordWritingStyle,
} from '../entities/RecordWritingStyle';

export type PresetError = 'empty-name' | 'duplicate-name' | 'full' | 'not-found';

export interface PresetResult {
  readonly ok: boolean;
  readonly presets: readonly RecordStylePreset[];
  readonly error?: PresetError;
  /** 새로 만들어진 항목의 id(저장·복제일 때). */
  readonly id?: string;
}

/** 추가 지시는 상한까지만 남긴다. 빈 문자열이면 칸 자체를 없앤다(부재와 빈 값을 구별). */
export function normalizeStyle(style: RecordWritingStyle): RecordWritingStyle {
  const instruction = (style.instruction ?? '').trim().slice(0, RECORD_STYLE_INSTRUCTION_MAX);
  const base: RecordWritingStyle = {
    focus: style.focus,
    opening: style.opening,
    grouping: style.grouping,
    ...(style.disabledModules && style.disabledModules.length > 0
      ? { disabledModules: [...style.disabledModules] }
      : {}),
    ...(style.extraModules && style.extraModules.length > 0
      ? { extraModules: [...style.extraModules] }
      : {}),
  };
  return instruction.length > 0 ? { ...base, instruction } : base;
}

function nameTaken(
  presets: readonly RecordStylePreset[],
  name: string,
  exceptId?: string,
): boolean {
  const key = name.trim();
  return presets.some((p) => p.id !== exceptId && p.name.trim() === key);
}

/** 저장 — 같은 이름이 이미 있으면 거절한다(조용히 덮어쓰면 선생님이 만든 것이 사라진다). */
export function addPreset(
  presets: readonly RecordStylePreset[],
  name: string,
  style: RecordWritingStyle,
  now: number,
  newId: string,
): PresetResult {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, presets, error: 'empty-name' };
  if (presets.length >= RECORD_STYLE_PRESET_MAX) return { ok: false, presets, error: 'full' };
  if (nameTaken(presets, trimmed)) return { ok: false, presets, error: 'duplicate-name' };
  const preset: RecordStylePreset = {
    id: newId,
    name: trimmed,
    style: normalizeStyle(style),
    catalogVersion: RECORD_STYLE_CATALOG_VERSION,
    createdAt: now,
    updatedAt: now,
  };
  return { ok: true, presets: [...presets, preset], id: newId };
}

/** 기존 항목의 구성을 지금 설정으로 바꾼다(이름은 그대로). */
export function updatePresetStyle(
  presets: readonly RecordStylePreset[],
  id: string,
  style: RecordWritingStyle,
  now: number,
): PresetResult {
  if (!presets.some((p) => p.id === id)) return { ok: false, presets, error: 'not-found' };
  return {
    ok: true,
    presets: presets.map((p) =>
      p.id === id
        ? {
            ...p,
            style: normalizeStyle(style),
            catalogVersion: RECORD_STYLE_CATALOG_VERSION,
            updatedAt: now,
          }
        : p,
    ),
    id,
  };
}

export function renamePreset(
  presets: readonly RecordStylePreset[],
  id: string,
  name: string,
  now: number,
): PresetResult {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, presets, error: 'empty-name' };
  if (!presets.some((p) => p.id === id)) return { ok: false, presets, error: 'not-found' };
  if (nameTaken(presets, trimmed, id)) return { ok: false, presets, error: 'duplicate-name' };
  return {
    ok: true,
    presets: presets.map((p) => (p.id === id ? { ...p, name: trimmed, updatedAt: now } : p)),
    id,
  };
}

/** 복제 — 이름 뒤에 "(사본)" 을 붙이고, 그 이름도 이미 있으면 번호를 올린다. */
export function duplicatePreset(
  presets: readonly RecordStylePreset[],
  id: string,
  now: number,
  newId: string,
): PresetResult {
  const src = presets.find((p) => p.id === id);
  if (!src) return { ok: false, presets, error: 'not-found' };
  if (presets.length >= RECORD_STYLE_PRESET_MAX) return { ok: false, presets, error: 'full' };
  let name = `${src.name} (사본)`;
  for (let n = 2; nameTaken(presets, name); n += 1) name = `${src.name} (사본 ${n})`;
  return {
    ok: true,
    presets: [...presets, { ...src, id: newId, name, createdAt: now, updatedAt: now }],
    id: newId,
  };
}

/** 삭제. ★지워도 그 방식으로 만든 초안·판은 그대로 남는다(판에 발자국이 박혀 있다). */
export function removePreset(presets: readonly RecordStylePreset[], id: string): PresetResult {
  if (!presets.some((p) => p.id === id)) return { ok: false, presets, error: 'not-found' };
  return { ok: true, presets: presets.filter((p) => p.id !== id) };
}

export const PRESET_ERROR_MESSAGES: Readonly<Record<PresetError, string>> = {
  'empty-name': '이름을 적어 주세요.',
  'duplicate-name': '같은 이름이 이미 있습니다.',
  full: `저장할 수 있는 작성 방식은 ${RECORD_STYLE_PRESET_MAX}개까지입니다.`,
  'not-found': '그 작성 방식을 찾지 못했습니다.',
};
