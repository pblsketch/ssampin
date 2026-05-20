/**
 * FreestylePresetDialog — 자유 배치 프리셋 선택 다이얼로그
 *
 * 사용자 흐름:
 * 1. 자유 배치 모드에서 「프리셋」 버튼 클릭 → 다이얼로그 오픈
 * 2. 시험 대형 또는 ㄷ자형 선택
 * 3. 시험 대형 — 열 수 + 학번 정렬 방향(좌→우 / 우→좌) 선택
 *    ㄷ자형 — 안내만 표시
 * 4. 「적용」 클릭 → `applyFreestylePreset` 호출
 *
 * 정책:
 * - 「모둠형」은 기존 자리배치 「모둠」 모드와 기능 중복으로 자유 배치에서는 제외
 * - 시험 대형은 학생을 학번 오름차순으로 정렬해 책상에 배정
 * - 모든 UI 텍스트 한국어 + sp-* 토큰만 사용
 */
import { useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useSeatingStore } from '@adapters/stores/useSeatingStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { isStudentActive } from '@domain/rules/studentActivity';
import type { FreestylePresetType } from '@domain/entities/Seating';

interface FreestylePresetDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PresetOption {
  type: FreestylePresetType;
  label: string;
  desc: string;
  icon: string;
}

const PRESET_OPTIONS: PresetOption[] = [
  { type: 'exam', label: '시험 대형', desc: '학번 순 줄배치 (방향 선택)', icon: 'view_module' },
  { type: 'ushape', label: 'ㄷ자형', desc: '토론·발표 수업 (3면 배치)', icon: 'crop_3_2' },
];

type NumberDirection = 'left-to-right' | 'right-to-left';

export function FreestylePresetDialog({ isOpen, onClose }: FreestylePresetDialogProps) {
  const applyPreset = useSeatingStore((s) => s.applyFreestylePreset);
  const students = useStudentStore((s) => s.students);
  const activeStudents = students.filter(isStudentActive);
  const defaultStudentCount = activeStudents.length;

  const [selectedType, setSelectedType] = useState<FreestylePresetType>('exam');
  // 시험 대형 전용 옵션
  const [columns, setColumns] = useState(6);
  const [numberDirection, setNumberDirection] = useState<NumberDirection>('left-to-right');
  const [applying, setApplying] = useState(false);

  /** 시험 대형에 들어갈 학생 id 목록 — 학번 오름차순 정렬 (학번 없으면 끝). */
  const sortedActiveIds = [...activeStudents]
    .sort((a, b) => {
      const na = a.studentNumber ?? Number.POSITIVE_INFINITY;
      const nb = b.studentNumber ?? Number.POSITIVE_INFINITY;
      return na - nb;
    })
    .map((s) => s.id);

  const handleApply = async () => {
    setApplying(true);
    try {
      if (selectedType === 'exam') {
        await applyPreset({
          type: 'exam',
          studentCount: defaultStudentCount,
          studentIds: sortedActiveIds,
          columns,
          numberDirection,
        });
      } else if (selectedType === 'ushape') {
        await applyPreset({
          type: 'ushape',
          studentCount: defaultStudentCount,
          studentIds: sortedActiveIds,
        });
      } else {
        // 기타 type (현재 다이얼로그에서 노출 안 됨)은 기본 호출
        await applyPreset({
          type: selectedType,
          studentCount: defaultStudentCount,
          studentIds: sortedActiveIds,
        });
      }
      onClose();
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="자유 배치 프리셋 선택" srOnlyTitle size="md">
      <div className="flex flex-col gap-5 p-6">
        <div>
          <h2 className="text-lg font-bold text-sp-text mb-1">자유 배치 프리셋 선택</h2>
          <p className="text-sm text-sp-muted">
            학생 {defaultStudentCount}명을 어떤 형태로 배치할까요?
          </p>
        </div>

        {/* 프리셋 카드 (2종) */}
        <div className="grid grid-cols-2 gap-3">
          {PRESET_OPTIONS.map((preset) => (
            <button
              key={preset.type}
              type="button"
              onClick={() => setSelectedType(preset.type)}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                selectedType === preset.type
                  ? 'border-sp-accent bg-sp-accent/10 text-sp-accent'
                  : 'border-sp-border bg-sp-card hover:border-sp-accent/40 text-sp-text'
              }`}
            >
              <span className="material-symbols-outlined text-3xl">{preset.icon}</span>
              <span className="text-sm font-medium">{preset.label}</span>
              <span className="text-xs text-sp-muted text-center leading-tight">{preset.desc}</span>
            </button>
          ))}
        </div>

        {/* 프리셋별 추가 옵션 */}
        {selectedType === 'exam' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <label className="text-sm text-sp-text">열 수:</label>
              <select
                value={columns}
                onChange={(e) => setColumns(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg border border-sp-border bg-sp-card text-sm text-sp-text"
              >
                {[4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n}열
                  </option>
                ))}
              </select>
              <span className="text-xs text-sp-muted">
                ({Math.ceil(defaultStudentCount / columns)}행 예상)
              </span>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm text-sp-text">학번 시작 위치:</label>
              <div className="inline-flex rounded-lg border border-sp-border bg-sp-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setNumberDirection('left-to-right')}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    numberDirection === 'left-to-right'
                      ? 'bg-sp-accent text-white'
                      : 'text-sp-muted hover:text-sp-text'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm align-middle mr-1">
                    arrow_forward
                  </span>
                  좌측부터
                </button>
                <button
                  type="button"
                  onClick={() => setNumberDirection('right-to-left')}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    numberDirection === 'right-to-left'
                      ? 'bg-sp-accent text-white'
                      : 'text-sp-muted hover:text-sp-text'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm align-middle mr-1">
                    arrow_back
                  </span>
                  우측부터
                </button>
              </div>
            </div>

            <p className="text-xs text-sp-muted bg-sp-surface rounded-lg px-3 py-2">
              {numberDirection === 'left-to-right'
                ? '맨 앞줄 가장 왼쪽 책상부터 출석부 1번이 앉습니다.'
                : '맨 앞줄 가장 오른쪽 책상부터 출석부 1번이 앉습니다.'}
            </p>
          </div>
        )}

        {selectedType === 'ushape' && (
          <p className="text-xs text-sp-muted bg-sp-surface rounded-lg px-3 py-2">
            ㄷ자형은 학생 수에 따라 좌측·하단·우측 3면에 자동 분배됩니다. 교탁은 열린 면(상단)에
            배치됩니다.
          </p>
        )}

        {/* 액션 버튼 */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-sp-surface text-sm font-medium text-sp-text transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={applying || defaultStudentCount === 0}
            className="px-4 py-2 rounded-lg bg-sp-accent text-white hover:bg-sp-accent/90 text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {applying ? '적용 중...' : '적용'}
          </button>
        </div>

        {defaultStudentCount === 0 && (
          <p className="text-xs text-red-500">
            활성 학생이 없어 프리셋을 적용할 수 없습니다. 학생 명단을 먼저 등록해 주세요.
          </p>
        )}
      </div>
    </Modal>
  );
}
