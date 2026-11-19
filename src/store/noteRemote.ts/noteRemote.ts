/**
 * 待办笔记附件的远端存储（2026-11-20 用户定：换设备同步附件）。
 * - 附件本体存在用户自己的同步仓库（与 ainav-data.json 同一个私仓，attachments/ 目录下），
 *   笔记消息里只记 remotePath + remoteSha；打开时直接从远端读，**不在本机再存一份（不要缓存）**——
 *   内存里的 object URL 随组件卸载回收，IndexedDB 不落盘。
 * - 未登录同步时不走这里，附件仍按老口径存本机 IndexedDB（见 noteImageDb.ts）。
 * - 分 provider 限额（2026-11-20 用户定）：GitHub 单文件 100 MB、总量 4 GB；
 *   Gitee 单文件 50 MB、总量 400 MB（Gitee 单文件硬上限 50 MB、单仓库 500 MB，留 100 MB 给数据和 Git 历史）。
 * - 删笔记即删数据：调用方删消息时一并调 deleteNoteRemoteFile 删仓库里的文件；
 *   注意 Git 只删当前版本，历史记录里还留着文件内容，彻底清掉要做历史瘦身。
 */

import {
  githubConfigComplete,
  loadGithubSyncMeta,
} from './githubSync';
import {
  giteeConfigComplete,
  isGiteeTokenExpired,
  loadGiteeSyncMeta,
  loadSyncProvider,
  refreshGiteeOAuthToken,
  saveGiteeSyncMeta,
  type SyncProvider,
} from './giteeSync';

/** 分 provider 的附件限额（MB） */
export const NOTE_LIMITS: Record<SyncProvider, { singleMB: number; totalMB: number }> = {
  github: { singleMB: 100, totalMB: 4096 },
  gitee: { singleMB: 50, totalMB: 400 },
};

export function noteLimitsFor(provider: SyncProvider): { singleMB: number; totalMB: number } {
  return NOTE_LIMITS[provider];
}

/** 文件管理器里显示的总量上限文案（GitHub 4 GB、Gitee 400 MB） */
export function noteTotalLimitLabel(provider: SyncProvider): string {
  const totalMB = NOTE_LIMITS[provider].totalMB;
  return totalMB >= 1024 ? `${totalMB / 1024} GB` : `${totalMB} MB`;
}

