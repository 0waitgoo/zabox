import React, { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Square,
  X,
} from 'lucide-react';
import DesktopPlanWorkspace from './components/v2/DesktopPlanWorkspace';
import PlanSyncBar from './components/v2/PlanSyncBar';
import PlanTitleBar from './components/v2/PlanTitleBar';
import PinButton from './components/v2/PinButton';
import DesktopCreateMenu, { type CreateKind } from './components/v2/DesktopCreateMenu';
import { DesktopPinController, loadAlwaysOnTop } from './components/v2/desktopPin';
import PlanSettings from './components/v2/PlanSettings';
import { CUSTOM_BACKGROUND_KEY, backgroundColorRgb, loadCustomBackground, normalizeBackgroundColor, themeForBackground } from './components/v2/desktopAppearance';
import PlanAiView from './components/v2/PlanAiView';
import {
  currentMonitor,
  LogicalSize,
  PhysicalPosition,
  PhysicalSize,
} from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { DesktopWindowController } from './components/v2/desktopWindow';
import { useDesktopDrag } from './components/v2/useDesktopDrag';
import { planWindow } from './components/v2/planWindow';
import { applyCloseAction, loadMinimizeOnClose, saveMinimizeOnClose } from './components/v2/desktopClose';
import { useLocalStore } from './store/localStore';
import './index.css';
import './desktop-theme.css';
import { applyDisplayPrefs, loadDisplayPrefs } from './store/displayPrefs';

// 首帧先落本机显示偏好（与网站版 main.tsx 同款，避免闪一帧）
applyDisplayPrefs(loadDisplayPrefs());

const OPACITY_KEY = 'zabox-plan-opacity';
const THEME_KEY = 'zabox-plan-theme';

export type PlanTheme = 'dark' | 'light';

function loadOpacity(): number {
  try {
    const raw = localStorage.getItem(OPACITY_KEY);
    if (raw === null) return 100;
    const v = Number(raw);
    return Number.isFinite(v) ? Math.min(100, Math.max(50, v)) : 100;
  } catch {
    return 100;
  }
}

