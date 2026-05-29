import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import noPiiInLogs from './eslint-rules/no-pii-in-logs.js';
import noPiiBrandAssertion from './eslint-rules/no-pii-brand-assertion.js';

/**
 * 학생 PII 보호용 로컬 ESLint 룰 (ADR Decision 8)
 * - 'pii/no-pii-in-logs'         : PII 필드 로깅 차단
 * - 'pii/no-pii-brand-assertion' : NoPii 브랜드 캐스팅 차단
 *
 * (P5 완료: LegacyStudentView 어댑터 및 'no-legacy-student-view-in-new-code' 룰
 *  sunset 완료. allow-list = 0 달성 후 룰·정의·디렉토리 삭제.)
 */
export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        plugins: {
            pii: {
                rules: {
                    'no-pii-in-logs': noPiiInLogs,
                    'no-pii-brand-assertion': noPiiBrandAssertion,
                },
            },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': 'off',
            'no-useless-assignment': 'off',
            'pii/no-pii-in-logs': 'error',
            'pii/no-pii-brand-assertion': 'error',
        },
    },
    {
        files: ['src/domain/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [{
                    group: ['@usecases/*', '@adapters/*', '@infrastructure/*'],
                    message: 'Domain layer cannot depend on outer layers.'
                }]
            }]
        }
    },
    {
        files: ['src/usecases/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [{
                    group: ['@adapters/*', '@infrastructure/*'],
                    message: 'UseCases layer cannot depend on adapters or infrastructure.'
                }]
            }]
        }
    },
    {
        files: ['src/adapters/**/*.{ts,tsx}'],
        ignores: ['src/adapters/di/**/*'],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [{
                    group: ['@infrastructure/*'],
                    message: 'Adapters layer cannot depend on infrastructure (except in DI).'
                }]
            }]
        }
    },
    {
        files: ['src/infrastructure/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [{
                    group: ['@usecases/*', '@adapters/*'],
                    message: 'Infrastructure layer should only depend on Domain (ports).'
                }]
            }]
        }
    }
);
