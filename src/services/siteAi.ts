/**
 * 主页 AI 整理（2026-10-30）：一键分类 / 一键搜集网站。
 *
 * 调用方式沿用计划 AI（planAiConfig.ts）那套，不新选服务：
 * - 提供商三档 DeepSeek / OpenAI / 自定义（自填地址与模型），走 chat completions；
 * - 口令只存本机 localStorage（zabox-site-ai-config），绝不进 store、不参与 GitHub 同步、不进仓库；
 * - 网站版传输：先浏览器直连服务商（口令只到服务商），直连失败（跨域/网络）时
 *   兜底走自家 /api 中转（api/index.js 与 server/index.js 的 ai-chat 动作，仅转发、不存不记）。
 * 分类与搜集只产出「方案」，面板里用户逐项确认后才调用 store 落盘，绝不静默改分组与站点。
 */

import { API_BASE } from './apiBase';
import { clampGroupName, type NavGroup } from '../data/groups';

export type SiteAiProvider = 'deepseek' | 'openai' | 'custom';

export interface SiteAiConfig {
  provider: SiteAiProvider;
  baseUrl: string;
  model: string;
  key: string;
}

const CONFIG_KEY = 'zabox-site-ai-config';

export const SITE_AI_PROVIDER_DEFAULTS: Record<
  Exclude<SiteAiProvider, 'custom'>,
  { baseUrl: string; model: string }
> = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
};

export function loadSiteAiConfig(): SiteAiConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SiteAiConfig>;
      if (parsed && typeof parsed === 'object') {
        const provider: SiteAiProvider =
          parsed.provider === 'openai' || parsed.provider === 'custom' ? parsed.provider : 'deepseek';
        return {
          provider,
          baseUrl:
            typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim()
              ? parsed.baseUrl.trim()
              : provider === 'custom'
                ? ''
                : SITE_AI_PROVIDER_DEFAULTS[provider].baseUrl,
          model:
            typeof parsed.model === 'string' && parsed.model.trim()
              ? parsed.model.trim()
              : provider === 'custom'
                ? ''
                : SITE_AI_PROVIDER_DEFAULTS[provider].model,
          key: typeof parsed.key === 'string' ? parsed.key : '',
        };
      }
    }
  } catch {
    /* 忽略，走默认 */
  }
  return {
    provider: 'deepseek',
    baseUrl: SITE_AI_PROVIDER_DEFAULTS.deepseek.baseUrl,
    model: SITE_AI_PROVIDER_DEFAULTS.deepseek.model,
    key: '',
  };
}

export function saveSiteAiConfig(cfg: SiteAiConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  } catch {
    /* 忽略 */
  }
}

export function siteAiConfigured(cfg: SiteAiConfig): boolean {
  return cfg.key.trim().length > 0 && cfg.baseUrl.trim().length > 0 && cfg.model.trim().length > 0;
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

function providerErrorText(status: number, text: string): string {
  return `服务商返回 ${status}${text ? `：${text.slice(0, 120)}` : ''}，请检查设置里的地址、模型与口令`;
}

/** 调一次 chat completions：直连优先，网络/跨域失败时走自家 /api 中转。HTTP 层面的服务商报错不兜底（换路也一样）。 */
export async function callSiteAi(
  cfg: SiteAiConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const payload = {
    model: cfg.model.trim(),
    temperature: 0.2,
    max_tokens: 3000,
    messages,
  };
  // 直连：15 秒无响应也转中转（直连请求本身不取消，后台挂着无害）
  const direct = (async () => {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.key}`,
      },
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(providerErrorText(res.status, t));
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('服务商没有返回可用内容');
    return content;
  })();
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('direct-timeout')), 15000);
  });
  try {
    return await Promise.race([direct, timeout]);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e; // 用户取消，不兜底
    if (e instanceof Error && e.message.startsWith('服务商返回')) throw e;
    if (e instanceof Error && e.message === '服务商没有返回可用内容') throw e;
    // 直连网络/跨域/超时失败 → 自家 /api 中转（仅转发，服务端不存不记）
    direct.catch(() => {});
    const res = await fetch(`${API_BASE}/api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'ai-chat',
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        key: cfg.key,
        messages,
      }),
      signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`中转请求失败（${res.status}）${t ? `：${t.slice(0, 80)}` : ''}`);
    }
    const json = (await res.json()) as { success?: boolean; content?: string; error?: string };
    if (!json.success || typeof json.content !== 'string' || !json.content.trim()) {
      throw new Error(json.error || '中转没有返回可用内容');
    }
    return json.content;
  }
}

