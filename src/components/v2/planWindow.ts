import { getCurrentWindow, type Window } from '@tauri-apps/api/window';

/**
 * 桌面计划应用的窗口工具（v2 内置标题栏 / 悬浮窗 / 边缘收起共用）。
 * 非 Tauri 环境（vite preview 等）下所有调用静默 no-op，不抛错。
 */
export function isTauri(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
    );
  } catch {
    return false;
  }
}

export function planWindow(): Window | null {
  try {
    return isTauri() ? getCurrentWindow() : null;
  } catch {
    return null;
  }
}

export async function safeMinimize(): Promise<void> {
  try {
    await planWindow()?.minimize();
  } catch {
    // 最小化失败时退到托盘隐藏（托盘图标点一下可恢复），避免窗口卡住不动
    try {
      await planWindow()?.hide();
    } catch {
      /* 非 Tauri 环境忽略 */
    }
  }
}

export async function safeToggleMaximize(): Promise<void> {
  try {
    await planWindow()?.toggleMaximize();
  } catch {
    /* 非 Tauri 环境忽略 */
  }
}

export async function safeClose(): Promise<void> {
  try {
    await planWindow()?.close();
  } catch {
    /* 非 Tauri 环境忽略 */
  }
}
