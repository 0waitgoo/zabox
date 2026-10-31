import React, { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useLang } from '../../i18n/useLang';

/**
 * 站点行左滑操作（第七十三轮）：详细列表行通用包装，用于 B 卡收起态行与 B 卡展开态行。
 * 行身向左滑露出右侧「编辑 / 删除」两钮；删除走与站点右键菜单一致的两步确认
 * （点「删除」先变「确认 / 算了」确认态，再点确认才真删），编辑走宿主给的既有编辑入口。
 *
 * 手势消歧（与既有手势体系共存，靠方向仲裁 + 捕获阶段拦截）：
 * - 按下只登记，不拦截；位移未过判定距离前不认领，普通点击、原位长按（第七十轮）照常；
 * - 往左横向占优（dx < 0 且 |dx| ≥ 10 且 |dx| ≥ 1.3·|dy|）→ 左滑认领：本次按压余下的 pointermove
 *   在 window 捕获阶段被 stopPropagation，主页卡片拖拽排序、组内站点拖拽排序的
 *   pending 永远等不到激活位移（它们的 move 监听都在冒泡阶段）；未决阶段的 move 同样
 *   先截断，防止它们以更小的 7~8px 阈值抢先激活；
 * - 往右横向占优 → 不是左滑，立即释放、不截断：往右拖是跨组拖拽的方向，操作条永不出现；
 * - 纵向占优 → 立即释放并退出：此后 move 不再截断，滚动 / 纵向拖拽排序按累计位移
 *   照常激活（它们的阈值判定用起手累计值，不依赖被截断的那几帧）；
 * - 对角未决（既非横向占优也非纵向占优）→ 继续截断等方向明朗，但位移超过 24px
 *   仍不明朗时释放：持续的对角拖是跨组/排序拖拽，不是左滑，不能无限截断；
 * - 静止长按没有位移、不会认领；按压中出现 contextmenu（菜单已开）即取消待命；
 * - 第二指落下（双指缩放）取消待命；已认领的滑动取消后回弹到手势前状态。
 * - 跨组拖拽锁（gestureLock）：宿主在跨组拖拽已激活后返回 true，
 *   本行尚未认领时立即释放本次手势、不截断后续 move，让冒泡阶段的跨组拖拽接管；
 *   已认领的左滑不受锁影响（跨组激活迟到不抢已认领的手势）——但已认领的左滑拖出
 *   150px 后经 onDragEscape 转交跨组拖拽（往左拖出本组也是跨组移动，条子收起）。
 *
 * 同一列表同时只开一行：openKey 由列表父级持有。点已打开行的行身 = 收起而不是
 * 打开站点（由传给 children 的 guard 在 click 时拦截）；刚结束一次左滑的 click 同样被 guard 吞掉。
 */

/** 操作条总宽：编辑 58 + 删除 58（确认态：确认 58 + 算了 58） */
export const SWIPE_ACTION_W = 116;
/** 方向判定距离（px）：超过它才按主轴方向仲裁，未决阶段先截断 move */
const DECIDE_PX = 10;
/** 对角释放距离（px）：对角方向超过它仍不明朗时释放，不无限截断跨组/排序拖拽 */
const DIAGONAL_RELEASE_PX = 24;
/** 左滑超距逃逸（px）：已认领的左滑拖出此距离后转交跨组拖拽（仅宿主传了 onDragEscape 的行） */
const SWIPE_ESCAPE_PX = 150;
/** 横向认领的轴比：|dx| 至少是 |dy| 的 1.3 倍才算横向占优 */
const AXIS_RATIO = 1.3;