/** 从模型输出里抠 JSON（裸 JSON / ```json围栏 / 前后带废话都容忍） */
export function extractJson(text: string): unknown {
  const clean = text.replace(/```json/gi, '```').replace(/```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    /* fallthrough */
  }
  const objStart = clean.indexOf('{');
  const objEnd = clean.lastIndexOf('}');
  const arrStart = clean.indexOf('[');
  const arrEnd = clean.lastIndexOf(']');
  const objOk = objStart >= 0 && objEnd > objStart;
  const arrOk = arrStart >= 0 && arrEnd > arrStart;
  if (objOk && (!arrOk || objStart < arrStart)) return JSON.parse(clean.slice(objStart, objEnd + 1));
  if (arrOk) return JSON.parse(clean.slice(arrStart, arrEnd + 1));
  throw new Error('AI 返回的不是合法 JSON，换句话再试一次');
}

/* ---------------- 一键分类 ---------------- */

const CATEGORIZE_SYSTEM = `你是杂盒网站整理助手。用户会给一句话意图和现有编组与站点清单。你只输出一个 JSON 对象，不要解释、不要 markdown。格式：{"newGroups":[{"name":"新组名"}],"moves":[{"siteId":"站点的 id","target":"目标组 id，或 new:新组名"}]}。规则：只移动与用户意图相关的站点，不相关的站点一个都不动、不列出；target 只能是清单里已有的组 id，或 new:新组名（新组名不超过 8 个字）；不要编造站点 id、组 id、站点名；不要删除任何组或站点；如果意图与现有分组无关或无法判断，返回空 moves（newGroups 也为空），不要硬凑。`;

function compactSiteList(groups: NavGroup[]): { text: string; truncated: boolean } {
  const withDesc = groups
    .map((g) => {
      const sites = g.sites
        .map((s) => `${s.name}（id:${s.id}）${s.url}${s.description ? ` — ${s.description.slice(0, 30)}` : ''}`)
        .join('；');
      return `组 ${g.name}（id:${g.id}，${g.display === 'stack' ? '文件夹式' : '详细列表'}）：${sites || '（空组）'}`;
    })
    .join('\n');
  if (withDesc.length <= 20000) return { text: withDesc, truncated: false };
  const noDesc = groups
    .map((g) => {
      const sites = g.sites.map((s) => `${s.name}（id:${s.id}）${s.url}`).join('；');
      return `组 ${g.name}（id:${g.id}）：${sites || '（空组）'}`;
    })
    .join('\n');
  if (noDesc.length <= 20000) return { text: noDesc, truncated: false };
  return { text: `${noDesc.slice(0, 20000)}\n（站点太多，清单已截断，未列出的站点不会被移动）`, truncated: true };
}

export function buildCategorizeMessages(
  intent: string,
  groups: NavGroup[],
): { messages: ChatMessage[]; truncated: boolean } {
  const { text, truncated } = compactSiteList(groups);
  return {
    messages: [
      { role: 'system', content: CATEGORIZE_SYSTEM },
      { role: 'user', content: `用户意图：${intent}\n\n现有编组与站点：\n${text}` },
    ],
    truncated,
  };
}

export interface ResolvedMove {
  siteId: string;
  siteName: string;
  fromGroupId: string;
  fromGroupName: string;
  /** 现有组 id，或 new:<序号>（新组） */
  targetKey: string;
  isNew: boolean;
}

