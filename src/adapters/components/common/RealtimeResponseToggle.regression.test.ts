/**
 * 회귀 차단 메타 테스트 — `realtimeResponseView` 토글이 3 도구에 통합 상태 유지.
 *
 * Design §8.3 / §11 — 누군가 무심코 토글 import나 분기 렌더를 지우면 즉시 실패.
 * grep 기반 검증이라 jsdom 없이 동작.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');

const TOOL_FILES = [
  'src/adapters/components/Tools/ToolPoll.tsx',
  'src/adapters/components/Tools/ToolSurvey.tsx',
  'src/adapters/components/Tools/ToolMultiSurvey.tsx',
];

const COMMON_FILE = 'src/adapters/components/common/RealtimeResponseToggle.tsx';

describe('regression: realtime response view toggle 3-tool integration', () => {
  describe('공통 컴포넌트 정착', () => {
    it('RealtimeResponseToggle 공통 컴포넌트 파일 존재 + 핵심 패턴', () => {
      const src = readFileSync(resolve(ROOT, COMMON_FILE), 'utf-8');
      expect(src).toContain('export const REALTIME_RESPONSE_WARN_KEY');
      expect(src).toContain('ssampin-realtime-response-toggle-warned-v1');
      expect(src).toContain('role="switch"');
      expect(src).toContain('aria-checked');
      expect(src).toContain('decideToggleAction');
    });
  });

  describe('3 도구 통합 상태', () => {
    for (const file of TOOL_FILES) {
      describe(file, () => {
        it('RealtimeResponseToggle 임포트', () => {
          const src = readFileSync(resolve(ROOT, file), 'utf-8');
          expect(src).toMatch(
            /import\s*\{\s*RealtimeResponseToggle\s*\}\s*from\s*['"]@adapters\/components\/common\/RealtimeResponseToggle['"]/,
          );
        });

        it('realtimeResponseView state 사용', () => {
          const src = readFileSync(resolve(ROOT, file), 'utf-8');
          expect(src).toMatch(/setRealtimeResponseView/);
          // useState로 선언되고 set이 존재함
          expect(src).toMatch(/\[realtimeResponseView,\s*setRealtimeResponseView\]/);
        });

        it('CreateView 영역에 토글 컴포넌트 렌더', () => {
          const src = readFileSync(resolve(ROOT, file), 'utf-8');
          expect(src).toContain('<RealtimeResponseToggle');
        });
      });
    }
  });

  describe('도구별 분기 렌더 보존', () => {
    it('ToolSurvey: realtimeResponseView ? text : "학생 제출 완료"', () => {
      const src = readFileSync(
        resolve(ROOT, 'src/adapters/components/Tools/ToolSurvey.tsx'),
        'utf-8',
      );
      // 분기 렌더의 ternary 패턴 존재 + 폴백 카피
      expect(src).toContain('학생 제출 완료');
      expect(src).toMatch(/realtimeResponseView\s*\?/);
    });

    it('ToolMultiSurvey: renderAnswerPreview 헬퍼 export + 분기 사용', () => {
      const src = readFileSync(
        resolve(ROOT, 'src/adapters/components/Tools/ToolMultiSurvey.tsx'),
        'utf-8',
      );
      expect(src).toContain('export function renderAnswerPreview');
      expect(src).toMatch(/renderAnswerPreview\(q,\s*answer/);
    });

    it('ToolPoll: 라이브 시작 시 setShowResults(realtimeResponseView) 동기화', () => {
      const src = readFileSync(
        resolve(ROOT, 'src/adapters/components/Tools/ToolPoll.tsx'),
        'utf-8',
      );
      expect(src).toMatch(/setShowResults\(realtimeResponseView\)/);
    });

    it('ToolPoll: "결과 보기" 버튼에 호버 툴팁 정착', () => {
      const src = readFileSync(
        resolve(ROOT, 'src/adapters/components/Tools/ToolPoll.tsx'),
        'utf-8',
      );
      expect(src).toContain('라이브 중 즉석 토글');
      expect(src).toContain('[실시간 답변 확인]을 켜면');
    });
  });

  describe('ToolTemplate 스키마 영속화', () => {
    it('도메인 엔티티에 realtimeResponseView 옵션 필드 정의', () => {
      const src = readFileSync(resolve(ROOT, 'src/domain/entities/ToolTemplate.ts'), 'utf-8');
      // PollTemplateConfig, SurveyTemplateConfig, MultiSurveyTemplateConfig 모두에 추가됐는지
      const occurrences = src.match(/realtimeResponseView\?:\s*boolean/g);
      expect(occurrences?.length ?? 0).toBeGreaterThanOrEqual(3);
    });
  });
});
