import { useMemo } from 'react';
import { useFormStore } from '@adapters/stores/useFormStore';
import { listForms } from '@usecases/forms/ListForms';
import { FormCard } from './FormCard';

export function FormGrid() {
  const forms = useFormStore((s) => s.forms);
  const filter = useFormStore((s) => s.filter);
  const sort = useFormStore((s) => s.sort);
  const loaded = useFormStore((s) => s.loaded);
  const openUpload = useFormStore((s) => s.openUpload);

  const visible = useMemo(
    () => listForms(forms, filter, sort),
    [forms, filter, sort],
  );

  if (!loaded) {
    return (
      <div className="text-center py-12 text-sp-muted">서식 불러오는 중...</div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {visible.map((form) => (
        <FormCard key={form.id} form={form} />
      ))}
      <button
        type="button"
        onClick={openUpload}
        className="aspect-[4/3] rounded-xl border-2 border-dashed border-sp-border bg-sp-card/50 hover:border-sp-accent hover:bg-sp-accent/5 transition-colors flex flex-col items-center justify-center gap-2 text-sp-muted hover:text-sp-accent"
      >
        <span className="material-symbols-outlined text-4xl">add</span>
        <span className="text-sm font-medium">서식 등록</span>
      </button>
      {visible.length === 0 && loaded && (
        <div className="col-span-full text-center py-8 text-sp-muted text-sm">
          등록된 서식이 없습니다. 우측 상단의 &quot;서식 등록&quot; 버튼을 눌러 시작해 보세요.
        </div>
      )}
    </div>
  );
}
