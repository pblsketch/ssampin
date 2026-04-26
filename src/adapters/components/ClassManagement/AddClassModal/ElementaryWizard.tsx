import { useState, useCallback } from 'react';
import type { TeachingClassStudent } from '@domain/entities/TeachingClass';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { StepClassInfo } from './StepClassInfo';
import { StepSubjectSelect } from './StepSubjectSelect';
import { StepStudentRoster } from './StepStudentRoster';

interface ElementaryWizardProps {
  onClose: () => void;
  /** 기존 학급 그룹에 과목 추가 모드로 전환 (index에서 전달) */
  onSwitchToAddGroup?: () => void;
  /** 중등 Legacy 모달로 전환 */
  onSwitchToLegacy?: () => void;
}

type Step = 1 | 2 | 3;

/**
 * 초등/커스텀 학교급용 3단계 학급 추가 위자드.
 * Step 1: 학급명 입력
 * Step 2: 과목 선택 (시간표 기반 + 전담 구분 + 직접 추가)
 * Step 3: 학생 명렬 입력
 * 완료 시 addClassGroup으로 선택한 과목 수만큼 TeachingClass를 생성(동일 groupId).
 */
export function ElementaryWizard({
  onClose,
  onSwitchToAddGroup,
  onSwitchToLegacy,
}: ElementaryWizardProps) {
  const addClassGroup = useTeachingClassStore((s) => s.addClassGroup);
  const selectClass = useTeachingClassStore((s) => s.selectClass);
  const settingsClassName = useSettingsStore((s) => s.settings.className);

  const [step, setStep] = useState<Step>(1);
  const [className, setClassName] = useState<string>(settingsClassName ?? '');
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());

  const handleStep1Next = useCallback((name: string) => {
    setClassName(name);
    setStep(2);
  }, []);

  const handleStep2Next = useCallback((subjects: string[]) => {
    setSelectedSubjects(new Set(subjects));
    setStep(3);
  }, []);

  const handleComplete = useCallback(
    async (students: TeachingClassStudent[]) => {
      const subjects = [...selectedSubjects];
      if (subjects.length === 0) return;
      const { firstClassId } = await addClassGroup(className, subjects, students);
      if (firstClassId) {
        selectClass(firstClassId);
      }
      onClose();
    },
    [className, selectedSubjects, addClassGroup, selectClass, onClose],
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-sp-card border border-sp-border rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
        {/* 진행 인디케이터 */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-sp-text">학급 추가</h2>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`w-2 h-2 rounded-full transition-colors ${
                  step === n
                    ? 'bg-sp-accent'
                    : step > n
                      ? 'bg-sp-accent/50'
                      : 'bg-sp-border'
                }`}
              />
            ))}
            <span className="ml-2 text-detail text-sp-muted">
              {step} / 3
            </span>
          </div>
        </div>

        {step === 1 && (
          <StepClassInfo
            initialName={className}
            onNext={handleStep1Next}
            onCancel={onClose}
            {...(onSwitchToAddGroup ? { onSwitchToAddGroup } : {})}
            {...(onSwitchToLegacy ? { onSwitchToLegacy } : {})}
          />
        )}
        {step === 2 && (
          <StepSubjectSelect
            className={className}
            initialSelected={selectedSubjects}
            onBack={() => setStep(1)}
            onNext={handleStep2Next}
            onCancel={onClose}
          />
        )}
        {step === 3 && (
          <StepStudentRoster
            className={className}
            subjectCount={selectedSubjects.size}
            onBack={() => setStep(2)}
            onComplete={handleComplete}
            onCancel={onClose}
          />
        )}
      </div>
    </div>
  );
}
