import React, { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PlanPage from './components/pages/PlanPage';
import PlanSyncBar from './components/v2/PlanSyncBar';
import PlanTitleBar from './components/v2/PlanTitleBar';
import MiniStickyNote from './components/v2/MiniStickyNote';
import {
  currentMonitor,
  LogicalSize,
  PhysicalPosition,
  PhysicalSize,
} from '@tauri-apps/api/window';
import { planWindow } from './components/v2/planWindow';
import { useLocalStore } from './store/localStore';
import './index.css';
import { applyDisplayPrefs, loadDisplayPrefs } from './store/displayPrefs';

// 首帧先落本机显示偏好（与网站版 main.tsx 同款，避免闪一帧）
applyDisplayPrefs(loadDisplayPrefs());

const OPACITY_KEY = 'zabox-plan-opacity';
const MINI_SIZE = { width: 320, height: 440 };
const EDGE_PEEK = 24; // 边缘收起后露出的细边宽度
const EDGE_TOLERANCE = 4; // 贴边判定：离边缘 4px 内算贴住

function loadOpacity(): number {
  try {
    const v = Number(localStorage.getItem(OPACITY_KEY));
    return Number.isFinite(v) ? Math.min(100, Math.max(50, v)) : 100;
  } catch {
    return 100;
  }
}

type Rect = { x: number; y: number; width: number; height: number };
type Edge = 'left' | 'right' | 'top' | 'bottom';

/**
 * 桌面计划应用入口（v2，便签优化版）：
 * - 内置深色标题栏（替代系统白色标题栏）+ 整体圆角 20px + 透明窗口；
 * - 标题栏透明度滑杆（50%–100%，存 zabox-plan-opacity）作用于根容器；
 * - 悬浮窗：320×440 便签式卡贴（浅一点的底色），置顶保持，再点回完整版尺寸位置；
 * - 边缘收起（完整版与便签模式都生效；v2 只在完整版跑，便签里拖到边上没反应，
 *   是用户报“无法贴边收起”的原因）：每 500ms 查窗口位置与主显示器尺寸，贴到
 *   左/右/上/下边缘 4px 内且连续两次轮询位置不变（排除拖动中）、未最大化时，
 *   收成该边缘一条 24px 细边（带小把手），悬停或点击细边恢复原尺寸原位置。
 *   恢复后在窗口位置变化前不再自动收起，避免刚恢复就立刻又收回去。
 * 与网站计划组件同一份源码（PlanPage + store），网站改计划、CI 重打安装包即一起更新。
 * AI 整理需线上接口，桌面版暂不可用（核心待办/长期计划均为本地数据，不受影响）。
 */
function PlanApp() {
  const store = useLocalStore();
  const [mode, setMode] = useState<'full' | 'mini'>('full');
  const [opacity, setOpacity] = useState(loadOpacity);
  const [collapsed, setCollapsed] = useState<Edge | null>(null);
  const fullRectRef = useRef<Rect | null>(null);
  const collapsedRectRef = useRef<Rect | null>(null);
  const suppressCollapseRef = useRef(false);
  const restoreTimer = useRef<number | null>(null);

  // html/body 背景透明（index.css 给 body 定了 #050505，行内样式压过它，
  // 否则透明窗口的圆角外仍会露出一圈底色）
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

  const toggleMode = async () => {
    const win = planWindow();
    if (mode === 'full') {
      if (win) {
        try {
          if (await win.isMaximized()) await win.unmaximize();
          const pos = await win.outerPosition();
          const size = await win.outerSize();
          fullRectRef.current = { x: pos.x, y: pos.y, width: size.width, height: size.height };
        } catch {
          /* 非 Tauri 环境忽略 */
        }
      }
      setMode('mini');
      try {
        await win?.setSize(new LogicalSize(MINI_SIZE.width, MINI_SIZE.height));
      } catch {
        /* 忽略 */
      }
    } else {
      setMode('full');
      const rect = fullRectRef.current;
      if (win && rect) {
        try {
          await win.setSize(new PhysicalSize(rect.width, rect.height));
          await win.setPosition(new PhysicalPosition(rect.x, rect.y));
        } catch {
          /* 忽略 */
        }
      }
    }
  };

  // 边缘收起轮询（完整版与便签模式都跑；未收起时跑）
  useEffect(() => {
    if (collapsed) return;
    let stopped = false;
    let lastPos: { x: number; y: number } | null = null;
    const tick = async () => {
      const win = planWindow();
      if (!win) return;
      try {
        if (await win.isMaximized()) {
          lastPos = null;
          return;
        }
        const pos = await win.outerPosition();
        const size = await win.outerSize();
        const mon = await currentMonitor();
        if (!mon) return;
        const ox = mon.position.x;
        const oy = mon.position.y;
        const mw = mon.size.width;
        const mh = mon.size.height;
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
          suppressCollapseRef.current = false;
          return;
        }
        // 恢复后位置未变过时不自动收起（用户刚把窗口拉回来，不应立刻又收走）
        if (suppressCollapseRef.current) {
          lastPos = { x: pos.x, y: pos.y };
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
        } else {
          lastPos = { x: pos.x, y: pos.y };
        }
      } catch {
        /* Tauri 不可用时静默 */
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

  // 收起态：只渲染一条 24px 细边 + 小把手（窗口其余部分已滑出屏幕外）。
  // 右边缘收起时露的是窗口左沿 → 把手放左；左边缘收起时露右沿 → 把手放右；
  // 上边缘收起时露底沿 → 把手放底部；下边缘收起时露顶沿 → 把手放顶部。
  if (collapsed) {
    const chevron =
      collapsed === 'right' ? '‹' : collapsed === 'left' ? '›' : collapsed === 'top' ? '⌄' : '⌃';
    const handleCls =
      'shrink-0 bg-[#2a2a35] hover:bg-indigo-500/80 text-white/85 flex items-center justify-center transition-colors cursor-pointer';
    const expandBtn = (
      <button
        type="button"
        aria-label="展开窗口"
        onMouseEnter={scheduleRestore}
        onMouseLeave={cancelScheduledRestore}
        onClick={() => void restoreFromCollapse()}
        className={`${handleCls} ${
          collapsed === 'top' || collapsed === 'bottom' ? 'w-full h-[24px] text-sm' : 'w-[24px] h-full text-base'
        }`}
      >
        {chevron}
      </button>
    );
    return (
      <div
        className="relative w-full h-dvh text-white overflow-hidden bg-[#17171d]"
        style={{ opacity: opacity / 100 }}
      >
        {collapsed === 'top' ? (
          <div className="flex flex-col h-full">
            <div className="flex-1" />
            {expandBtn}
          </div>
        ) : collapsed === 'bottom' ? (
          <div className="flex flex-col h-full">
            {expandBtn}
            <div className="flex-1" />
          </div>
        ) : (
          <div className="flex h-full">
            {collapsed === 'right' && expandBtn}
            <div className="flex-1" />
            {collapsed === 'left' && expandBtn}
          </div>
        )}
      </div>
    );
  }

  if (mode === 'mini') {
    return (
      <div
        className="relative w-full h-dvh flex flex-col text-white rounded-[20px] overflow-hidden bg-[#23232c]"
        style={{ opacity: opacity / 100 }}
      >
        <PlanTitleBar
          opacity={opacity}
          onOpacityChange={changeOpacity}
          mini
          onToggleMini={() => void toggleMode()}
        />
        <MiniStickyNote store={store} onExpand={() => void toggleMode()} />
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen w-full text-white rounded-[20px] overflow-hidden bg-[#17171d]"
      style={{ opacity: opacity / 100 }}
    >
      <PlanTitleBar
        opacity={opacity}
        onOpacityChange={changeOpacity}
        mini={false}
        onToggleMini={() => void toggleMode()}
      />
      <PlanSyncBar store={store} />
      <div className="px-3 sm:px-4 py-3">
        <PlanPage store={store} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlanApp />
  </StrictMode>,
);
