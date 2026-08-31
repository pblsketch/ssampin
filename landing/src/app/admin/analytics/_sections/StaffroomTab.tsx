// ── 온라인 교무실 탭 (migration 064 · ADR-079) ──
//
// ★★ 이 화면의 가장 중요한 규칙: **숫자와 날짜만 띄운다.**
//   부서 이름·선생님 이메일·글 제목을 여기 올리면, 다른 학교 선생님들의 부서 내용을
//   오너가 들여다보는 구조가 된다. 그래서 집계 함수(staffroom_health_v1)가 애초에
//   부서를 식별할 수 있는 칸을 만들지 않는다 — 화면에서 가리는 게 아니다.
//   이 계약은 staffroomHealthPrivacy.meta.test.ts 와 REGRESSION #66 이 지킨다.
//
// ★ sp-* 토큰 규약을 들여오지 않는다. 관리자 대시보드는 앱과 다른 디자인 체계이고
//   주변 화면이 전부 Tailwind gray-* 를 쓴다(오너 승인 A-2).

import { loadStaffroom } from '../_lib/data';
import { Section } from '../_components/primitives';
import { Empty, HBarList, Note, StatCard, num } from '../_components/charts';

/** 바이트를 사람이 읽는 크기로. 0 은 '0 B'. */
function bytes(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = v;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

function kst(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

export default async function StaffroomTab() {
  const h = await loadStaffroom();

  // 질의가 실패했을 때(RPC 미적용·권한 문제)와 "정말 부서가 0개"를 반드시 구별해서 말한다.
  // fetchRpc 는 실패를 빈 배열로 삼키므로, 여기서 말로 구분하지 않으면 둘 다 빈 화면이 된다.
  if (!h) {
    return (
      <Section title="온라인 교무실">
        <Empty hint="집계를 불러오지 못했습니다 — migration 064 적용 여부와 RPC 권한을 확인하세요" />
      </Section>
    );
  }

  if (h.departments_total === 0) {
    return (
      <Section title="온라인 교무실">
        <p className="text-sm text-gray-300">부서 0개 — 아직 아무도 쓰지 않습니다.</p>
        <Note>
          교무실은 실험실 기능이라 기본이 꺼짐입니다. 이 숫자가 0인 동안에는 관리자 넘겨주기·공동
          관리자 같은 후속 작업을 만들 이유가 없습니다. · 기준 {kst(h.generated_at)}
        </Note>
      </Section>
    );
  }

  const memberBuckets = [
    { label: '0명', value: h.dept_members_0 },
    { label: '1명', value: h.dept_members_1 },
    { label: '2~5명', value: h.dept_members_2_5 },
    { label: '6~10명', value: h.dept_members_6_10 },
    { label: '11~30명', value: h.dept_members_11_30 },
    { label: '31명+', value: h.dept_members_31_up },
  ];

  const healthBuckets = [
    { label: '정상', value: h.health_ok },
    { label: '끊김', value: h.health_broken },
    { label: '조용함', value: h.health_quiet },
    { label: '미연결', value: h.health_unlinked },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <Section title="온라인 교무실 — 현재 상태">
        <Note>
          기간 선택과 무관한 <strong>현재 상태 스냅샷</strong>입니다(위 날짜 선택은 이 탭에 적용되지
          않습니다). 기준 {kst(h.generated_at)}. 개인정보 보호를 위해 부서 이름·선생님 이메일·글
          제목은 집계 단계에서 아예 조회하지 않습니다.
        </Note>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <StatCard label="부서" value={num(h.departments_total)} sub="분모" />
          <StatCard label="글" value={num(h.posts_total)} sub={`댓글 ${num(h.comments_total)}`} />
          <StatCard label="자료" value={num(h.files_total)} sub={bytes(h.files_bytes)} />
          <StatCard
            label="마지막 활동"
            value={h.last_activity_date ?? '없음'}
            sub={`활동 0건 부서 ${num(h.depts_no_activity)}개`}
          />
        </div>
      </Section>

      <Section title="관리자 구글 연결">
        <Note>
          <strong>이 네 칸의 합은 부서 총수({num(h.departments_total)})와 같아야 합니다</strong> —
          부서마다 상태가 하나씩만 정해집니다. <strong>끊김</strong>은 자료실이 그 부서 전원에게 안
          열린다는 뜻이라 가장 급합니다. <strong>미연결</strong>은 부서를 만들고 구글 연결 전에
          그만둔 경우, <strong>조용함</strong>은 14일 이상 자료실을 아무도 열지 않은 경우입니다.
        </Note>
        <HBarList items={healthBuckets} max={h.departments_total} />
        <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
          마지막 끊김 기록: {kst(h.last_broken_at)} · 정상 상태에서는 아무것도 기록하지 않으므로,
          &ldquo;끊김 0&rdquo;이 진짜 0인지 계측이 멈춘 것인지는 이 화면만으로 구별할 수 없습니다.
          확인하려면 관리자 토큰을 일부러 끊고 자료실을 열어봐야 합니다.
        </p>
      </Section>

      <Section title="부서당 멤버 수 분포">
        <Note>
          부서별 명단이 아니라 <strong>분포</strong>만 봅니다. 여섯 칸의 합이 부서 총수와 같아야
          합니다.
        </Note>
        <HBarList items={memberBuckets} max={h.departments_total} />
      </Section>
    </div>
  );
}
