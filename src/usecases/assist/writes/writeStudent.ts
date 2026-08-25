/**
 * 쌤핀 AI 쓰기 — 학생에게 닿는 제안 만들기 (순수 함수)
 *
 * ★여기부터는 **학생 데이터**다. 할 일·메모·즐겨찾기와 무게가 다르다.
 * 출결은 결석 하나가 나이스로 넘어가면 생활기록부까지 따라가고, 잘못 적힌 것을
 * 되돌리려면 선생님이 여러 화면을 거슬러 올라가야 한다. 그래서 이 파일의 조립기는
 * 다른 곳보다 **더 자주 거절한다** — 모르면 짐작하지 않고 되묻는다.
 *
 * ★모델은 학생 명단을 본 적이 없다(목록 조회 도구가 등록돼 있지 않다). 대상은
 * 선생님이 말한 번호나, 가려진 별칭(［이름1］)이 실제 이름으로 되돌아온 값으로만 온다.
 * 그 말을 실제 학생에 잇는 일이 이 파일이 명렬표를 보는 유일한 이유다.
 */
import type { AssistWriteMark, AssistWriteOutcome } from '@domain/entities/AssistWrite';
import type { AttendanceReason, AttendanceStatus } from '@domain/entities/Attendance';
import {
  ATTENDANCE_REASONS,
  PERIOD_MORNING,
  findAttendanceRecordForClass,
  formatPeriodLabel,
} from '@domain/entities/Attendance';
import { computeAutoPeriods } from '@domain/rules/attendanceRules';
import { classAlias, findClassNameInQuestion, isHomeroomWord } from '@domain/rules/classNameAlias';
import {
  DEFAULT_OBSERVATION_CATEGORIES,
  DEFAULT_OBSERVATION_TAGS,
} from '@domain/entities/Observation';

import type { WriteSources } from './writeSources';
import { particle } from '@domain/rules/koreanParticle';

import { choice, date, matchOne, missing, squash, text } from './writeArgs';
import type { RawArgs } from './writeArgs';
import { fieldsOf } from './writeTodoEvent';

/**
 * 출결 처리 이름. 선생님이 쓰는 말과 저장 값 사이의 표다.
 *
 * ★영어 열거값도 함께 받는 이유: 도구 설명에 한국어를 적어 두어도 모델은 종종
 * 스키마의 값처럼 보이는 영어(`absent`)를 보낸다. 둘 다 받아 두는 편이,
 * 알아듣고도 "모르겠다"고 답하는 것보다 낫다.
 */
const STATUS_BY_WORD: Readonly<Record<string, AttendanceStatus>> = {
  출석: 'present',
  결석: 'absent',
  지각: 'late',
  조퇴: 'earlyLeave',
  결과: 'classAbsence',
  present: 'present',
  absent: 'absent',
  late: 'late',
  earlyLeave: 'earlyLeave',
  classAbsence: 'classAbsence',
};

const STATUS_LABEL: Readonly<Record<AttendanceStatus, string>> = {
  present: '출석',
  absent: '결석',
  late: '지각',
  earlyLeave: '조퇴',
  classAbsence: '결과',
};

/** 명렬표에서 찾은 대상 한 명. 번호는 출결이, 키는 관찰이, 이름은 미리보기가 쓴다. */
interface Target {
  readonly number: number;
  readonly name: string;
  /** 원 소속 학년·반. 번호가 겹치는 수업반에서 **누구인지 가르는 값** */
  readonly grade?: number;
  readonly classNum?: number;
  /** 관찰 기록이 학생을 가리키는 키. 담임 학급에는 없다(관찰은 수업반 기능이다) */
  readonly key?: string;
}

