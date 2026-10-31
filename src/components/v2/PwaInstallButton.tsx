import React, { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { useLang } from '../../i18n/useLang';

/** 安装前事件（TS DOM 库未内置，本地最小定义） */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * 「下载 / 安装」按钮（第一百一十五轮）：顶栏搜索框与「数据」之间的下载图标，
 * 点开即把网站装成手机/桌面应用（PWA），不用走小程序。
 * 行为：浏览器已触发安装条件时点按直接弹系统安装框；否则弹手动指引
 * （iOS Safari：分享 → 添加到主屏幕；安卓/桌面 Chrome：菜单 → 添加到主屏幕/安装应用）。
 * 已是独立运行态（standalone）时不渲染——装过的设备不再占顶栏位置。
 * 形态与顶栏其他图标同款：无底色、白色图标；浮层与预设/数据菜单同款实色面板 + 点外关闭。
 */
export default function PwaInstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useLang();

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) setInstalled(true);
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setInstalled(true);
      setOpen(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  if (installed) return null;

  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') setDeferred(null);
      return;
    }
    setOpen((v) => !v);
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        onClick={() => void handleClick()}
        title={t('nav.pwaTitle')}
        aria-label={t('nav.pwaAria')}
        data-testid="topnav-pwa-install"
        className={`p-2 sm:p-2.5 rounded-xl flex items-center justify-center transition-colors duration-300 ${
          open ? 'text-white' : 'text-white/55 hover:text-white'
        }`}
      >
        <Download size={20} />
      </button>

      {open && (
        <div
          data-pwa-install-guide
          className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-24px)] rounded-3xl bg-[#17171d] border border-white/15 p-3.5 shadow-2xl shadow-black/70 z-50"
        >
          <p className="text-[13px] font-medium text-white/90 pb-1.5">{t('nav.pwaHeading')}</p>
          {isIOS ? (
            <p className="text-[12px] leading-relaxed text-white/60">
              {t('nav.pwaIos')}
            </p>
          ) : (
            <p className="text-[12px] leading-relaxed text-white/60">
              {t('nav.pwaOther')}
            </p>
          )}
          <p className="pt-2 text-[11px] text-white/35">{t('nav.pwaNote')}</p>
        </div>
      )}
    </div>
  );
}
