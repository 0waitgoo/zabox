/**
 * 顶栏一栏两模式（2026-10-30）：顶栏搜索栏与原 AI 整理条合并为一栏。
 * - 平时只显示一栏：分段开关点一下切模式，搜索 / AI 整理各点一下即切换；
 * - 搜索模式：原顶栏搜索（搜网站、编组），默认模式；
 * - AI 整理模式：原 AI 整理条（一句话输入 + 一键分类 / 搜集网站 + 设置齿轮），
 *   接入方式、模型获取、结果先确认再落盘一律照旧；
 * - 状态一眼可见：分段开关当前模式高亮（白底深字 + 图标），容器带 data-topbar-mode；
 * - 输入不串模式：两栏都挂载不卸载，各自的输入 state 互不相干，切回时原内容还在；
 *   搜索栏切走时下拉关闭、切回时自动聚焦；AI 栏切回时同样聚焦。
 * 两栏都不参与卡片布局；模式只存本会话，不进同步数据。
 * 一体式搜索栏（2026-11-27 用户令）：「搜索」「AI 整理」两钮放进搜索框里面，
 * 整条是一个容器（card-glass-surface 圆角边框）：左侧两钮＋分隔线，右侧接当前模式
 * 的输入行（搜索输入或 AI 输入，均为 bare 模式、无各自独立框体）；搜索下拉锚到
 * 整条容器（left-0 right-0，与整条同宽）；AI 模式按钮多时容器可纵向长高（min-h），
 * 仍是一个容器。窄屏/手机同样一体。
 */

import { useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import type { NavGroup } from '../../data/groups';
import type { LocalStore } from '../../store/localStore';
import { useLang } from '../../i18n/useLang';
import StickySearch from './StickySearch';
import SiteAiAssistant from './SiteAiAssistant';

export type TopBarMode = 'search' | 'ai';

export default function UnifiedSearchAiBar({
  groups,
  onOpenGroup,
  store,
}: {
  groups: NavGroup[];
  onOpenGroup: (group: NavGroup) => void;
  store: LocalStore;
}) {
  const [mode, setMode] = useState<TopBarMode>('search');
  const { t } = useLang();

  const switchCls = (isActive: boolean) =>
    `flex items-center gap-1 rounded-full px-2 sm:px-2.5 py-1.5 text-xs font-medium transition-colors ${
 isActive ? 'bg-white text-black' : 'text-white/55 hover:text-white'
    }`;

  return (
    <div
      data-topbar-mode={mode}
      className="relative flex flex-1 min-w-0 items-center gap-2 card-glass-surface rounded-2xl border border-white/10 min-h-12 sm:min-h-13 pl-2 pr-3 py-1 focus-within:border-indigo-400/40 transition-colors"
    >
      {/* 两模式钮放进框内左侧（扁平化，不再另套药丸容器），右侧分隔线后接输入行 */}
      <div
        role="tablist"
        aria-label={t('topbar.modeAria')}
        data-topbar-mode-switch
        className="flex shrink-0 items-center gap-0.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'search'}
          aria-label={t('topbar.searchMode')}
          title={t('topbar.searchTitle')}
          data-topbar-mode-search
          onClick={() => setMode('search')}
          className={switchCls(mode === 'search')}
        >
          <Search size={13} />
          {t('topbar.search')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'ai'}
          aria-label={t('topbar.aiMode')}
          title={t('topbar.aiTitle')}
          data-topbar-mode-ai
          onClick={() => setMode('ai')}
          className={switchCls(mode === 'ai')}
        >
          <Sparkles size={13} />
          AI<span className="hidden sm:inline">{t('topbar.aiOrganize')}</span>
        </button>
      </div>
      <span aria-hidden className="w-px self-stretch my-2 bg-white/10 shrink-0" />

      <StickySearch
        groups={groups}
        onOpenGroup={onOpenGroup}
        store={store}
        active={mode === 'search'}
        bare
      />
      <SiteAiAssistant store={store} active={mode === 'ai'} compactBar bare />
    </div>
  );
}
