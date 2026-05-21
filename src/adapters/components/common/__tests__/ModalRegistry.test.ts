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
    it('useModalCoordinatorStore의 ModalPriority 7종이 메타테스트의 priority 목록과 일치', () => {
      const storeSource = readSource('src/adapters/stores/useModalCoordinatorStore.ts');
      const expectedPriorities = [
        'SECURITY_UPDATE',
        'FIRST_SYNC',
        'DRIVE_CONFLICT',
        'OAUTH_FLOW',
        'NORMAL_UPDATE',
        'EVENT_ALERT',
        'SHARE_PROMPT',
      ];
      for (const p of expectedPriorities) {
        expect(storeSource).toContain(p);
      }
    });
  });
});