export interface NoteRemoteSync {
  provider: SyncProvider;
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

/** 当前生效的同步连接（登录了且配置完整才算）；未登录返回 null，调用方走本机存储 */
export function getActiveNoteSync(): NoteRemoteSync | null {
  const provider = loadSyncProvider();
  if (provider === 'gitee') {
    const m = loadGiteeSyncMeta();
    if (!m.enabled || !giteeConfigComplete(m)) return null;
    return { provider, owner: m.owner, repo: m.repo, branch: m.branch, token: m.token };
  }
  const m = loadGithubSyncMeta();
  if (!m.enabled || !githubConfigComplete(m)) return null;
  return { provider, owner: m.owner, repo: m.repo, branch: m.branch, token: m.token };
}

/** 附件在仓库里的路径：attachments/<imageId><扩展名>（扩展名只为远端按类型识别内容） */
export function noteRemotePath(imageId: string, fileName?: string): string {
  const m = fileName?.match(/\.([A-Za-z0-9]{1,10})$/);
  const ext = m ? `.${m[1].toLowerCase()}` : '';
  return `attachments/${imageId}${ext}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  });
}

/* ---- GitHub Contents API（附件走二进制 base64，ghPutFile 只做 UTF-8 文本，不能复用） ---- */
const GH_API = 'https://api.github.com';
const GE_API = 'https://gitee.com/api/v5';

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function ghContentsUrl(sync: NoteRemoteSync, path: string): string {
  const encoded = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `${GH_API}/repos/${encodeURIComponent(sync.owner)}/${encodeURIComponent(sync.repo)}/contents/${encoded}`;
}

function geContentsUrl(sync: NoteRemoteSync, path: string): string {
  const encoded = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `${GE_API}/repos/${encodeURIComponent(sync.owner)}/${encodeURIComponent(sync.repo)}/contents/${encoded}`;
}

function geWithToken(url: string, token: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}access_token=${encodeURIComponent(token)}`;
}

/** Gitee 令牌过期时先静默刷新一次（与 DataMenu 的 refreshGeToken 同款）；返回刷新后的连接或 null */
async function refreshGeSync(sync: NoteRemoteSync): Promise<NoteRemoteSync | null> {
  const m = loadGiteeSyncMeta();
  if (m.authMode !== 'oauth' || !m.refreshToken) return null;
  const refreshed = await refreshGiteeOAuthToken(m.refreshToken);
  if ('error' in refreshed) return null;
  saveGiteeSyncMeta({
    ...m,
    token: refreshed.token,
    refreshToken: refreshed.refreshToken || m.refreshToken,
    tokenExpiresAt: refreshed.expiresIn > 0 ? Date.now() + refreshed.expiresIn * 1000 : 0,
  });
  const fresh = loadGiteeSyncMeta();
  if (!giteeConfigComplete(fresh)) return null;
  return { provider: 'gitee', owner: fresh.owner, repo: fresh.repo, branch: fresh.branch, token: fresh.token };
}

/** Gitee 请求前先看过期时间戳、过期就刷新（DataMenu 拉推前同款）；返回可用连接 */
async function geFreshSync(sync: NoteRemoteSync): Promise<NoteRemoteSync | null> {
  const m = loadGiteeSyncMeta();
  if (!giteeConfigComplete(m)) return null;
  if (m.authMode === 'oauth' && isGiteeTokenExpired(m)) {
    return refreshGeSync(sync);
  }
  return sync;
}

function isUnauthorizedMessage(message: string): boolean {
  return message.includes('（401）');
}

function ghHttpError(status: number): string {
  if (status === 401) return '登录状态无效或已过期，请重新登录（401）';
  if (status === 403) return 'GitHub 拒绝访问：权限不足或触发限流（403）';
  return `GitHub 请求失败（${status}）`;
}

function geHttpError(status: number): string {
  if (status === 401) return '登录状态无效或已过期，请重新登录（401）';
  if (status === 403) return 'Gitee 拒绝访问：权限不足或触发限流（403）';
  return `Gitee 请求失败（${status}）`;
}

type PutResult = { kind: 'ok'; sha: string } | { kind: 'error'; message: string };

async function ghPutBinary(sync: NoteRemoteSync, path: string, b64: string): Promise<PutResult> {
  let res: Response;
  try {
    res = await fetch(ghContentsUrl(sync, path), {
      method: 'PUT',
      headers: { ...ghHeaders(sync.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'sync: upload note file', content: b64, branch: sync.branch }),
    });
  } catch {
    return { kind: 'error', message: '网络错误，无法连接 GitHub' };
  }
  if (!res.ok) return { kind: 'error', message: ghHttpError(res.status) };
  try {
    const body = (await res.json()) as { content?: { sha?: string } };
    const sha = body.content?.sha;
    if (typeof sha !== 'string') return { kind: 'error', message: 'GitHub 未返回新文件 sha' };
    return { kind: 'ok', sha };
  } catch {
    return { kind: 'error', message: 'GitHub 返回格式异常' };
  }
}

async function gePutBinary(sync: NoteRemoteSync, path: string, b64: string): Promise<PutResult> {
  let res: Response;
  try {
    res = await fetch(geWithToken(geContentsUrl(sync, path), sync.token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: sync.token,
        message: 'sync: upload note file',
        content: b64,
        branch: sync.branch,
      }),
    });
  } catch {
    return { kind: 'error', message: '网络错误，无法连接 Gitee' };
  }
  if (!res.ok) return { kind: 'error', message: geHttpError(res.status) };
  try {
    const body = (await res.json()) as { content?: { sha?: string }; sha?: string };
    const sha = typeof body.content?.sha === 'string' ? body.content.sha : body.sha;
    if (typeof sha !== 'string') return { kind: 'error', message: 'Gitee 未返回新文件 sha' };
    return { kind: 'ok', sha };
  } catch {
    return { kind: 'error', message: 'Gitee 返回格式异常' };
  }
}

