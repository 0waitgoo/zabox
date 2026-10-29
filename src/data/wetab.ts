/**
 * WeTab 导出文件（.data，实为 JSON）→ 杂盒编组转换（2026-10-29 用户需求：
 * 让用户把 WeTab 数据一键导进来，不用一个个手动加站）。
 *
 * WeTab 导出信封：{ version, branch, timestamp, platform, data: { 'store-icon': { icons } } }。
 * icons = 分类数组，每项 { id, name, children }；children 里混着三种东西：
 * - 叶子站点：{ name, target(链接), bgType, bgText/bgImage, ... } → 导入；
 * - 文件夹 folder-icon：{ children } → 递归摊平进父组（杂盒组不能嵌套）；
 * - 小组件 widgetName → 跳过（两边小组件体系不同）。
 * 自定义图片图标不带原图（体积不可控），走杂盒自动图标管线；彩色字母图标带 bgText。
 * 本文件只做纯转换，不碰 store；去重与落盘在 localStore.appendGroups 里做。
 */
import type { NavGroup, SiteEntry } from './groups';

export interface WetabImportResult {
  groups: NavGroup[];
  /** 未导入条数（无有效链接/小组件/空分类等） */
  skipped: number;
}

let wetabSeq = 0;
const wetabId = (prefix: string) =>
  `${prefix}-wetab${Date.now().toString(36)}${(wetabSeq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const isHttpUrl = (s: unknown): s is string =>
  typeof s === 'string' && /^https?:\/\//i.test(s.trim());

function collectSites(items: unknown, out: SiteEntry[], skipped: { n: number }): void {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      skipped.n++;
      continue;
    }
    const rec = item as Record<string, unknown>;
    if (Array.isArray(rec.children)) {
      collectSites(rec.children, out, skipped);
      continue;
    }
    if (typeof rec.widgetName === 'string') {
      skipped.n++;
      continue;
    }
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    const target = typeof rec.target === 'string' ? rec.target.trim() : '';
    if (!name || !isHttpUrl(target)) {
      skipped.n++;
      continue;
    }
    const site: SiteEntry = {
      id: wetabId('s'),
      name,
      url: target,
      description: '',
      logo: '',
      frequency: 0,
    };
    // 彩色字母图标：只带 1–2 字文字，颜色不带（杂盒卡面自有配色）
    if (rec.bgType === 'color' && typeof rec.bgText === 'string' && rec.bgText.trim()) {
      site.iconMode = 'text';
      site.iconText = [...rec.bgText.trim()].slice(0, 2).join('');
    }
    out.push(site);
  }
}

export function parseWetabData(parsed: unknown): WetabImportResult | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const root = parsed as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;
  const storeIcon = data['store-icon'] as Record<string, unknown> | undefined;
  const icons = storeIcon?.icons ?? root.icons;
  if (!Array.isArray(icons)) return null;
  const skipped = { n: 0 };
  const groups: NavGroup[] = [];
  for (const g of icons) {
    if (!g || typeof g !== 'object') {
      skipped.n++;
      continue;
    }
    const rec = g as Record<string, unknown>;
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!name || !Array.isArray(rec.children)) {
      skipped.n++;
      continue;
    }
    const sites: SiteEntry[] = [];
    collectSites(rec.children, sites, skipped);
    if (sites.length) groups.push({ id: wetabId('g'), name, display: 'list', sites });
  }
  if (!groups.length) return null;
  return { groups, skipped: skipped.n };
}
