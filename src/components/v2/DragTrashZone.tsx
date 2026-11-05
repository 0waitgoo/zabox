import { Trash2 } from 'lucide-react';

/**
 * 拖拽删除区（2026-11-05 用户定）：拖网站时在右侧中部出现一个垃圾桶，拖过去松手即删除。
 * 只在拖动中出现（由拖拽方挂在快照层里）；pointer-events-none——落点用坐标判定，
 * 不挡住底下的组卡/Dock 高亮判定（elementFromPoint 仍能命中目标）。
 * 务必经 createPortal 挂到 document.body：C 卡框等祖先带 transform 时，
 * fixed 会改以该祖先为包含块、位置全错；挂 body 上才是真正的视口右侧中部。
 */
export function DragTrashZone({ hot }: { hot: boolean }) {
  return (
    <div
      data-drag-trash
      aria-hidden
      className={`fixed right-4 top-1/2 z-[86] -translate-y-1/2 pointer-events-none flex w-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border py-4 transition-colors ${
        hot ? 'border-red-400/80 bg-red-500/30' : 'border-white/15 bg-[#14141a]/80 backdrop-blur-md'
      }`}
    >
      <Trash2 size={26} className={hot ? 'text-red-300' : 'text-white/70'} />
      <span className={`text-[11px] ${hot ? 'text-red-200' : 'text-white/60'}`}>松手删除</span>
    </div>
  );
}

/** 指针是否落在拖拽删除区上（按实时 rect 坐标判定；区未出现时为 false） */
export function isOverDragTrash(x: number, y: number): boolean {
  const el = document.querySelector('[data-drag-trash]');
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}
