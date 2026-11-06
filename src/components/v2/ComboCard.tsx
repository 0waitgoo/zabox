import React from 'react';
import type { NavGroup } from '../../data/groups';
import type { ComboItem, LocalStore } from '../../store/localStore';
import { useLang } from '../../i18n/useLang';
import { displayGroupName } from '../../i18n/groupNames';
import { StackCardFrame, StackGroupIcon, StackSiteTiles } from './GroupStackCard';

/** 边缘悬停切 tab（2026-11-06 用户定）：拖动网站图标时，指针悬停在组合卡左右边缘
 * 此宽度内并停留片刻，即自动切到对应 tab；普通悬停（无拖动）不切换 */
const TAB_EDGE_ZONE_PX = 32;
/** 边缘悬停后切换的停留时长（ms）：扫过卡面不误切，刻意停一下才切 */
const TAB_SWITCH_DWELL_MS = 500;

/**
 * C 卡组合卡（第二十一轮）：两个文件夹式编组合并成一张卡，占一个网格位。
 * - 顶部左右双 tab 头：各显示该组的头图标（与普通 C 卡同规则）+ 组名；当前 tab 高亮、另一个变暗
 * - 顶部两个文件夹小角：左块对齐左 tab、右块对齐右 tab，颜色各自 = 对应组的 tabColor，常驻不随 tab 切换变化（第三十三轮）
 * - 下方瓷砖区 = 当前 tab 组的站点，排版规则与普通 C 卡完全一致（StackSiteTiles，第五十三轮统一尺寸+间距常量；第五十六轮：1x 单行截断、2x 左上起排）
 * - 点另一个 tab 标题 = 切换（activeGroupId 落盘持久化）；点瓷砖 = 打开站点；
 *   点卡身空白处（tab 头与瓷砖以外的区域）= 打开组合弹窗（ComboPanel）
 * - 按住任一 tab 头拖动 = 把该组拖出组合（拖影为该组的普通 C 卡面，落点即独立卡位置，组合随之解散）；
 *   尺寸与拆分走主页右键菜单（尺寸存 groupLayouts 的 combo key）
 * - 拖网站图标时悬停在卡身左右边缘 32px 内满 500ms = 自动切到对应 tab（2026-11-06 用户定）；
 *   松手落到当前 tab 组（主页落点按组合当前 tab 组判定）；普通悬停不切 tab
 */
