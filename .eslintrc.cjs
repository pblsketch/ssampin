/** @type {import('eslint').Linter.Config} */
module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    env: {
        browser: true,
        es2020: true,
        node: true
    },
    ignorePatterns: ['dist', 'dist-electron', '.eslintrc.cjs'],
    overrides: [
        {
            files: ['src/domain/**/*'],
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
            files: ['src/usecases/**/*'],
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
            files: ['src/adapters/**/*'],
            excludedFiles: ['src/adapters/di/**/*'],
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
            files: ['src/infrastructure/**/*'],
            rules: {
                'no-restricted-imports': ['error', {
                    patterns: [{
                        group: ['@usecases/*', '@adapters/*'],
                        message: 'Infrastructure layer should only depend on Domain (ports).'
                    }]
                }]
            }
        }
    ]
};
