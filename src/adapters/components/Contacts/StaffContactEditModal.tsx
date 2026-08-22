import { useEffect, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import type { StaffContact } from '@domain/entities/StaffContact';
import type { StaffContactDraft } from '@adapters/stores/useStaffContactStore';

const FIELD_CLASS =
  'w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2.5 text-sm text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none transition-colors';

interface StaffContactEditModalProps {
  isOpen: boolean;
  /** 있으면 수정, 없으면 새로 추가 */
  contact: StaffContact | null;
  onClose: () => void;
  onSubmit: (draft: StaffContactDraft) => Promise<void>;
}

interface FormState {
  name: string;
  position: string;
  department: string;
  subject: string;
  homeroom: string;
  mobile: string;
  officePhone: string;
  email: string;
  memo: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  position: '',
  department: '',
  subject: '',
  homeroom: '',
  mobile: '',
  officePhone: '',
  email: '',
  memo: '',
};

function toForm(contact: StaffContact | null): FormState {
  if (contact === null) return EMPTY_FORM;
  return {
    name: contact.name,
    position: contact.position ?? '',
    department: contact.department ?? '',
    subject: contact.subject ?? '',
    homeroom: contact.homeroom ?? '',
    mobile: contact.mobile ?? '',
    officePhone: contact.officePhone ?? '',
    email: contact.email ?? '',
    memo: contact.memo ?? '',
  };
}

/** 빈 칸은 저장하지 않는다 — 없는 항목이 `''`로 남지 않도록. */
function omitEmpty(v: string): string | undefined {
  const t = v.trim();
  return t === '' ? undefined : t;
}

export function StaffContactEditModal({
  isOpen,
  contact,
  onClose,
  onSubmit,
}: StaffContactEditModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // 모달이 열릴 때마다 대상에 맞춰 값을 채운다(직전에 편집하던 값이 남지 않도록).
  useEffect(() => {
    if (isOpen) setForm(toForm(contact));
  }, [isOpen, contact]);

  const set = (key: keyof FormState, value: string): void => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const canSave = form.name.trim() !== '' && !saving;

  const handleSubmit = async (): Promise<void> => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSubmit({
        name: form.name.trim(),
        position: omitEmpty(form.position),
        department: omitEmpty(form.department),
        subject: omitEmpty(form.subject),
        homeroom: omitEmpty(form.homeroom),
        mobile: omitEmpty(form.mobile),
        officePhone: omitEmpty(form.officePhone),
        email: omitEmpty(form.email),
        memo: omitEmpty(form.memo),
        favorite: contact?.favorite,
        group: contact?.group,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={contact === null ? '교직원 연락처 추가' : '교직원 연락처 수정'}
      size="lg"
    >
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-xs text-sp-muted mb-1.5" htmlFor="staff-name">
            이름 <span className="text-red-400">*</span>
          </label>
          <input
            id="staff-name"
            className={FIELD_CLASS}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="김민호"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-sp-muted mb-1.5" htmlFor="staff-dept">
              부서
            </label>
            <input
              id="staff-dept"
              className={FIELD_CLASS}
              value={form.department}
              onChange={(e) => set('department', e.target.value)}
              placeholder="3학년부"
            />
          </div>
          <div>
            <label className="block text-xs text-sp-muted mb-1.5" htmlFor="staff-position">
              직위
            </label>
            <input
              id="staff-position"
              className={FIELD_CLASS}
              value={form.position}
              onChange={(e) => set('position', e.target.value)}
              placeholder="부장"
            />
          </div>
          <div>
            <label className="block text-xs text-sp-muted mb-1.5" htmlFor="staff-subject">
              담당 과목
            </label>
            <input
              id="staff-subject"
              className={FIELD_CLASS}
              value={form.subject}
              onChange={(e) => set('subject', e.target.value)}
              placeholder="수학"
            />
          </div>
          <div>
            <label className="block text-xs text-sp-muted mb-1.5" htmlFor="staff-homeroom">
              담임 학급
            </label>
            <input
              id="staff-homeroom"
              className={FIELD_CLASS}
              value={form.homeroom}
              onChange={(e) => set('homeroom', e.target.value)}
              placeholder="3-1"
            />
          </div>
          <div>
            <label className="block text-xs text-sp-muted mb-1.5" htmlFor="staff-mobile">
              휴대폰
            </label>
            <input
              id="staff-mobile"
              className={FIELD_CLASS}
              value={form.mobile}
              onChange={(e) => set('mobile', e.target.value)}
              placeholder="010-1234-5678"
              inputMode="tel"
            />
          </div>
          <div>
            <label className="block text-xs text-sp-muted mb-1.5" htmlFor="staff-office">
              내선번호
            </label>
            <input
              id="staff-office"
              className={FIELD_CLASS}
              value={form.officePhone}
              onChange={(e) => set('officePhone', e.target.value)}
              placeholder="1502"
              inputMode="tel"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-sp-muted mb-1.5" htmlFor="staff-email">
            이메일
          </label>
          <input
            id="staff-email"
            className={FIELD_CLASS}
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="teacher@school.kr"
            inputMode="email"
          />
        </div>

        <div>
          <label className="block text-xs text-sp-muted mb-1.5" htmlFor="staff-memo">
            메모
          </label>
          <textarea
            id="staff-memo"
            className={`${FIELD_CLASS} resize-none`}
            rows={2}
            value={form.memo}
            onChange={(e) => set('memo', e.target.value)}
            placeholder="수요일 오후 출장 잦음"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSave}
            className="px-4 py-2 rounded-lg text-sm bg-sp-accent text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
          >
            {contact === null ? '추가' : '저장'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
