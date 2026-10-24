import React, { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PlanPage from './components/pages/PlanPage';
import PlanSyncBar from './components/v2/PlanSyncBar';
import PlanTitleBar from './components/v2/PlanTitleBar';
import PlanSettings from './components/v2/PlanSettings';
import PlanAiView from './components/v2/PlanAiView';
import FloatWidget from './components/v2/FloatWidget';
import {
  currentMonitor,
  LogicalSize,
  PhysicalPosition,
  PhysicalSize,
} from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { planWindow, safeClose } from './components/v2/planWindow';
import { useLocalStore } from './store/localStore';
import './index.css';
import { applyDisplayPrefs, loadDisplayPrefs } from './store/displayPrefs';

// 首帧先落本机显示偏好（与网站版 main.tsx 同款，避免闪一帧）
applyDisplayPrefs(loadDisplayPrefs());

const OPACITY_KEY = 'zabox-plan-opacity';
const THEME_KEY = 'zabox-plan-theme';
const EDGE_PEEK = 24; // 边缘收起后露出的细边宽度
const EDGE_TOLERANCE = 4; // 贴边判定：离边缘 4px 内算贴住
const FLOAT_SIZE = { width: 320, height: 300 }; // 悬浮小组件尺寸（逻辑像素）
const FLOAT_ENTER = { width: 340, height: 360 }; // 缩到小于该尺寸 → 自动变悬浮
const FLOAT_EXIT = { width: 380, height: 420 }; // 悬浮时拖大到超过该尺寸 → 回完整版

export type PlanTheme = 'dark' | 'light';

function loadOpacity(): number {
  try {
    const v = Number(localStorage.getItem(OPACITY_KEY));
    return Number.isFinite(v) ? Math.min(100, Math.max(50, v)) : 100;
  } catch {
    return 100;
  }
}

function loadTheme(): PlanTheme {
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

type Rect = { x: number; y: number; width: number; height: number };
type Edge = 'left' | 'right' | 'top' | 'bottom';

/** 底色 rgba：透明度滑杆只改底色，字体保持不透明（第 4 轮口径） */
const rgba = (rgb: [number, number, number], alpha: number) =>
  `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${alpha})`;
const DARK_BG: [number, number, number] = [23, 23, 29];
const LIGHT_BG: [number, number, number] = [242, 242, 245];
const DARK_HANDLE: [number, number, number] = [42, 42, 53];
const LIGHT_HANDLE: [number, number, number] = [220, 220, 226];

/**
 * 桌面计划应用入口（v2，第 4 轮）：
 * - 直角窗口（用户定，不用圆角）；底色透明度滑杆只改底色、字体不透明——
 *   窗口底色由根容器一层 rgba 背景承载，标题栏/同步条底色透明 + 磨砂；
 * - 最小化（—）= 变成悬浮小组件（用户定，不再收进任务栏）；悬浮时点「完整版」回来；
 * - 放大缩小恢复：tauri.conf 重新允许 resize/maximize（第 3 轮关贴靠时一并关掉了，
 *   导致 □ 与边缘拖拽都失效）；贴靠放大改由轮询识别——□ 点的最大化有 expect 标记，
 *   无标记的最大化一律视为系统贴靠，自动还原到最大化前的位置尺寸，再由贴边收起接管；
 * - 缩到一定程度自动变悬浮（宽 <340 或高 <360，且尺寸稳定两轮才动作，拖动中不乱跳）；
 *   悬浮时拖大到超过阈值自动回完整版；恢复后先禁一次自动变悬浮，防小窗口反复横跳；
 * - 托盘点击由前端接管（Rust 只发事件）：收起态先恢复原尺寸位置、最小化先还原、
 *   再按显隐切换——解决了只剩细边/最小化时点托盘不见窗口的问题；
 * - 设置页：外观（暗夜/白天 + 底色透明度）与 AI 接口聚合在里面，标题栏只留设置按钮；
 * - AI 整理：桌面版直接调设置页里配的接口（DeepSeek / OpenAI / 自定义），
 *   按用户一句话把大计划拆成小步骤，确认后落到待办；
 * - 边缘收起：每 500ms 查窗口位置与主显示器尺寸，贴边且稳定、未最大化时收成 24px 细边；
 * - 稳定优化：轮询加进行中 guard（上一轮没跑完不重叠跑）；重复启动只聚焦已有窗口
 *   （single-instance 插件，Rust 侧）；全部窗口操作 try/catch，静默失败不闪退。
 * 与网站计划组件同一份源码（PlanPage + store），网站改计划、CI 重打安装包即一起更新。
 */
function PlanApp() {
  const store = useLocalStore();
  const [opacity, setOpacity] = useState(loadOpacity);
  const [theme, setTheme] = useState<PlanTheme>(loadTheme);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [floatMode, setFloatMode] = useState(false);
  const [collapsed, setCollapsed] = useState<Edge | null>(null);
  const [aiView, setAiView] = useState<'main' | 'ai'>('main');
  const collapsedRectRef = useRef<Rect | null>(null);
  const floatRectRef = useRef<Rect | null>(null);
  const lastRectRef = useRef<Rect | null>(null);
  const suppressCollapseRef = useRef(false);
  const suppressFloatRef = useRef(false);
  const expectMaximizedRef = useRef(false);
  const restoreTimer = useRef<number | null>(null);
  const collapsedRef = useRef<Edge | null>(null);
  const floatModeRef = useRef(false);
  const trayToggleRef = useRef<(kind: 'toggle' | 'show') => Promise<void>>(async () => {});

  // html/body 背景透明（index.css 给 body 定了 #050505，行内样式压过它）
  useEffect(() => {
    try {
      document.documentElement.style.backgroundColor = 'transparent';
      document.body.style.backgroundColor = 'transparent';
    } catch {
      /* 忽略 */
    }
  }, []);

  useEffect(() => {
    collapsedRef.current = collapsed;
  }, [collapsed]);
  useEffect(() => {
    floatModeRef.current = floatMode;
  }, [floatMode]);

  const changeOpacity = (v: number) => {
    setOpacity(v);
    try {
      localStorage.setItem(OPACITY_KEY, String(v));
    } catch {
      /* 忽略 */
    }
  };

  const changeTheme = (t: PlanTheme) => {
    setTheme(t);
    try {
      localStorage.setItem(THEME_KEY, t);
      document.documentElement.dataset.theme = t;
    } catch {
      /* 忽略 */
    }
  };

  const restoreFromCollapse = async () => {
    if (restoreTimer.current !== null) {
      window.clearTimeout(restoreTimer.current);
      restoreTimer.current = null;
    }
    const rect = collapsedRectRef.current;
    setCollapsed(null);
    suppressCollapseRef.current = true;
    const win = planWindow();
    if (win && rect) {
      try {
        await win.setPosition(new PhysicalPosition(rect.x, rect.y));
        await win.setSize(new PhysicalSize(rect.width, rect.height));
      } catch {
        /* 忽略 */
      }
    }
  };

  const scheduleRestore = () => {
    if (restoreTimer.current !== null) return;
    restoreTimer.current = window.setTimeout(() => {
      restoreTimer.current = null;
      void restoreFromCollapse();
    }, 200);
  };
  const cancelScheduledRestore = () => {
    if (restoreTimer.current !== null) {
      window.clearTimeout(restoreTimer.current);
      restoreTimer.current = null;
    }
  };

  /** 最小化按钮：变成悬浮小组件（先还原最大化再记位置，避免记一个全屏尺寸） */
  const enterFloat = async () => {
    if (floatModeRef.current) return;
    const win = planWindow();
    if (win) {
      try {
        if (await win.isMaximized()) await win.unmaximize();
        const pos = await win.outerPosition();
        const size = await win.outerSize();
        floatRectRef.current = { x: pos.x, y: pos.y, width: size.width, height: size.height };
      } catch {
        /* 忽略 */
      }
    }
    setFloatMode(true);
    try {
      await win?.setSize(new LogicalSize(FLOAT_SIZE.width, FLOAT_SIZE.height));
    } catch {
      /* 忽略 */
    }
  };

  /** 悬浮回完整版：恢复进悬浮前的位置尺寸，恢复后先禁一次自动变悬浮 */
  const restoreFull = async () => {
    if (!floatModeRef.current) return;
    const rect = floatRectRef.current;
    setFloatMode(false);
    suppressFloatRef.current = true;
    const win = planWindow();
    if (win && rect) {
      try {
        await win.setSize(new PhysicalSize(rect.width, rect.height));
        await win.setPosition(new PhysicalPosition(rect.x, rect.y));
      } catch {
        /* 忽略 */
      }
    }
  };

  /** 最大化按钮：先记 expect，轮询凭它区分“用户点的最大化”与“系统贴靠” */
  const handleToggleMaximize = async () => {
    const win = planWindow();
    if (!win) return;
    try {
      await win.toggleMaximize();
      expectMaximizedRef.current = await win.isMaximized();
    } catch {
      /* 忽略 */
    }
  };

  // 托盘点击由前端接管（Rust 侧只发 tray-toggle / tray-show 事件）：
  // 收起态先恢复原尺寸位置、最小化先还原，再按显隐切换；全部 try/catch，绝不抛到界面。
  trayToggleRef.current = async (kind: 'toggle' | 'show') => {
    try {
      const win = planWindow();
      if (!win) return;
      const wasCollapsed = collapsedRef.current;
      if (wasCollapsed) await restoreFromCollapse();
      if (await win.isMinimized()) {
        await win.unminimize();
        await win.show();
        await win.setFocus();
        return;
      }
      if (!wasCollapsed && kind === 'toggle' && (await win.isVisible())) {
        await win.hide();
        return;
      }
      await win.show();
      await win.setFocus();
    } catch {
      /* 静默 */
    }
  };

  useEffect(() => {
    let un1: (() => void) | undefined;
    let un2: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const u1 = await listen('tray-toggle', () => {
          void trayToggleRef.current('toggle');
        });
        const u2 = await listen('tray-show', () => {
          void trayToggleRef.current('show');
        });
        if (cancelled) {
          u1();
          u2();
        } else {
          un1 = u1;
          un2 = u2;
        }
      } catch {
        /* 非 Tauri 环境忽略 */
      }
    })();
    return () => {
      cancelled = true;
      un1?.();
      un2?.();
    };
  }, []);

  // 窗口状态轮询（未收起时跑）：贴靠还原、悬浮自动进出、边缘收起。
  // 进行中 guard：上一轮没跑完不重叠跑，避免多轮交错改位置/尺寸导致窗口乱跳。
  useEffect(() => {
    if (collapsed) return;
    let stopped = false;
    let ticking = false;
    let lastPos: { x: number; y: number } | null = null;
    let lastSize: { width: number; height: number } | null = null;
    const tick = async () => {
      if (ticking) return;
      ticking = true;
      try {
        const win = planWindow();
        if (!win) return;
        // 最大化：有 expect = 用户点的 □，留着；无 expect = 系统贴靠，还原到最大化前的位置尺寸
        if (await win.isMaximized()) {
          if (expectMaximizedRef.current) {
            expectMaximizedRef.current = false;
            lastPos = null;
            lastSize = null;
            return;
          }
          const r = lastRectRef.current;
          try {
            await win.unmaximize();
            if (r) {
              await win.setPosition(new PhysicalPosition(r.x, r.y));
              await win.setSize(new PhysicalSize(r.width, r.height));
            }
          } catch {
            /* 忽略 */
          }
          expectMaximizedRef.current = false;
          suppressFloatRef.current = true;
          lastPos = null;
          lastSize = null;
          return;
        }
        const pos = await win.outerPosition();
        const size = await win.outerSize();
        const sc = await win.scaleFactor().catch(() => 1);
        const lw = size.width / sc;
        const lh = size.height / sc;
        const mon = await currentMonitor();
        if (!mon) return;
        const ox = mon.position.x;
        const oy = mon.position.y;
        const mw = mon.size.width;
        const mh = mon.size.height;
        lastRectRef.current = { x: pos.x, y: pos.y, width: size.width, height: size.height };
        const stableSize =
          lastSize !== null && lastSize.width === size.width && lastSize.height === size.height;
        // 悬浮自动进出（尺寸稳定两轮才动作，避免拖动中途乱跳）
        if (!floatModeRef.current) {
          if ((lw < FLOAT_ENTER.width || lh < FLOAT_ENTER.height) && stableSize && !suppressFloatRef.current) {
            await enterFloat();
            lastPos = null;
            lastSize = null;
            return;
          }
          if (lw >= FLOAT_ENTER.width && lh >= FLOAT_ENTER.height) {
            suppressFloatRef.current = false;
          }
        } else if ((lw > FLOAT_EXIT.width || lh > FLOAT_EXIT.height) && stableSize) {
          await restoreFull();
          lastPos = null;
          lastSize = null;
          return;
        }
        // 边缘收起
        const nearRight = pos.x + size.width >= ox + mw - EDGE_TOLERANCE;
        const nearLeft = pos.x <= ox + EDGE_TOLERANCE;
        const nearTop = pos.y <= oy + EDGE_TOLERANCE;
        const nearBottom = pos.y + size.height >= oy + mh - EDGE_TOLERANCE;
        const edge: Edge | null = nearRight
          ? 'right'
          : nearLeft
            ? 'left'
            : nearTop
              ? 'top'
              : nearBottom
                ? 'bottom'
                : null;
        if (!edge) {
          lastPos = { x: pos.x, y: pos.y };
          lastSize = { width: size.width, height: size.height };
          suppressCollapseRef.current = false;
          return;
        }
        // 恢复后位置未变过时不自动收起（用户刚把窗口拉回来，不应立刻又收走）
        if (suppressCollapseRef.current) {
          lastPos = { x: pos.x, y: pos.y };
          lastSize = { width: size.width, height: size.height };
          return;
        }
        if (lastPos && lastPos.x === pos.x && lastPos.y === pos.y) {
          collapsedRectRef.current = { x: pos.x, y: pos.y, width: size.width, height: size.height };
          setCollapsed(edge);
          if (edge === 'right') {
            await win.setPosition(new PhysicalPosition(ox + mw - EDGE_PEEK, pos.y));
          } else if (edge === 'left') {
            await win.setPosition(new PhysicalPosition(ox - size.width + EDGE_PEEK, pos.y));
          } else if (edge === 'top') {
            await win.setPosition(new PhysicalPosition(pos.x, oy - size.height + EDGE_PEEK));
          } else {
            await win.setPosition(new PhysicalPosition(pos.x, oy + mh - EDGE_PEEK));
          }
          lastPos = null;
          lastSize = null;
        } else {
          lastPos = { x: pos.x, y: pos.y };
          lastSize = { width: size.width, height: size.height };
        }
      } catch {
        /* Tauri 不可用时静默 */
      } finally {
        ticking = false;
      }
    };
    const id = window.setInterval(() => {
      if (!stopped) void tick();
    }, 500);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [collapsed]);

  const light = theme === 'light';
  const bg = rgba(light ? LIGHT_BG : DARK_BG, opacity / 100);
  const handleBg = rgba(light ? LIGHT_HANDLE : DARK_HANDLE, opacity / 100);
  const textCls = light ? 'text-zinc-900' : 'text-white';

  // 收起态：只渲染一条 24px 细边 + 小把手（窗口其余部分已滑出屏幕外）。
  // 右边缘收起时露的是窗口左沿 → 把手放左；左边缘收起时露右沿 → 把手放右；
  // 上边缘收起时露底沿 → 把手放底部；下边缘收起时露顶沿 → 把手放顶部。
  // 细边上另带一个 ✕：收起时不用展开也能直接关窗口。
  if (collapsed) {
    const chevron =
      collapsed === 'right' ? '‹' : collapsed === 'left' ? '›' : collapsed === 'top' ? '⌄' : '⌃';
    const chevronBtn = (
      <button
        type="button"
        aria-label="展开窗口"
        onMouseEnter={scheduleRestore}
        onMouseLeave={cancelScheduledRestore}
        onClick={() => void restoreFromCollapse()}
        className={`flex-1 flex items-center justify-center transition-colors cursor-pointer hover:bg-indigo-500/80 hover:text-white ${
          light ? 'text-zinc-700' : 'text-white/85'
        } ${collapsed === 'top' || collapsed === 'bottom' ? 'text-sm' : 'text-base'}`}
      >
        {chevron}
      </button>
    );
    const closeBtn = (
      <button
        type="button"
        aria-label="关闭窗口"
        title="关闭"
        onClick={() => void safeClose()}
        className={`shrink-0 flex items-center justify-center transition-colors cursor-pointer text-xs hover:bg-red-500/80 hover:text-white ${
          light ? 'text-zinc-700' : 'text-white/85'
        } ${collapsed === 'top' || collapsed === 'bottom' ? 'w-[24px] h-full' : 'w-full h-[24px]'}`}
      >
        ✕
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

  // 悬浮小组件态
  if (floatMode) {
    return (
      <div
        className={`relative w-full h-dvh flex flex-col overflow-hidden ${textCls}`}
        style={{ backgroundColor: bg }}
      >
        <FloatWidget store={store} theme={theme} onExpand={() => void restoreFull()} />
      </div>
    );
  }

  const titleBar = (
    <PlanTitleBar
      theme={theme}
      settingsOpen={settingsOpen}
      onSettingsToggle={() => setSettingsOpen((v) => !v)}
      onMinimizeToFloat={() => void enterFloat()}
      onToggleMaximize={() => void handleToggleMaximize()}
    />
  );

  // 设置页：标题栏 + 设置内容（不同步条、不显示计划页）
  if (settingsOpen) {
    return (
      <div
        className={`relative min-h-screen w-full overflow-hidden ${textCls}`}
        style={{ backgroundColor: bg }}
      >
        {titleBar}
        <div className="px-3 sm:px-4 py-3">
          <PlanSettings
            theme={theme}
            onThemeChange={changeTheme}
            opacity={opacity}
            onOpacityChange={changeOpacity}
            onBack={() => setSettingsOpen(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative min-h-screen w-full overflow-hidden ${textCls}`}
      style={{ backgroundColor: bg }}
    >
      {titleBar}
      <PlanSyncBar
        store={store}
        theme={theme}
        aiView={aiView}
        onAiToggle={() => setAiView((v) => (v === 'ai' ? 'main' : 'ai'))}
      />
      <div className="px-3 sm:px-4 py-3">
        {aiView === 'ai' ? (
          <PlanAiView
            store={store}
            theme={theme}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        ) : (
          <PlanPage store={store} hideHeader hideAiButton flatPanels />
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlanApp />
  </StrictMode>,
);
