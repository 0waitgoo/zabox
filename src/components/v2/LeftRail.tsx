import { useEffect, useState } from 'react';
import type { LocalStore } from '../../store/localStore';
import { TopLogo, TopNavIcons, LangToggle } from '../Sidebar';
import PresetMenu from './PresetMenu';
import PwaInstallButton from './PwaInstallButton';
import DataMenu from './DataMenu';

/**
 * 左上悬浮图标组（2026-11-05 用户令，截图红线定位置，取代上一版左侧竖向居中毛玻璃栏；
 * 2026-11-05 01:50 用户改定：一行排、不分 3 行）：
 * 不要任何底框/背景容器，图标直接浮在背景上，固定在左上角，一行横排：
 * LOGO、导航页（指南针）、预设（面板内含「外观」节，用户称之为外观）、CN / EN 切换、
 * 下载、「数据」。顺序与每个图标的功能不变，点 LOGO 仍回主页；搜索/AI 整理栏留在
 * 顶部原位（已居中）。随滚动一直可见，不占页面布局。
 * 只在够宽的桌面端出现（与上一版同一断点，见 LEFT_RAIL_MIN_WIDTH）；以下宽度
 * 沿用原顶栏排布（移动端单列尤其不动）。宽屏/窄屏用同一 matchMedia 单实例切换
 * 渲染，避免顶栏与悬浮组两套控件同时挂载（面板状态与测试锚点不重）。
 */

/** 悬浮组生效的最小视口宽 */
export const LEFT_RAIL_MIN_WIDTH = 1780;

export function useWideRail(): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(min-width: ${LEFT_RAIL_MIN_WIDTH}px)`).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(`(min-width: ${LEFT_RAIL_MIN_WIDTH}px)`);
    const onChange = () => setWide(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return wide;
}

/**
 * 左上悬浮组本体：调用方在宽屏时挂载（窄屏不挂载）。
 * showExtras 为真时行尾追加下载与「数据」（仅主页顶栏有这两项，子页面没有）。
 * 无底框：容器只有定位，图标/按钮自带样式；两面板仍向左开口（不伸出视口）。
 */
export default function LeftRail({
  store,
  currentPage,
  onNavigate,
  showExtras,
}: {
  store: LocalStore;
  currentPage: string;
  onNavigate: (page: string) => void;
  showExtras: boolean;
}) {
  return (
    <div data-left-rail className="fixed left-6 top-6 z-40 flex items-center gap-1.5 select-none">
      <TopLogo onClick={() => onNavigate('home')} />
      <TopNavIcons onPageChange={onNavigate} currentPage={currentPage} presetsNode={<PresetMenu store={store} />} />
      <LangToggle />
      {showExtras && (
        <>
          <PwaInstallButton panelAlign="left" />
          <DataMenu store={store} panelAlign="left" />
        </>
      )}
    </div>
  );
}
