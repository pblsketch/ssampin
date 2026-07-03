import { useMobileStudentStore } from '@mobile/stores/useMobileStudentStore';

// ============================================================
// 연락처 서브탭
// ============================================================

export function ContactSubTab({ studentId }: { studentId: string }) {
  const students = useMobileStudentStore((s) => s.students);
  const student = students.find((s) => s.id === studentId);

  const formatPhone = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11)
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    if (digits.length === 10)
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return phone;
  };

  const contacts: { label: string; phone: string; icon: string }[] = [];
  if (student?.phone) {
    contacts.push({ label: '학생 본인', phone: student.phone, icon: 'person' });
  }
  if (student?.parentPhone) {
    contacts.push({
      label: student.parentPhoneLabel ? `${student.parentPhoneLabel} (보호자1)` : '보호자1',
      phone: student.parentPhone,
      icon: 'group',
    });
  }
  if (student?.parentPhone2) {
    contacts.push({
      label: student.parentPhone2Label ? `${student.parentPhone2Label} (보호자2)` : '보호자2',
      phone: student.parentPhone2,
      icon: 'group',
    });
  }

  if (contacts.length === 0) {
    return (
      <div className="px-5 py-10 text-center">
        <span className="material-symbols-outlined text-4xl text-sp-muted/50 mb-3 block">
          contact_phone
        </span>
        <p className="text-sp-muted text-sm">등록된 연락처가 없습니다</p>
        <p className="text-sp-muted/70 text-xs mt-1">데스크톱 쌤핀에서 연락처를 등록해주세요</p>
      </div>
    );
  }

  return (
    <div className="px-5 pb-6 space-y-2">
      {contacts.map((c, i) => (
        <a
          key={i}
          href={`tel:${c.phone.replace(/\D/g, '')}`}
          className="flex items-center gap-3 p-3 rounded-xl bg-sp-surface/60 border border-sp-border/50 active:bg-sp-accent/10 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-sp-accent/10 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-sp-accent text-xl">{c.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sp-muted text-xs">{c.label}</p>
            <p className="text-sp-text font-medium text-base">{formatPhone(c.phone)}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-green-400 text-xl">call</span>
          </div>
        </a>
      ))}
    </div>
  );
}
