import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Pin, Plus, Trash2, Check } from 'lucide-react';
import { GROUP_NAME_MAX, GROUP_TAB_COLORS, siteIconSrc, siteTags, sortSites, textCharCount, type NavGroup, type SiteEntry } from '../../data/groups';
import type { LocalStore } from '../../store/localStore';
import { useLang } from '../../i18n/useLang';
import { displayGroupName } from '../../i18n/groupNames';
import { SiteLogo } from './Card';
import { SiteForm, SiteTagBadges } from './GroupExpanded';
import SiteContextMenu, { siteMenuPosition, type SiteMenuState } from './SiteContextMenu';
import { SITE_DRAG_PLACEHOLDER_STYLE, useSiteDragSort } from './useSiteDragSort';

/**
 * C 型 · 编组展开弹窗（第三轮恢复）
 * 点击堆叠卡弹出居中弹窗：组内站点为 ICON 瓷砖（图标 + 名字，置顶优先 + 存储顺序），
 * 带「+ 添加网站」瓷砖；瓷砖的操作（打开/编辑/删除）走右键菜单（第十六轮追加，悬停不再冒图标）；
 * 头部点组名就地改名、切换形态、删组；失效链接只在站点瓷砖上标记（汇总提示条已按用户要求删除）。面板为实色背景，不用半透明/毛玻璃。
 * 第三十八轮：瓷砖可拖动排序（置顶区/普通区各自区内换位，松手落盘；组合弹窗的两组各拖各的，互不串组）。
 * （B 型列表卡不走这里——它在主页原地向下拉开。）
 */