/** 上传一个附件到同步仓库；成功返回路径与 sha，失败返回 null（调用方不落库、不弹错，只提示传不上去） */
export async function uploadNoteFile(
  file: File,
  imageId: string,
): Promise<{ remotePath: string; sha: string } | null> {
  const sync = getActiveNoteSync();
  if (!sync) return null;
  const remotePath = noteRemotePath(imageId, file.name);
  let b64: string;
  try {
    b64 = await blobToBase64(file);
  } catch {
    return null;
  }
  if (sync.provider === 'github') {
    const res = await ghPutBinary(sync, remotePath, b64);
    return res.kind === 'ok' ? { remotePath, sha: res.sha } : null;
  }
  const fresh = await geFreshSync(sync);
  if (!fresh) return null;
  let res = await gePutBinary(fresh, remotePath, b64);
  if (res.kind === 'error' && isUnauthorizedMessage(res.message)) {
    const retry = await refreshGeSync(sync);
    if (retry) res = await gePutBinary(retry, remotePath, b64);
  }
  return res.kind === 'ok' ? { remotePath, sha: res.sha } : null;
}

/** 取仓库里一个文件的 sha（删文件时 GitHub/Gitee 都要带上）；取不到返回 null */
async function remoteFileSha(sync: NoteRemoteSync, remotePath: string): Promise<string | null> {
  try {
    const res =
      sync.provider === 'github'
        ? await fetch(`${ghContentsUrl(sync, remotePath)}?ref=${encodeURIComponent(sync.branch)}`, {
            headers: ghHeaders(sync.token),
          })
        : await fetch(
            geWithToken(`${geContentsUrl(sync, remotePath)}?ref=${encodeURIComponent(sync.branch)}`, sync.token),
          );
    if (!res.ok) return null;
    const body = (await res.json()) as { sha?: unknown };
    return typeof body.sha === 'string' ? body.sha : null;
  } catch {
    return null;
  }
}

/** 从同步仓库删一个附件文件；sha 不传时先取一次。删不掉返回 false（调用方不阻塞、不弹错） */
export async function deleteNoteRemoteFile(remotePath: string, sha?: string | null): Promise<boolean> {
  const sync = getActiveNoteSync();
  if (!sync) return false;
  const run = async (s: NoteRemoteSync): Promise<boolean> => {
    const fileSha = sha ?? (await remoteFileSha(s, remotePath));
    if (!fileSha) return false;
    try {
      const res =
        s.provider === 'github'
          ? await fetch(ghContentsUrl(s, remotePath), {
              method: 'DELETE',
              headers: { ...ghHeaders(s.token), 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: 'sync: delete note file', sha: fileSha, branch: s.branch }),
            })
          : await fetch(geWithToken(geContentsUrl(s, remotePath), s.token), {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                access_token: s.token,
                message: 'sync: delete note file',
                sha: fileSha,
                branch: s.branch,
              }),
            });
      return res.ok;
    } catch {
      return false;
    }
  };
  if (sync.provider === 'github') return run(sync);
  const fresh = await geFreshSync(sync);
  if (!fresh) return false;
  if (await run(fresh)) return true;
  const retry = await refreshGeSync(sync);
  return retry ? run(retry) : false;
}

/** 从同步仓库直接读一个附件的 Blob（不写 IndexedDB、不缓存，调用方转内存 URL、用完回收） */
export async function fetchNoteRemoteBlob(remotePath: string): Promise<Blob | null> {
  const sync = getActiveNoteSync();
  if (!sync) return null;
  const run = async (s: NoteRemoteSync): Promise<Blob | null> => {
    try {
      const res =
        s.provider === 'github'
          ? await fetch(`${ghContentsUrl(s, remotePath)}?ref=${encodeURIComponent(s.branch)}`, {
              headers: { ...ghHeaders(s.token), Accept: 'application/vnd.github.raw' },
            })
          : await fetch(
              geWithToken(
                `${GE_API}/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/raw/${encodeURIComponent(s.branch)}/${remotePath
                  .split('/')
                  .filter(Boolean)
                  .map(encodeURIComponent)
                  .join('/')}`,
                s.token,
              ),
            );
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  };
  if (sync.provider === 'github') return run(sync);
  const fresh = await geFreshSync(sync);
  if (!fresh) return null;
  const blob = await run(fresh);
  if (blob) return blob;
  const retry = await refreshGeSync(sync);
  return retry ? run(retry) : null;
}
