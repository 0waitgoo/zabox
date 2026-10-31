/**
 * 主页 AI 整理条（2026-10-30）：原在吸顶栏下方、网格上方；2026-10-30 起与
 * 顶栏搜索共用一栏两模式（见 UnifiedSearchAiBar），平时只显示其一。
 * 两个子功能共用一句话输入：
 * - 一键分类：按用户意图把现有网站分到对应组（只产出方案，逐项勾选/改目标组后点应用才落盘）；
 * - 一键搜集网站：按用户意图搜集网站候选（逐项勾选、选目标组后点加入才落盘）。
 * 补图标不走 AI、不需口令：点一下扫描当前页显示字标的站，逐个试本站 favicon，
 * 找到的列出预览、逐项勾选后点应用才写回 site.logo（见 services/iconFill）。
 * 绝不静默改分组与站点；应用走 store 现有方法（moveSite/addSite/addGroup），
 * 应用后主页布局自动保存为「我的」预设，内置预设模板本身不动。
 * `active` 为 false 时只藏起整理条（display:none，不卸载）：输入内容保留在
 * 自己的 state 里，不会串到搜索框；确认面板是 fixed 浮层，不受藏起影响。
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Settings, Sparkles, X } from 'lucide-react';
import type { LocalStore } from '../../store/localStore';
import { useLang } from '../../i18n/useLang';
import { scanIconFill, type IconFillHit } from '../../services/iconFill';
import {
  buildCategorizeMessages,
  buildCollectMessages,
  callSiteAi,
  extractJson,
  fetchSiteAiModels,
  loadSiteAiConfig,
  resolveCategorizePlan,
  resolveCollectCandidates,
  saveSiteAiConfig,
  siteAiConfigured,
  SITE_AI_PROVIDER_DEFAULTS,
  type ResolvedCategorizePlan,
  type ResolvedCollect,
  type SiteAiConfig,
  type SiteAiProvider,
} from '../../services/siteAi';

type Mode = 'categorize' | 'collect' | 'icons';
type Phase = 'idle' | 'thinking' | 'error' | 'review' | 'done';

interface MoveEdit {
  siteId: string;
  siteName: string;
  fromGroupId: string;
  fromGroupName: string;
  targetKey: string;
  checked: boolean;
}

const inputCls =
  'w-full bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400/50 placeholder:text-white/30';
const btnPrimary =
  'px-3.5 py-2 rounded-xl bg-indigo-500/80 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-40 shrink-0';
const btnGhost =
  'px-3.5 py-2 rounded-xl bg-white/8 hover:bg-white/12 text-white/80 text-sm transition-colors disabled:opacity-40 shrink-0';

export default function SiteAiAssistant({
  store,
  active = true,
  compactBar = false,
}: {
  store: LocalStore;
  /** 是否当前模式；false 时只藏起整理条（不卸载，输入内容保留） */
  active?: boolean;
  /** 在统一顶栏里用紧凑单行条：去掉 mt-4 与左侧标题块，省出切换开关的宽度 */
  compactBar?: boolean;
}) {
  const [input, setInput] = useState('');
  const barInputRef = useRef<HTMLInputElement>(null);
  const prevActiveRef = useRef(active);

  /* 切回 AI 模式时聚焦整理输入框（首渲染不聚焦，避免进页面就弹键盘） */
  useEffect(() => {
    const was = prevActiveRef.current;
    prevActiveRef.current = active;
    if (!was && active) barInputRef.current?.focus();
  }, [active]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('categorize');
  const [view, setView] = useState<'work' | 'settings'>('work');
  const [cfg, setCfg] = useState<SiteAiConfig>(() => loadSiteAiConfig());
  const [panelIntent, setPanelIntent] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [testOk, setTestOk] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [plan, setPlan] = useState<ResolvedCategorizePlan | null>(null);
  const [moveEdits, setMoveEdits] = useState<MoveEdit[]>([]);
  const [newNames, setNewNames] = useState<Record<string, string>>({});
  const [collect, setCollect] = useState<ResolvedCollect | null>(null);
  const [checkedUrls, setCheckedUrls] = useState<Set<string>>(new Set());
  const [targetMode, setTargetMode] = useState<'existing' | 'new'>('new');
  const [targetGroupId, setTargetGroupId] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [doneText, setDoneText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  /* 补图标（不走 AI）：扫描进度与待确认结果 */
  const [iconHits, setIconHits] = useState<IconFillHit[]>([]);
  const [checkedHitIds, setCheckedHitIds] = useState<Set<string>>(new Set());
  const [iconProgress, setIconProgress] = useState<{ done: number; total: number } | null>(null);
  const [iconNotFound, setIconNotFound] = useState(0);
  const iconScanRunRef = useRef(0);
  const { t } = useLang();

  const groups = store.data.groups;

  const openPanel = (m: Mode, settingsFirst = false) => {
    const current = loadSiteAiConfig();
    setCfg(current);
    setMode(m);
    setPanelIntent(input);
    setView(settingsFirst || !siteAiConfigured(current) ? 'settings' : 'work');
    setPhase('idle');
    setStatus('');
    setPlan(null);
    setCollect(null);
    setTestOk(false);
    setOpen(true);
  };

  const closePanel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    iconScanRunRef.current++;
    setOpen(false);
    setPhase('idle');
  };

  /** 补图标：打开面板即开始扫描（不需 AI 口令）；面板关闭则丢弃本次扫描结果 */
  const runIconScan = async () => {
    const runId = ++iconScanRunRef.current;
    setPhase('thinking');
    setStatus('');
    setIconHits([]);
    setCheckedHitIds(new Set());
    setIconProgress({ done: 0, total: 0 });
    setIconNotFound(0);
    try {
      const res = await scanIconFill(store.data.groups, undefined, (done, total) => {
        if (iconScanRunRef.current === runId) setIconProgress({ done, total });
      });
      if (iconScanRunRef.current !== runId) return;
      setIconHits(res.hits);
      setCheckedHitIds(new Set(res.hits.map((h) => h.siteId)));
      setIconNotFound(res.notFound);
      setIconProgress({ done: res.scanned, total: res.scanned });
      setPhase('review');
    } catch {
      if (iconScanRunRef.current !== runId) return;
      setPhase('error');
      setStatus('扫描被中断，请重新扫描');
    }
  };

  const openIconsPanel = () => {
    setMode('icons');
    setView('work');
    setPanelIntent(input);
    setOpen(true);
    void runIconScan();
  };

  const applyIcons = () => {
    const picked = iconHits.filter((h) => checkedHitIds.has(h.siteId));
    for (const h of picked) store.updateSiteLogo(h.groupId, h.siteId, h.logo);
    setDoneText(t('ai.fillDone', { n: picked.length }));
    setPhase('done');
  };

  const run = async () => {
    const intent = panelIntent.trim();
    if (!intent) {
      setStatus('先写一句话，告诉 AI 你想怎么整理');
      return;
    }
    const current = loadSiteAiConfig();
    setCfg(current);
    if (!siteAiConfigured(current)) {
      setView('settings');
      setStatus('先填好服务商与口令（只存本机）');
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('thinking');
    setStatus('');
    setPlan(null);
    setCollect(null);
    try {
      if (mode === 'categorize') {
        const { messages } = buildCategorizeMessages(intent, store.data.groups);
        const content = await callSiteAi(current, messages, controller.signal);
        const resolved = resolveCategorizePlan(extractJson(content), store.data.groups);
        setPlan(resolved);
        setMoveEdits(
          resolved.moves.map((m) => ({
            siteId: m.siteId,
            siteName: m.siteName,
            fromGroupId: m.fromGroupId,
            fromGroupName: m.fromGroupName,
            targetKey: m.targetKey,
            checked: true,
          })),
        );
        setNewNames(Object.fromEntries(resolved.newGroups.map((g) => [g.key, g.name])));
        setPhase('review');
      } else {
        const messages = buildCollectMessages(intent);
        const content = await callSiteAi(current, messages, controller.signal);
        const resolved = resolveCollectCandidates(extractJson(content), store.data.groups);
        setCollect(resolved);
        setCheckedUrls(new Set(resolved.candidates.map((c) => c.url)));
        const first = store.data.groups[0];
        setTargetMode('new');
        setTargetGroupId(first ? first.id : '');
        setNewGroupName(resolved.groupName);
        setPhase('review');
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setPhase('idle');
        setStatus('已取消');
        return;
      }
      setPhase('error');
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      abortRef.current = null;
    }
  };

  const saveConfig = () => {
    saveSiteAiConfig(cfg);
    setTestOk(false);
    if (siteAiConfigured(cfg)) {
      setView('work');
      setStatus('已保存（只存本机浏览器，不同步、不进仓库）');
    } else {
      setStatus('地址、模型、口令三项都要填');
    }
  };

  const testConnection = async () => {
    if (!siteAiConfigured(cfg)) {
      setStatus('先把地址、模型、口令填完整');
      return;
    }
    setTestBusy(true);
    setTestOk(false);
    setStatus('正在测试连接…');
    try {
      await callSiteAi(cfg, [{ role: 'user', content: '请只回一个字：好' }]);
      setTestOk(true);
      setStatus('连接正常，可以开始用了');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setTestBusy(false);
    }
  };

  /** 获取模型：拉该服务商的 /models 列表供点选；失败原因明说，不静默 */
  const fetchModels = async () => {
    if (!cfg.baseUrl.trim() || !cfg.key.trim()) {
      setModelsError('先填接口地址和口令，再点获取模型');
      return;
    }
    setModelsBusy(true);
    setModelsError('');
    setModels(null);
    try {
      const list = await fetchSiteAiModels(cfg);
      setModels(list);
      if (!cfg.model.trim() && list.length > 0) {
        setCfg((prev) => ({ ...prev, model: list[0] }));
      }
    } catch (e) {
      setModelsError(e instanceof Error ? e.message : String(e));
    } finally {
      setModelsBusy(false);
    }
  };

  const applyCategorize = () => {
    if (!plan) return;
    const realId = new Map<string, string>();
    for (const ng of plan.newGroups) {
      if (!moveEdits.some((m) => m.checked && m.targetKey === ng.key)) continue;
      realId.set(ng.key, store.addGroup((newNames[ng.key] ?? ng.name).trim() || ng.name, 'list'));
    }
    let applied = 0;
    for (const m of moveEdits) {
      if (!m.checked) continue;
      const to = m.targetKey.startsWith('new:') ? realId.get(m.targetKey) : m.targetKey;
      if (!to || to === m.fromGroupId) continue;
      store.moveSite(m.fromGroupId, m.siteId, to);
      applied++;
    }
    setDoneText(`已移动 ${applied} 站${realId.size ? `，新建 ${realId.size} 组` : ''}`);
    setPhase('done');
  };

  const applyCollect = () => {
    if (!collect) return;
    let targetId = targetGroupId;
    let created = false;
    if (targetMode === 'new' || !targetId) {
      targetId = store.addGroup(newGroupName.trim() || '新编组', 'list');
      created = true;
    }
    let added = 0;
    for (const c of collect.candidates) {
      if (!checkedUrls.has(c.url)) continue;
      store.addSite(targetId, {
        name: c.name,
        url: c.url,
        description: c.description,
        aliases: [],
        pinned: false,
        tags: [],
        iconMode: 'auto',
        iconText: '',
        iconColor: '',
        iconImage: '',
        autoLogo: '',
      });
      added++;
    }
    setDoneText(`已加入 ${added} 站${created ? `（新建组 ${newGroupName.trim() || '新编组'}）` : ''}`);
    setPhase('done');
  };

  const checkedMoves = moveEdits.filter((m) => m.checked);
  const groupNameOf = (key: string): string => {
    if (key.startsWith('new:')) return newNames[key] ?? plan?.newGroups.find((g) => g.key === key)?.name ?? key;
    return groups.find((g) => g.id === key)?.name ?? key;
  };
  // 分类结果按目标组分段展示（现有组按主页顺序、新组在后）
  const moveSections = (() => {
    const order = new Map<string, number>();
    groups.forEach((g, i) => order.set(g.id, i));
    const byKey = new Map<string, MoveEdit[]>();
    for (const m of moveEdits) {
      const list = byKey.get(m.targetKey) ?? [];
      list.push(m);
      byKey.set(m.targetKey, list);
    }
    return [...byKey.entries()].sort(([a], [b]) => {
      const ai = a.startsWith('new:') ? 1000 : (order.get(a) ?? 999);
      const bi = b.startsWith('new:') ? 1000 : (order.get(b) ?? 999);
      return ai - bi;
    });
  })();
  const targetOptions = [
    ...groups.map((g) => ({ key: g.id, label: g.name })),
    ...(plan?.newGroups.map((g) => ({ key: g.key, label: `新建：${newNames[g.key] ?? g.name}` })) ?? []),
  ];

  return (
    <>
      <div
        data-site-ai-bar
        aria-hidden={!active}
        className={
          compactBar
            ? `flex-1 min-w-0 rounded-[22px] border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 flex flex-wrap items-center gap-2 ${active ? '' : 'hidden'}`
            : `mt-4 rounded-[22px] border border-indigo-400/30 bg-indigo-500/10 px-3 py-3 sm:px-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 ${active ? '' : 'hidden'}`
        }
      >
        {!compactBar && (
          <div className="flex items-center gap-2 shrink-0">
            <Sparkles size={18} className="text-indigo-300" />
            <span className="text-sm font-semibold text-white/90">{t('ai.title')}</span>
          </div>
        )}
        <input
          ref={barInputRef}
          data-site-ai-input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') openPanel('categorize');
          }}
          placeholder={t('ai.placeholder')}
          className={`${inputCls} ${compactBar ? 'flex-[1_1_140px] min-w-0' : 'flex-1'}`}
        />
        <div className="flex gap-2 shrink-0">
          <button
            data-site-ai-categorize
            onClick={() => openPanel('categorize')}
            className={compactBar ? 'px-2.5 py-1.5 rounded-xl bg-indigo-500/80 hover:bg-indigo-500 text-white text-xs font-medium transition-colors shrink-0' : btnPrimary}
          >
            {t('ai.categorize')}
          </button>
          <button
            data-site-ai-collect
            onClick={() => openPanel('collect')}
            className={compactBar ? 'px-2.5 py-1.5 rounded-xl bg-white/8 hover:bg-white/12 text-white/80 text-xs transition-colors shrink-0' : btnGhost}
          >
            {t('ai.collect')}
          </button>
          <button
            data-site-ai-icons
            onClick={openIconsPanel}
            title={t('ai.fillNote')}
            className={compactBar ? 'px-2.5 py-1.5 rounded-xl bg-white/8 hover:bg-white/12 text-white/80 text-xs transition-colors shrink-0' : btnGhost}
          >
            {t('ai.fillIcons')}
          </button>
          <button
            data-site-ai-settings
            onClick={() => openPanel(mode, true)}
            title={t('ai.settingsTitle')}
            className="p-2 rounded-xl bg-white/8 hover:bg-white/12 text-white/70 transition-colors"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={closePanel}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              data-site-ai-panel
              className="rounded-[24px] bg-[#17171d] border border-white/15 w-full max-w-lg max-h-[84vh] flex flex-col overflow-hidden shadow-2xl shadow-black/70"
            >
              <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Sparkles size={15} className="text-indigo-300" />
                  {mode === 'categorize' ? t('ai.categorize') : mode === 'collect' ? t('ai.collectAction') : t('ai.fillTitle')}
                </h3>
                <div className="flex items-center gap-1">
                  {mode !== 'icons' && (
                  <button
                    onClick={() => setView(view === 'settings' ? 'work' : 'settings')}
                    title={t('ai.settings')}
                    className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10"
                  >
                    <Settings size={15} />
                  </button>
                  )}
                  <button
                    onClick={closePanel}
                    aria-label="关闭"
                    className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
                {view === 'settings' ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-[11px] text-white/45 leading-relaxed">
                      沿用计划 AI 的接法：服务商、模型、口令由你自己填，只存本机浏览器，不同步、不进仓库。
                      调用走你自己的服务商账号，费用算你自己的账号；站点清单会随请求发给服务商，仅用于本次整理。
                    </p>
                    <label className="block">
                      <span className="text-xs text-white/60">服务商</span>
                      <select
                        data-site-ai-provider
                        value={cfg.provider}
                        onChange={(e) => {
                          const provider = e.target.value as SiteAiProvider;
                          setModels(null);
                          setModelsError('');
                          setCfg((prev) => ({
                            ...prev,
                            provider,
                            baseUrl:
                              provider === 'custom' ? prev.baseUrl : SITE_AI_PROVIDER_DEFAULTS[provider].baseUrl,
                            model:
                              provider === 'custom' ? prev.model : SITE_AI_PROVIDER_DEFAULTS[provider].model,
                          }));
                        }}
                        className={`${inputCls} mt-1`}
                      >
                        <option value="deepseek">DeepSeek</option>
                        <option value="openai">OpenAI</option>
                        <option value="custom">自定义</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs text-white/60">接口地址</span>
                      <input
                        data-site-ai-base-url
                        value={cfg.baseUrl}
                        onChange={(e) => setCfg((prev) => ({ ...prev, baseUrl: e.target.value }))}
                        placeholder="https://api.deepseek.com/v1"
                        className={`${inputCls} mt-1`}
                      />
                    </label>
                    <div>
                      <span className="text-xs text-white/60">模型</span>
                      <div className="flex gap-2 mt-1">
                        <input
                          data-site-ai-model
                          value={cfg.model}
                          onChange={(e) => setCfg((prev) => ({ ...prev, model: e.target.value }))}
                          placeholder="deepseek-chat"
                          className={`${inputCls} flex-1`}
                        />
                        <button
                          data-site-ai-fetch-models
                          onClick={fetchModels}
                          disabled={modelsBusy}
                          className={btnGhost}
                        >
                          {modelsBusy ? '拉取中…' : '获取模型'}
                        </button>
                      </div>
                      {models && models.length > 0 && (
                        <>
                          <select
                            data-site-ai-model-select
                            value={models.includes(cfg.model) ? cfg.model : ''}
                            onChange={(e) => setCfg((prev) => ({ ...prev, model: e.target.value }))}
                            className={`${inputCls} mt-2`}
                          >
                            <option value="">从拉到的模型里选…</option>
                            {models.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                          <p className="text-[11px] text-white/45 mt-1">拉到 {models.length} 个模型，点选填入上面输入框</p>
                        </>
                      )}
                      {modelsError && <p className="text-[11px] text-red-300 mt-1">{modelsError}</p>}
                    </div>
                    <label className="block">
                      <span className="text-xs text-white/60">口令（API Key）</span>
                      <input
                        data-site-ai-key
                        type="password"
                        value={cfg.key}
                        onChange={(e) => setCfg((prev) => ({ ...prev, key: e.target.value }))}
                        placeholder="只存本机，不会同步到 GitHub"
                        className={`${inputCls} mt-1`}
                      />
                    </label>
                    <div className="flex gap-2">
                      <button data-site-ai-save onClick={saveConfig} className={btnPrimary}>
                        保存
                      </button>
                      <button data-site-ai-test onClick={testConnection} disabled={testBusy} className={btnGhost}>
                        {testBusy ? '测试中…' : '测试连接'}
                      </button>
                    </div>
                    {testOk && <p className="text-[11px] text-emerald-300">连接正常，可以开始用了</p>}
                    {status && !testOk && <p className="text-[11px] text-white/50">{status}</p>}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {mode !== 'icons' && (
                    <div className="flex gap-2">
                      <input
                        data-site-ai-intent
                        value={panelIntent}
                        onChange={(e) => setPanelIntent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && phase !== 'thinking') run();
                        }}
                        placeholder={
                          mode === 'categorize'
                            ? '比如：把 AI 绘画的网站归到一组'
                            : '比如：找几个免费商用图库网站'
                        }
                        className={`${inputCls} flex-1`}
                      />
                      <button
                        data-site-ai-run
                        onClick={run}
                        disabled={phase === 'thinking'}
                        className={btnPrimary}
                      >
                        {phase === 'thinking' ? '思考中…' : mode === 'categorize' ? '开始分类' : '开始搜集'}
                      </button>
                      {phase === 'thinking' && (
                        <button onClick={() => abortRef.current?.abort()} className={btnGhost}>
                          取消
                        </button>
                      )}
                    </div>
                    )}
                    {mode === 'icons' && (
                      <p className="text-[11px] text-white/45 leading-relaxed">{t('ai.fillNote')}</p>
                    )}
                    {status && phase !== 'done' && <p className="text-[11px] text-white/50">{status}</p>}
                    {phase === 'thinking' && mode === 'icons' && iconProgress && (
                      <p className="text-[11px] text-indigo-300">
                        {t('ai.fillScanning', { done: iconProgress.done, total: iconProgress.total })}
                      </p>
                    )}
                    {phase === 'thinking' && mode !== 'icons' && (
                      <p className="text-[11px] text-indigo-300">AI 正在看你的分组…稍等一下</p>
                    )}
                    {phase === 'error' && mode === 'icons' && (
                      <div className="rounded-xl bg-red-500/10 border border-red-400/30 px-3 py-2">
                        <p className="text-xs text-red-200">{status}</p>
                        <button onClick={() => void runIconScan()} className={`${btnGhost} mt-2`}>
                          {t('ai.fillRescan')}
                        </button>
                      </div>
                    )}
                    {phase === 'error' && mode !== 'icons' && (
                      <div className="rounded-xl bg-red-500/10 border border-red-400/30 px-3 py-2">
                        <p className="text-xs text-red-200">{status}</p>
                        <button onClick={run} className={`${btnGhost} mt-2`}>
                          再试一次
                        </button>
                      </div>
                    )}

                    {phase === 'review' && mode === 'categorize' && plan && (
                      <>
                        <p className="text-xs text-white/70">
                          建议移动 {plan.moves.length} 站（共 {plan.totalSites} 站），新建 {plan.newGroups.length}{' '}
                          组；其余不动。
                          {plan.dropped > 0 && `另有 ${plan.dropped} 条 AI 建议因站点/组对不上被丢弃。`}
                          勾选确认、改目标组后，点应用才生效。
                        </p>
                        {plan.moves.length === 0 ? (
                          <p className="text-xs text-white/45">
                            AI 认为没有需要移动的站点，换句话再试一次（比如说得更具体一点）。
                          </p>
                        ) : (
                          moveSections.map(([key, rows]) => (
                            <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-2.5">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[11px] text-white/40 shrink-0">
                                  {key.startsWith('new:') ? '新建组：' : '移入：'}
                                </span>
                                {key.startsWith('new:') ? (
                                  <input
                                    data-site-ai-new-group-name={key}
                                    value={newNames[key] ?? ''}
                                    onChange={(e) => setNewNames((prev) => ({ ...prev, [key]: e.target.value }))}
                                    maxLength={8}
                                    className="flex-1 bg-white/5 border border-white/12 rounded-lg px-2 py-1 text-xs outline-none focus:border-indigo-400/50"
                                  />
                                ) : (
                                  <span className="text-xs font-medium">{groupNameOf(key)}</span>
                                )}
                              </div>
                              <div className="flex flex-col gap-1">
                                {rows.map((m) => (
                                  <div key={m.siteId} className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      data-site-ai-row={m.siteId}
                                      checked={m.checked}
                                      onChange={(e) =>
                                        setMoveEdits((prev) =>
                                          prev.map((x) =>
                                            x.siteId === m.siteId ? { ...x, checked: e.target.checked } : x,
                                          ),
                                        )
                                      }
                                      className="shrink-0 accent-indigo-500"
                                    />
                                    <span className="flex-1 min-w-0 truncate text-xs">
                                      {m.siteName}
                                      <span className="text-white/35">（从 {m.fromGroupName}）</span>
                                    </span>
                                    <select
                                      data-site-ai-target={m.siteId}
                                      value={m.targetKey}
                                      onChange={(e) =>
                                        setMoveEdits((prev) =>
                                          prev.map((x) =>
                                            x.siteId === m.siteId ? { ...x, targetKey: e.target.value } : x,
                                          ),
                                        )
                                      }
                                      className="shrink-0 bg-white/5 border border-white/12 rounded-lg px-1.5 py-1 text-xs outline-none"
                                    >
                                      {targetOptions.map((o) => (
                                        <option key={o.key} value={o.key}>
                                          {o.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                        {checkedMoves.length > 0 && (
                          <button data-site-ai-apply onClick={applyCategorize} className={btnPrimary}>
                            应用到主页（{checkedMoves.length} 站）
                          </button>
                        )}
                      </>
                    )}

                    {phase === 'review' && mode === 'collect' && collect && (
                      <>
                        <p className="text-xs text-white/70">
                          AI 给了 {collect.candidates.length} 个候选。
                          {collect.skippedExisting.length > 0 &&
                            `已有 ${collect.skippedExisting.length} 个已跳过：${collect.skippedExisting.join('、')}。`}
                          {collect.skippedInvalid > 0 && `另有 ${collect.skippedInvalid} 个因链接无效被丢弃。`}
                          勾选确认、选好目标组后，点加入才生效；AI 给的网址请顺手核对一下。
                        </p>
                        {collect.candidates.length === 0 ? (
                          <p className="text-xs text-white/45">没有可用候选，换句话再试一次。</p>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {collect.candidates.map((c) => (
                              <div key={c.url} className="flex items-start gap-2 rounded-xl bg-white/[0.03] border border-white/10 px-2.5 py-2">
                                <input
                                  type="checkbox"
                                  data-site-ai-candidate={c.url}
                                  checked={checkedUrls.has(c.url)}
                                  onChange={(e) =>
                                    setCheckedUrls((prev) => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.add(c.url);
                                      else next.delete(c.url);
                                      return next;
                                    })
                                  }
                                  className="shrink-0 mt-0.5 accent-indigo-500"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium truncate">{c.name}</p>
                                  <p className="text-[11px] text-white/40 truncate" title={c.url}>
                                    {c.url}
                                  </p>
                                  {c.description && (
                                    <p className="text-[11px] text-white/55 line-clamp-1">{c.description}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white/60 shrink-0">加到</span>
                          <select
                            data-site-ai-target-group
                            value={targetMode === 'new' ? '__new__' : targetGroupId}
                            onChange={(e) => {
                              if (e.target.value === '__new__') setTargetMode('new');
                              else {
                                setTargetMode('existing');
                                setTargetGroupId(e.target.value);
                              }
                            }}
                            className="flex-1 bg-white/5 border border-white/12 rounded-xl px-2 py-2 text-xs outline-none"
                          >
                            <option value="__new__">新建组</option>
                            {groups.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                          {targetMode === 'new' && (
                            <input
                              data-site-ai-new-group-name
                              value={newGroupName}
                              onChange={(e) => setNewGroupName(e.target.value)}
                              maxLength={8}
                              placeholder="新组名"
                              className="w-28 bg-white/5 border border-white/12 rounded-xl px-2 py-2 text-xs outline-none focus:border-indigo-400/50"
                            />
                          )}
                        </div>
                        {checkedUrls.size > 0 && (
                          <button data-site-ai-apply onClick={applyCollect} className={btnPrimary}>
                            加入（{checkedUrls.size} 站）
                          </button>
                        )}
                      </>
                    )}

                    {phase === 'review' && mode === 'icons' && (
                      <>
                        {iconHits.length === 0 ? (
                          <p className="text-xs text-white/45">{t('ai.fillNone')}</p>
                        ) : (
                          <>
                            <p className="text-xs text-white/70">
                              {t('ai.fillFound', { found: iconHits.length, missing: iconNotFound })}
                            </p>
                            <div className="flex flex-col gap-1">
                              {iconHits.map((h) => (
                                <div key={h.siteId} className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/10 px-2.5 py-2">
                                  <input
                                    type="checkbox"
                                    data-site-ai-icon-row={h.siteId}
                                    checked={checkedHitIds.has(h.siteId)}
                                    onChange={(e) =>
                                      setCheckedHitIds((prev) => {
                                        const next = new Set(prev);
                                        if (e.target.checked) next.add(h.siteId);
                                        else next.delete(h.siteId);
                                        return next;
                                      })
                                    }
                                    className="shrink-0 accent-indigo-500"
                                  />
                                  <img
                                    src={h.logo}
                                    alt=""
                                    className="w-8 h-8 rounded-lg object-contain bg-white/5 shrink-0"
                                    onError={(e) => {
                                      e.currentTarget.style.visibility = 'hidden';
                                    }}
                                  />
                                  <span className="flex-1 min-w-0 truncate text-xs">
                                    {h.siteName}
                                    <span className="text-white/35">（{h.groupName}）</span>
                                  </span>
                                </div>
                              ))}
                            </div>
                            {checkedHitIds.size > 0 && (
                              <button data-site-ai-apply-icons onClick={applyIcons} className={btnPrimary}>
                                {t('ai.fillApply', { n: checkedHitIds.size })}
                              </button>
                            )}
                          </>
                        )}
                        <button onClick={() => void runIconScan()} className={btnGhost}>
                          {t('ai.fillRescan')}
                        </button>
                      </>
                    )}

                    {phase === 'done' && (
                      <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/30 px-3 py-2">
                        <p className="text-xs text-emerald-200">{doneText}</p>
                        <p className="text-[11px] text-white/45 mt-1">
                          已应用到你的主页布局（自动保存为「我的」预设，内置预设模板本身没有动）。
                        </p>
                        <div className="flex gap-2 mt-2">
                          <button onClick={closePanel} className={btnPrimary}>
                            完成
                          </button>
                          <button
                            onClick={() => {
                              if (mode === 'icons') {
                                void runIconScan();
                                return;
                              }
                              setPhase('idle');
                              setPlan(null);
                              setCollect(null);
                              setStatus('');
                            }}
                            className={btnGhost}
                          >
                            {mode === 'icons' ? t('ai.fillRescan') : '再来一句'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
