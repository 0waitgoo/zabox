import React, { useEffect, useState, Suspense } from 'react';
import { TopLogo, TopNav } from './components/Sidebar';
import HomePage from './components/v2/HomePage';
import PresetMenu from './components/v2/PresetMenu';
import TopBarShade from './components/v2/TopBarShade';
import LiquidGlassFilter from './components/v2/LiquidGlassFilter';
import { backgroundPresetOf, useLocalStore } from './store/localStore';
import { loadBgImage } from './store/bgImageDb';
import { applyDisplayPrefs, bgBlurPx, useDisplayPrefs } from './store/displayPrefs';

const NewsPage = React.lazy(() => import('./components/pages/NewsPage'));
const NavPage = React.lazy(() => import('./components/pages/NavPage'));
const WidgetStorePage = React.lazy(() => import('./components/pages/WidgetStorePage'));
const PlanPage = React.lazy(() => import('./components/pages/PlanPage'));
const DarkVeil = React.lazy(() => import('./components/DarkVeil'));
const DappledLight = React.lazy(() => import('./components/backgrounds/DappledLight'));

export default function App() {
  const [currentPage, setCurrentPage] = useState('home');
  // 全站共用一份本地 store（App 持有，传给 HomePage）：背景设置也在这里读
  const store = useLocalStore();
  const background = store.data.background;
  const preset = backgroundPresetOf(background.presetId);

  // 本机显示偏好（第四十二轮）：外观模式 + 编组卡底框透明度，写到 <html> 供样式层消费。
  // 白天模式的最终定义（第五十八轮收敛）：与暗夜完全相同、只有 B/C/组合卡卡面变白底深字——
  // 背景层不因主题做任何区分渲染（旧版「白天压白遮罩洗浅背景」已撤除，见下方遮罩注释）。
  const displayPrefs = useDisplayPrefs();
  useEffect(() => {
    applyDisplayPrefs(displayPrefs);
  }, [displayPrefs]);

  // 本地背景图：kind='local' 时从 IndexedDB 读 Blob 生成 object URL；读不到（换设备导入等）回落预设
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [localReady, setLocalReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setLocalReady(false);
    if (background.kind === 'local') {
      void loadBgImage().then((blob) => {
        if (cancelled || !blob) return;
        url = URL.createObjectURL(blob);
        setLocalUrl(url);
      });
    } else {
      setLocalUrl(null);
    }
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // localStamp 变化 = 用户刚换了本地图（kind 可能同为 'local'），也要重读
  }, [background.kind, background.localStamp]);

  const handlePageChange = (page: string) => {
    setCurrentPage(page);
  };

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage onNavigate={handlePageChange} store={store} />;
      case 'news':
        return <NewsPage />;
      case 'nav':
        return <NavPage />;
      case 'store':
        // 组件商店（第七十四轮）：主页「添加组件」入口升级为整页商店，与其他子页面同一顶栏
        return <WidgetStorePage store={store} onNavigate={handlePageChange} />;
      case 'plan':
        // 计划全窗页（第八十八轮）：计划卡卡头入口进入，与卡面同源数据（同一 store）
        return <PlanPage store={store} />;
      default:
        return <HomePage onNavigate={handlePageChange} store={store} />;
    }
  };

  const showLocalImage = background.kind === 'local' && !!localUrl;
  // 子页面（资讯/导航/商店/计划）：顶栏由 App 渲染、内容走 lazy 页；主页栏在 HomePage 内自理
  // （独立工具页已于第八十六轮删除，文件工具并入主页组件，不再是子页面）
  const isSubPage =
    currentPage === 'news' || currentPage === 'nav' || currentPage === 'store' || currentPage === 'plan';
  // 「深海蓝」第九十二轮改纯色自选：底色 = displayPrefs.oceanColor（默认 #0d2140 原深海蓝）；
  // 第四十四轮的 Binary Orbits 动态背景随之整体下线（本轮口径覆盖旧队列，不再挂载）
  const isOceanSolid = background.kind === 'preset' && background.presetId === 'ocean';

  return (
    <div className="relative min-h-screen w-full text-white bg-black"
      data-liquid-animated-background={background.kind === 'preset' && (background.presetId === 'violet' || preset.dynamic === 'dappled') ? '' : undefined}>
      {displayPrefs.theme === 'liquid' && <LiquidGlassFilter />}
      {/* 全页固定背景层：底层永远是当前预设（纯 CSS），本地图片就绪后淡入覆盖其上，
          再压深色遮罩保证卡片文字可读；默认预设额外保留 DarkVeil 纹理层，维持原观感。
          纯装饰层：pointer-events-none 全穿透（第六十五轮），本层不许再挡任何
          点按/滚轮命中（原先它盖满视口，是左右空白区滚轮死区的命中层之一）；
          第九十二轮的自研动态背景（斑驳光影）同样只作装饰层渲染、不经本层命中
          （同轮的等高潮汐已于第一百零一轮按用户要求删除） */}
      <div
        data-background-layer
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden transition-all duration-700"
        style={{ background: isOceanSolid ? displayPrefs.oceanColor : preset.css }}
      >
        {showLocalImage && (
          <img
            src={localUrl}
            alt=""
            onLoad={() => setLocalReady(true)}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
              localReady ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}
        {/* 遮罩：三档外观一律压黑保文字可读。白天旧版曾改压白（bg-white/55）洗浅整个背景，
            用户实测「整个页面被一层白雾罩住发灰发白」后于第五十八轮撤除——白天只让编组卡
            卡面变白（index.css 作用域规则），背景层与暗夜像素级一致，不叠任何白色 veil。
            本地图片背景时本层另带 backdrop 模糊把照片糊柔：第六十二轮起强度由背景面板
            「背景模糊」滑杆控制（displayPrefs.bgBlur，默认 0.3 ↔ 6px = 此前写死值，0 时不加
            模糊、图片原始清晰度）；行内直写与 TopBarShade 同理，绕开样式表 backdrop 坑。
            压黑的 bg-black/50 本身不动。 */}
        <div
          className="absolute inset-0 bg-black/50"
          data-bg-veil
          style={
            showLocalImage && bgBlurPx(displayPrefs.bgBlur) > 0
              ? {
                  backdropFilter: `blur(${bgBlurPx(displayPrefs.bgBlur)}px)`,
                  WebkitBackdropFilter: `blur(${bgBlurPx(displayPrefs.bgBlur)}px)`,
                }
              : undefined
          }
        ></div>
        {/* DarkVeil Background（仅默认预设：三档外观都在，背景层不随主题变的口径下与暗夜一致） */}
        {background.kind === 'preset' && background.presetId === 'violet' && (
          <div className="absolute inset-0 z-1">
            <Suspense fallback={null}>
              <DarkVeil hueShift={0} noiseIntensity={0} scanlineIntensity={0} speed={1} scanlineFrequency={0} warpAmount={2} resolutionScale={0.6} />
            </Suspense>
          </div>
        )}
        {/* 第九十二轮自研动态背景「斑驳光影」：与 DarkVeil 同位（压黑遮罩之上、近黑底色不影响文字可读）；
            只在对应预设被选中时挂载，组件内部管 DPR 封顶与隐藏暂停 */}
        {background.kind === 'preset' && preset.dynamic === 'dappled' && (
          <div className="absolute inset-0 z-1">
            <Suspense fallback={null}><DappledLight className="absolute inset-0" /></Suspense>
          </div>
        )}
      </div>

      {/* Main Content */}
      {/* h-dvh 固定视口高度：让内部 overflow-y-auto 容器成为真正的滚动区，position: sticky 吸顶才有可依附的滚动容器 */}
      {/* 第六十五轮（滚轮死区）：本容器不再 max-w-[1600px] 居中、横向 padding 也撤掉——
          原先滚动容器被关在居中 1600 列内，宽屏两侧空白条的滚轮命中只能落到背景层/根层、
          祖先链里没有可滚动盒子（页面又被 h-dvh 锁死、窗口本身不滚），滚了没反应。
          改法：容器铺满视口宽，1600 列宽与横向 padding 下放到滚动区内的子层各自居中复刻
          （子页面顶栏 div、页面内容列 div），列宽/列内几何与改前逐像素一致；
          滚动区因此横贯全视口，鼠标在任意横位置滚轮都能滚。纵向 py 不动；
          原容器 gap（栏与 main 的间距）改由子页面内容列的 pt 在滚动区内复刻。 */}
      <div className="relative z-10 flex flex-col h-dvh w-full py-3 sm:py-4 md:py-6">
        {/* 顶栏遮挡带（第五十九轮引入、第六十三轮改全幅）：fixed 铺满视口上/左/右，
            在本容器层统一渲染一份（主页/子页面共用），变体按当前页实际渲染的栏选
            （子页面栏在本组件内、主页栏在 HomePage 内，高度差只有 -mt-1 的 4px）。
            几何与层级见 index.css .topbar-shade */}
        <TopBarShade variant={isSubPage ? 'sub' : 'home'} />
        <main className="flex-1 flex flex-col min-h-0">
          {/* 滚动区横贯全视口（第六十五轮）：页面内容在区内再套一层居中列
              （max-w+横向 padding 复刻原容器列宽），列宽与改前一致；
              居中列 overflow 可见，主页拖拽的 findScrollAncestor 向上仍命中本滚动区 */}
          <div className="flex-1 overflow-y-auto pb-20 sm:pb-6">
            {/* 子页面顶栏与主页吸顶栏同款渲染（第四十三轮修漂移）：同样的 4 栏 grid 左半——
                LOGO + 背景按钮 + 导航图标组（第六十四轮：左组全去底色、白色图标，LOGO 两页同位），
                位置/间距/高亮与主页完全一致，不再用旧的居中导航行；
                右半（搜索/数据）是主页专属，子页面留空占位保持左半位置不变。
                第六十五轮起本栏移进滚动区内 sticky（原在滚动区外的 flex 列里）：一是与主页栏
                同框居中——滚动条移到视口右缘后滚动区内容框比视口窄一个滚动条宽，栏只有同在
                滚动区内与内容列同框，左组横坐标才能与主页栏逐像素一致；二是栏在滚动区内，
                悬停栏上滚轮同样滚页面。sticky top-0 贴的是滚动区上缘、正落在外层容器 py 之下，
                与移入前「栏贴容器内容顶」的静止位相同；不带主页那条的 -mt-1（主页栏在滚动
                容器内、边距折叠后净偏移与此处不同，实测去掉后三页图标组 Y 坐标一致）。
                栏与内容的间距由下方内容列的 pt 复刻原容器 gap（gap-4/sm:gap-6） */}
            {isSubPage && (
              <div className="sticky top-0 z-50 pt-1 pb-2 mx-auto w-full max-w-[1600px] px-3 sm:px-4 md:px-6">
                {/* 行高与主页栏对齐（第六十四轮实测修正）：主页栏行高由搜索框（h-12/sm:h-13）撑起、
                    左组在行内居中；子页面无搜索框、行高只剩左组 40px，整组比主页高 6px。
                    给子页面 grid 同款 min-h 后两处左组中心线回到同一 Y 坐标。
                    列宽同主页：移动端左列按内容宽（加 LOGO 后约 207px，半屏装不下会溢出）、右列吃剩余 */}
                <div className="grid grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-4 gap-3 sm:gap-4 items-center min-h-12 sm:min-h-13">
                  <div className="col-span-1 lg:col-span-2 flex items-center justify-start gap-2 min-w-0">
                    <TopLogo onClick={() => handlePageChange('home')} />
                    <TopNav onPageChange={handlePageChange} currentPage={currentPage} presetsNode={<PresetMenu store={store} />} />
                  </div>
                  <div className="col-span-1 lg:col-span-2" />
                </div>
              </div>
            )}
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                </div>
              }
            >
              <div
                className={`mx-auto w-full max-w-[1600px] px-3 sm:px-4 md:px-6${isSubPage ? ' pt-4 sm:pt-6' : ''}`}
              >
                {renderCurrentPage()}
              </div>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
