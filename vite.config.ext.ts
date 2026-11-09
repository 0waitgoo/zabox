import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * 浏览器扩展构建配置（扩展线第 1 步；与网站版 vite.config.ts 完全隔离，互不影响）：
 * - base './'：扩展页面是 chrome-extension://<id>/index.html，资源必须相对路径；
 * - 产物单独出到 dist-ext/，网站版 dist/ 不受任何影响；
 * - public/ 照常整体拷贝（logo、icon_APP 等运行时文件在扩展内以站点根路径可达）；
 * - 收尾插件把 public-ext/icons/ 拷到 dist-ext/icons/ 并生成 MV3 manifest.json
 *   （version 取 package.json 的 version，单一事实源，不手写两份）。
 */
function extensionAssets(): Plugin {
  return {
    name: 'zabox-extension-assets',
    closeBundle() {
      const root = __dirname;
      const outDir = path.resolve(root, 'dist-ext');
      const iconsSrc = path.resolve(root, 'public-ext/icons');
      const iconsDst = path.join(outDir, 'icons');
      fs.mkdirSync(iconsDst, { recursive: true });
      for (const f of fs.readdirSync(iconsSrc)) {
        if (f.endsWith('.png')) fs.copyFileSync(path.join(iconsSrc, f), path.join(iconsDst, f));
      }
      // 后台脚本（网页右键菜单）：纯 chrome.* API，不打包、原样拷入
      fs.copyFileSync(path.resolve(root, 'public-ext/background.js'), path.join(outDir, 'background.js'));
      const pkg = JSON.parse(fs.readFileSync(path.resolve(root, 'package.json'), 'utf8')) as { version: string };
      const manifest = {
        manifest_version: 3,
        // 名称与描述必须用 __MSG__ 占位（2026-11-09，微软官方文档）：
        // 写死字符串时 Partner Center 的商店列表只认出一种语言，哪怕包里有 _locales；
        // 占位符指向 public/_locales/<语言>/messages.json 里的 app_name / app_description，
        // 浏览器显示的名字仍是“杂盒 ZaBox”，不变
        name: '__MSG_app_name__',
        version: pkg.version,
        // 默认语言：包里有了 _locales 目录后 Chromium 要求必须声明
        default_locale: 'en',
        description: '__MSG_app_description__',
        chrome_url_overrides: { newtab: 'index.html' },
        // action：点工具栏图标弹出添加面板（popup.html）；sidePanel：面板里「打开侧边栏」
        // 用同一份新标签页；tabs：添加面板只读当前标签的标题与网址（不读历史）。
        action: {
          default_popup: 'popup.html',
          default_title: '杂盒 ZaBox',
          default_icon: {
            '16': 'icons/icon-16.png',
            '32': 'icons/icon-32.png',
            '48': 'icons/icon-48.png',
            '128': 'icons/icon-128.png',
          },
        },
        side_panel: { default_path: 'index.html' },
        // background：右键菜单「添加到杂盒主页」的 service worker；contextMenus：注册该菜单
        background: { service_worker: 'background.js' },
        permissions: ['storage', 'tabs', 'sidePanel', 'contextMenus'],
        host_permissions: ['https://zahe.hiitun.top/*'],
        icons: {
          '16': 'icons/icon-16.png',
          '32': 'icons/icon-32.png',
          '48': 'icons/icon-48.png',
          '128': 'icons/icon-128.png',
        },
      };
      fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
    plugins: [react(), tailwindcss(), extensionAssets()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'dist-ext',
      emptyOutDir: true,
      // 双入口：index.html（新标签页/侧边栏）+ popup.html（添加面板），各自独立产物；
      // 网站版构建（vite.config.ts）不读此配置，popup 绝不会进网站版 dist/。
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'index.html'),
          popup: path.resolve(__dirname, 'popup.html'),
        },
      },
    },
  };
});
