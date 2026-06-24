#!/usr/bin/env node
/**
 * 브릿지 미러 왕복 계약(WS2) — 본체 엔티티 대표 샘플(마스킹 합성) 생성기.
 *
 * 브릿지 레포의 미러 파서(packages/core/src/entities/*.ts)가 본체 엔티티 변경 시 계약 필드를
 * silent drop 하지 않는지 "본체 샘플 ↔ 브릿지 파서 왕복" 테스트로 잡기 위한 픽스처를 만든다.
 *
 * 산출(본체): contracts/entity-samples/{observation,studentRecord,attendance,teachingClass,student}.json
 *           + contracts/entity-samples/manifest.json (엔티티별 계약 필드 목록)
 * 이 디렉토리는 브릿지 레포 contracts/entity-samples/ 로 벤더링되어 mirrorRoundtrip.test.ts 가 참조한다.
 *
 * ⚠️ 실 PII 금지 — 모든 샘플은 마스킹된 합성 데이터다. emitSamples() 가 합성 단언(assertSynthetic)을
 *    통과하지 못하면 비정상 종료한다(실 이름/연락처/생일 혼입 방지).
 *
 * 실행: `npm run gen:entity-samples`
 *
 * 계약 필드(mirrored) = 브릿지 미러 파서가 반드시 보존해야 하는 필드.
 * 미러 제외(notMirrored) = 본체엔 있으나 외부 AI 에 의도적으로 노출하지 않는 필드(allowlist).
 *   → 본체 엔티티에 새 필드 추가 시, 그 필드는 mirrored 샘플에 들어가거나 notMirrored allowlist 에
 *     명시돼야 한다. (강제: 본체 메타테스트 entitySampleContract.meta.test.ts)
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'contracts/entity-samples');

// ─────────────────────────── 마스킹 합성 상수 ───────────────────────────
const SYNTH_PHONE = '010-0000-0001';
const SYNTH_PARENT_PHONE = '010-0000-0002';
const SYNTH_PARENT_PHONE2 = '010-0000-0003';
const SYNTH_BIRTH = '2010-01-01';

// ─────────────────────────── 엔티티별 계약 필드 ───────────────────────────
/**
 * 각 엔티티의 인터페이스별 계약 필드.
 *  - mirrored: 브릿지 미러가 보존해야 하는 필드(왕복 테스트가 보존 검증).
 *  - notMirrored: 본체엔 있으나 외부 AI 에 미노출하는 필드(allowlist — 의도적 제외).
 */
export const ENTITY_FIELD_CONTRACT = {
  observation: {
    file: 'src/domain/entities/Observation.ts',
    interfaces: {
      ObservationRecord: {
        mirrored: [
          'id',
          'studentId',
          'classId',
          'authorId',
          'date',
          'content',
          'tags',
          'visibility',
          'createdAt',
          'updatedAt',
        ],
        notMirrored: ['category'],
      },
    },
  },
  studentRecord: {
    file: 'src/domain/entities/StudentRecord.ts',
    interfaces: {
      StudentRecord: {
        mirrored: [
          'id',
          'studentId',
          'category',
          'subcategory',
          'content',
          'date',
          'attendancePeriods',
          'reportedToNeis',
          'documentSubmitted',
          'tags',
        ],
        notMirrored: ['createdAt', 'method', 'followUp', 'followUpDate', 'followUpDone'],
      },
      AttendancePeriodEntry: {
        mirrored: ['period', 'status', 'reason', 'memo'],
        notMirrored: [],
      },
    },
  },
  attendance: {
    file: 'src/domain/entities/Attendance.ts',
    interfaces: {
      AttendanceRecord: {
        mirrored: ['classId', 'groupId', 'date', 'period', 'students'],
        notMirrored: [],
      },
      StudentAttendance: {
        mirrored: ['number', 'status', 'reason', 'memo', 'grade', 'classNum'],
        notMirrored: [],
      },
    },
  },
  teachingClass: {
    file: 'src/domain/entities/TeachingClass.ts',
    interfaces: {
      TeachingClass: {
        mirrored: [
          'id',
          'name',
          'subject',
          'groupId',
          'students',
          'order',
          'studentSyncMode',
          'createdAt',
          'updatedAt',
        ],
        notMirrored: ['seating'],
      },
      TeachingClassStudent: {
        mirrored: [
          'number',
          'name',
          'memo',
          'grade',
          'classNum',
          'isVacant',
          'status',
          'statusNote',
          'statusChangedAt',
        ],
        notMirrored: [],
      },
    },
  },
  student: {
    file: 'src/domain/entities/Student.ts',
    interfaces: {
      Student: {
        mirrored: [
          'id',
          'name',
          'studentNumber',
          'phone',
          'parentPhone',
          'parentPhoneLabel',
          'parentPhone2',
          'parentPhone2Label',
          'isVacant',
          'birthDate',
          'status',
          'statusNote',
          'statusChangedAt',
        ],
        notMirrored: [],
      },
    },
  },
};

