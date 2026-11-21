import js from '@eslint/js';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';

const jsx = {
  rules: {
    'uses-vars': {
      create(context) {
        return {
          JSXIdentifier(node) {
            if (node.parent.type === 'JSXMemberExpression' && node.parent.object !== node) return;
            if (/^[A-Z_$]/.test(node.name)) context.sourceCode.markVariableAsUsed(node.name, node);
          },
        };
      },
    },
  },
};

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**', '.agents/**', '.audit/**'] },
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser, ...globals.node }, parserOptions: { ecmaFeatures: { jsx: true } } },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
    plugins: { jsx, 'react-hooks': hooks },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'jsx/uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
];
