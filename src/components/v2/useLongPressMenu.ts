import { useEffect } from 'react';

/**
 * 全局「原位长按触发右键菜单」（第七十轮）。
 *
 * 接入方式：不新造菜单——长按达标时在原按下元素上合成一个 contextmenu 事件，
 * 交给既有三层右键路由（元素级 React onContextMenu 站点/任务/卡片尺寸菜单 →
 * 根 div 空白处理器 → document 兜底页面菜单），与真实右键打开同一个菜单、内容一致。
 * 没有右键菜单语义的区域走兜底页面菜单，与真实右键行为一致；输入类元素不启动长按。
 *
 * 手势三分（与既有手势消歧，靠「先静止达阈值 vs 先移动」互斥）：
 * - 短按松开（计时未到）= 普通点击：本层全程不干预，click 原样到达；
 * - 按住移动（位移 > 10px）= 取消长按判定，控制权交回既有行为（卡片拖拽排序/合并、
 *   计划卡拖拽滚动、任务合并拖拽、页面滚动——它们全是「按下只登记、移动过阈值
 *   才激活」模型，静止期间不会被抢跑；触摸滚动会发 pointercancel，同样取消）；
 * - 原位长按满 500ms = 触发菜单。触发后冻结本次按压余下的 pointermove（捕获阶段
 *   吞掉），防止各 pending 拖拽在菜单已开后迟到激活；松手的 click 按「松手点」
 *   吞掉，避免穿透触发底层点击（与右键语义一致：右键松手本就不产生 click，
 *   操作菜单要松手后再点）。
 *
 * 移动端原生冲突：Android Chrome 长按会由浏览器先发真实 contextmenu（既有路由
 * 已开菜单）——本层监听到后置标记并取消合成，避免同一次按压开两次；iOS Safari
 * 长按不发 contextmenu、只选字/弹系统 callout，由 index.css 交互区的
 * user-select:none + -webkit-touch-callout:none 挡住（输入框豁免）。
 */

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;
/** 松手 click 抑制：只认松手后 600ms 内、距松手点 14px 内的第一下 click */
const CLICK_SUPPRESS_MS = 600;
const CLICK_SUPPRESS_RADIUS_PX = 14;

const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

interface PressState {
  pointerId: number;
  target: HTMLElement;
  x: number;
  y: number;
  nativeMenuSeen: boolean;
}

export default function useLongPressMenu() {
  useEffect(() => {
    let timer: number | null = null;
    let press: PressState | null = null;
    /** 已由长按开菜单、仍在按压中的指针 id：其余下 pointermove 被冻结 */
    let frozenPointerId: number | null = null;
    /** 松手瞬间落下的 click 抑制标记（按松手点判定，与按住时长无关） */
    let suppressClick: { x: number; y: number; at: number } | null = null;

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const cancelPress = () => {
      press = null;
      clearTimer();
    };

    const fire = () => {
      timer = null;
      const p = press;
      press = null;
      if (!p || p.nativeMenuSeen) return;
      // 按下元素可能在 500ms 内被重渲染摘掉：断开则按坐标找当前元素兜底
      let target: HTMLElement | null = p.target.isConnected ? p.target : null;
      if (!target) {
        const hit = document.elementFromPoint(p.x, p.y);
        target = hit instanceof HTMLElement ? hit : null;
      }
      if (!target) return;
      const ev = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: p.x,
        clientY: p.y,
        screenX: p.x,
        screenY: p.y,
        button: 2,
      });
      target.dispatchEvent(ev);
      frozenPointerId = p.pointerId;
    };

    const onPointerDown = (e: PointerEvent) => {
      // 第二指落下（双指缩放开始）：取消进行中的长按判定，缩放优先（第七十三轮）
      if (press && e.pointerId !== press.pointerId) cancelPress();
      if (!e.isPrimary || e.button !== 0) return;
      if (press || frozenPointerId !== null) return; // 已在追踪/已开菜单：第二指落下不启动
      const t = e.target as HTMLElement | null;
      if (!t || typeof t.closest !== 'function') return;
      if (t.closest(EDITABLE_SELECTOR)) return; // 输入区不触发（还要选中/粘贴）
      // 收起网格站点行：长按 1 秒属于跨组拖拽武装，不开菜单（展开行与桌面真实右键不受影响）
      if (t.closest('[data-collapsed-grid] [data-site-drag-id]')) return;
      press = { pointerId: e.pointerId, target: t, x: e.clientX, y: e.clientY, nativeMenuSeen: false };
      clearTimer();
      timer = window.setTimeout(fire, LONG_PRESS_MS);
    };

    const onPointerMoveCapture = (e: PointerEvent) => {
      if (frozenPointerId !== null && e.pointerId === frozenPointerId) {
        // 菜单已开：冻结本次按压余下位移，防 pending 拖拽（卡片排序/任务合并/拖拽滚动）迟到激活
        e.stopPropagation();
        return;
      }
      const p = press;
      if (!p || e.pointerId !== p.pointerId) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE_PX) cancelPress();
    };

    const onPointerEnd = (e: PointerEvent) => {
      if (frozenPointerId !== null && e.pointerId === frozenPointerId) {
        frozenPointerId = null;
        suppressClick = { x: e.clientX, y: e.clientY, at: Date.now() };
      }
      if (press && e.pointerId === press.pointerId) cancelPress();
    };

    const onNativeContextMenu = () => {
      // 本次按压内浏览器自己发了 contextmenu（Android 长按等）：既有路由已开菜单，取消合成
      if (press) {
        press.nativeMenuSeen = true;
        clearTimer();
      }
    };

    const onClickCapture = (e: MouseEvent) => {
      const s = suppressClick;
      if (!s) return;
      suppressClick = null; // 只认紧随松手的第一下 click，不论命中与否都销记
      if (e.button !== 0) return;
      if (Date.now() - s.at > CLICK_SUPPRESS_MS) return;
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > CLICK_SUPPRESS_RADIUS_PX) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMoveCapture, true);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    document.addEventListener('contextmenu', onNativeContextMenu, true);
    document.addEventListener('click', onClickCapture, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMoveCapture, true);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      document.removeEventListener('contextmenu', onNativeContextMenu, true);
      document.removeEventListener('click', onClickCapture, true);
      clearTimer();
    };
  }, []);
}
