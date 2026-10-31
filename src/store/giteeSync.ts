/**
 * Gitee 同步（与 GitHub 同步镜像的第二条云同步线，用户 2026-10-31 定）：
 * 把完整数据 JSON 同步到用户自己的 Gitee 私有仓库文件，与 GitHub 线同一份数据、同名文件。
 * - 前端直连 gitee.com/api/v5（Contents API），不经过任何中间服务器；
 * - 登录凭证只存浏览器本地 localStorage 的独立 key（ainav-gitee-sync-v1），
 *   **绝不写入同步的 JSON 内容、也绝不进导出 JSON**（同步内容就是 store.data 本身）；
 * - 与 GitHub 线的关键差别：Gitee OAuth 的 access_token 一天过期（expires_in=86400），
 *   换令牌与刷新令牌都要带 client_secret，只能经服务端 /api/gitee-oauth 做；
 *   前端存 access_token + refresh_token + 过期时间戳，撞 401 先静默刷新、刷新失败才重登；
 * - 同步目标固定为登录账号下的私有仓库 ainav-data；分支取仓库的 default_branch
 *   （Gitee 新仓默认 master，与 GitHub 线的 main 不同，写死 main 会 404）；
 * - 冲突裁决与 GitHub 线一致：靠数据里的 updatedAt，见 DataMenu。
 */

import { API_BASE as SITE_API_BASE, IS_EXTENSION_BUILD } from '../services/apiBase';
import { b64DecodeUtf8, b64EncodeUtf8, updatedAtOf } from './githubSync';
import { unpackDataEnvelope } from './widgetStorage';

export type SyncProvider = 'github' | 'gitee';

/* ---- 当前生效的同步方式：同一时间只一条在跑，另一条的自动拉推全部停掉 ---- */
const PROVIDER_KEY = 'ainav-sync-provider-v1';

export function loadSyncProvider(): SyncProvider {
  try {
    return localStorage.getItem(PROVIDER_KEY) === 'gitee' ? 'gitee' : 'github';
  } catch {
    return 'github';
  }
}

export function saveSyncProvider(p: SyncProvider): void {
  try {
    localStorage.setItem(PROVIDER_KEY, p);
  } catch {
    // 静默失败，不阻断使用
  }
}

export interface GiteeSyncConfig {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  token: string;
}

export interface GiteeSyncMeta extends GiteeSyncConfig {
  enabled: boolean;
  /** 云端文件当前的 sha（最后一次拉取/推送后确认的值）；null = 尚不知道/云端无此文件 */
  lastSha: string | null;
  /** 本地与云端最后一次达成一致时的数据 updatedAt；本地 updatedAt 大于它 = 有待推送变更 */
  baseUpdatedAt: number;
  lastSyncedAt: number | null;
  /** 凭证来源：网站版只剩 'oauth'（Gitee 一键登录），'pat' 在网站版加载时按未登录处理；
   * 扩展构建走粘贴令牌，'pat' 为其正式凭证来源（与 GitHub 线 loadGithubSyncMeta 同款口径） */
  authMode: 'pat' | 'oauth';
  /** OAuth 登录的 Gitee 用户名（authMode='oauth' 时有值，仅本机展示用） */
  oauthLogin: string;
  /** OAuth 刷新令牌（authMode='oauth' 时有值，只存本机；PAT 方式为空） */
  refreshToken: string;
  /** access_token 过期时间戳（毫秒）；0 = 未知/不过期（PAT 方式） */
  tokenExpiresAt: number;
}

const META_KEY = 'ainav-gitee-sync-v1';

export const GITEE_OAUTH_REPO_NAME = 'ainav-data';
export const GITEE_OAUTH_FILE_PATH = 'ainav-data.json';
const OAUTH_STATE_KEY = 'ainav-gitee-oauth-state';
/** OAuth 回跳时用哪个 provider 处理：起登时写、回跳读到即清（与 GitHub 线的 state 键分开，避免串线） */
const OAUTH_PROVIDER_KEY = 'ainav-oauth-provider';

export const DEFAULT_GITEE_SYNC_META: GiteeSyncMeta = {
  enabled: false,
  owner: '',
  repo: '',
  branch: 'master',
  path: 'ainav-data.json',
  token: '',
  lastSha: null,
  baseUpdatedAt: 0,
  lastSyncedAt: null,
  authMode: 'oauth',
  oauthLogin: '',
  refreshToken: '',
  tokenExpiresAt: 0,
};

