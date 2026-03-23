import { create } from 'zustand';
import type { Student } from '@domain/entities/Student';
import { studentRepository } from '@adapters/di/container';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';

/** 샘플 한국 학생 35명 (학번: 1학년 2반) */
const SAMPLE_STUDENTS: readonly Student[] = [
  { id: 's01', name: '김민지', studentNumber: 1, phone: '', parentPhone: '', isVacant: false },
  { id: 's02', name: '이서연', studentNumber: 2, phone: '', parentPhone: '', isVacant: false },
  { id: 's03', name: '박지민', studentNumber: 3, phone: '', parentPhone: '', isVacant: false },
  { id: 's04', name: '최예은', studentNumber: 4, phone: '', parentPhone: '', isVacant: false },
  { id: 's05', name: '정수빈', studentNumber: 5, phone: '', parentPhone: '', isVacant: false },
  { id: 's06', name: '강민수', studentNumber: 6, phone: '', parentPhone: '', isVacant: false },
  { id: 's07', name: '조현우', studentNumber: 7, phone: '', parentPhone: '', isVacant: false },
  { id: 's08', name: '윤서준', studentNumber: 8, phone: '', parentPhone: '', isVacant: false },
  { id: 's09', name: '장민혁', studentNumber: 9, phone: '', parentPhone: '', isVacant: false },
  { id: 's10', name: '임도윤', studentNumber: 10, phone: '', parentPhone: '', isVacant: false },
  { id: 's11', name: '한지우', studentNumber: 11, phone: '', parentPhone: '', isVacant: false },
  { id: 's12', name: '송예준', studentNumber: 12, phone: '', parentPhone: '', isVacant: false },
  { id: 's13', name: '오시우', studentNumber: 13, phone: '', parentPhone: '', isVacant: false },
  { id: 's14', name: '서준우', studentNumber: 14, phone: '', parentPhone: '', isVacant: false },
  { id: 's15', name: '신은우', studentNumber: 15, phone: '', parentPhone: '', isVacant: false },
  { id: 's16', name: '백승우', studentNumber: 16, phone: '', parentPhone: '', isVacant: false },
  { id: 's17', name: '권진우', studentNumber: 17, phone: '', parentPhone: '', isVacant: false },
  { id: 's18', name: '황지호', studentNumber: 18, phone: '', parentPhone: '', isVacant: false },
  { id: 's19', name: '안민재', studentNumber: 19, phone: '', parentPhone: '', isVacant: false },
  { id: 's20', name: '유건우', studentNumber: 20, phone: '', parentPhone: '', isVacant: false },
  { id: 's21', name: '홍성현', studentNumber: 21, phone: '', parentPhone: '', isVacant: false },
  { id: 's22', name: '전민성', studentNumber: 22, phone: '', parentPhone: '', isVacant: false },
  { id: 's23', name: '고우진', studentNumber: 23, phone: '', parentPhone: '', isVacant: false },
  { id: 's24', name: '문지훈', studentNumber: 24, phone: '', parentPhone: '', isVacant: false },
  { id: 's25', name: '양준영', studentNumber: 25, phone: '', parentPhone: '', isVacant: false },
  { id: 's26', name: '손민규', studentNumber: 26, phone: '', parentPhone: '', isVacant: false },
  { id: 's27', name: '배현준', studentNumber: 27, phone: '', parentPhone: '', isVacant: false },
  { id: 's28', name: '조민준', studentNumber: 28, phone: '', parentPhone: '', isVacant: false },
  { id: 's29', name: '류승민', studentNumber: 29, phone: '', parentPhone: '', isVacant: false },
  { id: 's30', name: '서동현', studentNumber: 30, phone: '', parentPhone: '', isVacant: false },
  { id: 's31', name: '남궁민', studentNumber: 31, phone: '', parentPhone: '', isVacant: false },
  { id: 's32', name: '나경훈', studentNumber: 32, phone: '', parentPhone: '', isVacant: false },
  { id: 's33', name: '박효준', studentNumber: 33, phone: '', parentPhone: '', isVacant: false },
  { id: 's34', name: '허지훈', studentNumber: 34, phone: '', parentPhone: '', isVacant: false },
  { id: 's35', name: '황민혁', studentNumber: 35, phone: '', parentPhone: '', isVacant: false },
];

