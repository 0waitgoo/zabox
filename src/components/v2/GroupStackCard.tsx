import React from 'react';
import { motion } from 'motion/react';
import { groupIcon, siteIconSrc, sortSites, type NavGroup, type SiteEntry } from '../../data/groups';
import type { LocalStore } from '../../store/localStore';
import { cachedIconSrc, nextFallbackIconSrc, storeIconSrc } from './Card';
import { useSiteDragSort } from './useSiteDragSort';

/**
 * C 型 · 编组堆叠卡（默认 1 栏 × 1X）——「极简文件夹」卡面（第十二轮，用户在第三轮线稿中选定方案四）
 * - 去掉纸片：卡身为四角完整的圆角矩形；上沿左端一个与卡身一体的小角（标签凸起，从卡身后探出、同色系），
 *   小角颜色可按组设置（group.tabColor），未设置时为默认同色灰——用户靠颜色一眼认组
 * - 标题行：组图标瓷砖 + 组名（粗体），右侧小字「N 个站点」；标题行下有一条口线（分隔线）暗示文件夹口
 * - 不再渲染副标题行（subtitle 字段仅保留在数据模型兼容老数据）
 * - 底部图标排是主角：图标瓷砖（置顶优先 + 频率序）可点击直达、悬停放大；卡面其余区域点击打开组弹窗（GroupPanel）
 * - 第十三轮（纠正）：卡身底色不用全透明，改回 B 卡（GroupListCard）同款半透明底——
 *   与 .glass-panel 同数值：rgba(30, 30, 35, 0.4) + backdrop-blur(24px)，页面背景半透出、两型卡观感一致
 * - 第十六轮：与 B 卡一样可右键改尺寸（groupLayouts 按组存，缺省 1 栏 × 1x）
 * - 第十七轮：去掉卡身外投影（原 shadow-xl shadow-black/30），卡面走扁平；图标瓷砖经常态/悬停态核查本就无阴影类，未动
 * - 第二十一轮：卡框（StackCardFrame）与瓷砖区（StackSiteTiles）抽成共享组件，组合卡（ComboCard）复用同一套外观与排版规则
 * - 第五十三轮：卡面图标全形态统一尺寸与排布（见 FACE_TILE_SIZE 与 StackSiteTiles 注释）——
 *   取代第二十二轮「2x 网格撑满卡宽、瓷砖随卡宽放大」的旧规则
 * - 第五十六轮：布局修正——高 1x 卡面只显示一行（按卡宽截断）；高 2x 改为从图标区左上角起排，
 *   取消整块居中（见 StackSiteTiles 注释）
 * - 第六十三轮：高 1x 单行也改从左起排（用户推翻第五十六轮的单行水平居中），与 2x 第一行同左缘
 */

/** 组合卡专用小角：造型与普通 C 卡小角一致（圆角上沿 + clipPath 裁下 7px），按左右半区定位、宽度略收，两块之间留间隙 */
function ComboTabBump({ color, side }: { color: string; side: 'left' | 'right' }) {
  const c = color?.trim() ? color.trim() : '';
  return (
    <div
      data-tab-bump
      data-ear-side={side}
      className="absolute top-0 z-20 h-[20px] w-[40%] max-w-[140px] rounded-t-[13px] border border-b-0 pointer-events-none"
      style={{
        backgroundColor: c || '#26262e',
        borderColor: c || 'rgba(255,255,255,0.1)',
        clipPath: 'inset(0 0 7px 0)',
        ...(side === 'left' ? { left: 18 } : { left: 'calc(50% + 8px)' }),
      }}
    />
  );
}

