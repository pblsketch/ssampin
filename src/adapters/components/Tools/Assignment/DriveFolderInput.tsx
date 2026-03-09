interface DriveFolderInputProps {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

function sanitizeFolderName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '');
}

export function DriveFolderInput({
  value,
  onChange,
  placeholder = '폴더명',
  disabled = false,
}: DriveFolderInputProps) {
  return (
    <div className="bg-sp-surface border border-sp-border/50 rounded-lg p-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-sp-muted shrink-0">쌤핀 과제 /</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(sanitizeFolderName(e.target.value))}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 px-3 py-1.5 bg-sp-card border border-sp-border rounded text-sp-text placeholder-sp-muted/50 focus:outline-none focus:border-sp-accent text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>
      {!value && (
        <p className="text-xs text-red-400 mt-2">폴더명을 입력해주세요</p>
      )}
      <p className="text-xs text-sp-muted/60 mt-2">※ '쌤핀 과제' 폴더 하위에 자동 생성됩니다</p>
      <p className="text-xs text-sp-muted/60 mt-1">※ 첫 사용 시 '쌤핀 과제' 루트 폴더가 생성됩니다</p>
    </div>
  );
}
