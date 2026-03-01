import { create } from 'zustand';
import type { SeatingData } from '@domain/entities/Seating';
import type { Student } from '@domain/entities/Student';
import { countStudents, countEmptySeats } from '@domain/rules/seatRules';
import { seatingRepository, studentRepository } from '@adapters/di/container';
import { SwapSeats } from '@usecases/seating/SwapSeats';
import { RandomizeSeats } from '@usecases/seating/RandomizeSeats';
import { UpdateSeating } from '@usecases/seating/UpdateSeating';

/** 샘플 한국 학생 35명 (학번: 1학년 2반) */
const SAMPLE_STUDENTS: readonly Student[] = [
  { id: 's01', name: '김민지', studentNumber: 1 },
  { id: 's02', name: '이서연', studentNumber: 2 },
  { id: 's03', name: '박지민', studentNumber: 3 },
  { id: 's04', name: '최예은', studentNumber: 4 },
  { id: 's05', name: '정수빈', studentNumber: 5 },
  { id: 's06', name: '강민수', studentNumber: 6 },
  { id: 's07', name: '조현우', studentNumber: 7 },
  { id: 's08', name: '윤서준', studentNumber: 8 },
  { id: 's09', name: '장민혁', studentNumber: 9 },
  { id: 's10', name: '임도윤', studentNumber: 10 },
  { id: 's11', name: '한지우', studentNumber: 11 },
  { id: 's12', name: '송예준', studentNumber: 12 },
  { id: 's13', name: '오시우', studentNumber: 13 },
  { id: 's14', name: '서준우', studentNumber: 14 },
  { id: 's15', name: '신은우', studentNumber: 15 },
  { id: 's16', name: '백승우', studentNumber: 16 },
  { id: 's17', name: '권진우', studentNumber: 17 },
  { id: 's18', name: '황지호', studentNumber: 18 },
  { id: 's19', name: '안민재', studentNumber: 19 },
  { id: 's20', name: '유건우', studentNumber: 20 },
  { id: 's21', name: '홍성현', studentNumber: 21 },
  { id: 's22', name: '전민성', studentNumber: 22 },
  { id: 's23', name: '고우진', studentNumber: 23 },
  { id: 's24', name: '문지훈', studentNumber: 24 },
  { id: 's25', name: '양준영', studentNumber: 25 },
  { id: 's26', name: '손민규', studentNumber: 26 },
  { id: 's27', name: '배현준', studentNumber: 27 },
  { id: 's28', name: '조민준', studentNumber: 28 },
  { id: 's29', name: '류승민', studentNumber: 29 },
  { id: 's30', name: '서동현', studentNumber: 30 },
  { id: 's31', name: '남궁민', studentNumber: 31 },
  { id: 's32', name: '나경훈', studentNumber: 32 },
  { id: 's33', name: '박효준', studentNumber: 33 },
  { id: 's34', name: '허지훈', studentNumber: 34 },
  { id: 's35', name: '황민혁', studentNumber: 35 },
];

/** 6×6 기본 좌석: 학생 목록을 기반으로 생성 */
function createDefaultSeating(students: readonly Student[]): SeatingData {
  const ids = students.map((s) => s.id);
  const seats: (string | null)[][] = [];
  let idx = 0;
  for (let r = 0; r < 6; r++) {
    const row: (string | null)[] = [];
    for (let c = 0; c < 6; c++) {
      row.push(idx < ids.length ? (ids[idx] ?? null) : null);
      idx++;
    }
    seats.push(row);
  }
  return { rows: 6, cols: 6, seats };
}

interface SeatingState {
  seating: SeatingData;
  students: readonly Student[];
  loaded: boolean;
  isEditing: boolean;

  history: SeatingData[];

  load: () => Promise<void>;
  swapSeats: (r1: number, c1: number, r2: number, c2: number) => Promise<void>;
  randomize: () => Promise<void>;
  updateStudent: (row: number, col: number, studentId: string | null) => Promise<void>;
  setEditing: (editing: boolean) => void;
  undo: () => Promise<void>;
  updateStudents: (students: readonly Student[]) => Promise<void>;
  updateStudentName: (id: string, name: string) => Promise<void>;

  /** 파생 값 */
  studentCount: () => number;
  emptyCount: () => number;
  getStudent: (id: string | null) => Student | undefined;
}

export const useSeatingStore = create<SeatingState>((set, get) => {
  const swapSeatsUC = new SwapSeats(seatingRepository);
  const randomizeUC = new RandomizeSeats(seatingRepository);
  const updateUC = new UpdateSeating(seatingRepository);

  const saveHistory = () => {
    const { seating, history } = get();
    // Keep max 20 history states
    const newHistory = [...history, seating].slice(-20);
    set({ history: newHistory });
  };

  return {
    seating: createDefaultSeating(SAMPLE_STUDENTS),
    history: [],
    students: SAMPLE_STUDENTS,
    loaded: false,
    isEditing: false,

    load: async () => {
      if (get().loaded) return;
      try {
        const [data, studentData] = await Promise.all([
          seatingRepository.getSeating(),
          studentRepository.getStudents(),
        ]);

        const students = studentData ?? SAMPLE_STUDENTS;
        if (!studentData) {
          await studentRepository.saveStudents(SAMPLE_STUDENTS);
        }

        if (data !== null) {
          set({ seating: data, students, loaded: true });
        } else {
          // 최초: 기본 좌석 저장
          const defaultData = createDefaultSeating(students);
          await seatingRepository.saveSeating(defaultData);
          set({ seating: defaultData, students, loaded: true });
        }
      } catch {
        set({ loaded: true });
      }
    },

    undo: async () => {
      const { history } = get();
      if (history.length === 0) return;
      const prevSeating = history[history.length - 1];
      const newHistory = history.slice(0, -1);

      try {
        await seatingRepository.saveSeating(prevSeating!);
        set({ seating: prevSeating, history: newHistory });
      } catch {
        // 무시
      }
    },

    swapSeats: async (r1, c1, r2, c2) => {
      try {
        saveHistory();
        const updated = await swapSeatsUC.execute(r1, c1, r2, c2);
        set({ seating: updated });
      } catch {
        // 무시
      }
    },

    randomize: async () => {
      try {
        saveHistory();
        const updated = await randomizeUC.execute();
        set({ seating: updated });
      } catch {
        // 무시
      }
    },

    updateStudent: async (row, col, studentId) => {
      try {
        saveHistory();
        const updated = await updateUC.execute(row, col, studentId);
        set({ seating: updated });
      } catch {
        // 무시
      }
    },

    setEditing: (editing) => set({ isEditing: editing }),

    updateStudents: async (newStudents) => {
      const defaultData = createDefaultSeating(newStudents);
      await Promise.all([
        studentRepository.saveStudents(newStudents),
        seatingRepository.saveSeating(defaultData),
      ]);
      set({ students: newStudents, seating: defaultData, history: [] });
    },

    updateStudentName: async (id, name) => {
      const { students } = get();
      const newStudents = students.map((s) => (s.id === id ? { ...s, name } : s));
      await studentRepository.saveStudents(newStudents);
      set({ students: newStudents });
    },

    studentCount: () => countStudents(get().seating.seats),
    emptyCount: () => countEmptySeats(get().seating.seats),
    getStudent: (id) => (id !== null ? get().students.find(s => s.id === id) : undefined),
  };
});
