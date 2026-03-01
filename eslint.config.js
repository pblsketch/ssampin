import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            '@typescript-eslint/no-unused-vars': 'off',
            'no-useless-assignment': 'off'
        }
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
