import { useState } from 'react';

export function CustomTimeModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (seconds: number) => void;
  onClose: () => void;
}) {
  const [min, setMin] = useState('5');
  const [sec, setSec] = useState('0');

  const handleConfirm = () => {
    const total = (parseInt(min, 10) || 0) * 60 + (parseInt(sec, 10) || 0);
    if (total > 0) onConfirm(total);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-sp-card border border-sp-border rounded-2xl p-6 w-80">
        <h3 className="text-lg font-bold text-sp-text mb-4">시간 직접 입력</h3>
        <div className="flex items-center gap-3 justify-center mb-6">
          <div className="flex flex-col items-center gap-1">
            <input
              type="number"
              min={0}
              max={99}
              value={min}
              onChange={(e) => setMin(e.target.value)}
              className="w-20 h-14 bg-sp-bg border border-sp-border rounded-lg text-center text-2xl font-mono text-sp-text focus:border-sp-accent focus:outline-none"
            />
            <span className="text-xs text-sp-muted">분</span>
          </div>
          <span className="text-2xl font-bold text-sp-muted mt-[-20px]">:</span>
          <div className="flex flex-col items-center gap-1">
            <input
              type="number"
              min={0}
              max={59}
              value={sec}
              onChange={(e) => setSec(e.target.value)}
              className="w-20 h-14 bg-sp-bg border border-sp-border rounded-lg text-center text-2xl font-mono text-sp-text focus:border-sp-accent focus:outline-none"
            />
            <span className="text-xs text-sp-muted">초</span>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2.5 rounded-lg bg-sp-accent text-white font-medium hover:bg-sp-accent/80 transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
