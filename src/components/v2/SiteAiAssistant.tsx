/**
 * 主页 AI 整理条（2026-10-30）：原在吸顶栏下方、网格上方；2026-10-30 起与
 * 顶栏搜索共用一栏两模式（见 UnifiedSearchAiBar），平时只显示其一。
 * 两个子功能共用一句话输入：
 * - 一键分类：按用户意图把现有网站分到对应组（只产出方案，逐项勾选/改目标组后点应用才落盘）；
 * - 一键搜集网站：按用户意图搜集网站候选（逐项勾选、选目标组后点加入才落盘）。
 * 补图标和标签（2026-11-27 合并为一次操作）：点一下同时扫两样——图标走探测
 * （本站 favicon，探测不到的站若配了 AI 口令再由 AI 找官网 Logo 地址、加载验证
 * 通过才列出）、标签走规则（先按规则补 VPN，规则判不出的站若配了 AI 口令再由
 * AI 建议 VPN/APP；见 services/iconFill、services/tagFill、services/siteAi）。
 * 两边的 AI 共用一次调用（buildFillMessages），每天限额只计 1 次；站太多时才
 * 拆成两次调用，仍是一次点按、一次进度。找到的列出预览、逐项勾选后点一次应用
 * 才写回；没配 AI 时只用探测与规则。
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
import { scanIconFill, verifySuggestedLogos, type IconFillHit } from '../../services/iconFill';
import { mergeTagSuggestion, scanTagFill, type TagFillHit } from '../../services/tagFill';
import { siteTagBadgeCls } from './GroupExpanded';
import {
  AI_DAILY_LIMIT_ERROR,
  buildCategorizeMessages,
  buildCollectMessages,
  buildFillMessages,
  buildIconLogoMessages,
  buildTagMessages,
  callSiteAi,
  extractJson,
  fetchSiteAiModels,
  loadSiteAiConfig,
  resolveCategorizePlan,
  resolveCollectCandidates,
  resolveIconLogoPlan,
  resolveTagPlan,
  saveSiteAiConfig,
  siteAiConfigured,
  SITE_AI_PROVIDER_DEFAULTS,
  type ResolvedCategorizePlan,
  type ResolvedCollect,
  type SiteAiConfig,
  type SiteAiProvider,
} from '../../services/siteAi';
import { AI_DAILY_LIMIT, canUseAi, getAiDailyRemaining } from '../../services/aiDailyLimit';

type Mode = 'categorize' | 'collect' | 'fill';
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
  // [&>option]:text-black：原生下拉弹层在 Windows 下是白底，选项不显式写黑字会继承浅色字、白底上看不见（2026-11-05 搜集分组弹窗实报；扩展弹窗同款先例）
  'w-full bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400/50 placeholder:text-white/30 [&>option]:text-black';
const btnPrimary =
  'px-3.5 py-2 rounded-xl bg-indigo-500/80 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-40 shrink-0';
const btnGhost =
  'px-3.5 py-2 rounded-xl bg-white/8 hover:bg-white/12 text-white/80 text-sm transition-colors disabled:opacity-40 shrink-0';

export default function SiteAiAssistant({
  store,
  active = true,
  compactBar = false,
  bare = false,
}: {
  store: LocalStore;
  /** 是否当前模式；false 时只藏起整理条（不卸载，输入内容保留） */
  active?: boolean;
  /** 在统一顶栏里用紧凑单行条：去掉 mt-4 与左侧标题块，省出切换开关的宽度 */
  compactBar?: boolean;
  /** 一体式搜索栏（2026-11-27）：true 时不画自己的框体，只留输入行，
      框体由统一栏提供；输入框改透明，与搜索输入同款 */
  bare?: boolean;
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
  /* 补图标（探测 + AI 找官网 Logo 地址）：扫描进度与待确认结果 */
  const [iconHits, setIconHits] = useState<IconFillHit[]>([]);
  const [checkedHitIds, setCheckedHitIds] = useState<Set<string>>(new Set());
  const [iconProgress, setIconProgress] = useState<{ done: number; total: number } | null>(null);
  const [iconNotFound, setIconNotFound] = useState(0);
  const [iconSkipped, setIconSkipped] = useState(0);
  const [iconAiFailed, setIconAiFailed] = useState(false);
  const [iconAiWorking, setIconAiWorking] = useState(false);
  /* 补标签（规则 VPN + AI 建议 VPN/APP）：扫描结果与待确认建议 */
  const [tagHits, setTagHits] = useState<TagFillHit[]>([]);
  const [checkedTagHitIds, setCheckedTagHitIds] = useState<Set<string>>(new Set());
  const [tagScanned, setTagScanned] = useState(0);
  const [tagNoSuggestion, setTagNoSuggestion] = useState(0);
  const [tagAlreadyFull, setTagAlreadyFull] = useState(0);
  const [tagAiFailed, setTagAiFailed] = useState(false);
  const [tagAiWorking, setTagAiWorking] = useState(false);
  /* 合并补齐：图标与标签共用一次扫描（图标探测＋标签规则先行，一次 AI 调用补两样） */
  const fillScanRunRef = useRef(0);
  const [fillAiWorking, setFillAiWorking] = useState(false);
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
    fillScanRunRef.current++;
    setOpen(false);
    setPhase('idle');
  };

  /** 合并补齐一次能问的站数上限：图标+标签待 AI 的站超过这个数时，一次调用的
 * 返回可能被截断，改拆成图标/标签两次调用（仍是一次点按、一次进度）。 */
