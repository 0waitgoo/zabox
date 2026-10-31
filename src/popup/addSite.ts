/**
 * 扩展添加面板的数据层（popup 专用，与主应用共用同一份本地存储 + 同步协议）：
 * - 读：localStorage 的 ainav-store-v1（与新标签页同 origin），经 validateStoreData 校验；
 * - 组来源：「我的」预设快照（myPreset.groups）优先——用户在哪个预设下浏览都不影响，
 *   加进的站永远归「我的」；快照为空时回落当前主页编组，并在写入时顺手生成快照
 *   （与 update()「构成一变即存我的」的语义一致，不动任何内置预设定义）；
 * - 写：目标组同时写进快照与当前编组（同组 id、同站点 id），updatedAt 刷新为最新，
 *   供新标签页的 storage 事件采纳与 GitHub 同步裁决；activePreset 不动（不替用户切预设）；
 * - 推：写完本地后，若本机 GitHub 同步已配置且开启，立即按 DataMenu 同款裁决推一次
 *   （云端更新 → 不覆盖，留给新标签页拉取裁决；云端更旧/无文件 → 写回并更新同步基准）。
 */
import {
  compositionOf,
  logoForSite,
  STORE_STORAGE_KEY,
  validateStoreData,
  type StoreData,
} from '../store/localStore';
import type { NavGroup, SiteEntry } from '../data/groups';
import {
  ghGetFile,
  ghPutFile,
  githubConfigComplete,
  loadGithubSyncMeta,
  saveGithubSyncMeta,
} from '../store/githubSync';
import { packDataEnvelope } from '../store/widgetStorage';

export interface PopupAddInput {
  groupId: string;
  name: string;
  url: string;
  /** 图标文字（1–2 字符），空 = 不用字母图标 */
  iconText: string;
  /** 字母图标底色（#rrggbb），空 = 按文字自动取色 */
  iconColor: string;
}

export type ReadStoreResult =
  | { status: 'ok'; data: StoreData; myGroups: NavGroup[]; hasMyPreset: boolean }
  | { status: 'uninitialized' };

/** 读本机存储：无数据/结构非法 = 未初始化（须先打开一次杂盒主页完成初始化） */
export function readPopupStore(): ReadStoreResult {
  try {
    const raw = localStorage.getItem(STORE_STORAGE_KEY);
    if (!raw) return { status: 'uninitialized' };
    const data = validateStoreData(JSON.parse(raw));
    if (!data) return { status: 'uninitialized' };
    return {
      status: 'ok',
      data,
      myGroups: data.myPreset ? data.myPreset.groups : data.groups,
      hasMyPreset: data.myPreset !== null,
    };
  } catch {
    return { status: 'uninitialized' };
  }
}

/** 与 addSite 同款的站点 id 生成（localStore 的 genId 未导出，格式一致即可） */
const genSiteId = () => `s-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** 网址去重比对：去首尾空白 + 末尾斜杠 */
export const normalizeSiteUrl = (url: string): string => url.trim().replace(/\/+$/, '');

export function isSiteInGroup(group: NavGroup, url: string): boolean {
  const target = normalizeSiteUrl(url);
  return group.sites.some((s) => normalizeSiteUrl(s.url) === target);
}

export type AddSiteResult =
  | { status: 'added'; data: StoreData; siteId: string }
  | { status: 'duplicate' };

/**
 * 把站点写进 store（纯函数，不碰 localStorage，调用方落盘）：
 * 快照组与当前编组中同 id 的组各写一份（同 id 保证两边是同一站点）。
 */
export function buildAddedStore(data: StoreData, input: PopupAddInput): AddSiteResult {
  const next: StoreData = structuredClone(data);
  const snapshotGroups = next.myPreset ? next.myPreset.groups : next.groups;
  const target = snapshotGroups.find((g) => g.id === input.groupId);
  if (!target) return { status: 'duplicate' };
  if (isSiteInGroup(target, input.url)) return { status: 'duplicate' };

  const text = [...input.iconText.trim()].slice(0, 2).join('');
  const color = /^#[0-9a-fA-F]{6}$/.test(input.iconColor) ? input.iconColor : '';
  const useLetterIcon = Boolean(text || color);
  const minFreq = target.sites.reduce((min, s) => Math.min(min, s.frequency), 0);
  const site: SiteEntry = {
    id: genSiteId(),
    name: input.name,
    url: input.url,
    description: '',
    logo: logoForSite(input.name, input.url),
    aliases: [],
    pinned: false,
    frequency: Math.min(0, minFreq) - 1,
    ...(useLetterIcon
      ? {
          iconMode: 'text' as const,
          iconText: text || [...input.name.trim()][0] || '?',
          ...(color ? { iconColor: color } : {}),
        }
      : {}),
  };

  target.sites.push(site);
  const live = next.groups.find((g) => g.id === input.groupId);
  if (live && live !== target) live.sites.push(structuredClone(site));

  // 快照为空时：按写入后的构成生成「我的」快照（与 update() 自动存快照的语义一致）
  if (!next.myPreset) next.myPreset = structuredClone(compositionOf(next));
  next.updatedAt = Date.now();
  return { status: 'added', data: next, siteId: site.id };
}

/** 落盘（调用方在 build 后执行，与主应用同一 key、同一格式） */
export function savePopupStore(data: StoreData): void {
  localStorage.setItem(STORE_STORAGE_KEY, JSON.stringify(data));
}

export interface PushResult {
  pushed: boolean;
  reason?: 'not-configured' | 'remote-newer' | 'conflict' | 'error';
  message?: string;
}

/** 按 DataMenu 同款裁决把刚写好的本地数据推上 GitHub（仅在已配置且开启时） */
export async function pushAddedStore(data: StoreData): Promise<PushResult> {
  const meta = loadGithubSyncMeta();
  if (!meta.enabled || !githubConfigComplete(meta)) {
    return { pushed: false, reason: 'not-configured' };
  }
  const cfg = meta;
  const text = JSON.stringify(packDataEnvelope(data), null, 2);
  const remote = await ghGetFile(cfg);
  if (remote.kind === 'error') {
    return { pushed: false, reason: 'error', message: remote.message };
  }
  const markSynced = (sha: string) =>
    saveGithubSyncMeta({ ...loadGithubSyncMeta(), lastSha: sha, baseUpdatedAt: data.updatedAt, lastSyncedAt: Date.now() });
  if (remote.kind === 'missing') {
    const res = await ghPutFile(cfg, text, null);
    if (res.kind === 'ok') {
      markSynced(res.sha);
      return { pushed: true };
    }
    return { pushed: false, reason: res.kind === 'conflict' ? 'conflict' : 'error', message: res.kind === 'error' ? res.message : undefined };
  }
  if (remote.updatedAt > data.updatedAt) {
    // 云端更新：不覆盖，留给新标签页打开时拉取裁决
    return { pushed: false, reason: 'remote-newer' };
  }
  const res = await ghPutFile(cfg, text, remote.sha);
  if (res.kind === 'ok') {
    markSynced(res.sha);
    return { pushed: true };
  }
  return { pushed: false, reason: res.kind === 'conflict' ? 'conflict' : 'error', message: res.kind === 'error' ? res.message : undefined };
}