/** C 卡卡框：小角 + 半透明卡身。普通 C 卡与组合卡共用，children 渲染在卡身内（标题行/口线/瓷砖区由调用方组织） */
export function StackCardFrame({
  tabColor,
  tabEars,
  onClick,
  delay = 0,
  ariaLabel,
  children,
  rootProps,
}: {
  /** 小角填充色（已解析：空字符串 = 默认同色灰） */
  tabColor: string;
  /** 组合卡专用（第三十三轮）：左右两组各自的 tabColor，传入时渲染两个小角（各对齐一个 tab、颜色固定不随激活 tab 变），忽略 tabColor */
  tabEars?: [string, string];
  onClick?: () => void;
  delay?: number;
  ariaLabel: string;
  children: React.ReactNode;
  /** 透传到根节点的数据属性（如组合卡的 data-combo-card） */
  rootProps?: Record<string, string>;
}) {
  const color = tabColor?.trim() ? tabColor.trim() : '';
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      onClick={onClick}
      whileHover={{ y: -3 }}
      className="relative w-full h-full text-left group/card cursor-pointer"
      role="button"
      aria-label={ariaLabel}
      {...rootProps}
    >
      {/* 卡身：四角完整的圆角矩形，底色为 B 卡同款半透明（.glass-panel 同数值 rgba(30,30,35,0.4) + blur(24px)，内联实现不动 index.css），
          悬停只提亮描边，不改变底色 */}
      <div
        data-stack-body
        style={{
          background: 'rgb(var(--group-card-rgb) / var(--group-card-alpha, 0.4))',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          /* 第五十三轮：卡身作容器查询上下文，卡面瓷砖尺寸变量（--face-tile-size）里的 cqw 以卡宽为基准解析 */
          containerType: 'inline-size',
        }}
        className="group-card-scope absolute inset-x-0 bottom-0 top-[13px] z-10 rounded-[22px] border border-white/10 transition-colors group-hover/card:border-white/[0.18] px-4 pt-3.5 pb-4 flex flex-col overflow-hidden"
      >
        {children}
      </div>

      {/* 小角（标签凸起）：从卡身上沿探出，与卡身同色系一体；设了 tabColor 时按组色填充（含同色描边，避免浮在亮背景上丢边）。
          clipPath 裁掉下 7px：只保留卡身上沿以上的可见轮廓（小角可见部分与卡身零重叠，造型号与位置一字未动）。
          第九十六轮：小角改在卡身**之后**绘制（z-20 压卡身 z-10），不进入卡身 backdrop-filter
          的采样内容（当时是为已删除的液态玻璃折射鬼线而改，第一百零二轮玻璃删除后此绘制
          顺序保持不变，几何与观感不动）。 */}
      {tabEars ? (
        <>
          <ComboTabBump color={tabEars[0]} side="left" />
          <ComboTabBump color={tabEars[1]} side="right" />
        </>
      ) : (
        <div
          data-tab-bump
          className="absolute top-0 left-[18px] z-20 h-[20px] w-[46%] max-w-[150px] rounded-t-[13px] border border-b-0"
          style={{
            backgroundColor: color || '#26262e',
            borderColor: color || 'rgba(255,255,255,0.1)',
            clipPath: 'inset(0 0 7px 0)',
          }}
        />
      )}
    </motion.div>
  );
}

/** 组标题图标瓷砖（头图标规则与普通 C 卡一致：组首站图标，无站点时回落组名首字） */
export function StackGroupIcon({ group, size = 30 }: { group: NavGroup; size?: number }) {
  const first = sortSites(group.sites)[0];
  const initial = groupIcon(group);
  const iconName = first?.name ?? group.name;
  return (
    <div
      className="site-icon-frame rounded-[9px] bg-white flex items-center justify-center overflow-hidden shrink-0"
      style={{ width: size, height: size }}
    >
      {group.sites.length > 0 ? (
        <img
          src={cachedIconSrc(first?.url, initial, iconName) ?? initial}
          alt={group.name}
          loading="lazy"
          className="object-contain"
          style={{ width: size * 0.63, height: size * 0.63 }}
          onLoad={(e) => {
            const target = e.target as HTMLImageElement;
            if (target.src.includes('/favicon.ico') || target.src.startsWith('data:')) {
              storeIconSrc(first?.url, initial, iconName, target.src);
            }
          }}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            // 组头图标加载失败 → 二段回落（同 SiteTile：本地图标 404 → 该站 favicon → 字母）；字标本身再失败才隐藏
            const next = nextFallbackIconSrc(target.src, first?.url, iconName);
            if (next !== undefined) target.src = next;
            else target.style.display = 'none';
          }}
        />
      ) : (
        <span className="text-slate-400 text-[13px] font-bold">{group.name.charAt(0)}</span>
      )}
    </div>
  );
}

/**
 * 卡面瓷砖尺寸（第五十三轮，全形态统一）：
 * 基准 = 改版前「宽 1 栏 × 高 2x」形态下瓷砖的实测边长 60.4px、gap 10px（1680 视口实测）。
 * --face-tile-size 用 cqw 复刻基准公式：cqw 的基准是容器（StackCardFrame 卡身）的 content-box 宽，
 * 基准卡 content-box = 342px = 5×60.4 + 4×10，故 tile = (100cqw − 4×gap) / 5、上限 60.4px：
 * 卡宽达到基准宽度时恒为 60.4px，更窄的卡（小屏）按同一公式等比缩小——任何视口下
 * 四种形态（1/2 栏 × 1x/2x）的卡面图标都等于该视口下「1 栏 2x」的尺寸，不再随形态变化。
 * gap 同为全形态统一常量 10px（横向与纵向同值）：实测自「1 栏卡面 5 个基准图标恰好排满一整行」——
 * 4 个图标间隙恒为 10px、整行 341.95px 恰好填满 content-box（342），两侧各 17px 只是卡身自带的
 * 16px 内边距 + 1px 边框、无额外分配；5 个/行只是这套常量在 1 栏宽下的自然结果，不是排布规则。
 */
