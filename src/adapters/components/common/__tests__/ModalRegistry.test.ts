/**
 * ModalRegistry 정합성 메타테스트.
 *
 * notification-modal-stacking-fix Phase 4 (Design v1.1 §5.3).
 *
 * 회귀 차단: App.tsx 렌더 트리에 ModalCoordinator가 마운트되어 있고,
 * 6개 모달 파일이 모두 useRegisterModal hook으로 큐에 자기를 등록하는지 검증.
 *
 * 본 메타테스트는 src/ 디렉토리의 실제 소스 파일을 읽어 정규식 매칭으로
 * 검사한다. scripts/regression-grep-check.mjs와 이중 안전망 — vitest와
 * 빌드 게이트 양쪽에서 누락을 잡음.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectHead, PRIORITY_ORDER } from '@adapters/stores/useModalCoordinatorStore';

const ROOT = resolve(__dirname, '../../../../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
}

describe('ModalRegistry 정합성 메타테스트', () => {
  describe('App.tsx 마운트', () => {
    it('App.tsx에 <ModalCoordinator /> 마운트되어 있다', () => {
      const src = readSource('src/App.tsx');
      expect(src).toMatch(/<ModalCoordinator\s*\/>/);
    });

    it('App.tsx가 ModalCoordinator import 한다', () => {
      const src = readSource('src/App.tsx');
      expect(src).toMatch(/from\s+['"]@adapters\/components\/common\/ModalCoordinator['"]/);
    });
  });

  describe('6개 모달의 useRegisterModal 등록', () => {
    const modalSpecs: Array<{
      file: string;
      priorities: string[];
      label: string;
    }> = [
      {
        file: 'src/adapters/components/Dashboard/EventPopup.tsx',
        priorities: ['EVENT_ALERT'],
        label: 'EventPopup',
      },
      {
        file: 'src/adapters/components/common/UpdateNotification.tsx',
        priorities: ['SECURITY_UPDATE', 'NORMAL_UPDATE'],
        label: 'UpdateNotification (priority 동적 — 두 hook XOR)',
      },
      {
        file: 'src/adapters/components/common/FirstSyncConfirmModal.tsx',
        priorities: ['FIRST_SYNC'],
        label: 'FirstSyncConfirmModal',
      },
      {
        file: 'src/adapters/components/common/DriveSyncConflictModal.tsx',
        priorities: ['DRIVE_CONFLICT'],
        label: 'DriveSyncConflictModal',
      },
      {
        file: 'src/adapters/components/Settings/modals/OAuthModalsProvider.tsx',
        priorities: ['OAUTH_FLOW', 'OAUTH_FLOW', 'OAUTH_FLOW'], // 3개 sub-modal
        label: 'OAuthModalsProvider (3 sub-modal)',
      },
      {
        file: 'src/adapters/components/Share/SharePromptOverlay.tsx',
        priorities: ['SHARE_PROMPT'],
        label: 'SharePromptOverlay',
      },
      // 학사 확인 팝업 2종 — 반드시 **둘 다** 있어야 한다. 코디네이터는 등록된 것끼리만
      // 줄을 세우므로, 한쪽만 등록하면 나머지는 그대로 독립 노출돼 겹친다.
      {
        file: 'src/adapters/components/SchoolYearWizard/TermStartPromptModal.tsx',
        priorities: ['TERM_START_PROMPT'],
        label: 'TermStartPromptModal',
      },
      {
        file: 'src/adapters/components/SchoolYearWizard/TermEndPromptModal.tsx',
        priorities: ['TERM_END_PROMPT'],
        label: 'TermEndPromptModal',
      },
    ];

    for (const spec of modalSpecs) {
      it(`${spec.label}이 useRegisterModal import 한다`, () => {
        const src = readSource(spec.file);
        expect(src).toMatch(/from\s+['"]@adapters\/hooks\/useRegisterModal['"]/);
      });

      for (let i = 0; i < spec.priorities.length; i++) {
        const priority = spec.priorities[i]!;
        const callIndex = spec.priorities.length > 1 ? ` (호출 ${i + 1})` : '';
        it(`${spec.label}이 ${priority} priority로 useRegisterModal 호출${callIndex}`, () => {
          const src = readSource(spec.file);
          // 정확한 호출 수 카운트 — OAuth 3종은 같은 priority 3번 호출되어야 함
          const matches = src.match(new RegExp(`useRegisterModal\\(\\s*['"]${priority}['"]`, 'g'));
          const expectedMin = spec.priorities.filter((p) => p === priority).length;
          expect(matches?.length ?? 0).toBeGreaterThanOrEqual(expectedMin);
        });
      }
    }
  });

  describe('priority enum 정합성 (useModalCoordinatorStore와 메타테스트 일치)', () => {
    it('useModalCoordinatorStore의 ModalPriority 8종이 메타테스트의 priority 목록과 일치', () => {
      const storeSource = readSource('src/adapters/stores/useModalCoordinatorStore.ts');
      const expectedPriorities = [
        'SECURITY_UPDATE',
        'FIRST_SYNC',
        'DRIVE_CONFLICT',
        'OAUTH_FLOW',
        'NORMAL_UPDATE',
        'EVENT_ALERT',
        'RECORD_REMINDER',
        // 학사 확인 팝업 2종 — 8월에 조건이 겹쳐 focus trap 두 개가 동시에 뜨던 경로를 막는다.
        // 코디네이터는 등록된 것끼리만 줄을 세우므로 한쪽만 넣으면 의미가 없다.
        'TERM_START_PROMPT',
        'TERM_END_PROMPT',
        'SHARE_PROMPT',
      ];
      for (const p of expectedPriorities) {
        expect(storeSource).toContain(p);
      }
    });
  });

  describe('학사 확인 팝업 2종이 동시에 뜨지 않는다 (2026-08 온보딩 사고 재발 방지)', () => {
    /**
     * 8월에 처음 쓰는 선생님은 개학일도 종료일도 등록돼 있지 않아 **두 팝업의 조건이 동시에
     * 참**이 된다. 둘 다 큐에 있으면 하나만 head가 되지만, 한쪽이라도 빠지면 그 창은 큐 밖에서
     * 독립적으로 떠서 focus trap이 겹친다 — 그게 입력칸 먹통 사고의 경로였다.
     */
    const now = Date.now();

    it('둘 다 열려 있으면 head는 하나뿐이고 개학일 쪽이 먼저다', () => {
      const entries = [
        { id: 'start', priority: 'TERM_START_PROMPT' as const, isOpen: true, registeredAt: now },
        { id: 'end', priority: 'TERM_END_PROMPT' as const, isOpen: true, registeredAt: now + 1 },
      ];
      expect(selectHead(entries)).toBe('start');
    });

    it('개학일을 답하고 나면 종료일 쪽이 head가 된다', () => {
      const entries = [
        { id: 'start', priority: 'TERM_START_PROMPT' as const, isOpen: false, registeredAt: now },
        { id: 'end', priority: 'TERM_END_PROMPT' as const, isOpen: true, registeredAt: now + 1 },
      ];
      expect(selectHead(entries)).toBe('end');
    });

    it('두 팝업은 기록 알림보다 늦고 코치 투어보다 이르다', () => {
      expect(PRIORITY_ORDER.RECORD_REMINDER).toBeLessThan(PRIORITY_ORDER.TERM_START_PROMPT);
      expect(PRIORITY_ORDER.TERM_START_PROMPT).toBeLessThan(PRIORITY_ORDER.TERM_END_PROMPT);
      expect(PRIORITY_ORDER.TERM_END_PROMPT).toBeLessThan(PRIORITY_ORDER.WIDGET_MODE_COACH);
    });

    it('더 급한 창(보안 업데이트·동기화 충돌)이 있으면 학사 확인은 뒤로 밀린다', () => {
      const entries = [
        { id: 'start', priority: 'TERM_START_PROMPT' as const, isOpen: true, registeredAt: now },
        {
          id: 'conflict',
          priority: 'DRIVE_CONFLICT' as const,
          isOpen: true,
          registeredAt: now + 1,
        },
      ];
      expect(selectHead(entries)).toBe('conflict');
    });
  });
});
