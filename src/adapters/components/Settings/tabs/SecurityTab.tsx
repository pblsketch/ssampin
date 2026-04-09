import { useState } from 'react';
import type { Settings } from '@domain/entities/Settings';
import type { PinSettings, ProtectedFeatures, ProtectedFeatureKey } from '@domain/entities/PinSettings';
import { PROTECTABLE_PAGES } from '@adapters/components/Layout/Sidebar';
import { usePinStore } from '@adapters/stores/usePinStore';
import { SettingsSection } from '../shared/SettingsSection';
import { Toggle } from '../shared/Toggle';
import { AUTO_LOCK_OPTIONS } from '../shared/constants';

interface Props {
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
}

const FEATURE_LABELS: { key: ProtectedFeatureKey; icon: string; label: string }[] = [
  ...PROTECTABLE_PAGES.map((p) => ({ key: p.featureKey, icon: p.icon, label: p.label })),
  { key: 'observation', icon: 'edit_note', label: '특기사항' },
];

export function SecurityTab({ draft, patch }: Props) {
  const pinStore = usePinStore();
  const [pinMode, setPinMode] = useState<'idle' | 'setup' | 'change' | 'remove'>('idle');
  const [pinStep, setPinStep] = useState<'input' | 'confirm' | 'old'>('input');
  const [pinDigits, setPinDigits] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinOld, setPinOld] = useState('');
  const [pinError, setPinError] = useState('');

  const pinEnabled = draft.pin.enabled && draft.pin.pinHash !== null;

  const resetPinForm = () => {
    setPinMode('idle');
    setPinStep('input');
    setPinDigits('');
    setPinConfirm('');
    setPinOld('');
    setPinError('');
  };

  const handleSetupStart = () => {
    setPinMode('setup');
    setPinStep('input');
    setPinDigits('');
    setPinConfirm('');
    setPinError('');
  };

  const handleChangeStart = () => {
    setPinMode('change');
    setPinStep('old');
    setPinOld('');
    setPinDigits('');
    setPinConfirm('');
    setPinError('');
  };

  const handleRemoveStart = () => {
    setPinMode('remove');
    setPinStep('old');
    setPinOld('');
    setPinError('');
  };

  const handlePinSubmit = () => {
    if (pinMode === 'remove') {
      const result = pinStore.removePin(pinOld);
      if (result.success) {
        patch({
          pin: {
            enabled: false,
            pinHash: null,
            protectedFeatures: { timetable: false, seating: false, schedule: false, studentRecords: false, meal: false, memo: false, todo: false, classManagement: false, bookmarks: false, observation: false },
            autoLockMinutes: 5,
          },
        });
        resetPinForm();
      } else {
        setPinError(result.error ?? 'PIN이 일치하지 않습니다');
        setPinOld('');
      }
      return;
    }

    if (pinStep === 'old') {
      const ok = pinStore.verify(pinOld);
      if (ok) {
        setPinStep('input');
        setPinError('');
      } else {
        setPinError('기존 PIN이 일치하지 않습니다');
        setPinOld('');
      }
      return;
    }

    if (pinStep === 'input') {
      if (pinDigits.length !== 4) {
        setPinError('4자리 숫자를 입력해주세요');
        return;
      }
      setPinStep('confirm');
      setPinError('');
      return;
    }

    if (pinStep === 'confirm') {
      if (pinDigits !== pinConfirm) {
        setPinError('PIN이 일치하지 않습니다');
        setPinConfirm('');
        return;
      }
      const result = pinStore.setupPin(
        pinDigits,
        draft.pin.protectedFeatures,
        draft.pin.autoLockMinutes,
        pinMode === 'change' ? pinOld : undefined,
      );
      if (result.success) {
        resetPinForm();
      } else {
        setPinError(result.error ?? '오류가 발생했습니다');
      }
    }
  };

  const patchPin = (p: Partial<PinSettings>) => {
    patch({ pin: { ...draft.pin, ...p } });
  };

  const patchFeature = (key: keyof ProtectedFeatures, value: boolean) => {
    pinStore.updateProtectedFeatures({ [key]: value });
    patchPin({
      protectedFeatures: { ...draft.pin.protectedFeatures, [key]: value },
    });
  };

  return (
    <SettingsSection
      icon="lock"
      iconColor="bg-red-500/10 text-red-400"
      title="PIN 잠금 설정"
      actions={
        pinEnabled ? (
          <span className="text-caption text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full font-medium">
            활성화됨
          </span>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {!pinEnabled && pinMode === 'idle' && (
          <button
            type="button"
            onClick={handleSetupStart}
            className="w-full px-4 py-3 rounded-lg bg-sp-accent/10 border border-sp-accent/30 text-sp-accent hover:bg-sp-accent/20 text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-icon-md">lock</span>
            PIN 설정하기
          </button>
        )}

        {pinEnabled && pinMode === 'idle' && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleChangeStart}
              className="flex-1 px-4 py-2.5 rounded-lg border border-sp-border text-sp-text hover:bg-sp-text/5 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-icon">edit</span>
              PIN 변경
            </button>
            <button
              type="button"
              onClick={handleRemoveStart}
              className="flex-1 px-4 py-2.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-icon">lock_open</span>
              PIN 해제
            </button>
          </div>
        )}

        {pinMode !== 'idle' && (
          <div className="p-4 rounded-lg bg-sp-surface/80 border border-sp-border space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-sp-text">
                {pinMode === 'remove' ? '현재 PIN 입력' :
                  pinStep === 'old' ? '현재 PIN 입력' :
                    pinStep === 'input' ? '새 PIN 입력 (4자리)' :
                      'PIN 확인 (한 번 더)'}
              </span>
              <button type="button" onClick={resetPinForm} className="text-xs text-sp-muted hover:text-sp-text">
                취소
              </button>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={
                  pinStep === 'old' || pinMode === 'remove' ? pinOld :
                    pinStep === 'confirm' ? pinConfirm :
                      pinDigits
                }
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                  if (pinStep === 'old' || pinMode === 'remove') setPinOld(v);
                  else if (pinStep === 'confirm') setPinConfirm(v);
                  else setPinDigits(v);
                  setPinError('');
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') handlePinSubmit(); }}
                placeholder="····"
                className="flex-1 bg-sp-card border border-sp-border rounded-lg px-4 py-2.5 text-sp-text text-center text-xl tracking-[0.5em] placeholder-sp-border focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent"
                autoFocus
              />
              <button
                type="button"
                onClick={handlePinSubmit}
                className="px-4 py-2.5 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors"
              >
                {pinStep === 'confirm' ? '완료' :
                  pinMode === 'remove' ? '해제' : '다음'}
              </button>
            </div>

            <div className="flex justify-center gap-2">
              {Array.from({ length: 4 }).map((_, i) => {
                const currentValue = pinStep === 'old' || pinMode === 'remove' ? pinOld :
                  pinStep === 'confirm' ? pinConfirm : pinDigits;
                return (
                  <div
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full transition-all ${i < currentValue.length
                        ? 'bg-sp-accent'
                        : 'bg-sp-border/50'
                      }`}
                  />
                );
              })}
            </div>

            {pinError && (
              <p className="text-xs text-red-400 text-center">{pinError}</p>
            )}
          </div>
        )}

        {pinEnabled && (
          <>
            <div className="pt-4 border-t border-sp-border">
              <h4 className="text-xs font-semibold text-sp-muted uppercase tracking-wider mb-3">
                기능별 PIN 보호
              </h4>
              <div className="space-y-3">
                {FEATURE_LABELS.map(({ key, icon, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-sp-muted text-icon-md">{icon}</span>
                      <span className="text-sm font-medium text-sp-text">{label}</span>
                    </div>
                    <Toggle
                      checked={draft.pin.protectedFeatures[key]}
                      onChange={(v) => patchFeature(key, v)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-sp-border">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-sp-text">자동 잠금 시간</span>
                  <p className="text-xs text-sp-muted mt-0.5">
                    마지막 PIN 입력 후 설정 시간이 지나면 다시 잠깁니다
                  </p>
                </div>
                <select
                  value={draft.pin.autoLockMinutes}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    pinStore.updateAutoLockMinutes(val);
                    patchPin({ autoLockMinutes: val });
                  }}
                  className="bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent"
                >
                  {AUTO_LOCK_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-sp-border">
              <button
                type="button"
                onClick={() => pinStore.lock()}
                className="w-full px-4 py-2.5 rounded-lg border border-sp-border text-sp-muted hover:bg-sp-text/5 hover:text-sp-text text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-icon">lock</span>
                지금 잠그기
              </button>
            </div>
          </>
        )}
      </div>
    </SettingsSection>
  );
}