/** 대상을 가리키는 말이 번호인가 — `"15"` · `15` · `"15번"` 을 모두 같게 본다. */
function asNumber(value: string): number | undefined {
  const matched = /^(\d{1,6})\s*번?$/.exec(value.trim());
  if (!matched) return undefined;
  const parsed = Number(matched[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * 말 한 마디를 실제 학생에 잇는다.
 *
 * ★번호로 가리켰는데 그 번호가 명단에 없으면 **이름으로 다시 찾지 않는다.**
 * 번호는 선생님이 확신을 갖고 말한 값이라, 못 찾았다는 사실 자체가 알려야 할 정보다
 * (번호를 잘못 말했거나, 다른 반을 보고 있거나 둘 중 하나다).
 */
function findStudent(
  roster: readonly Target[],
  value: string,
  where: string,
): { ok: true; item: Target } | { ok: false; reason: string } {
  const wanted = asNumber(value);
  if (wanted !== undefined) {
    const hits = roster.filter((s) => s.number === wanted);
    if (hits.length === 0) {
      return {
        ok: false,
        reason: `${where} ${wanted}번 학생을 찾지 못해서 아무것도 적지 않았어요. 번호를 다시 확인해 주시겠어요?`,
      };
    }
    // ★교과 수업반은 여러 학급에서 모이므로 **번호가 겹친다**(한 반에 "2번"이 넷일 수
    //   있다). 예전에는 그중 맨 앞을 골랐다 — 선생님은 구예찬을 말했는데 도유산에게
    //   결석이 적히고, 그 사실은 아무도 모른다. 고르지 않고 **이름을 여쭙는다.**
    if (hits.length > 1) {
      const names = hits
        .slice(0, 4)
        .map((s) => s.name)
        .join(', ');
      const more = hits.length > 4 ? ` 외 ${hits.length - 4}명` : '';
      return {
        ok: false,
        reason: `${where}에는 ${wanted}번이 여러 명이에요(${names}${more}). 이름으로 말씀해 주시면 그 학생에게 적을게요.`,
      };
    }
    return { ok: true, item: hits[0]! };
  }

  const found = matchOne(roster, value, (s) => s.name, '학생');
  if (!found.ok) return { ok: false, reason: found.reason };
  return { ok: true, item: found.item };
}

/** 어느 반의 명렬표를 볼 것인가. 반 이름을 안 밝히면 담임 학급이다. */
function findRoster(
  src: WriteSources,
  className: string | undefined,
  question: string,
):
  | {
      ok: true;
      classId: string;
      groupId?: string;
      label: string;
      homeroom: boolean;
      students: readonly Target[];
    }
  | { ok: false; reason: string } {
  // ★선생님이 직접 말한 반이 **모델이 준 반보다 먼저**다. 모델은 옆 카드의 "우리 반"을
  //   베끼거나 아예 빠뜨린다 — 실제로 "1학년 7반 …결석처리 해줘"에 모델이 className 을
  //   "우리반"으로 보내 아무것도 못 했다(2026-08-25 실측).
  const spoken = findClassNameInQuestion(src.roster.teaching, question, (c) => c.className);
  if (spoken !== undefined) {
    return {
      ok: true,
      classId: spoken.classId,
      ...(spoken.groupId === undefined ? {} : { groupId: spoken.groupId }),
      label: spoken.className,
      homeroom: false,
      students: spoken.students.map((s) => ({
        number: s.number,
        name: s.name,
        ...(s.grade === undefined ? {} : { grade: s.grade }),
        ...(s.classNum === undefined ? {} : { classNum: s.classNum }),
        key: s.key,
      })),
    };
  }

  // "우리 반"이라고 온 것은 담임 학급을 뜻한다 — 수업반 목록에서 찾으면 못 찾는다.
  if (className === undefined || isHomeroomWord(className)) {
    if (src.roster.homeroom.length === 0) {
      return {
        ok: false,
        reason:
          '담임 학급 명렬표가 비어 있어서 누구인지 정할 수 없었어요. 어느 수업반인지 함께 말씀해 주시겠어요?',
      };
    }
    // ★반 이름이 비어 있으면 저장하지 않는다. 담임 출결은 이 이름을 **반 식별자
    //   그대로** 쓰므로(설정의 학급 이름 = 저장 키), 비면 이름 없는 반에 출결이
    //   쌓이고 출결 화면에서는 영영 안 보인다 — 저장은 됐는데 아무도 못 찾는다.
    if (src.roster.homeroomClassId.trim().length === 0) {
      return {
        ok: false,
        reason:
          '우리 반 이름이 아직 설정되지 않아서 출결을 적을 곳을 찾지 못했어요. 설정에서 학급 이름을 먼저 넣어 주세요.',
      };
    }
    return {
      ok: true,
      classId: src.roster.homeroomClassId,
      label: '우리 반',
      homeroom: true,
      students: src.roster.homeroom
        .filter((s): s is typeof s & { studentNumber: number } => s.studentNumber !== undefined)
        .map((s) => ({ number: s.studentNumber, name: s.name })),
    };
  }

  // ★"3학년 1반" 과 "3-1" 은 같은 반이다 — 양쪽을 같은 꼴로 바꿔 견준다(classAlias).
  const found = matchOne(
    src.roster.teaching,
    classAlias(className),
    (c) => classAlias(c.className),
    '수업반',
  );
  if (!found.ok) return { ok: false, reason: found.reason };
  return {
    ok: true,
    classId: found.item.classId,
    ...(found.item.groupId === undefined ? {} : { groupId: found.item.groupId }),
    label: found.item.className,
    homeroom: false,
    students: found.item.students.map((s) => ({
      number: s.number,
      name: s.name,
      ...(s.grade === undefined ? {} : { grade: s.grade }),
      ...(s.classNum === undefined ? {} : { classNum: s.classNum }),
      key: s.key,
    })),
  };
}

/**
 * 지금 이 칸에 무엇이 적혀 있는가. **미리보기에만** 쓴다.
 *
 * ★그룹 반(같은 교실의 여러 과목)은 물리 반 id 로만 찾으면 다른 과목 명의로 저장된
 * 공유 기록을 놓친다(2026-07 QA2 B2). 그 판정의 정본이 `findAttendanceRecordForClass`
 * 라 여기서 규칙을 다시 만들지 않고 그대로 부른다.
 */
function currentEntry(
  src: WriteSources,
  cls: { readonly classId: string; readonly groupId?: string },
  date: string,
  period: number,
  studentNumber: number,
): WriteSources['attendance'][number]['students'][number] | undefined {
  const record = findAttendanceRecordForClass(
    src.attendance,
    { id: cls.classId, ...(cls.groupId === undefined ? {} : { groupId: cls.groupId }) },
    date,
    period,
  );
  return record?.students.find((entry) => entry.number === studentNumber);
}

/** 여러 교시의 현재 상태를 한 줄로 요약한다. 교시마다 다르면 그 사실을 말한다. */
function currentSummary(
  entries: readonly (WriteSources['attendance'][number]['students'][number] | undefined)[],
): string | undefined {
  const labels = entries.map((entry) =>
    entry === undefined
      ? undefined
      : `${STATUS_LABEL[entry.status]}${entry.reason === undefined ? '' : ` (${entry.reason})`}`,
  );
  const written = labels.filter((label): label is string => label !== undefined);
  if (written.length === 0) return undefined;
  const unique = [...new Set(written)];
  const everyPeriod = written.length === labels.length;
  if (unique.length === 1) {
    // 값은 하나인데 일부 교시만 적혀 있다 — "전부 결석"이라고 말하면 그게 거짓말이다.
    return everyPeriod ? unique[0]! : `일부 교시만 ${unique[0]!}`;
  }
  // 교시마다 다르다. 뭉뚱그리면 선생님이 무엇을 덮는지 모른 채 [실행]을 누른다.
  return `교시마다 달라요 (${unique.slice(0, 3).join(', ')}${unique.length > 3 ? ' 외' : ''})`;
}

/**
 * 담임 학급에서 교시를 안 밝혔을 때의 "하루 전체" — **화면과 같은 규칙을 쓴다.**
 *
 * ★규칙을 여기서 다시 만들지 않는다. 정본은 `computeAutoPeriods`(출결 그리드·빠른 입력이
 * 쓰는 그 함수)이고, 그 표에서 하루 결석은 **조회 + 1~N교시 + 종례**다. 예전에는 이
 * 파일이 제 나름대로 "하루 전체 = 1~N교시"로 세는 바람에, AI 로 적은 결석만 조회·종례가
 * 빈 칸으로 남았다(2026-08-25 오너 신고, 화면 확인).
 *
 * ★출석(present)은 자동 채움 표가 **빈 값**을 준다 — "예외가 없다"는 뜻이라 채울 칸이
 * 없기 때문이다. 그런데 여기서는 "하루 결석을 출석으로 되돌려 줘"가 되어야 하므로
 * 결석과 **같은 범위**를 지운다. 빈 값을 그대로 쓰면 조회·종례에 결석만 남는다.
 */
function homeroomDaySpan(status: AttendanceStatus, count: number): number[] {
  const span =
    status === 'present'
      ? computeAutoPeriods('absent', PERIOD_MORNING, count)
      : computeAutoPeriods(status, PERIOD_MORNING, count);
  return [...span].sort((a, b) => a - b);
}

/**
 * 출결을 적는다.
 *
 * ★교시를 안 밝히면 **담임 학급에서만** 하루 전체로 본다("오늘 결석"). 교과 수업반은
 * 그 반이 그날 몇 교시에 드는지를 이 자리에서 알 수 없어(시간표를 보지 않는다) 되묻는다.
 * 짐작해서 1교시부터 전부 적으면, 들지도 않은 시간의 결석이 나이스까지 따라간다.
 */
export function proposeSetAttendance(
  args: RawArgs,
  src: WriteSources,
  question = '',
): AssistWriteOutcome {
  // ★번호를 문자열이 아니라 **숫자로** 보내는 일이 잦다. 도구 설명에 `"15번"` 이라고
  //   적어 두어도 모델은 번호처럼 보이는 값을 숫자로 만든다. 여기서 함께 받아 둔다 —
  //   알아들을 수 있는데 "모르겠다"고 답하는 것이 더 나쁘다.
  const raw = args['student'];
  const who = typeof raw === 'number' ? String(raw) : text(args, 'student');
  if (who === undefined) return missing('대상 학생');

  const word = text(args, 'status');
  if (word === undefined) return missing('출결 처리');
  const status = STATUS_BY_WORD[word];
  if (status === undefined) {
    return {
      reason: `"${word}"${particle(word, '이', '가')} 어떤 처리인지 알아듣지 못했어요. 결석·지각·조퇴·결과·출석 중에서 말씀해 주세요.`,
    };
  }

  const cls = findRoster(src, text(args, 'className'), question);
  if (!cls.ok) return { reason: cls.reason };

  const target = findStudent(cls.students, who, cls.label);
  if (!target.ok) return { reason: target.reason };

  const when = date(args, 'date') ?? src.today;

  // 교시. 0(조회)·9(종례)는 담임 전용 칸이라 정규 교시 범위와 따로 받는다.
  const rawPeriod = args['period'];
  const parsedPeriod =
    typeof rawPeriod === 'number'
      ? rawPeriod
      : typeof rawPeriod === 'string' && /^\d{1,2}$/.test(rawPeriod.trim())
        ? Number(rawPeriod.trim())
        : undefined;
  const period =
    parsedPeriod !== undefined &&
    Number.isInteger(parsedPeriod) &&
    parsedPeriod >= 0 &&
    parsedPeriod <= 9
      ? parsedPeriod
      : undefined;

  const count = src.roster.regularPeriodCount;
  let periods: readonly number[];
  if (period !== undefined) {
    // ★교시를 밝혔으면 그 교시만이다. 특히 **교과 수업반**에서 조회·종례까지 번지면
    //   그 반이 들지도 않는 시간에 결석이 찍힌다.
    periods = [period];
  } else if (!cls.homeroom) {
    return missing(`${cls.label} 수업의 교시`);
  } else if (count > 0) {
    // ★담임 학급의 "하루 전체"는 **조회와 종례를 포함한다.**
    periods = homeroomDaySpan(status, count);
  } else {
    return missing('교시');
  }

  const reason = choice<AttendanceReason>(args, 'reason', ATTENDANCE_REASONS);
  const memo = text(args, 'memo');

  // ★지금 그 칸에 무엇이 적혀 있는지 본다. 미리보기가 이걸 감추면 선생님은 "빈 칸에
  //   적는다"고 믿으며 [실행]을 누르는데 실제로는 이미 있던 결석이 지각으로 바뀐다.
  const before = periods.map((p) => currentEntry(src, cls, when, p, target.item.number));

  // ★이미 똑같으면 쓰지 않는다. 같은 값을 다시 저장해도 결과는 같지만, 저장 시각이
  //   갱신되며 기기 간 동기화가 헛돌고 선생님은 무언가 바뀐 줄 안다.
  const identical =
    before.length > 0 &&
    before.every(
      (entry) =>
        entry !== undefined &&
        entry.status === status &&
        entry.reason === reason &&
        (entry.memo ?? undefined) === memo,
    );
  if (identical) {
    return {
      reason: `${target.item.name} 학생은 이미 ${STATUS_LABEL[status]}(으)로 돼 있어서 그대로 뒀어요.`,
    };
  }

  // ★교시 이름을 여기서 만들지 않는다. 선생님이 교시에 이름을 붙였으면("창체")
  //   그 이름이 나와야 하고, 그 규칙의 정본은 `formatPeriodLabel` 하나뿐이다.
  //   화면마다 "N교시"를 손으로 짓다가 붙인 이름이 그 화면에서만 무시된 전례가 있어
  //   저장소에 메타 테스트까지 있다(periodLabelHardcoding.metatest).
  const first = formatPeriodLabel(periods[0]!, src.periodTimes);
  const last = formatPeriodLabel(periods[periods.length - 1]!, src.periodTimes);
  const periodLabel = periods.length === 1 ? first : `${first}~${last}`;

  return {
    tool: 'set_attendance',
    // ★`update` 가 아니라 `create` 인 이유 — 이 저장소에서 `update`·`delete` 는
    //   "기존 항목 **하나**를 id 로 가리킨다"는 뜻이고, 그 약속을 계약 테스트가 지킨다
    //   (원문·targetId 가 반드시 붙는다). 출결 한 칸에는 그런 id 가 없다. 주소가
    //   (반·날짜·교시·번호)라는 조합이라 진도 추가(create_progress)와 같은 모양이다.
    //   대신 미리보기가 무엇을 적을지 한 줄도 빠뜨리지 않고 보여준다.
    action: 'create',
    title: '출결 입력',
    fields: fieldsOf([
      ['반', cls.label],
      // ★미리보기에는 **실제 이름**이 뜬다. 화면은 선생님만 보므로 가리지 않는다 —
      //   가리면 [실행] 버튼이 "누구인지 모르는 채 누르는" 버튼이 된다.
      ['학생', `${target.item.number}번 ${target.item.name}`],
      ['날짜', when],
      ['교시', periodLabel],
      // 적혀 있던 것이 있을 때만 뜬다 — 빈 칸에 적는 흔한 경우에는 줄이 늘지 않는다.
      ['지금', currentSummary(before)],
      ['처리', STATUS_LABEL[status]],
      ['사유', reason],
      ['메모', memo],
    ]),
    values: {
      classId: cls.classId,
      // 담임 학급이어야 학생 기록(담임 출결)에도 같은 사실을 남긴다 — 실행기가 본다.
      homeroom: cls.homeroom,
      date: when,
      // `AssistWriteValues` 는 한 칸에 문자열·숫자·참거짓만 담는다(배열을 담지 않는 것이
      // 22종을 한 모양으로 유지해 온 이유다). 교시 목록은 쉼표로 붙여 보내고 실행기가 푼다.
      periods: periods.join(','),
      studentNumber: target.item.number,
      // ★번호가 겹치는 수업반에서 누구인지 가르는 값. 없으면 조회 화면이 "?" 로 띄운다.
      ...(target.item.grade === undefined ? {} : { studentGrade: target.item.grade }),
      ...(target.item.classNum === undefined ? {} : { studentClassNum: target.item.classNum }),
      studentName: target.item.name,
      status,
      periodLabel,
      ...(reason === undefined ? {} : { reason }),
      ...(memo === undefined ? {} : { memo }),
    },
  };
}

// ─────────────────────────────── 관찰 기록 ───────────────────────────────

/**
 * 어느 수업반의 명렬표를 볼 것인가 — **담임 학급은 여기에 없다.**
 *
 * ★관찰은 교과 수업반 기능이다(`useObservationStore`). 담임 학급의 누가기록은 저장
 * 자리가 아예 다르다(`useStudentRecordsStore`). 한 도구로 둘을 다 받으면 "어디에
 * 적혔는지"가 말할 때마다 달라져, 선생님은 나중에 기록을 못 찾는다.
 */
function findTeachingRoster(
  src: WriteSources,
  className: string | undefined,
  question: string,
):
  | { ok: true; classId: string; label: string; students: readonly Target[] }
  | { ok: false; reason: string } {
  const pool = src.roster.teaching;
  if (pool.length === 0) {
    return { ok: false, reason: '수업반이 없어서 관찰 기록을 남길 곳을 찾지 못했어요.' };
  }

  // 위 findRoster 와 같은 이유 — 선생님이 말한 반이 먼저다.
  const spoken = findClassNameInQuestion(pool, question, (c) => c.className);
  if (spoken !== undefined) {
    return {
      ok: true,
      classId: spoken.classId,
      label: spoken.className,
      students: spoken.students.map((s) => ({ number: s.number, name: s.name, key: s.key })),
    };
  }

  // 반을 안 밝혔는데 수업반이 하나뿐이면 그 반이다. 여럿이면 **고르지 않고 되묻는다** —
  // 관찰이 엉뚱한 반에 붙으면 그 학생 화면에서는 영영 안 보인다.
  const only = className === undefined ? pool[0] : undefined;
  if (className === undefined) {
    if (pool.length > 1) {
      const names = pool
        .slice(0, 3)
        .map((c) => `"${c.className}"`)
        .join(', ');
      return {
        ok: false,
        reason: `수업반이 여러 개예요(${names}${pool.length > 3 ? ` 외 ${pool.length - 3}개` : ''}). 어느 반인지 알려주세요.`,
      };
    }
    return {
      ok: true,
      classId: only!.classId,
      label: only!.className,
      students: only!.students.map((s) => ({ number: s.number, name: s.name, key: s.key })),
    };
  }

  const found = matchOne(pool, classAlias(className), (c) => classAlias(c.className), '수업반');
  if (!found.ok) return { ok: false, reason: found.reason };
  return {
    ok: true,
    classId: found.item.classId,
    label: found.item.className,
    students: found.item.students.map((s) => ({ number: s.number, name: s.name, key: s.key })),
  };
}

/** 미리보기에서는 앞부분만 보여준다(저장은 전문 그대로). */
function head(value: string, max = 80): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

/**
 * 관찰 기록을 남긴다.
 *
 * ★내용은 **선생님이 입력한 문장**이다. 모델에게 관찰문을 짓게 하지 않는다 —
 * 학생에 대한 서술을 AI 가 대신 쓰는 것은 이 저장소가 선을 그어 둔 자리다(ADR-072).
 * 모델이 하는 일은 "누구에게, 어느 반에, 어느 날짜로" 를 인자로 옮기는 것뿐이다.
 */
export function proposeAddObservation(
  args: RawArgs,
  src: WriteSources,
  question = '',
): AssistWriteOutcome {
  const rawStudent = args['student'];
  const who = typeof rawStudent === 'number' ? String(rawStudent) : text(args, 'student');
  if (who === undefined) return missing('대상 학생');

  const content = text(args, 'content');
  if (content === undefined) return missing('관찰 내용');

  const cls = findTeachingRoster(src, text(args, 'className'), question);
  if (!cls.ok) return { reason: cls.reason };

  const target = findStudent(cls.students, who, cls.label);
  if (!target.ok) return { reason: target.reason };
  if (target.item.key === undefined) {
    return { reason: `${target.item.name} 학생을 어느 자리에 적을지 정하지 못했어요.` };
  }

  const when = date(args, 'date') ?? src.today;
  const tag = choice(args, 'tag', DEFAULT_OBSERVATION_TAGS);
  const category = choice(args, 'category', DEFAULT_OBSERVATION_CATEGORIES);

  return {
    tool: 'add_observation',
    action: 'create',
    title: '관찰 기록 추가',
    fields: fieldsOf([
      ['수업반', cls.label],
      ['학생', `${target.item.number}번 ${target.item.name}`],
      ['날짜', when],
      ['분류', category],
      ['태그', tag],
      ['내용', head(content)],
    ]),
    values: {
      classId: cls.classId,
      studentKey: target.item.key,
      studentName: target.item.name,
      date: when,
      content,
      ...(tag === undefined ? {} : { tag }),
      ...(category === undefined ? {} : { category }),
    },
  };
}

// ─────────────────────────────── 루브릭 채점 ───────────────────────────────

/**
 * 루브릭 한 칸을 체크한다.
 *
 * ★스토어 함수가 `toggleMark`(토글)이라는 점이 이 도구의 전부다. 제안을 만든 뒤
 * 선생님이 화면에서 직접 같은 칸을 눌렀을 수 있는데, 그 상태에서 그대로 토글하면
 * **체크가 풀린다** — 그러고도 앱은 "채점했어요"라고 말한다. 그래서 실행 직전에
 * 지금 상태를 다시 보고, 이미 원하는 결과면 부르지 않는다(`complete_todo` 선례).
 * 그 확인은 실행기에서 한다 — 여기는 순수 함수라 지금 상태를 볼 수 없다.
 */
/**
 * "만점" 처럼 **수준 이름이 아니라 '제일 높은 칸'을 가리키는 말.**
 *
 * ★실제 수준 이름을 먼저 찾고, **못 찾았을 때만** 이 말로 친다. 기준표에 진짜로
 * "만점"이라는 수준이 있으면 그 수준이 이긴다 — 선생님이 붙인 이름이 늘 우선이다.
 *
 * ★"최고"·"최상"은 일부러 넣지 않았다. 수준 이름으로 쓰기 쉬운 말이라, 없는 수준을
 * 말했을 때 되묻는 대신 제일 높은 칸을 찍어 버리면 그게 더 위험하다.
 */
const TOP_LEVEL_WORDS: readonly string[] = ['만점', '최고점'];

/** 배점이 가장 높은 수준. 배점이 같으면 뒤엣것을 고르지 않는다(먼저 나온 것 유지). */
function topLevel(
  levels: readonly { readonly id: string; readonly name: string; readonly score: number }[],
): { readonly id: string; readonly name: string } | undefined {
  return levels.reduce<(typeof levels)[number] | undefined>(
    (best, level) => (best === undefined || level.score > best.score ? level : best),
    undefined,
  );
}

export function proposeSetRubricMark(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const rawStudent = args['student'];
  const who = typeof rawStudent === 'number' ? String(rawStudent) : text(args, 'student');
  if (who === undefined) return missing('대상 학생');

  const rubricName = text(args, 'rubric');
  if (rubricName === undefined) return missing('어느 평가 기준표');
  const rubricHit = matchOne(src.rubrics, rubricName, (r) => r.title, '평가 기준표');
  if (!rubricHit.ok) return { reason: rubricHit.reason };
  const rubric = rubricHit.item;

  const levelName = text(args, 'level');
  if (levelName === undefined) return missing('어느 수준');

  /**
   * 어느 요소들에 찍을 것인가. 선생님이 요소를 밝히면 그 하나, 안 밝히면 **전부**다.
   *
   * ★"만점으로 표시해줘"가 실사용에서 그냥 막혔다(2026-08-25). 요소를 하나씩 집어야만
   * 되는 구조였는데, 만점은 애초에 "요소를 하나 고르는 말"이 아니다.
   */
  const criterionName = text(args, 'criterion');
  let targets: readonly (typeof rubric.criteria)[number][];
  if (criterionName === undefined) {
    if (rubric.criteria.length === 0) {
      return { reason: `"${rubric.title}"에 평가 요소가 없어서 채점할 칸이 없어요.` };
    }
    targets = [...rubric.criteria].sort((a, b) => a.order - b.order);
  } else {
    const criterionHit = matchOne(rubric.criteria, criterionName, (c) => c.name, '평가 요소');
    if (!criterionHit.ok) return { reason: criterionHit.reason };
    targets = [criterionHit.item];
  }

  // ★요소마다 수준을 따로 찾는다. 같은 이름의 수준이 요소마다 다른 id 라서, 한 번 찾아
  //   돌려 쓰면 엉뚱한 칸이 체크된다(기존 테스트가 잠가 둔 규칙).
  const wantsTop = TOP_LEVEL_WORDS.includes(squash(levelName));
  const marks: AssistWriteMark[] = [];
  for (const criterion of targets) {
    const hit = matchOne(criterion.levels, levelName, (l) => l.name, '수준');
    const level = hit.ok ? hit.item : wantsTop ? topLevel(criterion.levels) : undefined;
    if (level === undefined) {
      // ★일부만 찍고 넘어가지 않는다. 반쯤 채워진 채점표는 선생님이 무엇이 빠졌는지
      //   모르는 채로 두는 것이라, 아무것도 안 하고 이유를 말하는 편이 낫다.
      return {
        reason:
          targets.length === 1
            ? (hit as { reason: string }).reason
            : `"${criterion.name}"에는 "${levelName}"에 해당하는 수준이 없어서 아무것도 바꾸지 않았어요.`,
      };
    }
    marks.push({
      criterionId: criterion.id,
      criterionName: criterion.name,
      levelId: level.id,
      levelName: level.name,
    });
  }

  // 반은 루브릭이 이미 알고 있다 — 선생님이 따로 말하지 않아도 된다.
  const cls = src.roster.teaching.find((c) => c.classId === rubric.classId);
  if (cls === undefined) {
    return {
      reason: `"${rubric.title}"${particle(rubric.title, '이', '가')} 어느 수업반 것인지 찾지 못했어요.`,
    };
  }

  const target = findStudent(
    cls.students.map((s) => ({ number: s.number, name: s.name, key: s.key })),
    who,
    cls.className,
  );
  if (!target.ok) return { reason: target.reason };
  if (target.item.key === undefined) {
    return { reason: `${target.item.name} 학생을 어느 자리에 적을지 정하지 못했어요.` };
  }

  const first = marks[0]!;
  // ★여러 칸이면 **무엇이 어디에 찍히는지 전부** 보여준다. 개수만 적으면 [실행] 버튼이
  //   확인이 아니라 요식이 된다(미리보기의 원칙).
  const preview: [string, string | undefined][] =
    marks.length === 1
      ? [
          ['평가 요소', first.criterionName],
          ['수준', first.levelName],
        ]
      : marks.map((mark) => [mark.criterionName, mark.levelName]);

  return {
    tool: 'set_rubric_mark',
    action: 'create',
    title: marks.length === 1 ? '루브릭 채점' : `루브릭 채점 — ${marks.length}개 요소`,
    fields: fieldsOf([
      ['수업반', cls.className],
      ['평가 기준표', rubric.title],
      ['학생', `${target.item.number}번 ${target.item.name}`],
      ...preview,
    ]),
    values: {
      rubricId: rubric.id,
      classId: rubric.classId,
      studentKey: target.item.key,
      studentName: target.item.name,
      // 첫 칸은 `values` 에도 그대로 둔다 — 미리보기·문구가 쓰던 자리다.
      criterionId: first.criterionId,
      levelId: first.levelId,
      criterionName: first.criterionName,
      levelName: first.levelName,
    },
    marks,
  };
}