export default function SwipeableRow({
  rowKey,
  openKey,
  onOpenKeyChange,
  onEdit,
  onDelete,
  gestureLock,
  onDragEscape,
  children,
}: {
  /** 行标识（同一列表内唯一，通常站点 id） */
  rowKey: string;
  /** 当前打开（露出操作条）的行标识；null = 全关 */
  openKey: string | null;
  onOpenKeyChange: (key: string | null) => void;
  onEdit: () => void;
  onDelete: () => void;
  /** 跨组拖拽锁：返回 true 时尚未认领的手势立即释放（不认领、不截断） */
  gestureLock?: () => boolean;
  /** 左滑超距逃逸：已认领的左滑拖出 150px 时调用，返回 true 表示跨组已接管（左滑随即收起、不截断本帧） */
  onDragEscape?: (x: number, y: number) => boolean;
  /** 行内容渲染：guard() 在行身 click 里先问——返回 true 表示这次 click 已被左滑体系处理（吞掉） */
  children: (guard: () => boolean) => React.ReactNode;
}) {
  const open = openKey === rowKey;
  /** 拖动中的实时位移（null = 不在拖动，位移由 open 决定） */
  const [dragTx, setDragTx] = useState<number | null>(null);
  /** 删除两步确认态（与站点右键菜单同口径） */
  const [confirming, setConfirming] = useState(false);
  const { t } = useLang();
  /** 操作条挂载延时隐藏：收起动画（180ms）期间保持挂载，动画完才卸下，避免滑动途中条先消失 */
  const [stripShown, setStripShown] = useState(false);
  const lastSwipeEndRef = useRef(0);
  const gestureRef = useRef<null | {
    pointerId: number;
    startX: number;
    startY: number;
    base: number;
    claimed: boolean;
    lastTx: number | null;
    cleanup: () => void;
  }>(null);

  useEffect(() => {
    if (open || dragTx !== null) {
      setStripShown(true);
      return;
    }
    const t = window.setTimeout(() => setStripShown(false), 200);
    return () => window.clearTimeout(t);
  }, [open, dragTx ]);

  // 行被关上（自己收起 / 别行打开 / 点别处）时确认态复位
  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open ]);

  /** 行身 click 守卫：左滑刚结束的尾巴 click 吞掉；行开着时点行身 = 收起 */
  const guard = () => {
    if (Date.now() - lastSwipeEndRef.current < 350) {
      lastSwipeEndRef.current = 0;
      return true;
    }
    if (open) {
      onOpenKeyChange(null);
      return true;
    }
    return false;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || gestureRef.current) return;
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable="true"], [data-swipe-actions]')) return;

    const g = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      base: open ? -SWIPE_ACTION_W : 0,
      claimed: false,
      lastTx: null as number | null,
      cleanup: () => {},
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('pointerdown', onSecondDown, true);
      document.removeEventListener('contextmenu', onMenu, true);
      if (gestureRef.current === g) gestureRef.current = null;
    };
    g.cleanup = cleanup;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== g.pointerId) return;
      // 跨组拖拽已激活且本行尚未认领：立即释放，不认领、不截断，跨组拖拽接管
      if (!g.claimed && gestureLock?.()) {
        cleanup();
        return;
      }
      const dx = ev.clientX - g.startX;
      const dy = ev.clientY - g.startY;
      if (!g.claimed) {
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        if (Math.max(adx, ady) < DECIDE_PX) {
          // 未决：先截断，防止冒泡阶段的拖拽 pending 以更小阈值抢先激活
          ev.stopPropagation();
          return;
        }
        if (adx >= DECIDE_PX && adx >= AXIS_RATIO * ady) {
          if (dx < 0) {
            g.claimed = true;
          } else {
            // 往右横向占优：不是左滑，立即释放、不截断，往右拖是跨组拖拽的方向
            cleanup();
            return;
          }
        } else if (ady >= DECIDE_PX && ady > adx) {
          // 纵向占优：释放，本手势退出，滚动 / 纵向拖拽排序接管（这一帧起不再截断）
          cleanup();
          return;
        } else {
          // 对角未决：位移不大时继续截断等方向明朗；超过 24px 仍不明朗则释放，
          // 持续的对角拖是跨组/排序拖拽，不是左滑，不能无限截断
          if (Math.max(adx, ady) >= DIAGONAL_RELEASE_PX) {
            cleanup();
            return;
          }
          ev.stopPropagation();
          return;
        }
      }
      if (g.claimed && dx < -SWIPE_ESCAPE_PX && onDragEscape?.(ev.clientX, ev.clientY)) {
        // 已认领的左滑拖出 150px：不是点条子，是要把站点拖出本组——转交跨组拖拽；
        // 不截断本帧，冒泡阶段的跨组层立刻跟手；条子收起、行身复位
        cleanup();
        setDragTx(null);
        onOpenKeyChange(null);
        return;
      }
      ev.stopPropagation();
      const tx = Math.max(-SWIPE_ACTION_W, Math.min(8, g.base + dx));
      g.lastTx = tx;
      setDragTx(tx);
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== g.pointerId) return;
      const wasClaimed = g.claimed;
      const tx = g.lastTx;
      cleanup();
      setDragTx(null);
      if (!wasClaimed) return;
      lastSwipeEndRef.current = Date.now();
      const finalTx = tx ?? g.base;
      if (finalTx <= -SWIPE_ACTION_W / 2) {
        onOpenKeyChange(rowKey);
      } else if (open) {
        onOpenKeyChange(null);
      }
    };

    const onSecondDown = (ev: PointerEvent) => {
      if (ev.pointerId === g.pointerId) return;
      // 双指手势开始：取消左滑待命/认领，回弹到手势前状态（缩放优先）
      cleanup();
      setDragTx(null);
    };

    const onMenu = () => {
      // 按压中菜单被打开（长按/右键）：左滑待命取消
      cleanup();
      setDragTx(null);
    };

    gestureRef.current = g;
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('pointerdown', onSecondDown, true);
    document.addEventListener('contextmenu', onMenu, true);
  };

  const tx = dragTx ?? (open ? -SWIPE_ACTION_W : 0);

  return (
    <div data-swipe-row={rowKey} className="relative overflow-hidden rounded-2xl">
      {stripShown && (
        <div
          data-swipe-actions
          className="absolute inset-y-0 right-0 flex"
          style={{ width: SWIPE_ACTION_W }}
        >
          {!confirming ? (
            <>
              <button
                type="button"
                data-swipe-edit
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenKeyChange(null);
                  onEdit();
                }}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 bg-indigo-500/70 hover:bg-indigo-500/90 text-white transition-colors"
              >
                <Pencil size={14} />
                <span className="text-[10px] font-medium">{t('menu.edit')}</span>
              </button>
              <button
                type="button"
                data-swipe-delete
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirming(true);
                }}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 bg-red-500/75 hover:bg-red-500/90 text-white transition-colors"
              >
                <Trash2 size={14} />
                <span className="text-[10px] font-medium">{t('menu.delete')}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                data-swipe-delete-confirm
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirming(false);
                  onOpenKeyChange(null);
                  onDelete();
                }}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 bg-red-500 hover:bg-red-400 text-white transition-colors"
              >
                <Trash2 size={14} />
                <span className="text-[10px] font-medium">{t('menu.confirmAction')}</span>
              </button>
              <button
                type="button"
                data-swipe-delete-cancel
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirming(false);
                }}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 bg-white/12 hover:bg-white/20 text-white/85 transition-colors"
              >
                <span className="text-[10px] font-medium">{t('menu.cancelDelete')}</span>
              </button>
            </>
          )}
        </div>
      )}
      <div
        data-swipe-content
        className="relative"
        style={{
          transform: `translateX(${tx}px)`,
          transition: dragTx === null ? 'transform 180ms ease' : 'none',
        }}
        onPointerDown={onPointerDown}
      >
        {children(guard)}
      </div>
    </div>
  );
}