function loadTheme(): PlanTheme {
  const custom = loadCustomBackground();
  if (custom) return themeForBackground(custom);
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

// 桌面版主题独立于网站偏好：启动时立即覆盖 <html> 的 data-theme，
// 否则网站白天偏好会透进计划面板（index.css 的 [data-theme="light"] 规则按祖先匹配）。
try {
  document.documentElement.dataset.theme = loadTheme();
} catch {
  /* 忽略 */
}

type Edge = 'left' | 'right' | 'top' | 'bottom';

/** 底色 rgba：透明度滑杆只改底色，字体保持不透明（第 4 轮口径） */
const rgba = (rgb: [number, number, number], alpha: number) =>
  `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${alpha})`;
const DARK_BG: [number, number, number] = [23, 23, 29];
const LIGHT_BG: [number, number, number] = [242, 242, 245];
const DARK_HANDLE: [number, number, number] = [42, 42, 53];
const LIGHT_HANDLE: [number, number, number] = [220, 220, 226];

/** Desktop window changes are serialized; edge hiding runs only after a drag. */
function PlanApp() {
  const store = useLocalStore();
  const [opacity, setOpacity] = useState(loadOpacity);
  const [theme, setTheme] = useState<PlanTheme>(loadTheme);
  const [customColor, setCustomColor] = useState<string | null>(loadCustomBackground);
  const [minimizeOnClose, setMinimizeOnClose] = useState(loadMinimizeOnClose);
  const minimizeOnCloseRef = useRef(minimizeOnClose);
  minimizeOnCloseRef.current = minimizeOnClose;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pinned, setPinned] = useState(loadAlwaysOnTop);
  const [pinBusy, setPinBusy] = useState(false);
  const pinControllerRef = useRef<DesktopPinController | null>(null);
  if (!pinControllerRef.current) {
    const win = planWindow();
    if (win) pinControllerRef.current = new DesktopPinController(
      (value) => win.setAlwaysOnTop(value),
      { getItem: (key) => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) },
      setPinned,
    );
  }
  const [toolbarBottom, setToolbarBottom] = useState(false);
  const [headerOnly, setHeaderOnly] = useState(false);
  const [autoLogin, setAutoLogin] = useState(false);
  const [collapsed, setCollapsed] = useState<Edge | null>(null);
  const [aiView, setAiView] = useState<'main' | 'ai'>('main');
  const [createMenu, setCreateMenu] = useState<{ x: number; y: number } | null>(null);
  const closeCreateMenu = useCallback(() => setCreateMenu(null), []);
  const [activeSection, setActiveSection] = useState<CreateKind>('task');
  const [createTarget, setCreateTarget] = useState<CreateKind | null>(null);
  const [windowError, setWindowError] = useState<string | null>(null);
  const controllerRef = useRef<DesktopWindowController | null>(null);
  const restoreTimer = useRef<number | null>(null);
  const previewTimer = useRef<number | null>(null);
  const pointerInside = useRef(false);
  if (!controllerRef.current) {
    const win = planWindow();
    if (win) controllerRef.current = new DesktopWindowController({
      readRect: async () => {
        const [pos, size] = await Promise.all([win.outerPosition(), win.innerSize()]);
        return { x: pos.x, y: pos.y, width: size.width, height: size.height };
      },
      readOuterRect: async () => {
        const [pos, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
        return { x: pos.x, y: pos.y, width: size.width, height: size.height };
      },
      scaleFactor: () => win.scaleFactor(),
      readWorkArea: async () => {
        const area = (await currentMonitor())?.workArea;
        return area ? { x: area.position.x, y: area.position.y, width: area.size.width, height: area.size.height } : null;
      },
      setSize: (width, height) => win.setSize(new PhysicalSize(width, height)),
      setMinSize: (width, height) => win.setMinSize(new LogicalSize(width, height)),
      setPosition: (x, y) => win.setPosition(new PhysicalPosition(x, y)),
      isMaximized: () => win.isMaximized(),
      unmaximize: () => win.unmaximize(),
      toggleMaximize: () => win.toggleMaximize(),
    }, () => {
      setHeaderOnly(controllerRef.current!.headerOnly);
      setToolbarBottom(controllerRef.current!.toolbarBottom);
      setCollapsed(controllerRef.current!.edge);
    });
  }
  useDesktopDrag();

  const reportWindowError = (error: unknown) => {
    console.error('Desktop window operation failed', error);
    setWindowError('窗口操作失败，请重试；可从系统托盘重新显示窗口。');
  };

  useEffect(() => {
    const pin = pinControllerRef.current;
    if (!pin) return;
    let disposed = false;
    setPinBusy(true);
    void pin.initialize().catch((error) => {
      if (!disposed) reportWindowError(error);
    }).finally(() => { if (!disposed) setPinBusy(false); });
    return () => { disposed = true; };
  }, []);

  const changeMinimizeOnClose = (value: boolean) => {
    minimizeOnCloseRef.current = value;
    setMinimizeOnClose(value);
    saveMinimizeOnClose(value);
  };
  const handleClose = async () => {
    const win = planWindow();
    if (!win) return;
    try {
      await applyCloseAction(minimizeOnCloseRef.current, win,
        async () => { await controllerRef.current?.restoreEdge(); });
    } catch (error) { reportWindowError(error); }
  };
  const startCreate = async (kind: CreateKind) => {
    setCreateMenu(null);
    try {
      await controllerRef.current?.restoreEdge();
      await controllerRef.current?.exitHeader();
      setSettingsOpen(false);
      setAiView('main');
      setActiveSection(kind);
      setCreateTarget(kind);
    } catch (error) { reportWindowError(error); }
  };
  useEffect(() => {
    if (!createTarget || settingsOpen || aiView !== 'main' || headerOnly || collapsed) return;
    let nextFrame = 0;
    const focus = () => {
      const input = document.querySelector<HTMLInputElement>(createTarget === 'task'
        ? '[data-task-add]' : '[data-plan-form] input');
      input?.scrollIntoView({ block: 'nearest' });
      input?.focus();
      setCreateTarget(null);
    };
    const frame = requestAnimationFrame(() => {
      if (createTarget === 'plan' && !document.querySelector('[data-plan-form]')) {
        document.querySelector<HTMLButtonElement>('[data-plan-new]')?.click();
        nextFrame = requestAnimationFrame(focus);
      } else focus();
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(nextFrame); };
  }, [createTarget, settingsOpen, aiView, headerOnly, collapsed]);

  const closeLabel = minimizeOnClose ? '收进托盘' : '关闭窗口';

  const togglePin = async () => {
    const pin = pinControllerRef.current;
    if (!pin || pinBusy) return;
    setPinBusy(true);
    try { await pin.toggle(); } catch (error) { reportWindowError(error); }
    finally { setPinBusy(false); }
  };

  // html/body 背景透明（index.css 给 body 定了 #050505，行内样式压过它）
  useEffect(() => {
    try {
      document.documentElement.style.backgroundColor = 'transparent';
      document.body.style.backgroundColor = 'transparent';
    } catch {
      /* 忽略 */
    }
  }, []);

  const changeOpacity = (v: number) => {
    setOpacity(v);
    try {
      localStorage.setItem(OPACITY_KEY, String(v));
    } catch {
      /* 忽略 */
    }
  };

  const applyTheme = (t: PlanTheme) => {
    setTheme(t);
    try {
      localStorage.setItem(THEME_KEY, t);
      document.documentElement.dataset.theme = t;
    } catch {
      /* 忽略 */
    }
  };

  const changeTheme = (t: PlanTheme) => {
    setCustomColor(null);
    try { localStorage.removeItem(CUSTOM_BACKGROUND_KEY); } catch { /* session remains usable */ }
    applyTheme(t);
  };
  const changeCustomColor = (value: string) => {
    const color = normalizeBackgroundColor(value);
    if (!color) return;
    setCustomColor(color);
    try { localStorage.setItem(CUSTOM_BACKGROUND_KEY, color); } catch { /* session remains usable */ }
    applyTheme(themeForBackground(color));
  };

  const restoreFromCollapse = async () => {
    if (restoreTimer.current !== null) {
      window.clearTimeout(restoreTimer.current);
      restoreTimer.current = null;
    }
    try { await controllerRef.current?.restoreEdge(); } catch (error) { reportWindowError(error); }
  };
  const scheduleRestore = () => {
    if (restoreTimer.current !== null) return;
    restoreTimer.current = window.setTimeout(() => { void restoreFromCollapse(); }, 200);
  };
  const cancelScheduledRestore = () => {
    if (restoreTimer.current !== null) window.clearTimeout(restoreTimer.current);
    restoreTimer.current = null;
  };
  const cancelPreviewTimer = () => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    previewTimer.current = null;
  };
  const previewEnter = () => {
    pointerInside.current = true;
    cancelPreviewTimer();
    if (!controllerRef.current?.headerOnly) return;
    previewTimer.current = window.setTimeout(() => {
      previewTimer.current = null;
      void controllerRef.current?.previewHeader().then(() => {
        // The pointer can leave while a native resize is pending.
        if (!pointerInside.current) return controllerRef.current?.closePreview();
      }).catch(reportWindowError);
    }, 220);
  };
  const previewLeave = () => {
    pointerInside.current = false;
    cancelPreviewTimer();
    if (!controllerRef.current?.previewing) return;
    previewTimer.current = window.setTimeout(() => {
      previewTimer.current = null;
      void controllerRef.current?.closePreview().catch(reportWindowError);
    }, 300);
  };
  const enterHeaderOnly = async () => {
    try { await controllerRef.current?.enterHeader(); } catch (error) { reportWindowError(error); }
  };
  const exitHeaderOnly = async () => {
    try { await controllerRef.current?.exitHeader(); } catch (error) { reportWindowError(error); }
  };
  const handleToggleMaximize = async () => {
    try { await controllerRef.current?.maximize(); } catch (error) { reportWindowError(error); }
  };

  useEffect(() => {
    const win = planWindow();
    if (!win) return;
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    void win.onResized(() => {
      void controllerRef.current?.handleResize().catch(reportWindowError);
    }).then((stop) => {
      if (disposed) stop(); else unlisteners.push(stop);
    }).catch(reportWindowError);
    void win.onCloseRequested((event) => {
      if (!minimizeOnCloseRef.current) return;
      event.preventDefault();
      void applyCloseAction(true, win, async () => { await controllerRef.current?.restoreEdge(); })
        .catch(reportWindowError);
    }).then((stop) => {
      if (disposed) stop(); else unlisteners.push(stop);
    }).catch(reportWindowError);
    void listen('window-restore', () => { void restoreFromCollapse(); }).then((stop) => {
      if (disposed) stop(); else unlisteners.push(stop);
    }).catch(reportWindowError);
    void listen('tray-toggle', async () => {
      try {
        const win = planWindow();
        if (controllerRef.current?.edge) await restoreFromCollapse();
        else if (win) await applyCloseAction(true, win, async () => {});
      } catch (error) { reportWindowError(error); }
    }).then((stop) => {
      if (disposed) stop(); else unlisteners.push(stop);
    }).catch(reportWindowError);
    const onDragEnd = async () => {
      try {
        const monitor = await currentMonitor();
        if (disposed || !monitor) return;
        const area = monitor.workArea;
        const root = document.querySelector('[data-plan-desktop]')?.getBoundingClientRect();
        const limit = document.querySelector('[data-plan-dock-limit]')?.getBoundingClientRect();
        const bar = document.querySelector('[data-plan-titlebar]')?.getBoundingClientRect();
        const row = document.querySelector('[data-plan-dock-row]')?.getBoundingClientRect();
        if (!root || !limit || !bar) return;
        const dockRegion = {
          x: 0, y: bar.top - root.top, width: limit.right - root.left,
          height: Math.max(40, row && row.height > 0 ? row.bottom - bar.top : 40),
        };
        await controllerRef.current?.collapse({
          x: area.position.x, y: area.position.y,
          width: area.size.width, height: area.size.height,
        }, dockRegion);
      } catch (error) { if (!disposed) reportWindowError(error); }
    };
    const onError = (event: Event) => reportWindowError((event as CustomEvent).detail);
    window.addEventListener('plan-drag-end', onDragEnd);
    window.addEventListener('plan-window-error', onError);
    return () => {
      disposed = true;
      unlisteners.forEach((stop) => stop());
      cancelScheduledRestore();
      cancelPreviewTimer();
      window.removeEventListener('plan-drag-end', onDragEnd);
      window.removeEventListener('plan-window-error', onError);
    };
  }, []);

  const light = theme === 'light';
  const customRgb = customColor ? backgroundColorRgb(customColor) : null;
  const bg = rgba(customRgb ?? (light ? LIGHT_BG : DARK_BG), opacity / 100);
  const handleBg = rgba(customRgb ?? (light ? LIGHT_HANDLE : DARK_HANDLE), opacity / 100);
  const textCls = light ? 'text-zinc-900' : 'text-white';

  // 收起态：只渲染一条 24px 细边 + 小把手（窗口其余部分已滑出屏幕外）。
  // 右边缘收起时露的是窗口左沿 → 把手放左；左边缘收起时露右沿 → 把手放右；
  // 上边缘收起时露底沿 → 把手放底部；下边缘收起时露顶沿 → 把手放顶部。
  // 细边上另带一个 ✕：收起时不用展开也能直接关窗口。
  // 图标统一用 lucide（第 6 轮，与标题栏同款，不再混排文字符号）。
  const renderEdge = () => {
    const chevronIcon =
      collapsed === 'right' ? (
        <ChevronLeft size={14} />
      ) : collapsed === 'left' ? (
        <ChevronRight size={14} />
      ) : collapsed === 'top' ? (
        <ChevronDown size={14} />
      ) : (
        <ChevronUp size={14} />
      );
    const chevronBtn = (
      <button
        type="button"
        aria-label="展开窗口"
        onMouseEnter={scheduleRestore}
        onMouseLeave={cancelScheduledRestore}
        onClick={() => void restoreFromCollapse()}
        className={`flex-1 flex items-center justify-center transition-colors cursor-pointer hover:bg-indigo-500/80 hover:text-white ${
          light ? 'text-zinc-700' : 'text-white/85'
        }`}
      >
        {chevronIcon}
      </button>
    );
    const closeBtn = (
      <button
        type="button"
        aria-label={closeLabel}
        title={closeLabel}
        onClick={() => void handleClose()}
        className={`shrink-0 flex items-center justify-center transition-colors cursor-pointer hover:bg-red-500/80 hover:text-white ${
          light ? 'text-zinc-700' : 'text-white/85'
        } ${collapsed === 'top' || collapsed === 'bottom' ? 'w-[24px] h-full' : 'w-full h-[24px]'}`}
      >
        <X size={12} />
      </button>
    );
    const strip =
      collapsed === 'top' || collapsed === 'bottom' ? (
        <div className="w-full h-[24px] flex flex-row" style={{ backgroundColor: handleBg }}>
          {chevronBtn}
          {closeBtn}
        </div>
      ) : (
        <div className="w-[24px] h-full flex flex-col" style={{ backgroundColor: handleBg }}>
          {chevronBtn}
          {closeBtn}
        </div>
      );
    return (
      <div
        className={`relative w-full h-dvh overflow-hidden ${textCls}`}
        style={{ backgroundColor: bg }}
      >
        {collapsed === 'top' ? (
          <div className="flex flex-col h-full">
            <div className="flex-1" />
            {strip}
          </div>
        ) : collapsed === 'bottom' ? (
          <div className="flex flex-col h-full">
            {strip}
            <div className="flex-1" />
          </div>
        ) : (
          <div className="flex h-full">
            {collapsed === 'right' && strip}
            <div className="flex-1" />
            {collapsed === 'left' && strip}
          </div>
        )}
      </div>
    );
  }

  // 只留顶栏态：一条 48px 细条，仅显示 GitHub 登录按钮 + 收起/最大化/关闭
  // （用户定）。登录按钮点一下先展开回完整版，再自动开始登录（已有令牌则只展开）。
  const renderStrip = () => {
    let stripToken = '';
    try {
      stripToken = localStorage.getItem('zabox-plan-sync-token') ?? '';
    } catch {
      /* 忽略 */
    }
    const stripBtnBase =
      'shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-xs transition-colors';
    const stripBtnCls = light
      ? `${stripBtnBase} text-zinc-600 hover:bg-black/10 hover:text-zinc-900`
      : `${stripBtnBase} text-white/70 hover:bg-white/10 hover:text-white`;
    const stripLoginCls = light
      ? 'shrink-0 px-2 py-1 rounded-lg text-xs font-medium bg-black/[0.06] hover:bg-black/10 text-zinc-800 transition-colors'
      : 'shrink-0 px-2 py-1 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/[0.18] text-white transition-colors';
    return (
      <div
        className={`relative w-full h-dvh flex items-center gap-1 px-1.5 overflow-hidden select-none ${textCls}`}
        style={{ backgroundColor: bg }}
      >
        {stripToken ? (
          <span className={`shrink-0 text-xs ${light ? 'text-emerald-700' : 'text-emerald-300/90'}`}>
            已连接 GitHub
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              void exitHeaderOnly();
              setAutoLogin(true);
            }}
            className={stripLoginCls}
          >
            GitHub 登录
          </button>
        )}
        <div data-plan-drag-region className="flex-1 min-w-0 h-full" />
        <PinButton pinned={pinned} busy={pinBusy} light={light} onToggle={() => void togglePin()} />
        <button
          type="button"
          title="展开"
          onClick={() => void exitHeaderOnly()}
          className={stripBtnCls}
        >
          <ChevronUp size={14} />
        </button>
        <button
          type="button"
          title="最大化 / 还原"
          onClick={() => void handleToggleMaximize()}
          className={stripBtnCls}
        >
          <Square size={14} />
        </button>
        <button
          type="button"
          title={closeLabel}
          onClick={() => void handleClose()}
          className={
            light
              ? `${stripBtnBase} text-zinc-600 hover:bg-red-500/80 hover:text-white`
              : `${stripBtnBase} text-white/70 hover:bg-red-500/80 hover:text-white`
          }
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  const titleBar = (
    <PlanTitleBar
      theme={theme}
      settingsOpen={settingsOpen}
      actions={<div hidden={settingsOpen} className="min-w-0">
        <PlanSyncBar store={store} theme={theme} aiView={aiView}
          onAiToggle={() => setAiView((v) => v === 'ai' ? 'main' : 'ai')}
          autoLogin={autoLogin} onAutoLoginConsumed={() => setAutoLogin(false)} />
      </div>}
      closeLabel={closeLabel}
      onClose={() => void handleClose()}
      pinned={pinned}
      pinBusy={pinBusy}
      onTogglePin={() => void togglePin()}
      onSettingsToggle={() => setSettingsOpen((v) => !v)}
      onToggleHeaderOnly={() => void enterHeaderOnly()}
      onToggleMaximize={() => void handleToggleMaximize()}
    />
  );

  return (
    <div data-plan-desktop data-plan-theme={theme} data-plan-toolbar-position={toolbarBottom ? 'bottom' : 'top'}
      onPointerEnter={previewEnter} onPointerLeave={previewLeave}
      onContextMenu={(event) => {
        if (event.defaultPrevented || headerOnly || collapsed || !(event.target instanceof Element)
          || event.target.closest('input,textarea,select,button,a,[contenteditable="true"]')) return;
        event.preventDefault();
        setCreateMenu({ x: event.clientX, y: event.clientY });
      }}
      className={`relative flex flex-col h-dvh w-full overflow-hidden ${textCls}`} style={{ backgroundColor: bg }}>
      {createMenu && <DesktopCreateMenu position={createMenu} onClose={closeCreateMenu} onCreate={(kind) => void startCreate(kind)} />}
      <div data-plan-titlebar hidden={!!collapsed || headerOnly} className="shrink-0">{titleBar}</div>
      {collapsed ? renderEdge() : headerOnly ? renderStrip() : null}
      {windowError && !headerOnly && !collapsed && (
        <div role="alert" className="px-3 py-2 text-xs bg-red-500/20">
          {windowError}
          <button type="button" className="ml-2 underline" onClick={() => setWindowError(null)}>关闭提示</button>
        </div>
      )}
      <div className={`${collapsed || headerOnly ? 'hidden' : 'flex'} flex-col flex-1 min-h-0 overflow-hidden`}>
        <div className={`px-3 sm:px-4 py-3 flex-1 min-h-0 ${settingsOpen || aiView === 'ai' ? 'overflow-y-auto' : 'flex flex-col'}`}>
          {settingsOpen ? (
            <PlanSettings theme={theme} onThemeChange={changeTheme} customColor={customColor}
              onCustomColorChange={changeCustomColor} minimizeOnClose={minimizeOnClose}
              onMinimizeOnCloseChange={changeMinimizeOnClose} opacity={opacity}
              onOpacityChange={changeOpacity} onBack={() => setSettingsOpen(false)} />
          ) : aiView === 'ai' ? (
            <PlanAiView store={store} theme={theme} onOpenSettings={() => setSettingsOpen(true)} />
          ) : <DesktopPlanWorkspace store={store} active={activeSection} onActiveChange={setActiveSection} />}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><PlanApp /></StrictMode>,
);
