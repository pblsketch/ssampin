import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CLASSROOM_AGREEMENT_PRODUCTION_FILES = [
  'electron/ipc/classroomAgreement.ts',
  'src/App.tsx',
  'src/adapters/components/Layout/Sidebar.tsx',
  'src/adapters/components/Tools/ToolClassroomAgreement.tsx',
  'src/adapters/components/Tools/ToolsGrid.tsx',
  'src/adapters/constants/toolDefinitions.ts',
  'src/adapters/repositories/JsonClassroomAgreementRepository.ts',
  'src/adapters/stores/useClassroomAgreementStore.ts',
  'src/domain/entities/ClassroomAgreement.ts',
  'src/domain/repositories/IClassroomAgreementRepository.ts',
  'src/domain/rules/classroomAgreementPhaseRules.ts',
  'src/domain/rules/classroomAgreementRules.ts',
  'src/domain/rules/classroomAgreementSanitization.ts',
  'src/shared/wsProtocol/classroomAgreement.ts',
  'src/student/StudentApp.tsx',
  'src/student/StudentClassroomAgreementApp.tsx',
  'src/usecases/classroomAgreement/ClassroomAgreementClientTokenGuard.ts',
  'src/usecases/classroomAgreement/ClassroomAgreementRealtimeSession.ts',
] as const;

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+['"](?:openai|@openai\/[^'"]+|@google\/genai|ai|ai\/[^'"]+|@ai-sdk\/[^'"]+)['"]/i,
  /from\s+['"][^'"]*(?:chatgpt|chatbot|llm)[^'"]*['"]/i,
  /import\(\s*['"][^'"]*(?:openai|genai|ai-sdk|chatgpt|chatbot|llm)[^'"]*['"]\s*\)/i,
] as const;

const FORBIDDEN_PRODUCT_WORDING = [
  /AI\s*추천/i,
  /AI\s*자동/i,
  /자동\s*생성/,
  /생성형/,
  /추천\s*문장/,
  /OpenAI/i,
  /ChatGPT/i,
  /\bLLM\b/i,
] as const;

describe('classroom agreement non-AI and security regression gates', () => {
  it('keeps production files present for the regression scan', () => {
    for (const file of CLASSROOM_AGREEMENT_PRODUCTION_FILES) {
      expect(existsSync(file), `${file} should exist`).toBe(true);
    }
  });

  it('does not import AI/chatbot modules or use AI recommendation/generation wording', () => {
    for (const file of CLASSROOM_AGREEMENT_PRODUCTION_FILES) {
      const content = readFileSync(file, 'utf8');

      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        expect(content, `${file} must not import ${pattern.source}`).not.toMatch(pattern);
      }
      for (const pattern of FORBIDDEN_PRODUCT_WORDING) {
        expect(content, `${file} must not contain ${pattern.source}`).not.toMatch(pattern);
      }
    }
  });

  it('does not use dangerouslySetInnerHTML in classroom agreement production files', () => {
    for (const file of CLASSROOM_AGREEMENT_PRODUCTION_FILES) {
      const content = readFileSync(file, 'utf8');
      expect(content, `${file} must render escaped React text`).not.toMatch(
        /dangerouslySetInnerHTML/,
      );
    }
  });
});
