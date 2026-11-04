import { useEffect, useState } from 'react';
import type { LocalStore } from '../../store/localStore';
import { TopLogo, TopNav } from '../Sidebar';
import PresetMenu from './PresetMenu';
import PwaInstallButton from './PwaInstallButton';
import DataMenu from './DataMenu';

/**
 * 左侧竖向悬浮栏（2026-11-05 用户令，截图红框定组）：
 * 顶栏左组（LOGO、指南针、预设、中英切换）＋右组（下载、「数据」）全部移入，
 * 顺序与功能不变、只换位置改竖排；搜索/AI 整理栏留在顶部原位。
 * 固定在屏幕左侧、垂直居中，悬浮在内容之上、随滚动一直可见，不占页面布局、
 * 不把组卡往右顶。只在够宽的桌面端出现：内容列 max-w-[1600px] 居中，
 * 1780px 起两侧留白才够放下悬浮栏而不遮组卡；以下宽度沿用原顶栏排布
 * （移动端单列尤其不动）。宽屏/窄屏用同一 matchMedia 单实例切换渲染，
 * 避免顶栏与悬浮栏两套控件同时挂载（面板状态与测试锚点不重）。
 */

/** 悬浮栏生效的最小视口宽 */
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
 * 左侧悬浮栏本体：调用方在宽屏时挂载（窄屏不挂载）。
 * showExtras 为真时追加下载与「数据」（仅主页顶栏有这两项，子页面没有）。
 * 样式与 Dock 栏同款：深色半透明毛玻璃圆角条、无投影（全站去投影口径）。
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
    <div
      data-left-rail
      className="fixed left-4 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-1 rounded-[26px] border border-white/10 bg-[#14141a]/70 px-1.5 py-2.5 backdrop-blur-md select-none"
    >
      <TopLogo onClick={() => onNavigate('home')} />
      <TopNav onPageChange={onNavigate} currentPage={currentPage} presetsNode={<PresetMenu store={store} />} vertical />
      {showExtras && (
        <>
          <div aria-hidden className="my-1 h-px w-8 bg-white/10" />
          <PwaInstallButton panelAlign="left" />
          <DataMenu store={store} panelAlign="left" />
        </>
      )}
    </div>
  );
}
