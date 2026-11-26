import { useEffect, useState } from 'react';
import type { LocalStore } from '../../store/localStore';
import { TopLogo, TopNavIcons, LangToggle } from '../Sidebar';
import PresetMenu from './PresetMenu';
import PwaInstallButton from './PwaInstallButton';
import DataMenu from './DataMenu';

/**
 * 左上悬浮图标组（2026-11-05 用户令，截图红线定位置，取代上一版左侧竖向居中毛玻璃栏；
 * 2026-11-05 01:50 用户改定：一行排、不分 3 行；
 * 2026-11-26 用户令：整组移到上面中间居中对齐，left-6 改为水平居中；
 * 2026-11-27 用户令：删掉满视口宽的黑条通栏，图标固定在顶部、不跟随滚动条移动——
 *   回到透明的固定居中行（fixed left-1/2 top-6），不要任何底色/底边/毛玻璃/满宽；
 *   往下滚时搜索行/卡片仍会从它底下滚过、可能透出来，是用户明确选了删黑条后的取舍。
 * LOGO、导航页（指南针）、预设（面板内含「外观」节，用户称之为外观）、CN / EN 切换、
 * 下载、「数据」。顺序与每个图标的功能不变，点 LOGO 仍回主页；搜索/AI 整理栏留在
 * 顶部原位（已居中）。随滚动一直可见，不占页面布局（fixed 脱离文档流）。
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
 * 宽屏固定悬浮组本体：调用方在宽屏时挂载（窄屏不挂载）。
 * showExtras 为真时行尾追加下载与「数据」（仅主页顶栏有这两项，子页面没有）。
 * 透明固定居中行：外层只有定位（fixed left-1/2 top-6），无底色/底边/毛玻璃/满宽，
 * 图标/按钮自带样式；滚到下面的内容可能从它底下透出来，是删黑条后的取舍。
 * 两面板仍向左开口（不伸出视口）。外层不设 overflow，避免裁掉预设/数据/下载面板
 * （它们是 absolute top-full 挂在各自触发钮的 relative 包裹层里）。
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
    <div data-left-rail className="fixed left-1/2 -translate-x-1/2 top-6 z-40 flex items-center gap-1.5 select-none">
      <TopLogo onClick={() => onNavigate('home')} />
      <TopNavIcons onPageChange={onNavigate} currentPage={currentPage} presetsNode={<PresetMenu store={store} onNavigate={onNavigate} />} />
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