export function loadGiteeSyncMeta(): GiteeSyncMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<GiteeSyncMeta>;
      const str = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v : fallback);
      /* 与 GitHub 线同款口径：旧 PAT 配置在网站版一律按未登录处理（丢弃凭证、关同步），
       * 仅扩展构建接受 authMode='pat' 的本机配置。 */
      const isOauth = p.authMode === 'oauth';
      const isPat = IS_EXTENSION_BUILD && p.authMode === 'pat';
      const accepted = isOauth || isPat;
      return {
        enabled: accepted && p.enabled === true,
        owner: str(p.owner, ''),
        repo: str(p.repo, ''),
        branch: str(p.branch, 'master'),
        path: str(p.path, 'ainav-data.json'),
        token: accepted && typeof p.token === 'string' ? p.token : '',
        lastSha: typeof p.lastSha === 'string' ? p.lastSha : null,
        baseUpdatedAt: typeof p.baseUpdatedAt === 'number' ? p.baseUpdatedAt : 0,
        lastSyncedAt: typeof p.lastSyncedAt === 'number' ? p.lastSyncedAt : null,
        authMode: isPat ? 'pat' : 'oauth',
        oauthLogin: isOauth && typeof p.oauthLogin === 'string' ? p.oauthLogin : '',
        refreshToken: isOauth && typeof p.refreshToken === 'string' ? p.refreshToken : '',
        tokenExpiresAt: isOauth && typeof p.tokenExpiresAt === 'number' ? p.tokenExpiresAt : 0,
      };
    }
  } catch {
    // 损坏时回落默认
  }
  return { ...DEFAULT_GITEE_SYNC_META };
}

export function saveGiteeSyncMeta(meta: GiteeSyncMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // 静默失败，不阻断使用
  }
}

/** 配置是否完整（能发起同步的最低要求） */
export function giteeConfigComplete(m: GiteeSyncMeta): boolean {
  return Boolean(m.owner && m.repo && m.token);
}

/** access_token 是否已过期（留 60 秒余量；PAT 方式 tokenExpiresAt=0 视为不过期） */
export function isGiteeTokenExpired(m: GiteeSyncMeta): boolean {
  return m.tokenExpiresAt > 0 && Date.now() >= m.tokenExpiresAt - 60_000;
}

/* ---- Gitee OpenAPI v5 ----
 * 鉴权统一用 access_token 查询参数（v5 官方示例口径；写操作同时在请求体里带一份，
 * 与官方创建/更新文件示例一致）。内容一律 base64，与 GitHub 线相同。 */
const API_BASE = 'https://gitee.com/api/v5';

