import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { tryDesktopLoginBridge } from './services/desktopLoginBridge';
import './index.css';
import { applyDisplayPrefs, loadDisplayPrefs } from './store/displayPrefs';

// 首帧渲染前先把本机显示偏好（主题/底框透明度）落到 <html>，避免白天模式用户先闪一帧暗夜
applyDisplayPrefs(loadDisplayPrefs());

// PWA（第一百一十五轮）：注册 Service Worker 以满足安装条件；扩展构建（VITE_ZABOX_EXT）
// 不走这条——扩展新标签页不读网站版 manifest，也不注册网站版 SW
if ('serviceWorker' in navigator && !(import.meta as unknown as { env?: Record<string, string> }).env?.VITE_ZABOX_EXT) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

void tryDesktopLoginBridge().then((handled) => {
  if (handled) return;
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
