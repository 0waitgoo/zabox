import { useEffect } from 'react';
import { cursorPosition, PhysicalPosition } from '@tauri-apps/api/window';
import { planWindow } from './planWindow';

/** Move directly instead of starting a Windows caption drag (which triggers Aero Snap). */
export function useDesktopDrag() {
  useEffect(() => {
    let active: { pointerId: number; ended: boolean; cancelled: boolean } | null = null;
    let disposed = false;
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || active || !(event.target instanceof Element)) return;
      const region = event.target.closest<HTMLElement>('[data-plan-drag-region]');
      if (!region || event.target.closest('button,input,textarea,a,select')) return;
      const win = planWindow();
      if (!win) return;
      event.preventDefault();
      region.setPointerCapture(event.pointerId);
      const drag = { pointerId: event.pointerId, ended: false, cancelled: false };
      active = drag;
      void (async () => {
        let moved = false;
        try {
          // A maximized window stays maximized until the user clicks Restore.
          if (await win.isMaximized()) return;
          const [start, position] = await Promise.all([cursorPosition(), win.outerPosition()]);
          let lastX = start.x;
          let lastY = start.y;
          while (!disposed && !drag.cancelled) {
            const pointer = await cursorPosition();
            if (disposed || drag.cancelled) break;
            if (pointer.x !== lastX || pointer.y !== lastY) {
              await win.setPosition(new PhysicalPosition(
                position.x + pointer.x - start.x, position.y + pointer.y - start.y,
              ));
              lastX = pointer.x;
              lastY = pointer.y;
              moved = true;
            }
            if (drag.ended) break;
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          }
          if (moved && !disposed && !drag.cancelled) window.dispatchEvent(new Event('plan-drag-end'));
        } catch (error) {
          if (!disposed) window.dispatchEvent(new CustomEvent('plan-window-error', { detail: String(error) }));
        } finally {
          if (region.hasPointerCapture(drag.pointerId)) region.releasePointerCapture(drag.pointerId);
          if (active === drag) active = null;
        }
      })();
    };
    const end = (event: PointerEvent) => {
      if (active?.pointerId === event.pointerId) active.ended = true;
    };
    const cancel = () => { if (active) active.cancelled = true; };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('plan-toggle-header', cancel);
    return () => {
      disposed = true;
      cancel();
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('plan-toggle-header', cancel);
    };
  }, []);
}