function withToken(url: string, token: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}access_token=${encodeURIComponent(token)}`;
}

function contentsUrl(cfg: GiteeSyncConfig): string {
  const encodedPath = cfg.path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `${API_BASE}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${encodedPath}`;
}

function httpErrorMessage(status: number): string {
  if (status === 401) return '登录状态无效或已过期，请重新登录（401）';
  if (status === 403) return 'Gitee 拒绝访问：权限不足或触发限流（403）';
  return `Gitee 请求失败（${status}）`;
}

export type GeGetResult =
  | {
      kind: 'ok';
      /** 主数据（信封已拆包，调用方拿到的永远是纯主数据） */
      data: unknown;
      text: string;
      sha: string;
      updatedAt: number;
      /** 信封里携带的组件独立数据（旧格式文件为 null，调用方据此决定是否恢复） */
      widgetStorage: Record<string, unknown> | null;
    }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

/** 拉取云端文件：区分「文件不存在（仓库在）」与各类错误 */
export async function geGetFile(cfg: GiteeSyncConfig): Promise<GeGetResult> {
  let res: Response;
  try {
    res = await fetch(withToken(`${contentsUrl(cfg)}?ref=${encodeURIComponent(cfg.branch)}`, cfg.token));
  } catch {
    return { kind: 'error', message: '网络错误，无法连接 Gitee' };
  }
  if (res.status === 404) {
    // 分不清是仓库不存在还是文件不存在：再查一次仓库本身
    try {
      const repoRes = await fetch(withToken(`${API_BASE}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`, cfg.token));
      if (repoRes.status === 404) return { kind: 'error', message: '仓库不存在或无权访问' };
      if (repoRes.status === 401) return { kind: 'error', message: httpErrorMessage(401) };
      if (!repoRes.ok) return { kind: 'error', message: httpErrorMessage(repoRes.status) };
    } catch {
      return { kind: 'error', message: '网络错误，无法连接 Gitee' };
    }
    return { kind: 'missing' };
  }
  if (!res.ok) return { kind: 'error', message: httpErrorMessage(res.status) };
  try {
    const body = (await res.json()) as { content?: string; sha?: string };
    if (typeof body.content !== 'string' || typeof body.sha !== 'string') {
      return { kind: 'error', message: 'Gitee 返回的文件格式异常（可能路径指向文件夹）' };
    }
    const text = b64DecodeUtf8(body.content);
    const parsed: unknown = JSON.parse(text);
    const { store, widgetStorage } = unpackDataEnvelope(parsed);
    return { kind: 'ok', data: store, text, sha: body.sha, updatedAt: updatedAtOf(parsed), widgetStorage };
  } catch {
    return { kind: 'error', message: '云端文件不是有效的 JSON 数据' };
  }
}

export type GePutResult = { kind: 'ok'; sha: string } | { kind: 'conflict' } | { kind: 'error'; message: string };

/** 写回云端文件：sha 为 null 表示新建；sha 与云端不一致时按冲突归类（409/422，与 GitHub 线同口径） */
export async function gePutFile(cfg: GiteeSyncConfig, text: string, sha: string | null): Promise<GePutResult> {
  let res: Response;
  try {
    res = await fetch(withToken(contentsUrl(cfg), cfg.token), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: cfg.token,
        message: 'sync: update ainav data',
        content: b64EncodeUtf8(text),
        branch: cfg.branch,
        ...(sha ? { sha } : {}),
      }),
    });
  } catch {
    return { kind: 'error', message: '网络错误，无法连接 Gitee' };
  }
  if (res.status === 409 || res.status === 422) return { kind: 'conflict' };
  if (!res.ok) return { kind: 'error', message: httpErrorMessage(res.status) };
  try {
    const body = (await res.json()) as { content?: { sha?: string }; commit?: { sha?: string } };
    const newSha = body.content?.sha;
    if (typeof newSha !== 'string') return { kind: 'error', message: 'Gitee 未返回新文件 sha' };
    return { kind: 'ok', sha: newSha };
  } catch {
    return { kind: 'error', message: 'Gitee 返回格式异常' };
  }
}

/* ---- Gitee OAuth 登录 ----
 * 流程与 GitHub 线相同：前端从 /api/gitee-oauth?config=1 拿公开 client_id → 跳 Gitee 授权页 →
 * 回跳站点根带 ?code&state → 前端把 code 交给 /api/gitee-oauth 换 access_token + refresh_token
 * （client_secret 只在服务端环境变量里，前端永远接触不到）。
 * 差别：Gitee 的 access_token 一天过期，服务端接口同时负责刷新（见 refreshGiteeOAuthToken）。
 * 回调地址必须与 Gitee 应用里注册的一字不差：站点根（含末尾斜杠）。 */

export function giteeRedirectUri(): string {
  return `${window.location.origin}/`;
}

/** 生成并暂存 OAuth state（防 CSRF），同时记下回跳归 Gitee 处理 */
export function beginGiteeOAuthState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    sessionStorage.setItem(OAUTH_STATE_KEY, state);
    sessionStorage.setItem(OAUTH_PROVIDER_KEY, 'gitee');
  } catch {
    // sessionStorage 不可用时回跳校验必然失败，会给出报错，不静默放行
  }
  return state;
}

/** 取出并清掉暂存的 state 与 provider 标记（一次性使用） */
export function consumeGiteeOAuthState(): string | null {
  try {
    const v = sessionStorage.getItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(OAUTH_PROVIDER_KEY);
    return v;
  } catch {
    return null;
  }
}

/** 本次回跳是不是走 Gitee 登录回来的（起登时写下的标记） */
export function isGiteeOAuthReturn(): boolean {
  try {
    return sessionStorage.getItem(OAUTH_PROVIDER_KEY) === 'gitee';
  } catch {
    return false;
  }
}

/** 拼 Gitee 授权 URL：scope 只取登录建仓读写必需的两项（user_info + projects），不多勾 */
export function buildGiteeOAuthAuthorizeUrl(clientId: string, state: string, redirectUri: string): string {
  return (
    `https://gitee.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code` +
    `&scope=${encodeURIComponent('user_info projects')}&state=${encodeURIComponent(state)}`
  );
}

/** 从服务端拿公开配置（client_id）；拿不到/未配置一律 null */
export async function fetchGiteeOAuthClientId(): Promise<string | null> {
  try {
    const res = await fetch(`${SITE_API_BASE}/api/gitee-oauth?config=1`);
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { clientId?: unknown } | null;
    return typeof body?.clientId === 'string' && body.clientId ? body.clientId : null;
  } catch {
    return null;
  }
}

export type GiteeTokenSet = { token: string; refreshToken: string; expiresIn: number };