const FILL_AI_COMBINED_MAX = 30;

/** 把 AI 建议的标签并入待确认清单：有建议的进清单（来源 ai），没建议的留待计数 */
function mergeAiTagSuggestions(noSug: TagFillHit[], plan: Map<string, string[]>) {
  const hits: TagFillHit[] = [];
  const still: TagFillHit[] = [];
  for (const s of noSug) {
    const suggested = (plan.get(s.siteId) ?? []).filter((tag) => !s.existing.includes(tag));
    const room = 2 - s.existing.length;
    if (suggested.length > 0) hits.push({ ...s, tags: suggested.slice(0, room), source: 'ai' });
    else still.push(s);
  }
  return { hits, still };
}

  /** 补图标和标签合并扫描（2026-11-27）：一次点按、一次进度，同时扫两样。
   * 顺序：① 标签规则（本地瞬间）→ ② 图标探测（本地联网验证）→ ③ 一次 AI 调用
   * 同时补图标和标签（buildFillMessages；待 AI 的站太多时才拆成两次调用，仍是
   * 一次点按）。AI 推荐的图标地址逐个加载验证通过才列出；面板关闭丢弃结果。 */
  const runFillScan = async () => {
    const runId = ++fillScanRunRef.current;
    setPhase('thinking');
    setStatus('');
    setIconHits([]);
    setCheckedHitIds(new Set());
    setIconProgress({ done: 0, total: 0 });
    setIconNotFound(0);
    setIconSkipped(0);
    setIconAiFailed(false);
    setIconAiWorking(false);
    setTagHits([]);
    setCheckedTagHitIds(new Set());
    setTagScanned(0);
    setTagNoSuggestion(0);
    setTagAlreadyFull(0);
    setTagAiFailed(false);
    setTagAiWorking(false);
    setFillAiWorking(false);
    const aiCfg = loadSiteAiConfig();
    const aiConfigured = siteAiConfigured(aiCfg);
    try {
      // ① 标签规则：纯本地计算，瞬间完成
      const tagRes = scanTagFill(store.data.groups);
      if (fillScanRunRef.current !== runId) return;
      setTagScanned(tagRes.scanned);
      setTagAlreadyFull(tagRes.alreadyFull);
      const tagHitsLocal: TagFillHit[] = [...tagRes.hits];
      let tagNoSug = tagRes.noSuggestion;
      // ② 图标探测：本地验证本站 favicon（不走 AI，失败的站留待第 ③ 步）
      const iconRes = await scanIconFill(store.data.groups, undefined, (done, total) => {
        if (fillScanRunRef.current === runId) setIconProgress({ done, total });
      });
      if (fillScanRunRef.current !== runId) return;
      const iconHitsLocal = [...iconRes.hits];
      setIconHits(iconHitsLocal);
      setCheckedHitIds(new Set(iconHitsLocal.map((h) => h.siteId)));
      setIconNotFound(iconRes.notFound);
      setIconSkipped(iconRes.skipped);
      setIconProgress({ done: iconRes.scanned, total: iconRes.scanned });
      // ③ 一次 AI 调用同时补两样
      const needLogos = iconRes.missedSites;
      const needTags = tagNoSug;
      const needAi = needLogos.length > 0 || needTags.length > 0;
      if (aiConfigured && needAi) {
        if (!canUseAi()) {
          // 限额满了：本地结果照常出，只提示今天 AI 不能再用了
          setStatus(t('ai.dailyLimitReached'));
        } else {
          setFillAiWorking(true);
          setIconAiWorking(true);
          setTagAiWorking(true);
          const tagSitesOf = (list: TagFillHit[]) =>
            list.map((s) => {
              const site = store.data.groups
                .find((g) => g.id === s.groupId)
                ?.sites.find((x) => x.id === s.siteId);
              return { id: s.siteId, name: s.siteName, url: site?.url ?? '', description: site?.description ?? '' };
            });
          try {
            const total = needLogos.length + needTags.length;
            if (total <= FILL_AI_COMBINED_MAX) {
              const text = await callSiteAi(
                aiCfg,
                buildFillMessages(
                  needLogos.map((s) => ({ id: s.siteId, name: s.siteName, url: s.url })),
                  tagSitesOf(needTags),
                ),
                abortRef.current?.signal,
              );
              const parsed = extractJson(text);
              const logoPlan = resolveIconLogoPlan(parsed, new Set(needLogos.map((s) => s.siteId)));
              const tagPlan = resolveTagPlan(parsed, new Set(needTags.map((s) => s.siteId)));
              const aiLogoHits = await verifySuggestedLogos(needLogos, logoPlan);
              if (fillScanRunRef.current !== runId) return;
              iconHitsLocal.push(...aiLogoHits);
              setIconHits([...iconHitsLocal]);
              setCheckedHitIds(new Set(iconHitsLocal.map((h) => h.siteId)));
              const merged = mergeAiTagSuggestions(tagNoSug, tagPlan);
              tagHitsLocal.push(...merged.hits);
              tagNoSug = merged.still;
            } else {
              // 站太多、一次问不下：拆成图标/标签两次调用，仍是一次点按、一次进度
              const logoText = await callSiteAi(
                aiCfg,
                buildIconLogoMessages(needLogos.map((s) => ({ id: s.siteId, name: s.siteName, url: s.url }))),
                abortRef.current?.signal,
              );
              const logoPlan = resolveIconLogoPlan(extractJson(logoText), new Set(needLogos.map((s) => s.siteId)));
              const aiLogoHits = await verifySuggestedLogos(needLogos, logoPlan);
              if (fillScanRunRef.current !== runId) return;
              iconHitsLocal.push(...aiLogoHits);
              setIconHits([...iconHitsLocal]);
              setCheckedHitIds(new Set(iconHitsLocal.map((h) => h.siteId)));
              const tagText = await callSiteAi(
                aiCfg,
                buildTagMessages(tagSitesOf(needTags)),
                abortRef.current?.signal,
              );
              const tagPlan = resolveTagPlan(extractJson(tagText), new Set(needTags.map((s) => s.siteId)));
              const merged = mergeAiTagSuggestions(tagNoSug, tagPlan);
              tagHitsLocal.push(...merged.hits);
              tagNoSug = merged.still;
            }
          } catch (e) {
            if (fillScanRunRef.current !== runId) return;
            if (e instanceof Error && e.message === AI_DAILY_LIMIT_ERROR) {
              setStatus(t('ai.dailyLimitReached'));
            } else if (!(e instanceof DOMException && e.name === 'AbortError')) {
              setIconAiFailed(true);
              setTagAiFailed(true);
            }
          } finally {
            if (fillScanRunRef.current === runId) {
              setFillAiWorking(false);
              setIconAiWorking(false);
              setTagAiWorking(false);
            }
          }
        }
      }
      if (fillScanRunRef.current !== runId) return;
      setTagHits(tagHitsLocal);
      setCheckedTagHitIds(new Set(tagHitsLocal.map((h) => h.siteId)));
      setTagNoSuggestion(tagNoSug.length);
      setPhase('review');
    } catch {
      if (fillScanRunRef.current !== runId) return;
      setPhase('error');
      setStatus('扫描被中断，请重新扫描');
    }
  };

  const openFillPanel = () => {
    setMode('fill');
    setView('work');
    setPanelIntent(input);
    setOpen(true);
    void runFillScan();
  };

  const applyFill = () => {
    const pickedIcons = iconHits.filter((h) => checkedHitIds.has(h.siteId));
    const pickedTags = tagHits.filter((h) => checkedTagHitIds.has(h.siteId));
    for (const h of pickedIcons) store.updateSiteLogo(h.groupId, h.siteId, h.logo);
    for (const h of pickedTags) store.updateSiteTags(h.groupId, h.siteId, mergeTagSuggestion(h.existing, h.tags));
    if (pickedIcons.length > 0 && pickedTags.length > 0) {
      setDoneText(t('ai.fillBothDone', { icons: pickedIcons.length, tags: pickedTags.length }));
    } else if (pickedIcons.length > 0) {
      setDoneText(t('ai.fillDone', { n: pickedIcons.length }));
    } else {
      setDoneText(t('ai.tagDone', { n: pickedTags.length }));
    }
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
    if (!canUseAi()) {
      setPhase('error');
      setStatus(t('ai.dailyLimitReached'));
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
        // 还没有站点时不用烧一次 AI 调用，直接出空方案让用户换句话
        const totalSites = store.data.groups.reduce((n, g) => n + g.sites.length, 0);
        if (totalSites === 0) {
          setPlan({ newGroups: [], moves: [], dropped: 0, totalSites: 0 });
          setMoveEdits([]);
          setNewNames({});
          setPhase('review');
          return;
        }
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
        const messages = buildCollectMessages(intent, store.data.groups);
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
      if (e instanceof Error && e.message === AI_DAILY_LIMIT_ERROR) {
        setPhase('error');
        setStatus(t('ai.dailyLimitReached'));
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
      await callSiteAi(cfg, [{ role: 'user', content: '请只回一个字：好' }], undefined, { countUsage: false });
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
            ? bare
              ? `flex-1 min-w-0 flex flex-wrap items-center gap-2 ${active ? '' : 'hidden'}`
              : `flex-1 min-w-0 rounded-[22px] border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 flex flex-wrap items-center gap-2 ${active ? '' : 'hidden'}`
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
          className={compactBar && bare
            ? 'flex-[1_1_140px] min-w-0 bg-transparent outline-none text-sm placeholder:text-white/30 px-1 py-1.5'
            : `${inputCls} ${compactBar ? 'flex-[1_1_140px] min-w-0' : 'flex-1'}`}
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
            data-site-ai-fill
            onClick={openFillPanel}
            title={t('ai.fillBothNote')}
            className={compactBar ? 'px-2.5 py-1.5 rounded-xl bg-white/8 hover:bg-white/12 text-white/80 text-xs transition-colors shrink-0' : btnGhost}
          >
            {t('ai.fillBoth')}
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
            className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
            onClick={closePanel}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              data-site-ai-panel
 className="rounded-[24px] bg-[#17171d] border border-white/15 w-full max-w-lg max-h-[84vh] flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Sparkles size={15} className="text-indigo-300" />
                  {mode === 'categorize' ? t('ai.categorize') : mode === 'collect' ? t('ai.collectAction') : t('ai.fillBoth')}
                </h3>
                <div className="flex items-center gap-1">
                  {mode !== 'fill' && (
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

              <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0 bg-[#17171d]">
                {/* 今日 AI 剩余次数（每日限额 10 次，只存本机）：面板打开即显示，动作成功后随重渲染刷新 */}
                <p data-ai-daily-remaining className="text-[11px] text-white/40 pt-1 pb-2">
                  {t('ai.dailyRemaining', { n: getAiDailyRemaining(), total: AI_DAILY_LIMIT })}
                </p>
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
                    {mode !== 'fill' && (
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
                    {mode === 'fill' && (
                      <p className="text-[11px] text-white/45 leading-relaxed">{t('ai.fillBothNote')}</p>
                    )}
                    {status && phase !== 'done' && !(phase === 'error' && mode !== 'fill') && <p className="text-[11px] text-white/50">{status}</p>}
                    {phase === 'thinking' && mode === 'fill' && iconProgress && (
                      <p className="text-[11px] text-indigo-300">
                        {fillAiWorking
                          ? t('ai.fillBothAiWorking')
                          : t('ai.fillBothScanning', { done: iconProgress.done, total: iconProgress.total })}
                      </p>
                    )}
                    {phase === 'thinking' && mode !== 'fill' && (
                      <p className="text-[11px] text-indigo-300">AI 正在看你的分组…稍等一下</p>
                    )}
                    {phase === 'error' && mode === 'fill' && (
                      <div className="rounded-xl bg-red-500/10 border border-red-400/30 px-3 py-2">
                        <p className="text-xs text-red-200">{status}</p>
                        <button onClick={() => void runFillScan()} className={`${btnGhost} mt-2`}>
                          {t('ai.fillRescan')}
                        </button>
                      </div>
                    )}
                    {phase === 'error' && mode !== 'fill' && (
                      <div className="rounded-xl bg-red-500/10 border border-red-400/30 px-3 py-2">
                        <p className="text-xs text-red-200">{status}</p>
                        {status !== t('ai.dailyLimitReached') && (
                          <button onClick={run} className={`${btnGhost} mt-2`}>
                            再试一次
                          </button>
                        )}
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
                        {plan.moves.length > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-white/45">
                              已选 {checkedMoves.length}/{moveEdits.length} 站
                            </span>
                            <button
                              type="button"
                              data-site-ai-select-all-moves
                              onClick={() => {
                                if (checkedMoves.length === moveEdits.length) setMoveEdits((prev) => prev.map((m) => ({ ...m, checked: false })));
                                else setMoveEdits((prev) => prev.map((m) => ({ ...m, checked: true })));
                              }}
                              className="text-xs text-indigo-300 hover:text-indigo-200 transition-colors"
                            >
                              {checkedMoves.length === moveEdits.length ? '取消全选' : '全选'}
                            </button>
                          </div>
                        )}
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
                                      className="shrink-0 bg-white/5 border border-white/12 rounded-lg px-1.5 py-1 text-xs outline-none [&>option]:text-black"
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
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-white/45">
                                已选 {checkedUrls.size}/{collect.candidates.length} 个
                              </span>
                              <button
                                type="button"
                                data-site-ai-select-all
                                onClick={() => {
                                  if (checkedUrls.size === collect.candidates.length) setCheckedUrls(new Set());
                                  else setCheckedUrls(new Set(collect.candidates.map((c) => c.url)));
                                }}
                                className="text-xs text-indigo-300 hover:text-indigo-200 transition-colors"
                              >
                                {checkedUrls.size === collect.candidates.length ? '取消全选' : '全选'}
                              </button>
                            </div>
                            <div className="flex flex-col gap-1">
                            {collect.candidates.map((c) => (
                              <div key={c.url} className="flex items-start gap-2 rounded-xl bg-[#1e1e26] border border-white/10 px-2.5 py-2">
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
                          </>
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
                            className="flex-1 bg-white/5 border border-white/12 rounded-xl px-2 py-2 text-xs outline-none [&>option]:text-black"
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

                    {phase === 'review' && mode === 'fill' && (
                      <>
                        {iconHits.length === 0 ? (
                          <>
                            <p className="text-xs text-white/45">
                              {iconNotFound > 0
                                ? t('ai.fillNotFound', { scanned: iconProgress?.total ?? 0, missing: iconNotFound })
                                : t('ai.fillNone')}
                            </p>
                            {iconSkipped > 0 && (
                              <p className="text-[11px] text-white/45">{t('ai.fillSkipped', { skipped: iconSkipped })}</p>
                            )}
                            {iconAiFailed && (
                              <p className="text-[11px] text-amber-200/80">{t('ai.fillAiFallback')}</p>
                            )}
                          </>
                        ) : (
                          <>
                            <p className="text-xs text-white/70">
                              {t('ai.fillFound', { found: iconHits.length, missing: iconNotFound })}
                            </p>
                            {iconSkipped > 0 && (
                              <p className="text-[11px] text-white/45">{t('ai.fillSkipped', { skipped: iconSkipped })}</p>
                            )}
                            {iconAiFailed && (
                              <p className="text-[11px] text-amber-200/80">{t('ai.fillAiFallback')}</p>
                            )}
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
                                    {h.aiSuggested && (
                                      <span className="ml-1 rounded bg-indigo-500/25 px-1 py-px text-[10px] text-indigo-200">
                                        {t('ai.fillAiBadge')}
                                      </span>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    )}

                    {phase === 'review' && mode === 'fill' && (
                      <>
                        {tagHits.length === 0 ? (
                          <>
                            <p className="text-xs text-white/45">
                              {tagNoSuggestion > 0
                                ? t('ai.tagNotFound', { scanned: tagScanned, missing: tagNoSuggestion })
                                : t('ai.tagNone')}
                            </p>
                            {tagAlreadyFull > 0 && (
                              <p className="text-[11px] text-white/45">{t('ai.tagSkipped', { skipped: tagAlreadyFull })}</p>
                            )}
                            {tagAiFailed && (
                              <p className="text-[11px] text-amber-200/80">{t('ai.tagAiFallback')}</p>
                            )}
                          </>
                        ) : (
                          <>
                            <p className="text-xs text-white/70">
                              {t('ai.tagFound', { found: tagHits.length, missing: tagNoSuggestion })}
                            </p>
                            {tagAlreadyFull > 0 && (
                              <p className="text-[11px] text-white/45">{t('ai.tagSkipped', { skipped: tagAlreadyFull })}</p>
                            )}
                            {tagAiFailed && (
                              <p className="text-[11px] text-amber-200/80">{t('ai.tagAiFallback')}</p>
                            )}
                            <div className="flex flex-col gap-1">
                              {tagHits.map((h) => (
                                <div key={h.siteId} className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/10 px-2.5 py-2">
                                  <input
                                    type="checkbox"
                                    data-site-ai-tag-row={h.siteId}
                                    checked={checkedTagHitIds.has(h.siteId)}
                                    onChange={(e) =>
                                      setCheckedTagHitIds((prev) => {
                                        const next = new Set(prev);
                                        if (e.target.checked) next.add(h.siteId);
                                        else next.delete(h.siteId);
                                        return next;
                                      })
                                    }
                                    className="shrink-0 accent-indigo-500"
                                  />
                                  <span className="flex-1 min-w-0 truncate text-xs">
                                    {h.siteName}
                                    <span className="text-white/35">（{h.groupName}）</span>
                                    {h.existing.length > 0 && (
                                      <span className="text-white/35"> 已有 {h.existing.join('、')}</span>
                                    )}
                                    {h.source === 'ai' && (
                                      <span className="ml-1 rounded bg-indigo-500/25 px-1 py-px text-[10px] text-indigo-200">
                                        {t('ai.tagAiBadge')}
                                      </span>
                                    )}
                                  </span>
                                  <span className="flex gap-1 shrink-0">
                                    {h.tags.map((tag) => (
                                      <span key={tag} className={`rounded border px-1 py-px text-[10px] ${siteTagBadgeCls(tag)}`}>
                                        {tag}
                                      </span>
                                    ))}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    )}

                    {phase === 'review' && mode === 'fill' && (
                      <div className="flex flex-col gap-2">
                        {(checkedHitIds.size + checkedTagHitIds.size) > 0 && (
                          <button data-site-ai-apply-fill onClick={applyFill} className={btnPrimary}>
                            {t('ai.fillBothApply', { n: checkedHitIds.size + checkedTagHitIds.size })}
                          </button>
                        )}
                        <button onClick={() => void runFillScan()} className={btnGhost}>
                          {t('ai.fillRescan')}
                        </button>
                      </div>
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
                              if (mode === 'fill') {
                                void runFillScan();
                                return;
                              }
                              setPhase('idle');
                              setPlan(null);
                              setCollect(null);
                              setStatus('');
                            }}
                            className={btnGhost}
                          >
                            {mode === 'fill' ? t('ai.fillRescan') : '再来一句'}
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
