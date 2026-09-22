import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

/* ==========================================================================
   ESLint 扁平配置（ESLint 10）
     npm run lint      检查
     npm run lint:fix  自动修复

   两个刻意的取舍，说明一下免得以后自己看不懂：

   1. 没有用 eslint-plugin-react。
      它目前（7.37.x）只声明支持到 ESLint 9，装上来会和 ESLint 10 冲突。
      本项目是纯 JS 组件、不用 prop-types，少的主要是 jsx-key 这类 JSX 规则；
      而"组件被 JSX 使用了却报未使用"这个坑，靠下面 no-unused-vars 里的
      varsIgnorePattern: '^[A-Z_]' 就能避开（组件名首字母本来就是大写）。

   2. 只启用了 react-hooks 的两条经典规则，没有整包套用它的 recommended。
      因为 v7 的 recommended 包含了整套 React Compiler 规则
      （set-state-in-effect / refs / purity / immutability ...），
      那些规则是为"准备接入 React Compiler"的代码库准备的，
      本项目没有用编译器，套上来只会逼出一堆无意义的改写。
   ========================================================================== */

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.npm-cache/**',
      '.verify/**',
      'docs/**',
      'coverage/**',
    ],
  },

  // 全项目通用规则
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,

      // Hooks 的两条核心规则：调用顺序、依赖数组
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // 组件名首字母大写 → 视为"可能被 JSX 使用"，不报未使用
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // 只有组件文件才需要"热更新友好"这条规则，数据/工具文件不该被它管
  {
    files: ['src/components/**/*.jsx', 'src/App.jsx'],
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
]
