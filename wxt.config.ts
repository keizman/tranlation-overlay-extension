import { defineConfig } from 'wxt';
import removeConsole from 'vite-plugin-remove-console';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite';

// 从 package.json 读取版本号
const packageJson = JSON.parse(
  readFileSync(resolve('./package.json'), 'utf-8'),
);
const version = packageJson.version;

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Side Translation - 浸入式翻译助手',
    author: 'xiao1932794922@gmail.com' as any, // Firefox requires string, not object (WXT type mismatch)
    description: `Side Translation turns browsing into language learning. AI uses "i+1" theory, supports 20+ languages.`,
    version,
    // Firefox 增量更新配置
    browser_specific_settings: {
      gecko: {
        id: '{ec1a757b-3969-4e9a-86e9-c9cd54028a1f}',
        update_url: 'https://storage.planktonfly.com/updates/update.json',
        strict_min_version: '109.0',
      },
    },
    // contextMenus not supported on Firefox Android, use only common permissions
    permissions: ['storage', 'notifications', 'activeTab', 'webNavigation'],
    host_permissions: ['<all_urls>', 'https://api.github.com/*'],
    // commands not fully supported on Firefox Android, but kept for desktop
    commands: {
      'translate-page': {
        suggested_key: {
          default: 'Alt+Z',
          mac: 'Command+Z',
        },
        description: '一键翻译',
      },
    },
  },
  imports: {
    eslintrc: {
      enabled: 9,
    },
  },
  vite: (configEnv) => ({
    plugins: [
      tailwindcss(),
      VueI18nPlugin({
        // 自动加载语言包文件
        include: [
          resolve(
            dirname(fileURLToPath(import.meta.url)),
            './src/i18n/locales/**',
          ),
        ],
        // 支持 JSON 和 YAML 格式
        forceStringify: true,
        // 启用运行时优化
        runtimeOnly: false,
        // 自动生成类型定义
        compositionOnly: true,
        // 支持嵌套结构
        fullInstall: true,
      }),
      configEnv.mode === 'production'
        ? [removeConsole({ includes: ['log', 'warn'] })]
        : [],
    ],
  }),
});
