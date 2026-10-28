import React, { useEffect, useRef, useState } from 'react';
import { Database, Download, Upload, RotateCcw, Save, FolderOpen, RefreshCw, X, AlertTriangle, LogIn, LogOut, KeyRound } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { IS_EXTENSION_BUILD } from '../../services/apiBase';
import type { LocalStore } from '../../store/localStore';
import {
  beginOAuthState,
  buildOAuthAuthorizeUrl,
  consumeOAuthState,
  ensureOAuthRepo,
  exchangeOAuthCode,
  fetchOAuthClientId,
  ghGetFile,
  ghGetUser,
  ghPutFile,
  githubConfigComplete,
  loadGithubSyncMeta,
  OAUTH_BRANCH,
  OAUTH_FILE_PATH,
  saveGithubSyncMeta,
  type GithubSyncConfig,
  type GithubSyncMeta,
} from '../../store/githubSync';
import {
  clearPersistedHandle,
  formatSavedTime,
  fsAccessSupported,
  loadFileSaveMeta,
  loadPersistedHandle,
  persistHandle,
  pickDataFile,
  saveFileSaveMeta,
  writeToFile,
  type FileSaveMeta,
  type FsFileHandle,
} from '../../store/fileSave';
import { packDataEnvelope, restoreWidgetStorage, unpackDataEnvelope } from '../../store/widgetStorage';
import { reloadColorsData } from '../../store/colorsData';

/**
 * 「数据」入口：放在搜索区旁，不显眼。
 * 本地优先方案的数据自救通道：JSON 导出（下载）/ 导入（校验后恢复）/ 恢复默认，
 * 以及第十四轮的「保存到本地文件」：设置一次默认保存文件后，可点击保存或开自动保存
 * （数据一变化就自动写回该文件）；句柄存 IndexedDB，内容与导出 JSON 完全同一格式。
 */