// ─────────────────────────── 마스킹 합성 샘플(저장 형태) ───────────────────────────
/** 엔티티별 대표 샘플 — 본체 storage 가 쓰는 on-disk 형태 그대로(브릿지 파서 입력). */
export const SAMPLES = {
  // observations.json: { records, customTags }
  observation: {
    records: [
      {
        id: 'obs-1',
        studentId: '1-2-3', // 수업반 studentKey(학년-반-번호)
        classId: 'tc-1',
        authorId: 'teacher-1',
        date: '2026-06-01',
        content: '수업 중 모둠 토의를 주도하며 근거를 들어 설명함(합성 샘플).',
        tags: ['학습태도', '교과역량'],
        visibility: 'shared',
        createdAt: 1735689600000,
        updatedAt: 1735689600000,
        category: '수업 관찰', // notMirrored — 브릿지 미러는 보존하지 않음
      },
    ],
    customTags: ['발표력'],
  },
  // student-records.json: { records }
  studentRecord: {
    records: [
      {
        id: 'rec-1',
        studentId: 'stu-1', // 담임 Student.id(raw)
        category: 'life',
        subcategory: '일반', // Q2 sentinel(MCP 계약 슬롯)
        content: '청소 시간에 솔선수범함(합성 샘플).',
        date: '2026-06-01',
        createdAt: '2026-06-01T00:00:00.000Z', // notMirrored
        reportedToNeis: false,
        documentSubmitted: false,
        tags: ['칭찬'],
      },
      {
        id: 'att-stu-1-2026-06-02',
        studentId: 'stu-1',
        category: 'attendance',
        subcategory: '결석 (질병)',
        content: '',
        date: '2026-06-02',
        createdAt: '2026-06-02T00:00:00.000Z',
        attendancePeriods: [
          { period: 1, status: 'absent', reason: '질병', memo: '병원 진료(합성)' },
        ],
        reportedToNeis: true,
        documentSubmitted: true,
      },
    ],
  },
  // attendance.json: { records }
  attendance: {
    records: [
      {
        classId: 'tc-1',
        groupId: 'grp-1',
        date: '2026-06-01',
        period: 3,
        students: [
          {
            number: 3,
            status: 'late',
            reason: '인정',
            memo: '교통 지연(합성)',
            grade: 1,
            classNum: 2,
          },
        ],
      },
    ],
  },
  // teaching-classes.json: { classes }
  teachingClass: {
    classes: [
      {
        id: 'tc-1',
        name: '샘플 통합과학 A', // 합성 — name 키는 사람 이름과 동일 키라 합성 접두 유지
        subject: '과학',
        groupId: 'grp-1',
        order: 0,
        studentSyncMode: 'shared',
        createdAt: '2026-03-02',
        updatedAt: '2026-06-01',
        students: [
          {
            number: 3,
            name: '학생가',
            memo: '',
            grade: 1,
            classNum: 2,
            isVacant: false,
            status: 'active',
            statusNote: '',
            statusChangedAt: '2026-03-02',
          },
        ],
        seating: { rows: 1, cols: 1, seats: [['1-2-3']] }, // notMirrored
      },
    ],
  },
  // students.json: Student[]
  student: [
    {
      id: 'stu-1',
      name: '학생가',
      studentNumber: 10203,
      phone: SYNTH_PHONE,
      parentPhone: SYNTH_PARENT_PHONE,
      parentPhoneLabel: '모',
      parentPhone2: SYNTH_PARENT_PHONE2,
      parentPhone2Label: '부',
      isVacant: false,
      birthDate: SYNTH_BIRTH,
      status: 'active',
      statusNote: '',
      statusChangedAt: '2026-03-02',
    },
  ],
};

// ─────────────────────────── 합성(마스킹) 단언 ───────────────────────────
const SYNTH_PHONE_RE = /^010-0000-\d{4}$/;
const SYNTH_NAME_RE = /^(학생|테스트|샘플)/;
const PII_STRING_KEYS = new Set(['phone', 'parentPhone', 'parentPhone2']);

/** 샘플 트리를 순회하며 PII 키 값이 합성 마스킹 형태인지 단언. 위반 시 throw(실 PII 혼입 차단). */
export function assertSynthetic(node, path = '') {
  if (Array.isArray(node)) {
    node.forEach((v, i) => assertSynthetic(v, `${path}[${i}]`));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      const here = path ? `${path}.${k}` : k;
      if (typeof v === 'string') {
        if (PII_STRING_KEYS.has(k) && !SYNTH_PHONE_RE.test(v)) {
          throw new Error(`실 연락처 의심(${here}="${v}") — 샘플은 010-0000-NNNN 합성값만 허용.`);
        }
        if (k === 'name' && !SYNTH_NAME_RE.test(v)) {
          throw new Error(
            `실명 의심(${here}="${v}") — 샘플 이름은 '학생/테스트/샘플'로 시작해야 함.`,
          );
        }
        if (k === 'birthDate' && v !== SYNTH_BIRTH) {
          throw new Error(`실 생일 의심(${here}="${v}") — 샘플 생일은 ${SYNTH_BIRTH} 고정.`);
        }
      } else {
        assertSynthetic(v, here);
      }
    }
  }
}

function buildManifest() {
  const entities = {};
  for (const [name, def] of Object.entries(ENTITY_FIELD_CONTRACT)) {
    entities[name] = {
      file: def.file,
      interfaces: def.interfaces,
    };
  }
  return { entities };
}

function emitSamples() {
  assertSynthetic(SAMPLES);
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, sample] of Object.entries(SAMPLES)) {
    const p = resolve(OUT_DIR, `${name}.json`);
    writeFileSync(p, JSON.stringify(sample, null, 2) + '\n', 'utf-8');
    console.log(`✓ emitted ${p}`);
  }
  const manifestPath = resolve(OUT_DIR, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(buildManifest(), null, 2) + '\n', 'utf-8');
  console.log(`✓ emitted ${manifestPath}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  emitSamples();
}