const FACE_TILE_VARS = {
  '--face-tile-size': 'min(60.4px, calc((100cqw - 40px) / 5))',
  '--face-tile-gap': '10px',
} as React.CSSProperties;

/** 单个站点瓷砖（圆角块 + 铺满的站点图标 + 下方名字，名字字号与弹窗瓷砖一致 11px；
 * 尺寸走全形态统一变量；点击直达并阻止冒泡；
 * 跨组拖拽源：带 data-site-drag-id，拖完的 click 由宿主 guardClick 吞掉 */
function SiteTile({ site, guardClick }: { site: SiteEntry; guardClick?: () => boolean }) {
  const initial = siteIconSrc(site);
  const src = cachedIconSrc(site.url, initial, site.name) ?? initial;
  const openSite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (guardClick?.()) return;
    window.open(site.url, '_blank');
  };
  return (
    <button
      type="button"
      title={site.name}
      data-face-site={site.name}
      data-site-drag-id={site.id}
      onClick={openSite}
      className="group/face shrink-0 rounded-[13px] hover:z-20 flex flex-col items-center"
      style={{ width: 'var(--face-tile-size)' }}
    >
      <span
        className="site-icon-frame block w-full rounded-[13px] overflow-hidden transition-transform duration-150 group-hover/face:scale-110"
        style={{ height: 'var(--face-tile-size)' }}
      >
        <img
          src={src}
          alt={site.name}
          loading="lazy"
          className={`w-full h-full object-contain ${site.dead ? 'grayscale opacity-60' : ''}`}
          onLoad={(e) => {
            const target = e.target as HTMLImageElement;
            if (target.src.includes('/favicon.ico') || target.src.startsWith('data:')) {
              storeIconSrc(site.url, initial, site.name, target.src);
            }
          }}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            // 二段回落（2026-10-28 晚）：本地图标 404 → 该站自己的 /favicon.ico → 字母
            const next = nextFallbackIconSrc(target.src, site.url, site.name);
            if (next !== undefined) target.src = next;
          }}
        />
      </span>
      <span className={`mt-1 w-full text-center truncate text-[11px] font-medium ${site.dead ? 'text-white/45' : 'text-white/85'}`}>
        {site.name}
      </span>
    </button>
  );
}

/**
 * 1x 卡面单行可容纳的瓷砖数（第五十六轮）：实测图标区宽度后按第五十三轮的同一套
 * 尺寸/间距常量反推——瓷砖边长 t = min(60.4, (W − 40) / 5)、gap 10px（W = 图标区宽，
 * 与卡身 content-box 同宽，即 cqw 公式里的基准宽），一行可容纳数 = floor((W + gap) / (t + gap))。
 * +0.5px 容差抵消「5 个恰好排满」边界上的浮点误差。测不到宽度时不截断（返回 Infinity）。
 */
function useRowFitCount(zoneRef: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  const [count, setCount] = React.useState<number>(Number.POSITIVE_INFINITY);
  React.useEffect(() => {
    if (!enabled) {
      setCount(Number.POSITIVE_INFINITY);
      return;
    }
    const el = zoneRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (!w) return;
      const tile = Math.min(60.4, (w - 40) / 5);
      const n = Math.max(1, Math.floor((w + 10 + 0.5) / (tile + 10)));
      setCount(n);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoneRef, enabled]);
  return count;
}

/**
 * C 卡底部瓷砖区（普通 C 卡与组合卡共用，第五十三轮尺寸口径 + 第五十六轮布局修正）：
 * 全部形态共用同一套常量——图标尺寸（FACE_TILE_VARS 的 1栏2X 基准）+ 统一 gap 10px，
 * 排布按高度分两型（用户第五十六轮拍板）：
 * - 高 1x：卡面只显示**一行**——按卡宽可容纳数截断（见 useRowFitCount），超出的站点
 *   不在卡面出现（弹窗里照常可见）；这一行在图标区内垂直居中、水平**从左起排**
 *   （第六十三轮：用户「不要居中，靠左就行」推翻第五十六轮的单行居中，左缘与 2x 第一行一致）。
 * - 高 2x：流式网格**从图标区左上角开始布局**——第一行顶着图标区顶部、每行从左边缘
 *   逐个排、逐行向下，全部站点都摆出来（排不下自动换行，每行个数由卡宽决定）；
 *   取消第五十三轮的整块横向/纵向居中（居中会让上方留大块空白、末行单个图标跑到中间）。
 * colSpan 仅保留签名兼容，排布不按宽度分支（两栏同理：1x 一行截断、2x 左上起排）。
 */
