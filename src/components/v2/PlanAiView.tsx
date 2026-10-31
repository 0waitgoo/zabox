import React, { useState } from 'react';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { LocalStore } from '../../store/localStore';
import { useLang } from '../../i18n/useLang';
import { loadAiConfig } from './planAiConfig';
import type { PlanTheme } from '../../plan-app';

/**
 * 桌面版 AI 整理（第 4 轮）：不走网站 /api，直接调设置页里配的接口。
 * 用法：选一个长期计划（或全部）+ 写一句你想怎么整理（比如“拆成每天 30 分钟
 * 能做完的小步骤”）→ 生成小步骤预览 → 点「应用到待办」落库（复用 store 的
 * addSplitResult，与网站 AI 拆分同一落库口径）。
 * 没配口令时提示去设置页，不裸奔请求。
 */
export default function PlanAiView({
  store,
  theme,
  onOpenSettings,
}: {
  store: LocalStore;
  theme: PlanTheme;
  onOpenSettings: () => void;
}) {
  const cfg = loadAiConfig();
  const hasKey = cfg.key.trim().length > 0 && cfg.baseUrl.trim().length > 0 && cfg.model.trim().length > 0;
  const plans = store.data.plans.filter((p) => !p.done);
  const [targetId, setTargetId] = useState<string>('all');
  const [intent, setIntent] = useState('');
  const [steps, setSteps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const { t, lang } = useLang();
  const light = theme === 'light';

  const faint = light ? 'text-zinc-500' : 'text-white/45';
  const inputCls = light
    ? 'w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-indigo-400'
    : 'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-indigo-400';
  const stepItemCls = light
    ? 'flex items-start gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-zinc-800'
    : 'flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90';

  /** 把模型返回解析成步骤清单：优先 JSON 数组，否则按行拆（去序号/项目符号） */
  const parseSteps = (text: string): string[] => {
    const trimmed = text.trim();
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((x) => (typeof x === 'string' ? x.trim() : ''))
          .filter(Boolean)
          .slice(0, 30);
      }
    } catch {
      /* 不是 JSON，走按行拆 */
    }
    return trimmed
      .split('\n')
      .map((line) =>
        line
          .replace(/^\s*(?:\d+[.、)]|[-*•·])\s*/, '')
          .replace(/^\s*["'「『]/, '')
          .replace(/["'」』]\s*$/, '')
          .trim(),
      )
      .filter((line) => line.length > 1)
      .slice(0, 30);
  };

  const generate = async () => {
    if (!hasKey || busy) return;
    setBusy(true);
    setStatus(t('plan.aiStatusGenerating'));
    setSteps([]);
    try {
      const targets =
        targetId === 'all' ? plans : plans.filter((p) => p.id === targetId);
      const planDesc =
        targets.length > 0
          ? targets
              .map((p) => {
                if (p.mode === 'count') {
                  return `「${p.title}」（次数型，目标 ${p.targetCount ?? 0}${p.unit ?? '次'}，已完成 ${p.currentCount ?? 0}）`;
                }
                return `「${p.title}」（日期型，截止 ${p.deadline ?? '未定'}）`;
              })
              .join('\n')
          : '（暂无进行中的长期计划）';
      const userPrompt = `长期计划：\n${planDesc}\n\n用户的意思：${intent.trim() || '把大计划拆成容易实现的小步骤'}\n\n请把上面的大计划拆成一步就能动手的小步骤，每步一句话、具体可执行。只返回步骤清单，不要解释、不要寒暄。优先返回 JSON 字符串数组，例如 ["步骤一", "步骤二"]；如果不用 JSON，每行一个步骤。`;
      const res = await tauriFetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.key.trim()}`,
        },
        body: JSON.stringify({
          model: cfg.model.trim(),
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content:
                '你是计划教练，擅长把大计划拆成小步骤。每步一句话、具体可执行，只返回步骤清单，不要解释。',
            },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const detail = errText ? (lang === 'en' ? ` (${errText.slice(0, 80)})` : `（${errText.slice(0, 80)}）`) : '';
        setStatus(t('plan.aiStatusHttp', { status: res.status, detail }));
        return;
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content ?? '';
      const parsed = parseSteps(content);
      if (parsed.length === 0) {
        setStatus(t('plan.aiStatusNoSteps'));
        return;
      }
      setSteps(parsed);
      setStatus(t('plan.aiStatusGenerated', { n: parsed.length }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(t('plan.aiStatusNetwork', { msg: msg.replace(/\s+/g, ' ').slice(0, 60) }));
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    const list = steps.map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return;
    store.addSplitResult(list, []);
    setSteps([]);
    setStatus(t('plan.aiStatusApplied', { n: list.length }));
  };

  if (!hasKey) {
    return (
      <div className="flex flex-col gap-3 px-1 py-1">
        <h2 className={`text-base font-medium ${light ? 'text-zinc-900' : 'text-white'}`}>{t('ai.title')}</h2>
        <p className={`text-sm ${faint}`}>
          {t('plan.aiNoKey')}
        </p>
        <div>
          <button
            type="button"
            onClick={onOpenSettings}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-indigo-500 hover:bg-indigo-400 text-white transition-colors"
          >
            {t('plan.aiGoSettings')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-1 py-1">
      <h2 className={`text-base font-medium ${light ? 'text-zinc-900' : 'text-white'}`}>{t('ai.title')}</h2>
      <label className="flex flex-col gap-1.5">
        <span className={`text-xs ${faint}`}>{t('plan.aiWhichPlan')}</span>
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className={inputCls}
        >
          <option value="all">{t('plan.aiAllPlans')}</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={`text-xs ${faint}`}>{t('plan.aiHowOrganize')}</span>
        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          rows={3}
          placeholder={t('plan.aiIntentPlaceholder')}
          className={`${inputCls} resize-none`}
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy}
          className="shrink-0 px-4 py-1.5 rounded-lg text-xs font-medium bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white transition-colors"
        >
          {busy ? t('plan.aiGenerating') : t('plan.aiGenerate')}
        </button>
        {status && <span className={`text-xs ${faint}`}>{status}</span>}
      </div>
      {steps.length > 0 && (
        <div className="flex flex-col gap-2">
          {steps.map((s, i) => (
            <div key={`${i}-${s}`} className={stepItemCls}>
              <span className={`shrink-0 tabular-nums ${faint}`}>{i + 1}.</span>
              <span className="flex-1 min-w-0">{s}</span>
              <button
                type="button"
                title={t('plan.aiRemoveStep')}
                onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                className={`shrink-0 ${faint} hover:text-red-500`}
              >
                ✕
              </button>
            </div>
          ))}
          <div>
            <button
              type="button"
              onClick={apply}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-500 hover:bg-emerald-400 text-white transition-colors"
            >
              {t('plan.aiApplyToTodos')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