interface StudentState {
  students: readonly Student[];
  loaded: boolean;

  load: () => Promise<void>;
  updateStudents: (students: readonly Student[]) => Promise<void>;
  updateStudentName: (id: string, name: string) => Promise<void>;
  updateStudentField: (
    studentId: string,
    field: 'name' | 'phone' | 'parentPhone' | 'parentPhoneLabel' | 'parentPhone2' | 'parentPhone2Label' | 'studentNumber' | 'birthDate',
    value: string | number,
  ) => Promise<void>;
  toggleVacant: (studentId: string) => Promise<void>;
  setStudentCount: (count: number) => Promise<void>;

  /** 파생 값 */
  getStudent: (id: string | null) => Student | undefined;
  activeStudents: () => readonly Student[];
}

export const useStudentStore = create<StudentState>((set, get) => ({
  students: SAMPLE_STUDENTS,
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const data = await studentRepository.getStudents();
      const students = data ?? SAMPLE_STUDENTS;
      if (!data) {
        await studentRepository.saveStudents(SAMPLE_STUDENTS);
      }
      set({ students, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  updateStudents: async (newStudents) => {
    await studentRepository.saveStudents(newStudents);
    set({ students: newStudents });
  },

  updateStudentName: async (id, name) => {
    const { students } = get();
    const newStudents = students.map((s) => (s.id === id ? { ...s, name } : s));
    await studentRepository.saveStudents(newStudents);
    set({ students: newStudents });
  },

  updateStudentField: async (studentId, field, value) => {
    const { students } = get();
    const newStudents = students.map((s) =>
      s.id === studentId ? { ...s, [field]: value } : s,
    );
    try {
      await studentRepository.saveStudents(newStudents);
      set({ students: newStudents });

      // 생일 변경 시 일정 동기화
      if (field === 'birthDate' && useSettingsStore.getState().settings.syncBirthdaysToSchedule) {
        void useEventsStore.getState().syncBirthdayEvents(newStudents);
      }
    } catch {
      // 무시
    }
  },

  toggleVacant: async (studentId) => {
    const { students } = get();
    const student = students.find((s) => s.id === studentId);
    if (!student) return;

    const newStudents = students.map((s) =>
      s.id === studentId ? { ...s, isVacant: !student.isVacant } : s,
    );

    try {
      await studentRepository.saveStudents(newStudents);
      set({ students: newStudents });

      // 결번 변경 시 생일 동기화 반영
      if (student.birthDate && useSettingsStore.getState().settings.syncBirthdaysToSchedule) {
        void useEventsStore.getState().syncBirthdayEvents(newStudents);
      }
    } catch {
      // 무시
    }
  },

  setStudentCount: async (count) => {
    const clamped = Math.max(1, Math.min(50, count));
    const { students } = get();

    let newStudents: Student[];
    if (clamped > students.length) {
      const maxNum = students.reduce((max, s) => Math.max(max, s.studentNumber ?? 0), 0);
      const additions: Student[] = [];
      for (let i = 0; i < clamped - students.length; i++) {
        additions.push({
          id: `s${Date.now()}_${i}`,
          name: '',
          studentNumber: maxNum + i + 1,
          phone: '',
          parentPhone: '',
          isVacant: false,
        });
      }
      newStudents = [...students, ...additions];
    } else if (clamped < students.length) {
      const sorted = [...students].sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0));
      newStudents = sorted.slice(0, clamped);
    } else {
      return;
    }

    try {
      await studentRepository.saveStudents(newStudents);
      set({ students: newStudents });
    } catch {
      // 무시
    }
  },

  getStudent: (id) => (id !== null ? get().students.find((s) => s.id === id) : undefined),
  activeStudents: () => get().students.filter((s) => !s.isVacant),
}));