export default function DataMenu({ store }: { store: LocalStore }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /* ---- 本地文件保存 ---- */
  const [supported] = useState(fsAccessSupported);
  const [handle, setHandle] = useState<FsFileHandle | null>(null);
  const [meta, setMeta] = useState<FileSaveMeta>(loadFileSaveMeta);
  const [saveStatus, setSaveStatus] = useState<{ kind: 'ok' | 'denied' | 'error' | 'saving'; text: string } | null>(null);

  // 订阅/写入时读最新值的 refs（避免 effect 依赖膨胀与闭包过期）
  const dataRef = useRef(store.data);
  dataRef.current = store.data;
  const handleRef = useRef<FsFileHandle | null>(null);
  handleRef.current = handle;
  const autoSaveRef = useRef(meta.autoSave);
  autoSaveRef.current = meta.autoSave;
  const writingRef = useRef(false);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmReset(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  // 挂载时取回上次设置的保存文件句柄（浏览器重启后句柄还在，但写权限可能需要重新授权，写时处理）
  useEffect(() => {
    let cancelled = false;
    void loadPersistedHandle().then((h) => {
      if (cancelled || !h) return;
      setHandle(h);
      setMeta((m) => (m.fileName === h.name ? m : { ...m, fileName: h.name }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 元信息落盘（开关/文件名/上次保存时间）
  useEffect(() => {
    saveFileSaveMeta(meta);
  }, [meta]);

  /** 序列化写出（本地文件/导出/同步共用）：有组件独立数据时包信封带走（widgetStorage 登记制） */
  const serializeData = () => JSON.stringify(packDataEnvelope(dataRef.current), null, 2);

  const doWrite = async (h: FsFileHandle, request: boolean, auto: boolean): Promise<void> => {
    if (writingRef.current) return;
    writingRef.current = true;
    setSaveStatus({ kind: 'saving', text: auto ? '自动保存中…' : '保存中…' });
    try {
      const res = await writeToFile(h, serializeData(), request);
      if (res === 'ok') {
        const now = Date.now();
        setMeta((m) => ({ ...m, lastSavedAt: now }));
        setSaveStatus({ kind: 'ok', text: `${auto ? '已自动保存' : '已保存'} · ${formatSavedTime(now)}` });
      } else if (res === 'denied') {
        setSaveStatus({
          kind: 'denied',
          text: auto ? '自动保存失败：文件权限已失效' : '保存失败：没有写入权限',
        });
      } else {
        setSaveStatus({ kind: 'error', text: '保存失败，请重试' });
      }
    } finally {
      writingRef.current = false;
    }
  };

  // 自动保存：数据变化后防抖 1 秒写回文件（跳过挂载首帧；权限不在这里申请，失效时置 denied 等用户点按钮重新授权）
  const firstDataRef = useRef(true);
  useEffect(() => {
    if (firstDataRef.current) {
      firstDataRef.current = false;
      return;
    }
    if (!supported || !autoSaveRef.current || !handleRef.current) return;
    const timer = setTimeout(() => {
      const h = handleRef.current;
      if (h && autoSaveRef.current) void doWrite(h, false, true);
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.data, supported]);

  const pickAndSetFile = async (): Promise<FsFileHandle | null> => {
    const h = await pickDataFile();
    if (!h) return null;
    await persistHandle(h);
    setHandle(h);
    setMeta((m) => ({ ...m, fileName: h.name }));
    setSaveStatus(null);
    return h;
  };

  /** 点击保存：没设置文件先走选择器；手势内可申请权限 */
  const manualSave = async () => {
    if (!supported) {
      exportJson();
      return;
    }
    let h = handleRef.current;
    if (!h) h = await pickAndSetFile();
    if (h) void doWrite(h, true, false);
  };

  /** 重新授权：必须在用户手势里调用，授权成功顺手把当前数据写一次 */
  const reauthorize = async () => {
    const h = handleRef.current;
    if (h) void doWrite(h, true, false);
  };

  const clearFile = async () => {
    await clearPersistedHandle();
    setHandle(null);
    setMeta({ autoSave: false, fileName: '', lastSavedAt: null });
    setSaveStatus(null);
  };

  /* ---- GitHub 同步（第十五轮）----
   * 配置/令牌只存本地独立 key（见 githubSync.ts），同步内容就是 store.data 的 JSON。
   * 裁决基准 baseUpdatedAt：本地与云端最后一次达成一致时的数据 updatedAt；
   * 本地 updatedAt 大于它 = 有待推送变更；拉取时云端 updatedAt 大于本地 = 云端覆盖本地。 */
  type GhStatusKind = 'syncing' | 'ok' | 'error' | 'conflict' | 'missing';
  const [ghMeta, setGhMeta] = useState<GithubSyncMeta>(loadGithubSyncMeta);
  const [ghStatus, setGhStatus] = useState<{ kind: GhStatusKind; text: string } | null>(null);
  /* GitHub 登录（默认入口）：client_id 是公开信息，从 /api/github-oauth?config=1 拿；
   * undefined = 正在查，null = 服务端未配置（按钮置灰），string = 可登录 */
  const [oauthClientId, setOauthClientId] = useState<string | null | undefined>(undefined);
  /* 第五十轮起同步只保留 GitHub 登录一种方式：旧 PAT 配置加载时按未登录处理（见 githubSync.ts） */
  const isOauthLoggedIn = ghMeta.authMode === 'oauth' && !!ghMeta.token;
  /* 扩展构建（方案 B）：OAuth 回跳不可用，改走粘贴令牌直连；令牌同样只存本机独立 key */
  const isPatLoggedIn = IS_EXTENSION_BUILD && ghMeta.authMode === 'pat' && !!ghMeta.token;
  const isGhLoggedIn = isOauthLoggedIn || isPatLoggedIn;
  const [patToken, setPatToken] = useState('');

  useEffect(() => {
    if (IS_EXTENSION_BUILD) {
      // 扩展里不用 OAuth：不查服务端登录配置，登录区直接渲染令牌表单
      setOauthClientId(null);
      return;
    }
    let cancelled = false;
    void fetchOAuthClientId().then((id) => {
      if (!cancelled) setOauthClientId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const storeRef = useRef(store);
  storeRef.current = store;
  const ghMetaRef = useRef(ghMeta);
  ghMetaRef.current = ghMeta;
  const ghBusyRef = useRef(false);

  /** 同步更新 meta 的 state 与 ref（异步流程里要立刻读到最新值，不能等渲染） */
  const updateGhMeta = (patch: Partial<GithubSyncMeta>) => {
    const next = { ...ghMetaRef.current, ...patch };
    ghMetaRef.current = next;
    setGhMeta(next);
  };

  useEffect(() => {
    saveGithubSyncMeta(ghMeta);
  }, [ghMeta]);

  const ghCfg = (): GithubSyncConfig | null => {
    const m = ghMetaRef.current;
    return githubConfigComplete(m) ? m : null;
  };

  /** 用云端数据覆盖本地：先落基准再导入，导入触发的变化 effect 会因 updatedAt 已对齐而跳过回推；
   * 信封携带的组件独立数据（widgetStorage）在主数据导入成功后一并恢复并通知组件重读 */
  const applyRemote = (
    remoteData: unknown,
    sha: string,
    remoteUpdatedAt: number,
    widgetStorage?: Record<string, unknown> | null,
  ): boolean => {
    updateGhMeta({ lastSha: sha, baseUpdatedAt: remoteUpdatedAt, lastSyncedAt: Date.now() });
    if (!storeRef.current.importData(remoteData)) {
      setGhStatus({ kind: 'error', text: '云端数据结构不对，无法导入' });
      return false;
    }
    if (widgetStorage) {
      restoreWidgetStorage(widgetStorage);
      reloadColorsData();
    }
    setGhStatus({ kind: 'ok', text: `已同步 · ${formatSavedTime(Date.now())}` });
    return true;
  };

  const pushToGithub = async (): Promise<void> => {
    const cfg = ghCfg();
    if (!cfg || ghBusyRef.current) return;
    ghBusyRef.current = true;
    setGhStatus({ kind: 'syncing', text: '正在推送到 GitHub…' });
    try {
      const snapshot = dataRef.current;
      const text = JSON.stringify(packDataEnvelope(snapshot), null, 2);
      const res = await ghPutFile(cfg, text, ghMetaRef.current.lastSha);
      if (res.kind === 'ok') {
        updateGhMeta({ lastSha: res.sha, baseUpdatedAt: snapshot.updatedAt, lastSyncedAt: Date.now() });
        setGhStatus({ kind: 'ok', text: `已同步 · ${formatSavedTime(Date.now())}` });
        return;
      }
      if (res.kind === 'error') {
        setGhStatus({ kind: 'error', text: res.message });
        return;
      }
      // sha 冲突：重新拉取，按 updatedAt 裁决
      const remote = await ghGetFile(cfg);
      if (remote.kind === 'error') {
        setGhStatus({ kind: 'error', text: remote.message });
        return;
      }
      if (remote.kind === 'missing') {
        // 云端文件被删了：以无 sha 方式重建一次
        const retry = await ghPutFile(cfg, text, null);
        if (retry.kind === 'ok') {
          updateGhMeta({ lastSha: retry.sha, baseUpdatedAt: snapshot.updatedAt, lastSyncedAt: Date.now() });
          setGhStatus({ kind: 'ok', text: `已同步 · ${formatSavedTime(Date.now())}` });
        } else {
          setGhStatus({ kind: 'conflict', text: '同步冲突：云端状态异常，请选择以哪边为准' });
        }
        return;
      }
      if (remote.updatedAt > dataRef.current.updatedAt) {
        if (applyRemote(remote.data, remote.sha, remote.updatedAt, remote.widgetStorage)) {
          setGhStatus({ kind: 'ok', text: '云端有更新，已拉取云端数据' });
        }
        return;
      }
      // 本地较新：换上云端最新 sha 重试一次
      const retry = await ghPutFile(cfg, serializeData(), remote.sha);
      if (retry.kind === 'ok') {
        updateGhMeta({ lastSha: retry.sha, baseUpdatedAt: dataRef.current.updatedAt, lastSyncedAt: Date.now() });
        setGhStatus({ kind: 'ok', text: `已同步 · ${formatSavedTime(Date.now())}` });
      } else {
        updateGhMeta({ lastSha: remote.sha });
        setGhStatus({ kind: 'conflict', text: '同步冲突：本地与云端都有新变化，请选择以哪边为准' });
      }
    } finally {
      ghBusyRef.current = false;
    }
  };

  const pullFromGithub = async (opts?: { forceApply?: boolean; autoRelogin?: boolean }): Promise<void> => {
    const cfg = ghCfg();
    if (!cfg || ghBusyRef.current) return;
    ghBusyRef.current = true;
    setGhStatus({ kind: 'syncing', text: '正在从 GitHub 拉取…' });
    try {
      const res = await ghGetFile(cfg);
      if (res.kind === 'missing') {
        updateGhMeta({ lastSha: null });
        setGhStatus({ kind: 'missing', text: '云端尚无数据文件' });
        return;
      }
      if (res.kind === 'error') {
        if (opts?.autoRelogin && isGhUnauthorized(res.message) && (await tryAutoReloginOnLoad())) return;
        setGhStatus({ kind: 'error', text: res.message });
        return;
      }
      const localUpdatedAt = dataRef.current.updatedAt;
      if (opts?.forceApply || res.updatedAt > localUpdatedAt) {
        applyRemote(res.data, res.sha, res.updatedAt, res.widgetStorage);
      } else if (res.updatedAt < localUpdatedAt) {
        updateGhMeta({ lastSha: res.sha, baseUpdatedAt: res.updatedAt });
        setGhStatus({ kind: 'ok', text: '本地数据较新，正在推送…' });
        ghBusyRef.current = false;
        await pushToGithub();
        return;
      } else {
        updateGhMeta({ lastSha: res.sha, baseUpdatedAt: res.updatedAt, lastSyncedAt: Date.now() });
        setGhStatus({ kind: 'ok', text: `已同步 · ${formatSavedTime(Date.now())}` });
      }
    } finally {
      ghBusyRef.current = false;
    }
  };

  /** 冲突手动裁决：以本地为准 = 取云端最新 sha 后强行覆盖写回 */
  const forcePushLocal = async () => {
    const cfg = ghCfg();
    if (!cfg || ghBusyRef.current) return;
    ghBusyRef.current = true;
    setGhStatus({ kind: 'syncing', text: '正在以本地数据覆盖云端…' });
    try {
      const remote = await ghGetFile(cfg);
      if (remote.kind === 'error') {
        setGhStatus({ kind: 'error', text: remote.message });
        return;
      }
      const sha = remote.kind === 'ok' ? remote.sha : null;
      const snapshot = dataRef.current;
      const res = await ghPutFile(cfg, JSON.stringify(packDataEnvelope(snapshot), null, 2), sha);
      if (res.kind === 'ok') {
        updateGhMeta({ lastSha: res.sha, baseUpdatedAt: snapshot.updatedAt, lastSyncedAt: Date.now() });
        setGhStatus({ kind: 'ok', text: `已同步 · ${formatSavedTime(Date.now())}` });
      } else if (res.kind === 'conflict') {
        setGhStatus({ kind: 'conflict', text: '同步冲突：云端仍在变化，请稍后再试' });
      } else {
        setGhStatus({ kind: 'error', text: res.message });
      }
    } finally {
      ghBusyRef.current = false;
    }
  };

  /* ---- GitHub 登录（OAuth）：点按钮跳授权页，回跳站点根带 ?code&state ---- */
  const startOAuthLogin = () => {
    if (!oauthClientId) return;
    const state = beginOAuthState();
    window.location.href = buildOAuthAuthorizeUrl(oauthClientId, state);
  };

  /* ---- 登录过期自动重登（用户要求：刷新一下自动登录，不用先点退出）----
   * 背景：本站只存 access_token，没有 refresh_token；令牌被 GitHub 拒（401）时旧版只红字报错，
   * 用户得先点退出登录再点登录。改后分两路：
   * 1）页面加载时的自动拉取撞上 401：直接走 OAuth 重登（GitHub 那边若仍登录着，会秒回跳回来，
   *    等于刷新自动登录）；10 分钟内只自动重登一次，防新令牌也 401 时来回跳转；
   * 2）使用中撞上 401：不强制跳转，状态区出现“重新登录”按钮，点一下直接重登，不用先退出。 */
  const OAUTH_AUTO_RETRY_KEY = 'ainav-oauth-auto-retry-at';
  const OAUTH_AUTO_RETRY_COOLDOWN_MS = 10 * 60 * 1000;
  const isGhUnauthorized = (msg: string) => msg.includes('（401）');
  const canAutoRelogin = (): boolean => {
    try {
      const v = sessionStorage.getItem(OAUTH_AUTO_RETRY_KEY);
      if (!v) return true;
      const at = Number(v);
      return Number.isFinite(at) && Date.now() - at > OAUTH_AUTO_RETRY_COOLDOWN_MS;
    } catch {
      return true;
    }
  };
  /** 刷新时自动重登：拿不到 client_id、扩展版、令牌版、冷却期内一律返回 false，调用方照常显示红字错误 */
  const tryAutoReloginOnLoad = async (): Promise<boolean> => {
    if (IS_EXTENSION_BUILD) return false;
    if (ghMetaRef.current.authMode !== 'oauth') return false;
    if (!canAutoRelogin()) return false;
    const cid = await fetchOAuthClientId();
    if (!cid) return false;
    try {
      sessionStorage.setItem(OAUTH_AUTO_RETRY_KEY, String(Date.now()));
    } catch {
      // 存不下也继续：跳转本身能完成重登
    }
    setGhStatus({ kind: 'syncing', text: 'GitHub 登录已过期，正在重新登录…' });
    const state = beginOAuthState();
    window.location.href = buildOAuthAuthorizeUrl(cid, state);
    return true;
  };

  /**
   * OAuth 回跳处理：校验 state → 服务端换 token → 查账号 → 确保 ainav-data 仓库 →
   * 写定同步配置（仓库/分支/文件固定）并开启同步、立即拉取一次。任一步失败都给红字状态。
   */
  const handleOAuthReturn = async (code: string, returnedState: string | null): Promise<void> => {
    // 先把 URL 里的 code/state 清掉：避免刷新重复处理，授权码也不留在地址栏里
    const url = new URL(window.location.href);
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    setOpen(true);
    const expected = consumeOAuthState();
    if (!expected || !returnedState || returnedState !== expected) {
      setGhStatus({ kind: 'error', text: 'GitHub 登录校验失败（state 不符），请重新登录' });
      return;
    }
    setGhStatus({ kind: 'syncing', text: '正在完成 GitHub 登录…' });
    const exchanged = await exchangeOAuthCode(code);
    if ('error' in exchanged) {
      setGhStatus({ kind: 'error', text: exchanged.error });
      return;
    }
    const user = await ghGetUser(exchanged.token);
    if ('error' in user) {
      setGhStatus({ kind: 'error', text: user.error });
      return;
    }
    const ensured = await ensureOAuthRepo(exchanged.token, user.login);
    if ('error' in ensured) {
      setGhStatus({ kind: 'error', text: ensured.error });
      return;
    }
    updateGhMeta({
      authMode: 'oauth',
      oauthLogin: user.login,
      owner: user.login,
      repo: ensured.repo,
      branch: OAUTH_BRANCH,
      path: OAUTH_FILE_PATH,
      token: exchanged.token,
      enabled: true,
      lastSha: null,
      baseUpdatedAt: 0,
      lastSyncedAt: null,
    });
    setGhStatus({ kind: 'ok', text: `已登录 GitHub（${user.login}），同步已开启` });
    await pullFromGithub();
  };

  /** 退出登录：只清本机凭证与同步开关，本地数据与已同步的云端数据都不动 */
  const logoutOAuth = () => {
    updateGhMeta({ token: '', enabled: false, oauthLogin: '', lastSha: null, baseUpdatedAt: 0, lastSyncedAt: null });
    setGhStatus(null);
  };

  /* 扩展方案 B：粘贴令牌连接——验令牌拿账号 → 确保 ainav-data 仓库（与 OAuth 同一约定）→
   * 写定配置开启同步并立即拉取一次。令牌只存本机独立 key，绝不进同步/导出 JSON。 */
  const connectWithToken = async () => {
    const token = patToken.trim();
    if (!token || ghBusyRef.current) return;
    ghBusyRef.current = true;
    setGhStatus({ kind: 'syncing', text: '正在验证令牌…' });
    try {
      const user = await ghGetUser(token);
      if ('error' in user) {
        setGhStatus({ kind: 'error', text: user.error });
        return;
      }
      const ensured = await ensureOAuthRepo(token, user.login);
      if ('error' in ensured) {
        setGhStatus({ kind: 'error', text: ensured.error });
        return;
      }
      updateGhMeta({
        authMode: 'pat',
        oauthLogin: '',
        owner: user.login,
        repo: ensured.repo,
        branch: OAUTH_BRANCH,
        path: OAUTH_FILE_PATH,
        token,
        enabled: true,
        lastSha: null,
        baseUpdatedAt: 0,
        lastSyncedAt: null,
      });
      setPatToken('');
      setGhStatus({ kind: 'ok', text: `已连接 GitHub（${user.login}），同步已开启` });
    } finally {
      ghBusyRef.current = false;
    }
    await pullFromGithub();
  };

  // 页面加载：带 OAuth 回跳参数时先处理登录，否则同步已开启且配置完整时自动拉取一次
  const ghInitRef = useRef(false);
  useEffect(() => {
    if (ghInitRef.current) return;
    ghInitRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code && !IS_EXTENSION_BUILD) {
      void handleOAuthReturn(code, params.get('state'));
      return;
    }
    const m = ghMetaRef.current;
    if (m.enabled && githubConfigComplete(m)) void pullFromGithub({ autoRelogin: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切回页面时自动拉取一次：桌面端推送的新数据不用刷新页面也能到
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const m = ghMetaRef.current;
      if (m.enabled && githubConfigComplete(m)) void pullFromGithub();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 自动推送：本地数据变化且比同步基准新时，防抖 2 秒写回
  const ghFirstDataRef = useRef(true);
  useEffect(() => {
    if (ghFirstDataRef.current) {
      ghFirstDataRef.current = false;
      return;
    }
    const m = ghMetaRef.current;
    if (!m.enabled || !githubConfigComplete(m)) return;
    if (store.data.updatedAt <= m.baseUpdatedAt) return;
    const timer = setTimeout(() => {
      void pushToGithub();
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.data]);

  const toggleGhEnabled = () => {
    const next = !ghMetaRef.current.enabled;
    updateGhMeta({ enabled: next });
    if (next) void pullFromGithub();
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(packDataEnvelope(store.data), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ainav-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ ok: true, text: '已导出 JSON 文件' });
  };

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      /* 信封文件（带组件独立数据）先拆包；历史纯主数据文件 widgetStorage 为 null、行为不变 */
      const { store: storePart, widgetStorage } = unpackDataEnvelope(parsed);
      if (store.importData(storePart)) {
        if (widgetStorage) {
          restoreWidgetStorage(widgetStorage);
          reloadColorsData();
        }
        setMessage({ ok: true, text: '导入成功，数据已恢复' });
      } else {
        setMessage({ ok: false, text: '导入失败：文件结构不对，请用本应用导出的 JSON' });
      }
    } catch {
      setMessage({ ok: false, text: '导入失败：不是有效的 JSON 文件' });
    }
  };

  const itemCls =
    'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs text-white/75 hover:bg-white/8 hover:text-white transition-colors';
  const itemDisabledCls =
    'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs text-white/30 cursor-not-allowed';
  const ghStatusTextCls = (kind: string) =>
    kind === 'ok'
      ? 'text-emerald-300'
      : kind === 'error'
        ? 'text-red-300'
        : kind === 'conflict' || kind === 'missing'
          ? 'text-amber-300'
          : 'text-white/50';

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        onClick={() => {
          setOpen((v) => !v);
          setMessage(null);
          setConfirmReset(false);
        }}
        title="数据：导出 / 导入 / 恢复默认"
        className="card-glass-surface h-12 sm:h-13 px-2.5 sm:px-3 rounded-2xl border border-white/[0.07] text-white/45 hover:text-white/85 hover:border-white/15 flex items-center gap-1.5 text-xs transition-colors"
      >
        <Database size={15} />
        <span className="hidden sm:inline">数据</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            /* 面板全不透明实色（第十二轮，与背景面板/搜索下拉同口径）：不用 glass-panel 的半透明毛玻璃，避免透出后面的卡片内容 */
            className="absolute right-0 top-full mt-2 w-64 max-h-[82vh] overflow-y-auto rounded-3xl bg-[#17171d] border border-white/15 p-2 shadow-2xl shadow-black/70 z-50"
          >
            <p className="px-3 pt-2 pb-1 text-[10px] text-white/35 leading-relaxed">
              数据保存在本机浏览器里。导出备份、换设备时导入即可恢复。
            </p>
            <button onClick={exportJson} className={itemCls}>
              <Download size={14} className="text-white/45" /> 导出 JSON
            </button>
            <button onClick={() => fileRef.current?.click()} className={itemCls}>
              <Upload size={14} className="text-white/45" /> 导入 JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFile(file);
                e.target.value = '';
              }}
            />
            {confirmReset ? (
              <div className="px-3 py-2">
                <p className="text-[11px] text-red-300 mb-2">恢复默认会清掉你全部增删改，确定？</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      store.resetData();
                      setConfirmReset(false);
                      setMessage({ ok: true, text: '已恢复默认数据' });
                    }}
                    className="text-[11px] px-2.5 py-1.5 rounded-lg bg-red-500/80 text-white font-medium"
                  >
                    确认恢复
                  </button>
                  <button onClick={() => setConfirmReset(false)} className="text-[11px] px-2.5 py-1.5 rounded-lg bg-white/8 text-white/70">
                    算了
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmReset(true)} className={itemCls}>
                <RotateCcw size={14} className="text-white/45" /> 恢复默认数据
              </button>
            )}
            {message && (
              <p className={`px-3 py-2 text-[11px] ${message.ok ? 'text-emerald-300' : 'text-red-300'}`}>{message.text}</p>
            )}

            {/* ---- 本地文件保存（第十四轮）：设置一次保存文件，之后点击保存 / 变化自动保存都写回它 ---- */}
            <div className="mt-1 border-t border-white/8 px-3 pt-2.5 pb-1">
              <p className="text-[10px] font-medium text-white/50 tracking-wide">本地文件保存</p>
              {supported ? (
                <>
                  {handle ? (
                    <>
                      <p className="mt-1.5 text-[11px] text-white/70 break-all">
                        保存文件：<span className="text-white/90">{meta.fileName || handle.name}</span>
                      </p>
                      <div className="mt-1 -mx-3">
                        <button onClick={() => void manualSave()} className={itemCls}>
                          <Save size={14} className="text-white/45" /> 保存到文件
                        </button>
                        <div className="flex">
                          <button onClick={() => void pickAndSetFile()} className={`${itemCls} w-auto flex-1`}>
                            <RefreshCw size={14} className="text-white/45" /> 更换
                          </button>
                          <button onClick={() => void clearFile()} className={`${itemCls} w-auto flex-1`}>
                            <X size={14} className="text-white/45" /> 取消设置
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="mt-1 -mx-3">
                      <button onClick={() => void pickAndSetFile()} className={itemCls}>
                        <FolderOpen size={14} className="text-white/45" /> 设置保存文件
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => handle && setMeta((m) => ({ ...m, autoSave: !m.autoSave }))}
                    disabled={!handle}
                    className={`mt-1 w-full flex items-center justify-between py-1.5 text-xs ${handle ? 'text-white/75' : 'text-white/30 cursor-not-allowed'}`}
                  >
                    <span>数据变化自动保存</span>
                    <span
                      className={`relative h-4.5 w-8 rounded-full transition-colors ${meta.autoSave && handle ? 'bg-violet-500' : 'bg-white/15'}`}
                    >
                      <span
                        className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${meta.autoSave && handle ? 'left-4' : 'left-0.5'}`}
                      />
                    </span>
                  </button>
                  {saveStatus && (
                    <p
                      className={`pb-1 text-[11px] leading-relaxed ${
                        saveStatus.kind === 'ok'
                          ? 'text-emerald-300'
                          : saveStatus.kind === 'saving'
                            ? 'text-white/50'
                            : 'text-red-300'
                      }`}
                    >
                      {saveStatus.kind === 'denied' || saveStatus.kind === 'error' ? (
                        <AlertTriangle size={11} className="inline mr-1 -mt-0.5" />
                      ) : null}
                      {saveStatus.text}
                      {saveStatus.kind === 'denied' && handle && (
                        <button onClick={() => void reauthorize()} className="ml-1.5 underline underline-offset-2 text-amber-300">
                          重新授权
                        </button>
                      )}
                    </p>
                  )}
                  {!saveStatus && meta.lastSavedAt && handle && (
                    <p className="pb-1 text-[11px] text-white/40">上次保存 · {formatSavedTime(meta.lastSavedAt)}</p>
                  )}
                </>
              ) : (
                <>
                  <div className="mt-1 -mx-3">
                    <button onClick={() => void manualSave()} className={itemCls}>
                      <Save size={14} className="text-white/45" /> 保存到文件
                    </button>
                  </div>
                  <div className={itemDisabledCls}>
                    <span className="flex-1">数据变化自动保存</span>
                    <span className="relative h-4.5 w-8 rounded-full bg-white/10">
                      <span className="absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white/50" />
                    </span>
                  </div>
                  <p className="pb-1 text-[10px] text-white/35 leading-relaxed">
                    当前浏览器不支持直接写本地文件，「保存到文件」将以下载方式保存；自动保存需 Chrome / Edge。
                  </p>
                </>
              )}
            </div>

            {/* ---- GitHub 同步（第十五轮起）：数据同步到自己仓库的一个 JSON 文件，打开自动拉、变化自动推；
                 网站版只保留 GitHub 一键登录（OAuth，仓库固定 ainav-data），第五十轮已删令牌备用方式；
                 扩展构建例外走方案 B 粘贴令牌（OAuth 回跳不可用），仓库约定与 OAuth 相同 ---- */}
            <div className="mt-1 border-t border-white/8 px-3 pt-2.5 pb-1">
              <p className="text-[10px] font-medium text-white/50 tracking-wide">GitHub 同步</p>
              {isGhLoggedIn ? (
                <>
                  <p className="mt-1.5 text-[11px] text-white/70 break-all">
                    {isPatLoggedIn ? '已连接 GitHub（令牌）：' : '已登录 GitHub：'}
                    <span className="text-white/90">{ghMeta.oauthLogin || ghMeta.owner}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/40 break-all">
                    同步仓库（固定）：{ghMeta.owner}/{ghMeta.repo} · {ghMeta.branch} · {ghMeta.path}
                  </p>
                  <button
                    onClick={toggleGhEnabled}
                    className="mt-1 w-full flex items-center justify-between py-1.5 text-xs text-white/75"
                  >
                    <span>开启同步（打开自动拉取、变化自动推送）</span>
                    <span className={`relative h-4.5 w-8 shrink-0 rounded-full transition-colors ${ghMeta.enabled ? 'bg-violet-500' : 'bg-white/15'}`}>
                      <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${ghMeta.enabled ? 'left-4' : 'left-0.5'}`} />
                    </span>
                  </button>
                  <div className="mt-0.5 -mx-3">
                    <div className="flex">
                      <button onClick={() => void pullFromGithub()} className={`${itemCls} w-auto flex-1`}>
                        <Download size={14} className="text-white/45" /> 立即拉取
                      </button>
                      <button onClick={() => void pushToGithub()} className={`${itemCls} w-auto flex-1`}>
                        <Upload size={14} className="text-white/45" /> 立即推送
                      </button>
                      <button onClick={logoutOAuth} className={`${itemCls} w-auto flex-1`}>
                        <LogOut size={14} className="text-white/45" /> 退出登录
                      </button>
                    </div>
                  </div>
                  {ghStatus?.kind === 'missing' && (
                    <button
                      onClick={() => void pushToGithub()}
                      className="mt-1 w-full px-3 py-2 rounded-xl bg-violet-500/80 text-white text-xs font-medium hover:bg-violet-500 transition-colors"
                    >
                      把本机数据首次推送上去
                    </button>
                  )}
                  {ghStatus?.kind === 'conflict' && (
                    <div className="mt-1 flex gap-2">
                      <button
                        onClick={() => void pullFromGithub({ forceApply: true })}
                        className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/8 text-white/80 text-[11px] hover:bg-white/12 transition-colors"
                      >
                        以云端为准
                      </button>
                      <button
                        onClick={() => void forcePushLocal()}
                        className="flex-1 px-2.5 py-1.5 rounded-lg bg-violet-500/80 text-white text-[11px] font-medium hover:bg-violet-500 transition-colors"
                      >
                        以本地为准
                      </button>
                    </div>
                  )}
                  <p className={`pb-1 pt-1 text-[11px] leading-relaxed ${ghStatus ? ghStatusTextCls(ghStatus.kind) : 'text-white/40'}`}>
                    {ghStatus
                      ? ghStatus.text
                      : ghMeta.lastSyncedAt
                        ? `上次同步 · ${formatSavedTime(ghMeta.lastSyncedAt)}`
                        : '未连接'}
                  </p>
                  {ghStatus?.kind === 'error' && isGhUnauthorized(ghStatus.text) && (
                    <button
                      onClick={startOAuthLogin}
                      disabled={!oauthClientId}
                      className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-violet-500/80 text-white text-xs font-medium hover:bg-violet-500 transition-colors disabled:bg-white/10 disabled:text-white/35 disabled:cursor-not-allowed"
                    >
                      <LogIn size={14} /> 重新登录（不用先退出）
                    </button>
                  )}
                </>
              ) : IS_EXTENSION_BUILD ? (
                <>
                  {/* 扩展方案 B：粘贴 GitHub 令牌直连同步（OAuth 回跳在扩展里不可用） */}
                  <input
                    type="password"
                    value={patToken}
                    onChange={(e) => setPatToken(e.target.value)}
                    placeholder="粘贴 GitHub 令牌（ghp_… / github_pat_…）"
                    autoComplete="off"
                    className="mt-2 w-full px-3 py-2 rounded-xl bg-white/6 border border-white/12 text-xs text-white placeholder:text-white/30 outline-none focus:border-violet-400/60"
                  />
                  <button
                    onClick={() => void connectWithToken()}
                    disabled={!patToken.trim()}
                    className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-violet-500/80 text-white text-xs font-medium hover:bg-violet-500 transition-colors disabled:bg-white/10 disabled:text-white/35 disabled:cursor-not-allowed"
                  >
                    <KeyRound size={14} /> 连接并同步
                  </button>
                  <p className="mt-1 text-[10px] text-white/35 leading-relaxed">
                    扩展版无法用 GitHub 一键登录，请粘贴令牌连接：GitHub 设置 → Developer settings → Personal access
                    tokens 生成（需 repo 权限）。连接后自动使用你账号下的私有仓库 ainav-data 同步；令牌只存本机，绝不上传。
                  </p>
                  {ghStatus && (
                    <p className={`pt-1 text-[11px] leading-relaxed ${ghStatusTextCls(ghStatus.kind)}`}>
                      {ghStatus.kind === 'error' || ghStatus.kind === 'conflict' ? (
                        <AlertTriangle size={11} className="inline mr-1 -mt-0.5" />
                      ) : null}
                      {ghStatus.text}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={startOAuthLogin}
                    disabled={!oauthClientId}
                    className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-violet-500/80 text-white text-xs font-medium hover:bg-violet-500 transition-colors disabled:bg-white/10 disabled:text-white/35 disabled:cursor-not-allowed"
                  >
                    <LogIn size={14} /> 使用 GitHub 登录
                  </button>
                  {oauthClientId === null ? (
                    <p className="mt-1 text-[10px] text-white/35 leading-relaxed">服务端未配置 GitHub 登录。</p>
                  ) : oauthClientId === undefined ? (
                    <p className="mt-1 text-[10px] text-white/35 leading-relaxed">正在检查 GitHub 登录配置…</p>
                  ) : (
                    <p className="mt-1 text-[10px] text-white/35 leading-relaxed">
                      登录后自动在你的账号下创建私有仓库 ainav-data 并同步，不用填任何配置；每台设备登录一次即可。
                    </p>
                  )}
                  {ghStatus && (
                    <p className={`pt-1 text-[11px] leading-relaxed ${ghStatusTextCls(ghStatus.kind)}`}>
                      {ghStatus.kind === 'error' || ghStatus.kind === 'conflict' ? (
                        <AlertTriangle size={11} className="inline mr-1 -mt-0.5" />
                      ) : null}
                      {ghStatus.text}
                    </p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
