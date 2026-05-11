import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-useless-assignment': 'off',
    },
  },
  {
    // React Hooks 룰 — 소스 곳곳의 `// eslint-disable react-hooks/exhaustive-deps`
    // 디렉티브가 해석되도록 플러그인을 등록한다. (v7 의 React Compiler 룰셋은 미사용 — 클래식 2종만)
    // TODO: rules-of-hooks 위반 13건(RealtimeWallCard 등 — 조기 return 이후 hook 호출)
    //       정리 후 'warn' → 'error' 로 승격.
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@usecases/*', '@adapters/*', '@infrastructure/*'],
              message: 'Domain layer cannot depend on outer layers.',
            },
          ],
        },
      ],
    },
  },
  {
    // TODO: usecases/adapters → infrastructure 직접 import 위반 57건(주로 @infrastructure/utils/uuid,
    //       @infrastructure/supabase/*, @infrastructure/export, @infrastructure/weather 등)이 누적돼 있어
    //       현재는 'warn'. 점진적으로 DI 경유로 리팩토링한 뒤 'error' 로 승격할 것.
    //       (domain·infrastructure 레이어 경계 규칙은 위반 0건이므로 'error' 유지)
    files: ['src/usecases/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['@adapters/*', '@infrastructure/*'],
              message: 'UseCases layer cannot depend on adapters or infrastructure.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/adapters/**/*.{ts,tsx}'],
    ignores: ['src/adapters/di/**/*'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['@infrastructure/*'],
              message: 'Adapters layer cannot depend on infrastructure (except in DI).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/infrastructure/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@usecases/*', '@adapters/*'],
              message: 'Infrastructure layer should only depend on Domain (ports).',
            },
          ],
        },
      ],
    },
  },
);
