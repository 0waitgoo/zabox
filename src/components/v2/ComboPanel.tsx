import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import type { NavGroup } from '../../data/groups';
import type { ComboItem, LocalStore } from '../../store/localStore';
import { useLang } from '../../i18n/useLang';
import { displayGroupName } from '../../i18n/groupNames';
import { GroupPanelSection } from './GroupPanel';

/**
 * 组合弹窗（第二十一轮）：点组合卡卡身空白处打开，规格与 GroupPanel 一致（居中实色弹窗）。
 * 内含上下两个组的管理区，每个区就是 GroupPanel 的完整内容（GroupPanelSection 的 embedded 复用）：
 * 改组名 / 详细列表⇄文件夹式切换 / 删组 / 小角颜色 / 站点网格 / 添加网站，各组独立操作。
 * 联动规则：
 * - 任一组被删 → store.deleteGroup 内部解散组合，另一组以普通 C 卡留在组合原位置，本弹窗随之关闭（onClose 由删组动作触发）
 * - 任一组切成详细列表 → 该组脱离组合变成 B 卡（排在组合位之后），另一组变回普通 C 卡，弹窗关闭（onBecomeList 回调处理）
 */
export default function ComboPanel({
  combo,
  groups,
  store,
  onClose,
  onBecomeList,
}: {
  combo: ComboItem | null;
  /** 按 combo.groupIds 顺序解析出的两个组；成员失效时传 null，外层不再打开 */
  groups: [NavGroup, NavGroup] | null;
  store: LocalStore;
  onClose: () => void;
  /** 组合内某组被切成详细列表时回调：父级解散组合并关闭弹窗 */
  onBecomeList: (group: NavGroup) => void;
}) {
  const open = combo !== null && groups !== null;
  const { t, lang } = useLang();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div data-panel-root className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            data-combo-panel={combo.id}
            className="relative rounded-[28px] bg-[#17171d] border border-white/10 w-full max-w-2xl max-h-[84vh] flex flex-col overflow-hidden shadow-2xl shadow-black/70"
          >
            {/* 弹窗头：组合标题 + 两组名 + 统一关闭 */}
            <div className="px-5 sm:px-6 pt-5 pb-1 shrink-0 flex items-center gap-2.5">
              <h3 className="font-semibold text-base sm:text-lg tracking-tight">{t('menu.comboCard')}</h3>
              <span className="text-xs text-white/40 truncate">
                {displayGroupName(groups[0], lang)} + {displayGroupName(groups[1], lang)}
              </span>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/60 hover:text-white transition-colors shrink-0 ml-auto"
                aria-label={t('menu.close')}
              >
                <X size={16} />
              </button>
            </div>

            {/* 两组管理区上下排列，随弹窗一起滚动；中间以分隔线 + 组序小字区隔 */}
            <div className="flex-1 overflow-y-auto min-h-0 pb-2">
              <GroupPanelSection group={groups[0]} store={store} onClose={onClose} onBecomeList={onBecomeList} embedded />
              <div className="mx-5 sm:mx-6 border-t border-white/10" />
              <GroupPanelSection group={groups[1]} store={store} onClose={onClose} onBecomeList={onBecomeList} embedded />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
