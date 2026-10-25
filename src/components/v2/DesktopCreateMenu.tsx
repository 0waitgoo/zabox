import React, { useEffect, useRef } from 'react';
import { CalendarDays, Plus } from 'lucide-react';

export type CreateKind = 'task' | 'plan';

export default function DesktopCreateMenu({ position, onClose, onCreate }: {
  position: { x: number; y: number };
  onClose: () => void;
  onCreate: (kind: CreateKind) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const items = Array.from<HTMLButtonElement>(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      items[index]?.focus();
    };
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose, position]);
  const itemClass = 'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs text-white/80 hover:bg-white/10 focus-visible:bg-white/10 outline-none';
  return (
    <div ref={ref} role="menu" aria-label="新建" data-row-menu
      className="fixed z-[100] w-44 rounded-xl bg-[#1e1e26] border border-white/15 shadow-xl p-1.5"
      style={{ left: Math.max(8, Math.min(position.x, window.innerWidth - 184)), top: Math.max(8, Math.min(position.y, window.innerHeight - 92)) }}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}>
      <button type="button" role="menuitem" onClick={() => onCreate('task')} className={itemClass}><Plus size={14} />新建待办</button>
      <button type="button" role="menuitem" onClick={() => onCreate('plan')} className={itemClass}><CalendarDays size={14} />新建长期计划</button>
    </div>
  );
}