export interface ResolvedCategorizePlan {
  /** 序号 → 新组名（面板里可改名） */
  newGroups: { key: string; name: string }[];
  moves: ResolvedMove[];
  dropped: number;
  totalSites: number;
}

function normalizeUrl(u: string): string {
  return u.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
}

export function resolveCategorizePlan(raw: unknown, groups: NavGroup[]): ResolvedCategorizePlan {
  const totalSites = groups.reduce((n, g) => n + g.sites.length, 0);
  const empty: ResolvedCategorizePlan = { newGroups: [], moves: [], dropped: 0, totalSites };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const obj = raw as { newGroups?: unknown; moves?: unknown };
  const siteById = new Map<string, { siteName: string; groupId: string; groupName: string }>();
  for (const g of groups) {
    for (const s of g.sites) {
      if (s.id) siteById.set(s.id, { siteName: s.name, groupId: g.id, groupName: g.name });
    }
  }
  const groupById = new Map(groups.map((g) => [g.id, g.name]));
  // 新组：按名去重，序号作 key（改名不影响 moves 指向）
  const newGroups: { key: string; name: string }[] = [];
  const newByName = new Map<string, string>();
  if (Array.isArray(obj.newGroups)) {
    for (const entry of obj.newGroups) {
      const name = clampGroupName(typeof entry === 'object' && entry !== null ? String((entry as { name?: unknown }).name ?? '') : '');
      if (!name || newByName.has(name)) continue;
      const key = `new:${newGroups.length}`;
      newGroups.push({ key, name });
      newByName.set(name, key);
    }
  }
  let dropped = 0;
  const moves: ResolvedMove[] = [];
  const seen = new Set<string>();
  if (Array.isArray(obj.moves)) {
    for (const entry of obj.moves) {
      if (!entry || typeof entry !== 'object') {
        dropped++;
        continue;
      }
      const { siteId, target } = entry as { siteId?: unknown; target?: unknown };
      if (typeof siteId !== 'string' || typeof target !== 'string') {
        dropped++;
        continue;
      }
      const found = siteById.get(siteId);
      if (!found || seen.has(siteId)) {
        dropped++;
        continue;
      }
      seen.add(siteId);
      if (groupById.has(target)) {
        if (target === found.groupId) continue; // 本来就在该组，不算移动
        moves.push({
          siteId,
          siteName: found.siteName,
          fromGroupId: found.groupId,
          fromGroupName: found.groupName,
          targetKey: target,
          isNew: false,
        });
      } else if (target.startsWith('new:')) {
        const key = newByName.get(clampGroupName(target.slice(4)));
        if (!key) {
          dropped++;
          continue;
        }
        moves.push({
          siteId,
          siteName: found.siteName,
          fromGroupId: found.groupId,
          fromGroupName: found.groupName,
          targetKey: key,
          isNew: true,
        });
      } else {
        dropped++;
      }
    }
  }
  return { newGroups, moves, dropped, totalSites };
}

/* ---------------- 拉取模型列表（2026-10-30 补充：设置里的「获取模型」按钮） ---------------- */

/** 服务商 HTTP 报错（401/404 等）：直连报这个错就不再走中转（换路也一样），与网络/跨域失败区分 */
class SiteAiHttpError extends Error {}

function modelHttpMessage(status: number, text: string): string {
  if (status === 401) return '口令不对（服务商返回 401），请检查口令';
  if (status === 404)
    return '该地址没有 /models 接口（可能不是 OpenAI 兼容接口），请手动填模型名';
  return `服务商返回 ${status}${text ? `：${text.slice(0, 120)}` : ''}`;
}

function parseModelList(json: unknown): string[] {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) throw new Error('服务商返回的模型列表格式不对');
  const ids = data
    .map((d) => (d as { id?: unknown })?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) throw new Error('服务商返回了空模型列表');
  return [...new Set(ids)].sort();
}

/**
 * 拉取可用模型列表：GET {baseUrl}/models（Bearer 口令）。
 * 直连优先，网络/跨域失败时走自家 /api 中转（ai-models 动作，仅转发）。
 * 失败原因明说，绝不静默：调用前调用方须先确认地址与口令已填。
 */