/** 用授权 code 向服务端换 access_token + refresh_token（secret 在服务端） */
export async function exchangeGiteeOAuthCode(
  code: string,
  redirectUri: string,
): Promise<GiteeTokenSet | { error: string }> {
  let res: Response;
  try {
    res = await fetch(`${SITE_API_BASE}/api/gitee-oauth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: redirectUri }),
    });
  } catch {
    return { error: '网络错误，无法完成 Gitee 登录，请重试' };
  }
  const body = (await res.json().catch(() => null)) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    error?: unknown;
  } | null;
  if (res.ok && typeof body?.access_token === 'string' && body.access_token) {
    return {
      token: body.access_token,
      refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : '',
      expiresIn: typeof body.expires_in === 'number' ? body.expires_in : 0,
    };
  }
  if (body?.error === 'oauth_not_configured') {
    return { error: '服务端未配置 Gitee 登录' };
  }
  return { error: 'Gitee 登录失败：授权码已失效或被拒绝，请重新登录' };
}

/** 用 refresh_token 向服务端换新令牌（secret 在服务端；刷新令牌轮换时服务端回新值） */
export async function refreshGiteeOAuthToken(refreshToken: string): Promise<GiteeTokenSet | { error: string }> {
  let res: Response;
  try {
    res = await fetch(`${SITE_API_BASE}/api/gitee-oauth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    return { error: '网络错误，无法刷新 Gitee 登录' };
  }
  const body = (await res.json().catch(() => null)) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    error?: unknown;
  } | null;
  if (res.ok && typeof body?.access_token === 'string' && body.access_token) {
    return {
      token: body.access_token,
      refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : '',
      expiresIn: typeof body.expires_in === 'number' ? body.expires_in : 0,
    };
  }
  return { error: 'Gitee 登录已过期，请重新登录' };
}

/** 用 token 查登录账号名 */
export async function geGetUser(token: string): Promise<{ login: string } | { error: string }> {
  let res: Response;
  try {
    res = await fetch(withToken(`${API_BASE}/user`, token));
  } catch {
    return { error: '网络错误，无法连接 Gitee' };
  }
  if (!res.ok) return { error: httpErrorMessage(res.status) };
  const body = (await res.json().catch(() => null)) as { login?: unknown } | null;
  if (typeof body?.login !== 'string' || !body.login) {
    return { error: 'Gitee 未返回账号信息，请重新登录' };
  }
  return { login: body.login };
}

/**
 * 确保登录账号下有同步仓库 ainav-data：没有就创建为私有仓库（自动初始化，分支即默认分支）；
 * 已存在照常用，并以仓库的 default_branch 为同步分支。返回 { repo, branch } 或错误文案。
 */
export async function ensureGiteeRepo(
  token: string,
  login: string,
): Promise<{ repo: string; branch: string } | { error: string }> {
  let res: Response;
  try {
    res = await fetch(withToken(`${API_BASE}/repos/${encodeURIComponent(login)}/${GITEE_OAUTH_REPO_NAME}`, token));
  } catch {
    return { error: '网络错误，无法连接 Gitee' };
  }
  if (res.ok) {
    const body = (await res.json().catch(() => null)) as { default_branch?: unknown } | null;
    const branch = typeof body?.default_branch === 'string' && body.default_branch ? body.default_branch : 'master';
    return { repo: GITEE_OAUTH_REPO_NAME, branch };
  }
  if (res.status !== 404) return { error: httpErrorMessage(res.status) };
  // 仓库不存在 → 创建（私有、自动初始化，免得空仓写第一个文件失败）
  let createRes: Response;
  try {
    createRes = await fetch(withToken(`${API_BASE}/user/repos`, token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: token,
        name: GITEE_OAUTH_REPO_NAME,
        private: true,
        description: '杂盒的同步数据（自动创建，请勿公开）',
        auto_init: true,
      }),
    });
  } catch {
    return { error: '网络错误，创建同步仓库失败' };
  }
  if (createRes.ok) {
    const body = (await createRes.json().catch(() => null)) as { default_branch?: unknown } | null;
    const branch = typeof body?.default_branch === 'string' && body.default_branch ? body.default_branch : 'master';
    return { repo: GITEE_OAUTH_REPO_NAME, branch };
  }
  // 并发下可能刚被别处建好：再确认一次存在性
  try {
    const again = await fetch(withToken(`${API_BASE}/repos/${encodeURIComponent(login)}/${GITEE_OAUTH_REPO_NAME}`, token));
    if (again.ok) {
      const body = (await again.json().catch(() => null)) as { default_branch?: unknown } | null;
      const branch = typeof body?.default_branch === 'string' && body.default_branch ? body.default_branch : 'master';
      return { repo: GITEE_OAUTH_REPO_NAME, branch };
    }
  } catch {
    // 忽略，统一报创建失败
  }
  if (createRes.status === 401 || createRes.status === 403) {
    return { error: httpErrorMessage(createRes.status) };
  }
  return { error: `创建同步仓库失败（${createRes.status}），请稍后重试` };
}

/** 供调用方判断一条错误是不是 401（决定走刷新/重登还是直接报错） */
export function isGiteeUnauthorized(message: string): boolean {
  return message.includes('（401）');
}