export function StackSiteTiles({
  group,
  store,
  colSpan = 1,
  heightUnits = 1,
}: {
  group: NavGroup;
  store: LocalStore;
  /** 仅签名兼容：排布只按高度分支（第五十六轮），宽度只影响每行可容纳数 */
  colSpan?: 1 | 2;
  heightUnits?: 1 | 2;
}) {
  const sorted = sortSites(group.sites);
  const zoneRef = React.useRef<HTMLDivElement | null>(null);
  const fitCount = useRowFitCount(zoneRef, heightUnits === 1);
  const visible = heightUnits === 1 ? sorted.slice(0, fitCount) : sorted;
  // 卡面瓷砖跨组拖拽（与 B 卡收起网格同规则：随时按住都可拖，拖到别的组卡松手即 moveSite；
  // 组合卡 active 组瓷砖同样走这里；弹窗（GroupPanel）内瓷砖不接——弹窗盖住目标卡，拖不出去）
  const crossDrag = useSiteDragSort({
    sites: sorted,
    groupId: group.id,
    crossGroupOnly: true,
    onMoveToGroup: (siteId, targetGroupId) => store.moveSite(group.id, siteId, targetGroupId),
  });
  return (
    <>
    <div
      ref={zoneRef}
      data-tiles-zone
      data-cross-source
      onPointerDown={crossDrag.onContainerPointerDown}
      onDragStart={crossDrag.onContainerDragStart}
      style={FACE_TILE_VARS}
      className={`flex-1 min-h-0 flex pt-3 relative ${
        /* 1x：补 pb-3 与 pt-3 对称，单行在整个图标区（含内边距）内真正垂直居中；水平靠左（第六十三轮） */
        heightUnits === 1 ? 'items-center justify-start pb-3' : 'items-start justify-start'
      }`}
    >
      {group.sites.length === 0 ? (
        <span className="text-[11px] text-white/35">点开添加第一个网站</span>
      ) : heightUnits === 1 ? (
        <div
          data-tiles-flow
          className="w-full flex flex-nowrap items-center justify-start overflow-hidden"
          style={{ gap: 'var(--face-tile-gap)' }}
        >
          {visible.map((site) => (
            <React.Fragment key={site.id ?? site.name}>
              <SiteTile site={site} guardClick={crossDrag.consumeSuppressClick} />
            </React.Fragment>
          ))}
        </div>
      ) : (
        <div
          data-tiles-flow
          className="w-full flex flex-wrap items-start justify-start content-start"
          style={{ gap: 'var(--face-tile-gap)' }}
        >
          {visible.map((site) => (
            <React.Fragment key={site.id ?? site.name}>
              <SiteTile site={site} guardClick={crossDrag.consumeSuppressClick} />
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
    {crossDrag.dragLayer}
    </>
  );
}

export default function GroupStackCard({
  group,
  store,
  onOpen,
  delay = 0,
  colSpan = 1,
  heightUnits = 1,
}: {
  group: NavGroup;
  store: LocalStore;
  onOpen: (group: NavGroup) => void;
  delay?: number;
  /** 右键布局宽度（瓷砖尺寸已全形态统一，此值不再影响图标大小） */
  colSpan?: 1 | 2;
  /** 右键布局高度（卡面排布已全形态统一为同一常量流式排布，此值只决定卡高） */
  heightUnits?: 1 | 2;
}) {
  return (
    <StackCardFrame tabColor={group.tabColor ?? ''} onClick={() => onOpen(group)} delay={delay} ariaLabel={`${group.name} 编组`}>
      {/* 标题行：组图标瓷砖 + 组名；右侧小字「N 个站点」 */}
      <div className="flex items-center gap-2.5 min-w-0">
        <StackGroupIcon group={group} />
        <h3 className="flex-1 min-w-0 font-bold text-[15px] tracking-tight truncate">{group.name}</h3>
        <span className="text-[11px] text-white/40 shrink-0">{group.sites.length} 个站点</span>
      </div>

      {/* 口线：标题行下的一条分隔线，暗示文件夹的开口 */}
      <div className="mt-3 h-px bg-white/[0.08] shrink-0" />

      {/* 底部图标区（主角）：瓷砖可点击直达、悬停放大；未展示完以渐隐罩提示（无 +N 数字） */}
      <StackSiteTiles group={group} store={store} colSpan={colSpan} heightUnits={heightUnits} />
    </StackCardFrame>
  );
}
