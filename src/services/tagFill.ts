import { cleanSiteTags, navGroups, siteTags, SITE_TAGS_MAX_COUNT, type NavGroup, type SiteEntry } from '../data/groups';

/**
 * 补标签扫描（2026-11-05）：给没有标签（或标签未满 2 个）的站自动补标签。
 * 两层来源，先规则后 AI（AI 由调用方负责，见 services/siteAi 的补标签提示词）：
 * - 规则只补 VPN：① 种子库里同域名站标了 needVpn；② 域名命中境外需翻墙清单
 *   （保守清单：Google/YouTube/X/Facebook/Instagram/OpenAI/Claude/Discord/
 *   Telegram/Reddit/Pinterest/Medium/WhatsApp 等国内无法直接访问的服务）。
 *   APP/MARK 没有可靠规则，不由规则补：APP 由 AI 按“主推 App 下载”判断，
 *   MARK 是用户个人的重点标记，AI 也不建议、只留给用户手动打。
 * - 已有 2 个标签的站不再补（跳过并计数）；已有 1 个的只补 1 个缺位。
 * - 扫描只产出建议，写回前必须经面板逐项确认（调用方负责）。
 */

/** 境外需翻墙服务域名后缀（保守清单；匹配 host 本身或其子域） */
export const VPN_HOST_SUFFIXES = [
  'google.com',
  'googleapis.com',
  'youtube.com',
  'youtu.be',
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'openai.com',
  'chatgpt.com',
  'claude.ai',
  'anthropic.com',
  'discord.com',
  'discordapp.com',
  'telegram.org',
  't.me',
  'reddit.com',
  'pinterest.com',
  'medium.com',
  'whatsapp.com',
];

export function hostNeedsVpn(url: string): boolean {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return VPN_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

/** 种子库里同域名站是否标了 needVpn（种子是人工整理的现成知识，优先采用） */
export function seedNeedsVpn(url: string, seed: NavGroup[] = navGroups): boolean {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return seed
    .flatMap((g) => g.sites)
    .some((s) => {
      try {
        return new URL(s.url).hostname.toLowerCase() === host && !!s.needVpn;
      } catch {
        return false;
      }
    });
}

/** 规则层建议：只可能返回 ['VPN']；不命中返回 [] */
export function suggestRuleTags(site: SiteEntry, seed: NavGroup[] = navGroups): string[] {
  if (site.needVpn) return ['VPN'];
  if (seedNeedsVpn(site.url, seed)) return ['VPN'];
  if (hostNeedsVpn(site.url)) return ['VPN'];
  return [];
}

export interface TagFillHit {
  groupId: string;
  groupName: string;
  siteId: string;
  siteName: string;
  /** 本站已有的标签 */
  existing: string[];
  /** 建议新增的标签（已去掉已有项、已按上限截断） */
  tags: string[];
  /** 建议来源：rule = 规则命中（VPN），ai = AI 建议 */
  source: 'rule' | 'ai';
}

export interface TagFillScan {
  /** 规则层命中（待面板确认） */
  hits: TagFillHit[];
  /** 进入候选的站数（标签未满 2 个） */
  scanned: number;
  /** 已有 2 个标签、跳过的站数 */
  alreadyFull: number;
  /** 候选里规则没给出建议的站（可交给 AI 再判） */
  noSuggestion: TagFillHit[];
}

/** 规则层扫描：纯本地计算，不发任何请求 */
export function scanTagFill(groups: NavGroup[], seed: NavGroup[] = navGroups): TagFillScan {
  const hits: TagFillHit[] = [];
  const noSuggestion: TagFillHit[] = [];
  let scanned = 0;
  let alreadyFull = 0;
  for (const g of groups) {
    for (const s of g.sites) {
      if (!s.id) continue;
      const existing = siteTags(s);
      if (existing.length >= SITE_TAGS_MAX_COUNT) {
        alreadyFull++;
        continue;
      }
      scanned++;
      const room = SITE_TAGS_MAX_COUNT - existing.length;
      const fresh = suggestRuleTags(s, seed).filter((t) => !existing.includes(t)).slice(0, room);
      const base = { groupId: g.id, groupName: g.name, siteId: s.id, siteName: s.name, existing };
      if (fresh.length > 0) hits.push({ ...base, tags: fresh, source: 'rule' });
      else noSuggestion.push({ ...base, tags: [], source: 'rule' });
    }
  }
  return { hits, scanned, alreadyFull, noSuggestion };
}

/** 合并建议与已有标签：去重、清洗、上限 2 个（写回前调用方用 cleanSiteTags 再守一道） */
export function mergeTagSuggestion(existing: string[], suggested: string[]): string[] {
  return cleanSiteTags([...existing, ...suggested]);
}