export async function fetchSiteAiModels(cfg: SiteAiConfig, signal?: AbortSignal): Promise<string[]> {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${cfg.key}` },
      signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new SiteAiHttpError(modelHttpMessage(res.status, t));
    }
    return parseModelList(await res.json());
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    if (e instanceof SiteAiHttpError) throw e;
    // 直连网络/跨域失败 → 自家 /api 中转（仅转发，服务端不存不记）
    const res = await fetch(`${API_BASE}/api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ai-models', baseUrl: cfg.baseUrl, key: cfg.key }),
      signal,
    });
    if (!res.ok) {
      throw new Error(`中转请求失败（${res.status}）`);
    }
    const json = (await res.json()) as { success?: boolean; models?: unknown; error?: string };
    if (!json.success) throw new Error(json.error || '中转没有返回模型列表');
    if (!Array.isArray(json.models)) throw new Error('中转返回的模型列表格式不对');
    const ids = json.models.filter((m): m is string => typeof m === 'string' && m.length > 0);
    if (ids.length === 0) throw new Error('中转返回了空模型列表');
    return [...new Set(ids)].sort();
  }
}

/* ---------------- 一键搜集 ---------------- */

const COLLECT_SYSTEM = `你是杂盒网站搜集助手。用户一句话说想要哪类网站，你返回真实存在的知名网站，不要编造。只输出一个 JSON 对象，不要解释、不要 markdown。格式：{"groupName":"建议的新组名（不超过 8 个字）","candidates":[{"name":"网站名","url":"https://…","description":"一句话介绍"}]}。规则：8–12 个候选；只要你有把握真实存在的网站，不确定的宁可少给；url 必须是完整 https 链接；不要返回用户没要的类别。`;

export function buildCollectMessages(intent: string): ChatMessage[] {
  return [
    { role: 'system', content: COLLECT_SYSTEM },
    { role: 'user', content: `用户想要：${intent}` },
  ];
}

export interface CollectCandidate {
  name: string;
  url: string;
  description: string;
}

export interface ResolvedCollect {
  groupName: string;
  candidates: CollectCandidate[];
  skippedExisting: string[];
  skippedInvalid: number;
}

export function resolveCollectCandidates(raw: unknown, groups: NavGroup[]): ResolvedCollect {
  const empty: ResolvedCollect = { groupName: '新编组', candidates: [], skippedExisting: [], skippedInvalid: 0 };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const obj = raw as { groupName?: unknown; candidates?: unknown };
  const groupName = clampGroupName(typeof obj.groupName === 'string' ? obj.groupName : '') || '新编组';
  const existing = new Set<string>();
  for (const g of groups) for (const s of g.sites) existing.add(normalizeUrl(s.url));
  const seen = new Set<string>();
  const candidates: CollectCandidate[] = [];
  const skippedExisting: string[] = [];
  let skippedInvalid = 0;
  if (Array.isArray(obj.candidates)) {
    for (const entry of obj.candidates.slice(0, 20)) {
      if (!entry || typeof entry !== 'object') {
        skippedInvalid++;
        continue;
      }
      const { name, url, description } = entry as { name?: unknown; url?: unknown; description?: unknown };
      if (typeof name !== 'string' || !name.trim() || typeof url !== 'string') {
        skippedInvalid++;
        continue;
      }
      let parsed: URL;
      try {
        parsed = new URL(url.trim());
      } catch {
        skippedInvalid++;
        continue;
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        skippedInvalid++;
        continue;
      }
      const key = normalizeUrl(url.trim());
      if (existing.has(key) || seen.has(key)) {
        skippedExisting.push(name.trim());
        continue;
      }
      seen.add(key);
      candidates.push({
        name: name.trim(),
        url: url.trim(),
        description: typeof description === 'string' ? description.slice(0, 60) : '',
      });
    }
  }
  return { groupName, candidates: candidates.slice(0, 12), skippedExisting, skippedInvalid };
}
