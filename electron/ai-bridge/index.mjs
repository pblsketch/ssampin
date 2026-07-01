#!/usr/bin/env node

// ../ssampin-ai-bridge/packages/mcp/dist/index.js
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// ../ssampin-ai-bridge/packages/mcp/dist/server.js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// ../ssampin-ai-bridge/packages/core/dist/paths.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
var VALID_FILENAME_RE = /^[A-Za-z0-9_-]+$/;
var APP_DIR_NAME = 'ssampin';
var LEGACY_APP_DIR_NAME = '\uC324\uD540';
var PathSecurityError = class extends Error {
  name = 'PathSecurityError';
};
function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function appDataRoot(env) {
  const appData = env['APPDATA'];
  if (appData && appData.trim().length > 0) {
    return appData;
  }
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support');
  }
  return path.join(home, '.config');
}
function resolveDataDir(env = process.env) {
  const override = env['SSAMPIN_DATA_DIR'];
  if (override && override.trim().length > 0) {
    return path.resolve(override);
  }
  const root = appDataRoot(env);
  const primary = path.join(root, APP_DIR_NAME, 'data');
  const legacy = path.join(root, LEGACY_APP_DIR_NAME, 'data');
  if (dirExists(primary)) return primary;
  if (dirExists(legacy)) return legacy;
  return primary;
}
function isValidFilename(name) {
  return VALID_FILENAME_RE.test(name);
}
function realpathOrResolve(p) {
  const abs = path.resolve(p);
  try {
    return fs.realpathSync.native(abs);
  } catch {
    return abs;
  }
}
function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
function resolveDataFile(dataDir, filename) {
  if (!isValidFilename(filename)) {
    throw new PathSecurityError(
      `\uC798\uBABB\uB41C \uD30C\uC77C\uBA85: ${JSON.stringify(filename)}`,
    );
  }
  const baseReal = realpathOrResolve(dataDir);
  const parentReal = realpathOrResolve(baseReal);
  const finalPath = path.join(parentReal, `${filename}.json`);
  if (!isInside(baseReal, finalPath)) {
    throw new PathSecurityError(
      `\uB370\uC774\uD130 \uB514\uB809\uD1A0\uB9AC \uBC16 \uC811\uADFC \uCC28\uB2E8: ${finalPath}`,
    );
  }
  return finalPath;
}
function backupPathFor(dataFilePath) {
  return dataFilePath.replace(/\.json$/, '.backup.json');
}
function realDir(dataDir) {
  return realpathOrResolve(dataDir);
}
function assertNoSymlinkEscape(baseRealDir, filePath) {
  let isLink = false;
  try {
    isLink = fs.lstatSync(filePath).isSymbolicLink();
  } catch {
    return;
  }
  if (!isLink) return;
  let real;
  try {
    real = fs.realpathSync.native(filePath);
  } catch {
    throw new PathSecurityError(`symlink \uD574\uC11D \uC2E4\uD328: ${filePath}`);
  }
  if (!isInside(baseRealDir, real)) {
    throw new PathSecurityError(`symlink \uD0C8\uCD9C \uCC28\uB2E8: ${filePath} -> ${real}`);
  }
}
function bridgeStateDir(dataDir = resolveDataDir()) {
  return path.join(dataDir, '.ssampin-aibridge');
}

// ../ssampin-ai-bridge/packages/core/dist/io.js
import fs2 from 'node:fs';

// ../ssampin-ai-bridge/packages/core/dist/entities/student.js
function asString(v) {
  return typeof v === 'string' ? v : void 0;
}
function asNumber(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : void 0;
}
function asBool(v) {
  return typeof v === 'boolean' ? v : void 0;
}
function setIf(target, key, value) {
  if (value !== void 0) target[key] = value;
}
function normalizeStudent(o) {
  const s = {
    id: String(o['id']),
    name: String(o['name']),
  };
  setIf(s, 'studentNumber', asNumber(o['studentNumber']));
  setIf(s, 'phone', asString(o['phone']));
  setIf(s, 'parentPhone', asString(o['parentPhone']));
  setIf(s, 'parentPhoneLabel', asString(o['parentPhoneLabel']));
  setIf(s, 'parentPhone2', asString(o['parentPhone2']));
  setIf(s, 'parentPhone2Label', asString(o['parentPhone2Label']));
  setIf(s, 'isVacant', asBool(o['isVacant']));
  setIf(s, 'birthDate', asString(o['birthDate']));
  setIf(s, 'status', asString(o['status']));
  setIf(s, 'statusNote', asString(o['statusNote']));
  setIf(s, 'statusChangedAt', asString(o['statusChangedAt']));
  return s;
}
function parseStudents(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item;
    if (typeof o['id'] !== 'string' || typeof o['name'] !== 'string') continue;
    out.push(normalizeStudent(o));
  }
  return out;
}

// ../ssampin-ai-bridge/packages/core/dist/entities/seating.js
function toSeatCell(v) {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function parseSeating(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw;
  const rows = typeof o['rows'] === 'number' ? o['rows'] : void 0;
  const cols = typeof o['cols'] === 'number' ? o['cols'] : void 0;
  const rawSeats = o['seats'];
  if (rows === void 0 || cols === void 0 || !Array.isArray(rawSeats)) return null;
  const seats = rawSeats.map((row) => (Array.isArray(row) ? row.map(toSeatCell) : []));
  return { rows, cols, seats };
}

// ../ssampin-ai-bridge/packages/core/dist/entities/observation.js
function asString2(v) {
  return typeof v === 'string' ? v : void 0;
}
function asNumber2(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : void 0;
}
function setIf2(target, key, value) {
  if (value !== void 0) target[key] = value;
}
function normalizeRecord(o) {
  if (typeof o['id'] !== 'string' || typeof o['studentId'] !== 'string') return null;
  const visibility = o['visibility'] === 'shared' ? 'shared' : 'private';
  const tags = Array.isArray(o['tags']) ? o['tags'].filter((t) => typeof t === 'string') : [];
  const rec = {
    id: o['id'],
    studentId: o['studentId'],
    date: asString2(o['date']) ?? '',
    content: asString2(o['content']) ?? '',
    tags,
    visibility,
  };
  setIf2(rec, 'classId', asString2(o['classId']));
  setIf2(rec, 'authorId', asString2(o['authorId']));
  setIf2(rec, 'createdAt', asNumber2(o['createdAt']));
  setIf2(rec, 'updatedAt', asNumber2(o['updatedAt']));
  return rec;
}
function parseObservations(raw) {
  const rawRecords = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray(raw['records'])
      ? raw['records']
      : [];
  const records = [];
  for (const item of rawRecords) {
    if (!item || typeof item !== 'object') continue;
    const rec = normalizeRecord(item);
    if (rec) records.push(rec);
  }
  const customTags =
    raw && typeof raw === 'object' && Array.isArray(raw['customTags'])
      ? raw['customTags'].filter((t) => typeof t === 'string')
      : void 0;
  return customTags ? { records, customTags } : { records };
}

// ../ssampin-ai-bridge/packages/core/dist/entities/observationAttachment.js
function asString3(v) {
  return typeof v === 'string' ? v : void 0;
}
function normalizeAttachment(o) {
  if (typeof o['id'] !== 'string' || typeof o['observationId'] !== 'string') return null;
  const kind = o['kind'] === 'image' ? 'image' : 'document';
  const rec = {
    id: o['id'],
    observationId: o['observationId'],
    fileName: asString3(o['fileName']) ?? '',
    kind,
  };
  const ext = asString3(o['extractedText']);
  if (ext !== void 0) rec['extractedText'] = ext;
  const src = o['source'];
  if (src === 'teacher' || src === 'student') rec['source'] = src;
  return rec;
}
function parseObservationAttachments(raw) {
  const rawArr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray(raw['attachments'])
      ? raw['attachments']
      : [];
  const attachments = [];
  for (const item of rawArr) {
    if (!item || typeof item !== 'object') continue;
    const rec = normalizeAttachment(item);
    if (rec) attachments.push(rec);
  }
  return { attachments };
}

// ../ssampin-ai-bridge/packages/core/dist/entities/teachingClass.js
function studentKey(s) {
  if (s.grade != null && s.classNum != null) {
    return `${s.grade}-${s.classNum}-${s.number}`;
  }
  return String(s.number);
}
function asString4(v) {
  return typeof v === 'string' ? v : void 0;
}
function asNumber3(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : void 0;
}
function asBool2(v) {
  return typeof v === 'boolean' ? v : void 0;
}
function setIf3(target, key, value) {
  if (value !== void 0) target[key] = value;
}
function normalizeStudent2(o) {
  const number = asNumber3(o['number']);
  if (number === void 0) return null;
  if (typeof o['name'] !== 'string') return null;
  const s = { number, name: o['name'] };
  setIf3(s, 'memo', asString4(o['memo']));
  setIf3(s, 'grade', asNumber3(o['grade']));
  setIf3(s, 'classNum', asNumber3(o['classNum']));
  setIf3(s, 'isVacant', asBool2(o['isVacant']));
  setIf3(s, 'status', asString4(o['status']));
  setIf3(s, 'statusNote', asString4(o['statusNote']));
  setIf3(s, 'statusChangedAt', asString4(o['statusChangedAt']));
  return s;
}
function normalizeClass(o) {
  if (typeof o['id'] !== 'string' || typeof o['name'] !== 'string') return null;
  const rawStudents = Array.isArray(o['students']) ? o['students'] : [];
  const students = [];
  const seenKeys = /* @__PURE__ */ new Set();
  for (const item of rawStudents) {
    if (!item || typeof item !== 'object') continue;
    const st = normalizeStudent2(item);
    if (!st) continue;
    const key = studentKey(st);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    students.push(st);
  }
  const c = {
    id: o['id'],
    name: o['name'],
    subject: asString4(o['subject']) ?? '',
    students,
  };
  setIf3(c, 'groupId', asString4(o['groupId']));
  setIf3(c, 'order', asNumber3(o['order']));
  const sync = o['studentSyncMode'];
  if (sync === 'shared' || sync === 'independent') c['studentSyncMode'] = sync;
  setIf3(c, 'createdAt', asString4(o['createdAt']));
  setIf3(c, 'updatedAt', asString4(o['updatedAt']));
  return c;
}
function parseTeachingClasses(raw) {
  const rawClasses = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray(raw['classes'])
      ? raw['classes']
      : [];
  const classes = [];
  for (const item of rawClasses) {
    if (!item || typeof item !== 'object') continue;
    const c = normalizeClass(item);
    if (c) classes.push(c);
  }
  return { classes };
}

// ../ssampin-ai-bridge/packages/core/dist/entities/attendance.js
var ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'earlyLeave', 'classAbsence'];
var ATTENDANCE_REASONS = ['\uC9C8\uBCD1', '\uC778\uC815', '\uBBF8\uC778\uC815', '\uAE30\uD0C0'];
var STATUS_SET = new Set(ATTENDANCE_STATUSES);
var REASON_SET = new Set(ATTENDANCE_REASONS);
function asString5(v) {
  return typeof v === 'string' ? v : void 0;
}
function asNumber4(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : void 0;
}
function setIf4(target, key, value) {
  if (value !== void 0) target[key] = value;
}
function isAttendanceStatus(v) {
  return STATUS_SET.has(v);
}
function isAttendanceReason(v) {
  return REASON_SET.has(v);
}
function normalizeStudent3(o) {
  const number = asNumber4(o['number']);
  const status = asString5(o['status']);
  if (number === void 0 || status === void 0 || !isAttendanceStatus(status)) return null;
  const student = { number, status };
  const reason = asString5(o['reason']);
  if (reason !== void 0 && isAttendanceReason(reason)) student['reason'] = reason;
  setIf4(student, 'memo', asString5(o['memo']));
  setIf4(student, 'grade', asNumber4(o['grade']));
  setIf4(student, 'classNum', asNumber4(o['classNum']));
  return student;
}
function normalizeRecord2(o) {
  const classId = asString5(o['classId']);
  const date = asString5(o['date']);
  const period = asNumber4(o['period']);
  if (classId === void 0 || date === void 0 || period === void 0) return null;
  const rawStudents = Array.isArray(o['students']) ? o['students'] : [];
  const students = [];
  for (const item of rawStudents) {
    if (!item || typeof item !== 'object') continue;
    const student = normalizeStudent3(item);
    if (student) students.push(student);
  }
  const record = { classId, date, period, students };
  setIf4(record, 'groupId', asString5(o['groupId']));
  return record;
}
function parseAttendance(raw) {
  const rawRecords =
    raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw['records'])
      ? raw['records']
      : [];
  const records = [];
  for (const item of rawRecords) {
    if (!item || typeof item !== 'object') continue;
    const record = normalizeRecord2(item);
    if (record) records.push(record);
  }
  return { records };
}

// ../ssampin-ai-bridge/packages/core/dist/entities/studentRecord.js
function asString6(v) {
  return typeof v === 'string' ? v : void 0;
}
function asNumber5(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : void 0;
}
function asBool3(v) {
  return typeof v === 'boolean' ? v : void 0;
}
function setIf5(target, key, value) {
  if (value !== void 0) target[key] = value;
}
function normalizePeriod(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw;
  const period = asNumber5(o['period']);
  const status = asString6(o['status']);
  if (period === void 0 || status === void 0) return null;
  if (!isAttendanceStatus(status) || status === 'present') return null;
  const e = { period, status };
  const reason = asString6(o['reason']);
  if (reason !== void 0 && isAttendanceReason(reason)) e['reason'] = reason;
  setIf5(e, 'memo', asString6(o['memo']));
  return e;
}
function normalizeRecord3(o) {
  const id = asString6(o['id']);
  const studentId = asString6(o['studentId']);
  const category = asString6(o['category']);
  const date = asString6(o['date']);
  if (id === void 0 || studentId === void 0 || category === void 0 || date === void 0) {
    return null;
  }
  const rec = {
    id,
    studentId,
    category,
    subcategory: asString6(o['subcategory']) ?? '',
    content: asString6(o['content']) ?? '',
    date,
  };
  if (Array.isArray(o['attendancePeriods'])) {
    const periods = [];
    for (const p of o['attendancePeriods']) {
      const np = normalizePeriod(p);
      if (np) periods.push(np);
    }
    rec['attendancePeriods'] = periods;
  }
  setIf5(rec, 'reportedToNeis', asBool3(o['reportedToNeis']));
  setIf5(rec, 'documentSubmitted', asBool3(o['documentSubmitted']));
  if (Array.isArray(o['tags'])) {
    const tags = o['tags'].filter((t) => typeof t === 'string');
    if (tags.length > 0) rec['tags'] = tags;
  }
  return rec;
}
function parseStudentRecords(raw) {
  const rawRecords = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray(raw['records'])
      ? raw['records']
      : [];
  const records = [];
  for (const item of rawRecords) {
    if (!item || typeof item !== 'object') continue;
    const rec = normalizeRecord3(item);
    if (rec) records.push(rec);
  }
  return { records };
}

// ../ssampin-ai-bridge/packages/core/dist/entities/rubric.js
function asString7(v) {
  return typeof v === 'string' ? v : void 0;
}
function asNumber6(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : void 0;
}
function setIf6(target, key, value) {
  if (value !== void 0) target[key] = value;
}
function asStringRecord(v) {
  if (!v || typeof v !== 'object') return {};
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'string') out[k] = val;
  }
  return out;
}
function normalizeLevel(o) {
  if (typeof o['id'] !== 'string' || typeof o['name'] !== 'string') return null;
  const lv = { id: o['id'], name: o['name'] };
  setIf6(lv, 'description', asString7(o['description']));
  return lv;
}
function normalizeCriterion(o) {
  if (typeof o['id'] !== 'string' || typeof o['name'] !== 'string') return null;
  const levels = [];
  if (Array.isArray(o['levels'])) {
    for (const item of o['levels']) {
      if (item && typeof item === 'object') {
        const lv = normalizeLevel(item);
        if (lv) levels.push(lv);
      }
    }
  }
  return { id: o['id'], name: o['name'], order: asNumber6(o['order']) ?? 0, levels };
}
function normalizeRubric(o) {
  if (
    typeof o['id'] !== 'string' ||
    typeof o['classId'] !== 'string' ||
    typeof o['title'] !== 'string'
  ) {
    return null;
  }
  const criteria = [];
  if (Array.isArray(o['criteria'])) {
    for (const item of o['criteria']) {
      if (item && typeof item === 'object') {
        const c = normalizeCriterion(item);
        if (c) criteria.push(c);
      }
    }
  }
  const r = { id: o['id'], classId: o['classId'], title: o['title'], criteria };
  setIf6(r, 'description', asString7(o['description']));
  return r;
}
function normalizeGrading(o) {
  if (
    typeof o['id'] !== 'string' ||
    typeof o['rubricId'] !== 'string' ||
    typeof o['classId'] !== 'string' ||
    typeof o['studentId'] !== 'string'
  ) {
    return null;
  }
  const status = o['status'] === 'graded' || o['status'] === 'absent' ? o['status'] : 'partial';
  const g = {
    id: o['id'],
    rubricId: o['rubricId'],
    classId: o['classId'],
    studentId: o['studentId'],
    status,
    marks: asStringRecord(o['marks']),
    criterionNotes: asStringRecord(o['criterionNotes']),
    gradedAt: asString7(o['gradedAt']) ?? '',
  };
  setIf6(g, 'overallFeedback', asString7(o['overallFeedback']));
  return g;
}
function parseRubrics(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const rubrics = [];
  if (Array.isArray(o['rubrics'])) {
    for (const item of o['rubrics']) {
      if (item && typeof item === 'object') {
        const r = normalizeRubric(item);
        if (r) rubrics.push(r);
      }
    }
  }
  const gradings = [];
  if (Array.isArray(o['gradings'])) {
    for (const item of o['gradings']) {
      if (item && typeof item === 'object') {
        const g = normalizeGrading(item);
        if (g) gradings.push(g);
      }
    }
  }
  return { rubrics, gradings };
}

// ../ssampin-ai-bridge/packages/core/dist/entities/gradeAnalysis.js
function gradeStudentKey(ref) {
  const name = ref.name.replace(/\s/g, '');
  if (ref.grade != null && ref.classNum != null) {
    return [ref.grade, ref.classNum, ref.number, name].join('-');
  }
  return [ref.number, name].join('-');
}
function asString8(v) {
  return typeof v === 'string' ? v : void 0;
}
function setIf7(target, key, value) {
  if (value !== void 0) target[key] = value;
}
function asAbsence(v) {
  return v === 'absent' || v === 'recognized' || v === 'exempt' || v === 'none' ? v : void 0;
}
function normalizePlan(o) {
  if (
    typeof o['id'] !== 'string' ||
    typeof o['teachingClassId'] !== 'string' ||
    typeof o['title'] !== 'string'
  ) {
    return null;
  }
  const kind = o['kind'] === 'written-exam' ? 'written-exam' : 'performance';
  const p = {
    id: o['id'],
    teachingClassId: o['teachingClassId'],
    semester: asString8(o['semester']) ?? '',
    subject: asString8(o['subject']) ?? '',
    title: o['title'],
    kind,
    areaName: asString8(o['areaName']) ?? '',
  };
  setIf7(p, 'method', asString8(o['method']));
  return p;
}
function normalizeWritten(o) {
  if (
    typeof o['id'] !== 'string' ||
    typeof o['assessmentId'] !== 'string' ||
    typeof o['studentKey'] !== 'string'
  ) {
    return null;
  }
  const w = {
    id: o['id'],
    assessmentId: o['assessmentId'],
    studentKey: o['studentKey'],
    scorePresent: typeof o['score'] === 'number' && Number.isFinite(o['score']),
    confirmed: o['confirmed'] === true,
  };
  setIf7(w, 'absenceCode', asAbsence(o['absenceCode']));
  setIf7(w, 'memo', asString8(o['memo']));
  return w;
}
function normalizePerformance(o) {
  if (
    typeof o['id'] !== 'string' ||
    typeof o['assessmentId'] !== 'string' ||
    typeof o['studentKey'] !== 'string'
  ) {
    return null;
  }
  const p = {
    id: o['id'],
    assessmentId: o['assessmentId'],
    studentKey: o['studentKey'],
    scorePresent: typeof o['score'] === 'number' && Number.isFinite(o['score']),
    confirmed: o['confirmed'] === true,
  };
  setIf7(p, 'rubricGradingId', asString8(o['rubricGradingId']));
  setIf7(p, 'evidenceNote', asString8(o['evidenceNote']));
  setIf7(p, 'memo', asString8(o['memo']));
  return p;
}
function normalizeSemester(o) {
  if (
    typeof o['id'] !== 'string' ||
    typeof o['teachingClassId'] !== 'string' ||
    typeof o['studentKey'] !== 'string'
  ) {
    return null;
  }
  const s = {
    id: o['id'],
    teachingClassId: o['teachingClassId'],
    semester: asString8(o['semester']) ?? '',
    studentKey: o['studentKey'],
    confirmed: o['confirmed'] === true,
  };
  setIf7(s, 'achievementLevel', asString8(o['achievementLevel']));
  return s;
}
function collect(raw, key, fn) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = [];
  if (Array.isArray(o[key])) {
    for (const item of o[key]) {
      if (item && typeof item === 'object') {
        const v = fn(item);
        if (v) out.push(v);
      }
    }
  }
  return out;
}
function parseGradeAnalysis(raw) {
  return {
    plans: collect(raw, 'plans', normalizePlan),
    writtenResults: collect(raw, 'writtenResults', normalizeWritten),
    performanceResults: collect(raw, 'performanceResults', normalizePerformance),
    semesterResults: collect(raw, 'semesterResults', normalizeSemester),
  };
}

// ../ssampin-ai-bridge/packages/core/dist/entities/meal.js
function asString9(v) {
  return typeof v === 'string' ? v : void 0;
}
function parseDishes(raw) {
  if (!Array.isArray(raw)) return [];
  const dishes = [];
  for (const d of raw) {
    if (!d || typeof d !== 'object') continue;
    const o = d;
    const name = asString9(o['name']);
    if (name === void 0 || name.length === 0) continue;
    const allergensRaw = o['allergens'];
    const allergens = Array.isArray(allergensRaw)
      ? allergensRaw.filter((n) => typeof n === 'number' && Number.isFinite(n))
      : [];
    dishes.push({ name, allergens });
  }
  return dishes;
}
function normalizeMeal(date, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw;
  const ownDate = asString9(o['date']);
  const mealType = asString9(o['mealType']) ?? '';
  const dishes = parseDishes(o['dishes']);
  const calorie = asString9(o['calorie']);
  const entry = {
    date: ownDate && ownDate.length > 0 ? ownDate : date,
    mealType,
    dishes,
  };
  if (calorie !== void 0) entry['calorie'] = calorie;
  return entry;
}
function parseManualMeals(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const byDate = raw;
  const out = [];
  for (const date of Object.keys(byDate)) {
    const arr = byDate[date];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const meal = normalizeMeal(date, item);
      if (meal) out.push(meal);
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

// ../ssampin-ai-bridge/packages/core/dist/entities/schoolEvent.js
function asString10(v) {
  return typeof v === 'string' ? v : void 0;
}
function asBool4(v) {
  return typeof v === 'boolean' ? v : void 0;
}
function setIf8(target, key, value) {
  if (value !== void 0) target[key] = value;
}
function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw;
  if (o['isHidden'] === true) return null;
  const date = asString10(o['date']);
  const title = asString10(o['title']);
  if (date === void 0 || date.length === 0) return null;
  const rec = { date, title: title ?? '' };
  setIf8(rec, 'id', asString10(o['id']));
  setIf8(rec, 'endDate', asString10(o['endDate']));
  setIf8(rec, 'category', asString10(o['category']));
  setIf8(rec, 'time', asString10(o['time']));
  setIf8(rec, 'startTime', asString10(o['startTime']));
  setIf8(rec, 'endTime', asString10(o['endTime']));
  setIf8(rec, 'period', asString10(o['period']));
  setIf8(rec, 'periodEnd', asString10(o['periodEnd']));
  setIf8(rec, 'recurrence', asString10(o['recurrence']));
  setIf8(rec, 'isDDay', asBool4(o['isDDay']));
  setIf8(rec, 'description', asString10(o['description']));
  setIf8(rec, 'location', asString10(o['location']));
  return rec;
}
function parseSchoolEvents(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const list = raw['events'];
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const ev = normalizeEvent(item);
    if (ev) out.push(ev);
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

// ../ssampin-ai-bridge/packages/core/dist/entities/dday.js
function asString11(v) {
  return typeof v === 'string' ? v : void 0;
}
function asBool5(v) {
  return typeof v === 'boolean' ? v : void 0;
}
function setIf9(target, key, value) {
  if (value !== void 0) target[key] = value;
}
function normalizeDday(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw;
  const date = asString11(o['targetDate']);
  if (date === void 0 || date.length === 0) return null;
  const rec = { date, title: asString11(o['title']) ?? '' };
  setIf9(rec, 'emoji', asString11(o['emoji']));
  setIf9(rec, 'color', asString11(o['color']));
  setIf9(rec, 'pinned', asBool5(o['pinned']));
  return rec;
}
function parseDdays(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const list = raw['items'];
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const d = normalizeDday(item);
    if (d) out.push(d);
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

// ../ssampin-ai-bridge/packages/core/dist/entities/todo.js
function asString12(v) {
  return typeof v === 'string' ? v : void 0;
}
function asBool6(v) {
  return v === true;
}
function setIf10(target, key, value) {
  if (value !== void 0) target[key] = value;
}
function recurrenceType(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return void 0;
  return asString12(v['type']);
}
function normalizeTodo(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw;
  const text = asString12(o['text']);
  if (text === void 0) return null;
  const rec = { text, completed: asBool6(o['completed']) };
  setIf10(rec, 'id', asString12(o['id']));
  setIf10(rec, 'dueDate', asString12(o['dueDate']));
  setIf10(rec, 'startDate', asString12(o['startDate']));
  setIf10(rec, 'time', asString12(o['time']));
  setIf10(rec, 'priority', asString12(o['priority']));
  setIf10(rec, 'category', asString12(o['category']));
  setIf10(rec, 'status', asString12(o['status']));
  setIf10(rec, 'recurrence', recurrenceType(o['recurrence']));
  setIf10(rec, 'archivedAt', asString12(o['archivedAt']));
  setIf10(rec, 'notes', asString12(o['notes']));
  const subTasks = o['subTasks'];
  if (Array.isArray(subTasks)) {
    rec['subTaskCount'] = subTasks.length;
    rec['subTaskDone'] = subTasks.filter(
      (s) => s && typeof s === 'object' && s['completed'] === true,
    ).length;
  }
  return rec;
}
function parseTodos(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const list = raw['todos'];
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const t = normalizeTodo(item);
    if (t) out.push(t);
  }
  out.sort((a, b) => {
    const ad = a.dueDate ?? '\uFFFF';
    const bd = b.dueDate ?? '\uFFFF';
    return ad < bd ? -1 : ad > bd ? 1 : 0;
  });
  return out;
}
function effectiveTodoStatus(t) {
  if (t.status === 'todo' || t.status === 'inProgress' || t.status === 'done') return t.status;
  return t.completed ? 'done' : 'todo';
}

// ../ssampin-ai-bridge/packages/core/dist/entities/schedule.js
function asString13(v) {
  return typeof v === 'string' ? v : void 0;
}
function asNumber7(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : void 0;
}
function setIf11(target, key, value) {
  if (value !== void 0) target[key] = value;
}
function flattenDayMap(raw, build) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const byDay = raw;
  const out = [];
  for (const day of Object.keys(byDay)) {
    const arr = byDay[day];
    if (!Array.isArray(arr)) continue;
    arr.forEach((slot, i) => {
      if (!slot || typeof slot !== 'object' || Array.isArray(slot)) return;
      const rec = build(day, i, slot);
      if (rec) out.push(rec);
    });
  }
  return out;
}
function parseClassSchedule(raw) {
  return flattenDayMap(raw, (day, i, slot) => {
    const subject = asString13(slot['subject']) ?? '';
    if (subject.length === 0) return null;
    const rec = { day, period: i + 1, subject };
    const teacher = asString13(slot['teacher']);
    if (teacher !== void 0 && teacher.length > 0) rec['teacher'] = teacher;
    return rec;
  });
}
function parseTeacherSchedule(raw) {
  return flattenDayMap(raw, (day, i, slot) => {
    const subject = asString13(slot['subject']) ?? '';
    if (subject.length === 0) return null;
    const rec = { day, period: i + 1, subject };
    const classroom = asString13(slot['classroom']);
    if (classroom !== void 0 && classroom.length > 0) rec['classroom'] = classroom;
    return rec;
  });
}
function parseTimetableOverrides(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const list = raw['overrides'];
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item;
    const date = asString13(o['date']);
    const period = asNumber7(o['period']);
    if (date === void 0 || period === void 0) continue;
    const rec = { date, period };
    setIf11(rec, 'subject', asString13(o['subject']));
    setIf11(rec, 'classroom', asString13(o['classroom']));
    setIf11(rec, 'kind', asString13(o['kind']));
    setIf11(rec, 'scope', asString13(o['scope']));
    setIf11(rec, 'substituteTeacher', asString13(o['substituteTeacher']));
    setIf11(rec, 'reason', asString13(o['reason']));
    out.push(rec);
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.period - b.period));
  return out;
}

// ../ssampin-ai-bridge/packages/core/dist/entities/note.js
function asString14(v) {
  return typeof v === 'string' ? v : void 0;
}
function asNumber8(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function asArray(raw) {
  return Array.isArray(raw) ? raw : [];
}
function parseNotebooks(raw) {
  const out = [];
  for (const item of asArray(raw)) {
    if (!item || typeof item !== 'object') continue;
    const o = item;
    const id = asString14(o['id']);
    if (id === void 0) continue;
    out.push({
      id,
      title: asString14(o['title']) ?? '',
      archived: o['archived'] === true,
      order: asNumber8(o['order']),
    });
  }
  return out;
}
function parseNoteSections(raw) {
  const out = [];
  for (const item of asArray(raw)) {
    if (!item || typeof item !== 'object') continue;
    const o = item;
    const id = asString14(o['id']);
    const notebookId = asString14(o['notebookId']);
    if (id === void 0 || notebookId === void 0) continue;
    out.push({ id, notebookId, title: asString14(o['title']) ?? '', order: asNumber8(o['order']) });
  }
  return out;
}
function parseNotePages(raw) {
  const out = [];
  for (const item of asArray(raw)) {
    if (!item || typeof item !== 'object') continue;
    const o = item;
    const id = asString14(o['id']);
    const sectionId = asString14(o['sectionId']);
    if (id === void 0 || sectionId === void 0) continue;
    const tags = asArray(o['tags']).filter((t) => typeof t === 'string');
    const rec = {
      id,
      sectionId,
      title: asString14(o['title']) ?? '',
      tags,
      pinned: o['pinned'] === true,
    };
    const updatedAt = asString14(o['updatedAt']);
    if (updatedAt !== void 0) rec['updatedAt'] = updatedAt;
    out.push(rec);
  }
  return out;
}

// ../ssampin-ai-bridge/packages/core/dist/entities/memo.js
function asString15(v) {
  return typeof v === 'string' ? v : void 0;
}
function parseMemos(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const list = raw['memos'];
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item;
    const id = asString15(o['id']);
    const text = asString15(o['content']);
    if (id === void 0 || text === void 0) continue;
    const rec = { id, text, archived: o['archived'] === true };
    const color = asString15(o['color']);
    if (color !== void 0) rec['color'] = color;
    out.push(rec);
  }
  return out;
}

// ../ssampin-ai-bridge/packages/core/dist/entities/bookmark.js
function asString16(v) {
  return typeof v === 'string' ? v : void 0;
}
function asNumber9(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function parseBookmarks(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { groups: [], bookmarks: [] };
  const o = raw;
  const groups = [];
  for (const g of Array.isArray(o['groups']) ? o['groups'] : []) {
    if (!g || typeof g !== 'object') continue;
    const go = g;
    const id = asString16(go['id']);
    if (id === void 0) continue;
    groups.push({
      id,
      name: asString16(go['name']) ?? '',
      archived: go['archived'] === true,
      order: asNumber9(go['order']),
    });
  }
  const bookmarks = [];
  for (const b of Array.isArray(o['bookmarks']) ? o['bookmarks'] : []) {
    if (!b || typeof b !== 'object') continue;
    const bo = b;
    const id = asString16(bo['id']);
    const url = asString16(bo['url']);
    const groupId = asString16(bo['groupId']);
    if (id === void 0 || url === void 0 || url.length === 0 || groupId === void 0) continue;
    bookmarks.push({ id, groupId, name: asString16(bo['name']) ?? '', url });
  }
  return { groups, bookmarks };
}

// ../ssampin-ai-bridge/packages/core/dist/entities/recordDraft.js
var RECORD_AREAS = [
  'autonomy',
  'career',
  'behavior',
  'subject',
  'individualSubject',
  'club',
  'subjectDev',
];
var RECORD_AREA_SET = new Set(RECORD_AREAS);
function isRecordArea(v) {
  return typeof v === 'string' && RECORD_AREA_SET.has(v);
}
var RECORD_DRAFT_STATUSES = /* @__PURE__ */ new Set(['draft', 'reviewing', 'confirmed']);
function neisByteLength(s) {
  let bytes = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    bytes += cp <= 127 ? 1 : 3;
  }
  return bytes;
}
function asString17(v) {
  return typeof v === 'string' ? v : void 0;
}
function asNumber10(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : void 0;
}
function setIf12(target, key, value) {
  if (value !== void 0) target[key] = value;
}
function normalizeStatus(v) {
  return typeof v === 'string' && RECORD_DRAFT_STATUSES.has(v) ? v : 'draft';
}
function normalizeRecord4(o) {
  if (
    typeof o['id'] !== 'string' ||
    !isRecordArea(o['area']) ||
    typeof o['studentRef'] !== 'string'
  ) {
    return null;
  }
  const content = asString17(o['content']) ?? '';
  const basis = Array.isArray(o['basisObservationIds'])
    ? o['basisObservationIds'].filter((x) => typeof x === 'string')
    : [];
  const now = asNumber10(o['createdAt']);
  const rec = {
    id: o['id'],
    area: o['area'],
    studentRef: o['studentRef'],
    content,
    byteLength: asNumber10(o['byteLength']) ?? neisByteLength(content),
    basisObservationIds: basis,
    requiresTeacherReview: true,
    status: normalizeStatus(o['status']),
    createdAt: now ?? 0,
    updatedAt: asNumber10(o['updatedAt']) ?? now ?? 0,
  };
  setIf12(rec, 'classId', asString17(o['classId']));
  setIf12(rec, 'subject', asString17(o['subject']));
  if (Array.isArray(o['groundingFlags'])) {
    rec['groundingFlags'] = o['groundingFlags'].filter((x) => typeof x === 'string');
  }
  return rec;
}
function parseRecordDrafts(raw) {
  const rawRecords = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray(raw['records'])
      ? raw['records']
      : [];
  const records = [];
  for (const item of rawRecords) {
    if (!item || typeof item !== 'object') continue;
    const rec = normalizeRecord4(item);
    if (rec) records.push(rec);
  }
  return { records };
}

// ../ssampin-ai-bridge/packages/core/dist/entities/recordEvidence.js
var EVIDENCE_SOURCE_TYPES = /* @__PURE__ */ new Set([
  'manual',
  'observation',
  'studentRecord',
  'assignment',
  'evaluation',
]);
function isEvidenceSourceType(v) {
  return typeof v === 'string' && EVIDENCE_SOURCE_TYPES.has(v);
}
function asString18(v) {
  return typeof v === 'string' ? v : void 0;
}
function asNumber11(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : void 0;
}
function setIf13(target, key, value) {
  if (value !== void 0) target[key] = value;
}
function normalizeRecord5(o) {
  if (typeof o['id'] !== 'string' || typeof o['studentRef'] !== 'string') {
    return null;
  }
  const rawAreas = Array.isArray(o['areas']) ? o['areas'].filter(isRecordArea) : [];
  const areas = [...new Set(rawAreas)];
  const content = asString18(o['content']) ?? '';
  const now = asNumber11(o['createdAt']);
  const rec = {
    id: o['id'],
    studentRef: o['studentRef'],
    areas,
    content,
    createdAt: now ?? 0,
    updatedAt: asNumber11(o['updatedAt']) ?? now ?? 0,
  };
  setIf13(rec, 'date', asString18(o['date']));
  if (isEvidenceSourceType(o['sourceType'])) rec['sourceType'] = o['sourceType'];
  setIf13(rec, 'sourceId', asString18(o['sourceId']));
  setIf13(rec, 'classId', asString18(o['classId']));
  return rec;
}
function parseRecordEvidence(raw) {
  const rawRecords = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray(raw['records'])
      ? raw['records']
      : [];
  const records = [];
  for (const item of rawRecords) {
    if (!item || typeof item !== 'object') continue;
    const rec = normalizeRecord5(item);
    if (rec) records.push(rec);
  }
  return { records };
}

// ../ssampin-ai-bridge/packages/core/dist/io.js
function readRawJson(filename, dataDir = resolveDataDir()) {
  const filePath = resolveDataFile(dataDir, filename);
  const baseReal = realDir(dataDir);
  try {
    assertNoSymlinkEscape(baseReal, filePath);
    if (fs2.existsSync(filePath)) {
      const raw = fs2.readFileSync(filePath, 'utf-8');
      if (raw.trim().length < 2) return null;
      return JSON.parse(raw);
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'PathSecurityError') throw err;
    const backup = backupPathFor(filePath);
    try {
      assertNoSymlinkEscape(baseReal, backup);
      if (fs2.existsSync(backup)) {
        const raw = fs2.readFileSync(backup, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (backupErr) {
      if (backupErr instanceof Error && backupErr.name === 'PathSecurityError') throw backupErr;
    }
  }
  return null;
}
function readStudents(dataDir = resolveDataDir()) {
  return parseStudents(readRawJson('students', dataDir));
}
function readSeating(dataDir = resolveDataDir()) {
  return parseSeating(readRawJson('seating', dataDir));
}
function readObservationAttachments(dataDir = resolveDataDir()) {
  return parseObservationAttachments(readRawJson('observation-attachments', dataDir));
}
function readTeachingClasses(dataDir = resolveDataDir()) {
  return parseTeachingClasses(readRawJson('teaching-classes', dataDir));
}
function readAttendance(dataDir = resolveDataDir()) {
  return parseAttendance(readRawJson('attendance', dataDir));
}
function readStudentRecords(dataDir = resolveDataDir()) {
  return parseStudentRecords(readRawJson('student-records', dataDir));
}
function readRubrics(dataDir = resolveDataDir()) {
  return parseRubrics(readRawJson('rubrics', dataDir));
}
function readGradeAnalysis(dataDir = resolveDataDir()) {
  return parseGradeAnalysis(readRawJson('grade-analysis', dataDir));
}
function readManualMeals(dataDir = resolveDataDir()) {
  return parseManualMeals(readRawJson('manual-meals', dataDir));
}
function readEvents(dataDir = resolveDataDir()) {
  return parseSchoolEvents(readRawJson('events', dataDir));
}
function readDdays(dataDir = resolveDataDir()) {
  return parseDdays(readRawJson('dday', dataDir));
}
function readTodos(dataDir = resolveDataDir()) {
  return parseTodos(readRawJson('todos', dataDir));
}
function readClassSchedule(dataDir = resolveDataDir()) {
  return parseClassSchedule(readRawJson('class-schedule', dataDir));
}
function readTeacherSchedule(dataDir = resolveDataDir()) {
  return parseTeacherSchedule(readRawJson('teacher-schedule', dataDir));
}
function readTimetableOverrides(dataDir = resolveDataDir()) {
  return parseTimetableOverrides(readRawJson('timetable-overrides', dataDir));
}
function readNotebooks(dataDir = resolveDataDir()) {
  return parseNotebooks(readRawJson('note-notebooks', dataDir));
}
function readNoteSections(dataDir = resolveDataDir()) {
  return parseNoteSections(readRawJson('note-sections', dataDir));
}
function readNotePages(dataDir = resolveDataDir()) {
  return parseNotePages(readRawJson('note-pages-meta', dataDir));
}
function readMemos(dataDir = resolveDataDir()) {
  return parseMemos(readRawJson('memos', dataDir));
}
function readBookmarks(dataDir = resolveDataDir()) {
  return parseBookmarks(readRawJson('bookmarks', dataDir));
}
function readRecordDrafts(dataDir = resolveDataDir()) {
  return parseRecordDrafts(readRawJson('record-drafts', dataDir));
}
function readRecordEvidence(dataDir = resolveDataDir()) {
  return parseRecordEvidence(readRawJson('record-evidence', dataDir));
}

// ../ssampin-ai-bridge/packages/core/dist/identity.js
var TEACHING_PREFIX = 'tc:';
var CLASS_PREFIX = 'class:';
var OBSERVATION_PREFIX = 'obs:';
var RUBRIC_PREFIX = 'rubric:';
var TODO_PREFIX = 'todo:';
var EVENT_PREFIX = 'evt:';
var RECORD_DRAFT_PREFIX = 'recordDraft:';
var MEMO_PREFIX = 'memo:';
var BOOKMARK_PREFIX = 'bm:';
var BOOKMARK_GROUP_PREFIX = 'bmg:';
var NOTEBOOK_PREFIX = 'nb:';
var NOTE_SECTION_PREFIX = 'nsec:';
var NOTE_PAGE_PREFIX = 'npg:';
function makeTeachingStudentIdentity(classId, studentKey2) {
  return `${TEACHING_PREFIX}${classId}:${studentKey2}`;
}
function makeClassIdentity(classId) {
  return `${CLASS_PREFIX}${classId}`;
}
function makeObservationIdentity(observationId) {
  return `${OBSERVATION_PREFIX}${observationId}`;
}
function makeRubricIdentity(rubricId) {
  return `${RUBRIC_PREFIX}${rubricId}`;
}
function makeTodoIdentity(todoId) {
  return `${TODO_PREFIX}${todoId}`;
}
function parseTodoIdentity(resolved) {
  return resolved.startsWith(TODO_PREFIX) ? resolved.slice(TODO_PREFIX.length) || null : null;
}
function makeEventIdentity(eventId) {
  return `${EVENT_PREFIX}${eventId}`;
}
function parseEventIdentity(resolved) {
  return resolved.startsWith(EVENT_PREFIX) ? resolved.slice(EVENT_PREFIX.length) || null : null;
}
function parseRubricIdentity(resolved) {
  return resolved.startsWith(RUBRIC_PREFIX) ? resolved.slice(RUBRIC_PREFIX.length) || null : null;
}
function parseObservationIdentity(resolved) {
  return resolved.startsWith(OBSERVATION_PREFIX)
    ? resolved.slice(OBSERVATION_PREFIX.length) || null
    : null;
}
function makeRecordDraftIdentity(draftId) {
  return `${RECORD_DRAFT_PREFIX}${draftId}`;
}
function makeMemoIdentity(memoId) {
  return `${MEMO_PREFIX}${memoId}`;
}
function parseMemoIdentity(resolved) {
  return resolved.startsWith(MEMO_PREFIX) ? resolved.slice(MEMO_PREFIX.length) || null : null;
}
function makeBookmarkIdentity(bookmarkId) {
  return `${BOOKMARK_PREFIX}${bookmarkId}`;
}
function parseBookmarkIdentity(resolved) {
  if (resolved.startsWith(BOOKMARK_GROUP_PREFIX)) return null;
  return resolved.startsWith(BOOKMARK_PREFIX)
    ? resolved.slice(BOOKMARK_PREFIX.length) || null
    : null;
}
function makeBookmarkGroupIdentity(groupId) {
  return `${BOOKMARK_GROUP_PREFIX}${groupId}`;
}
function parseBookmarkGroupIdentity(resolved) {
  return resolved.startsWith(BOOKMARK_GROUP_PREFIX)
    ? resolved.slice(BOOKMARK_GROUP_PREFIX.length) || null
    : null;
}
function makeNotebookIdentity(notebookId) {
  return `${NOTEBOOK_PREFIX}${notebookId}`;
}
function parseNotebookIdentity(resolved) {
  return resolved.startsWith(NOTEBOOK_PREFIX)
    ? resolved.slice(NOTEBOOK_PREFIX.length) || null
    : null;
}
function makeNoteSectionIdentity(sectionId) {
  return `${NOTE_SECTION_PREFIX}${sectionId}`;
}
function parseNoteSectionIdentity(resolved) {
  return resolved.startsWith(NOTE_SECTION_PREFIX)
    ? resolved.slice(NOTE_SECTION_PREFIX.length) || null
    : null;
}
function makeNotePageIdentity(pageId) {
  return `${NOTE_PAGE_PREFIX}${pageId}`;
}
function parseNotePageIdentity(resolved) {
  return resolved.startsWith(NOTE_PAGE_PREFIX)
    ? resolved.slice(NOTE_PAGE_PREFIX.length) || null
    : null;
}
function parseIdentity(resolved) {
  if (resolved.startsWith(TEACHING_PREFIX)) {
    const rest = resolved.slice(TEACHING_PREFIX.length);
    const sep = rest.indexOf(':');
    if (sep > 0 && sep < rest.length - 1) {
      return { kind: 'teaching', classId: rest.slice(0, sep), studentKey: rest.slice(sep + 1) };
    }
    return { kind: 'homeroom', studentId: resolved };
  }
  if (resolved.startsWith(CLASS_PREFIX)) {
    const classId = resolved.slice(CLASS_PREFIX.length);
    if (classId.length > 0) return { kind: 'class', classId };
    return { kind: 'homeroom', studentId: resolved };
  }
  return { kind: 'homeroom', studentId: resolved };
}

// ../ssampin-ai-bridge/packages/core/dist/pii/pseudonymize.js
import crypto from 'node:crypto';
import fs3 from 'node:fs';
import path2 from 'node:path';
var TOKEN_RE = /^(?:stu|tcs|cls|obs|rub|todo|evt|rd|memo|bm|bmg|nb|nsec|npg)_[0-9a-f]{12}$/;
function defaultRandomToken(prefix) {
  return `${prefix}_` + crypto.randomBytes(6).toString('hex');
}
var TokenStore = class {
  map = { idToToken: {}, tokenToId: {} };
  filePath;
  randomToken;
  constructor(opts = {}) {
    const base = opts.dir ?? resolveDataDir();
    this.filePath = path2.join(bridgeStateDir(base), 'tokenmap.json');
    this.randomToken = opts.randomToken ?? defaultRandomToken;
    this.load();
  }
  /**
   * 영속 맵 로드 + 무결성 검증.
   * 토큰 형식(불투명 난수)·양방향 일관성을 만족하는 쌍만 채택하고,
   * 손상·조작된 항목은 조용히 폐기한다("토큰은 불투명" 성질을 영속 상태에도 강제).
   */
  load() {
    let parsed;
    try {
      parsed = JSON.parse(fs3.readFileSync(this.filePath, 'utf-8'));
    } catch {
      return;
    }
    const idToToken = parsed?.idToToken;
    const tokenToId = parsed?.tokenToId;
    if (
      !idToToken ||
      !tokenToId ||
      typeof idToToken !== 'object' ||
      typeof tokenToId !== 'object'
    ) {
      return;
    }
    const clean = { idToToken: {}, tokenToId: {} };
    for (const [id, token] of Object.entries(idToToken)) {
      if (typeof token !== 'string' || !TOKEN_RE.test(token)) continue;
      if (tokenToId[token] !== id) continue;
      if (clean.tokenToId[token] !== void 0) continue;
      clean.idToToken[id] = token;
      clean.tokenToId[token] = id;
    }
    this.map = clean;
  }
  persist() {
    const dir = path2.dirname(this.filePath);
    fs3.mkdirSync(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs3.writeFileSync(tmp, JSON.stringify(this.map, null, 2), 'utf-8');
    fs3.renameSync(tmp, this.filePath);
  }
  /**
   * id(신원 문자열) → 토큰 (없으면 생성·영속).
   * opts.prefix 로 토큰 종류를 자기-기술한다(기본 'stu' = 담임 학생, 하위호환).
   * 이미 토큰이 있으면 prefix 와 무관하게 기존 토큰을 반환한다(멱등).
   */
  getToken(id, opts = {}) {
    const existing = this.map.idToToken[id];
    if (existing) return existing;
    const prefix = opts.prefix ?? 'stu';
    let token = this.randomToken(prefix);
    while (this.map.tokenToId[token]) token = this.randomToken(prefix);
    this.map.idToToken[id] = token;
    this.map.tokenToId[token] = id;
    this.persist();
    return token;
  }
  /** 토큰 → id (로컬 전용 복원, 외부 전송 금지) */
  resolveToken(token) {
    return this.map.tokenToId[token];
  }
};
function rosterFromTeachingClass(cls, store) {
  return cls.students.map((s) => ({
    token: store.getToken(makeTeachingStudentIdentity(cls.id, studentKey(s)), { prefix: 'tcs' }),
    names: [s.name],
  }));
}

// ../ssampin-ai-bridge/packages/core/dist/pii/patterns.js
var SOURCES = {
  // 010-1234-5678 / 01012345678 / +82 10 1234 5678 / 010 123 4567
  phone: '(?:\\+?82[-\\s.]?)?0?1[016789][-\\s.]?\\d{3,4}[-\\s.]?\\d{4}',
  // 주민등록번호: 900315-1234567 / 900315 1234567
  rrn: '(?<!\\d)\\d{6}[-\\s]?[1-4]\\d{6}(?!\\d)',
  // 2010-03-15 / 2010.3.5 / 2010/12/31
  birthDash: '(?:19|20)\\d{2}[-./](?:0?[1-9]|1[0-2])[-./](?:0?[1-9]|[12]\\d|3[01])',
  // 2010년 3월 15일 / 10년 3월 15일
  birthKorean: '(?:19|20)?\\d{2}\\s*\uB144\\s*\\d{1,2}\\s*\uC6D4\\s*\\d{1,2}\\s*\uC77C',
  // 20100315 (8자리 압축)
  birthCompact: '(?<!\\d)(?:19|20)\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])(?!\\d)',
  // 이메일: local@domain.tld — 구글 캘린더 동기화가 일정 category·설명에 캘린더 ID(=이메일)를
  // 넣는 등 자유서술 곳곳에 출현. 이메일은 어떤 맥락에서도 식별 정보이므로 항상 마스킹한다.
  email: '[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}',
};
function globalPattern(name) {
  return new RegExp(SOURCES[name], 'g');
}
function containsPii(value) {
  return Object.keys(SOURCES).some((name) => new RegExp(SOURCES[name]).test(value));
}
function containsContactPii(value) {
  return ['phone', 'rrn', 'email'].some((name) => new RegExp(SOURCES[name]).test(value));
}
var MASK_ORDER = [
  // 이메일을 가장 먼저 마스킹 — 로컬파트의 숫자열(예: id1212)이 전화/생일 패턴에 부분 매칭되어
  // 손상되기 전에 통째로 [이메일]로 치환한다.
  { name: 'email', label: '[\uC774\uBA54\uC77C]', stat: 'emails' },
  { name: 'rrn', label: '[\uC8FC\uBBFC\uBC88\uD638]', stat: 'rrns' },
  { name: 'phone', label: '[\uC804\uD654]', stat: 'phones' },
  { name: 'birthKorean', label: '[\uC0DD\uB144\uC6D4\uC77C]', stat: 'birthDates' },
  { name: 'birthDash', label: '[\uC0DD\uB144\uC6D4\uC77C]', stat: 'birthDates' },
  { name: 'birthCompact', label: '[\uC0DD\uB144\uC6D4\uC77C]', stat: 'birthDates' },
];

// ../ssampin-ai-bridge/packages/core/dist/pii/deidentify.js
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
var NAME_SEP = '[\\s\\u00B7\\u2027\\u30FB\xB7]*';
var INVISIBLE_RE = /[​‌‍﻿­]/g;
function deidentify(content, roster) {
  const stats = {
    names: 0,
    phones: 0,
    rrns: 0,
    birthDates: 0,
    studentNumbers: 0,
    emails: 0,
  };
  let text = content.normalize('NFC').replace(INVISIBLE_RE, '');
  const nameReplacements = [];
  for (const entry of roster) {
    for (const n of entry.names) {
      const needle = (n ?? '').normalize('NFC').replace(INVISIBLE_RE, '').trim();
      if (needle.length > 0) nameReplacements.push({ needle, token: entry.token });
    }
  }
  nameReplacements.sort((a, b) => b.needle.length - a.needle.length);
  for (const { name, label, stat } of MASK_ORDER) {
    text = text.replace(globalPattern(name), () => {
      stats[stat] += 1;
      return label;
    });
  }
  for (const entry of roster) {
    if (entry.studentNumber !== void 0) {
      const re = new RegExp(`(?<!\\d)${entry.studentNumber}(?!\\d)`, 'g');
      text = text.replace(re, () => {
        stats.studentNumbers += 1;
        return '[\uD559\uBC88]';
      });
    }
  }
  for (const { needle, token } of nameReplacements) {
    const spaced = needle.split('').map(escapeRegExp).join(NAME_SEP);
    const re = new RegExp(spaced, 'g');
    text = text.replace(re, () => {
      stats.names += 1;
      return token;
    });
  }
  return { text, stats };
}
function maskPatterns(value) {
  let text = value.normalize('NFC').replace(INVISIBLE_RE, '');
  for (const { name, label } of MASK_ORDER) {
    text = text.replace(globalPattern(name), () => label);
  }
  return text;
}

// ../ssampin-ai-bridge/packages/core/dist/pii/leakScanner.js
function add(set, value) {
  if (typeof value === 'string' && value.trim().length >= 2) {
    set.add(value);
  }
}
function buildSecretCorpus(students) {
  const set = /* @__PURE__ */ new Set();
  for (const s of students) {
    add(set, s.id);
    add(set, s.name);
    add(set, s.phone);
    add(set, s.parentPhone);
    add(set, s.parentPhone2);
    add(set, s.birthDate);
    add(set, s.statusNote);
    if (s.studentNumber !== void 0) add(set, String(s.studentNumber));
  }
  return [...set];
}
function isNumeric(s) {
  return /^\d+$/.test(s);
}
function scanForLeaks(output, corpus) {
  const hay = (JSON.stringify(output) ?? '').normalize('NFC');
  let count = 0;
  const hits = [];
  for (const secret of corpus) {
    if (!secret) continue;
    const norm = secret.normalize('NFC');
    let found;
    if (isNumeric(norm)) {
      found = new RegExp(`\\b${norm}\\b`).test(hay);
    } else {
      found = hay.includes(norm);
    }
    if (found) {
      count += 1;
      hits.push(`leak#${count}`);
    }
  }
  return { clean: count === 0, hitCount: count, hits };
}

// ../ssampin-ai-bridge/packages/core/dist/audit.js
import crypto2 from 'node:crypto';
import fs4 from 'node:fs';
import path3 from 'node:path';
var AuditValueError = class extends Error {
  name = 'AuditValueError';
};
var ALLOWED_STAT_KEYS = /* @__PURE__ */ new Set([
  'names',
  'phones',
  'rrns',
  'birthDates',
  'studentNumbers',
  'observations',
  'students',
  'records',
  'items',
  'redactions',
]);
function assertNoPii(field, value) {
  if (value !== void 0 && containsPii(value)) {
    throw new AuditValueError(
      `\uAC10\uC0AC\uB85C\uADF8 \uD544\uB4DC '${field}' \uC5D0 PII \uD615\uD0DC \uAC12\uC774 \uD3EC\uD568\uB428`,
    );
  }
}
function assertNoContactPii(field, value) {
  if (value !== void 0 && containsContactPii(value)) {
    throw new AuditValueError(
      `\uAC10\uC0AC\uB85C\uADF8 \uD544\uB4DC '${field}' \uC5D0 \uC5F0\uB77D\uCC98/\uC8FC\uBBFC\uBC88\uD638 \uD615\uD0DC \uAC12\uC774 \uD3EC\uD568\uB428`,
    );
  }
}
var AuditLog = class {
  filePath;
  saltPath;
  saltKey;
  constructor(dataDir = resolveDataDir()) {
    const stateDir = bridgeStateDir(dataDir);
    this.filePath = path3.join(stateDir, 'audit.log.jsonl');
    this.saltPath = path3.join(stateDir, '.audit-salt');
    this.saltKey = this.loadOrCreateSalt();
  }
  get path() {
    return this.filePath;
  }
  /** per-install 랜덤 salt 로드/생성 (로그와 분리 보관) */
  loadOrCreateSalt() {
    try {
      const hex = fs4.readFileSync(this.saltPath, 'utf-8').trim();
      if (/^[0-9a-f]{64}$/.test(hex)) return Buffer.from(hex, 'hex');
    } catch {}
    const key = crypto2.randomBytes(32);
    fs4.mkdirSync(path3.dirname(this.saltPath), { recursive: true });
    const tmp = `${this.saltPath}.tmp`;
    fs4.writeFileSync(tmp, key.toString('hex'), 'utf-8');
    fs4.renameSync(tmp, this.saltPath);
    return key;
  }
  /**
   * id → keyed HMAC 해시 (앞 16자).
   * 무염 해시와 달리, salt 없이 로그만 유출돼도 저엔트로피 id(학번·전화성)를
   * 사전대입으로 복원할 수 없다.
   */
  hashRecordId(id) {
    return crypto2.createHmac('sha256', this.saltKey).update(id).digest('hex').slice(0, 16);
  }
  append(input) {
    assertNoPii('tool', input.tool);
    assertNoPii('consentId', input.consentId);
    assertNoPii('destination', input.destination);
    assertNoContactPii('period', input.period);
    assertNoContactPii('rulePackVersion', input.rulePackVersion);
    assertNoPii('validatorResult', input.validatorResult);
    if (input.redactionStats) {
      for (const [k, v] of Object.entries(input.redactionStats)) {
        if (!ALLOWED_STAT_KEYS.has(k)) {
          throw new AuditValueError(
            'redactionStats \uC5D0 \uD5C8\uC6A9\uB418\uC9C0 \uC54A\uC740 \uD0A4\uAC00 \uD3EC\uD568\uB428(allowlist \uC678)',
          );
        }
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
          throw new AuditValueError(
            `redactionStats['${k}'] \uB294 0 \uC774\uC0C1 \uC815\uC218\uC5EC\uC57C \uD568`,
          );
        }
      }
    }
    const entry = {
      ts: /* @__PURE__ */ new Date().toISOString(),
      tool: input.tool,
    };
    if (input.consentId !== void 0) entry['consentId'] = input.consentId;
    if (input.destination !== void 0) entry['destination'] = input.destination;
    if (input.period !== void 0) entry['period'] = input.period;
    if (input.recordIds) entry['recordHashes'] = input.recordIds.map((id) => this.hashRecordId(id));
    if (input.redactionStats) entry['redactionStats'] = input.redactionStats;
    if (input.rulePackVersion !== void 0) entry['rulePackVersion'] = input.rulePackVersion;
    if (input.validatorResult !== void 0) entry['validatorResult'] = input.validatorResult;
    const full = entry;
    fs4.mkdirSync(path3.dirname(this.filePath), { recursive: true });
    fs4.appendFileSync(
      this.filePath,
      `${JSON.stringify(full)}
`,
      'utf-8',
    );
    return full;
  }
  readAll() {
    try {
      const raw = fs4.readFileSync(this.filePath, 'utf-8');
      return raw
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  }
};

// ../ssampin-ai-bridge/packages/core/dist/write.js
import crypto3 from 'node:crypto';
import fs6 from 'node:fs';
import path5 from 'node:path';

// ../ssampin-ai-bridge/packages/core/dist/liveWrite.js
import http from 'node:http';
import fs5 from 'node:fs';
import path4 from 'node:path';
function controlPath(dataDir) {
  return path4.join(bridgeStateDir(dataDir), 'control.json');
}
function capabilityPath(dataDir) {
  return path4.join(bridgeStateDir(dataDir), 'capability.json');
}
function validateControl(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed;
  const { port, token, pid, heartbeatAt } = o;
  if (
    typeof port !== 'number' ||
    !Number.isInteger(port) ||
    port <= 0 ||
    port > 65535 ||
    typeof token !== 'string' ||
    token.length === 0 ||
    typeof pid !== 'number' ||
    !Number.isInteger(pid) ||
    pid <= 0 || // pid 0/음수/소수는 형식위반 → invalid(refuse). 0 은 프로세스그룹 신호라 특히 위험.
    typeof heartbeatAt !== 'number' ||
    !Number.isFinite(heartbeatAt)
  ) {
    return null;
  }
  return { port, token, pid, heartbeatAt };
}
function readControlState(dataDir = resolveDataDir()) {
  const p = controlPath(dataDir);
  if (!fs5.existsSync(p)) return { kind: 'absent' };
  let raw;
  try {
    raw = fs5.readFileSync(p, 'utf-8');
  } catch {
    return { kind: 'invalid' };
  }
  if (raw.trim().length === 0) return { kind: 'invalid' };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'invalid' };
  }
  const control = validateControl(parsed);
  return control ? { kind: 'ok', control } : { kind: 'invalid' };
}
function readControlInfo(dataDir = resolveDataDir()) {
  const s = readControlState(dataDir);
  return s.kind === 'ok' ? s.control : null;
}
function readBridgeCapability(dataDir = resolveDataDir()) {
  try {
    const o = JSON.parse(fs5.readFileSync(capabilityPath(dataDir), 'utf-8'));
    return {
      allowWrite: o['allowWrite'] === true,
      allowContent: o['allowContent'] === true,
      allowRecordWrite: o['allowRecordWrite'] === true,
      allowGradeWrite: o['allowGradeWrite'] === true,
    };
  } catch {
    return {
      allowWrite: false,
      allowContent: false,
      allowRecordWrite: false,
      allowGradeWrite: false,
    };
  }
}
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}
function isAppRunning(control, now = Date.now(), maxAgeMs = 15e3) {
  if (!control) return false;
  if (!pidAlive(control.pid)) return false;
  const age = now - control.heartbeatAt;
  return age >= -2e3 && age <= maxAgeMs;
}
function decideWritePath(dataDir = resolveDataDir(), now = Date.now()) {
  const state = readControlState(dataDir);
  if (state.kind === 'absent') return { path: 'direct', control: null };
  if (state.kind === 'invalid') return { path: 'refuse', control: null };
  const control = state.control;
  if (isAppRunning(control, now)) return { path: 'loopback', control };
  if (!pidAlive(control.pid)) return { path: 'direct', control };
  return { path: 'refuse', control };
}
function postLoopback(control, payload, timeoutMs = 12e3) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    let settled = false;
    const done = (r) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    const req = http.request(
      {
        host: '127.0.0.1',
        port: control.port,
        method: 'POST',
        path: '/',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'x-ssampin-token': control.token,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let parsed = {};
          try {
            parsed = JSON.parse(data);
          } catch {}
          const status = res.statusCode ?? 0;
          const result = {
            ok: status === 200 && parsed['ok'] === true,
            status,
          };
          if (typeof parsed['ref'] === 'string') result.ref = parsed['ref'];
          if (typeof parsed['error'] === 'string') result.error = parsed['error'];
          done(result);
        });
      },
    );
    req.on('error', () =>
      done({
        ok: false,
        status: 0,
        error: '\uC324\uD540 \uC5F0\uACB0 \uC2E4\uD328(\uC11C\uBC84 \uC751\uB2F5 \uC5C6\uC74C).',
      }),
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      done({
        ok: false,
        status: 504,
        error: '\uC324\uD540 \uC751\uB2F5 \uC2DC\uAC04\uCD08\uACFC.',
      });
    });
    req.write(body);
    req.end();
  });
}

// ../ssampin-ai-bridge/packages/core/dist/grounding.js
function isContentExposureEnabled(env = process.env, dataDir) {
  if (env['SSAMPIN_BRIDGE_ALLOW_CONTENT'] === '1') return true;
  if (dataDir !== void 0 && readBridgeCapability(dataDir).allowContent) return true;
  return false;
}
var ContentExposureDisabledError = class extends Error {
  name = 'ContentExposureDisabledError';
};
function getStudentObservations(dataDir, studentId, query = {}) {
  const data = parseObservations(readRawJson('observations', dataDir));
  return data.records
    .filter((r) => r.studentId === studentId)
    .filter((r) => (query.from ? r.date >= query.from : true))
    .filter((r) => (query.to ? r.date <= query.to : true));
}
function getTeachingObservations(dataDir, classId, studentKey2, query = {}) {
  const data = parseObservations(readRawJson('observations', dataDir));
  return data.records
    .filter((r) => r.classId === classId && r.studentId === studentKey2)
    .filter((r) => (query.from ? r.date >= query.from : true))
    .filter((r) => (query.to ? r.date <= query.to : true));
}
var COVERAGE_THRESHOLD = 0.18;
var UNCOVERED_RUN_MAX = 4;
var DISCLAIMER =
  '\uC5B4\uD718 \uC2A4\uD06C\uB9B0\uC77C \uBFD0 \uC758\uBBF8 \uAC80\uC99D\xB7\uAE30\uC7AC \uC801\uD569\uC131\xB7\uC0AC\uC2E4 \uD655\uC778\uC774 \uC544\uB2D9\uB2C8\uB2E4. flags \uAC00 \uC5C6\uC5B4\uB3C4 "\uAE30\uC7AC \uAC00\uB2A5"\uC774 \uC544\uB2C8\uBA70, \uC9E7\uC740 \uB0A0\uC870(\uC218\uC0C1\xB7\uB300\uC0C1\xB7\uC9C4\uB2E8\uBA85 \uB4F1)\uB294 \uC790\uB3D9\uC73C\uB85C \uBABB \uC7A1\uC744 \uC218 \uC788\uC73C\uB2C8 \uBAA8\uB4E0 \uBB38\uC7A5\uC744 \uAD50\uC0AC\uAC00 \uC9C1\uC811 \uC0AC\uC2E4 \uD655\uC778\uD574\uC57C \uD569\uB2C8\uB2E4. \uAE08\uC9C0\uD45C\uD604\xB7\uAE30\uC7AC\uC694\uB839\xB7\uC791\uC131\uBC94\uC704\uB3C4 \uBCC4\uB3C4\uB85C \uD655\uC778\uD558\uC138\uC694.';
var LEVEL_LABELS = {
  elementary: '\uCD08\uB4F1\uD559\uAD50',
  middle: '\uC911\uD559\uAD50',
  high: '\uACE0\uB4F1\uD559\uAD50',
};
var REF_HUNRYUNG = {
  title:
    '\uD559\uAD50\uC0DD\uD65C\uAE30\uB85D \uC791\uC131 \uBC0F \uAD00\uB9AC\uC9C0\uCE68(\uAD50\uC721\uBD80\uD6C8\uB839 \uC81C555\uD638, \uC2DC\uD589 2026-03-01)',
  url: 'https://star.moe.go.kr/web/contents/m20103.do',
};
var REF_REVISION_2026 = {
  title:
    '2026\uD559\uB144\uB3C4 \uD559\uAD50\uC0DD\uD65C\uAE30\uB85D\uBD80 \uAE30\uC7AC\uC694\uB839 \uC8FC\uC694 \uAC1C\uC815\uC0AC\uD56D(\uAD50\uC721\uBD80\xB7KERIS, 2026-02-19)',
  url: 'https://star.moe.go.kr/web/contents/m40100.do',
};
var REF_PORTAL = {
  title:
    '\uD559\uAD50\uC0DD\uD65C\uAE30\uB85D\uBD80 \uAE30\uC7AC\uC694\uB839 \uC790\uB8CC\uC2E4(\uD559\uAD50\uC0DD\uD65C\uAE30\uB85D\uBD80 \uC885\uD569\uC9C0\uC6D0\uD3EC\uD138)',
  url: 'https://star.moe.go.kr/web/contents/m21100.do',
};
var REFERENCES = [REF_HUNRYUNG, REF_REVISION_2026, REF_PORTAL];
var REF_HUNRYUNG_2025 = {
  title:
    '\uD559\uAD50\uC0DD\uD65C\uAE30\uB85D \uC791\uC131 \uBC0F \uAD00\uB9AC\uC9C0\uCE68(\uAD50\uC721\uBD80\uD6C8\uB839 \uC81C504\uD638, \uC2DC\uD589 2025-03-01)',
  url: 'https://star.moe.go.kr/web/contents/m20103.do',
};
var REF_REVISION_2025 = {
  title:
    '2025\uD559\uB144\uB3C4 \uD559\uAD50\uC0DD\uD65C\uAE30\uB85D\uBD80 \uAE30\uC7AC\uC694\uB839 \uC8FC\uC694 \uAC1C\uC815\uC0AC\uD56D(\uAD50\uC721\uBD80\xB7KERIS)',
  url: 'https://star.moe.go.kr/web/contents/m40100.do',
};
var REFERENCES_2025 = [REF_HUNRYUNG_2025, REF_REVISION_2025, REF_PORTAL];
var DISCLAIMER_GUIDE =
  '\uC5F0\uB3C4\xB7\uD559\uAD50\uAE09\uBCC4 \uBCF4\uC218\uC801 \uC694\uC57D \uCC38\uC870\uC6A9\uC785\uB2C8\uB2E4. flags\xB7\uC6D0\uCE59 \uCDA9\uC871\uC774 "\uAE30\uC7AC \uAC00\uB2A5"\uC744 \uB73B\uD558\uC9C0 \uC54A\uC73C\uBA70, \uD559\uAD50\uAE09\xB7\uC5F0\uB3C4\uBCC4 \uCD5C\uC2E0 \uAE30\uC7AC\uC694\uB839 \uC6D0\uBB38\uACFC \uAE08\uC9C0\uD45C\uD604\xB7\uC791\uC131\uBC94\uC704\uB97C \uBC18\uB4DC\uC2DC \uD655\uC778\uD558\uACE0 \uAD50\uC0AC\uAC00 \uCD5C\uC885 \uAC80\uD1A0\uD558\uC138\uC694.';
function principle(text, ref) {
  return { text, source: ref.title, url: ref.url };
}
var COMMON_PRINCIPLES = [
  principle(
    '\uAD50\uC0AC\uAC00 \uC9C1\uC811 \uAD00\uCC30\xB7\uD3C9\uAC00\uD55C \uC0AC\uC2E4\uC744 \uADFC\uAC70\uB85C \uC785\uB825\uD558\uACE0, \uCD94\uCE21\xB7\uACFC\uC7A5\xB7\uBBF8\uAC80\uC99D \uB0B4\uC6A9\uC740 \uAE30\uC7AC\uD558\uC9C0 \uC54A\uB294\uB2E4.',
    REF_HUNRYUNG,
  ),
  principle(
    '\uC0DD\uC131\uD615 AI\uAC00 \uB9CC\uB4E0 \uBB38\uC7A5\uC744 \uADF8\uB300\uB85C \uC62E\uACA8 \uC801\uC9C0 \uC54A\uB294\uB2E4(2026 \uAC1C\uC815). \uAE30\uB85D \uC8FC\uCCB4\uB294 \uAD50\uC0AC\uC774\uBA70 \uBAA8\uB4E0 \uBB38\uC7A5\uC740 \uC218\uC5C5 \uC911 \uC2E4\uC81C \uAD00\uCC30\uC5D0 \uADFC\uAC70\uD574\uC57C \uD55C\uB2E4.',
    REF_REVISION_2026,
  ),
  principle(
    '\uB2E4\uC74C\uC740 \uC785\uB825\uD560 \uC218 \uC5C6\uB2E4: \uAD50\uB0B4\uC678 \uC778\uC99D\uC2DC\uD5D8 \uC131\uC801, \uBAA8\uC758\uACE0\uC0AC\xB7\uC804\uAD6D\uC5F0\uD569\uD559\uB825\uD3C9\uAC00 \uC131\uC801, \uB17C\uBB38 \uD22C\uACE0\xB7\uB4F1\uC7AC, \uB3C4\uC11C \uCD9C\uAC04, \uC9C0\uC2DD\uC7AC\uC0B0\uAD8C(\uD2B9\uD5C8\xB7\uC2E4\uC6A9\uC2E0\uC548 \uB4F1) \uCD9C\uC6D0\xB7\uB4F1\uB85D, \uC5B4\uD559\uC5F0\uC218 \uB4F1 \uD574\uC678 \uD65C\uB3D9\uC2E4\uC801, \uBD80\uBAA8\xB7\uCE5C\uC778\uCC99\uC758 \uC0AC\uD68C\xB7\uACBD\uC81C\uC801 \uC9C0\uC704 \uC554\uC2DC.',
    REF_HUNRYUNG,
  ),
  principle(
    '\uAD6C\uCCB4\uC801 \uC0AC\uB840 \uC911\uC2EC\uC73C\uB85C \uD559\uC0DD\uC758 \uC131\uC7A5\xB7\uBCC0\uD654\uB97C \uC11C\uC220\uD558\uACE0, \uB2E8\uC21C \uC0AC\uC2E4 \uB098\uC5F4\uC774\uB098 \uB2E8\uC815\uC801 \uD3C9\uAC00\uB294 \uD53C\uD55C\uB2E4.',
    REF_PORTAL,
  ),
  principle(
    '"\uADFC\uAC70 \uC874\uC7AC"\uC640 "\uAE30\uC7AC \uAC00\uB2A5"\uC740 \uB2E4\uB974\uB2E4 \u2014 \uD559\uAD50\uAE09\xB7\uC5F0\uB3C4\uBCC4 \uAE30\uC7AC\uC694\uB839\uACFC \uC791\uC131 \uBC94\uC704\xB7\uAE08\uC9C0\uD45C\uD604\uC744 \uD568\uAED8 \uD655\uC778\uD55C\uB2E4.',
    REF_PORTAL,
  ),
  principle(
    '\uCD5C\uC885 \uAE30\uC7AC \uC804 \uAD50\uC0AC\uAC00 \uADDC\uC815\uACFC \uC0AC\uC2E4\uC744 \uBC18\uB4DC\uC2DC \uAC80\uD1A0\uD55C\uB2E4. \uB9C8\uAC10 \uC774\uD6C4 \uC815\uC815\uC740 \uC6D0\uCE59\uC801\uC73C\uB85C \uAE08\uC9C0\uB41C\uB2E4.',
    REF_HUNRYUNG,
  ),
];
var LEVEL_PRINCIPLES = {
  elementary: [
    principle(
      '\uCD08\uB4F1\uD559\uAD50 \uAD50\uACFC\uD559\uC2B5\uBC1C\uB2EC\uC0C1\uD669\uC740 \uC810\uC218\xB7\uC11D\uCC28 \uC5C6\uC774 \uC131\uCDE8\uAE30\uC900 \uB3C4\uB2EC \uC815\uB3C4\uB97C \uC11C\uC220\uD558\uACE0, \uD589\uB3D9\uD2B9\uC131 \uBC0F \uC885\uD569\uC758\uACAC\uC744 \uAD00\uCC30 \uADFC\uAC70\uB85C \uC791\uC131\uD55C\uB2E4.',
      REF_PORTAL,
    ),
    principle(
      '\uC218\uC0C1\uACBD\uB825\uC5D0\uB294 \uAD50\uB0B4\uC0C1\uB9CC \uC785\uB825\uD558\uBA70 \uAD50\uC678 \uC218\uC0C1\xB7\uC678\uBD80 \uC2E4\uC801\uC740 \uAE30\uC7AC\uD558\uC9C0 \uC54A\uB294\uB2E4.',
      REF_HUNRYUNG,
    ),
  ],
  middle: [
    principle(
      '\uC218\uC0C1\uACBD\uB825\uC5D0\uB294 \uAD50\uB0B4\uC0C1\uB9CC \uC785\uB825\uD558\uACE0, \uAC19\uC740 \uB0B4\uC6A9\uC73C\uB85C \uC5EC\uB7EC \uBC88 \uC218\uC0C1\uD55C \uACBD\uC6B0 \uCD5C\uC0C1\uC704 1\uAC1C\uB9CC \uC785\uB825\uD55C\uB2E4. \uAD50\uC678 \uC218\uC0C1\uC740 \uAE30\uC7AC\uD558\uC9C0 \uC54A\uB294\uB2E4.',
      REF_HUNRYUNG,
    ),
  ],
  high: [
    principle(
      '\uC218\uC0C1\uACBD\uB825\uC5D0\uB294 \uAD50\uB0B4\uC0C1\uB9CC \uC785\uB825(\uCD5C\uC0C1\uC704 1\uAC1C)\uD558\uBA70, \uACF5\uC778\uC5B4\uD559\uC131\uC801\xB7\uAD50\uACFC \uAD00\uB828 \uAD50\uC678 \uC218\uC0C1\uC2E4\uC801\uC740 \uB300\uC785(\uD559\uC0DD\uBD80\uC704\uC8FC\uC804\uD615) \uC81C\uCD9C\uC774 \uAE08\uC9C0\uB41C\uB2E4.',
      REF_HUNRYUNG,
    ),
    principle(
      '\uACE0\uAD50\uD559\uC810\uC81C \uAD00\uB828: \uACFC\uBAA9 \uBBF8\uC774\uC218(I) \uCC98\uB9AC\uC640 \uC131\uCDE8\uB3C4(A~E) \uC0B0\uCD9C \uB4F1 2026 \uAC1C\uC815\uC0AC\uD56D\uC744 \uB530\uB978\uB2E4(\uC0C1\uC138 \uAE30\uC900\uC740 \uC6D0\uBB38 \uD655\uC778).',
      REF_REVISION_2026,
    ),
    principle(
      '\uD559\uAD50 \uBC16\uC5D0\uC11C \uD559\uC0DD\uC774 \uC2A4\uC2A4\uB85C \uC218\uD589\uD558\uB294 \uACFC\uC81C\uD615 \uC218\uD589\uD3C9\uAC00 \uACB0\uACFC\uB294 \uAE30\uB85D \uADFC\uAC70\uB85C \uC0BC\uC9C0 \uC54A\uB294\uB2E4(\uC218\uC5C5 \uC911 \uAD50\uC0AC \uAD00\uCC30 \uADFC\uAC70, 2026 \uAC1C\uC815).',
      REF_REVISION_2026,
    ),
  ],
};
var COMMON_PRINCIPLES_2025 = [
  principle(
    '\uAD50\uC0AC\uAC00 \uC9C1\uC811 \uAD00\uCC30\xB7\uD3C9\uAC00\uD55C \uC0AC\uC2E4\uC744 \uADFC\uAC70\uB85C \uC785\uB825\uD558\uACE0, \uCD94\uCE21\xB7\uACFC\uC7A5\xB7\uBBF8\uAC80\uC99D \uB0B4\uC6A9\uC740 \uAE30\uC7AC\uD558\uC9C0 \uC54A\uB294\uB2E4.',
    REF_HUNRYUNG_2025,
  ),
  principle(
    '\uB2E4\uC74C\uC740 \uC785\uB825\uD560 \uC218 \uC5C6\uB2E4: \uAD50\uB0B4\uC678 \uC778\uC99D\uC2DC\uD5D8 \uC131\uC801, \uBAA8\uC758\uACE0\uC0AC\xB7\uC804\uAD6D\uC5F0\uD569\uD559\uB825\uD3C9\uAC00 \uC131\uC801, \uB17C\uBB38 \uD22C\uACE0\xB7\uB4F1\uC7AC, \uB3C4\uC11C \uCD9C\uAC04, \uC9C0\uC2DD\uC7AC\uC0B0\uAD8C(\uD2B9\uD5C8\xB7\uC2E4\uC6A9\uC2E0\uC548 \uB4F1) \uCD9C\uC6D0\xB7\uB4F1\uB85D, \uC5B4\uD559\uC5F0\uC218 \uB4F1 \uD574\uC678 \uD65C\uB3D9\uC2E4\uC801, \uBD80\uBAA8\xB7\uCE5C\uC778\uCC99\uC758 \uC0AC\uD68C\xB7\uACBD\uC81C\uC801 \uC9C0\uC704 \uC554\uC2DC.',
    REF_HUNRYUNG_2025,
  ),
  principle(
    '\uAD6C\uCCB4\uC801 \uC0AC\uB840 \uC911\uC2EC\uC73C\uB85C \uD559\uC0DD\uC758 \uC131\uC7A5\xB7\uBCC0\uD654\uB97C \uC11C\uC220\uD558\uACE0, \uB2E8\uC21C \uC0AC\uC2E4 \uB098\uC5F4\uC774\uB098 \uB2E8\uC815\uC801 \uD3C9\uAC00\uB294 \uD53C\uD55C\uB2E4.',
    REF_PORTAL,
  ),
  principle(
    '"\uADFC\uAC70 \uC874\uC7AC"\uC640 "\uAE30\uC7AC \uAC00\uB2A5"\uC740 \uB2E4\uB974\uB2E4 \u2014 \uD559\uAD50\uAE09\xB7\uC5F0\uB3C4\uBCC4 \uAE30\uC7AC\uC694\uB839\uACFC \uC791\uC131 \uBC94\uC704\xB7\uAE08\uC9C0\uD45C\uD604\uC744 \uD568\uAED8 \uD655\uC778\uD55C\uB2E4.',
    REF_PORTAL,
  ),
  principle(
    '\uCD5C\uC885 \uAE30\uC7AC \uC804 \uAD50\uC0AC\uAC00 \uADDC\uC815\uACFC \uC0AC\uC2E4\uC744 \uBC18\uB4DC\uC2DC \uAC80\uD1A0\uD55C\uB2E4. \uB9C8\uAC10 \uC774\uD6C4 \uC815\uC815\uC740 \uC6D0\uCE59\uC801\uC73C\uB85C \uAE08\uC9C0\uB41C\uB2E4.',
    REF_HUNRYUNG_2025,
  ),
];
var LEVEL_PRINCIPLES_2025 = {
  elementary: [
    principle(
      '\uCD08\uB4F1\uD559\uAD50 \uAD50\uACFC\uD559\uC2B5\uBC1C\uB2EC\uC0C1\uD669\uC740 \uC810\uC218\xB7\uC11D\uCC28 \uC5C6\uC774 \uC131\uCDE8\uAE30\uC900 \uB3C4\uB2EC \uC815\uB3C4\uB97C \uC11C\uC220\uD558\uACE0, \uD589\uB3D9\uD2B9\uC131 \uBC0F \uC885\uD569\uC758\uACAC\uC744 \uAD00\uCC30 \uADFC\uAC70\uB85C \uC791\uC131\uD55C\uB2E4.',
      REF_PORTAL,
    ),
    principle(
      '\uC218\uC0C1\uACBD\uB825\uC5D0\uB294 \uAD50\uB0B4\uC0C1\uB9CC \uC785\uB825\uD558\uBA70 \uAD50\uC678 \uC218\uC0C1\xB7\uC678\uBD80 \uC2E4\uC801\uC740 \uAE30\uC7AC\uD558\uC9C0 \uC54A\uB294\uB2E4.',
      REF_HUNRYUNG_2025,
    ),
  ],
  middle: [
    principle(
      '\uC218\uC0C1\uACBD\uB825\uC5D0\uB294 \uAD50\uB0B4\uC0C1\uB9CC \uC785\uB825\uD558\uACE0, \uAC19\uC740 \uB0B4\uC6A9\uC73C\uB85C \uC5EC\uB7EC \uBC88 \uC218\uC0C1\uD55C \uACBD\uC6B0 \uCD5C\uC0C1\uC704 1\uAC1C\uB9CC \uC785\uB825\uD55C\uB2E4. \uAD50\uC678 \uC218\uC0C1\uC740 \uAE30\uC7AC\uD558\uC9C0 \uC54A\uB294\uB2E4.',
      REF_HUNRYUNG_2025,
    ),
  ],
  high: [
    principle(
      '\uC218\uC0C1\uACBD\uB825\uC5D0\uB294 \uAD50\uB0B4\uC0C1\uB9CC \uC785\uB825(\uCD5C\uC0C1\uC704 1\uAC1C)\uD558\uBA70, \uACF5\uC778\uC5B4\uD559\uC131\uC801\xB7\uAD50\uACFC \uAD00\uB828 \uAD50\uC678 \uC218\uC0C1\uC2E4\uC801\uC740 \uB300\uC785(\uD559\uC0DD\uBD80\uC704\uC8FC\uC804\uD615) \uC81C\uCD9C\uC774 \uAE08\uC9C0\uB41C\uB2E4.',
      REF_HUNRYUNG_2025,
    ),
    principle(
      '2025\uD559\uB144\uB3C4 \uACE01\uBD80\uD130 \uAD50\uACFC \uC11D\uCC28\uB4F1\uAE09\uC774 9\uB4F1\uAE09\uC5D0\uC11C 5\uB4F1\uAE09 \uCCB4\uACC4\uB85C \uC804\uD658\uB418\uACE0(2022 \uAC1C\uC815\uAD50\uC721\uACFC\uC815 \uC801\uC6A9), \uC131\uCDE8\uB3C4\uBCC4 \uBD84\uD3EC\uBE44\uC728\uC774 \uBCF4\uD1B5\uAD50\uACFC \uC804 \uACFC\uBAA9\uC73C\uB85C \uD655\uB300\uB418\uBA70 \uD45C\uC900\uD3B8\uCC28\uB294 \uAE30\uC7AC \uB300\uC0C1\uC5D0\uC11C \uC81C\uC678\uB41C\uB2E4(\uC0C1\uC138 \uAE30\uC900\uC740 \uC6D0\uBB38 \uD655\uC778).',
      REF_REVISION_2025,
    ),
  ],
};
var YEAR_PACKS = {
  2025: {
    commonPrinciples: COMMON_PRINCIPLES_2025,
    levelPrinciples: LEVEL_PRINCIPLES_2025,
    references: REFERENCES_2025,
  },
  2026: {
    commonPrinciples: COMMON_PRINCIPLES,
    levelPrinciples: LEVEL_PRINCIPLES,
    references: REFERENCES,
  },
};
var RULE_PACK_YEARS = Object.keys(YEAR_PACKS).sort();
var LATEST_YEAR = RULE_PACK_YEARS[RULE_PACK_YEARS.length - 1] ?? '2026';
var LEGACY_HIGH_RISK_TERMS = [
  '\uC218\uC0C1',
  '\uB300\uC0C1',
  '\uC6B0\uC2B9',
  '\uCD5C\uC6B0\uC218',
  '\uAE08\uC0C1',
  '\uC740\uC0C1',
  '\uB3D9\uC0C1',
  '\uC785\uC0C1',
  '\uD45C\uCC3D',
  '\uC7A5\uD559',
  '\uC790\uACA9\uC99D',
  '\uD569\uACA9',
  '\uC9C4\uB2E8',
  '\uC7A5\uC560',
  '\uB4F1\uAE09',
  '1\uB4F1',
  '\uC77C\uB4F1',
  '\uAE08\uBA54\uB2EC',
];
var PROHIBITED_ITEM_TERMS = [
  '\uD2B9\uD5C8',
  '\uB17C\uBB38',
  '\uC800\uC11C',
  '\uCD9C\uAC04',
  '\uACF5\uC778\uC5B4\uD559',
  '\uD1A0\uC775',
  '\uD1A0\uD50C',
  '\uBAA8\uC758\uACE0\uC0AC',
  '\uD559\uB825\uD3C9\uAC00',
];
var LEVEL_HIGH_RISK_TERMS = {
  elementary: [],
  middle: [],
  // 고등학교: 대입 제출 금지(공인어학) 관련 어휘 보강
  high: ['\uD15D\uC2A4', '\uC624\uD53D'],
};
function resolveLevel(level) {
  if (level === void 0) return void 0;
  const key = level.trim().normalize('NFC');
  const map = {
    elementary: 'elementary',
    middle: 'middle',
    high: 'high',
    초등학교: 'elementary',
    중학교: 'middle',
    고등학교: 'high',
  };
  const resolved = map[key];
  if (resolved === void 0) {
    throw new Error(
      '\uC54C \uC218 \uC5C6\uB294 \uD559\uAD50\uAE09\uC785\uB2C8\uB2E4. \uD5C8\uC6A9\uAC12: elementary|middle|high \uB610\uB294 \uCD08\uB4F1\uD559\uAD50|\uC911\uD559\uAD50|\uACE0\uB4F1\uD559\uAD50',
    );
  }
  return resolved;
}
function resolveYear(year) {
  if (year === void 0) return LATEST_YEAR;
  if (!RULE_PACK_YEARS.includes(year)) {
    throw new Error(
      `\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uAE30\uC7AC\uC694\uB839 \uC5F0\uB3C4\uC785\uB2C8\uB2E4. \uC9C0\uC6D0 \uC5F0\uB3C4: ${RULE_PACK_YEARS.join(', ')}`,
    );
  }
  return year;
}
var LIMIT_CAREER = 2100;
var LIMIT_DEFAULT = 1500;
var AREAS_BY_LEVEL = {
  middle: {
    autonomy: { author: 'homeroom', limit: LIMIT_DEFAULT, limitVerified: true },
    career: { author: 'homeroom', limit: LIMIT_CAREER, limitVerified: true },
    behavior: { author: 'homeroom', limit: LIMIT_DEFAULT, limitVerified: true },
    subject: { author: 'teaching', limit: LIMIT_DEFAULT, limitVerified: true },
    individualSubject: { author: 'teaching', limit: LIMIT_DEFAULT, limitVerified: true },
    club: { author: 'teaching', limit: LIMIT_DEFAULT, limitVerified: true },
  },
  high: {
    autonomy: { author: 'homeroom', limit: LIMIT_DEFAULT, limitVerified: true },
    career: { author: 'homeroom', limit: LIMIT_CAREER, limitVerified: true },
    behavior: { author: 'homeroom', limit: LIMIT_DEFAULT, limitVerified: true },
    subject: { author: 'teaching', limit: LIMIT_DEFAULT, limitVerified: true },
    individualSubject: { author: 'teaching', limit: LIMIT_DEFAULT, limitVerified: true },
    club: { author: 'teaching', limit: LIMIT_DEFAULT, limitVerified: true },
  },
  // 초등: 담임(stu_)이 거의 전 영역. 개인별세특·중고식 subject 없음. subjectDev 는 담임교과(stu_)+전담(tcs_).
  elementary: {
    subjectDev: { author: 'both', limit: LIMIT_DEFAULT, limitVerified: false },
    autonomy: { author: 'homeroom', limit: LIMIT_DEFAULT, limitVerified: false },
    club: { author: 'homeroom', limit: LIMIT_DEFAULT, limitVerified: false },
    career: { author: 'homeroom', limit: LIMIT_CAREER, limitVerified: false },
    behavior: { author: 'homeroom', limit: LIMIT_DEFAULT, limitVerified: false },
  },
};
function requireLevel(level) {
  const lv = resolveLevel(level);
  if (lv === void 0) {
    throw new Error(
      '\uD559\uAD50\uAE09\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uD5C8\uC6A9\uAC12: elementary|middle|high \uB610\uB294 \uCD08\uB4F1\uD559\uAD50|\uC911\uD559\uAD50|\uACE0\uB4F1\uD559\uAD50',
    );
  }
  return lv;
}
function resolveAreaSpec(area, level) {
  const lv = requireLevel(level);
  const spec = isRecordArea(area) ? AREAS_BY_LEVEL[lv][area] : void 0;
  if (!spec || !isRecordArea(area)) {
    throw new Error(
      `${LEVEL_LABELS[lv]}\uC5D0 \uC5C6\uB294 \uC0DD\uAE30\uBD80 \uC601\uC5ED\uC785\uB2C8\uB2E4. \uD5C8\uC6A9 \uC601\uC5ED: ${Object.keys(AREAS_BY_LEVEL[lv]).join(', ')}`,
    );
  }
  return { ...spec, area, level: lv };
}
function resolveRulePack(query = {}) {
  const version = resolveYear(query.year);
  const pack = YEAR_PACKS[version];
  if (!pack) {
    throw new Error(
      `\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uAE30\uC7AC\uC694\uB839 \uC5F0\uB3C4\uC785\uB2C8\uB2E4. \uC9C0\uC6D0 \uC5F0\uB3C4: ${RULE_PACK_YEARS.join(', ')}`,
    );
  }
  const level = resolveLevel(query.level);
  const citations = level
    ? [...pack.commonPrinciples, ...pack.levelPrinciples[level]]
    : pack.commonPrinciples;
  const highRiskTerms = level
    ? [...LEGACY_HIGH_RISK_TERMS, ...PROHIBITED_ITEM_TERMS, ...LEVEL_HIGH_RISK_TERMS[level]]
    : LEGACY_HIGH_RISK_TERMS;
  return {
    version,
    level: level ?? 'common',
    levelLabel: level ? LEVEL_LABELS[level] : '\uACF5\uD1B5',
    citations,
    highRiskTerms,
    references: pack.references,
  };
}
function bigrams(s) {
  const t = s.replace(/\s+/g, '');
  const set = /* @__PURE__ */ new Set();
  for (let i = 0; i + 1 < t.length; i += 1) set.add(t.slice(i, i + 2));
  return set;
}
function claimCoverage(claim, content) {
  const A = bigrams(claim);
  if (A.size === 0) return 0;
  const B = bigrams(content);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter += 1;
  return inter / A.size;
}
function maxUncoveredRun(claim, contents) {
  const t = claim.replace(/\s+/g, '');
  if (t.length < 2) return 0;
  const covered = /* @__PURE__ */ new Set();
  for (const c of contents) for (const g of bigrams(c)) covered.add(g);
  let maxRun = 0;
  let run = 0;
  for (let i = 0; i + 1 < t.length; i += 1) {
    if (covered.has(t.slice(i, i + 2))) {
      run = 0;
    } else {
      run += 1;
      if (run > maxRun) maxRun = run;
    }
  }
  return maxRun;
}
function hasUnverifiedHighRiskTerm(claim, contents, terms) {
  const joined = contents.join(' ');
  return terms.some((raw) => {
    const term = raw.normalize('NFC');
    return claim.includes(term) && !joined.includes(term);
  });
}
function sentenceSegments(text) {
  return text
    .split(/[.!?。]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
function checkGrounding(claims, observations, query = {}) {
  const pack = resolveRulePack(query);
  const highRiskTerms = pack.highRiskTerms;
  const byId = /* @__PURE__ */ new Map();
  for (const o of observations) byId.set(o.id, o.content.normalize('NFC'));
  const checks = claims.map((claim) => {
    const text = typeof claim.text === 'string' ? claim.text.trim().normalize('NFC') : '';
    const citedIds = claim.observationIds ?? [];
    const validIds = citedIds.filter((id) => byId.has(id));
    const unknownIds = citedIds.filter((id) => !byId.has(id));
    const flags = [];
    let coverage = 0;
    if (text.length === 0) {
      flags.push('empty');
    } else {
      if (sentenceSegments(text).length > 1) flags.push('multi_sentence');
      if (unknownIds.length > 0) flags.push('unknown_citation');
      if (validIds.length === 0) {
        flags.push('no_citation');
      } else {
        const contents = validIds.map((id) => byId.get(id) ?? '');
        for (const content of contents) coverage = Math.max(coverage, claimCoverage(text, content));
        if (coverage < COVERAGE_THRESHOLD) flags.push('low_overlap');
        else if (maxUncoveredRun(text, contents) >= UNCOVERED_RUN_MAX)
          flags.push('partial_unsupported');
        if (hasUnverifiedHighRiskTerm(text, contents, highRiskTerms))
          flags.push('unverified_high_risk_term');
      }
    }
    return { text, citedIds, validIds, unknownIds, coverage: Number(coverage.toFixed(3)), flags };
  });
  const flaggedCount = checks.filter((c) => c.flags.length > 0).length;
  return {
    total: checks.length,
    flaggedCount,
    claims: checks,
    rulePackVersion: pack.version,
    rulePackLevel: pack.level,
    requiresTeacherReview: true,
    disclaimer: DISCLAIMER,
  };
}
function recordGuidelines(query = {}) {
  const pack = resolveRulePack(query);
  return {
    version: pack.version,
    level: pack.level,
    levelLabel: pack.levelLabel,
    principles: pack.citations.map((c) => c.text),
    citations: pack.citations,
    source: REF_PORTAL.url,
    references: pack.references,
    disclaimer: DISCLAIMER_GUIDE,
  };
}

// ../ssampin-ai-bridge/packages/core/dist/write.js
var LOCK_ACQUIRE_TIMEOUT_MS = 5e3;
var MAX_CONTENT = 500;
function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}
var WriteDisabledError = class extends Error {
  name = 'WriteDisabledError';
};
var WriteValidationError = class extends Error {
  name = 'WriteValidationError';
};
var WriteConflictError = class extends Error {
  name = 'WriteConflictError';
};
var WriteLockError = class extends Error {
  name = 'WriteLockError';
};
function isWriteEnabled(env = process.env, dataDir) {
  if (env['SSAMPIN_BRIDGE_ALLOW_WRITE'] === '1') return true;
  if (dataDir !== void 0 && readBridgeCapability(dataDir).allowWrite) return true;
  return false;
}
function assertWriteEnabled(env = process.env, dataDir) {
  if (!isWriteEnabled(env, dataDir)) {
    throw new WriteDisabledError(
      '\uC4F0\uAE30\uAC00 \uBE44\uD65C\uC131\uD654\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4. \uC324\uD540 \uC124\uC815\uC758 "AI \uC5F0\uACB0"\uC5D0\uC11C \uC4F0\uAE30\uB97C \uCF1C\uAC70\uB098(\uC989\uC2DC \uC801\uC6A9), SSAMPIN_BRIDGE_ALLOW_WRITE=1 \uD658\uACBD\uBCC0\uC218\uB85C \uD65C\uC131\uD654\uD558\uC138\uC694(\uC324\uD540\uC744 \uB2EB\uC740 \uC0C1\uD0DC \uAD8C\uC7A5).',
    );
  }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function setIf14(target, key, value) {
  if (value !== void 0) target[key] = value;
}
function validate(input) {
  if (typeof input.studentId !== 'string' || input.studentId.trim().length === 0) {
    throw new WriteValidationError('studentId \uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.');
  }
  const content = input.content ?? '';
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new WriteValidationError('content \uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.');
  }
  if (content.length > MAX_CONTENT) {
    throw new WriteValidationError(
      `content \uB294 \uCD5C\uB300 ${MAX_CONTENT}\uC790\uC785\uB2C8\uB2E4(\uD604\uC7AC ${content.length}).`,
    );
  }
  if (input.date !== void 0 && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new WriteValidationError(
      'date \uB294 YYYY-MM-DD \uD615\uC2DD\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
    );
  }
  if (input.tags !== void 0 && !Array.isArray(input.tags)) {
    throw new WriteValidationError(
      'tags \uB294 \uBB38\uC790\uC5F4 \uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
    );
  }
}
function todayIso() {
  return /* @__PURE__ */ new Date().toISOString().slice(0, 10);
}
function buildRecord(input) {
  const now = Date.now();
  const rec = {
    id: `o_${now}_${crypto3.randomBytes(4).toString('hex')}`,
    studentId: input.studentId,
    date: input.date ?? todayIso(),
    content: input.content.trim(),
    tags: input.tags ? input.tags.filter((t) => typeof t === 'string') : [],
    visibility: input.visibility === 'shared' ? 'shared' : 'private',
    createdAt: now,
    updatedAt: now,
  };
  setIf14(rec, 'classId', input.classId);
  return rec;
}
function idemPath(dataDir) {
  return path5.join(bridgeStateDir(dataDir), 'idempotency.json');
}
function loadIdem(dataDir) {
  try {
    return JSON.parse(fs6.readFileSync(idemPath(dataDir), 'utf-8'));
  } catch {
    return {};
  }
}
function saveIdem(dataDir, map) {
  const p = idemPath(dataDir);
  fs6.mkdirSync(path5.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs6.writeFileSync(tmp, JSON.stringify(map), 'utf-8');
  fs6.renameSync(tmp, p);
}
function tryReclaimDeadLock(lockPath, nonce) {
  const claim = `${lockPath}.reclaim-${nonce}`;
  try {
    fs6.renameSync(lockPath, claim);
  } catch {
    return;
  }
  let dead = false;
  try {
    const cur = JSON.parse(fs6.readFileSync(claim, 'utf-8'));
    dead = typeof cur.pid === 'number' ? !isAlive(cur.pid) : true;
  } catch {
    dead = true;
  }
  if (dead) {
    try {
      fs6.unlinkSync(claim);
    } catch {}
  } else {
    try {
      fs6.linkSync(claim, lockPath);
    } catch {}
    try {
      fs6.unlinkSync(claim);
    } catch {}
  }
}
async function withLock(dataDir, fn) {
  const lockPath = path5.join(bridgeStateDir(dataDir), 'write.lock');
  fs6.mkdirSync(path5.dirname(lockPath), { recursive: true });
  const nonce = crypto3.randomBytes(8).toString('hex');
  const start = Date.now();
  for (;;) {
    const tmp = `${lockPath}.acq-${nonce}`;
    try {
      fs6.writeFileSync(tmp, JSON.stringify({ pid: process.pid, nonce, ts: Date.now() }), 'utf-8');
      fs6.linkSync(tmp, lockPath);
      fs6.unlinkSync(tmp);
      break;
    } catch {
      try {
        fs6.unlinkSync(tmp);
      } catch {}
      let ownerAlive = true;
      try {
        const cur = JSON.parse(fs6.readFileSync(lockPath, 'utf-8'));
        ownerAlive = typeof cur.pid === 'number' ? isAlive(cur.pid) : false;
      } catch {
        ownerAlive = false;
      }
      if (!ownerAlive) {
        tryReclaimDeadLock(lockPath, nonce);
        continue;
      }
      if (Date.now() - start > LOCK_ACQUIRE_TIMEOUT_MS) {
        throw new WriteLockError(
          '\uC4F0\uAE30 \uB77D \uD68D\uB4DD \uC2DC\uAC04 \uCD08\uACFC(\uB2E4\uB978 \uC4F0\uAE30 \uC9C4\uD589 \uC911).',
        );
      }
      await sleep(15);
    }
  }
  try {
    return fn();
  } finally {
    try {
      const cur = JSON.parse(fs6.readFileSync(lockPath, 'utf-8'));
      if (cur.nonce === nonce) fs6.unlinkSync(lockPath);
    } catch {}
  }
}
async function appendObservation(dataDir, input) {
  assertWriteEnabled(process.env, dataDir);
  validate(input);
  const baseReal = realDir(dataDir);
  const file = resolveDataFile(dataDir, 'observations');
  assertNoSymlinkEscape(baseReal, file);
  return withLock(dataDir, () => {
    if (decideWritePath(dataDir).path !== 'direct') {
      throw new WriteConflictError(
        '\uC324\uD540\uC774 \uC2E4\uD589 \uC911\uC774\uAC70\uB098 \uC0C1\uD0DC\uAC00 \uBD88\uD655\uC2E4\uD558\uC5EC \uC9C1\uC811\uC4F0\uAE30\uB97C \uC911\uB2E8\uD588\uC2B5\uB2C8\uB2E4. \uC324\uD540\uC744 \uB2EB\uACE0 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.',
      );
    }
    const baseRaw = fs6.existsSync(file) ? fs6.readFileSync(file, 'utf-8') : '';
    const data = parseObservations(baseRaw.length > 0 ? JSON.parse(baseRaw) : { records: [] });
    if (input.clientKey) {
      const idem = loadIdem(dataDir);
      const existingId = idem[input.clientKey];
      if (existingId) {
        const found = data.records.find((r) => r.id === existingId);
        if (found) return found;
      }
    }
    const record = buildRecord(input);
    const nextData = { records: [...data.records, record] };
    setIf14(nextData, 'customTags', data.customTags);
    const nowRaw = fs6.existsSync(file) ? fs6.readFileSync(file, 'utf-8') : '';
    if (nowRaw !== baseRaw) {
      throw new WriteConflictError(
        '\uC4F0\uAE30 \uB3C4\uC911 \uB370\uC774\uD130\uAC00 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4(\uC324\uD540 \uC2E4\uD589 \uC911\uC77C \uC218 \uC788\uC74C). \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.',
      );
    }
    if (baseRaw.length > 10) {
      fs6.writeFileSync(backupPathFor(file), baseRaw, 'utf-8');
    }
    const tmp = `${file}.tmp`;
    fs6.writeFileSync(tmp, JSON.stringify(nextData, null, 2), 'utf-8');
    fs6.renameSync(tmp, file);
    if (input.clientKey) {
      const idem = loadIdem(dataDir);
      idem[input.clientKey] = record.id;
      saveIdem(dataDir, idem);
    }
    return record;
  });
}
function isGradeWriteEnabled(env = process.env, dataDir) {
  if (env['SSAMPIN_BRIDGE_ALLOW_GRADE_WRITE'] === '1') return true;
  if (dataDir !== void 0 && readBridgeCapability(dataDir).allowGradeWrite) return true;
  return false;
}
function assertGradeWriteEnabled(env = process.env, dataDir) {
  if (!isGradeWriteEnabled(env, dataDir)) {
    throw new WriteDisabledError(
      '\uC131\uC801\xB7\uC218\uD589\uD3C9\uAC00 \uC4F0\uAE30\uAC00 \uBE44\uD65C\uC131\uD654\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4. \uC324\uD540 \uC124\uC815\uC758 "AI \uC5F0\uACB0"\uC5D0\uC11C \uCC44\uC810 \uC4F0\uAE30\uB97C \uCF1C\uAC70\uB098(\uC989\uC2DC \uC801\uC6A9), SSAMPIN_BRIDGE_ALLOW_GRADE_WRITE=1 \uB85C \uD65C\uC131\uD654\uD558\uC138\uC694(\uC324\uD540\uC744 \uB2EB\uC740 \uC0C1\uD0DC \uD544\uC218 \u2014 \uACF5\uC2DD \uAE30\uB85D).',
    );
  }
}
function asObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : void 0;
}
function asStringRecord2(v) {
  const o = asObj(v);
  if (!o) return {};
  const out = {};
  for (const [k, val] of Object.entries(o)) if (typeof val === 'string') out[k] = val;
  return out;
}
var nfc = (s) => s.normalize('NFC');
async function safeRewrite(dataDir, filename, transform) {
  const baseReal = realDir(dataDir);
  const file = resolveDataFile(dataDir, filename);
  assertNoSymlinkEscape(baseReal, file);
  await withLock(dataDir, () => {
    const baseRaw = fs6.existsSync(file) ? fs6.readFileSync(file, 'utf-8') : '';
    const parsed = baseRaw.trim().length > 1 ? JSON.parse(baseRaw) : null;
    const next = transform(parsed);
    const nowRaw = fs6.existsSync(file) ? fs6.readFileSync(file, 'utf-8') : '';
    if (nowRaw !== baseRaw) {
      throw new WriteConflictError(
        '\uC4F0\uAE30 \uB3C4\uC911 \uB370\uC774\uD130\uAC00 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4(\uC324\uD540 \uC2E4\uD589 \uC911\uC77C \uC218 \uC788\uC74C). \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.',
      );
    }
    if (baseRaw.length > 10) fs6.writeFileSync(backupPathFor(file), baseRaw, 'utf-8');
    const tmp = `${file}.tmp`;
    fs6.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf-8');
    fs6.renameSync(tmp, file);
  });
}
async function setRubricGrading(dataDir, input) {
  assertGradeWriteEnabled(process.env, dataDir);
  if (typeof input.classId !== 'string' || input.classId.length === 0) {
    throw new WriteValidationError('classId \uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.');
  }
  if (typeof input.studentKey !== 'string' || input.studentKey.length === 0) {
    throw new WriteValidationError('studentKey \uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.');
  }
  if (!Array.isArray(input.marks))
    throw new WriteValidationError(
      'marks \uB294 \uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
    );
  let result;
  await safeRewrite(dataDir, 'rubrics', (parsed) => {
    if (decideWritePath(dataDir).path !== 'direct') {
      throw new WriteConflictError(
        '\uC324\uD540\uC774 \uC2E4\uD589 \uC911\uC774\uAC70\uB098 \uC0C1\uD0DC\uAC00 \uBD88\uD655\uC2E4\uD558\uC5EC \uCC44\uC810 \uC9C1\uC811\uC4F0\uAE30\uB97C \uC911\uB2E8\uD588\uC2B5\uB2C8\uB2E4. \uC324\uD540\uC744 \uB2EB\uACE0 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.',
      );
    }
    const root = asObj(parsed) ?? {};
    const rubrics = Array.isArray(root['rubrics']) ? root['rubrics'] : [];
    const rubric = asObj(rubrics.find((r) => asObj(r)?.['id'] === input.rubricId));
    if (!rubric)
      throw new WriteValidationError(
        '\uD3C9\uAC00\uD45C\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
      );
    if (rubric['classId'] !== input.classId) {
      throw new WriteValidationError(
        '\uD3C9\uAC00\uD45C\uAC00 \uC774 \uC218\uC5C5\uBC18\uC5D0 \uC18D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.',
      );
    }
    const criteria = Array.isArray(rubric['criteria']) ? rubric['criteria'] : [];
    const reqStr = (v, what) => {
      if (typeof v !== 'string' || v.length === 0)
        throw new WriteValidationError(
          `\uD3C9\uAC00\uD45C ${what} \uD615\uC2DD \uC624\uB958(\uC190\uC0C1 \uB370\uC774\uD130).`,
        );
      return v;
    };
    const findCriterion = (name) => {
      const hits = criteria
        .map(asObj)
        .filter((c2) => !!c2 && typeof c2['name'] === 'string' && nfc(c2['name']) === nfc(name));
      if (hits.length === 0)
        throw new WriteValidationError(
          `\uD3C9\uAC00\uC694\uC18C\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${name}`,
        );
      if (hits.length > 1)
        throw new WriteValidationError(
          `\uD3C9\uAC00\uC694\uC18C \uC774\uB984\uC774 \uBAA8\uD638\uD569\uB2C8\uB2E4: ${name}`,
        );
      const c = hits[0];
      return {
        id: reqStr(c['id'], 'criterion id'),
        levels: Array.isArray(c['levels']) ? c['levels'] : [],
      };
    };
    const newMarks = {};
    for (const m of input.marks) {
      const { id: critId, levels } = findCriterion(m.criterion);
      const lv = levels
        .map(asObj)
        .filter((l) => !!l && typeof l['name'] === 'string' && nfc(l['name']) === nfc(m.level));
      if (lv.length === 0)
        throw new WriteValidationError(
          `\uC218\uC900\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${m.criterion} > ${m.level}`,
        );
      if (lv.length > 1)
        throw new WriteValidationError(
          `\uC218\uC900 \uC774\uB984\uC774 \uBAA8\uD638\uD569\uB2C8\uB2E4: ${m.criterion} > ${m.level}`,
        );
      newMarks[critId] = reqStr(lv[0]['id'], 'level id');
    }
    const newNotes = {};
    for (const n of input.criterionNotes ?? []) {
      newNotes[findCriterion(n.criterion).id] = n.note;
    }
    const gradings = Array.isArray(root['gradings']) ? [...root['gradings']] : [];
    const idx = gradings.findIndex((g) => {
      const o = asObj(g);
      return (
        o?.['rubricId'] === input.rubricId &&
        o['classId'] === input.classId &&
        o['studentId'] === input.studentKey
      );
    });
    const existing = idx >= 0 ? (asObj(gradings[idx]) ?? {}) : {};
    const created = idx < 0;
    const gradingId =
      existing['id'] ?? `rg_${Date.now()}_${crypto3.randomBytes(4).toString('hex')}`;
    const prevMarks = asStringRecord2(existing['marks']);
    const prevNotes = asStringRecord2(existing['criterionNotes']);
    const mergedMarks = { ...prevMarks, ...newMarks };
    const mergedNotes = { ...prevNotes, ...newNotes };
    const currentCritIds = new Set(
      criteria.map((c) => asObj(c)?.['id']).filter((v) => typeof v === 'string'),
    );
    const coveredCount = Object.keys(mergedMarks).filter((k) => currentCritIds.has(k)).length;
    const status =
      input.status ??
      (currentCritIds.size > 0 && coveredCount >= currentCritIds.size ? 'graded' : 'partial');
    const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const unchanged =
      !created &&
      sameJson(mergedMarks, prevMarks) &&
      sameJson(mergedNotes, prevNotes) &&
      existing['status'] === status &&
      (input.overallFeedback === void 0 || existing['overallFeedback'] === input.overallFeedback);
    const gradedAt =
      unchanged && typeof existing['gradedAt'] === 'string'
        ? existing['gradedAt']
        : /* @__PURE__ */ new Date().toISOString();
    const grading = {
      ...existing,
      id: gradingId,
      rubricId: input.rubricId,
      classId: input.classId,
      studentId: input.studentKey,
      status,
      marks: mergedMarks,
      criterionNotes: mergedNotes,
      gradedAt,
    };
    if (input.overallFeedback !== void 0) grading['overallFeedback'] = input.overallFeedback;
    if (idx >= 0) gradings[idx] = grading;
    else gradings.push(grading);
    result = {
      gradingId,
      status,
      markedCount: coveredCount,
      criterionCount: currentCritIds.size,
      created,
    };
    return { ...root, rubrics, gradings };
  });
  if (!result)
    throw new WriteValidationError(
      '\uCC44\uC810 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
    );
  return result;
}
var asStr = (v) => (typeof v === 'string' ? v : '');
function validateRecordDraft(input) {
  const content = typeof input.content === 'string' ? input.content : '';
  if (content.trim().length === 0)
    throw new WriteValidationError('content \uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.');
  const spec = resolveAreaSpec(input.area, input.level);
  if (spec.author !== 'both' && spec.author !== input.authorKind) {
    const who =
      spec.author === 'homeroom'
        ? '\uB2F4\uC784'
        : '\uC218\uC5C5\uBC18/\uB3D9\uC544\uB9AC \uC9C0\uB3C4';
    throw new WriteValidationError(
      `\uC774 \uC601\uC5ED\uC740 ${who} \uAD50\uC0AC\uB9CC \uC791\uC131\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4(\uC791\uC131\uC8FC\uCCB4 \uACB0\uC18D).`,
    );
  }
  const byteLength = neisByteLength(content);
  const flags = [];
  if (byteLength > spec.limit) {
    if (spec.limitVerified) {
      throw new WriteValidationError(
        `\uC601\uC5ED \uBC14\uC774\uD2B8 \uD55C\uB3C4\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4(${byteLength}/${spec.limit}B). \uC904\uC5EC\uC11C \uB2E4\uC2DC \uC800\uC7A5\uD558\uC138\uC694.`,
      );
    }
    flags.push('area_limit_unverified');
  }
  const basisIds = (input.basisObservationIds ?? []).filter((x) => typeof x === 'string');
  const sentences = content
    .split(/[.!?。\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length > 0) {
    const claims = sentences.map((text) => ({ text, observationIds: basisIds }));
    const query = { level: input.level };
    if (input.year !== void 0) query.year = input.year;
    const report = checkGrounding(claims, input.observations ?? [], query);
    for (const f of new Set(report.claims.flatMap((c) => c.flags))) flags.push(f);
  }
  if (input.secretCorpus && input.secretCorpus.length > 0) {
    if (!scanForLeaks({ content }, input.secretCorpus).clean) flags.push('pii_leak');
  }
  return { area: spec.area, byteLength, flags: [...new Set(flags)] };
}
async function setRecordDraft(dataDir, input) {
  if (typeof input.studentRef !== 'string' || input.studentRef.length === 0) {
    throw new WriteValidationError('studentRef \uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.');
  }
  const validation = validateRecordDraft(input);
  const content = input.content;
  const { byteLength } = validation;
  const dedupFlags = validation.flags;
  const basisIds = (input.basisObservationIds ?? []).filter((x) => typeof x === 'string');
  let result;
  await safeRewrite(dataDir, 'record-drafts', (parsed) => {
    if (decideWritePath(dataDir).path !== 'direct') {
      throw new WriteConflictError(
        '\uC324\uD540\uC774 \uC2E4\uD589 \uC911\uC774\uAC70\uB098 \uC0C1\uD0DC\uAC00 \uBD88\uD655\uC2E4\uD558\uC5EC \uC9C1\uC811\uC4F0\uAE30\uB97C \uC911\uB2E8\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.',
      );
    }
    const root = asObj(parsed) ?? {};
    const records = Array.isArray(root['records']) ? [...root['records']] : [];
    const subjectKey = input.subject ?? '';
    const idx = records.findIndex((r) => {
      const o = asObj(r);
      return (
        !!o &&
        o['area'] === validation.area &&
        o['studentRef'] === input.studentRef &&
        asStr(o['subject']) === subjectKey
      );
    });
    const existing = idx >= 0 ? (asObj(records[idx]) ?? {}) : {};
    const created = idx < 0;
    if (existing['status'] === 'confirmed') {
      throw new WriteValidationError(
        '\uD655\uC815\uB41C \uCD08\uC548\uC740 \uC218\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC324\uD540\uC5D0\uC11C \uAC80\uD1A0\uC911\uC73C\uB85C \uB418\uB3CC\uB9B0 \uB4A4 \uC218\uC815\uD558\uC138\uC694.',
      );
    }
    const draftId = existing['id'] ?? `rd_${Date.now()}_${crypto3.randomBytes(4).toString('hex')}`;
    const status = input.status ?? existing['status'] ?? 'draft';
    const createdAt =
      typeof existing['createdAt'] === 'number' ? existing['createdAt'] : Date.now();
    const sameFlags =
      JSON.stringify(existing['groundingFlags'] ?? []) === JSON.stringify(dedupFlags);
    const unchanged =
      !created &&
      asStr(existing['content']) === content &&
      existing['status'] === status &&
      asStr(existing['subject']) === subjectKey &&
      sameFlags;
    const updatedAt =
      unchanged && typeof existing['updatedAt'] === 'number' ? existing['updatedAt'] : Date.now();
    const record = {
      ...existing,
      id: draftId,
      area: validation.area,
      studentRef: input.studentRef,
      content,
      byteLength,
      basisObservationIds: basisIds,
      requiresTeacherReview: true,
      status,
      createdAt,
      updatedAt,
    };
    setIf14(record, 'classId', input.classId);
    setIf14(record, 'subject', input.subject);
    if (dedupFlags.length > 0) record['groundingFlags'] = dedupFlags;
    else delete record['groundingFlags'];
    if (idx >= 0) records[idx] = record;
    else records.push(record);
    result = { draftId, byteLength, flags: dedupFlags, created, requiresTeacherReview: true };
    return { ...root, records };
  });
  if (!result)
    throw new WriteValidationError(
      '\uCD08\uC548 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
    );
  return result;
}

// ../ssampin-ai-bridge/packages/core/dist/directWrite.js
import crypto4 from 'node:crypto';
import fs7 from 'node:fs';
function recordId(prefix, clientKey) {
  if (clientKey) {
    return `${prefix}_${crypto4.createHash('sha256').update(clientKey).digest('hex').slice(0, 16)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${crypto4.randomBytes(5).toString('hex')}`;
}
function setIf15(t, k, v) {
  if (v !== void 0) t[k] = v;
}
function hasId(v, id) {
  return !!v && typeof v === 'object' && v['id'] === id;
}
function readListRoot(parsed, key) {
  if (parsed === null) return { root: {}, list: [] };
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new WriteValidationError(
      `${key}.json \uD615\uC2DD\uC774 \uC608\uC0C1\uACFC \uB2E4\uB985\uB2C8\uB2E4 \u2014 \uB370\uC774\uD130 \uBCF4\uD638\uB97C \uC704\uD574 \uC9C1\uC811\uC4F0\uAE30\uB97C \uC911\uB2E8\uD569\uB2C8\uB2E4.`,
    );
  }
  const root = parsed;
  const v = root[key];
  if (v === void 0) return { root, list: [] };
  if (!Array.isArray(v)) {
    throw new WriteValidationError(
      `${key}.json \uC758 ${key} \uAC00 \uBC30\uC5F4\uC774 \uC544\uB2D9\uB2C8\uB2E4 \u2014 \uC9C1\uC811\uC4F0\uAE30\uB97C \uC911\uB2E8\uD569\uB2C8\uB2E4(\uB370\uC774\uD130 \uBCF4\uD638).`,
    );
  }
  return { root, list: v };
}
async function mutateDataFile(dataDir, filename, clientKey, mutate) {
  if (!readBridgeCapability(dataDir).allowWrite) {
    throw new WriteDisabledError(
      '\uC9C1\uC811\uC4F0\uAE30\uAC00 \uBE44\uD65C\uC131\uD654\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4(\uC324\uD540 \uC124\uC815\uC758 "AI \uC5F0\uACB0" \uC4F0\uAE30 \uD1A0\uAE00).',
    );
  }
  const baseReal = realDir(dataDir);
  const file = resolveDataFile(dataDir, filename);
  assertNoSymlinkEscape(baseReal, file);
  return withLock(dataDir, () => {
    if (decideWritePath(dataDir).path !== 'direct') {
      throw new WriteConflictError(
        '\uC324\uD540\uC774 \uC2DC\uC791\uB418\uC5C8\uAC70\uB098 \uC0C1\uD0DC\uAC00 \uBD88\uD655\uC2E4\uD558\uC5EC \uC9C1\uC811\uC4F0\uAE30\uB97C \uC911\uB2E8\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.',
      );
    }
    const baseRaw = fs7.existsSync(file) ? fs7.readFileSync(file, 'utf-8') : '';
    if (clientKey) {
      const existing = loadIdem(dataDir)[clientKey];
      if (existing) return { ref: existing };
    }
    const parsed = baseRaw.trim().length > 0 ? JSON.parse(baseRaw) : null;
    const { next, ref } = mutate(parsed);
    const nowRaw = fs7.existsSync(file) ? fs7.readFileSync(file, 'utf-8') : '';
    if (nowRaw !== baseRaw) {
      throw new WriteConflictError(
        '\uC4F0\uAE30 \uB3C4\uC911 \uB370\uC774\uD130\uAC00 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4(\uC324\uD540\uC774 \uC2E4\uD589 \uC911\uC77C \uC218 \uC788\uC74C). \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.',
      );
    }
    if (baseRaw.length > 10) fs7.writeFileSync(backupPathFor(file), baseRaw, 'utf-8');
    const tmp = `${file}.tmp`;
    fs7.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf-8');
    fs7.renameSync(tmp, file);
    if (clientKey) {
      const idem = loadIdem(dataDir);
      idem[clientKey] = ref;
      saveIdem(dataDir, idem);
    }
    return { ref };
  });
}
function appendTodoDirect(dataDir, input, clientKey) {
  return mutateDataFile(dataDir, 'todos', clientKey, (parsed) => {
    const { root, list } = readListRoot(parsed, 'todos');
    const id = recordId('td', clientKey);
    if (list.some((t) => hasId(t, id))) return { next: { ...root, todos: list }, ref: id };
    const now = /* @__PURE__ */ new Date().toISOString();
    const todo = {
      id,
      text: input.text,
      completed: false,
      createdAt: now,
      updatedAt: now,
      pendingRemoteOp: 'create',
      priority: input.priority ?? 'none',
    };
    setIf15(todo, 'dueDate', input.dueDate);
    setIf15(todo, 'category', input.category);
    setIf15(todo, 'time', input.time);
    return { next: { ...root, todos: [...list, todo] }, ref: id };
  });
}
function appendEventDirect(dataDir, input, clientKey) {
  return mutateDataFile(dataDir, 'events', clientKey, (parsed) => {
    const { root, list } = readListRoot(parsed, 'events');
    const id = recordId('ev', clientKey);
    if (list.some((e) => hasId(e, id))) return { next: { ...root, events: list }, ref: id };
    const ev = {
      id,
      title: input.title,
      date: input.date,
      category: input.category ?? 'etc',
      source: 'ssampin',
    };
    setIf15(ev, 'time', input.time);
    setIf15(ev, 'location', input.location);
    return { next: { ...root, events: [...list, ev] }, ref: id };
  });
}
function readAttendanceRoot(parsed) {
  if (parsed === null) return { root: {}, records: [] };
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new WriteValidationError(
      'attendance.json \uD615\uC2DD\uC774 \uC608\uC0C1\uACFC \uB2E4\uB985\uB2C8\uB2E4 \u2014 \uB370\uC774\uD130 \uBCF4\uD638\uB97C \uC704\uD574 \uC9C1\uC811\uC4F0\uAE30\uB97C \uC911\uB2E8\uD569\uB2C8\uB2E4.',
    );
  }
  const root = parsed;
  const records = root['records'];
  if (records === void 0) return { root, records: [] };
  if (!Array.isArray(records)) {
    throw new WriteValidationError(
      'attendance.json \uC758 records \uAC00 \uBC30\uC5F4\uC774 \uC544\uB2D9\uB2C8\uB2E4 \u2014 \uC9C1\uC811\uC4F0\uAE30\uB97C \uC911\uB2E8\uD569\uB2C8\uB2E4(\uB370\uC774\uD130 \uBCF4\uD638).',
    );
  }
  return { root, records };
}
function attendanceKeyMatches(item, input) {
  if (!item || typeof item !== 'object') return false;
  const record = item;
  if (record['date'] !== input.date || record['period'] !== input.period) return false;
  if (input.groupId !== void 0) return record['groupId'] === input.groupId;
  return record['classId'] === input.classId && record['groupId'] === void 0;
}
function toAttendanceRecord(input) {
  const record = {
    classId: input.classId,
    date: input.date,
    period: input.period,
    students: input.students,
  };
  if (input.groupId !== void 0) record.groupId = input.groupId;
  return record;
}
function upsertAttendanceDirect(dataDir, input, clientKey) {
  return mutateDataFile(dataDir, 'attendance', clientKey, (parsed) => {
    const { root, records } = readAttendanceRoot(parsed);
    const nextRecord = toAttendanceRecord(input);
    const replaced = records.some((record) => attendanceKeyMatches(record, input));
    const nextRecords = replaced
      ? records.map((record) => (attendanceKeyMatches(record, input) ? nextRecord : record))
      : [...records, nextRecord];
    return {
      next: { ...root, records: nextRecords },
      ref: `attendance:${input.date}:${input.period}`,
    };
  });
}
function deleteAttendanceDirect(dataDir, input, clientKey) {
  return mutateDataFile(dataDir, 'attendance', clientKey, (parsed) => {
    const { root, records } = readAttendanceRoot(parsed);
    const nextRecords = records.filter((record) => !attendanceKeyMatches(record, input));
    return {
      next: { ...root, records: nextRecords },
      ref: `attendance:${input.date}:${input.period}`,
    };
  });
}
var MEMO_DEFAULT_WIDTH = 280;
var MEMO_DEFAULT_HEIGHT = 220;
var MEMO_DEFAULT_COLOR = 'yellow';
function appendMemoDirect(dataDir, input, clientKey) {
  return mutateDataFile(dataDir, 'memos', clientKey, (parsed) => {
    const { root, list } = readListRoot(parsed, 'memos');
    const id = recordId('memo', clientKey);
    if (list.some((m) => hasId(m, id))) return { next: { ...root, memos: list }, ref: id };
    const now = /* @__PURE__ */ new Date().toISOString();
    const x = 40 + (list.length % 4) * 220;
    const y = 40 + Math.floor(list.length / 4) * 200;
    const memo = {
      id,
      content: input.content,
      color: input.color ?? MEMO_DEFAULT_COLOR,
      x,
      y,
      width: MEMO_DEFAULT_WIDTH,
      height: MEMO_DEFAULT_HEIGHT,
      rotation: 0,
      createdAt: now,
      updatedAt: now,
      archived: false,
    };
    return { next: { ...root, memos: [...list, memo] }, ref: id };
  });
}
var BOOKMARK_DEFAULT_ICON = '\u{1F517}';
var BOOKMARK_GROUP_DEFAULT_EMOJI = '\u{1F516}';
function nextOrderIn(list, predicate) {
  let max = -1;
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item;
    if (!predicate(o)) continue;
    const ord = typeof o['order'] === 'number' && Number.isFinite(o['order']) ? o['order'] : -1;
    if (ord > max) max = ord;
  }
  return max + 1;
}
function appendBookmarkDirect(dataDir, input, clientKey) {
  return mutateDataFile(dataDir, 'bookmarks', clientKey, (parsed) => {
    const { root, list } = readListRoot(parsed, 'bookmarks');
    const id = recordId('bm', clientKey);
    if (list.some((b) => hasId(b, id))) return { next: { ...root, bookmarks: list }, ref: id };
    const now = /* @__PURE__ */ new Date().toISOString();
    const order = nextOrderIn(list, (o) => o['groupId'] === input.groupId);
    const bookmark = {
      id,
      name: input.name,
      url: input.url,
      type: 'url',
      iconType: 'emoji',
      iconValue: BOOKMARK_DEFAULT_ICON,
      groupId: input.groupId,
      order,
      createdAt: now,
      updatedAt: now,
    };
    return { next: { ...root, bookmarks: [...list, bookmark] }, ref: id };
  });
}
function appendBookmarkGroupDirect(dataDir, input, clientKey) {
  return mutateDataFile(dataDir, 'bookmarks', clientKey, (parsed) => {
    const { root, list } = readListRoot(parsed, 'groups');
    const id = recordId('bmg', clientKey);
    if (list.some((g) => hasId(g, id))) return { next: { ...root, groups: list }, ref: id };
    const now = /* @__PURE__ */ new Date().toISOString();
    const order = nextOrderIn(list, () => true);
    const group = {
      id,
      name: input.name,
      emoji: input.emoji ?? BOOKMARK_GROUP_DEFAULT_EMOJI,
      order,
      collapsed: false,
      createdAt: now,
    };
    return { next: { ...root, groups: [...list, group] }, ref: id };
  });
}

// ../ssampin-ai-bridge/packages/core/dist/access.js
function getObservationsForIdentity(dataDir, identity, query = {}) {
  if (identity.kind === 'teaching') {
    return getTeachingObservations(dataDir, identity.classId, identity.studentKey, query);
  }
  if (identity.kind === 'homeroom') {
    return getStudentObservations(dataDir, identity.studentId, query).filter((r) => !r.classId);
  }
  return [];
}
function rosterForIdentity(dataDir, identity, store) {
  if (identity.kind === 'teaching') {
    const cls = readTeachingClasses(dataDir).classes.find((c) => c.id === identity.classId);
    return cls ? rosterFromTeachingClass(cls, store) : [];
  }
  if (identity.kind === 'homeroom') {
    return readStudents(dataDir).map((s) => {
      const entry = { token: store.getToken(s.id), names: [s.name] };
      return s.studentNumber === void 0 ? entry : { ...entry, studentNumber: s.studentNumber };
    });
  }
  return [];
}

// ../ssampin-ai-bridge/packages/core/dist/assessments.js
var NUM =
  '\\d[\\d,]*(?:\\.\\d+)?(?:\\s*[~\u223C\u301C\u2010\u2011\u2013\u2014\\-]\\s*\\d[\\d,]*(?:\\.\\d+)?)?';
var SCORE_RULES = [
  [new RegExp(`${NUM}\\s*\uBD84\uC758\\s*${NUM}`, 'g'), '[\uC810\uC218]'],
  // 한국어 분수 'N분의 M'
  [new RegExp(`${NUM}\\s*/\\s*${NUM}`, 'g'), '[\uC810\uC218]'],
  // 'M/N'
  [new RegExp(`${NUM}\\s*\uC810\\s*\uB9CC\uC810`, 'g'), '[\uB9CC\uC810]'],
  [new RegExp(`${NUM}\\s*\uB9CC\uC810`, 'g'), '[\uB9CC\uC810]'],
  // '점' 없는 만점(100만점/5 만점)
  [new RegExp(`${NUM}\\s*\uC810`, 'g'), '[\uC810\uC218]'],
  [new RegExp(`${NUM}\\s*\uB4F1\uAE09`, 'g'), '[\uB4F1\uAE09]'],
  // 라벨형: 석차/순위/등수 + (콜론·공백) + 숫자(+등) — '석차: 2'·'순위: 1'·'등수 3'·'학급석차: 4'
  [
    new RegExp(
      `(?:\uC11D\uCC28|\uC21C\uC704|\uB4F1\uC218)\\s*[:\uFF1A]?\\s*${NUM}\\s*\uB4F1?`,
      'g',
    ),
    '[\uC11D\uCC28]',
  ],
  [new RegExp(`${NUM}\\s*\uC21C\uC704`, 'g'), '[\uC11D\uCC28]'],
  // 숫자-선행 '1순위'
  // 숫자+등/위(석차)는 모두 마스킹. 무공백 합성(3등분야/3위로/100위안)을 정규식으로 완벽 구분 불가 →
  // 누출 0 우선 전부 치환(등급은 위에서 선처리, 숫자 없는 등교/위원 등은 미매칭 보존).
  [new RegExp(`${NUM}\\s*\uB4F1`, 'g'), '[\uC11D\uCC28]'],
  [new RegExp(`${NUM}\\s*\uC704`, 'g'), '[\uC11D\uCC28]'],
  [new RegExp(`${NUM}\\s*(?:%|\uFF05|\uD37C\uC13C\uD2B8|\uD504\uB85C)`, 'g'), '[\uBE44\uC728]'],
];
function maskScores(text) {
  let out = text;
  for (const [re, rep] of SCORE_RULES) out = out.replace(re, rep);
  return out;
}
function safeAchievement(level) {
  if (level === void 0) return void 0;
  const t = level.trim();
  if (t.length === 0 || t.length > 4 || /\d/.test(t)) return void 0;
  return t;
}
function setIf16(target, key, value) {
  if (value !== void 0 && value !== '') target[key] = value;
}
function getRubricFeedback(dataDir, classId, studentKey2, maskText) {
  const scrub = (s) => maskScores(maskText(s));
  const { rubrics, gradings } = readRubrics(dataDir);
  const rubricById = new Map(rubrics.map((r) => [r.id, r]));
  return gradings
    .filter((g) => g.classId === classId && g.studentId === studentKey2)
    .map((g) => {
      const found = rubricById.get(g.rubricId);
      const rubric = found && found.classId === classId ? found : void 0;
      const criteria = (rubric?.criteria ?? [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((c) => {
          const levelId = g.marks[c.id];
          const level = levelId ? c.levels.find((l) => l.id === levelId) : void 0;
          const fb = {
            criterion: c.name,
            achievedLevel: level?.name ?? null,
          };
          if (level?.description) setIf16(fb, 'levelDescription', scrub(level.description));
          const note = g.criterionNotes[c.id];
          if (note) setIf16(fb, 'note', scrub(note));
          return fb;
        });
      const view = {
        rubricTitle: rubric?.title ?? '(\uC0AD\uC81C\uB41C \uD3C9\uAC00\uD45C)',
        status: g.status,
        criteria,
        date: g.gradedAt,
      };
      if (g.overallFeedback) setIf16(view, 'overallFeedback', scrub(g.overallFeedback));
      return view;
    });
}
function writtenParticipation(absence, scorePresent) {
  if (absence === 'absent') return '\uACB0\uC2DC';
  if (absence === 'recognized') return '\uC778\uC815';
  if (absence === 'exempt') return '\uBA74\uC81C';
  return scorePresent ? '\uC751\uC2DC' : '\uBBF8\uC785\uB825';
}
function getGradeSummary(dataDir, classId, studentKey2, maskText) {
  const scrub = (s) => maskScores(maskText(s));
  const cls = readTeachingClasses(dataDir).classes.find((c) => c.id === classId);
  const student = cls?.students.find((s) => studentKey(s) === studentKey2);
  if (!student) return { achievement: [], assessments: [] };
  const gKey = gradeStudentKey(student);
  const ga = readGradeAnalysis(dataDir);
  const achievement = [];
  for (const r of ga.semesterResults) {
    if (r.teachingClassId !== classId || r.studentKey !== gKey) continue;
    const level = safeAchievement(r.achievementLevel);
    if (level) achievement.push({ semester: r.semester, level, confirmed: r.confirmed });
  }
  const plans = ga.plans.filter((p) => p.teachingClassId === classId);
  const assessments = plans.map((p) => {
    const summary = {
      area: p.areaName,
      kind: p.kind === 'written-exam' ? '\uC9C0\uD544' : '\uC218\uD589',
      title: p.title,
      participation: '\uBBF8\uC785\uB825',
      confirmed: false,
    };
    if (p.method) setIf16(summary, 'method', scrub(p.method));
    if (p.kind === 'written-exam') {
      const w = ga.writtenResults.find((x) => x.assessmentId === p.id && x.studentKey === gKey);
      if (w) {
        summary['participation'] = writtenParticipation(w.absenceCode, w.scorePresent);
        summary['confirmed'] = w.confirmed;
      }
    } else {
      const pr = ga.performanceResults.find(
        (x) => x.assessmentId === p.id && x.studentKey === gKey,
      );
      if (pr) {
        summary['participation'] = pr.scorePresent ? '\uC751\uC2DC' : '\uBBF8\uC785\uB825';
        summary['confirmed'] = pr.confirmed;
        if (pr.evidenceNote) setIf16(summary, 'evidenceNote', scrub(pr.evidenceNote));
      }
    }
    return summary;
  });
  return { achievement, assessments };
}

// ../ssampin-ai-bridge/packages/core/dist/consent.js
import crypto5 from 'node:crypto';
import fs8 from 'node:fs';
import path6 from 'node:path';
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var PURPOSE_MAX = 100;
var OBSERVATION_READ_PURPOSE = 'observation_read';
var ConsentValidationError = class extends Error {
  name = 'ConsentValidationError';
};
function nowIso() {
  return /* @__PURE__ */ new Date().toISOString();
}
var CONSENT_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
function defaultConsentId() {
  const bytes = crypto5.randomBytes(16);
  let s = '';
  for (const b of bytes) s += CONSENT_ID_ALPHABET[b % 26];
  return `cs_${s}`;
}
function notExpired(rec, t) {
  if (rec.expiresAt === void 0) return true;
  const exp = Date.parse(rec.expiresAt);
  const at = Date.parse(t);
  if (Number.isNaN(exp) || Number.isNaN(at)) return false;
  return at <= exp;
}
function isValidRecord(v) {
  if (typeof v !== 'object' || v === null) return false;
  const r = v;
  if (typeof r['id'] !== 'string' || r['id'].length === 0) return false;
  if (typeof r['studentId'] !== 'string' || r['studentId'].length === 0) return false;
  if (typeof r['grantedAt'] !== 'string') return false;
  for (const k of ['purpose', 'from', 'to', 'expiresAt']) {
    if (r[k] !== void 0 && typeof r[k] !== 'string') return false;
  }
  return true;
}
var ConsentStore = class {
  filePath;
  genId;
  lockTimeoutMs;
  constructor(opts = {}) {
    const base = opts.dir ?? resolveDataDir();
    this.filePath = path6.join(bridgeStateDir(base), 'consents.json');
    this.genId = opts.genId ?? defaultConsentId;
    this.lockTimeoutMs = opts.lockTimeoutMs ?? 3e3;
  }
  /** 파일을 새로 읽어 유효 레코드만 반환(손상 항목은 조용히 폐기). */
  read() {
    let parsed;
    try {
      parsed = JSON.parse(fs8.readFileSync(this.filePath, 'utf-8'));
    } catch {
      return [];
    }
    const records = parsed?.records;
    if (!Array.isArray(records)) return [];
    return records.filter(isValidRecord);
  }
  /** 동기 sleep(잠금 재시도 백오프) — Atomics.wait 으로 CPU 스핀 없이 대기. */
  sleep(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  }
  /**
   * pid 가 살아있는가(존재=true). ESRCH(프로세스 없음)만 사망으로 보고, 그 외 오류(EPERM 등)는
   * 보수적으로 생존 취급한다 — 확신 없는 회수를 막아 데이터 무결성을 우선(fail-closed).
   */
  pidAlive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (e) {
      return e.code !== 'ESRCH';
    }
  }
  /**
   * 점유된 잠금이 안전하게 회수 가능하면 회수하고 true.
   * - 소유자 pid 가 살아있으면 회수하지 않는다(살아있는 writer 의 락을 빼앗지 않음).
   * - 소유자 pid 가 죽었으면 회수. (pid 재사용 시엔 보수적으로 살아있다고 보고 대기 → fail-closed)
   * - 소유자 정보가 없고(획득 직후 크래시) 잠금이 충분히 오래(>30s)면 보수적 lease 로 회수.
   */
  reclaimIfStale(lockDir, ownerFile) {
    let owner;
    try {
      owner = JSON.parse(fs8.readFileSync(ownerFile, 'utf-8'));
    } catch {
      owner = void 0;
    }
    if (owner && typeof owner.pid === 'number') {
      if (this.pidAlive(owner.pid)) return false;
      try {
        fs8.rmSync(lockDir, { recursive: true, force: true });
        return true;
      } catch {
        return false;
      }
    }
    try {
      if (Date.now() - fs8.statSync(lockDir).mtimeMs > 3e4) {
        fs8.rmSync(lockDir, { recursive: true, force: true });
        return true;
      }
    } catch {}
    return false;
  }
  /**
   * 소유권 기반 배타 잠금으로 read-modify-write 를 직렬화(동시 grant/revoke 갱신 손실 방지).
   * - 획득: 원자적 mkdir + owner 파일에 {pid, nonce} 기록.
   * - 해제: owner.nonce 가 내 것일 때만 제거(중간에 회수당했으면 남의 락을 지우지 않음).
   * - 회수: 소유자 pid 사망 시에만(또는 소유자 정보 없이 오래된 경우) 회수.
   */
  withLock(fn) {
    const lockDir = `${this.filePath}.lock`;
    const ownerFile = path6.join(lockDir, 'owner.json');
    const myNonce = `${process.pid}.${crypto5.randomBytes(6).toString('hex')}`;
    const deadlineMs = Date.now() + this.lockTimeoutMs;
    fs8.mkdirSync(path6.dirname(this.filePath), { recursive: true });
    for (;;) {
      try {
        fs8.mkdirSync(lockDir);
        fs8.writeFileSync(ownerFile, JSON.stringify({ pid: process.pid, nonce: myNonce }), 'utf-8');
        break;
      } catch {
        if (this.reclaimIfStale(lockDir, ownerFile)) continue;
        if (Date.now() > deadlineMs) {
          throw new Error(
            '\uB3D9\uC758 \uC800\uC7A5\uC18C \uC7A0\uAE08 \uD68D\uB4DD \uC2E4\uD328(\uB2E4\uB978 \uC791\uC5C5\uC774 \uC9C4\uD589 \uC911\uC77C \uC218 \uC788\uC2B5\uB2C8\uB2E4).',
          );
        }
        this.sleep(30);
      }
    }
    try {
      return fn();
    } finally {
      try {
        const owner = JSON.parse(fs8.readFileSync(ownerFile, 'utf-8'));
        if (owner.nonce === myNonce) fs8.rmSync(lockDir, { recursive: true, force: true });
      } catch {}
    }
  }
  /** 고유 tmp + 원자적 rename(잠금 보유 중 호출). 고정 tmp 경로 충돌을 피한다. */
  persist(records) {
    const dir = path6.dirname(this.filePath);
    fs8.mkdirSync(dir, { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${crypto5.randomBytes(4).toString('hex')}.tmp`;
    const body = { records: [...records] };
    fs8.writeFileSync(tmp, JSON.stringify(body, null, 2), 'utf-8');
    fs8.renameSync(tmp, this.filePath);
  }
  /** 잠금 하에서 read → 변형 → write 를 원자적으로 수행(갱신 손실 방지). */
  mutate(fn) {
    this.withLock(() => {
      this.persist(fn(this.read()));
    });
  }
  /** 동의 부여(교사 권한). 검증 후 레코드 생성·영속하고 레코드를 반환. */
  grant(input) {
    const studentId = input.studentId;
    if (typeof studentId !== 'string' || studentId.trim().length === 0) {
      throw new ConsentValidationError('studentId \uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.');
    }
    const record = {
      id: this.genId(),
      studentId,
      grantedAt: nowIso(),
    };
    if (input.purpose !== void 0) {
      const p = input.purpose.trim();
      if (p.length === 0 || p.length > PURPOSE_MAX) {
        throw new ConsentValidationError(
          `purpose \uB294 1~${PURPOSE_MAX}\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4.`,
        );
      }
      record.purpose = p;
    }
    for (const k of ['from', 'to']) {
      const val = input[k];
      if (val !== void 0) {
        if (!DATE_RE.test(val))
          throw new ConsentValidationError(
            `${k} \uB294 YYYY-MM-DD \uD615\uC2DD\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.`,
          );
        record[k] = val;
      }
    }
    if (record.from !== void 0 && record.to !== void 0 && record.from > record.to) {
      throw new ConsentValidationError(
        'from \uC740 to \uBCF4\uB2E4 \uC774\uD6C4\uC77C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
      );
    }
    if (input.expiresAt !== void 0 && input.ttlSeconds !== void 0) {
      throw new ConsentValidationError(
        'expiresAt \uC640 ttlSeconds \uB294 \uB3D9\uC2DC\uC5D0 \uC9C0\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4(\uD558\uB098\uB9CC).',
      );
    }
    if (input.expiresAt !== void 0) {
      if (Number.isNaN(Date.parse(input.expiresAt))) {
        throw new ConsentValidationError(
          'expiresAt \uB294 \uC720\uD6A8\uD55C ISO \uC2DC\uAC01\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
        );
      }
      record.expiresAt = input.expiresAt;
    } else if (input.ttlSeconds !== void 0) {
      if (!Number.isFinite(input.ttlSeconds) || input.ttlSeconds <= 0) {
        throw new ConsentValidationError(
          'ttlSeconds \uB294 \uC591\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4.',
        );
      }
      record.expiresAt = new Date(Date.now() + input.ttlSeconds * 1e3).toISOString();
    }
    this.mutate((records) => [...records, record]);
    return record;
  }
  /** 동의 철회. 제거되면 true. */
  revoke(id) {
    let removed = false;
    this.mutate((records) => {
      const next = records.filter((r) => r.id !== id);
      removed = next.length !== records.length;
      return next;
    });
    return removed;
  }
  /** 특정 학생의 모든 동의를 철회(교사 일괄 정리). 제거된 동의 id 목록을 반환. */
  revokeForStudent(studentId) {
    const removed = [];
    this.mutate((records) =>
      records.filter((r) => {
        if (r.studentId === studentId) {
          removed.push(r.id);
          return false;
        }
        return true;
      }),
    );
    return removed;
  }
  /** 모든 동의를 철회(교사 전체 초기화). 제거된 동의 id 목록을 반환. */
  revokeAll() {
    const removed = [];
    this.mutate((records) => {
      for (const r of records) removed.push(r.id);
      return [];
    });
    return removed;
  }
  /** 만료되지 않은 동의 목록(기본 현재 기준). */
  list(at = nowIso()) {
    return this.read().filter((r) => notExpired(r, at));
  }
  /** 만료된 동의까지 포함한 전체 목록(교사 점검용 — describeConsent 로 상태 표시). */
  listAll() {
    return this.read();
  }
  /**
   * 질의에 부합하는 첫 활성 동의를 반환(없으면 undefined). 존재 확인용.
   * 매칭: studentId 일치 + 미만료 + (레코드 purpose 미지정이면 모든 목적 허용, 지정이면 동일 목적만).
   */
  findActive(query) {
    const at = query.at ?? nowIso();
    return this.read().find((r) => matchesQuery(r, query, at));
  }
  /** 질의에 부합하는 모든 활성 동의(기간 합집합 산정용 — 순서 의존성 제거). */
  findAllActive(query) {
    const at = query.at ?? nowIso();
    return this.read().filter((r) => matchesQuery(r, query, at));
  }
};
function matchesQuery(r, query, at) {
  return (
    r.studentId === query.studentId &&
    notExpired(r, at) &&
    (r.purpose === void 0 || r.purpose === query.purpose)
  );
}
function resolveContentAccess(query) {
  if (isContentExposureEnabled(query.env ?? process.env, query.dataDir)) {
    return { allowed: true, via: 'master' };
  }
  if (query.consent) {
    const cq = { studentId: query.studentId };
    if (query.purpose !== void 0) cq.purpose = query.purpose;
    if (query.at !== void 0) cq.at = query.at;
    const consents = query.consent.findAllActive(cq);
    if (consents.length > 0) return { allowed: true, via: 'consent', consents };
  }
  return { allowed: false };
}
function isObservationDateAllowed(access, date) {
  if (access.via === 'master') return true;
  return access.consents.some(
    (c) => (c.from === void 0 || date >= c.from) && (c.to === void 0 || date <= c.to),
  );
}
function assertContentAccess(query) {
  const access = resolveContentAccess(query);
  if (!access.allowed) {
    throw new ContentExposureDisabledError(
      '\uB0B4\uC6A9 \uB178\uCD9C\uC774 \uD5C8\uAC00\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uC324\uD540 \uC124\uC815\uC758 "AI \uC5F0\uACB0"\uC5D0\uC11C \uC77D\uAE30\uB97C \uCF1C\uAC70\uB098(\uC989\uC2DC \uC801\uC6A9), \uAD50\uC0AC\uAC00 CLI \uB85C \uD574\uB2F9 \uD559\uC0DD \uB3D9\uC758\uB97C \uBD80\uC5EC(ssampin consent grant)\uD558\uAC70\uB098, SSAMPIN_BRIDGE_ALLOW_CONTENT=1 \uB9C8\uC2A4\uD130 \uC2A4\uC704\uCE58\uB97C \uD65C\uC131\uD654\uD558\uC138\uC694.',
    );
  }
  return access;
}

// ../ssampin-ai-bridge/packages/mcp/dist/context.js
function createContext(dataDir = resolveDataDir()) {
  return {
    dataDir,
    store: new TokenStore({ dir: dataDir }),
    audit: new AuditLog(dataDir),
    consent: new ConsentStore({ dir: dataDir }),
  };
}

// ../ssampin-ai-bridge/packages/mcp/dist/writeTools.js
import crypto6 from 'node:crypto';
var DATE_RE2 = /^\d{4}-\d{2}-\d{2}$/;
var TIME_RE = /^\d{2}:\d{2}$/;
var PRIORITIES = /* @__PURE__ */ new Set(['high', 'medium', 'low', 'none']);
function asStr2(v) {
  return typeof v === 'string' && v.trim().length > 0 ? v : void 0;
}
function assertWriteAllowed(ctx) {
  if (readBridgeCapability(ctx.dataDir).allowWrite) return;
  throw new WriteDisabledError(
    '\uC4F0\uAE30\uAC00 \uBE44\uD65C\uC131\uD654\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4. \uC324\uD540 \uC124\uC815\uC758 "AI \uC5F0\uACB0"\uC5D0\uC11C \uC4F0\uAE30\uB97C \uCF1C\uC138\uC694.',
  );
}
function deriveIdemKey(domain, op, data, provided) {
  const h = crypto6
    .createHash('sha256')
    .update(`${domain}:${op}:${JSON.stringify(data)}`)
    .digest('hex')
    .slice(0, 16);
  const p = asStr2(provided);
  return p ? `${p}.${h}` : `${domain}-${h}`;
}
function resolveTodoId(ctx, todoToken) {
  const resolved = ctx.store.resolveToken(todoToken);
  if (!resolved) {
    throw new WriteValidationError(
      '\uC54C \uC218 \uC5C6\uB294 \uD560\uC77C \uD1A0\uD070\uC785\uB2C8\uB2E4. get_todos \uC758 todoToken \uC744 \uC4F0\uC138\uC694.',
    );
  }
  const id = parseTodoIdentity(resolved);
  if (!id)
    throw new WriteValidationError(
      '\uD560\uC77C \uD1A0\uD070\uC774 \uC544\uB2D9\uB2C8\uB2E4. get_todos \uC758 todoToken \uC744 \uC4F0\uC138\uC694.',
    );
  return id;
}
async function delegate(ctx, op, domain, idempotencyKey, data) {
  const control = readControlInfo(ctx.dataDir);
  if (!isAppRunning(control)) {
    throw new WriteConflictError(
      '\uC324\uD540\uC774 \uC2E4\uD589 \uC911\uC774 \uC544\uB2D9\uB2C8\uB2E4. \uC324\uD540\uC744 \uCF1C\uACE0 "AI \uC5F0\uACB0" \uC4F0\uAE30\uB97C \uD65C\uC131\uD654\uD55C \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694(\uC2E4\uD589 \uC911\uC5D0\uB9CC \uC548\uC804\uD558\uAC8C \uC501\uB2C8\uB2E4).',
    );
  }
  const result = await postLoopback(control, { domain, op, idempotencyKey, data });
  if (!result.ok) {
    throw new WriteConflictError(
      result.error ??
        '\uC324\uD540\uC5D0 \uC4F0\uAE30\uB97C \uC801\uC6A9\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
    );
  }
  return { ref: result.ref ?? idempotencyKey };
}
async function createVia(ctx, domain, data, idempotencyKey, directAppend) {
  const decision = decideWritePath(ctx.dataDir);
  if (decision.path === 'loopback') {
    const result = await postLoopback(decision.control, {
      domain,
      op: 'create',
      idempotencyKey,
      data,
    });
    if (!result.ok)
      throw new WriteConflictError(
        result.error ??
          '\uC324\uD540\uC5D0 \uC4F0\uAE30\uB97C \uC801\uC6A9\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
      );
    return { ref: result.ref ?? idempotencyKey, via: 'app' };
  }
  if (decision.path === 'direct') {
    await directAppend();
    return { ref: idempotencyKey, via: 'file' };
  }
  throw new WriteConflictError(
    '\uC324\uD540 \uC0C1\uD0DC\uAC00 \uBD88\uD655\uC2E4\uD569\uB2C8\uB2E4(\uC2DC\uC791 \uC911\uC774\uAC70\uB098 \uC751\uB2F5 \uC5C6\uC74C). \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.',
  );
}
async function createTodo(ctx, args) {
  assertWriteAllowed(ctx);
  const text = asStr2(args.text);
  if (!text) throw new WriteValidationError('text \uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.');
  if (text.length > 500)
    throw new WriteValidationError(
      `text \uB294 \uCD5C\uB300 500\uC790\uC785\uB2C8\uB2E4(\uD604\uC7AC ${text.length}).`,
    );
  const data = { text };
  const dueDate = asStr2(args.dueDate);
  if (dueDate !== void 0) {
    if (!DATE_RE2.test(dueDate))
      throw new WriteValidationError(
        'dueDate \uB294 YYYY-MM-DD \uD615\uC2DD\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
      );
    data['dueDate'] = dueDate;
  }
  const priority = asStr2(args.priority);
  if (priority !== void 0) {
    if (!PRIORITIES.has(priority))
      throw new WriteValidationError(
        'priority \uB294 high|medium|low|none \uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
      );
    data['priority'] = priority;
  }
  const category = asStr2(args.category);
  if (category !== void 0) data['category'] = category;
  const time = asStr2(args.time);
  if (time !== void 0) {
    if (!TIME_RE.test(time))
      throw new WriteValidationError(
        'time \uC740 HH:mm \uD615\uC2DD\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
      );
    data['time'] = time;
  }
  const idempotencyKey = deriveIdemKey('todos', 'create', data, args.idempotencyKey);
  const { ref, via } = await createVia(ctx, 'todos', data, idempotencyKey, () =>
    appendTodoDirect(ctx.dataDir, data, idempotencyKey),
  );
  ctx.audit.append({ tool: 'create_todo', redactionStats: { items: 1 } });
  return { ok: true, ref, via };
}
async function createEvent(ctx, args) {
  assertWriteAllowed(ctx);
  const title = asStr2(args.title);
  const date = asStr2(args.date);
  if (!title) throw new WriteValidationError('title \uC774 \uD544\uC694\uD569\uB2C8\uB2E4.');
  if (title.length > 200)
    throw new WriteValidationError(
      `title \uC740 \uCD5C\uB300 200\uC790\uC785\uB2C8\uB2E4(\uD604\uC7AC ${title.length}).`,
    );
  if (!date || !DATE_RE2.test(date))
    throw new WriteValidationError(
      'date \uB294 YYYY-MM-DD \uD615\uC2DD\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
    );
  const data = { title, date };
  const category = asStr2(args.category);
  if (category !== void 0) data['category'] = category;
  const time = asStr2(args.time);
  if (time !== void 0) data['time'] = time;
  const location = asStr2(args.location);
  if (location !== void 0) data['location'] = location;
  const idempotencyKey = deriveIdemKey('events', 'create', data, args.idempotencyKey);
  const { ref, via } = await createVia(ctx, 'events', data, idempotencyKey, () =>
    appendEventDirect(ctx.dataDir, data, idempotencyKey),
  );
  ctx.audit.append({ tool: 'create_event', redactionStats: { items: 1 } });
  return { ok: true, ref, via };
}
async function mutateTodo(ctx, op, todoToken, extra, provided, tool) {
  assertWriteAllowed(ctx);
  const id = resolveTodoId(ctx, todoToken);
  const data = { id, ...extra };
  const idempotencyKey = deriveIdemKey('todos', op, data, provided);
  const { ref } = await delegate(ctx, op, 'todos', idempotencyKey, data);
  ctx.audit.append({ tool, redactionStats: { items: 1 } });
  return { ok: true, ref, via: 'app' };
}
function completeTodo(ctx, args) {
  return mutateTodo(ctx, 'complete', args.todoToken, {}, args.idempotencyKey, 'complete_todo');
}
function deleteTodo(ctx, args) {
  return mutateTodo(ctx, 'delete', args.todoToken, {}, args.idempotencyKey, 'delete_todo');
}
async function updateTodo(ctx, args) {
  const changes = {};
  const text = asStr2(args.text);
  if (text !== void 0) {
    if (text.length > 500)
      throw new WriteValidationError(
        `text \uB294 \uCD5C\uB300 500\uC790\uC785\uB2C8\uB2E4(\uD604\uC7AC ${text.length}).`,
      );
    changes['text'] = text;
  }
  const dueDate = asStr2(args.dueDate);
  if (dueDate !== void 0) {
    if (!DATE_RE2.test(dueDate))
      throw new WriteValidationError(
        'dueDate \uB294 YYYY-MM-DD \uD615\uC2DD\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
      );
    changes['dueDate'] = dueDate;
  }
  const priority = asStr2(args.priority);
  if (priority !== void 0) {
    if (!PRIORITIES.has(priority))
      throw new WriteValidationError(
        'priority \uB294 high|medium|low|none \uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
      );
    changes['priority'] = priority;
  }
  const category = asStr2(args.category);
  if (category !== void 0) changes['category'] = category;
  const time = asStr2(args.time);
  if (time !== void 0) {
    if (!TIME_RE.test(time))
      throw new WriteValidationError(
        'time \uC740 HH:mm \uD615\uC2DD\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
      );
    changes['time'] = time;
  }
  const status = asStr2(args.status);
  if (status !== void 0) {
    if (!['todo', 'inProgress', 'done'].includes(status))
      throw new WriteValidationError(
        'status \uB294 todo|inProgress|done \uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
      );
    changes['status'] = status;
  }
  if (Object.keys(changes).length === 0)
    throw new WriteValidationError(
      '\uBCC0\uACBD\uD560 \uD544\uB4DC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.',
    );
  return mutateTodo(ctx, 'update', args.todoToken, changes, args.idempotencyKey, 'update_todo');
}
function resolveEventId(ctx, eventToken) {
  const resolved = ctx.store.resolveToken(eventToken);
  if (!resolved)
    throw new WriteValidationError(
      '\uC54C \uC218 \uC5C6\uB294 \uC77C\uC815 \uD1A0\uD070\uC785\uB2C8\uB2E4. get_events \uC758 eventToken \uC744 \uC4F0\uC138\uC694.',
    );
  const id = parseEventIdentity(resolved);
  if (!id)
    throw new WriteValidationError(
      '\uC77C\uC815 \uD1A0\uD070\uC774 \uC544\uB2D9\uB2C8\uB2E4. get_events \uC758 eventToken \uC744 \uC4F0\uC138\uC694.',
    );
  return id;
}
async function updateEvent(ctx, args) {
  const changes = {};
  const title = asStr2(args.title);
  if (title !== void 0) {
    if (title.length > 200)
      throw new WriteValidationError(
        `title \uC740 \uCD5C\uB300 200\uC790\uC785\uB2C8\uB2E4(\uD604\uC7AC ${title.length}).`,
      );
    changes['title'] = title;
  }
  const date = asStr2(args.date);
  if (date !== void 0) {
    if (!DATE_RE2.test(date))
      throw new WriteValidationError(
        'date \uB294 YYYY-MM-DD \uD615\uC2DD\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
      );
    changes['date'] = date;
  }
  const category = asStr2(args.category);
  if (category !== void 0) changes['category'] = category;
  const time = asStr2(args.time);
  if (time !== void 0) changes['time'] = time;
  const location = asStr2(args.location);
  if (location !== void 0) changes['location'] = location;
  if (Object.keys(changes).length === 0)
    throw new WriteValidationError(
      '\uBCC0\uACBD\uD560 \uD544\uB4DC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.',
    );
  assertWriteAllowed(ctx);
  const id = resolveEventId(ctx, args.eventToken);
  const data = { id, ...changes };
  const idempotencyKey = deriveIdemKey('events', 'update', data, args.idempotencyKey);
  const { ref } = await delegate(ctx, 'update', 'events', idempotencyKey, data);
  ctx.audit.append({ tool: 'update_event', redactionStats: { items: 1 } });
  return { ok: true, ref, via: 'app' };
}
async function deleteEvent(ctx, args) {
  assertWriteAllowed(ctx);
  const id = resolveEventId(ctx, args.eventToken);
  const data = { id };
  const idempotencyKey = deriveIdemKey('events', 'delete', data, args.idempotencyKey);
  const { ref } = await delegate(ctx, 'delete', 'events', idempotencyKey, data);
  ctx.audit.append({ tool: 'delete_event', redactionStats: { items: 1 } });
  return { ok: true, ref, via: 'app' };
}

// ../ssampin-ai-bridge/packages/mcp/dist/tools.js
function looksLikeToken(seg) {
  if (/^[0-9a-fA-F]{16,}$/.test(seg)) return true;
  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?$/.test(seg)) return true;
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(seg))
    return true;
  if (seg.length >= 16 && /^[A-Za-z0-9_-]+$/.test(seg)) {
    const mixedAlnum = /[A-Za-z]/.test(seg) && /[0-9]/.test(seg);
    const mixedCase = /[a-z]/.test(seg) && /[A-Z]/.test(seg);
    if (mixedAlnum || mixedCase) return true;
  }
  return false;
}
function redactPathTokens(pathname) {
  return pathname
    .split('/')
    .map((seg) => (looksLikeToken(seg) ? '[\uD1A0\uD070]' : seg))
    .join('/');
}
function stripUrlSecrets(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${redactPathTokens(u.pathname)}`;
  } catch {
    const noFrag = url.split('#')[0] ?? url;
    const noQuery = noFrag.split('?')[0] ?? noFrag;
    return redactPathTokens(noQuery);
  }
}
function makeDeider(roster) {
  let masked = 0;
  return {
    deid: (s) => {
      const r = deidentify(s, roster);
      masked += sumDeid(r.stats);
      return r.text;
    },
    masked: () => masked,
  };
}
var UnknownTokenError = class extends Error {
  name = 'UnknownTokenError';
};
function resolveStudentTarget(ctx, token) {
  if (/^(?:cls|obs|rub)_/.test(token)) {
    throw new UnknownTokenError(
      '\uD559\uC0DD \uD1A0\uD070\uC774 \uC544\uB2D9\uB2C8\uB2E4(\uC218\uC5C5\uBC18/\uAD00\uCC30/\uD3C9\uAC00\uD45C \uD1A0\uD070). list_students \uC758 \uD559\uC0DD token \uC744 \uC4F0\uC138\uC694.',
    );
  }
  const resolved = ctx.store.resolveToken(token);
  if (!resolved) {
    throw new UnknownTokenError(
      '\uC54C \uC218 \uC5C6\uB294 \uD559\uC0DD \uD1A0\uD070\uC785\uB2C8\uB2E4. \uBA3C\uC800 list_students \uB85C \uD1A0\uD070\uC744 \uD655\uC778\uD558\uC138\uC694.',
    );
  }
  const identity = parseIdentity(resolved);
  if (identity.kind === 'class') {
    throw new UnknownTokenError(
      '\uC218\uC5C5\uBC18 \uD1A0\uD070\uC744 \uD559\uC0DD \uD1A0\uD070 \uC790\uB9AC\uC5D0 \uC0AC\uC6A9\uD588\uC2B5\uB2C8\uB2E4. list_students \uC758 \uD559\uC0DD token \uC744 \uC4F0\uC138\uC694.',
    );
  }
  if (
    (token.startsWith('stu_') && identity.kind !== 'homeroom') ||
    (token.startsWith('tcs_') && identity.kind !== 'teaching')
  ) {
    throw new UnknownTokenError(
      '\uD1A0\uD070 \uC885\uB958\uAC00 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4(\uC190\uC0C1\uB41C \uD1A0\uD070). list_students \uB85C \uB2E4\uC2DC \uD1A0\uD070\uC744 \uBC1B\uC73C\uC138\uC694.',
    );
  }
  return { resolved, identity };
}
function resolveClass(ctx, classToken) {
  const resolved = ctx.store.resolveToken(classToken);
  if (!resolved) {
    throw new UnknownTokenError(
      '\uC54C \uC218 \uC5C6\uB294 \uC218\uC5C5\uBC18 \uD1A0\uD070\uC785\uB2C8\uB2E4. \uBA3C\uC800 list_classes \uB85C \uD1A0\uD070\uC744 \uD655\uC778\uD558\uC138\uC694.',
    );
  }
  const identity = parseIdentity(resolved);
  if (identity.kind !== 'class') {
    throw new UnknownTokenError(
      '\uD559\uC0DD \uD1A0\uD070\uC744 \uC218\uC5C5\uBC18 \uD1A0\uD070 \uC790\uB9AC\uC5D0 \uC0AC\uC6A9\uD588\uC2B5\uB2C8\uB2E4. list_classes \uC758 classToken \uC744 \uC4F0\uC138\uC694.',
    );
  }
  const cls = readTeachingClasses(ctx.dataDir).classes.find((c) => c.id === identity.classId);
  if (!cls)
    throw new UnknownTokenError(
      '\uC218\uC5C5\uBC18\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4(\uC0AD\uC81C\uB418\uC5C8\uC744 \uC218 \uC788\uC74C).',
    );
  return cls;
}
function listClasses(ctx) {
  const classes = readTeachingClasses(ctx.dataDir).classes;
  const views = classes.map((c) => ({
    classToken: ctx.store.getToken(makeClassIdentity(c.id), { prefix: 'cls' }),
    subject: c.subject,
    name: c.name,
    studentCount: c.students.length,
  }));
  ctx.audit.append({ tool: 'list_classes', redactionStats: { students: classes.length } });
  return { count: views.length, classes: views };
}
function listStudents(ctx, args = {}) {
  if (args.classToken !== void 0) {
    const cls = resolveClass(ctx, args.classToken);
    const roster2 = cls.students.map((s) => ({
      studentNumber: s.number,
      token: ctx.store.getToken(makeTeachingStudentIdentity(cls.id, studentKey(s)), {
        prefix: 'tcs',
      }),
    }));
    ctx.audit.append({ tool: 'list_students', redactionStats: { students: roster2.length } });
    return { count: roster2.length, students: roster2 };
  }
  const students = readStudents(ctx.dataDir);
  const roster = students.map((s) => {
    const token = ctx.store.getToken(s.id);
    return s.studentNumber === void 0 ? { token } : { studentNumber: s.studentNumber, token };
  });
  ctx.audit.append({ tool: 'list_students', redactionStats: { students: students.length } });
  return { count: roster.length, students: roster };
}
function getSeating(ctx) {
  const seating = readSeating(ctx.dataDir);
  if (!seating) return null;
  let seated = 0;
  const seats = seating.seats.map((row) =>
    row.map((cell) => {
      if (!cell) return null;
      seated += 1;
      return ctx.store.getToken(cell);
    }),
  );
  ctx.audit.append({ tool: 'get_seating', redactionStats: { students: seated } });
  return { rows: seating.rows, cols: seating.cols, seats };
}
function isYmd(v) {
  return typeof v === 'string' && /^\d{8}$/.test(v);
}
function getMeals(ctx, args = {}) {
  const all = readManualMeals(ctx.dataDir);
  const from = isYmd(args.from) ? args.from : void 0;
  const to = isYmd(args.to) ? args.to : void 0;
  const meals = all.filter((m) => {
    if (from !== void 0 && m.date < from) return false;
    if (to !== void 0 && m.date > to) return false;
    return true;
  });
  ctx.audit.append({ tool: 'get_meals', redactionStats: { items: meals.length } });
  return { count: meals.length, meals };
}
var CONTENT_GATE_NOTICE =
  '\uC81C\uBAA9\xB7\uC124\uBA85\xB7\uC7A5\uC18C \uB4F1 \uC790\uC720\uC11C\uC220\uC740 \uC324\uD540 \uC124\uC815 "AI \uC5F0\uACB0"\uC758 \uC77D\uAE30 \uD5C8\uC6A9 \uD1A0\uAE00(\uCF1C\uB294 \uC989\uC2DC \uC801\uC6A9) \uB610\uB294 SSAMPIN_BRIDGE_ALLOW_CONTENT=1 \uB9C8\uC2A4\uD130 \uC2A4\uC704\uCE58\uAC00 \uCF1C\uC9C4 \uACBD\uC6B0\uC5D0\uB9CC \uB178\uCD9C\uB429\uB2C8\uB2E4(\uD604\uC7AC \uBBF8\uB178\uCD9C). \uB0A0\uC9DC\xB7\uAD50\uC2DC \uB4F1 \uBE44\uC2DD\uBCC4 \uBA54\uD0C0\uB9CC \uBC18\uD658\uD588\uC2B5\uB2C8\uB2E4.';
var CONTENT_SHOWN_NOTICE =
  '\uC790\uC720\uC11C\uC220\uC774 \uD3EC\uD568\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4. \uD559\uC0DD \uC2E4\uBA85\xB7\uC5F0\uB77D\uCC98\xB7\uC0DD\uC77C\uC740 \uB9C8\uC2A4\uD0B9\uB418\uC9C0\uB9CC \uB9E5\uB77D\uC73C\uB85C \uC7AC\uC2DD\uBCC4\uB420 \uC218 \uC788\uC73C\uBBC0\uB85C \uAD50\uC0AC \uAC80\uD1A0\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.';
function sumDeid(stats) {
  return (
    stats.names + stats.phones + stats.rrns + stats.birthDates + stats.studentNumbers + stats.emails
  );
}
function buildFullRoster(ctx) {
  const entries = [];
  for (const s of readStudents(ctx.dataDir)) {
    if (!s.name) continue;
    const e = {
      token: ctx.store.getToken(s.id),
      names: [s.name],
    };
    if (s.studentNumber !== void 0) e.studentNumber = s.studentNumber;
    entries.push(e);
  }
  for (const c of readTeachingClasses(ctx.dataDir).classes) {
    for (const st of c.students) {
      if (!st.name) continue;
      const e = {
        token: ctx.store.getToken(makeTeachingStudentIdentity(c.id, studentKey(st)), {
          prefix: 'tcs',
        }),
        names: [st.name],
      };
      if (st.number !== void 0) e.studentNumber = st.number;
      entries.push(e);
    }
  }
  return entries;
}
function isYmdDash(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}
function safeEventView(e) {
  const v = { date: e.date };
  const copy = (k) => {
    const val = e[k];
    if (val !== void 0) v[k] = val;
  };
  copy('endDate');
  if (e.category !== void 0) v['category'] = maskPatterns(e.category);
  copy('time');
  copy('startTime');
  copy('endTime');
  copy('period');
  copy('periodEnd');
  copy('recurrence');
  copy('isDDay');
  return v;
}
function getEvents(ctx, args = {}) {
  const all = readEvents(ctx.dataDir);
  const from = isYmdDash(args.from) ? args.from : void 0;
  const to = isYmdDash(args.to) ? args.to : void 0;
  const filtered = all.filter((e) => {
    const end = e.endDate ?? e.date;
    if (from !== void 0 && end < from) return false;
    if (to !== void 0 && e.date > to) return false;
    return true;
  });
  const contentOn = isContentExposureEnabled(process.env, ctx.dataDir);
  const roster = contentOn ? buildFullRoster(ctx) : [];
  let masked = 0;
  const events = filtered.map((e) => {
    const v = safeEventView(e);
    if (e.id !== void 0)
      v['eventToken'] = ctx.store.getToken(makeEventIdentity(e.id), { prefix: 'evt' });
    if (contentOn) {
      const t = deidentify(e.title, roster);
      masked += sumDeid(t.stats);
      v['title'] = t.text;
      if (e.description !== void 0) {
        const d = deidentify(e.description, roster);
        masked += sumDeid(d.stats);
        v['description'] = d.text;
      }
      if (e.location !== void 0) {
        const l = deidentify(e.location, roster);
        masked += sumDeid(l.stats);
        v['location'] = l.text;
      }
    }
    return v;
  });
  ctx.audit.append({ tool: 'get_events', redactionStats: { items: events.length, names: masked } });
  return {
    count: events.length,
    contentIncluded: contentOn,
    notice: contentOn ? CONTENT_SHOWN_NOTICE : CONTENT_GATE_NOTICE,
    events,
  };
}
function getDdays(ctx) {
  const all = readDdays(ctx.dataDir);
  const contentOn = isContentExposureEnabled(process.env, ctx.dataDir);
  const roster = contentOn ? buildFullRoster(ctx) : [];
  let masked = 0;
  const ddays = all.map((d) => {
    const v = { date: d.date };
    if (d.emoji !== void 0) v['emoji'] = d.emoji;
    if (d.color !== void 0) v['color'] = d.color;
    if (d.pinned !== void 0) v['pinned'] = d.pinned;
    if (contentOn) {
      const t = deidentify(d.title, roster);
      masked += sumDeid(t.stats);
      v['title'] = t.text;
    }
    return v;
  });
  ctx.audit.append({ tool: 'get_ddays', redactionStats: { items: ddays.length, names: masked } });
  return {
    count: ddays.length,
    contentIncluded: contentOn,
    notice: contentOn ? CONTENT_SHOWN_NOTICE : CONTENT_GATE_NOTICE,
    ddays,
  };
}
function safeTodoView(t) {
  const v = {
    status: effectiveTodoStatus(t),
    completed: t.completed,
  };
  const copy = (k) => {
    const val = t[k];
    if (val !== void 0) v[k] = val;
  };
  copy('dueDate');
  copy('startDate');
  copy('time');
  copy('priority');
  if (t.category !== void 0) v['category'] = maskPatterns(t.category);
  copy('recurrence');
  copy('archivedAt');
  copy('subTaskCount');
  copy('subTaskDone');
  return v;
}
function getTodos(ctx, args = {}) {
  const all = readTodos(ctx.dataDir);
  const dueBefore = isYmdDash(args.dueBefore) ? args.dueBefore : void 0;
  const statusFilter =
    args.status === 'todo' || args.status === 'inProgress' || args.status === 'done'
      ? args.status
      : void 0;
  const filtered = all.filter((t) => {
    if (!args.includeArchived && t.archivedAt !== void 0) return false;
    if (statusFilter !== void 0 && effectiveTodoStatus(t) !== statusFilter) return false;
    if (dueBefore !== void 0 && (t.dueDate === void 0 || t.dueDate > dueBefore)) return false;
    return true;
  });
  const contentOn = isContentExposureEnabled(process.env, ctx.dataDir);
  const roster = contentOn ? buildFullRoster(ctx) : [];
  let masked = 0;
  const todos = filtered.map((t) => {
    const v = safeTodoView(t);
    if (t.id !== void 0)
      v['todoToken'] = ctx.store.getToken(makeTodoIdentity(t.id), { prefix: 'todo' });
    if (contentOn) {
      const tx = deidentify(t.text, roster);
      masked += sumDeid(tx.stats);
      v['text'] = tx.text;
      if (t.notes !== void 0) {
        const n = deidentify(t.notes, roster);
        masked += sumDeid(n.stats);
        v['notes'] = n.text;
      }
    }
    return v;
  });
  ctx.audit.append({ tool: 'get_todos', redactionStats: { items: todos.length, names: masked } });
  return {
    count: todos.length,
    contentIncluded: contentOn,
    notice: contentOn ? CONTENT_SHOWN_NOTICE : CONTENT_GATE_NOTICE,
    todos,
  };
}
function getSchedule(ctx, args) {
  const kind = args.kind;
  if (kind === 'class') {
    const slots2 = readClassSchedule(ctx.dataDir);
    ctx.audit.append({ tool: 'get_schedule', redactionStats: { items: slots2.length } });
    return { kind, count: slots2.length, slots: slots2 };
  }
  if (kind === 'teacher') {
    const slots2 = readTeacherSchedule(ctx.dataDir);
    ctx.audit.append({ tool: 'get_schedule', redactionStats: { items: slots2.length } });
    return { kind, count: slots2.length, slots: slots2 };
  }
  const all = readTimetableOverrides(ctx.dataDir);
  const contentOn = isContentExposureEnabled(process.env, ctx.dataDir);
  const roster = contentOn ? buildFullRoster(ctx) : [];
  let masked = 0;
  const slots = all.map((o) => {
    const v = { date: o.date, period: o.period };
    if (o.subject !== void 0) v['subject'] = o.subject;
    if (o.classroom !== void 0) v['classroom'] = o.classroom;
    if (o.kind !== void 0) v['kind'] = o.kind;
    if (o.scope !== void 0) v['scope'] = o.scope;
    if (o.substituteTeacher !== void 0) v['substituteTeacher'] = o.substituteTeacher;
    if (contentOn && o.reason !== void 0) {
      const r = deidentify(o.reason, roster);
      masked += sumDeid(r.stats);
      v['reason'] = r.text;
    }
    return v;
  });
  ctx.audit.append({
    tool: 'get_schedule',
    redactionStats: { items: slots.length, names: masked },
  });
  return {
    kind,
    count: slots.length,
    contentIncluded: contentOn,
    notice: contentOn ? CONTENT_SHOWN_NOTICE : CONTENT_GATE_NOTICE,
    slots,
  };
}
function getNotes(ctx) {
  const notebooks = readNotebooks(ctx.dataDir).filter((n) => !n.archived);
  const sections = readNoteSections(ctx.dataDir);
  const pages = readNotePages(ctx.dataDir);
  const counts = { notebooks: notebooks.length, sections: sections.length, pages: pages.length };
  if (!isContentExposureEnabled(process.env, ctx.dataDir)) {
    ctx.audit.append({ tool: 'get_notes', redactionStats: { items: pages.length } });
    return { contentIncluded: false, notice: CONTENT_GATE_NOTICE, counts };
  }
  const { deid, masked } = makeDeider(buildFullRoster(ctx));
  const pagesBySection = /* @__PURE__ */ new Map();
  for (const p of pages) {
    const view = {
      pageToken: ctx.store.getToken(makeNotePageIdentity(p.id), { prefix: 'npg' }),
      title: deid(p.title),
      tags: p.tags.map(deid),
      pinned: p.pinned,
      ...(p.updatedAt !== void 0 ? { updatedAt: p.updatedAt } : {}),
    };
    const arr = pagesBySection.get(p.sectionId) ?? [];
    arr.push(view);
    pagesBySection.set(p.sectionId, arr);
  }
  const sectionsByNotebook = /* @__PURE__ */ new Map();
  for (const s of [...sections].sort((a, b) => a.order - b.order)) {
    const arr = sectionsByNotebook.get(s.notebookId) ?? [];
    arr.push({
      sectionToken: ctx.store.getToken(makeNoteSectionIdentity(s.id), { prefix: 'nsec' }),
      title: deid(s.title),
      pages: pagesBySection.get(s.id) ?? [],
    });
    sectionsByNotebook.set(s.notebookId, arr);
  }
  const notebookViews = [...notebooks]
    .sort((a, b) => a.order - b.order)
    .map((n) => ({
      notebookToken: ctx.store.getToken(makeNotebookIdentity(n.id), { prefix: 'nb' }),
      title: deid(n.title),
      sections: sectionsByNotebook.get(n.id) ?? [],
    }));
  ctx.audit.append({ tool: 'get_notes', redactionStats: { items: pages.length, names: masked() } });
  return { contentIncluded: true, notice: CONTENT_SHOWN_NOTICE, counts, notebooks: notebookViews };
}
function getMemos(ctx) {
  const memos = readMemos(ctx.dataDir).filter((m) => !m.archived);
  if (!isContentExposureEnabled(process.env, ctx.dataDir)) {
    ctx.audit.append({ tool: 'get_memos', redactionStats: { items: memos.length } });
    return { contentIncluded: false, notice: CONTENT_GATE_NOTICE, count: memos.length };
  }
  const { deid, masked } = makeDeider(buildFullRoster(ctx));
  const views = memos.map((m) => ({
    memoToken: ctx.store.getToken(makeMemoIdentity(m.id), { prefix: 'memo' }),
    text: deid(m.text),
    ...(m.color !== void 0 ? { color: m.color } : {}),
  }));
  ctx.audit.append({ tool: 'get_memos', redactionStats: { items: memos.length, names: masked() } });
  return { contentIncluded: true, notice: CONTENT_SHOWN_NOTICE, count: memos.length, memos: views };
}
function getBookmarks(ctx) {
  const { groups, bookmarks } = readBookmarks(ctx.dataDir);
  const activeGroups = groups.filter((g) => !g.archived);
  if (!isContentExposureEnabled(process.env, ctx.dataDir)) {
    ctx.audit.append({ tool: 'get_bookmarks', redactionStats: { items: bookmarks.length } });
    return { contentIncluded: false, notice: CONTENT_GATE_NOTICE, count: bookmarks.length };
  }
  const { deid, masked } = makeDeider(buildFullRoster(ctx));
  const byGroup = /* @__PURE__ */ new Map();
  for (const b of bookmarks) {
    const arr = byGroup.get(b.groupId) ?? [];
    arr.push({
      bookmarkToken: ctx.store.getToken(makeBookmarkIdentity(b.id), { prefix: 'bm' }),
      name: deid(b.name),
      url: deid(stripUrlSecrets(b.url)),
    });
    byGroup.set(b.groupId, arr);
  }
  const groupViews = [...activeGroups]
    .sort((a, b) => a.order - b.order)
    .map((g) => ({
      groupToken: ctx.store.getToken(makeBookmarkGroupIdentity(g.id), { prefix: 'bmg' }),
      name: deid(g.name),
      bookmarks: byGroup.get(g.id) ?? [],
    }));
  ctx.audit.append({
    tool: 'get_bookmarks',
    redactionStats: { items: bookmarks.length, names: masked() },
  });
  return {
    contentIncluded: true,
    notice: CONTENT_SHOWN_NOTICE,
    count: bookmarks.length,
    groups: groupViews,
  };
}
async function addObservation(ctx, args) {
  assertWriteEnabled(process.env, ctx.dataDir);
  const { identity } = resolveStudentTarget(ctx, args.studentToken);
  const data = { content: args.content };
  if (identity.kind === 'teaching') {
    data['studentId'] = identity.studentKey;
    data['classId'] = identity.classId;
  } else {
    data['studentId'] = identity.studentId;
  }
  if (args.tags !== void 0) data['tags'] = args.tags;
  if (args.date !== void 0) data['date'] = args.date;
  const idempotencyKey = deriveIdemKey('observations', 'create', data, args.idempotencyKey);
  const { ref, via } = await createVia(ctx, 'observations', data, idempotencyKey, () =>
    appendObservation(ctx.dataDir, {
      ...data,
      clientKey: idempotencyKey,
    }).then((r) => ({ ref: ctx.audit.hashRecordId(r.id) })),
  );
  ctx.audit.append({ tool: 'add_observation', redactionStats: { observations: 1 } });
  return { ok: true, token: args.studentToken, observationRef: ref, via };
}
var SENSITIVE_NOTICE =
  '\uB3D9\uC758 \uD558\uC5D0 \uB178\uCD9C\uB41C \uBBFC\uAC10 \uADFC\uAC70 \uC6D0\uBB38\uC785\uB2C8\uB2E4. \uC9C1\uC811 \uC2DD\uBCC4\uC790(\uC2E4\uBA85/\uC5F0\uB77D\uCC98/\uC0DD\uC77C/\uD559\uBC88)\uB9CC \uB9C8\uC2A4\uD0B9\uB418\uBA70, \uC8FC\uC18C\xB7\uAC00\uC871\uAD00\uACC4\xB7\uAC74\uAC15\xB7\uC0C1\uB2F4\xB7\uD2B9\uC815 \uD65C\uB3D9/\uC7A5\uC18C \uB4F1 \uB9E5\uB77D\uC73C\uB85C \uC7AC\uC2DD\uBCC4\uB420 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC775\uBA85\uD654\uB41C \uB370\uC774\uD130\uAC00 \uC544\uB2C8\uBBC0\uB85C \uAD50\uC0AC \uAC80\uD1A0\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.';
function getObservations(ctx, args) {
  const { resolved, identity } = resolveStudentTarget(ctx, args.studentToken);
  const access = assertContentAccess({
    studentId: resolved,
    purpose: OBSERVATION_READ_PURPOSE,
    consent: ctx.consent,
    dataDir: ctx.dataDir,
  });
  const roster = rosterForIdentity(ctx.dataDir, identity, ctx.store);
  const query = {};
  if (args.from !== void 0) query.from = args.from;
  if (args.to !== void 0) query.to = args.to;
  const records = getObservationsForIdentity(ctx.dataDir, identity, query).filter((r) =>
    isObservationDateAllowed(access, r.date),
  );
  const attByObs = /* @__PURE__ */ new Map();
  for (const a of readObservationAttachments(ctx.dataDir).attachments) {
    const arr = attByObs.get(a.observationId);
    if (arr) arr.push(a);
    else attByObs.set(a.observationId, [a]);
  }
  let masked = 0;
  const observations = records.map((r) => {
    const { text, stats } = deidentify(r.content, roster);
    masked += sumDeid(stats);
    const tags = r.tags.map((t) => deidentify(t, roster).text);
    const view = {
      observationId: ctx.store.getToken(makeObservationIdentity(r.id), { prefix: 'obs' }),
      date: r.date,
      tags,
      content: text,
    };
    const atts = attByObs.get(r.id);
    if (atts && atts.length > 0) {
      const docs = [];
      let imageCount = 0;
      for (const a of atts) {
        if (a.kind === 'image') {
          imageCount += 1;
          continue;
        }
        if (a.extractedText && a.extractedText.trim().length > 0) {
          const fn = deidentify(a.fileName, roster);
          const tx = deidentify(a.extractedText, roster);
          masked += sumDeid(fn.stats) + sumDeid(tx.stats);
          docs.push({ fileName: fn.text, text: tx.text });
        }
      }
      if (docs.length > 0) view['attachments'] = docs;
      if (imageCount > 0) view['imageAttachmentCount'] = imageCount;
    }
    return view;
  });
  ctx.audit.append({
    tool: 'get_observations',
    ...(access.via === 'consent' ? { consentId: access.consents.map((c) => c.id).join(',') } : {}),
    recordIds: records.map((r) => r.id),
    redactionStats: { observations: records.length, names: masked },
  });
  return { count: observations.length, observations, notice: SENSITIVE_NOTICE };
}
function checkRecordDraft(ctx, args) {
  const { identity } = resolveStudentTarget(ctx, args.studentToken);
  const query = {};
  if (args.from !== void 0) query.from = args.from;
  if (args.to !== void 0) query.to = args.to;
  const records = getObservationsForIdentity(ctx.dataDir, identity, query);
  const tokenized = records.map((o) => ({
    id: ctx.store.getToken(makeObservationIdentity(o.id), { prefix: 'obs' }),
    content: o.content,
  }));
  const rulePack = {};
  if (args.level !== void 0) rulePack.level = args.level;
  if (args.year !== void 0) rulePack.year = args.year;
  const report = checkGrounding(args.claims, tokenized, rulePack);
  ctx.audit.append({
    tool: 'check_record_draft',
    recordIds: records.map((o) => o.id),
    redactionStats: { observations: records.length },
    validatorResult: report.flaggedCount === 0 ? 'no_flags' : `flagged:${report.flaggedCount}`,
    rulePackVersion: report.rulePackVersion,
  });
  return report;
}
var ASSESSMENT_NOTICE =
  '\uC810\uC218\xB7\uC11D\uCC28\xB7\uD658\uC0B0\uC810\uC740 \uC81C\uC678\uB41C \uC9C8\uC801 \uC815\uBCF4\uC785\uB2C8\uB2E4(\uC0DD\uAE30\uBD80 \uC785\uB825 \uAE08\uC9C0 \uD56D\uBAA9). \uB3C4\uB2EC \uC218\uC900\xB7\uC131\uCDE8\uB3C4\xB7\uBA54\uBAA8\uB294 \uC11C\uC220\uD615 \uC5ED\uB7C9\xB7\uD0DC\uB3C4 \uD45C\uD604\uC758 \uADFC\uAC70\uB85C\uB9CC \uD65C\uC6A9\uD558\uACE0, \uC810\uC218/\uC11D\uCC28\uB97C \uC0DD\uAE30\uBD80\uC5D0 \uC801\uC9C0 \uB9C8\uC138\uC694. \uAD50\uC0AC \uCD5C\uC885 \uAC80\uD1A0 \uD544\uC694.';
function resolveTeachingTarget(ctx, token) {
  const { resolved, identity } = resolveStudentTarget(ctx, token);
  if (identity.kind !== 'teaching') {
    throw new UnknownTokenError(
      '\uC218\uD589\uD3C9\uAC00\xB7\uC131\uC801\uC740 \uC218\uC5C5\uBC18 \uD559\uC0DD \uD1A0\uD070\uC73C\uB85C \uC870\uD68C\uD558\uC138\uC694. list_classes \u2192 list_students(classToken) \uC758 token \uC744 \uC4F0\uC138\uC694.',
    );
  }
  return { classId: identity.classId, studentKey: identity.studentKey, resolved };
}
function getPerformanceFeedback(ctx, args) {
  const {
    classId,
    studentKey: studentKey2,
    resolved,
  } = resolveTeachingTarget(ctx, args.studentToken);
  const access = assertContentAccess({
    studentId: resolved,
    purpose: OBSERVATION_READ_PURPOSE,
    consent: ctx.consent,
    dataDir: ctx.dataDir,
  });
  const roster = rosterForIdentity(
    ctx.dataDir,
    { kind: 'teaching', classId, studentKey: studentKey2 },
    ctx.store,
  );
  const items = getRubricFeedback(
    ctx.dataDir,
    classId,
    studentKey2,
    (s) => deidentify(s, roster).text,
  );
  ctx.audit.append({
    tool: 'get_performance_feedback',
    ...(access.via === 'consent' ? { consentId: access.consents.map((c) => c.id).join(',') } : {}),
    redactionStats: { observations: items.length },
  });
  return { count: items.length, items, notice: ASSESSMENT_NOTICE };
}
function getGradeSummaryTool(ctx, args) {
  const {
    classId,
    studentKey: studentKey2,
    resolved,
  } = resolveTeachingTarget(ctx, args.studentToken);
  const access = assertContentAccess({
    studentId: resolved,
    purpose: OBSERVATION_READ_PURPOSE,
    consent: ctx.consent,
    dataDir: ctx.dataDir,
  });
  const roster = rosterForIdentity(
    ctx.dataDir,
    { kind: 'teaching', classId, studentKey: studentKey2 },
    ctx.store,
  );
  const summary = getGradeSummary(
    ctx.dataDir,
    classId,
    studentKey2,
    (s) => deidentify(s, roster).text,
  );
  ctx.audit.append({
    tool: 'get_grade_summary',
    ...(access.via === 'consent' ? { consentId: access.consents.map((c) => c.id).join(',') } : {}),
    redactionStats: { observations: summary.assessments.length },
  });
  return { ...summary, notice: ASSESSMENT_NOTICE };
}
function getRubric(ctx, args) {
  const cls = resolveClass(ctx, args.classToken);
  const rubrics = readRubrics(ctx.dataDir).rubrics.filter((r) => r.classId === cls.id);
  const views = rubrics.map((r) => ({
    rubricToken: ctx.store.getToken(makeRubricIdentity(r.id), { prefix: 'rub' }),
    title: r.title,
    criteria: [...r.criteria]
      .sort((a, b) => a.order - b.order)
      .map((c) => ({ criterion: c.name, levels: c.levels.map((l) => l.name) })),
  }));
  ctx.audit.append({ tool: 'get_rubric', redactionStats: { items: views.length } });
  return { count: views.length, rubrics: views };
}
async function setRubricGradingTool(ctx, args) {
  const { identity } = resolveStudentTarget(ctx, args.studentToken);
  if (identity.kind !== 'teaching') {
    throw new UnknownTokenError(
      '\uC218\uD589\uD3C9\uAC00 \uCC44\uC810\uC740 \uC218\uC5C5\uBC18 \uD559\uC0DD \uD1A0\uD070\uC73C\uB85C \uD558\uC138\uC694. list_classes \u2192 list_students(classToken).',
    );
  }
  if (!/^rub_/.test(args.rubricToken)) {
    throw new UnknownTokenError(
      '\uD3C9\uAC00\uD45C \uD1A0\uD070\uC774 \uC544\uB2D9\uB2C8\uB2E4(rub_). get_rubric \uC758 rubricToken \uC744 \uC4F0\uC138\uC694.',
    );
  }
  const resolved = ctx.store.resolveToken(args.rubricToken);
  if (!resolved)
    throw new UnknownTokenError(
      '\uC54C \uC218 \uC5C6\uB294 \uD3C9\uAC00\uD45C \uD1A0\uD070\uC785\uB2C8\uB2E4. get_rubric \uB85C \uD655\uC778\uD558\uC138\uC694.',
    );
  const rubricId = parseRubricIdentity(resolved);
  if (!rubricId)
    throw new UnknownTokenError(
      '\uD3C9\uAC00\uD45C \uD1A0\uD070\uC774 \uC544\uB2D9\uB2C8\uB2E4. get_rubric \uC758 rubricToken \uC744 \uC4F0\uC138\uC694.',
    );
  const input = {
    classId: identity.classId,
    studentKey: identity.studentKey,
    rubricId,
    marks: args.marks,
    ...(args.status !== void 0 ? { status: args.status } : {}),
    ...(args.overallFeedback !== void 0 ? { overallFeedback: args.overallFeedback } : {}),
    ...(args.criterionNotes !== void 0 ? { criterionNotes: args.criterionNotes } : {}),
  };
  const res = await setRubricGrading(ctx.dataDir, input);
  ctx.audit.append({
    tool: 'set_rubric_grading',
    recordIds: [res.gradingId],
    redactionStats: { observations: 1 },
  });
  return res;
}
function getRecordGuidelines(args = {}) {
  const rulePack = {};
  if (args.level !== void 0) rulePack.level = args.level;
  if (args.year !== void 0) rulePack.year = args.year;
  return recordGuidelines(rulePack);
}

// ../ssampin-ai-bridge/packages/mcp/dist/summaryTools.js
var SOON_DAYS = 3;
var YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
var GATE_NOTICE =
  '\uC77D\uAE30(\uB0B4\uC6A9 \uB178\uCD9C) \uB9C8\uC2A4\uD130 \uC2A4\uC704\uCE58\uAC00 \uAEBC\uC838 \uC788\uC5B4 \uC8FC\uAC04 \uC694\uC57D\uC744 \uC81C\uACF5\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uC324\uD540 \uC124\uC815\uC5D0\uC11C AI \uC5F0\uACB0 \uC77D\uAE30\uB97C \uCF1C\uAC70\uB098 SSAMPIN_BRIDGE_ALLOW_CONTENT=1 \uB85C \uD65C\uC131\uD654\uD558\uC138\uC694.';
var OK_NOTICE =
  '\uC9D1\uACC4 \uC218\uCE58\uC640 \uCE74\uD14C\uACE0\uB9AC\uBA85\uB9CC \uC81C\uACF5\uD569\uB2C8\uB2E4(\uD560\uC77C \uB0B4\uC6A9\xB7\uD559\uC0DD \uC2E4\uBA85 \uBBF8\uD3EC\uD568). \uD1B5\uACC4\uB294 \uC21C\uC218 \uC815\uBCF4 \uC81C\uACF5\uC774\uBA70 \uB204\uC801 \uBCF4\uC0C1\xB7\uC810\uC218\uAC00 \uC544\uB2D9\uB2C8\uB2E4.';
function pad2(n) {
  return String(n).padStart(2, '0');
}
function ymd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(base, days) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
}
function weekRange(today) {
  const backToMon = (today.getDay() + 6) % 7;
  const start = addDays(today, -backToMon);
  const end = addDays(start, 6);
  return { start: ymd(start), end: ymd(end) };
}
function bucketPriority(p) {
  return p === 'high' || p === 'medium' || p === 'low' ? p : 'none';
}
function getWeeklySummary(ctx, args = {}) {
  if (!isContentExposureEnabled(process.env, ctx.dataDir)) {
    return { available: false, notice: GATE_NOTICE };
  }
  const today =
    args.referenceDate && YMD_RE.test(args.referenceDate)
      ? parseYmd(args.referenceDate)
      : /* @__PURE__ */ new Date();
  const todayStr = ymd(today);
  const soonStr = ymd(addDays(today, SOON_DAYS));
  const range = weekRange(today);
  const todos = readTodos(ctx.dataDir);
  const roster = buildFullRoster(ctx);
  let activeTotal = 0;
  let open = 0;
  let completed = 0;
  let overdue = 0;
  let dueThisWeek = 0;
  let dueSoon = 0;
  const priority = { high: 0, medium: 0, low: 0, none: 0 };
  const catMap = /* @__PURE__ */ new Map();
  for (const t of todos) {
    const active = t.archivedAt === void 0;
    if (!active) continue;
    activeTotal += 1;
    const isOpen = effectiveTodoStatus(t) !== 'done' && !t.completed;
    if (!isOpen) {
      completed += 1;
      continue;
    }
    open += 1;
    priority[bucketPriority(t.priority)] += 1;
    const cat =
      t.category && t.category.trim() ? deidentify(t.category, roster).text : '\uBBF8\uBD84\uB958';
    catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
    if (t.dueDate !== void 0) {
      if (t.dueDate < todayStr) overdue += 1;
      if (t.dueDate >= range.start && t.dueDate <= range.end) dueThisWeek += 1;
      if (t.dueDate >= todayStr && t.dueDate <= soonStr) dueSoon += 1;
    }
  }
  const byCategory = [...catMap.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  return {
    available: true,
    notice: OK_NOTICE,
    range,
    counts: { activeTotal, open, completed, overdue, dueThisWeek, dueSoon },
    byPriority: priority,
    byCategory,
  };
}

// ../ssampin-ai-bridge/packages/mcp/dist/recordDraftTools.js
var STATUSES = /* @__PURE__ */ new Set(['draft', 'reviewing', 'confirmed']);
function asStr3(v) {
  return typeof v === 'string' && v.trim().length > 0 ? v : void 0;
}
function assertRecordWriteAllowed(ctx) {
  if (readBridgeCapability(ctx.dataDir).allowRecordWrite) return;
  throw new WriteDisabledError(
    '\uC0DD\uAE30\uBD80 \uCD08\uC548 \uC4F0\uAE30\uAC00 \uBE44\uD65C\uC131\uD654\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4. \uC324\uD540 \uC124\uC815\uC758 "AI \uC5F0\uACB0"\uC5D0\uC11C "\uC0DD\uAE30\uBD80 \uCD08\uC548 \uC4F0\uAE30 \uD5C8\uC6A9"\uC744 \uCF1C\uC138\uC694.',
  );
}
function authorKindOf(identity) {
  return identity.kind === 'homeroom' ? 'homeroom' : 'teaching';
}
function buildLeakCorpus(ctx) {
  const corpus = new Set(buildSecretCorpus(readStudents(ctx.dataDir)));
  for (const c of readTeachingClasses(ctx.dataDir).classes) {
    for (const st of c.students) {
      if (typeof st.name === 'string' && st.name.trim().length >= 2) corpus.add(st.name);
    }
  }
  return [...corpus];
}
function resolveBasisObservationIds(ctx, tokens) {
  if (!tokens || tokens.length === 0) return [];
  const ids = [];
  for (const token of tokens) {
    const resolved = ctx.store.resolveToken(token);
    const id = resolved ? parseObservationIdentity(resolved) : null;
    if (!id) {
      throw new WriteValidationError(
        '\uAD00\uCC30 \uD1A0\uD070\uC774 \uC544\uB2D9\uB2C8\uB2E4. get_observations \uC758 observationId \uB97C basisObservationTokens \uB85C \uC4F0\uC138\uC694.',
      );
    }
    ids.push(id);
  }
  return ids;
}
async function writeRecordDraft(ctx, args) {
  assertRecordWriteAllowed(ctx);
  const content = asStr3(args.content);
  if (!content) throw new WriteValidationError('content \uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.');
  const status = asStr3(args.status);
  if (status !== void 0 && !STATUSES.has(status)) {
    throw new WriteValidationError(
      'status \uB294 draft|reviewing|confirmed \uC5EC\uC57C \uD569\uB2C8\uB2E4.',
    );
  }
  const { resolved: studentRef, identity } = resolveStudentTarget(ctx, args.studentToken);
  const authorKind = authorKindOf(identity);
  const basisIds = resolveBasisObservationIds(ctx, args.basisObservationTokens);
  const observations = getObservationsForIdentity(ctx.dataDir, identity, {}).map((o) => ({
    id: o.id,
    content: o.content,
  }));
  const baseInput = {
    area: args.area,
    level: args.level,
    authorKind,
    studentRef,
    content,
    basisObservationIds: basisIds,
    observations,
    secretCorpus: buildLeakCorpus(ctx),
    ...(args.subject !== void 0 ? { subject: args.subject } : {}),
    ...(identity.kind === 'teaching' ? { classId: identity.classId } : {}),
    ...(status !== void 0 ? { status } : {}),
    ...(args.year !== void 0 ? { year: args.year } : {}),
  };
  const validation = validateRecordDraft(baseInput);
  const data = {
    area: validation.area,
    studentRef,
    content,
    byteLength: validation.byteLength,
    basisObservationIds: basisIds,
    groundingFlags: validation.flags,
    status: status ?? 'draft',
    requiresTeacherReview: true,
  };
  if (identity.kind === 'teaching') {
    data['classId'] = identity.classId;
    data['studentKey'] = identity.studentKey;
  } else {
    data['studentId'] = identity.studentId;
  }
  if (args.subject !== void 0) data['subject'] = args.subject;
  const idempotencyKey = deriveIdemKey('recordDrafts', 'create', data, args.idempotencyKey);
  const { ref, via } = await createVia(ctx, 'recordDrafts', data, idempotencyKey, () =>
    setRecordDraft(ctx.dataDir, baseInput).then((r) => ({ ref: r.draftId })),
  );
  ctx.audit.append({
    tool: 'write_record_draft',
    redactionStats: { items: 1, names: validation.flags.includes('pii_leak') ? 1 : 0 },
  });
  return {
    ok: true,
    area: validation.area,
    byteLength: validation.byteLength,
    flags: validation.flags,
    requiresTeacherReview: true,
    via,
    ref,
  };
}
var DRAFT_NOTICE =
  '\uC800\uC7A5\uB41C \uC0DD\uAE30\uBD80 \uCD08\uC548\uC785\uB2C8\uB2E4. \uB3D9\uAE09\uC0DD \uC9C1\uC811 \uC2DD\uBCC4\uC790(\uC2E4\uBA85/\uC5F0\uB77D\uCC98/\uC0DD\uC77C/\uD559\uBC88)\uB294 \uB9C8\uC2A4\uD0B9\uB418\uB098 \uB9E5\uB77D \uC7AC\uC2DD\uBCC4\uC774 \uAC00\uB2A5\uD558\uBA70, flags \uB294 \uC2B9\uC778 \uC2E0\uD638\uAC00 \uC544\uB2D9\uB2C8\uB2E4. \uCD5C\uC885 \uAE30\uC7AC \uC804 \uAD50\uC0AC\uAC00 \uADDC\uC815\xB7\uC0AC\uC2E4\uC744 \uBC18\uB4DC\uC2DC \uAC80\uD1A0\uD558\uC138\uC694(requiresTeacherReview).';
function getRecordDrafts(ctx, args) {
  assertRecordWriteAllowed(ctx);
  const { resolved: studentRef, identity } = resolveStudentTarget(ctx, args.studentToken);
  const roster = rosterForIdentity(ctx.dataDir, identity, ctx.store);
  const drafts = readRecordDrafts(ctx.dataDir)
    .records.filter((d) => d.studentRef === studentRef)
    .map((d) => {
      const view = {
        draftToken: ctx.store.getToken(makeRecordDraftIdentity(d.id), { prefix: 'rd' }),
        area: d.area,
        status: d.status,
        byteLength: d.byteLength,
        basisCount: d.basisObservationIds.length,
        flags: d.groundingFlags ?? [],
        content: deidentify(d.content, roster).text,
        requiresTeacherReview: true,
        ...(d.subject !== void 0 ? { subject: d.subject } : {}),
      };
      return view;
    });
  ctx.audit.append({ tool: 'get_record_drafts', redactionStats: { items: drafts.length } });
  return { count: drafts.length, studentToken: args.studentToken, drafts, notice: DRAFT_NOTICE };
}
var EVIDENCE_NOTICE =
  '\uAD50\uC0AC\uAC00 \uBAA8\uC740 \uC0DD\uAE30\uBD80 \uC791\uC131 \uADFC\uAC70 \uC790\uB8CC\uC785\uB2C8\uB2E4. \uB3D9\uAE09\uC0DD \uC9C1\uC811 \uC2DD\uBCC4\uC790(\uC2E4\uBA85/\uC5F0\uB77D\uCC98/\uC0DD\uC77C/\uD559\uBC88)\uB294 \uB9C8\uC2A4\uD0B9\uB418\uB098 \uB9E5\uB77D \uC7AC\uC2DD\uBCC4\uC774 \uAC00\uB2A5\uD569\uB2C8\uB2E4. \uC774 \uADFC\uAC70\uC5D0 \uAE30\uBC18\uD574 \uC601\uC5ED\uBCC4 \uCD08\uC548\uC744 \uC791\uC131\uD558\uB418(write_record_draft), \uADFC\uAC70\uC5D0 \uC5C6\uB294 \uC0AC\uC2E4\uC744 \uC9C0\uC5B4\uB0B4\uC9C0 \uB9D0\uACE0, \uCD5C\uC885 \uAE30\uC7AC \uC804 \uAD50\uC0AC\uAC00 \uADDC\uC815\xB7\uC0AC\uC2E4\uC744 \uBC18\uB4DC\uC2DC \uAC80\uD1A0\uD569\uB2C8\uB2E4(requiresTeacherReview).';
function getRecordEvidence(ctx, args) {
  assertRecordWriteAllowed(ctx);
  const areaFilter = isRecordArea(args.area) ? args.area : void 0;
  const { resolved: studentRef, identity } = resolveStudentTarget(ctx, args.studentToken);
  const roster = rosterForIdentity(ctx.dataDir, identity, ctx.store);
  const evidence = readRecordEvidence(ctx.dataDir)
    .records.filter((e) => e.studentRef === studentRef)
    .filter((e) => areaFilter === void 0 || e.areas.includes(areaFilter))
    .map((e) => {
      const view = {
        areas: e.areas,
        content: deidentify(e.content, roster).text,
        sourceType: e.sourceType ?? 'manual',
        ...(e.date !== void 0 ? { date: e.date } : {}),
      };
      return view;
    });
  ctx.audit.append({ tool: 'get_record_evidence', redactionStats: { items: evidence.length } });
  return {
    count: evidence.length,
    studentToken: args.studentToken,
    ...(areaFilter !== void 0 ? { area: areaFilter } : {}),
    evidence,
    notice: EVIDENCE_NOTICE,
  };
}

// ../ssampin-ai-bridge/packages/mcp/dist/memoTools.js
var MEMO_COLORS = /* @__PURE__ */ new Set(['yellow', 'pink', 'green', 'blue']);
var MEMO_MAX = 2e3;
function resolveMemoId(ctx, memoToken) {
  const resolved = ctx.store.resolveToken(memoToken);
  if (!resolved) {
    throw new WriteValidationError(
      '\uC54C \uC218 \uC5C6\uB294 \uBA54\uBAA8 \uD1A0\uD070\uC785\uB2C8\uB2E4. get_memos \uC758 memoToken \uC744 \uC4F0\uC138\uC694(\uBCF8\uBB38 \uC77D\uAE30 \uD1A0\uAE00 \uD544\uC694).',
    );
  }
  const id = parseMemoIdentity(resolved);
  if (!id)
    throw new WriteValidationError(
      '\uBA54\uBAA8 \uD1A0\uD070\uC774 \uC544\uB2D9\uB2C8\uB2E4. get_memos \uC758 memoToken \uC744 \uC4F0\uC138\uC694.',
    );
  return id;
}
function validateColor(color) {
  if (!MEMO_COLORS.has(color)) {
    throw new WriteValidationError(
      'color \uB294 yellow|pink|green|blue \uC5EC\uC57C \uD569\uB2C8\uB2E4.',
    );
  }
}
async function createMemo(ctx, args) {
  assertWriteAllowed(ctx);
  const content = asStr2(args.content);
  if (!content) throw new WriteValidationError('content \uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.');
  if (content.length > MEMO_MAX)
    throw new WriteValidationError(
      `content \uB294 \uCD5C\uB300 ${MEMO_MAX}\uC790\uC785\uB2C8\uB2E4(\uD604\uC7AC ${content.length}).`,
    );
  const data = { content };
  const color = asStr2(args.color);
  if (color !== void 0) {
    validateColor(color);
    data['color'] = color;
  }
  const idempotencyKey = deriveIdemKey('memos', 'create', data, args.idempotencyKey);
  const { ref, via } = await createVia(ctx, 'memos', data, idempotencyKey, () =>
    appendMemoDirect(ctx.dataDir, data, idempotencyKey),
  );
  ctx.audit.append({ tool: 'create_memo', redactionStats: { items: 1 } });
  return { ok: true, ref, via };
}
async function updateMemo(ctx, args) {
  const changes = {};
  const content = asStr2(args.content);
  if (content !== void 0) {
    if (content.length > MEMO_MAX)
      throw new WriteValidationError(
        `content \uB294 \uCD5C\uB300 ${MEMO_MAX}\uC790\uC785\uB2C8\uB2E4(\uD604\uC7AC ${content.length}).`,
      );
    changes['content'] = content;
  }
  const color = asStr2(args.color);
  if (color !== void 0) {
    validateColor(color);
    changes['color'] = color;
  }
  if (typeof args.archived === 'boolean') changes['archived'] = args.archived;
  if (Object.keys(changes).length === 0)
    throw new WriteValidationError(
      '\uBCC0\uACBD\uD560 \uD544\uB4DC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.',
    );
  assertWriteAllowed(ctx);
  const id = resolveMemoId(ctx, args.memoToken);
  const data = { id, ...changes };
  const idempotencyKey = deriveIdemKey('memos', 'update', data, args.idempotencyKey);
  const { ref } = await delegate(ctx, 'update', 'memos', idempotencyKey, data);
  ctx.audit.append({ tool: 'update_memo', redactionStats: { items: 1 } });
  return { ok: true, ref, via: 'app' };
}
async function deleteMemo(ctx, args) {
  assertWriteAllowed(ctx);
  const id = resolveMemoId(ctx, args.memoToken);
  const data = { id };
  const idempotencyKey = deriveIdemKey('memos', 'delete', data, args.idempotencyKey);
  const { ref } = await delegate(ctx, 'delete', 'memos', idempotencyKey, data);
  ctx.audit.append({ tool: 'delete_memo', redactionStats: { items: 1 } });
  return { ok: true, ref, via: 'app' };
}

// ../ssampin-ai-bridge/packages/mcp/dist/bookmarkTools.js
var NAME_MAX = 200;
var URL_MAX = 2048;
var EMOJI_MAX = 16;
function isHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
function resolveGroupId(ctx, groupToken) {
  const resolved = ctx.store.resolveToken(groupToken);
  if (!resolved) {
    throw new WriteValidationError(
      '\uC54C \uC218 \uC5C6\uB294 \uADF8\uB8F9 \uD1A0\uD070\uC785\uB2C8\uB2E4. get_bookmarks \uC758 groupToken \uC744 \uC4F0\uC138\uC694(\uBCF8\uBB38 \uC77D\uAE30 \uD1A0\uAE00 \uD544\uC694).',
    );
  }
  const id = parseBookmarkGroupIdentity(resolved);
  if (!id)
    throw new WriteValidationError(
      '\uADF8\uB8F9 \uD1A0\uD070\uC774 \uC544\uB2D9\uB2C8\uB2E4(create_bookmark \uB294 groupToken \uC774 \uD544\uC694). get_bookmarks \uC758 groupToken \uC744 \uC4F0\uC138\uC694.',
    );
  return id;
}
function resolveBookmarkId(ctx, bookmarkToken) {
  const resolved = ctx.store.resolveToken(bookmarkToken);
  if (!resolved) {
    throw new WriteValidationError(
      '\uC54C \uC218 \uC5C6\uB294 \uBD81\uB9C8\uD06C \uD1A0\uD070\uC785\uB2C8\uB2E4. get_bookmarks \uC758 bookmarkToken \uC744 \uC4F0\uC138\uC694(\uBCF8\uBB38 \uC77D\uAE30 \uD1A0\uAE00 \uD544\uC694).',
    );
  }
  const id = parseBookmarkIdentity(resolved);
  if (!id)
    throw new WriteValidationError(
      '\uBD81\uB9C8\uD06C \uD1A0\uD070\uC774 \uC544\uB2D9\uB2C8\uB2E4. get_bookmarks \uC758 bookmarkToken \uC744 \uC4F0\uC138\uC694.',
    );
  return id;
}
async function createBookmark(ctx, args) {
  assertWriteAllowed(ctx);
  const name = asStr2(args.name);
  const url = asStr2(args.url);
  if (!name) throw new WriteValidationError('name \uC774 \uD544\uC694\uD569\uB2C8\uB2E4.');
  if (name.length > NAME_MAX)
    throw new WriteValidationError(`name \uC740 \uCD5C\uB300 ${NAME_MAX}\uC790\uC785\uB2C8\uB2E4.`);
  if (!url) throw new WriteValidationError('url \uC774 \uD544\uC694\uD569\uB2C8\uB2E4.');
  if (url.length > URL_MAX)
    throw new WriteValidationError(`url \uC740 \uCD5C\uB300 ${URL_MAX}\uC790\uC785\uB2C8\uB2E4.`);
  if (!isHttpUrl(url))
    throw new WriteValidationError(
      'url \uC740 http:// \uB610\uB294 https:// \uB85C \uC2DC\uC791\uD574\uC57C \uD569\uB2C8\uB2E4.',
    );
  const groupId = resolveGroupId(ctx, args.groupToken);
  const data = { kind: 'bookmark', name, url, groupId };
  const idempotencyKey = deriveIdemKey('bookmarks', 'create', data, args.idempotencyKey);
  const { ref, via } = await createVia(ctx, 'bookmarks', data, idempotencyKey, () =>
    appendBookmarkDirect(ctx.dataDir, { name, url, groupId }, idempotencyKey),
  );
  ctx.audit.append({ tool: 'create_bookmark', redactionStats: { items: 1 } });
  return { ok: true, ref, via };
}
async function createBookmarkGroup(ctx, args) {
  assertWriteAllowed(ctx);
  const name = asStr2(args.name);
  if (!name) throw new WriteValidationError('name \uC774 \uD544\uC694\uD569\uB2C8\uB2E4.');
  if (name.length > NAME_MAX)
    throw new WriteValidationError(`name \uC740 \uCD5C\uB300 ${NAME_MAX}\uC790\uC785\uB2C8\uB2E4.`);
  const data = { kind: 'group', name };
  const emoji = asStr2(args.emoji);
  if (emoji !== void 0) {
    if (emoji.length > EMOJI_MAX)
      throw new WriteValidationError(
        `emoji \uB294 \uCD5C\uB300 ${EMOJI_MAX}\uC790\uC785\uB2C8\uB2E4.`,
      );
    data['emoji'] = emoji;
  }
  const idempotencyKey = deriveIdemKey('bookmarks', 'create', data, args.idempotencyKey);
  const { ref, via } = await createVia(ctx, 'bookmarks', data, idempotencyKey, () =>
    appendBookmarkGroupDirect(
      ctx.dataDir,
      { name, ...(emoji !== void 0 ? { emoji } : {}) },
      idempotencyKey,
    ),
  );
  ctx.audit.append({ tool: 'create_bookmark_group', redactionStats: { items: 1 } });
  return { ok: true, ref, via };
}
async function updateBookmark(ctx, args) {
  const changes = {};
  const name = asStr2(args.name);
  if (name !== void 0) {
    if (name.length > NAME_MAX)
      throw new WriteValidationError(
        `name \uC740 \uCD5C\uB300 ${NAME_MAX}\uC790\uC785\uB2C8\uB2E4.`,
      );
    changes['name'] = name;
  }
  const url = asStr2(args.url);
  if (url !== void 0) {
    if (url.length > URL_MAX)
      throw new WriteValidationError(`url \uC740 \uCD5C\uB300 ${URL_MAX}\uC790\uC785\uB2C8\uB2E4.`);
    if (!isHttpUrl(url))
      throw new WriteValidationError(
        'url \uC740 http:// \uB610\uB294 https:// \uB85C \uC2DC\uC791\uD574\uC57C \uD569\uB2C8\uB2E4.',
      );
    changes['url'] = url;
  }
  if (Object.keys(changes).length === 0)
    throw new WriteValidationError(
      '\uBCC0\uACBD\uD560 \uD544\uB4DC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.',
    );
  assertWriteAllowed(ctx);
  const id = resolveBookmarkId(ctx, args.bookmarkToken);
  const data = { id, ...changes };
  const idempotencyKey = deriveIdemKey('bookmarks', 'update', data, args.idempotencyKey);
  const { ref } = await delegate(ctx, 'update', 'bookmarks', idempotencyKey, data);
  ctx.audit.append({ tool: 'update_bookmark', redactionStats: { items: 1 } });
  return { ok: true, ref, via: 'app' };
}
async function deleteBookmark(ctx, args) {
  assertWriteAllowed(ctx);
  const id = resolveBookmarkId(ctx, args.bookmarkToken);
  const data = { id };
  const idempotencyKey = deriveIdemKey('bookmarks', 'delete', data, args.idempotencyKey);
  const { ref } = await delegate(ctx, 'delete', 'bookmarks', idempotencyKey, data);
  ctx.audit.append({ tool: 'delete_bookmark', redactionStats: { items: 1 } });
  return { ok: true, ref, via: 'app' };
}

// ../ssampin-ai-bridge/packages/mcp/dist/noteTools.js
var TITLE_MAX = 200;
var BODY_MAX = 1e5;
function resolveNotebookId(ctx, token) {
  const resolved = ctx.store.resolveToken(token);
  if (!resolved)
    throw new WriteValidationError(
      '\uC54C \uC218 \uC5C6\uB294 \uB178\uD2B8\uBD81 \uD1A0\uD070\uC785\uB2C8\uB2E4. get_notes \uC758 notebookToken \uC744 \uC4F0\uC138\uC694(\uBCF8\uBB38 \uC77D\uAE30 \uD1A0\uAE00 \uD544\uC694).',
    );
  const id = parseNotebookIdentity(resolved);
  if (!id)
    throw new WriteValidationError(
      '\uB178\uD2B8\uBD81 \uD1A0\uD070\uC774 \uC544\uB2D9\uB2C8\uB2E4. get_notes \uC758 notebookToken \uC744 \uC4F0\uC138\uC694.',
    );
  return id;
}
function resolveSectionId(ctx, token) {
  const resolved = ctx.store.resolveToken(token);
  if (!resolved)
    throw new WriteValidationError(
      '\uC54C \uC218 \uC5C6\uB294 \uC139\uC158 \uD1A0\uD070\uC785\uB2C8\uB2E4. get_notes \uC758 sectionToken \uC744 \uC4F0\uC138\uC694(\uBCF8\uBB38 \uC77D\uAE30 \uD1A0\uAE00 \uD544\uC694).',
    );
  const id = parseNoteSectionIdentity(resolved);
  if (!id)
    throw new WriteValidationError(
      '\uC139\uC158 \uD1A0\uD070\uC774 \uC544\uB2D9\uB2C8\uB2E4. get_notes \uC758 sectionToken \uC744 \uC4F0\uC138\uC694.',
    );
  return id;
}
function resolvePageId(ctx, token) {
  const resolved = ctx.store.resolveToken(token);
  if (!resolved)
    throw new WriteValidationError(
      '\uC54C \uC218 \uC5C6\uB294 \uD398\uC774\uC9C0 \uD1A0\uD070\uC785\uB2C8\uB2E4. get_notes \uC758 pageToken \uC744 \uC4F0\uC138\uC694(\uBCF8\uBB38 \uC77D\uAE30 \uD1A0\uAE00 \uD544\uC694).',
    );
  const id = parseNotePageIdentity(resolved);
  if (!id)
    throw new WriteValidationError(
      '\uD398\uC774\uC9C0 \uD1A0\uD070\uC774 \uC544\uB2D9\uB2C8\uB2E4. get_notes \uC758 pageToken \uC744 \uC4F0\uC138\uC694.',
    );
  return id;
}
async function createNotebook(ctx, args) {
  assertWriteAllowed(ctx);
  const title = asStr2(args.title);
  if (!title) throw new WriteValidationError('title \uC774 \uD544\uC694\uD569\uB2C8\uB2E4.');
  if (title.length > TITLE_MAX)
    throw new WriteValidationError(
      `title \uC740 \uCD5C\uB300 ${TITLE_MAX}\uC790\uC785\uB2C8\uB2E4.`,
    );
  const data = { kind: 'notebook', title };
  const idempotencyKey = deriveIdemKey('notes', 'create', data, args.idempotencyKey);
  const { ref } = await delegate(ctx, 'create', 'notes', idempotencyKey, data);
  ctx.audit.append({ tool: 'create_notebook', redactionStats: { items: 1 } });
  return { ok: true, ref, via: 'app' };
}
async function createNoteSection(ctx, args) {
  assertWriteAllowed(ctx);
  const title = asStr2(args.title);
  if (!title) throw new WriteValidationError('title \uC774 \uD544\uC694\uD569\uB2C8\uB2E4.');
  if (title.length > TITLE_MAX)
    throw new WriteValidationError(
      `title \uC740 \uCD5C\uB300 ${TITLE_MAX}\uC790\uC785\uB2C8\uB2E4.`,
    );
  const notebookId = resolveNotebookId(ctx, args.notebookToken);
  const data = { kind: 'section', notebookId, title };
  const idempotencyKey = deriveIdemKey('notes', 'create', data, args.idempotencyKey);
  const { ref } = await delegate(ctx, 'create', 'notes', idempotencyKey, data);
  ctx.audit.append({ tool: 'create_note_section', redactionStats: { items: 1 } });
  return { ok: true, ref, via: 'app' };
}
async function createNotePage(ctx, args) {
  assertWriteAllowed(ctx);
  const title = asStr2(args.title);
  if (!title) throw new WriteValidationError('title \uC774 \uD544\uC694\uD569\uB2C8\uB2E4.');
  if (title.length > TITLE_MAX)
    throw new WriteValidationError(
      `title \uC740 \uCD5C\uB300 ${TITLE_MAX}\uC790\uC785\uB2C8\uB2E4.`,
    );
  const sectionId = resolveSectionId(ctx, args.sectionToken);
  const data = { kind: 'page', sectionId, title };
  const body = asStr2(args.body);
  if (body !== void 0) {
    if (body.length > BODY_MAX)
      throw new WriteValidationError(
        `body \uB294 \uCD5C\uB300 ${BODY_MAX}\uC790\uC785\uB2C8\uB2E4.`,
      );
    data['body'] = body;
  }
  const idempotencyKey = deriveIdemKey('notes', 'create', data, args.idempotencyKey);
  const { ref } = await delegate(ctx, 'create', 'notes', idempotencyKey, data);
  ctx.audit.append({ tool: 'create_note_page', redactionStats: { items: 1 } });
  return { ok: true, ref, via: 'app' };
}
async function updateNotePage(ctx, args) {
  const changes = {};
  const title = asStr2(args.title);
  if (title !== void 0) {
    if (title.length > TITLE_MAX)
      throw new WriteValidationError(
        `title \uC740 \uCD5C\uB300 ${TITLE_MAX}\uC790\uC785\uB2C8\uB2E4.`,
      );
    changes['title'] = title;
  }
  if (args.body !== void 0) {
    if (typeof args.body !== 'string')
      throw new WriteValidationError(
        'body \uB294 \uBB38\uC790\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
      );
    if (args.body.length > BODY_MAX)
      throw new WriteValidationError(
        `body \uB294 \uCD5C\uB300 ${BODY_MAX}\uC790\uC785\uB2C8\uB2E4.`,
      );
    changes['body'] = args.body;
  }
  if (typeof args.pinned === 'boolean') changes['pinned'] = args.pinned;
  if (Object.keys(changes).length === 0)
    throw new WriteValidationError(
      '\uBCC0\uACBD\uD560 \uD544\uB4DC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.',
    );
  assertWriteAllowed(ctx);
  const id = resolvePageId(ctx, args.pageToken);
  const data = { id, ...changes };
  const idempotencyKey = deriveIdemKey('notes', 'update', data, args.idempotencyKey);
  const { ref } = await delegate(ctx, 'update', 'notes', idempotencyKey, data);
  ctx.audit.append({ tool: 'update_note_page', redactionStats: { items: 1 } });
  return { ok: true, ref, via: 'app' };
}
async function deleteNotePage(ctx, args) {
  assertWriteAllowed(ctx);
  const id = resolvePageId(ctx, args.pageToken);
  const data = { id };
  const idempotencyKey = deriveIdemKey('notes', 'delete', data, args.idempotencyKey);
  const { ref } = await delegate(ctx, 'delete', 'notes', idempotencyKey, data);
  ctx.audit.append({ tool: 'delete_note_page', redactionStats: { items: 1 } });
  return { ok: true, ref, via: 'app' };
}

// ../ssampin-ai-bridge/packages/mcp/dist/attendanceTools.js
var DATE_RE3 = /^\d{4}-\d{2}-\d{2}$/;
var OUT_OF_CURRENT_SCHOOL_YEAR_CONFIRM_FIELD = 'confirmOutOfCurrentSchoolYearDate';
function parseDateOnly(date) {
  const match = DATE_RE3.exec(date);
  if (match === null) return null;
  const [yearText, monthText, dayText] = [date.slice(0, 4), date.slice(5, 7), date.slice(8, 10)];
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}
function todayInKorea(now = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get('year');
  const month = values.get('month');
  const day = values.get('day');
  if (year === void 0 || month === void 0 || day === void 0) {
    return now.toISOString().slice(0, 10);
  }
  return `${year}-${month}-${day}`;
}
function academicYearForDate(date) {
  const parts = parseDateOnly(date);
  if (parts === null) return null;
  return parts.month >= 3 ? parts.year : parts.year - 1;
}
function schoolYearRangeText(schoolYear) {
  return `${schoolYear}-03-01~${schoolYear + 1}-02-28`;
}
function describeCurrentSchoolYearDateRequirement(today = todayInKorea()) {
  const schoolYear = academicYearForDate(today);
  if (schoolYear === null) {
    return '\uB0A0\uC9DC YYYY-MM-DD. \uD604\uC7AC \uD559\uB144\uB3C4 \uBC16 \uB0A0\uC9DC\uB294 \uC800\uC7A5 \uC804 \uC0AC\uC6A9\uC790 \uD655\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.';
  }
  return `\uB0A0\uC9DC YYYY-MM-DD. \uD604\uC7AC \uAE30\uC900\uC77C(${today}, Asia/Seoul)\uC758 ${schoolYear}\uD559\uB144\uB3C4(${schoolYearRangeText(schoolYear)}) \uBC16 \uB0A0\uC9DC\uB294 \uC800\uC7A5 \uC804 \uC0AC\uC6A9\uC790 \uD655\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uD655\uC778\uBC1B\uC740 \uACBD\uC6B0\uC5D0\uB9CC ${OUT_OF_CURRENT_SCHOOL_YEAR_CONFIRM_FIELD}\uC5D0 \uAC19\uC740 \uB0A0\uC9DC\uB97C \uB123\uC73C\uC138\uC694.`;
}
function outOfCurrentSchoolYearConfirmationMessage(date) {
  const schoolYear = academicYearForDate(date);
  if (schoolYear === null) {
    return 'date \uB294 \uC2E4\uC81C \uB2EC\uB825 \uB0A0\uC9DC YYYY-MM-DD \uC5EC\uC57C \uD569\uB2C8\uB2E4.';
  }
  const today = todayInKorea();
  const currentSchoolYear = academicYearForDate(today);
  if (currentSchoolYear === null) {
    return '\uD604\uC7AC \uB0A0\uC9DC\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC5B4 \uCD9C\uACB0 \uB0A0\uC9DC\uB97C \uAC80\uC99D\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.';
  }
  if (schoolYear !== currentSchoolYear) {
    return `\uC785\uB825\uD55C \uCD9C\uACB0 \uB0A0\uC9DC ${date}\uB294 \uD604\uC7AC \uAE30\uC900\uC77C(${today}, Asia/Seoul)\uC758 ${currentSchoolYear}\uD559\uB144\uB3C4(${schoolYearRangeText(currentSchoolYear)}) \uBC16\uC785\uB2C8\uB2E4. \uC800\uC7A5 \uC804 \uC0AC\uC6A9\uC790\uC5D0\uAC8C "${date} \uCD9C\uACB0\uC744 \uC815\uB9D0 \uCD94\uAC00/\uC218\uC815\uD560\uAE4C\uC694?"\uB77C\uACE0 \uD655\uC778\uBC1B\uACE0, \uD655\uC778\uBC1B\uC740 \uACBD\uC6B0\uC5D0\uB9CC ${OUT_OF_CURRENT_SCHOOL_YEAR_CONFIRM_FIELD}="${date}"\uB85C \uB2E4\uC2DC \uD638\uCD9C\uD558\uC138\uC694.`;
  }
  return null;
}
function requireCurrentSchoolYearDateConfirmation(date, confirmationDate) {
  if (academicYearForDate(date) === null) {
    throw new WriteValidationError(
      'date \uB294 \uC2E4\uC81C \uB2EC\uB825 \uB0A0\uC9DC YYYY-MM-DD \uC5EC\uC57C \uD569\uB2C8\uB2E4.',
    );
  }
  const message = outOfCurrentSchoolYearConfirmationMessage(date);
  if (message === null) return;
  if (confirmationDate === date) return;
  throw new WriteValidationError(message);
}
function appendSchoolYearConfirmation(data, confirmationDate) {
  if (confirmationDate !== void 0) {
    data[OUT_OF_CURRENT_SCHOOL_YEAR_CONFIRM_FIELD] = confirmationDate;
  }
}
var ATTENDANCE_CONTENT_GATE_NOTICE =
  '\uCD9C\uACB0 \uC0AC\uC720\xB7\uBA54\uBAA8\uB294 SSAMPIN_BRIDGE_ALLOW_CONTENT=1 \uB610\uB294 \uC324\uD540 AI \uC5F0\uACB0 \uC77D\uAE30 \uD5C8\uC6A9\uC774 \uCF1C\uC9C4 \uACBD\uC6B0\uC5D0\uB9CC \uB178\uCD9C\uB429\uB2C8\uB2E4(\uD604\uC7AC \uBBF8\uB178\uCD9C). \uB0A0\uC9DC\xB7\uAD50\uC2DC\xB7\uC0C1\uD0DC \uB4F1 \uCD5C\uC18C \uBA54\uD0C0\uB9CC \uBC18\uD658\uD588\uC2B5\uB2C8\uB2E4.';
var ATTENDANCE_CONTENT_SHOWN_NOTICE =
  '\uCD9C\uACB0 \uC0AC\uC720\xB7\uBA54\uBAA8\uAC00 \uD3EC\uD568\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4. \uD559\uC0DD \uC2E4\uBA85\xB7\uC5F0\uB77D\uCC98\xB7\uC0DD\uC77C\uC740 \uB9C8\uC2A4\uD0B9\uB418\uC9C0\uB9CC \uAC74\uAC15\xB7\uC0C1\uB2F4 \uB4F1 \uBBFC\uAC10 \uB9E5\uB77D\uC740 \uAD50\uC0AC \uAC80\uD1A0\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.';
function validateDatePeriod(date, period, confirmationDate) {
  if (!DATE_RE3.test(date))
    throw new WriteValidationError(
      'date \uB294 YYYY-MM-DD \uD615\uC2DD\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
    );
  requireCurrentSchoolYearDateConfirmation(date, confirmationDate);
  if (!Number.isInteger(period) || period < 0 || period > 20) {
    throw new WriteValidationError(
      'period \uB294 0 \uC774\uC0C1 20 \uC774\uD558\uC758 \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4.',
    );
  }
}
function classRecordMatches(record, cls) {
  if (cls.groupId !== void 0) return record.groupId === cls.groupId;
  return record.classId === cls.id && record.groupId === void 0;
}
function findClassStudent(cls, attendance) {
  const key = studentKey(attendance);
  return (
    cls.students.find((student) => studentKey(student) === key) ??
    cls.students.find((student) => student.number === attendance.number)
  );
}
function buildRoster(ctx) {
  const roster = [];
  for (const student of readStudents(ctx.dataDir)) {
    roster.push({
      token: ctx.store.getToken(student.id),
      names: [student.name],
      ...(student.studentNumber !== void 0 ? { studentNumber: student.studentNumber } : {}),
    });
  }
  for (const cls of readTeachingClasses(ctx.dataDir).classes) {
    for (const student of cls.students) {
      roster.push({
        token: ctx.store.getToken(makeTeachingStudentIdentity(cls.id, studentKey(student)), {
          prefix: 'tcs',
        }),
        names: [student.name],
      });
    }
  }
  return roster;
}
function sanitizeMemo(ctx, memo) {
  if (memo === void 0) return void 0;
  return deidentify(memo, buildRoster(ctx)).text;
}
function toStudentView(ctx, cls, attendance, includeContent) {
  const rosterStudent = findClassStudent(cls, attendance);
  if (rosterStudent === void 0) return null;
  const view = {
    studentToken: ctx.store.getToken(
      makeTeachingStudentIdentity(cls.id, studentKey(rosterStudent)),
      { prefix: 'tcs' },
    ),
    studentNumber: rosterStudent.number,
    status: attendance.status,
  };
  if (includeContent && attendance.reason !== void 0) view.reason = attendance.reason;
  const memo = includeContent ? sanitizeMemo(ctx, attendance.memo) : void 0;
  if (includeContent && memo !== void 0) view.memo = memo;
  const grade = attendance.grade ?? rosterStudent.grade;
  if (grade !== void 0) view.grade = grade;
  const classNum = attendance.classNum ?? rosterStudent.classNum;
  if (classNum !== void 0) view.classNum = classNum;
  return view;
}
function getAttendanceRecords(ctx, args = {}) {
  const includeContent = isContentExposureEnabled(process.env, ctx.dataDir);
  if (args.classToken === void 0) {
    ctx.audit.append({ tool: 'get_attendance_records', redactionStats: { items: 0 } });
    return {
      count: 0,
      contentIncluded: includeContent,
      notice: includeContent ? ATTENDANCE_CONTENT_SHOWN_NOTICE : ATTENDANCE_CONTENT_GATE_NOTICE,
      records: [],
    };
  }
  const cls = resolveClass(ctx, args.classToken);
  const records = readAttendance(ctx.dataDir)
    .records.filter((record) => classRecordMatches(record, cls))
    .filter((record) => (args.date === void 0 ? true : record.date === args.date))
    .filter((record) => (args.period === void 0 ? true : record.period === args.period))
    .map((record) => ({
      classToken: args.classToken,
      date: record.date,
      period: record.period,
      students: record.students
        .map((student) => toStudentView(ctx, cls, student, includeContent))
        .filter((student) => student !== null),
    }));
  ctx.audit.append({ tool: 'get_attendance_records', redactionStats: { items: records.length } });
  return {
    count: records.length,
    contentIncluded: includeContent,
    notice: includeContent ? ATTENDANCE_CONTENT_SHOWN_NOTICE : ATTENDANCE_CONTENT_GATE_NOTICE,
    records,
  };
}
function parseStudentAttendance(ctx, cls, input) {
  const target = resolveStudentTarget(ctx, input.studentToken);
  const identity = target.identity;
  if (identity.kind !== 'teaching') {
    throw new WriteValidationError(
      'studentToken \uC740 \uC218\uC5C5\uBC18 \uD559\uC0DD \uD1A0\uD070\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
    );
  }
  if (identity.classId !== cls.id) {
    throw new WriteValidationError(
      'studentToken \uC740 classToken \uACFC \uAC19\uC740 \uC218\uC5C5\uBC18\uC758 \uD559\uC0DD \uD1A0\uD070\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
    );
  }
  if (!isAttendanceStatus(input.status)) {
    throw new WriteValidationError(
      `status \uB294 ${ATTENDANCE_STATUSES.join('|')} \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4.`,
    );
  }
  const rosterStudent = cls.students.find(
    (student2) => studentKey(student2) === identity.studentKey,
  );
  if (rosterStudent === void 0) {
    throw new WriteValidationError(
      '\uD559\uC0DD \uD1A0\uD070\uC774 \uD604\uC7AC \uC218\uC5C5\uBC18 \uBA85\uB2E8\uC5D0 \uC5C6\uC2B5\uB2C8\uB2E4.',
    );
  }
  const student = { number: rosterStudent.number, status: input.status };
  if (input.reason !== void 0) {
    if (!isAttendanceReason(input.reason)) {
      throw new WriteValidationError(
        `reason \uC740 ${ATTENDANCE_REASONS.join('|')} \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4.`,
      );
    }
    student.reason = input.reason;
  }
  if (input.memo !== void 0) {
    if (input.memo.length > 500)
      throw new WriteValidationError('memo \uB294 \uCD5C\uB300 500\uC790\uC785\uB2C8\uB2E4.');
    student.memo = input.memo;
  }
  if (rosterStudent.grade !== void 0) student.grade = rosterStudent.grade;
  if (rosterStudent.classNum !== void 0) student.classNum = rosterStudent.classNum;
  return student;
}
function toRecordInput(ctx, args) {
  const cls = resolveClass(ctx, args.classToken);
  validateDatePeriod(args.date, args.period, args.confirmOutOfCurrentSchoolYearDate);
  const record = {
    classId: cls.id,
    date: args.date,
    period: args.period,
    students: args.students.map((student) => parseStudentAttendance(ctx, cls, student)),
  };
  if (cls.groupId !== void 0) record.groupId = cls.groupId;
  if (args.confirmOutOfCurrentSchoolYearDate !== void 0) {
    record.confirmOutOfCurrentSchoolYearDate = args.confirmOutOfCurrentSchoolYearDate;
  }
  const seen = /* @__PURE__ */ new Set();
  for (const student of record.students) {
    const key = studentKey(student);
    if (seen.has(key))
      throw new WriteValidationError(
        'students \uC5D0 \uAC19\uC740 \uD559\uC0DD\uC774 \uC911\uBCF5\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.',
      );
    seen.add(key);
  }
  return record;
}
function toDeleteInput(ctx, args) {
  const cls = resolveClass(ctx, args.classToken);
  validateDatePeriod(args.date, args.period, args.confirmOutOfCurrentSchoolYearDate);
  return cls.groupId === void 0
    ? {
        classId: cls.id,
        date: args.date,
        period: args.period,
        ...(args.confirmOutOfCurrentSchoolYearDate !== void 0
          ? { confirmOutOfCurrentSchoolYearDate: args.confirmOutOfCurrentSchoolYearDate }
          : {}),
      }
    : {
        classId: cls.id,
        groupId: cls.groupId,
        date: args.date,
        period: args.period,
        ...(args.confirmOutOfCurrentSchoolYearDate !== void 0
          ? { confirmOutOfCurrentSchoolYearDate: args.confirmOutOfCurrentSchoolYearDate }
          : {}),
      };
}
async function writeAttendanceVia(ctx, op, data, idempotencyKey, directWrite) {
  const decision = decideWritePath(ctx.dataDir);
  if (decision.path === 'loopback') {
    if (decision.control === null)
      throw new WriteConflictError(
        '\uC324\uD540 \uC81C\uC5B4 \uC11C\uBC84 \uC815\uBCF4\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
      );
    const result = await postLoopback(decision.control, {
      domain: 'attendance',
      op,
      idempotencyKey,
      data,
    });
    if (!result.ok)
      throw new WriteConflictError(
        result.error ??
          '\uC324\uD540\uC5D0 \uCD9C\uACB0 \uC4F0\uAE30\uB97C \uC801\uC6A9\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
      );
    return { ref: result.ref ?? idempotencyKey, via: 'app' };
  }
  if (decision.path === 'direct') {
    await directWrite();
    return { ref: idempotencyKey, via: 'file' };
  }
  throw new WriteConflictError(
    '\uC324\uD540 \uC0C1\uD0DC\uAC00 \uBD88\uD655\uC2E4\uD569\uB2C8\uB2E4(\uC2DC\uC791 \uC911\uC774\uAC70\uB098 \uC751\uB2F5 \uC5C6\uC74C). \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.',
  );
}
async function setAttendanceRecord(ctx, args) {
  assertWriteAllowed(ctx);
  const input = toRecordInput(ctx, args);
  const data = {
    classId: input.classId,
    date: input.date,
    period: input.period,
    students: input.students,
  };
  if (input.groupId !== void 0) data['groupId'] = input.groupId;
  appendSchoolYearConfirmation(data, input.confirmOutOfCurrentSchoolYearDate);
  const idempotencyKey = deriveIdemKey('attendance', 'create', data, args.idempotencyKey);
  const { ref, via } = await writeAttendanceVia(ctx, 'create', data, idempotencyKey, () =>
    upsertAttendanceDirect(ctx.dataDir, input, idempotencyKey),
  );
  ctx.audit.append({
    tool: 'set_attendance_record',
    redactionStats: { students: input.students.length },
  });
  return { ok: true, ref, via };
}
async function deleteAttendanceRecord(ctx, args) {
  assertWriteAllowed(ctx);
  const input = toDeleteInput(ctx, args);
  const data = {
    classId: input.classId,
    date: input.date,
    period: input.period,
  };
  if (input.groupId !== void 0) data['groupId'] = input.groupId;
  appendSchoolYearConfirmation(data, input.confirmOutOfCurrentSchoolYearDate);
  const idempotencyKey = deriveIdemKey('attendance', 'delete', data, args.idempotencyKey);
  const { ref, via } = await writeAttendanceVia(ctx, 'delete', data, idempotencyKey, () =>
    deleteAttendanceDirect(ctx.dataDir, input, idempotencyKey),
  );
  ctx.audit.append({ tool: 'delete_attendance_record', redactionStats: { items: 1 } });
  return { ok: true, ref, via };
}
function getHomeroomAttendance(ctx, args) {
  const { identity } = resolveStudentTarget(ctx, args.studentToken);
  if (identity.kind !== 'homeroom') {
    throw new WriteValidationError(
      '\uB2F4\uC784 \uD559\uC0DD \uD1A0\uD070(stu_)\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4. list_students(classToken \uBBF8\uC9C0\uC815)\uC758 token \uC744 \uC4F0\uC138\uC694.',
    );
  }
  const includeContent = isContentExposureEnabled(process.env, ctx.dataDir);
  const roster = buildRoster(ctx);
  const records = readStudentRecords(ctx.dataDir)
    .records.filter((r) => r.studentId === identity.studentId && r.category === 'attendance')
    .filter((r) => (args.from === void 0 ? true : r.date >= args.from))
    .filter((r) => (args.to === void 0 ? true : r.date <= args.to));
  const days = records.map((r) => {
    const periods = (r.attendancePeriods ?? []).map((p) => {
      const view = { period: p.period, status: p.status };
      if (includeContent && p.reason !== void 0) view.reason = p.reason;
      if (includeContent && p.memo !== void 0) view.memo = deidentify(p.memo, roster).text;
      return view;
    });
    const day = { date: r.date, subcategory: r.subcategory, periods };
    if (r.reportedToNeis !== void 0) day.reportedToNeis = r.reportedToNeis;
    if (r.documentSubmitted !== void 0) day.documentSubmitted = r.documentSubmitted;
    if (includeContent && r.content.length > 0) day.content = deidentify(r.content, roster).text;
    return day;
  });
  ctx.audit.append({ tool: 'get_homeroom_attendance', redactionStats: { items: days.length } });
  return {
    count: days.length,
    contentIncluded: includeContent,
    notice: includeContent ? ATTENDANCE_CONTENT_SHOWN_NOTICE : ATTENDANCE_CONTENT_GATE_NOTICE,
    days,
  };
}
function validateAttendanceUnit(u) {
  if (!isAttendanceStatus(u.status)) {
    throw new WriteValidationError(
      `status \uB294 ${ATTENDANCE_STATUSES.join('|')} \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4.`,
    );
  }
  if (u.reason !== void 0 && !isAttendanceReason(u.reason)) {
    throw new WriteValidationError(
      `reason \uC740 ${ATTENDANCE_REASONS.join('|')} \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4.`,
    );
  }
  if (u.memo !== void 0 && u.memo.length > 500) {
    throw new WriteValidationError('memo \uB294 \uCD5C\uB300 500\uC790\uC785\uB2C8\uB2E4.');
  }
}
async function setHomeroomAttendance(ctx, args) {
  assertWriteAllowed(ctx);
  const { identity } = resolveStudentTarget(ctx, args.studentToken);
  if (identity.kind !== 'homeroom') {
    throw new WriteValidationError(
      '\uB2F4\uC784 \uD559\uC0DD \uD1A0\uD070(stu_)\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4. list_students(classToken \uBBF8\uC9C0\uC815)\uC758 token \uC744 \uC4F0\uC138\uC694.',
    );
  }
  if (!DATE_RE3.test(args.date)) {
    throw new WriteValidationError(
      'date \uB294 YYYY-MM-DD \uD615\uC2DD\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
    );
  }
  requireCurrentSchoolYearDateConfirmation(args.date, args.confirmOutOfCurrentSchoolYearDate);
  const hasAllDay = args.allDay !== void 0;
  const hasPeriods = args.periods !== void 0;
  if (hasAllDay === hasPeriods) {
    throw new WriteValidationError(
      'allDay \uB610\uB294 periods \uC911 \uD558\uB098\uB9CC \uC9C0\uC815\uD558\uC138\uC694.',
    );
  }
  const student = readStudents(ctx.dataDir).find((s) => s.id === identity.studentId);
  if (!student || student.studentNumber === void 0) {
    throw new WriteValidationError(
      '\uB2F4\uC784 \uD559\uAE09 \uBA85\uB2E8\uC5D0\uC11C \uD559\uC0DD \uBC88\uD638(studentNumber)\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
    );
  }
  const studentEntry = { number: student.studentNumber };
  if (args.allDay !== void 0) {
    validateAttendanceUnit(args.allDay);
    studentEntry['allDay'] = args.allDay;
  } else {
    const periods = args.periods ?? [];
    if (periods.length === 0)
      throw new WriteValidationError(
        'periods \uB294 1\uAC1C \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
      );
    for (const p of periods) {
      if (!Number.isInteger(p.period) || p.period < 0 || p.period > 20) {
        throw new WriteValidationError(
          'period \uB294 0 \uC774\uC0C1 20 \uC774\uD558\uC758 \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4.',
        );
      }
      validateAttendanceUnit(p);
    }
    studentEntry['periods'] = periods;
  }
  const data = { date: args.date, students: [studentEntry] };
  appendSchoolYearConfirmation(data, args.confirmOutOfCurrentSchoolYearDate);
  const decision = decideWritePath(ctx.dataDir);
  if (decision.path !== 'loopback' || decision.control === null) {
    throw new WriteConflictError(
      '\uB2F4\uC784 \uCD9C\uACB0 \uB4F1\uB85D\uC740 \uC324\uD540 \uC571\uC774 \uCF1C\uC9C4 \uC0C1\uD0DC\uC5D0\uC11C\uB9CC \uAC00\uB2A5\uD569\uB2C8\uB2E4. \uC324\uD540\uC744 \uC2E4\uD589\uD55C \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.',
    );
  }
  const idempotencyKey = deriveIdemKey('homeroomAttendance', 'create', data, args.idempotencyKey);
  const result = await postLoopback(decision.control, {
    domain: 'homeroomAttendance',
    op: 'create',
    idempotencyKey,
    data,
  });
  if (!result.ok) {
    throw new WriteConflictError(
      result.error ??
        '\uC324\uD540\uC5D0 \uB2F4\uC784 \uCD9C\uACB0 \uC4F0\uAE30\uB97C \uC801\uC6A9\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
    );
  }
  ctx.audit.append({ tool: 'set_homeroom_attendance', redactionStats: { students: 1 } });
  return { ok: true, ref: result.ref ?? idempotencyKey, via: 'app' };
}
var NOTE_CONTENT_GATE_NOTICE =
  '\uB178\uD2B8 \uB0B4\uC6A9\uC740 SSAMPIN_BRIDGE_ALLOW_CONTENT=1 \uB610\uB294 \uC324\uD540 AI \uC5F0\uACB0 \uC77D\uAE30 \uD5C8\uC6A9\uC774 \uCF1C\uC9C4 \uACBD\uC6B0\uC5D0\uB9CC \uB178\uCD9C\uB429\uB2C8\uB2E4(\uD604\uC7AC \uBBF8\uB178\uCD9C). \uB0A0\uC9DC\xB7\uCE74\uD14C\uACE0\uB9AC\xB7\uC138\uBD80\uD56D\uBAA9 \uBA54\uD0C0\uB9CC \uBC18\uD658\uD588\uC2B5\uB2C8\uB2E4.';
var NOTE_CONTENT_SHOWN_NOTICE =
  '\uB178\uD2B8 \uB0B4\uC6A9\uC774 \uD3EC\uD568\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4. \uD559\uC0DD \uC2E4\uBA85\xB7\uC5F0\uB77D\uCC98\xB7\uC0DD\uC77C\uC740 \uB9C8\uC2A4\uD0B9\uB418\uC9C0\uB9CC \uC0C1\uB2F4\xB7\uC0DD\uD65C \uB4F1 \uBBFC\uAC10 \uB9E5\uB77D\uC740 \uAD50\uC0AC \uAC80\uD1A0\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.';
var NOTE_CONTENT_MAX = 2e3;
function getHomeroomNotes(ctx, args) {
  const { identity } = resolveStudentTarget(ctx, args.studentToken);
  if (identity.kind !== 'homeroom') {
    throw new WriteValidationError(
      '\uB2F4\uC784 \uD559\uC0DD \uD1A0\uD070(stu_)\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4. list_students(classToken \uBBF8\uC9C0\uC815)\uC758 token \uC744 \uC4F0\uC138\uC694.',
    );
  }
  const includeContent = isContentExposureEnabled(process.env, ctx.dataDir);
  const roster = buildRoster(ctx);
  const records = readStudentRecords(ctx.dataDir)
    .records.filter((r) => r.studentId === identity.studentId && r.category !== 'attendance')
    .filter((r) => (args.from === void 0 ? true : r.date >= args.from))
    .filter((r) => (args.to === void 0 ? true : r.date <= args.to));
  const notes = records.map((r) => {
    const note = {
      date: r.date,
      categoryId: r.category,
      subcategory: r.subcategory,
    };
    if (r.tags && r.tags.length > 0) note.tags = [...r.tags];
    if (includeContent && r.content.length > 0) note.content = deidentify(r.content, roster).text;
    return note;
  });
  ctx.audit.append({ tool: 'get_homeroom_notes', redactionStats: { items: notes.length } });
  return {
    count: notes.length,
    contentIncluded: includeContent,
    notice: includeContent ? NOTE_CONTENT_SHOWN_NOTICE : NOTE_CONTENT_GATE_NOTICE,
    notes,
  };
}
async function setHomeroomNote(ctx, args) {
  assertWriteAllowed(ctx);
  const { identity } = resolveStudentTarget(ctx, args.studentToken);
  if (identity.kind !== 'homeroom') {
    throw new WriteValidationError(
      '\uB2F4\uC784 \uD559\uC0DD \uD1A0\uD070(stu_)\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4. list_students(classToken \uBBF8\uC9C0\uC815)\uC758 token \uC744 \uC4F0\uC138\uC694.',
    );
  }
  if (typeof args.content !== 'string' || args.content.trim().length === 0) {
    throw new WriteValidationError('content \uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.');
  }
  if (args.content.length > NOTE_CONTENT_MAX) {
    throw new WriteValidationError(
      `content \uB294 \uCD5C\uB300 ${NOTE_CONTENT_MAX}\uC790\uC785\uB2C8\uB2E4.`,
    );
  }
  if (typeof args.categoryId !== 'string' || args.categoryId.trim().length === 0) {
    throw new WriteValidationError('categoryId \uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.');
  }
  if (args.categoryId === 'attendance') {
    throw new WriteValidationError(
      '\uCD9C\uACB0 \uCE74\uD14C\uACE0\uB9AC\uC5D0\uB294 \uB178\uD2B8\uB97C \uC4F8 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uCD9C\uACB0\uC740 set_homeroom_attendance \uB97C \uC4F0\uC138\uC694.',
    );
  }
  if (typeof args.subcategory !== 'string' || args.subcategory.trim().length === 0) {
    throw new WriteValidationError(
      'subcategory(\uC138\uBD80\uD56D\uBAA9)\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.',
    );
  }
  if (args.date !== void 0 && !DATE_RE3.test(args.date)) {
    throw new WriteValidationError(
      'date \uB294 YYYY-MM-DD \uD615\uC2DD\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.',
    );
  }
  const data = {
    studentId: identity.studentId,
    categoryId: args.categoryId,
    subcategory: args.subcategory,
    content: args.content,
  };
  if (args.date !== void 0) data['date'] = args.date;
  const decision = decideWritePath(ctx.dataDir);
  if (decision.path !== 'loopback' || decision.control === null) {
    throw new WriteConflictError(
      '\uB2F4\uC784 \uB178\uD2B8 \uB4F1\uB85D\uC740 \uC324\uD540 \uC571\uC774 \uCF1C\uC9C4 \uC0C1\uD0DC\uC5D0\uC11C\uB9CC \uAC00\uB2A5\uD569\uB2C8\uB2E4. \uC324\uD540\uC744 \uC2E4\uD589\uD55C \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.',
    );
  }
  const idempotencyKey = deriveIdemKey('recordNote', 'create', data, args.idempotencyKey);
  const result = await postLoopback(decision.control, {
    domain: 'recordNote',
    op: 'create',
    idempotencyKey,
    data,
  });
  if (!result.ok) {
    throw new WriteConflictError(
      result.error ??
        '\uC324\uD540\uC5D0 \uB2F4\uC784 \uB178\uD2B8 \uC4F0\uAE30\uB97C \uC801\uC6A9\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
    );
  }
  ctx.audit.append({ tool: 'set_homeroom_note', redactionStats: { items: 1 } });
  return { ok: true, ref: result.ref ?? idempotencyKey, via: 'app' };
}

// ../ssampin-ai-bridge/packages/mcp/dist/server.js
async function runTool(label, produce) {
  try {
    const value = await produce();
    return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
  } catch (err) {
    process.stderr
      .write(`[ssampin-mcp] tool '${label}' \uC2E4\uD328: ${err instanceof Error ? err.name : 'Error'}
`);
    const known =
      err instanceof ContentExposureDisabledError ||
      err instanceof WriteConflictError ||
      err instanceof WriteDisabledError ||
      err instanceof WriteValidationError;
    const text = known
      ? err.message
      : '\uB3C4\uAD6C \uC2E4\uD589 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.';
    return { content: [{ type: 'text', text }], isError: true };
  }
}
function createSsampinMcpServer(opts = {}) {
  const ctx = createContext(opts.dataDir);
  const server = new McpServer({ name: 'ssampin-ai-bridge', version: '0.0.0' });
  const attendanceDateDescription = describeCurrentSchoolYearDateRequirement();
  const attendanceDateConfirmationDescription = `\uD604\uC7AC \uD559\uB144\uB3C4 \uBC16 \uCD9C\uACB0 \uB0A0\uC9DC\uB97C \uC0AC\uC6A9\uC790\uC5D0\uAC8C \uBA85\uC2DC \uD655\uC778\uBC1B\uC740 \uACBD\uC6B0\uC5D0\uB9CC date\uC640 \uAC19\uC740 YYYY-MM-DD \uAC12\uC744 \uB123\uC2B5\uB2C8\uB2E4. \uD544\uB4DC\uBA85: ${OUT_OF_CURRENT_SCHOOL_YEAR_CONFIRM_FIELD}`;
  server.registerTool(
    'list_classes',
    {
      title: '\uC218\uC5C5\uBC18(\uAD50\uACFC\uBC18) \uBAA9\uB85D',
      description:
        '\uB2F4\uC784 \uD559\uAE09 \uC678\uC5D0 \uAD50\uC0AC\uAC00 \uAC00\uB974\uCE58\uB294 \uC218\uC5C5\uBC18(\uAD50\uACFC\uBC18) \uBAA9\uB85D\uC744 \uACFC\uBAA9\xB7\uBC18\uC774\uB984 + \uBD88\uD22C\uBA85 classToken \uC73C\uB85C \uBC18\uD658\uD569\uB2C8\uB2E4. \uD559\uC0DD \uC2E4\uBA85\xB7\uBA54\uBAA8\uB294 \uD3EC\uD568\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uD2B9\uC815 \uC218\uC5C5\uBC18\uC758 \uD559\uC0DD\uC744 \uBCF4\uB824\uBA74 \uC774 classToken \uC744 list_students \uC758 classToken \uC778\uC790\uB85C \uB118\uAE30\uC138\uC694. \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => runTool('list_classes', () => listClasses(ctx)),
  );
  server.registerTool(
    'list_students',
    {
      title: '\uD559\uC0DD \uBA85\uB2E8(\uBC88\uD638+\uAC00\uBA85)',
      description:
        '\uD559\uC0DD \uBA85\uB2E8\uC744 "\uBC88\uD638 + \uBD88\uD22C\uBA85 \uD1A0\uD070"\uC73C\uB85C \uBC18\uD658\uD569\uB2C8\uB2E4. classToken \uBBF8\uC9C0\uC815 \uC2DC \uB2F4\uC784 \uD559\uAE09(\uD559\uBC88), classToken \uC9C0\uC815 \uC2DC \uD574\uB2F9 \uC218\uC5C5\uBC18(\uBC18 \uB0B4 \uBC88\uD638)\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4. \uAD50\uC0AC\uAC00 \uD1A0\uD070\uC744 \uC678\uC6B8 \uC218 \uC5C6\uC73C\uBBC0\uB85C \uBA85\uB2E8\uC5D0\uB9CC \uBC88\uD638\uB97C \uB178\uCD9C\uD558\uBA70, \uC2E4\uBA85\xB7\uC5F0\uB77D\uCC98\xB7\uC0DD\uB144\uC6D4\uC77C\xB7\uBA54\uBAA8\uB294 \uD3EC\uD568\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uBC88\uD638\uB85C \uD559\uC0DD\uC744 \uCC3E\uC544 \uAC19\uC740 \uD589\uC758 token \uC73C\uB85C add_observation/get_observations \uD558\uC138\uC694. \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {
        classToken: z
          .string()
          .optional()
          .describe(
            'list_classes \uAC00 \uBC18\uD658\uD55C \uC218\uC5C5\uBC18 \uD1A0\uD070(\uBBF8\uC9C0\uC815 \uC2DC \uB2F4\uC784 \uD559\uAE09)',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool('list_students', () => listStudents(ctx, args)),
  );
  server.registerTool(
    'get_seating',
    {
      title: '\uC88C\uC11D \uBC30\uCE58(\uAC00\uBA85)',
      description:
        '\uD604\uC7AC \uC88C\uC11D \uBC30\uCE58\uB97C \uD559\uC0DD \uD1A0\uD070 \uACA9\uC790\uB85C \uBC18\uD658\uD569\uB2C8\uB2E4(\uBE48 \uC88C\uC11D\uC740 null). \uC2E4\uBA85 \uBBF8\uD3EC\uD568, \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => runTool('get_seating', () => getSeating(ctx)),
  );
  server.registerTool(
    'get_attendance_records',
    {
      title: '\uCD9C\uACB0 \uC870\uD68C',
      description:
        '\uC218\uC5C5\uBC18 \uCD9C\uACB0 \uAE30\uB85D\uC744 \uD559\uC0DD \uD1A0\uD070\uC73C\uB85C \uBC18\uD658\uD569\uB2C8\uB2E4. classToken \uC740 list_classes \uAC12\uC774\uBA70, \uBBF8\uC9C0\uC815 \uC2DC \uD604\uC7AC \uBE0C\uB9BF\uC9C0\uC5D0\uC11C\uB294 \uB2F4\uC784 \uCD9C\uACB0\uC744 \uBE48 \uBAA9\uB85D\uC73C\uB85C \uBC18\uD658\uD569\uB2C8\uB2E4. \uC2E4\uBA85\uC740 \uD3EC\uD568\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. date \uB294 YYYY-MM-DD, period \uB294 \uAD50\uC2DC\uC785\uB2C8\uB2E4. \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {
        classToken: z
          .string()
          .optional()
          .describe(
            'list_classes \uAC00 \uBC18\uD658\uD55C \uC218\uC5C5\uBC18 \uD1A0\uD070(\uBBF8\uC9C0\uC815 \uC2DC \uBE48 \uB2F4\uC784 \uCD9C\uACB0 \uBAA9\uB85D)',
          ),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('\uB0A0\uC9DC YYYY-MM-DD'),
        period: z.number().int().optional().describe('\uAD50\uC2DC'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool('get_attendance_records', () => getAttendanceRecords(ctx, args)),
  );
  server.registerTool(
    'get_homeroom_attendance',
    {
      title: '\uB2F4\uC784 \uD559\uAE09 \uCD9C\uACB0 \uC870\uD68C',
      description:
        '\uB2F4\uC784 \uD559\uAE09(\uC6B0\uB9AC \uBC18)\uC758 \uC77C\uC77C \uCD9C\uACB0\uC744 \uD559\uC0DD \uAE30\uB85D\uBD80\uC5D0\uC11C \uC870\uD68C\uD569\uB2C8\uB2E4. studentToken \uC740 list_students(classToken \uBBF8\uC9C0\uC815)\uAC00 \uBC18\uD658\uD55C \uB2F4\uC784 \uD559\uC0DD \uD1A0\uD070(stu_)\uC785\uB2C8\uB2E4. \uB0A0\uC9DC\xB7\uAD50\uC2DC\xB7\uC0C1\uD0DC\xB7\uBD84\uB958 \uBA54\uD0C0\uB294 \uD56D\uC0C1, \uC0AC\uC720(reason)\xB7\uBA54\uBAA8\xB7\uB0B4\uC6A9\uC740 \uC324\uD540 \uC124\uC815 AI \uC5F0\uACB0 \uC77D\uAE30 \uD1A0\uAE00(\uC989\uC2DC \uC801\uC6A9) \uB610\uB294 SSAMPIN_BRIDGE_ALLOW_CONTENT=1 \uC77C \uB54C\uB9CC \uD0C8\uC2DD\uBCC4 \uD6C4 \uD3EC\uD568\uB429\uB2C8\uB2E4. from/to \uB294 YYYY-MM-DD. \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {
        studentToken: z
          .string()
          .describe(
            'list_students(classToken \uBBF8\uC9C0\uC815)\uC758 \uB2F4\uC784 \uD559\uC0DD \uD1A0\uD070(stu_)',
          ),
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('\uC2DC\uC791\uC77C YYYY-MM-DD(\uD3EC\uD568)'),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('\uC885\uB8CC\uC77C YYYY-MM-DD(\uD3EC\uD568)'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool('get_homeroom_attendance', () => getHomeroomAttendance(ctx, args)),
  );
  server.registerTool(
    'get_homeroom_notes',
    {
      title:
        '\uB2F4\uC784 \uD559\uAE09 \uAE30\uB85D \uC870\uD68C(\uC0C1\uB2F4\xB7\uC0DD\uD65C \uB4F1)',
      description:
        '\uB2F4\uC784 \uD559\uAE09(\uC6B0\uB9AC \uBC18) \uD559\uC0DD\uC758 \uC77C\uC77C \uAE30\uB85D(\uC0C1\uB2F4\xB7\uC0DD\uD65C\xB7\uAE30\uD0C0 \u2014 \uCD9C\uACB0 \uC81C\uC678)\uC744 \uD559\uC0DD \uAE30\uB85D\uBD80\uC5D0\uC11C \uC870\uD68C\uD569\uB2C8\uB2E4. studentToken \uC740 list_students(classToken \uBBF8\uC9C0\uC815)\uAC00 \uBC18\uD658\uD55C \uB2F4\uC784 \uD559\uC0DD \uD1A0\uD070(stu_)\uC785\uB2C8\uB2E4. \uB0A0\uC9DC\xB7\uCE74\uD14C\uACE0\uB9AC\xB7\uC138\uBD80\uD56D\uBAA9 \uBA54\uD0C0\uB294 \uD56D\uC0C1, \uB0B4\uC6A9(content)\uC740 \uC324\uD540 \uC124\uC815 AI \uC5F0\uACB0 \uC77D\uAE30 \uD1A0\uAE00(\uC989\uC2DC \uC801\uC6A9) \uB610\uB294 SSAMPIN_BRIDGE_ALLOW_CONTENT=1 \uC77C \uB54C\uB9CC \uD0C8\uC2DD\uBCC4 \uD6C4 \uD3EC\uD568\uB429\uB2C8\uB2E4. from/to \uB294 YYYY-MM-DD. \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {
        studentToken: z
          .string()
          .describe(
            'list_students(classToken \uBBF8\uC9C0\uC815)\uC758 \uB2F4\uC784 \uD559\uC0DD \uD1A0\uD070(stu_)',
          ),
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('\uC2DC\uC791\uC77C YYYY-MM-DD(\uD3EC\uD568)'),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('\uC885\uB8CC\uC77C YYYY-MM-DD(\uD3EC\uD568)'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool('get_homeroom_notes', () => getHomeroomNotes(ctx, args)),
  );
  server.registerTool(
    'get_meals',
    {
      title: '\uAE09\uC2DD \uC2DD\uB2E8(\uBA54\uB274\xB7\uC54C\uB808\uB974\uAE30)',
      description:
        '\uC218\uB3D9 \uC785\uB825 \uAE09\uC2DD \uC2DD\uB2E8\uC744 \uB0A0\uC9DC\xB7\uB07C\uB2C8\uBCC4 \uBA54\uB274\uC640 \uC54C\uB808\uB974\uAE30 \uCF54\uB4DC\uB85C \uBC18\uD658\uD569\uB2C8\uB2E4. \uD559\uC0DD \uAC1C\uC778\uC815\uBCF4\uB294 \uD3EC\uD568\uD558\uC9C0 \uC54A\uC73C\uBA70(\uBA54\uB274 \uC815\uBCF4\uB9CC), \uB3D9\uC758\xB7\uAC8C\uC774\uD2B8 \uC5C6\uC774 \uC77D\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4. from/to \uB294 YYYYMMDD(8\uC790\uB9AC). \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {
        from: z
          .string()
          .regex(/^\d{8}$/)
          .optional()
          .describe('\uC2DC\uC791\uC77C YYYYMMDD(\uD3EC\uD568)'),
        to: z
          .string()
          .regex(/^\d{8}$/)
          .optional()
          .describe('\uC885\uB8CC\uC77C YYYYMMDD(\uD3EC\uD568)'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool('get_meals', () => getMeals(ctx, args)),
  );
  server.registerTool(
    'get_events',
    {
      title: '\uD559\uC0AC\xB7\uD559\uAE09 \uC77C\uC815',
      description:
        '\uC77C\uC815\uC744 \uB0A0\uC9DC\xB7\uAD50\uC2DC\xB7\uCE74\uD14C\uACE0\uB9AC \uB4F1 \uBE44\uC2DD\uBCC4 \uBA54\uD0C0\uB85C \uBC18\uD658\uD569\uB2C8\uB2E4. \uC81C\uBAA9\xB7\uC124\uBA85\xB7\uC7A5\uC18C \uB4F1 \uC790\uC720\uC11C\uC220\uC740 \uC324\uD540 \uC124\uC815 AI \uC5F0\uACB0\uC5D0\uC11C \uC77D\uAE30\uB97C \uCF1C\uAC70\uB098(\uC989\uC2DC \uC801\uC6A9) SSAMPIN_BRIDGE_ALLOW_CONTENT=1 \uB9C8\uC2A4\uD130 \uC2A4\uC704\uCE58\uAC00 \uCF1C\uC9C4 \uACBD\uC6B0\uC5D0\uB9CC \uD559\uC0DD \uC2E4\uBA85 \uD0C8\uC2DD\uBCC4 \uD6C4 \uD3EC\uD568\uB429\uB2C8\uB2E4(\uB9E5\uB77D \uC7AC\uC2DD\uBCC4 \uAC00\uB2A5 \u2014 \uAD50\uC0AC \uAC80\uD1A0 \uD544\uC694). from/to \uB294 YYYY-MM-DD. \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('\uC2DC\uC791\uC77C YYYY-MM-DD(\uD3EC\uD568)'),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('\uC885\uB8CC\uC77C YYYY-MM-DD(\uD3EC\uD568)'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool('get_events', () => getEvents(ctx, args)),
  );
  server.registerTool(
    'get_ddays',
    {
      title: '\uB514\uB370\uC774(D-Day) \uBAA9\uB85D',
      description:
        '\uB514\uB370\uC774 \uD56D\uBAA9\uC744 \uBAA9\uD45C\uC77C\xB7\uC774\uBAA8\uC9C0\xB7\uC0C9\uC0C1\uC73C\uB85C \uBC18\uD658\uD569\uB2C8\uB2E4. \uC81C\uBAA9(\uC790\uC720\uC11C\uC220)\uC740 \uC324\uD540 \uC124\uC815 AI \uC5F0\uACB0 \uC77D\uAE30 \uD1A0\uAE00(\uC989\uC2DC \uC801\uC6A9) \uB610\uB294 SSAMPIN_BRIDGE_ALLOW_CONTENT=1 \uC77C \uB54C\uB9CC \uD0C8\uC2DD\uBCC4 \uD6C4 \uD3EC\uD568\uB429\uB2C8\uB2E4. \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => runTool('get_ddays', () => getDdays(ctx)),
  );
  server.registerTool(
    'get_todos',
    {
      title: '\uD560\uC77C(To-do) \uBAA9\uB85D',
      description:
        '\uD560\uC77C\uC744 \uC0C1\uD0DC\xB7\uB9C8\uAC10\uC77C\xB7\uC6B0\uC120\uC21C\uC704\xB7\uCE74\uD14C\uACE0\uB9AC \uB4F1 \uBE44\uC2DD\uBCC4 \uBA54\uD0C0\uB85C \uBC18\uD658\uD569\uB2C8\uB2E4. \uD560\uC77C \uB0B4\uC6A9(text)\xB7\uBA54\uBAA8(notes)\uB294 \uC324\uD540 \uC124\uC815 AI \uC5F0\uACB0\uC5D0\uC11C \uC77D\uAE30\uB97C \uCF1C\uAC70\uB098(\uC989\uC2DC \uC801\uC6A9) SSAMPIN_BRIDGE_ALLOW_CONTENT=1 \uB9C8\uC2A4\uD130 \uC2A4\uC704\uCE58\uAC00 \uCF1C\uC9C4 \uACBD\uC6B0\uC5D0\uB9CC \uD559\uC0DD \uC2E4\uBA85 \uD0C8\uC2DD\uBCC4 \uD6C4 \uD3EC\uD568\uB429\uB2C8\uB2E4. status(todo|inProgress|done)\uB85C \uC0C1\uD0DC \uD544\uD130, dueBefore(YYYY-MM-DD)\uB85C \uB9C8\uAC10 \uC784\uBC15 \uD544\uD130. \uC544\uCE74\uC774\uBE0C \uD56D\uBAA9\uC740 \uAE30\uBCF8 \uC81C\uC678. \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {
        status: z
          .enum(['todo', 'inProgress', 'done'])
          .optional()
          .describe('\uC0C1\uD0DC \uD544\uD130'),
        dueBefore: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('\uC774 \uB0A0\uC9DC \uC774\uC804(\uD3EC\uD568) \uB9C8\uAC10\uB9CC'),
        includeArchived: z
          .boolean()
          .optional()
          .describe('\uC544\uCE74\uC774\uBE0C \uD3EC\uD568(\uAE30\uBCF8 false)'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool('get_todos', () => getTodos(ctx, args)),
  );
  server.registerTool(
    'get_weekly_summary',
    {
      title: '\uC774\uBC88 \uC8FC \uD560\uC77C \uC694\uC57D(\uC9D1\uACC4)',
      description:
        '\uD560\uC77C\uC744 \uC9D1\uACC4 \uC218\uCE58\uB85C\uB9CC \uC694\uC57D\uD569\uB2C8\uB2E4(\uC5F4\uB9BC/\uC644\uB8CC/\uC9C0\uB09C \uB9C8\uAC10/\uC774\uBC88 \uC8FC \uB9C8\uAC10/\uB9C8\uAC10 \uC784\uBC15 + \uC6B0\uC120\uC21C\uC704\xB7\uCE74\uD14C\uACE0\uB9AC \uBD84\uD3EC). \uD560\uC77C \uB0B4\uC6A9\xB7\uD559\uC0DD \uC2E4\uBA85\xB7\uC790\uC720\uC11C\uC220\uC740 \uD3EC\uD568\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uC77D\uAE30(\uB0B4\uC6A9 \uB178\uCD9C) \uB9C8\uC2A4\uD130 \uC2A4\uC704\uCE58\uAC00 \uCF1C\uC9C4 \uACBD\uC6B0\uC5D0\uB9CC \uB3D9\uC791\uD558\uBA70, \uAEBC\uC838 \uC788\uC73C\uBA74 \uC9D1\uACC4\uB3C4 \uBC18\uD658\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4(fail-closed). referenceDate(YYYY-MM-DD)\uB85C \uAE30\uC900\uC77C\uC744 \uC9C0\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4(\uBBF8\uC9C0\uC815 \uC2DC \uC624\uB298). \uD1B5\uACC4\uB294 \uC21C\uC218 \uC815\uBCF4 \uC81C\uACF5\uC785\uB2C8\uB2E4. \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {
        referenceDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('\uAE30\uC900\uC77C(YYYY-MM-DD, \uBBF8\uC9C0\uC815 \uC2DC \uC624\uB298)'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool('get_weekly_summary', () => getWeeklySummary(ctx, args)),
  );
  server.registerTool(
    'get_schedule',
    {
      title: '\uC2DC\uAC04\uD45C\xB7\uC77C\uACFC',
      description:
        '\uC2DC\uAC04\uD45C\uB97C \uC885\uB958\uBCC4\uB85C \uBC18\uD658\uD569\uB2C8\uB2E4. kind=class(\uC6B0\uB9AC \uBC18 \uC2DC\uAC04\uD45C: \uC694\uC77C\xB7\uAD50\uC2DC\xB7\uACFC\uBAA9\xB7\uAD50\uC0AC), teacher(\uB0B4 \uC2DC\uAC04\uD45C: \uC694\uC77C\xB7\uAD50\uC2DC\xB7\uACFC\uBAA9\xB7\uAD50\uC2E4), overrides(\uBCC0\uB3D9 \uC2DC\uAC04\uD45C: \uB0A0\uC9DC\xB7\uAD50\uC2DC\xB7\uACFC\uBAA9\xB7\uC885\uB958\xB7\uBCF4\uAC15\uAD50\uC0AC). class/teacher \uB294 \uAC8C\uC774\uD2B8 \uC5C6\uC774 \uC77D\uD788\uBA70, overrides \uC758 \uBCC0\uACBD \uC0AC\uC720(reason)\uB9CC \uC324\uD540 \uC124\uC815 AI \uC5F0\uACB0 \uC77D\uAE30 \uD1A0\uAE00(\uC989\uC2DC \uC801\uC6A9) \uB610\uB294 SSAMPIN_BRIDGE_ALLOW_CONTENT=1 \uC77C \uB54C \uD0C8\uC2DD\uBCC4 \uD6C4 \uD3EC\uD568\uB429\uB2C8\uB2E4. \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {
        kind: z
          .enum(['class', 'teacher', 'overrides'])
          .describe(
            'class=\uC6B0\uB9AC \uBC18 | teacher=\uB0B4 \uC2DC\uAC04\uD45C | overrides=\uBCC0\uB3D9',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool('get_schedule', () => getSchedule(ctx, args)),
  );
  server.registerTool(
    'get_notes',
    {
      title:
        '\uB178\uD2B8 \uAD6C\uC870(\uB178\uD2B8\uBD81\xB7\uC139\uC158\xB7\uD398\uC774\uC9C0 \uC81C\uBAA9)',
      description:
        '\uB178\uD2B8\uC758 \uAD6C\uC870(\uB178\uD2B8\uBD81\u2192\uC139\uC158\u2192\uD398\uC774\uC9C0)\uC640 \uC81C\uBAA9\xB7\uD0DC\uADF8\uB97C \uBC18\uD658\uD569\uB2C8\uB2E4. \uBCF8\uBB38\uC740 \uD3EC\uD568\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uC81C\uBAA9\xB7\uD0DC\uADF8\uB294 \uC790\uC720\uC11C\uC220\uC774\uB77C \uC324\uD540 \uC124\uC815 AI \uC5F0\uACB0\uC5D0\uC11C \uC77D\uAE30\uB97C \uCF1C\uAC70\uB098(\uC989\uC2DC \uC801\uC6A9) SSAMPIN_BRIDGE_ALLOW_CONTENT=1 \uB9C8\uC2A4\uD130 \uC2A4\uC704\uCE58\uAC00 \uCF1C\uC9C4 \uACBD\uC6B0\uC5D0\uB9CC \uD559\uC0DD \uC2E4\uBA85 \uD0C8\uC2DD\uBCC4 \uD6C4 \uB178\uCD9C\uB418\uACE0, \uAEBC\uC838 \uC788\uC73C\uBA74 \uAC1C\uC218\uB9CC \uBC18\uD658\uD569\uB2C8\uB2E4. \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => runTool('get_notes', () => getNotes(ctx)),
  );
  server.registerTool(
    'get_memos',
    {
      title: '\uD3EC\uC2A4\uD2B8\uC787 \uBA54\uBAA8',
      description:
        '\uD3EC\uC2A4\uD2B8\uC787 \uBA54\uBAA8\uB97C \uBC18\uD658\uD569\uB2C8\uB2E4(\uC544\uCE74\uC774\uBE0C \uC81C\uC678). \uBA54\uBAA8 \uBCF8\uBB38\uC740 \uC324\uD540 \uC124\uC815 AI \uC5F0\uACB0 \uC77D\uAE30 \uD1A0\uAE00(\uC989\uC2DC \uC801\uC6A9) \uB610\uB294 SSAMPIN_BRIDGE_ALLOW_CONTENT=1 \uC77C \uB54C\uB9CC \uD559\uC0DD \uC2E4\uBA85 \uD0C8\uC2DD\uBCC4 \uD6C4 \uB178\uCD9C\uB418\uACE0, \uAEBC\uC838 \uC788\uC73C\uBA74 \uAC1C\uC218\uB9CC \uBC18\uD658\uD569\uB2C8\uB2E4. \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => runTool('get_memos', () => getMemos(ctx)),
  );
  server.registerTool(
    'get_bookmarks',
    {
      title: '\uBD81\uB9C8\uD06C(\uB9C1\uD06C \uBAA8\uC74C)',
      description:
        '\uBD81\uB9C8\uD06C\uB97C \uADF8\uB8F9\uBCC4\uB85C \uBC18\uD658\uD569\uB2C8\uB2E4(\uC544\uCE74\uC774\uBE0C \uADF8\uB8F9 \uC81C\uC678). \uC774\uB984\xB7URL \uC740 \uBBFC\uAC10\uD560 \uC218 \uC788\uC5B4(URL \uC5D0 \uD1A0\uD070\xB7\uD0A4 \uD3EC\uD568 \uAC00\uB2A5) \uC324\uD540 \uC124\uC815 AI \uC5F0\uACB0 \uC77D\uAE30 \uD1A0\uAE00(\uC989\uC2DC \uC801\uC6A9) \uB610\uB294 SSAMPIN_BRIDGE_ALLOW_CONTENT=1 \uC77C \uB54C\uB9CC \uD0C8\uC2DD\uBCC4 \uD6C4 \uB178\uCD9C\uB418\uACE0, \uAEBC\uC838 \uC788\uC73C\uBA74 \uAC1C\uC218\uB9CC \uBC18\uD658\uD569\uB2C8\uB2E4. \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => runTool('get_bookmarks', () => getBookmarks(ctx)),
  );
  server.registerTool(
    'add_observation',
    {
      title: '\uAD00\uCC30\uAE30\uB85D \uC785\uB825',
      description:
        '\uD559\uC0DD \uD1A0\uD070\uC5D0 \uAD00\uCC30\uAE30\uB85D\uC744 \uCD94\uAC00(append)\uD569\uB2C8\uB2E4. \uC678\uBD80 \uC778\uC790\uB294 \uD1A0\uD070\uB9CC \uBC1B\uC2B5\uB2C8\uB2E4(\uC774\uB984 \uAE08\uC9C0). \uC4F0\uAE30\uB294 \uC324\uD540 \uC124\uC815 AI \uC5F0\uACB0\uC5D0\uC11C \uC4F0\uAE30\uB97C \uCF1C\uAC70\uB098(\uC989\uC2DC \uC801\uC6A9) SSAMPIN_BRIDGE_ALLOW_WRITE=1 \uC77C \uB54C\uB9CC \uD65C\uC131\uC774\uBA70 \uC324\uD540\uC744 \uB2EB\uC740 \uC0C1\uD0DC\uB97C \uAD8C\uC7A5\uD569\uB2C8\uB2E4.',
      inputSchema: {
        studentToken: z
          .string()
          .describe('list_students \uAC00 \uBC18\uD658\uD55C \uD559\uC0DD \uD1A0\uD070'),
        content: z
          .string()
          .min(1)
          .max(500)
          .describe('\uAD00\uCC30 \uB0B4\uC6A9(\uCD5C\uB300 500\uC790)'),
        tags: z.array(z.string()).optional(),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        idempotencyKey: z
          .string()
          .optional()
          .describe('\uC7AC\uC2DC\uB3C4 \uC911\uBCF5 \uBC29\uC9C0 \uD0A4'),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('add_observation', () => addObservation(ctx, args)),
  );
  server.registerTool(
    'get_observations',
    {
      title: '\uAD00\uCC30\uAE30\uB85D \uC870\uD68C(\uC0DD\uAE30\uBD80 \uADFC\uAC70)',
      description:
        '\uD559\uC0DD \uD1A0\uD070\uC758 \uAD00\uCC30\uAE30\uB85D\uC744 \uD0C8\uC2DD\uBCC4\uD574 \uBC18\uD658\uD569\uB2C8\uB2E4(\uC0DD\uAE30\uBD80 \uCD08\uC548 \uADFC\uAC70 \uC790\uB8CC). \uAC01 \uAE30\uB85D\uC758 observationId \uB97C \uCD08\uC548 \uBB38\uC7A5 \uADFC\uAC70\uB85C \uC778\uC6A9\uD558\uC138\uC694. \uB0B4\uC6A9 \uB178\uCD9C\uC740 \uC324\uD540 \uC124\uC815 AI \uC5F0\uACB0\uC758 \uC77D\uAE30 \uD1A0\uAE00(\uC989\uC2DC \uC801\uC6A9), \uAD50\uC0AC\uAC00 \uBD80\uC5EC\uD55C \uBC94\uC704 \uB3D9\uC758(\uD559\uC0DD\xB7\uAE30\uAC04\xB7\uBAA9\uC801\xB7\uB9CC\uB8CC), \uB610\uB294 SSAMPIN_BRIDGE_ALLOW_CONTENT=1 \uB9C8\uC2A4\uD130 \uC2A4\uC704\uCE58 \uC911 \uD558\uB098\uAC00 \uC788\uC5B4\uC57C \uD65C\uC131\uB429\uB2C8\uB2E4. \uBAA8\uB450 \uC5C6\uC73C\uBA74 \uAD50\uC0AC\uC5D0\uAC8C AI \uC5F0\uACB0 \uC77D\uAE30 \uD1A0\uAE00 \uB610\uB294 CLI \uB3D9\uC758 \uBD80\uC5EC\uB97C \uC694\uCCAD\uD558\uC138\uC694(AI \uB294 \uB3D9\uC758\uB97C \uBC1C\uAE09\uD560 \uC218 \uC5C6\uC74C). \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {
        studentToken: z
          .string()
          .describe('list_students \uAC00 \uBC18\uD658\uD55C \uD559\uC0DD \uD1A0\uD070'),
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('\uC2DC\uC791\uC77C(YYYY-MM-DD)'),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('\uC885\uB8CC\uC77C(YYYY-MM-DD)'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool('get_observations', () => getObservations(ctx, args)),
  );
  server.registerTool(
    'check_record_draft',
    {
      title: '\uC0DD\uAE30\uBD80 \uCD08\uC548 \uADFC\uAC70 \uAC80\uC99D(\uC5B4\uD718)',
      description:
        '\uC0DD\uAE30\uBD80 \uCD08\uC548\uC758 \uAC01 \uBB38\uC7A5\uC774 \uAD00\uCC30\uAE30\uB85D\uC5D0 \uC5B4\uD718\uC801\uC73C\uB85C \uADFC\uAC70\uD558\uB294\uC9C0 \uAC80\uC0AC\uD569\uB2C8\uB2E4. \uC5C6\uB294 \uD1A0\uD070 \uC778\uC6A9\xB7\uB2E4\uBB38\uC7A5\xB7\uB0B4\uC6A9 \uBD88\uC77C\uCE58 \uBB38\uC7A5\uC744 flag(supported=false)\uD569\uB2C8\uB2E4. \uC774\uAC83\uC740 "\uC2B9\uC778"\uC774 \uC544\uB2C8\uB77C \uC5B4\uD718 \uADFC\uAC70 \uAC80\uC0AC\uC774\uBA70, \uC758\uBBF8\xB7\uAE08\uC9C0\uD45C\uD604\xB7\uAE30\uC7AC\uC694\uB839 \uC801\uD569\uC131\uC740 \uD310\uB2E8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uC0DD\uAE30\uBD80\uB294 \uBC95\uC815 \uAE30\uB85D\uC774\uBBC0\uB85C flag \uBB38\uC7A5\uC740 \uC218\uC815\xB7\uC0AD\uC81C\uD558\uACE0 \uAD50\uC0AC\uAC00 \uBC18\uB4DC\uC2DC \uCD5C\uC885 \uAC80\uD1A0\uD558\uC138\uC694. claims \uC758 observationIds \uB294 get_observations \uAC00 \uC900 \uAD00\uCC30 \uD1A0\uD070\uC744 \uC4F0\uACE0, from/to \uB85C \uC791\uC131 \uBC94\uC704\uB97C \uB9DE\uCD94\uC138\uC694. \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {
        studentToken: z.string(),
        claims: z
          .array(z.object({ text: z.string(), observationIds: z.array(z.string()) }))
          .describe(
            '\uCD08\uC548 \uBB38\uC7A5(\uB2E8\uC77C \uBB38\uC7A5)\uACFC \uAC01 \uBB38\uC7A5\uC758 \uADFC\uAC70 \uAD00\uCC30 \uD1A0\uD070 \uBAA9\uB85D',
          ),
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('\uAC80\uC99D \uB300\uC0C1 \uC2DC\uC791\uC77C'),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('\uAC80\uC99D \uB300\uC0C1 \uC885\uB8CC\uC77C'),
        level: z
          .enum([
            'elementary',
            'middle',
            'high',
            '\uCD08\uB4F1\uD559\uAD50',
            '\uC911\uD559\uAD50',
            '\uACE0\uB4F1\uD559\uAD50',
          ])
          .optional()
          .describe(
            '\uD559\uAD50\uAE09 \u2014 \uD559\uAD50\uAE09\uBCC4 \uACE0\uC704\uD5D8 \uC5B4\uD718 \uC801\uC6A9(\uBBF8\uC9C0\uC815 \uC2DC \uACF5\uD1B5)',
          ),
        year: z
          .string()
          .regex(/^\d{4}$/)
          .optional()
          .describe('\uAE30\uC7AC\uC694\uB839 \uC5F0\uB3C4(\uC608: 2026)'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool('check_record_draft', () => checkRecordDraft(ctx, args)),
  );
  server.registerTool(
    'get_performance_feedback',
    {
      title: '\uC218\uD589\uD3C9\uAC00 \uC9C8\uC801 \uD53C\uB4DC\uBC31(\uC810\uC218 \uC81C\uC678)',
      description:
        '\uC218\uC5C5\uBC18 \uD559\uC0DD\uC758 \uC218\uD589\uD3C9\uAC00(\uB8E8\uBE0C\uB9AD) \uCC44\uC810\uC744 "\uB3C4\uB2EC \uC218\uC900 \uC774\uB984\xB7\uC131\uCDE8 \uC124\uBA85\xB7\uC694\uC18C \uBA54\uBAA8\xB7\uCD1D\uD3C9"\uC73C\uB85C \uBC18\uD658\uD569\uB2C8\uB2E4. \uC810\uC218\xB7\uBC30\uC810\xB7\uD569\uACC4\uB294 \uD3EC\uD568\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4(\uC0DD\uAE30\uBD80 \uC785\uB825 \uAE08\uC9C0 \uD56D\uBAA9). \uC138\uD2B9\uC758 \uC11C\uC220\uD615 \uC5ED\uB7C9\xB7\uD0DC\uB3C4 \uADFC\uAC70\uB85C\uB9CC \uD65C\uC6A9\uD558\uC138\uC694. list_students(classToken) \uAC00 \uC900 \uD559\uC0DD token \uC744 \uC4F0\uBA70, \uB3D9\uAE09\uC0DD \uC2E4\uBA85\uC740 \uD0C8\uC2DD\uBCC4\uB429\uB2C8\uB2E4. \uB0B4\uC6A9 \uB178\uCD9C \uB3D9\uC758(\uB610\uB294 \uB9C8\uC2A4\uD130 \uC2A4\uC704\uCE58) \uD544\uC694. \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {
        studentToken: z
          .string()
          .describe(
            'list_students(classToken) \uAC00 \uBC18\uD658\uD55C \uC218\uC5C5\uBC18 \uD559\uC0DD \uD1A0\uD070',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool('get_performance_feedback', () => getPerformanceFeedback(ctx, args)),
  );
  server.registerTool(
    'get_grade_summary',
    {
      title: '\uC131\uC801 \uC9C8\uC801 \uC694\uC57D(\uC810\uC218\xB7\uC11D\uCC28 \uC81C\uC678)',
      description:
        '\uC218\uC5C5\uBC18 \uD559\uC0DD\uC758 \uC131\uC801\uC744 "\uC131\uCDE8\uB3C4(A~E)\xB7\uD3C9\uAC00\uC601\uC5ED\xB7\uD3C9\uAC00\uBC29\uBC95\xB7\uC751\uC2DC\uC5EC\uBD80\xB7\uC218\uD589 \uC99D\uBE59 \uBA54\uBAA8"\uB85C \uC694\uC57D\uD574 \uBC18\uD658\uD569\uB2C8\uB2E4. \uC6D0\uC810\uC218\xB7\uD658\uC0B0\uC810\xB7\uC11D\uCC28\uB294 \uD3EC\uD568\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4(\uC0DD\uAE30\uBD80 \uC785\uB825 \uAE08\uC9C0 \uD56D\uBAA9). \uC11C\uC220\uD615 \uADFC\uAC70\uB85C\uB9CC \uD65C\uC6A9\uD558\uACE0 \uC810\uC218/\uC11D\uCC28\uB294 \uC0DD\uAE30\uBD80\uC5D0 \uC801\uC9C0 \uB9C8\uC138\uC694. list_students(classToken) \uC758 \uD559\uC0DD token \uC744 \uC4F0\uBA70 \uB0B4\uC6A9 \uB178\uCD9C \uB3D9\uC758 \uD544\uC694. \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {
        studentToken: z
          .string()
          .describe(
            'list_students(classToken) \uAC00 \uBC18\uD658\uD55C \uC218\uC5C5\uBC18 \uD559\uC0DD \uD1A0\uD070',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool('get_grade_summary', () => getGradeSummaryTool(ctx, args)),
  );
  server.registerTool(
    'get_rubric',
    {
      title: '\uC218\uD589\uD3C9\uAC00 \uD3C9\uAC00\uD45C \uAD6C\uC870',
      description:
        '\uC218\uC5C5\uBC18\uC758 \uC218\uD589\uD3C9\uAC00 \uD3C9\uAC00\uD45C(\uB8E8\uBE0C\uB9AD)\uB97C \uD3C9\uAC00\uC694\uC18C\xB7\uC218\uC900 \uC774\uB984\uC73C\uB85C \uBC18\uD658\uD569\uB2C8\uB2E4(\uBC30\uC810 \uC22B\uC790\xB7\uD559\uC0DD \uCC44\uC810 \uBBF8\uD3EC\uD568). \uCC44\uC810\uC744 \uC785\uB825\uD558\uAE30 \uC804\uC5D0 \uC774 \uB3C4\uAD6C\uB85C rubricToken\xB7\uD3C9\uAC00\uC694\uC18C\xB7\uC218\uC900 \uC774\uB984\uC744 \uD655\uC778\uD558\uC138\uC694. \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {
        classToken: z
          .string()
          .describe('list_classes \uAC00 \uBC18\uD658\uD55C \uC218\uC5C5\uBC18 \uD1A0\uD070'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool('get_rubric', () => getRubric(ctx, args)),
  );
  server.registerTool(
    'set_rubric_grading',
    {
      title: '\uC218\uD589\uD3C9\uAC00 \uCC44\uC810 \uC785\uB825(\uB3C4\uB2EC \uC218\uC900)',
      description:
        '\uC218\uC5C5\uBC18 \uD559\uC0DD\uC758 \uC218\uD589\uD3C9\uAC00 \uCC44\uC810\uC744 \uD3C9\uAC00\uC694\uC18C\uBCC4 "\uB3C4\uB2EC \uC218\uC900 \uC120\uD0DD"\uC73C\uB85C \uC800\uC7A5\uD569\uB2C8\uB2E4(\uC810\uC218\uAC00 \uC544\uB2C8\uB77C \uC218\uC900 \uC774\uB984). marks \uB294 get_rubric \uC758 \uD3C9\uAC00\uC694\uC18C\xB7\uC218\uC900 \uC774\uB984\uC744 \uC4F0\uBA70 \uAE30\uC874 \uCC44\uC810\uACFC \uBCD1\uD569\uB429\uB2C8\uB2E4. \uC4F0\uAE30\uB294 \uC324\uD540 \uC124\uC815 AI \uC5F0\uACB0\uC5D0\uC11C \uCC44\uC810 \uC4F0\uAE30\uB97C \uCF1C\uAC70\uB098(\uC989\uC2DC \uC801\uC6A9) SSAMPIN_BRIDGE_ALLOW_GRADE_WRITE=1(\uBCC4\uB3C4 \uACE0\uC704\uD5D8 \uAC8C\uC774\uD2B8)\uC77C \uB54C\uB9CC \uD65C\uC131\uC774\uBA70, \uACF5\uC2DD \uAE30\uB85D\uC774\uBBC0\uB85C \uC324\uD540\uC744 \uB2EB\uC740 \uC0C1\uD0DC\uC5D0\uC11C\uB9CC \uC4F0\uC138\uC694. \uC778\uC790\uB294 \uD1A0\uD070\xB7\uC774\uB984\uB9CC \uBC1B\uC2B5\uB2C8\uB2E4.',
      inputSchema: {
        studentToken: z
          .string()
          .describe(
            'list_students(classToken) \uAC00 \uBC18\uD658\uD55C \uC218\uC5C5\uBC18 \uD559\uC0DD \uD1A0\uD070',
          ),
        rubricToken: z
          .string()
          .describe('get_rubric \uAC00 \uBC18\uD658\uD55C \uD3C9\uAC00\uD45C \uD1A0\uD070'),
        marks: z
          .array(z.object({ criterion: z.string(), level: z.string() }))
          .describe(
            '\uD3C9\uAC00\uC694\uC18C\uBCC4 \uB3C4\uB2EC \uC218\uC900(\uC774\uB984). \uC608: [{criterion:"\uC8FC\uC7A5\uC758 \uBA85\uD655\uC131", level:"\uD0C1\uC6D4\uD568"}]',
          ),
        status: z
          .enum(['graded', 'partial', 'absent'])
          .optional()
          .describe(
            '\uBBF8\uC9C0\uC815 \uC2DC \uC790\uB3D9(\uC804 \uC694\uC18C \uCC44\uC810=graded). \uACB0\uC2DC\uB294 absent',
          ),
        overallFeedback: z.string().optional().describe('\uCD1D\uD3C9(\uC120\uD0DD)'),
        criterionNotes: z.array(z.object({ criterion: z.string(), note: z.string() })).optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('set_rubric_grading', () => setRubricGradingTool(ctx, args)),
  );
  server.registerTool(
    'get_record_guidelines',
    {
      title: '\uC0DD\uAE30\uBD80 \uC791\uC131 \uCC38\uC870 \uC6D0\uCE59',
      description:
        '\uC0DD\uAE30\uBD80(\uD559\uAD50\uC0DD\uD65C\uAE30\uB85D\uBD80) \uC791\uC131 \uC2DC \uB530\uB77C\uC57C \uD560 \uD575\uC2EC \uC6D0\uCE59 \uC694\uC57D\uACFC \uADFC\uAC70 \uCD9C\uCC98\uB97C \uBC18\uD658\uD569\uB2C8\uB2E4. level(\uCD08/\uC911/\uACE0) \uC9C0\uC815 \uC2DC \uD559\uAD50\uAE09\uBCC4 \uCD94\uAC00 \uC6D0\uCE59\uC744 \uD3EC\uD568\uD558\uBA70, \uAC01 \uC6D0\uCE59\uC740 \uADFC\uAC70(\uD6C8\uB839\xB7\uAC1C\uC815\uC548\uB0B4\xB7\uD3EC\uD138)\uB97C \uB3D9\uBC18\uD569\uB2C8\uB2E4. \uC6D0\uBB38 \uD655\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {
        level: z
          .enum([
            'elementary',
            'middle',
            'high',
            '\uCD08\uB4F1\uD559\uAD50',
            '\uC911\uD559\uAD50',
            '\uACE0\uB4F1\uD559\uAD50',
          ])
          .optional()
          .describe(
            '\uD559\uAD50\uAE09(\uBBF8\uC9C0\uC815 \uC2DC \uACF5\uD1B5 \uC6D0\uCE59\uB9CC)',
          ),
        year: z
          .string()
          .regex(/^\d{4}$/)
          .optional()
          .describe('\uAE30\uC7AC\uC694\uB839 \uC5F0\uB3C4(\uC608: 2026)'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool('get_record_guidelines', () => getRecordGuidelines(args)),
  );
  server.registerTool(
    'ssampin_create_todo',
    {
      title: '\uC324\uD540 \uD560\uC77C \uCD94\uAC00',
      description:
        '\uC324\uD540(ssampin)\uC5D0 \uD560\uC77C\uC744 \uCD94\uAC00\uD569\uB2C8\uB2E4(\uC324\uD540 \uC804\uC6A9 \u2014 \uB2E4\uB978 \uCE98\uB9B0\uB354/\uD560\uC77C \uC11C\uBE44\uC2A4 \uC544\uB2D8). \uC324\uD540\uC774 \uC2E4\uD589 \uC911\uC77C \uB54C\uB9CC \uC548\uC804\uD558\uAC8C \uC801\uC6A9\uB418\uBA70(\uC2E4\uD589 \uC911\uC774 \uC544\uB2C8\uBA74 \uAC70\uBD80), \uC4F0\uAE30\uB294 \uC324\uD540 \uC124\uC815\uC758 "AI \uC5F0\uACB0"\uC5D0\uC11C \uCF1C\uC57C \uD65C\uC131\uD654\uB429\uB2C8\uB2E4(\uB610\uB294 SSAMPIN_BRIDGE_ALLOW_WRITE=1). \uAC19\uC740 idempotencyKey \uC7AC\uC694\uCCAD\uC740 \uC911\uBCF5 \uC0DD\uC131\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.',
      inputSchema: {
        text: z.string().min(1).max(500).describe('\uD560\uC77C \uB0B4\uC6A9'),
        dueDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('\uB9C8\uAC10\uC77C YYYY-MM-DD'),
        priority: z
          .enum(['high', 'medium', 'low', 'none'])
          .optional()
          .describe('\uC6B0\uC120\uC21C\uC704'),
        category: z
          .string()
          .optional()
          .describe('\uCE74\uD14C\uACE0\uB9AC(class/admin/student/meeting/etc \uB4F1)'),
        time: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional()
          .describe('\uC2DC\uAC04 HH:mm'),
        idempotencyKey: z
          .string()
          .optional()
          .describe('\uC7AC\uC2DC\uB3C4 \uC911\uBCF5 \uBC29\uC9C0 \uD0A4'),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('ssampin_create_todo', () => createTodo(ctx, args)),
  );
  server.registerTool(
    'ssampin_create_event',
    {
      title: '\uC324\uD540 \uC77C\uC815 \uCD94\uAC00',
      description:
        '\uC324\uD540(ssampin)\uC5D0 \uC77C\uC815\uC744 \uCD94\uAC00\uD569\uB2C8\uB2E4(\uC324\uD540 \uC804\uC6A9 \u2014 Google Calendar \uB4F1 \uB2E4\uB978 \uCE98\uB9B0\uB354 \uC544\uB2D8). \uC324\uD540\uC774 \uC2E4\uD589 \uC911\uC77C \uB54C\uB9CC \uC548\uC804\uD558\uAC8C \uC801\uC6A9\uB429\uB2C8\uB2E4(\uC2E4\uD589 \uC911\uC774 \uC544\uB2C8\uBA74 \uAC70\uBD80). \uC4F0\uAE30 \uD65C\uC131\uD654 \uD544\uC694. \uAC19\uC740 idempotencyKey \uC7AC\uC694\uCCAD\uC740 \uC911\uBCF5 \uC0DD\uC131\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.',
      inputSchema: {
        title: z.string().min(1).max(200).describe('\uC77C\uC815 \uC81C\uBAA9'),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe('\uB0A0\uC9DC YYYY-MM-DD'),
        category: z.string().optional().describe('\uCE74\uD14C\uACE0\uB9AC'),
        time: z
          .string()
          .optional()
          .describe('\uC2DC\uAC04(\uC608: 09:00 \uB610\uB294 09:00 - 10:00)'),
        location: z.string().optional().describe('\uC7A5\uC18C'),
        idempotencyKey: z
          .string()
          .optional()
          .describe('\uC7AC\uC2DC\uB3C4 \uC911\uBCF5 \uBC29\uC9C0 \uD0A4'),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('ssampin_create_event', () => createEvent(ctx, args)),
  );
  server.registerTool(
    'set_attendance_record',
    {
      title: '\uCD9C\uACB0 \uB4F1\uB85D\xB7\uC218\uC815',
      description:
        '\uC218\uC5C5\uBC18 \uCD9C\uACB0 \uB808\uCF54\uB4DC\uB97C (groupId,date,period) \uB610\uB294 (classId,date,period) \uD0A4\uB85C \uD1B5\uC9F8\uB85C upsert \uD569\uB2C8\uB2E4. classToken \uACFC studentToken \uC740 list_classes/list_students(classToken) \uC5D0\uC11C \uBC1B\uC740 \uD1A0\uD070\uB9CC \uC0AC\uC6A9\uD569\uB2C8\uB2E4. \uC4F0\uAE30 \uD65C\uC131\uD654 \uD544\uC694.',
      inputSchema: {
        classToken: z
          .string()
          .describe('list_classes \uAC00 \uBC18\uD658\uD55C \uC218\uC5C5\uBC18 \uD1A0\uD070'),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe(attendanceDateDescription),
        period: z.number().int().min(0).max(20).describe('\uAD50\uC2DC'),
        confirmOutOfCurrentSchoolYearDate: z
          .string()
          .optional()
          .describe(attendanceDateConfirmationDescription),
        students: z
          .array(
            z.object({
              studentToken: z
                .string()
                .describe(
                  'list_students(classToken) \uAC00 \uBC18\uD658\uD55C \uD559\uC0DD \uD1A0\uD070',
                ),
              status: z.enum(['present', 'absent', 'late', 'earlyLeave', 'classAbsence']),
              reason: z
                .enum(['\uC9C8\uBCD1', '\uC778\uC815', '\uBBF8\uC778\uC815', '\uAE30\uD0C0'])
                .optional(),
              memo: z.string().max(500).optional(),
            }),
          )
          .describe('\uD574\uB2F9 \uAD50\uC2DC \uCD9C\uACB0 \uD559\uC0DD \uBAA9\uB85D'),
        idempotencyKey: z
          .string()
          .optional()
          .describe('\uC7AC\uC2DC\uB3C4 \uC911\uBCF5 \uBC29\uC9C0 \uD0A4'),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('set_attendance_record', () => setAttendanceRecord(ctx, args)),
  );
  server.registerTool(
    'delete_attendance_record',
    {
      title: '\uCD9C\uACB0 \uC0AD\uC81C',
      description:
        '\uC218\uC5C5\uBC18 \uCD9C\uACB0 \uB808\uCF54\uB4DC\uB97C (groupId,date,period) \uB610\uB294 (classId,date,period) \uD0A4\uB85C \uC0AD\uC81C\uD569\uB2C8\uB2E4. \uC5C6\uB294 \uB808\uCF54\uB4DC\uB294 \uC624\uB958\uAC00 \uC544\uB2C8\uB77C \uBA71\uB4F1 \uC131\uACF5\uC73C\uB85C \uCC98\uB9AC\uB429\uB2C8\uB2E4. \uC4F0\uAE30 \uD65C\uC131\uD654 \uD544\uC694.',
      inputSchema: {
        classToken: z
          .string()
          .describe('list_classes \uAC00 \uBC18\uD658\uD55C \uC218\uC5C5\uBC18 \uD1A0\uD070'),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe(attendanceDateDescription),
        period: z.number().int().min(0).max(20).describe('\uAD50\uC2DC'),
        confirmOutOfCurrentSchoolYearDate: z
          .string()
          .optional()
          .describe(attendanceDateConfirmationDescription),
        idempotencyKey: z
          .string()
          .optional()
          .describe('\uC7AC\uC2DC\uB3C4 \uC911\uBCF5 \uBC29\uC9C0 \uD0A4'),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('delete_attendance_record', () => deleteAttendanceRecord(ctx, args)),
  );
  server.registerTool(
    'set_homeroom_attendance',
    {
      title: '\uB2F4\uC784 \uD559\uAE09 \uCD9C\uACB0 \uB4F1\uB85D',
      description:
        '\uB2F4\uC784 \uD559\uAE09(\uC6B0\uB9AC \uBC18) \uD559\uC0DD\uC758 \uC77C\uC77C \uCD9C\uACB0\uC744 \uB4F1\uB85D\uD569\uB2C8\uB2E4. studentToken \uC740 \uB2F4\uC784 \uD559\uC0DD \uD1A0\uD070(stu_)\uC785\uB2C8\uB2E4. allDay \uB294 \uD558\uB8E8 \uC804\uCCB4(\uC870\uD68C+\uC815\uADDC+\uC885\uB840 \uAD50\uC2DC\uB85C \uC790\uB3D9 \uD3BC\uCE68), periods \uB294 \uD2B9\uC815 \uAD50\uC2DC(\uC870\uD68C=0, \uC815\uADDC=1~N, \uC885\uB840=9)\uB9CC \u2014 \uB458 \uC911 \uD558\uB098\uB9CC \uC9C0\uC815\uD569\uB2C8\uB2E4. \uAD50\uC678\uCCB4\uD5D8\uD559\uC2B5 \uB4F1 \uCD9C\uC11D\uC778\uC815\uC740 status=absent + reason=\uC778\uC815 + memo \uB85C \uAE30\uB85D\uD558\uC138\uC694. \uC324\uD540 \uC571\uC774 \uCF1C\uC9C4 \uC0C1\uD0DC\uC5D0\uC11C\uB9CC \uB3D9\uC791\uD558\uBA70(\uC4F0\uAE30 \uD65C\uC131\uD654 \uD544\uC694), \uBD84\uB958 \uC790\uB3D9\uACC4\uC0B0\xB7\uAD50\uACFC\uBC18 \uBBF8\uB7EC\uB9C1\uC740 \uC324\uD540\uC774 \uCC98\uB9AC\uD569\uB2C8\uB2E4.',
      inputSchema: {
        studentToken: z
          .string()
          .describe(
            'list_students(classToken \uBBF8\uC9C0\uC815)\uC758 \uB2F4\uC784 \uD559\uC0DD \uD1A0\uD070(stu_)',
          ),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe(attendanceDateDescription),
        confirmOutOfCurrentSchoolYearDate: z
          .string()
          .optional()
          .describe(attendanceDateConfirmationDescription),
        allDay: z
          .object({
            status: z.enum(['present', 'absent', 'late', 'earlyLeave', 'classAbsence']),
            reason: z
              .enum(['\uC9C8\uBCD1', '\uC778\uC815', '\uBBF8\uC778\uC815', '\uAE30\uD0C0'])
              .optional(),
            memo: z.string().max(500).optional(),
          })
          .optional()
          .describe(
            '\uD558\uB8E8 \uC804\uCCB4 \uCD9C\uACB0(\uC870\uD68C+\uC815\uADDC+\uC885\uB840\uB85C \uD3BC\uCE68). periods \uC640 \uB3D9\uC2DC \uC0AC\uC6A9 \uBD88\uAC00',
          ),
        periods: z
          .array(
            z.object({
              period: z
                .number()
                .int()
                .min(0)
                .max(20)
                .describe('\uAD50\uC2DC(\uC870\uD68C=0, \uC815\uADDC=1~N, \uC885\uB840=9)'),
              status: z.enum(['present', 'absent', 'late', 'earlyLeave', 'classAbsence']),
              reason: z
                .enum(['\uC9C8\uBCD1', '\uC778\uC815', '\uBBF8\uC778\uC815', '\uAE30\uD0C0'])
                .optional(),
              memo: z.string().max(500).optional(),
            }),
          )
          .optional()
          .describe(
            '\uD2B9\uC815 \uAD50\uC2DC\uB9CC. allDay \uC640 \uB3D9\uC2DC \uC0AC\uC6A9 \uBD88\uAC00',
          ),
        idempotencyKey: z
          .string()
          .optional()
          .describe('\uC7AC\uC2DC\uB3C4 \uC911\uBCF5 \uBC29\uC9C0 \uD0A4'),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('set_homeroom_attendance', () => setHomeroomAttendance(ctx, args)),
  );
  server.registerTool(
    'set_homeroom_note',
    {
      title:
        '\uB2F4\uC784 \uD559\uAE09 \uAE30\uB85D \uC785\uB825(\uC0C1\uB2F4\xB7\uC0DD\uD65C \uB4F1)',
      description:
        '\uB2F4\uC784 \uD559\uAE09(\uC6B0\uB9AC \uBC18) \uD559\uC0DD\uC5D0 \uB300\uD55C \uC77C\uC77C \uAE30\uB85D(\uC0C1\uB2F4\xB7\uC0DD\uD65C\xB7\uAE30\uD0C0)\uC744 \uD559\uC0DD \uAE30\uB85D\uBD80\uC5D0 \uCD94\uAC00\uD569\uB2C8\uB2E4. studentToken \uC740 \uB2F4\uC784 \uD559\uC0DD \uD1A0\uD070(stu_)\uC785\uB2C8\uB2E4. \uB0B4\uC6A9\uC5D0 \uB9DE\uB294 categoryId \uC640 subcategory(\uC138\uBD80\uD56D\uBAA9)\uB97C \uACE0\uB974\uC138\uC694 \u2014 \uAE30\uBCF8 \uCE74\uD14C\uACE0\uB9AC: counseling(\uD559\uBD80\uBAA8\uC0C1\uB2F4\xB7\uD559\uC0DD\uC0C1\uB2F4\xB7\uAD50\uC6B0\uAD00\uACC4), life(\uAC74\uAC15\xB7\uC0DD\uD65C\uC9C0\uB3C4\xB7\uD559\uC2B5\xB7\uCE6D\uCC2C), etc(\uC9C4\uB85C\xB7\uAC00\uC815\uC5F0\uB77D\xB7\uAE30\uD0C0). \uCD9C\uACB0(attendance)\uC740 \uC774 \uB3C4\uAD6C\uB85C \uC4F8 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4(set_homeroom_attendance \uC0AC\uC6A9). \uAD50\uC0AC\uAC00 \uB9CC\uB4E0 \uCEE4\uC2A4\uD140 \uCE74\uD14C\uACE0\uB9AC\uB3C4 \uC4F8 \uC218 \uC788\uACE0, categoryId/subcategory \uAC00 \uAD50\uC0AC\uC758 \uC2E4\uC81C \uCE74\uD14C\uACE0\uB9AC \uBAA9\uB85D\uACFC \uB9DE\uC9C0 \uC54A\uC73C\uBA74 \uD5C8\uC6A9 \uBAA9\uB85D\uACFC \uD568\uAED8 \uAC70\uBD80\uB429\uB2C8\uB2E4. \uAD00\uCC30\uAE30\uB85D(add_observation)\uC740 \uC218\uC5C5\uBC18 \uD559\uC0DD \uC804\uC6A9, \uC774 \uB3C4\uAD6C\uB294 \uB2F4\uC784 \uD559\uC0DD \uC804\uC6A9\uC785\uB2C8\uB2E4. \uC324\uD540 \uC571\uC774 \uCF1C\uC9C4 \uC0C1\uD0DC\uC5D0\uC11C\uB9CC \uB3D9\uC791\uD569\uB2C8\uB2E4(\uD559\uC0DD \uAE30\uB85D\uBD80 \uC6D0\uBCF8 \uBCF4\uD638 \u2014 \uC571 \uB2EB\uD798 \uC9C1\uC811\uC4F0\uAE30 \uBBF8\uC9C0\uC6D0).',
      inputSchema: {
        studentToken: z
          .string()
          .describe(
            'list_students(classToken \uBBF8\uC9C0\uC815)\uC758 \uB2F4\uC784 \uD559\uC0DD \uD1A0\uD070(stu_)',
          ),
        categoryId: z
          .string()
          .min(1)
          .describe(
            '\uCE74\uD14C\uACE0\uB9AC id(\uC608: counseling|life|etc \uB610\uB294 \uAD50\uC0AC \uCEE4\uC2A4\uD140). attendance \uB294 \uBD88\uAC00',
          ),
        subcategory: z
          .string()
          .min(1)
          .describe(
            '\uC138\uBD80\uD56D\uBAA9(\uC608: \uCE6D\uCC2C\xB7\uC0DD\uD65C\uC9C0\uB3C4\xB7\uD559\uC0DD\uC0C1\uB2F4 \uB4F1). \uD574\uB2F9 \uCE74\uD14C\uACE0\uB9AC\uC758 \uC138\uBD80\uD56D\uBAA9\uACFC \uC77C\uCE58\uD574\uC57C \uD568',
          ),
        content: z
          .string()
          .min(1)
          .max(2e3)
          .describe('\uAE30\uB85D \uB0B4\uC6A9(\uCD5C\uB300 2000\uC790)'),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('\uB0A0\uC9DC YYYY-MM-DD(\uBBF8\uC9C0\uC815 \uC2DC \uC624\uB298)'),
        idempotencyKey: z
          .string()
          .optional()
          .describe('\uC7AC\uC2DC\uB3C4 \uC911\uBCF5 \uBC29\uC9C0 \uD0A4'),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('set_homeroom_note', () => setHomeroomNote(ctx, args)),
  );
  server.registerTool(
    'write_record_draft',
    {
      title: '\uC0DD\uAE30\uBD80 \uCD08\uC548 \uC800\uC7A5(\uC601\uC5ED\uBCC4)',
      description:
        'AI \uAC00 \uC791\uC131\uD55C NEIS \uC601\uC5ED\uBCC4 \uC0DD\uAE30\uBD80 \uCD08\uC548\uC744 \uC324\uD540\uC5D0 \uC800\uC7A5\uD569\uB2C8\uB2E4(\uC0DD\uC131\uC774 \uC544\uB2C8\uB77C \uC800\uC7A5 \u2014 \uBAA8\uB4E0 \uCD08\uC548\uC740 \uAD50\uC0AC \uCD5C\uC885 \uAC80\uD1A0 \uD544\uC694 \uC0C1\uD0DC\uB85C \uC800\uC7A5\uB418\uBA70 \uC790\uB3D9 \uD655\uC815\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4). \uC4F0\uAE30\uB294 \uC324\uD540 \uC124\uC815 "AI \uC5F0\uACB0"\uC758 "\uC0DD\uAE30\uBD80 \uCD08\uC548 \uC4F0\uAE30 \uD5C8\uC6A9"(\uBCC4\uB3C4 \uACE0\uC704\uD5D8 \uD1A0\uAE00)\uC744 \uCF1C\uC57C \uD65C\uC131\uD654\uB429\uB2C8\uB2E4. studentToken \uC740 list_students \uC758 \uD1A0\uD070, area \uC640 level(\uD559\uAD50\uAE09)\uC740 \uC791\uC131\uC8FC\uCCB4\xB7\uBC14\uC774\uD2B8 \uD55C\uB3C4 \uACB0\uC18D\uC5D0 \uC4F0\uC785\uB2C8\uB2E4(\uB2F4\uC784 \uC601\uC5ED=\uB2F4\uC784 \uD559\uC0DD \uD1A0\uD070, \uACFC\uBAA9/\uB3D9\uC544\uB9AC=\uC218\uC5C5\uBC18 \uD559\uC0DD \uD1A0\uD070). \uC601\uC5ED\uBCC4 \uBC14\uC774\uD2B8 \uD55C\uB3C4(\uC9C4\uB85C 2,100B/\uADF8 \uC678 1,500B, \uD55C\uAE00 3B) \uCD08\uACFC \uC2DC \uAC70\uBD80\uB429\uB2C8\uB2E4. \uC791\uC131 \uC804 get_record_evidence \uB85C \uD574\uB2F9 \uD559\uC0DD\xB7\uC601\uC5ED\uC758 \uADFC\uAC70 \uC790\uB8CC\uB97C \uBA3C\uC800 \uC77D\uACE0 \uADF8 \uC0AC\uC2E4\uC5D0 \uAE30\uBC18\uD574 \uC791\uC131\uD558\uC138\uC694(\uADFC\uAC70\uC5D0 \uC5C6\uB294 \uB0B4\uC6A9 \uC9C0\uC5B4\uB0B4\uAE30 \uAE08\uC9C0). \uADFC\uAC70 \uAD00\uCC30\uC740 basisObservationTokens(get_observations \uC758 observationId)\uB85C \uC778\uC6A9\uD558\uC138\uC694. \uC751\uB2F5\uC758 flags \uB294 \uC2B9\uC778 \uC2E0\uD638\uAC00 \uC544\uB2D9\uB2C8\uB2E4.',
      inputSchema: {
        studentToken: z
          .string()
          .describe(
            'list_students \uAC00 \uBC18\uD658\uD55C \uD559\uC0DD \uD1A0\uD070(\uB2F4\uC784=\uD559\uBC88 \uD1A0\uD070 / \uACFC\uBAA9\xB7\uB3D9\uC544\uB9AC=\uC218\uC5C5\uBC18 \uD1A0\uD070)',
          ),
        area: z
          .enum([
            'autonomy',
            'career',
            'behavior',
            'subject',
            'individualSubject',
            'club',
            'subjectDev',
          ])
          .describe(
            '\uC601\uC5ED: autonomy=\uC790\uC728\xB7\uC790\uCE58 / career=\uC9C4\uB85C / behavior=\uD589\uB3D9\uD2B9\uC131\uBC0F\uC885\uD569\uC758\uACAC / subject=\uACFC\uBAA9\uC138\uD2B9 / individualSubject=\uAC1C\uC778\uC138\uD2B9 / club=\uB3D9\uC544\uB9AC / subjectDev=\uAD50\uACFC\uD559\uC2B5\uBC1C\uB2EC\uC0C1\uD669(\uCD08\uB4F1)',
          ),
        level: z
          .enum([
            'elementary',
            'middle',
            'high',
            '\uCD08\uB4F1\uD559\uAD50',
            '\uC911\uD559\uAD50',
            '\uACE0\uB4F1\uD559\uAD50',
          ])
          .describe(
            '\uD559\uAD50\uAE09(\uD55C\uB3C4\xB7\uC791\uC131\uC8FC\uCCB4 \uACB0\uC18D\uC5D0 \uD544\uC218)',
          ),
        subject: z
          .string()
          .optional()
          .describe('\uACFC\uBAA9\uBA85(subject/subjectDev \uC77C \uB54C)'),
        content: z
          .string()
          .min(1)
          .describe(
            '\uCD08\uC548 \uBCF8\uBB38(\uC601\uC5ED\uBCC4 \uBC14\uC774\uD2B8 \uD55C\uB3C4 \uB0B4)',
          ),
        basisObservationTokens: z
          .array(z.string())
          .optional()
          .describe(
            '\uADFC\uAC70 \uAD00\uCC30 \uD1A0\uD070(get_observations \uC758 observationId)',
          ),
        status: z
          .enum(['draft', 'reviewing', 'confirmed'])
          .optional()
          .describe('\uC0C1\uD0DC(\uBBF8\uC9C0\uC815 \uC2DC draft)'),
        year: z
          .string()
          .regex(/^\d{4}$/)
          .optional()
          .describe('\uAE30\uC7AC\uC694\uB839 \uC5F0\uB3C4(\uC608: 2026)'),
        idempotencyKey: z
          .string()
          .optional()
          .describe('\uC7AC\uC2DC\uB3C4 \uC911\uBCF5 \uBC29\uC9C0 \uD0A4'),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('write_record_draft', () => writeRecordDraft(ctx, args)),
  );
  server.registerTool(
    'get_record_drafts',
    {
      title: '\uC0DD\uAE30\uBD80 \uCD08\uC548 \uC870\uD68C(\uD559\uC0DD\uBCC4)',
      description:
        '\uD2B9\uC815 \uD559\uC0DD\uC758 \uC601\uC5ED\uBCC4 \uC0DD\uAE30\uBD80 \uCD08\uC548\uC744 \uC601\uC5ED\xB7\uC0C1\uD0DC\xB7\uBC14\uC774\uD2B8\uC218\xB7\uADFC\uAC70\uAC74\uC218\uC640 \uD0C8\uC2DD\uBCC4\uB41C \uBCF8\uBB38\uC73C\uB85C \uBC18\uD658\uD569\uB2C8\uB2E4. studentToken \uC740 list_students \uC758 \uD1A0\uD070. "\uC0DD\uAE30\uBD80 \uCD08\uC548 \uC4F0\uAE30 \uD5C8\uC6A9" \uD1A0\uAE00\uC774 \uCF1C\uC838 \uC788\uC5B4\uC57C \uC870\uD68C\uB429\uB2C8\uB2E4. \uB3D9\uAE09\uC0DD \uC9C1\uC811 \uC2DD\uBCC4\uC790\uB294 \uB9C8\uC2A4\uD0B9\uB418\uC9C0\uB9CC \uB9E5\uB77D \uC7AC\uC2DD\uBCC4\uC774 \uAC00\uB2A5\uD558\uBA70, \uBAA8\uB4E0 \uCD08\uC548\uC740 \uAD50\uC0AC \uCD5C\uC885 \uAC80\uD1A0\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.',
      inputSchema: {
        studentToken: z
          .string()
          .describe('list_students \uAC00 \uBC18\uD658\uD55C \uD559\uC0DD \uD1A0\uD070'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool('get_record_drafts', () => getRecordDrafts(ctx, args)),
  );
  server.registerTool(
    'get_record_evidence',
    {
      title:
        '\uC0DD\uAE30\uBD80 \uC791\uC131 \uADFC\uAC70 \uC790\uB8CC \uC870\uD68C(\uD559\uC0DD\uBCC4)',
      description:
        '\uD2B9\uC815 \uD559\uC0DD\uC5D0 \uB300\uD574 \uAD50\uC0AC\uAC00 \uBAA8\uC544 \uB454 "\uC0DD\uAE30\uBD80 \uC791\uC131 \uADFC\uAC70 \uC790\uB8CC"\uB97C \uC601\uC5ED\uBCC4\uB85C \uC870\uD68C\uD569\uB2C8\uB2E4. write_record_draft \uB85C \uC601\uC5ED\uBCC4 \uCD08\uC548\uC744 \uC4F0\uAE30 \uC804\uC5D0 \uC774 \uB3C4\uAD6C\uB85C \uADFC\uAC70\uB97C \uBA3C\uC800 \uC77D\uACE0, \uADFC\uAC70\uC5D0 \uC788\uB294 \uC0AC\uC2E4\uB9CC\uC73C\uB85C \uC791\uC131\uD558\uC138\uC694(\uC5C6\uB294 \uB0B4\uC6A9 \uC9C0\uC5B4\uB0B4\uAE30 \uAE08\uC9C0). area \uB97C \uC8FC\uBA74 \uD574\uB2F9 \uC601\uC5ED \uADFC\uAC70\uB9CC \uBC18\uD658\uD569\uB2C8\uB2E4. studentToken \uC740 list_students \uC758 \uD1A0\uD070. "\uC0DD\uAE30\uBD80 \uCD08\uC548 \uC4F0\uAE30 \uD5C8\uC6A9" \uD1A0\uAE00\uC774 \uCF1C\uC838 \uC788\uC5B4\uC57C \uC870\uD68C\uB429\uB2C8\uB2E4. \uB3D9\uAE09\uC0DD \uC9C1\uC811 \uC2DD\uBCC4\uC790\uB294 \uB9C8\uC2A4\uD0B9\uB418\uC9C0\uB9CC \uB9E5\uB77D \uC7AC\uC2DD\uBCC4\uC774 \uAC00\uB2A5\uD569\uB2C8\uB2E4. \uC77D\uAE30 \uC804\uC6A9.',
      inputSchema: {
        studentToken: z
          .string()
          .describe(
            'list_students \uAC00 \uBC18\uD658\uD55C \uD559\uC0DD \uD1A0\uD070(\uB2F4\uC784=\uD559\uBC88 \uD1A0\uD070 / \uACFC\uBAA9\xB7\uB3D9\uC544\uB9AC=\uC218\uC5C5\uBC18 \uD1A0\uD070)',
          ),
        area: z
          .enum([
            'autonomy',
            'career',
            'behavior',
            'subject',
            'individualSubject',
            'club',
            'subjectDev',
          ])
          .optional()
          .describe(
            '\uC601\uC5ED \uD544\uD130(\uBBF8\uC9C0\uC815 \uC2DC \uC804\uCCB4): autonomy=\uC790\uC728 / career=\uC9C4\uB85C / behavior=\uD589\uD2B9 / subject=\uACFC\uBAA9\uC138\uD2B9 / individualSubject=\uAC1C\uC778\uC138\uD2B9 / club=\uB3D9\uC544\uB9AC / subjectDev=\uAD50\uACFC\uD559\uC2B5\uBC1C\uB2EC',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool('get_record_evidence', () => getRecordEvidence(ctx, args)),
  );
  server.registerTool(
    'complete_todo',
    {
      title: '\uD560\uC77C \uC644\uB8CC \uCC98\uB9AC',
      description:
        'get_todos \uC758 todoToken \uC73C\uB85C \uC9C0\uC815\uD55C \uD560\uC77C\uC744 \uC644\uB8CC \uCC98\uB9AC\uD569\uB2C8\uB2E4. \uC324\uD540 \uC2E4\uD589 \uC911\uC5D0\uB9CC \uC801\uC6A9(\uBBF8\uC2E4\uD589 \uC2DC \uAC70\uBD80), \uC4F0\uAE30 \uD65C\uC131\uD654 \uD544\uC694.',
      inputSchema: {
        todoToken: z
          .string()
          .describe('get_todos \uAC00 \uBC18\uD658\uD55C \uD560\uC77C \uD1A0\uD070'),
        idempotencyKey: z.string().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('complete_todo', () => completeTodo(ctx, args)),
  );
  server.registerTool(
    'update_todo',
    {
      title: '\uD560\uC77C \uC218\uC815',
      description:
        'get_todos \uC758 todoToken \uC73C\uB85C \uC9C0\uC815\uD55C \uD560\uC77C\uC758 \uB0B4\uC6A9\xB7\uB9C8\uAC10\xB7\uC6B0\uC120\uC21C\uC704 \uB4F1\uC744 \uC218\uC815\uD569\uB2C8\uB2E4(\uC9C0\uC815\uD55C \uD544\uB4DC\uB9CC). \uC324\uD540 \uC2E4\uD589 \uC911\uC5D0\uB9CC \uC801\uC6A9, \uC4F0\uAE30 \uD65C\uC131\uD654 \uD544\uC694.',
      inputSchema: {
        todoToken: z
          .string()
          .describe('get_todos \uAC00 \uBC18\uD658\uD55C \uD560\uC77C \uD1A0\uD070'),
        text: z.string().min(1).max(500).optional(),
        dueDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        priority: z.enum(['high', 'medium', 'low', 'none']).optional(),
        category: z.string().optional(),
        time: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional(),
        status: z.enum(['todo', 'inProgress', 'done']).optional(),
        idempotencyKey: z.string().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('update_todo', () => updateTodo(ctx, args)),
  );
  server.registerTool(
    'delete_todo',
    {
      title: '\uD560\uC77C \uC0AD\uC81C',
      description:
        'get_todos \uC758 todoToken \uC73C\uB85C \uC9C0\uC815\uD55C \uD560\uC77C\uC744 \uC0AD\uC81C\uD569\uB2C8\uB2E4. \uC324\uD540 \uC2E4\uD589 \uC911\uC5D0\uB9CC \uC801\uC6A9(\uBBF8\uC2E4\uD589 \uC2DC \uAC70\uBD80), \uC4F0\uAE30 \uD65C\uC131\uD654 \uD544\uC694.',
      inputSchema: {
        todoToken: z
          .string()
          .describe('get_todos \uAC00 \uBC18\uD658\uD55C \uD560\uC77C \uD1A0\uD070'),
        idempotencyKey: z.string().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('delete_todo', () => deleteTodo(ctx, args)),
  );
  server.registerTool(
    'update_event',
    {
      title: '\uC77C\uC815 \uC218\uC815',
      description:
        'get_events \uC758 eventToken \uC73C\uB85C \uC9C0\uC815\uD55C \uC77C\uC815\uC758 \uC81C\uBAA9\xB7\uB0A0\uC9DC\xB7\uC7A5\uC18C \uB4F1\uC744 \uC218\uC815\uD569\uB2C8\uB2E4(\uC9C0\uC815\uD55C \uD544\uB4DC\uB9CC). \uC324\uD540 \uC2E4\uD589 \uC911\uC5D0\uB9CC \uC801\uC6A9, \uC4F0\uAE30 \uD65C\uC131\uD654 \uD544\uC694.',
      inputSchema: {
        eventToken: z
          .string()
          .describe('get_events \uAC00 \uBC18\uD658\uD55C \uC77C\uC815 \uD1A0\uD070'),
        title: z.string().min(1).max(200).optional(),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        category: z.string().optional(),
        time: z.string().optional(),
        location: z.string().optional(),
        idempotencyKey: z.string().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('update_event', () => updateEvent(ctx, args)),
  );
  server.registerTool(
    'delete_event',
    {
      title: '\uC77C\uC815 \uC0AD\uC81C',
      description:
        'get_events \uC758 eventToken \uC73C\uB85C \uC9C0\uC815\uD55C \uC77C\uC815\uC744 \uC0AD\uC81C\uD569\uB2C8\uB2E4. \uC324\uD540 \uC2E4\uD589 \uC911\uC5D0\uB9CC \uC801\uC6A9(\uBBF8\uC2E4\uD589 \uC2DC \uAC70\uBD80), \uC4F0\uAE30 \uD65C\uC131\uD654 \uD544\uC694.',
      inputSchema: {
        eventToken: z
          .string()
          .describe('get_events \uAC00 \uBC18\uD658\uD55C \uC77C\uC815 \uD1A0\uD070'),
        idempotencyKey: z.string().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('delete_event', () => deleteEvent(ctx, args)),
  );
  server.registerTool(
    'create_memo',
    {
      title: '\uD3EC\uC2A4\uD2B8\uC787 \uBA54\uBAA8 \uCD94\uAC00',
      description:
        '\uC324\uD540(ssampin)\uC5D0 \uD3EC\uC2A4\uD2B8\uC787 \uBA54\uBAA8\uB97C \uCD94\uAC00\uD569\uB2C8\uB2E4. \uC4F0\uAE30\uB294 \uC324\uD540 \uC124\uC815 "AI \uC5F0\uACB0"\uC5D0\uC11C \uC4F0\uAE30\uB97C \uCF1C\uC57C \uD65C\uC131\uD654\uB429\uB2C8\uB2E4. \uC324\uD540\uC774 \uC2E4\uD589 \uC911\uC774\uBA74 \uC989\uC2DC \uBC18\uC601\uB418\uACE0, \uB2EB\uD600 \uC788\uC73C\uBA74 \uD30C\uC77C\uC5D0 \uC9C1\uC811 \uC800\uC7A5\uB429\uB2C8\uB2E4. \uAC19\uC740 idempotencyKey \uC7AC\uC694\uCCAD\uC740 \uC911\uBCF5 \uC0DD\uC131\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.',
      inputSchema: {
        content: z
          .string()
          .min(1)
          .max(2e3)
          .describe('\uBA54\uBAA8 \uBCF8\uBB38(\uCD5C\uB300 2000\uC790)'),
        color: z
          .enum(['yellow', 'pink', 'green', 'blue'])
          .optional()
          .describe('\uBA54\uBAA8 \uC0C9\uC0C1(\uAE30\uBCF8 yellow)'),
        idempotencyKey: z
          .string()
          .optional()
          .describe('\uC7AC\uC2DC\uB3C4 \uC911\uBCF5 \uBC29\uC9C0 \uD0A4'),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('create_memo', () => createMemo(ctx, args)),
  );
  server.registerTool(
    'update_memo',
    {
      title: '\uD3EC\uC2A4\uD2B8\uC787 \uBA54\uBAA8 \uC218\uC815',
      description:
        'get_memos \uC758 memoToken \uC73C\uB85C \uC9C0\uC815\uD55C \uD3EC\uC2A4\uD2B8\uC787\uC758 \uBCF8\uBB38\xB7\uC0C9\uC0C1\xB7\uBCF4\uAD00 \uC5EC\uBD80\uB97C \uC218\uC815\uD569\uB2C8\uB2E4(\uC9C0\uC815\uD55C \uD544\uB4DC\uB9CC). memoToken \uC740 \uBCF8\uBB38 \uC77D\uAE30 \uD1A0\uAE00\uC774 \uCF1C\uC9C4 \uC0C1\uD0DC\uC758 get_memos \uAC00 \uBC1C\uAE09\uD569\uB2C8\uB2E4. \uC324\uD540 \uC2E4\uD589 \uC911\uC5D0\uB9CC \uC801\uC6A9(\uBBF8\uC2E4\uD589 \uC2DC \uAC70\uBD80), \uC4F0\uAE30 \uD65C\uC131\uD654 \uD544\uC694.',
      inputSchema: {
        memoToken: z
          .string()
          .describe('get_memos \uAC00 \uBC18\uD658\uD55C \uBA54\uBAA8 \uD1A0\uD070'),
        content: z.string().min(1).max(2e3).optional().describe('\uC0C8 \uBCF8\uBB38'),
        color: z
          .enum(['yellow', 'pink', 'green', 'blue'])
          .optional()
          .describe('\uC0C8 \uC0C9\uC0C1'),
        archived: z.boolean().optional().describe('\uBCF4\uAD00(true)/\uBCF5\uC6D0(false)'),
        idempotencyKey: z.string().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('update_memo', () => updateMemo(ctx, args)),
  );
  server.registerTool(
    'delete_memo',
    {
      title: '\uD3EC\uC2A4\uD2B8\uC787 \uBA54\uBAA8 \uC0AD\uC81C',
      description:
        'get_memos \uC758 memoToken \uC73C\uB85C \uC9C0\uC815\uD55C \uD3EC\uC2A4\uD2B8\uC787\uC744 \uC0AD\uC81C\uD569\uB2C8\uB2E4. \uC324\uD540 \uC2E4\uD589 \uC911\uC5D0\uB9CC \uC801\uC6A9(\uBBF8\uC2E4\uD589 \uC2DC \uAC70\uBD80), \uC4F0\uAE30 \uD65C\uC131\uD654 \uD544\uC694.',
      inputSchema: {
        memoToken: z
          .string()
          .describe('get_memos \uAC00 \uBC18\uD658\uD55C \uBA54\uBAA8 \uD1A0\uD070'),
        idempotencyKey: z.string().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('delete_memo', () => deleteMemo(ctx, args)),
  );
  server.registerTool(
    'create_bookmark_group',
    {
      title: '\uBD81\uB9C8\uD06C \uADF8\uB8F9 \uCD94\uAC00',
      description:
        '\uC324\uD540(ssampin)\uC5D0 \uBD81\uB9C8\uD06C \uADF8\uB8F9(\uD3F4\uB354)\uC744 \uCD94\uAC00\uD569\uB2C8\uB2E4. \uBD81\uB9C8\uD06C\uB97C \uCD94\uAC00\uD558\uB824\uBA74 \uBA3C\uC800 \uADF8\uB8F9\uC774 \uC788\uC5B4\uC57C \uD558\uBA70, get_bookmarks \uB85C \uAE30\uC874 \uADF8\uB8F9\uC758 groupToken \uC744 \uD655\uC778\uD558\uAC70\uB098 \uC774 \uB3C4\uAD6C\uB85C \uC0C8 \uADF8\uB8F9\uC744 \uB9CC\uB4DC\uC138\uC694. \uC4F0\uAE30 \uD65C\uC131\uD654 \uD544\uC694. \uC324\uD540 \uC2E4\uD589 \uC911\uC774\uBA74 \uC989\uC2DC \uBC18\uC601, \uB2EB\uD600 \uC788\uC73C\uBA74 \uD30C\uC77C\uC5D0 \uC9C1\uC811 \uC800\uC7A5.',
      inputSchema: {
        name: z.string().min(1).max(200).describe('\uADF8\uB8F9 \uC774\uB984'),
        emoji: z
          .string()
          .max(16)
          .optional()
          .describe('\uADF8\uB8F9 \uC774\uBAA8\uC9C0(\uAE30\uBCF8 \u{1F516})'),
        idempotencyKey: z
          .string()
          .optional()
          .describe('\uC7AC\uC2DC\uB3C4 \uC911\uBCF5 \uBC29\uC9C0 \uD0A4'),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('create_bookmark_group', () => createBookmarkGroup(ctx, args)),
  );
  server.registerTool(
    'create_bookmark',
    {
      title: '\uBD81\uB9C8\uD06C(\uB9C1\uD06C) \uCD94\uAC00',
      description:
        '\uC324\uD540(ssampin)\uC5D0 \uBD81\uB9C8\uD06C(\uB9C1\uD06C)\uB97C \uCD94\uAC00\uD569\uB2C8\uB2E4. groupToken \uC740 get_bookmarks(\uBCF8\uBB38 \uC77D\uAE30 \uD1A0\uAE00 ON)\uAC00 \uBC1C\uAE09\uD55C \uB300\uC0C1 \uADF8\uB8F9 \uD1A0\uD070\uC774\uBA70, \uADF8\uB8F9\uC774 \uC5C6\uC73C\uBA74 create_bookmark_group \uC73C\uB85C \uBA3C\uC800 \uB9CC\uB4DC\uC138\uC694. url \uC740 http/https \uB9CC \uD5C8\uC6A9\uD569\uB2C8\uB2E4. \uC4F0\uAE30 \uD65C\uC131\uD654 \uD544\uC694. \uC324\uD540 \uC2E4\uD589 \uC911\uC774\uBA74 \uC989\uC2DC \uBC18\uC601, \uB2EB\uD600 \uC788\uC73C\uBA74 \uD30C\uC77C\uC5D0 \uC9C1\uC811 \uC800\uC7A5.',
      inputSchema: {
        groupToken: z
          .string()
          .describe(
            'get_bookmarks \uAC00 \uBC18\uD658\uD55C \uB300\uC0C1 \uADF8\uB8F9 \uD1A0\uD070',
          ),
        name: z.string().min(1).max(200).describe('\uBD81\uB9C8\uD06C \uC774\uB984'),
        url: z.string().min(1).max(2048).describe('\uB9C1\uD06C URL(http/https)'),
        idempotencyKey: z
          .string()
          .optional()
          .describe('\uC7AC\uC2DC\uB3C4 \uC911\uBCF5 \uBC29\uC9C0 \uD0A4'),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('create_bookmark', () => createBookmark(ctx, args)),
  );
  server.registerTool(
    'update_bookmark',
    {
      title: '\uBD81\uB9C8\uD06C \uC218\uC815',
      description:
        'get_bookmarks \uC758 bookmarkToken \uC73C\uB85C \uC9C0\uC815\uD55C \uBD81\uB9C8\uD06C\uC758 \uC774\uB984\xB7URL \uC744 \uC218\uC815\uD569\uB2C8\uB2E4(\uC9C0\uC815\uD55C \uD544\uB4DC\uB9CC). bookmarkToken \uC740 \uBCF8\uBB38 \uC77D\uAE30 \uD1A0\uAE00\uC774 \uCF1C\uC9C4 get_bookmarks \uAC00 \uBC1C\uAE09\uD569\uB2C8\uB2E4. url \uC740 http/https \uB9CC \uD5C8\uC6A9. \uC324\uD540 \uC2E4\uD589 \uC911\uC5D0\uB9CC \uC801\uC6A9(\uBBF8\uC2E4\uD589 \uC2DC \uAC70\uBD80), \uC4F0\uAE30 \uD65C\uC131\uD654 \uD544\uC694.',
      inputSchema: {
        bookmarkToken: z
          .string()
          .describe('get_bookmarks \uAC00 \uBC18\uD658\uD55C \uBD81\uB9C8\uD06C \uD1A0\uD070'),
        name: z.string().min(1).max(200).optional().describe('\uC0C8 \uC774\uB984'),
        url: z.string().min(1).max(2048).optional().describe('\uC0C8 URL(http/https)'),
        idempotencyKey: z.string().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('update_bookmark', () => updateBookmark(ctx, args)),
  );
  server.registerTool(
    'delete_bookmark',
    {
      title: '\uBD81\uB9C8\uD06C \uC0AD\uC81C',
      description:
        'get_bookmarks \uC758 bookmarkToken \uC73C\uB85C \uC9C0\uC815\uD55C \uBD81\uB9C8\uD06C\uB97C \uC0AD\uC81C\uD569\uB2C8\uB2E4. \uC324\uD540 \uC2E4\uD589 \uC911\uC5D0\uB9CC \uC801\uC6A9(\uBBF8\uC2E4\uD589 \uC2DC \uAC70\uBD80), \uC4F0\uAE30 \uD65C\uC131\uD654 \uD544\uC694.',
      inputSchema: {
        bookmarkToken: z
          .string()
          .describe('get_bookmarks \uAC00 \uBC18\uD658\uD55C \uBD81\uB9C8\uD06C \uD1A0\uD070'),
        idempotencyKey: z.string().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('delete_bookmark', () => deleteBookmark(ctx, args)),
  );
  server.registerTool(
    'create_notebook',
    {
      title: '\uB178\uD2B8\uBD81 \uCD94\uAC00',
      description:
        '\uC324\uD540(ssampin) \uB178\uD2B8\uC5D0 \uC0C8 \uB178\uD2B8\uBD81\uC744 \uCD94\uAC00\uD569\uB2C8\uB2E4(\uAE30\uBCF8 \uC139\uC158\xB7\uCCAB \uD398\uC774\uC9C0 \uC790\uB3D9 \uC0DD\uC131). \uB178\uD2B8 \uC4F0\uAE30\uB294 \uC324\uD540\uC774 \uC2E4\uD589 \uC911\uC77C \uB54C\uB9CC \uB3D9\uC791\uD558\uBA70(\uB2EB\uD600 \uC788\uC73C\uBA74 \uAC70\uBD80), \uC4F0\uAE30 \uD65C\uC131\uD654\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4. get_notes \uB85C \uAE30\uC874 \uB178\uD2B8\uBD81\uC758 notebookToken \uC744 \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.',
      inputSchema: {
        title: z.string().min(1).max(200).describe('\uB178\uD2B8\uBD81 \uC774\uB984'),
        idempotencyKey: z
          .string()
          .optional()
          .describe('\uC7AC\uC2DC\uB3C4 \uC911\uBCF5 \uBC29\uC9C0 \uD0A4'),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('create_notebook', () => createNotebook(ctx, args)),
  );
  server.registerTool(
    'create_note_section',
    {
      title: '\uB178\uD2B8 \uC139\uC158 \uCD94\uAC00',
      description:
        'get_notes \uC758 notebookToken \uC73C\uB85C \uC9C0\uC815\uD55C \uB178\uD2B8\uBD81\uC5D0 \uC139\uC158\uC744 \uCD94\uAC00\uD569\uB2C8\uB2E4. \uC324\uD540 \uC2E4\uD589 \uC911\uC5D0\uB9CC \uB3D9\uC791(\uBBF8\uC2E4\uD589 \uC2DC \uAC70\uBD80), \uC4F0\uAE30 \uD65C\uC131\uD654 \uD544\uC694.',
      inputSchema: {
        notebookToken: z
          .string()
          .describe('get_notes \uAC00 \uBC18\uD658\uD55C \uB178\uD2B8\uBD81 \uD1A0\uD070'),
        title: z.string().min(1).max(200).describe('\uC139\uC158 \uC774\uB984'),
        idempotencyKey: z.string().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('create_note_section', () => createNoteSection(ctx, args)),
  );
  server.registerTool(
    'create_note_page',
    {
      title: '\uB178\uD2B8 \uD398\uC774\uC9C0 \uCD94\uAC00',
      description:
        'get_notes \uC758 sectionToken \uC73C\uB85C \uC9C0\uC815\uD55C \uC139\uC158\uC5D0 \uD398\uC774\uC9C0\uB97C \uCD94\uAC00\uD569\uB2C8\uB2E4. body(\uBCF8\uBB38)\uB294 \uD3C9\uBB38\uC73C\uB85C \uBC1B\uC544 \uC324\uD540\uC774 \uB178\uD2B8 \uD615\uC2DD\uC73C\uB85C \uBCC0\uD658\uD558\uBA70, \uC904\uBC14\uAFC8\uC740 \uBB38\uB2E8\uC73C\uB85C \uB098\uB269\uB2C8\uB2E4. \uC324\uD540 \uC2E4\uD589 \uC911\uC5D0\uB9CC \uB3D9\uC791(\uBBF8\uC2E4\uD589 \uC2DC \uAC70\uBD80), \uC4F0\uAE30 \uD65C\uC131\uD654 \uD544\uC694.',
      inputSchema: {
        sectionToken: z
          .string()
          .describe('get_notes \uAC00 \uBC18\uD658\uD55C \uC139\uC158 \uD1A0\uD070'),
        title: z.string().min(1).max(200).describe('\uD398\uC774\uC9C0 \uC81C\uBAA9'),
        body: z
          .string()
          .max(1e5)
          .optional()
          .describe('\uD398\uC774\uC9C0 \uBCF8\uBB38(\uD3C9\uBB38, \uC120\uD0DD)'),
        idempotencyKey: z.string().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('create_note_page', () => createNotePage(ctx, args)),
  );
  server.registerTool(
    'update_note_page',
    {
      title: '\uB178\uD2B8 \uD398\uC774\uC9C0 \uC218\uC815',
      description:
        'get_notes \uC758 pageToken \uC73C\uB85C \uC9C0\uC815\uD55C \uD398\uC774\uC9C0\uC758 \uC81C\uBAA9\xB7\uBCF8\uBB38\xB7\uACE0\uC815 \uC5EC\uBD80\uB97C \uC218\uC815\uD569\uB2C8\uB2E4(\uC9C0\uC815\uD55C \uD544\uB4DC\uB9CC). body \uB294 \uD3C9\uBB38(\uAE30\uC874 \uBCF8\uBB38\uC744 \uB300\uCCB4). \uC324\uD540 \uC2E4\uD589 \uC911\uC5D0\uB9CC \uB3D9\uC791(\uBBF8\uC2E4\uD589 \uC2DC \uAC70\uBD80), \uC4F0\uAE30 \uD65C\uC131\uD654 \uD544\uC694.',
      inputSchema: {
        pageToken: z
          .string()
          .describe('get_notes \uAC00 \uBC18\uD658\uD55C \uD398\uC774\uC9C0 \uD1A0\uD070'),
        title: z.string().min(1).max(200).optional().describe('\uC0C8 \uC81C\uBAA9'),
        body: z
          .string()
          .max(1e5)
          .optional()
          .describe('\uC0C8 \uBCF8\uBB38(\uD3C9\uBB38, \uAE30\uC874 \uB300\uCCB4)'),
        pinned: z
          .boolean()
          .optional()
          .describe('\uC0C1\uB2E8 \uACE0\uC815(true)/\uD574\uC81C(false)'),
        idempotencyKey: z.string().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('update_note_page', () => updateNotePage(ctx, args)),
  );
  server.registerTool(
    'delete_note_page',
    {
      title: '\uB178\uD2B8 \uD398\uC774\uC9C0 \uC0AD\uC81C',
      description:
        'get_notes \uC758 pageToken \uC73C\uB85C \uC9C0\uC815\uD55C \uD398\uC774\uC9C0\uB97C \uBCF8\uBB38\uACFC \uD568\uAED8 \uC0AD\uC81C\uD569\uB2C8\uB2E4. \uC324\uD540 \uC2E4\uD589 \uC911\uC5D0\uB9CC \uB3D9\uC791(\uBBF8\uC2E4\uD589 \uC2DC \uAC70\uBD80), \uC4F0\uAE30 \uD65C\uC131\uD654 \uD544\uC694.',
      inputSchema: {
        pageToken: z
          .string()
          .describe('get_notes \uAC00 \uBC18\uD658\uD55C \uD398\uC774\uC9C0 \uD1A0\uD070'),
        idempotencyKey: z.string().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool('delete_note_page', () => deleteNotePage(ctx, args)),
  );
  return server;
}

// ../ssampin-ai-bridge/packages/mcp/dist/index.js
async function main() {
  const server = createSsampinMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[ssampin-mcp] connected (stdio)\n');
}
main().catch((err) => {
  process.stderr.write(`[ssampin-mcp] fatal: ${err instanceof Error ? err.message : String(err)}
`);
  process.exit(1);
});