export default function GroupPanel({
  group,
  store,
  onClose,
  onBecomeList,
}: {
  group: NavGroup | null;
  store: LocalStore;
  onClose: () => void;
  /** 在弹窗里把形态切成 list 时回调：父级关弹窗并在主页原地展开该组 */
  onBecomeList: (group: NavGroup) => void;
}) {
  useEffect(() => {
    if (!group) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [group, onClose]);

  return (
    <AnimatePresence>
      {group && (
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
            className="relative rounded-[28px] bg-[#17171d] border border-white/10 w-full max-w-2xl max-h-[84vh] flex flex-col overflow-hidden shadow-2xl shadow-black/70"
          >
            <React.Fragment key={group.id}>
              <GroupPanelSection group={group} store={store} onClose={onClose} onBecomeList={onBecomeList} />
            </React.Fragment>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/**
 * 单个编组的管理区（组名行/小角颜色/站点网格/添加网站）：GroupPanel 弹窗本体使用，
 * 第二十一轮起组合弹窗（ComboPanel）以 embedded 方式上下复用两份——同一套逻辑，不复制。
 * embedded 时：不渲染关闭按钮（外层弹窗统一提供）、内容区不自带滚动（随外层一起滚）。
 */
export function GroupPanelSection({
  group,
  store,
  onClose,
  onBecomeList,
  embedded = false,
}: {
  group: NavGroup;
  store: LocalStore;
  onClose: () => void;
  onBecomeList: (group: NavGroup) => void;
  embedded?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingSite, setEditingSite] = useState<SiteEntry | null>(null);
  const [siteMenu, setSiteMenu] = useState<SiteMenuState | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [groupName, setGroupName] = useState(group.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { t, lang } = useLang();
  /** 小角颜色名（种子数据在 groups.ts）：显示层按键映射，未命中回落原名 */
  const tabColorName = (value: string, fallback: string): string => {
    const key = `menu.tabColor.${value}`;
    const translated = t(key);
    return translated === key ? fallback : translated;
  };
  /** 就地改名（第六十七轮）：Esc 取消后输入框失焦不能再把名字存回去，用 ref 标记本次已取消 */
  const renameCancelRef = useRef(false);
  const startRename = () => {
    renameCancelRef.current = false;
    setGroupName(group.name);
    setRenaming(true);
  };
  const commitRename = () => {
    const next = groupName.trim();
    if (next && next !== group.name) store.renameGroup(group.id, next);
    setRenaming(false);
  };

  const sorted = useMemo(() => sortSites(group.sites), [group]);
  /** 组内拖动排序（第三十八轮）：每个 Section 一套，组合弹窗里两组互不串组 */
  const siteDrag = useSiteDragSort({
    sites: sorted,
    onReorder: (ids) => store.reorderSites(group.id, ids),
  });
  const showForm = adding || editingSite !== null;

  const switchDisplay = (display: 'list' | 'stack') => {
    if (display === group.display) return;
    store.setGroupDisplay(group.id, display);
    if (display === 'list') onBecomeList(group);
  };

  return (
    <div data-panel-section={group.id} className="contents">
      {/* 头部（第十二轮）：组名 + 组操作全部与组名同一行，右侧依次 形态切换 / 删组 / 关闭；
          已删除「自定义标题」输入行与「按使用频率排序」提示行（subtitle 仅保留在数据模型兼容老数据）。
          第六十七轮：「改组名」按钮与组名旁「N 个站点」计数删除——点组名本身就地改名
          （行内输入预填全选，回车/失焦确认、Esc 取消，空名不保存，沿用旧校验） */}
      <div className="px-5 sm:px-6 pt-5 pb-4 shrink-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {renaming ? (
            <span className="relative block">
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                maxLength={GROUP_NAME_MAX}
                data-group-name-input
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && groupName.trim()) {
                    commitRename();
                  } else if (e.key === 'Escape') {
                    // Esc 取消改名：恢复原名，并阻止弹窗自身的 Esc 关闭监听把整个弹窗关掉
                    e.preventDefault();
                    e.stopPropagation();
                    renameCancelRef.current = true;
                    setGroupName(group.name);
                    setRenaming(false);
                  }
                }}
                onBlur={() => {
                  if (renameCancelRef.current) {
                    setRenaming(false);
                    return;
                  }
                  commitRename();
                }}
                className="w-44 bg-white/5 border border-white/15 rounded-xl px-3 py-1.5 pr-10 text-sm outline-none focus:border-indigo-400/60"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/30 pointer-events-none">
                {textCharCount(groupName)}/{GROUP_NAME_MAX}
              </span>
            </span>
          ) : (
            <>
              <div className="flex items-baseline gap-2.5 min-w-0">
                <h3
                  onClick={startRename}
                  title={t('menu.renameHint')}
                  className="text-lg sm:text-xl font-bold tracking-tight truncate cursor-pointer"
                >
                  {displayGroupName(group, lang)}
                </h3>
              </div>
              {/* 操作控件簇（第四十七轮）：形态切换 / 删组整簇移到行最右端右对齐，
                  左端只留组名（点击就地改名）；单组弹窗里关闭按钮紧随簇后同在右端。
                  第六十七轮：删组改纯图标按钮（垃圾桶与关闭 X 同为 16px、热区同为 32px） */}
              <span className="flex flex-wrap items-center gap-2 ml-auto shrink-0">
              <span className="flex items-center rounded-lg bg-white/5 border border-white/10 overflow-hidden shrink-0">
                <button
                  onClick={() => switchDisplay('list')}
                  title={t('menu.displayListTitle')}
                  className={`text-[11px] px-2.5 py-1 transition-colors ${
                    group.display === 'list' ? 'bg-indigo-500/70 text-white font-medium' : 'text-white/50 hover:text-white/85'
                  }`}
                >
                  {t('menu.displayList')}
                </button>
                <button
                  onClick={() => switchDisplay('stack')}
                  title={t('menu.displayStackTitle')}
                  className={`text-[11px] px-2.5 py-1 transition-colors ${
                    group.display === 'stack' ? 'bg-indigo-500/70 text-white font-medium' : 'text-white/50 hover:text-white/85'
                  }`}
                >
                  {t('menu.displayStack')}
                </button>
              </span>
              {confirmDelete ? (
                <span className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-red-300">{t('menu.deleteGroupConfirm')}</span>
                  <button
                    onClick={() => {
                      store.deleteGroup(group.id);
                      onClose();
                    }}
                    className="px-2 py-1 rounded-md bg-red-500/80 text-white font-medium"
                  >
                    {t('menu.confirmDelete')}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 rounded-md bg-white/10 text-white/70">
                    {t('menu.cancelDelete')}
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  title={t('menu.deleteGroup')}
                  aria-label={t('menu.deleteGroup')}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-red-300 hover:bg-white/10 transition-colors shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              )}
              </span>
            </>
          )}
          {!embedded && (
            <button
              onClick={onClose}
              className={`w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/60 hover:text-white transition-colors shrink-0 ${
                renaming ? 'ml-auto' : ''
              }`}
              aria-label={t('menu.close')}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* 小角颜色：卡面文件夹小角的填充色，点选即时生效并落盘；「默认」= 同色灰。当前色带描边 + 勾标记 */}
        {!renaming && (
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            {/* 第六十七轮：「小角颜色」文字标签按用户要求删除，只留颜色圆点 */}
            <button
              type="button"
              title={t('menu.defaultTabColor')}
              data-tab-color=""
              onClick={() => store.setGroupTabColor(group.id, '')}
              className={`w-5 h-5 rounded-full bg-[#26262e] border flex items-center justify-center transition-transform hover:scale-110 ${
                (group.tabColor ?? '') === '' ? 'border-white ring-2 ring-white/70 ring-offset-2 ring-offset-[#17171d]' : 'border-white/25'
              }`}
            >
              {(group.tabColor ?? '') === '' && <Check size={11} className="text-white/80" />}
            </button>
            {GROUP_TAB_COLORS.map((c) => {
              const active = (group.tabColor ?? '') === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  title={tabColorName(c.value, c.name)}
                  data-tab-color={c.value}
                  onClick={() => store.setGroupTabColor(group.id, c.value)}
                  className={`w-5 h-5 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${
                    active ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-[#17171d]' : ''
                  }`}
                  style={{ backgroundColor: c.value }}
                >
                  {active && <Check size={11} className="text-white drop-shadow" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 内容区：表单（添加/编辑） + 瓷砖网格 */}
      <div className={embedded ? 'px-5 sm:px-6 pb-4' : 'flex-1 overflow-y-auto px-5 sm:px-6 pb-4 min-h-0'}>
        {showForm && (
          <div className="mb-3">
            <SiteForm
              initial={editingSite ?? undefined}
              onSubmit={(draft) => {
                if (editingSite?.id) store.updateSite(group.id, editingSite.id, draft);
                else store.addSite(group.id, draft);
                setAdding(false);
                setEditingSite(null);
              }}
              onCancel={() => {
                setAdding(false);
                setEditingSite(null);
              }}
            />
          </div>
        )}

        {siteDrag.items.length === 0 && !showForm && (
          <div className="pt-10 pb-4 text-center text-sm text-white/40">
            {t('menu.emptyGroupPanel')}
          </div>
        )}
        {/* 网格（含「+ 添加网站」瓷砖）空态也要渲染（第一百轮修复）：此前空态走三元另一支，
            只有提示文案、没有添加入口，新建文件夹组永远加不了第一个站 */}
        {(siteDrag.items.length > 0 || !showForm) && (
          <div
            className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2"
            onPointerDown={siteDrag.onContainerPointerDown}
            onDragStart={siteDrag.onContainerDragStart}
          >
            {siteDrag.items.map((site) => (
              <div
                key={site.id ?? site.name}
                data-panel-site={site.name}
                data-site-drag-id={site.id}
                style={siteDrag.isDragging(site) ? SITE_DRAG_PLACEHOLDER_STYLE : undefined}
                onContextMenu={(e) => {
                  // 站点右键菜单：屏蔽浏览器默认菜单（弹窗不在卡片包装层内，不涉及尺寸菜单）
                  e.preventDefault();
                  e.stopPropagation();
                  setSiteMenu({ ...siteMenuPosition(e), site });
                }}
                className="relative flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-white/[0.05] hover:bg-white/10 border border-white/5 transition-colors"
              >
                {site.pinned && <Pin size={10} className="absolute top-1.5 left-1.5 text-amber-400 fill-amber-400 z-10" />}
                {/* 站点标签徽标（第二十六轮；第七十六轮多标签）：与 B 卡行同一来源（tags）。
                    瓷砖是竖排居中布局（图标在上、名字在下居中截断），名字后方没有横向空间，
                    故保留第四十九轮定版的右上角徽标带（图标已下移避让），双标签在此纵向叠放、右对齐 */}
                {siteTags(site).length > 0 && (
                  <span className="absolute top-1.5 right-1.5 z-10 flex flex-col items-end gap-1">
                    <SiteTagBadges site={site} />
                  </span>
                )}
                <button
                  onClick={() => {
                    // 刚拖完的 click 是拖拽手势的尾巴，吞掉不打开站点
                    if (siteDrag.consumeSuppressClick()) return;
                    window.open(site.url, '_blank');
                  }}
                  title={site.description}
                  className="flex flex-col items-center gap-1.5 w-full mt-4"
                >
                  {/* mt-4（第四十九轮）：图标区下移避开右上角徽标带，徽标独占格子右上角、与图标零重叠 */}
                  <SiteLogo logo={siteIconSrc(site)} name={site.name} url={site.url} size={40} imgSize={28} grayscale={site.dead} />
                  <span className={`text-[11px] font-medium w-full text-center truncate ${site.dead ? 'text-white/45' : 'text-white/85'}`}>
                    {site.name}
                  </span>
                  {site.dead && <span className="text-[8px] font-medium text-red-300 bg-red-500/15 px-1 py-px rounded">{t('menu.dead')}</span>}
                </button>
              </div>
            ))}

            {/* + 添加网站 */}
            <button
              onClick={() => {
                setAdding(true);
                setEditingSite(null);
              }}
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border border-dashed border-white/20 text-white/55 hover:text-white hover:border-indigo-400/50 hover:bg-indigo-500/10 transition-colors min-h-[86px]"
            >
              <Plus size={20} />
              <span className="text-[11px] font-medium">{t('menu.addSite')}</span>
            </button>
          </div>
        )}
      </div>

      {/* 底部失效提示条已按用户要求删除（第二十九轮）：站点瓷砖自身的「失效」徽标与失效标记逻辑保留 */}

      {/* 组内拖动排序的浮动快照（第三十八轮） */}
      {siteDrag.dragLayer}

      {/* 站点右键菜单（打开/编辑/删除）：fixed 定位，渲染在弹窗内容之外不被滚动区裁剪 */}
      {siteMenu && (
        <SiteContextMenu
          state={siteMenu}
          onClose={() => setSiteMenu(null)}
          onOpen={(site) => window.open(site.url, '_blank')}
          onEdit={(site) => {
            setEditingSite(site);
            setAdding(false);
          }}
          onDelete={(site) => {
            if (site.id) store.deleteSite(group.id, site.id);
          }}
        />
      )}
    </div>
  );
}
