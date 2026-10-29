import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€"file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          // 只代理接口请求（/api?type=...）；/api/ 目录下的静态模块文件
          // （如 ranking-data.js）放行给 Vite 本地处理，否则 dev 下会白屏。
          bypass(req) {
            if (req.url && /\/api\/[^?]+\.(js|ts|json)/.test(req.url)) {
              return req.url;
            }
          },
        },
      },
    },
  };
});