export default function ComboCard({
  combo,
  groups,
  store,
  onOpen,
  delay = 0,
  colSpan = 1,
  heightUnits = 1,
  compactTabs = false,
}: {
  combo: ComboItem;
  /** 按 combo.groupIds 顺序解析出的两个组：[左, 右] */
  groups: [NavGroup, NavGroup];
  store: LocalStore;
  onOpen: (combo: ComboItem) => void;
  delay?: number;
  colSpan?: 1 | 2;
  heightUnits?: 1 | 2;
  /** 手机单列（第六十六轮）：卡变全宽后 tab 名不再截断——去 truncate、字号略收、
   * 图标略小，保证组名（上限 8 字）完整显示；桌面不传此项、外观零变化 */
  compactTabs?: boolean;
}) {
  const active = groups.find((g) => g.id === combo.activeGroupId) ?? groups[0];
  const { t, lang } = useLang();

  const switchTab = (e: React.MouseEvent, groupId: string) => {
    e.stopPropagation();
    if (groupId !== active.id) store.setComboActive(combo.id, groupId);
  };

  /** 边缘悬停切 tab：只在站点拖动进行中响应（站点拖拽快照 [data-drag-clone] 存在时）；
   * 整卡拖动（拖 tab 头解组、拖整卡排序）没有站点快照，不触发。指针落在卡身左右边缘带
   * 内并停满 TAB_SWITCH_DWELL_MS 即切到对应 tab；离开边缘带或拖动结束即取消计时。
   * 切 tab 后卡面换组显示；若被拖的正是本卡瓷砖，拖动侧（useSiteDragSort）会把排序
   * 转为跨组移动，松手落到新 tab 组（见其 sites 变化 effect）。 */
  const cardBodyRef = React.useRef<HTMLElement | null>(null);
  const dwellRef = React.useRef<{ zone: 'left' | 'right'; timer: number } | null>(null);
  React.useEffect(() => {
    const clearDwell = () => {
      if (dwellRef.current) {
        window.clearTimeout(dwellRef.current.timer);
        dwellRef.current = null;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!document.querySelector('[data-drag-clone]')) {
        clearDwell();
        return;
      }
      if (!cardBodyRef.current) {
        cardBodyRef.current = document.querySelector(
          `[data-combo-card="${combo.id}"] [data-stack-body]`,
        ) as HTMLElement | null;
        if (!cardBodyRef.current) return;
      }
      const r = cardBodyRef.current.getBoundingClientRect();
      let zone: 'left' | 'right' | null = null;
      if (e.clientY >= r.top && e.clientY <= r.bottom) {
        if (e.clientX >= r.left && e.clientX <= r.left + TAB_EDGE_ZONE_PX) zone = 'left';
        else if (e.clientX >= r.right - TAB_EDGE_ZONE_PX && e.clientX <= r.right) zone = 'right';
      }
      if (!zone) {
        clearDwell();
        return;
      }
      const targetId = zone === 'left' ? groups[0].id : groups[1].id;
      if (targetId === active.id) {
        clearDwell();
        return;
      }
      if (dwellRef.current?.zone === zone) return;
      clearDwell();
      dwellRef.current = {
        zone,
        timer: window.setTimeout(() => {
          dwellRef.current = null;
          store.setComboActive(combo.id, targetId);
        }, TAB_SWITCH_DWELL_MS),
      };
    };
    const onUp = () => clearDwell();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      clearDwell();
    };
  }, [combo.id, groups[0].id, groups[1].id, active.id, store]);

  return (
    <StackCardFrame
      tabColor={active.tabColor ?? ''}
      tabEars={[groups[0].tabColor ?? '', groups[1].tabColor ?? '']}
      onClick={() => onOpen(combo)}
      delay={delay}
      ariaLabel={t('menu.comboLabel', { a: displayGroupName(groups[0], lang), b: displayGroupName(groups[1], lang) })}
      rootProps={{ 'data-combo-card': combo.id }}
    >
      {/* 双 tab 头（第四十五轮：整段头部可点）：头部区（分隔线以上，含卡身上沿内边距）
          按左右半区铺一层透明命中按钮——点半区任意位置即切到该组；上面的胶囊转为纯视觉
          （pointer-events-none，样式/高亮与改版前完全一致）。拖出解组的 data 标记移到命中按钮上，
          主页 pointer 逻辑按标记识别的手势归属不变；真拖动仍由阈值区分，不会误切 tab */}
      <div className="relative -mx-4 -mt-3.5 px-4 pt-3.5 shrink-0">
        {groups.map((g, i) => (
          <button
            key={g.id}
            type="button"
            aria-label={t('menu.switchToGroup', { name: displayGroupName(g, lang) })}
            data-combo-tab-hit={g.id}
            data-combo-tab-drag=""
            data-combo-id={combo.id}
            data-group-id={g.id}
            onClick={(e) => switchTab(e, g.id)}
            className={`absolute inset-y-0 z-0 w-1/2 cursor-pointer ${i === 0 ? 'left-0' : 'right-0'}`}
          />
        ))}
        <div className="relative z-10 flex items-stretch gap-1 min-w-0 pointer-events-none">
          {groups.map((g, i) => {
            const isActive = g.id === active.id;
            return (
              <React.Fragment key={g.id}>
                {i === 1 && <div className="w-px bg-white/10 shrink-0 my-1" />}
                <div
                  data-combo-tab={g.id}
                  data-combo-tab-active={isActive ? 'true' : 'false'}
                  className={`flex-1 flex items-center min-w-0 py-1 rounded-[10px] transition-all ${
                    compactTabs ? 'gap-1.5 px-1' : 'gap-2 px-1.5'
                  } ${isActive ? 'bg-white/[0.07] opacity-100' : 'opacity-45'}`}
                >
                  <StackGroupIcon group={g} size={compactTabs ? 22 : 26} />
                  <span
                    className={`flex-1 min-w-0 font-bold tracking-tight text-left ${
                      compactTabs ? 'text-[13px] whitespace-nowrap' : 'text-[14px] truncate'
                    }`}
                  >
                    {displayGroupName(g, lang)}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* 口线：与普通 C 卡一致（纯视觉，不拦点击，点线本身也归命中层） */}
        <div className="relative z-10 mt-3 h-px bg-white/[0.08] shrink-0 pointer-events-none" />
      </div>

      {/* 瓷砖区：当前 tab 组的站点，规则与普通 C 卡一致 */}
      <StackSiteTiles group={active} store={store} colSpan={colSpan} heightUnits={heightUnits} />
    </StackCardFrame>
  );
}
