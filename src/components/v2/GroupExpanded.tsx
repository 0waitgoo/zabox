import React, { useRef, useState } from 'react';
import { Pin, Plus, Check, X, RefreshCw, Upload, Trash2 } from 'lucide-react';
import { LETTER_ICON_COLORS, SITE_TAG_MAX, SITE_TAGS_MAX_COUNT, cleanSiteTag, cleanSiteTags, letterIconDataUri, siteIconSrc, siteLogoFallback, siteTags, sortSites, type NavGroup, type SiteEntry } from '../../data/groups';
import { logoForSite, type LocalStore, type SiteDraft } from '../../store/localStore';
import { useLang } from '../../i18n/useLang';
import { SiteLogo } from './Card';
import SiteContextMenu, { siteMenuPosition, type SiteMenuState } from './SiteContextMenu';
import { SITE_DRAG_PLACEHOLDER_STYLE, useSiteDragSort } from './useSiteDragSort';
import SwipeableRow from './SwipeableRow';
import SitePoolPicker from './SitePoolPicker';

/** 站点名称 / 说明的长度上限（第十六轮⑦）：表单 maxLength + 计数，保存时再硬截断兜底 */
export const SITE_NAME_MAX = 20;
export const SITE_DESC_MAX = 40;

/**
 * 站点标签预设与配色（第三十九轮）：三个写死预设 + 自定义标签。
 * 预设值落盘为大写（VPN / APP / MARK），按钮文字用 VPN / App / Mark；
 * 徽标与表单预设按钮共用同一套色（底/字/边同色系半透明），自定义标签走灰色。
 * 所有渲染 tag 徽标的地方（B 卡收起/展开行、弹窗瓷砖）都经 SiteTagBadges 走 siteTagBadgeCls，不要各处写死颜色。
 * 第七十六轮起每站最多 2 个标签（tags 数组），徽标一律紧贴站点名之后展示。
 */
export const SITE_TAG_PRESETS = [
  {
    value: 'VPN',
    label: 'VPN',
    badgeCls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
    btnCls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/20',
    btnActiveCls: 'bg-emerald-500/35 text-emerald-100 border-emerald-300',
  },
  {
    value: 'APP',
    label: 'App',
    badgeCls: 'bg-blue-500/15 text-blue-400 border-blue-500/40',
    btnCls: 'bg-blue-500/10 text-blue-400 border-blue-500/40 hover:bg-blue-500/20',
    btnActiveCls: 'bg-blue-500/35 text-blue-100 border-blue-300',
  },
  {
    value: 'MARK',
    label: 'Mark',
    badgeCls: 'bg-rose-500/15 text-rose-400 border-rose-500/40',
    btnCls: 'bg-rose-500/10 text-rose-400 border-rose-500/40 hover:bg-rose-500/20',
    btnActiveCls: 'bg-rose-500/35 text-rose-100 border-rose-300',
  },
] as const;

/** 按 tag 值（已大写归一化）取徽标配色类：预设三色，其余一律灰色 */
export function siteTagBadgeCls(tag: string): string {
  return SITE_TAG_PRESETS.find((p) => p.value === tag)?.badgeCls ?? 'bg-white/10 text-white/40 border-white/15';
}

/** 站点行小徽标（第二十六轮，第三十九轮按值配色，第七十六轮多标签）：
 * 文本 = 站点 tags（已归一化落盘，最多 2 个），逐个按值配色，无标签不显示 */
export function SiteTagBadges({ site }: { site: SiteEntry }) {
  const tags = siteTags(site);
  if (!tags.length) return null;
  return (
    <>
      {tags.map((tag) => (
        <span key={tag} data-site-tag={tag} className={`text-[8px] font-bold border px-1.5 py-0.5 rounded shrink-0 ${siteTagBadgeCls(tag)}`}>
          {tag}
        </span>
      ))}
    </>
  );
}

/** 网址输入自动补协议 */
export function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return url;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return url;
  return `https://${url}`;
}

const inputCls =
  'w-full bg-white/5 border border-white/12 rounded-xl px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400/50 placeholder:text-white/30';

/**
 * 上传图片 → 方形小图标 data URL（第四十九轮）：中心裁方、最长边 ≤128px；
 * PNG 体积 >60KB 时转 JPEG（白底垫底防透明区变黑），仍过大再缩到 96px。
 * 图标会随站点数据一起同步，必须压小，别把原图塞进数据里。
 */
async function compressIconImage(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    const canvas = document.createElement('canvas');
    const render = (size: number, jpeg: boolean): string => {
      canvas.width = size;
      canvas.height = size;
      const cx = canvas.getContext('2d');
      if (!cx) return '';
      if (jpeg) {
        cx.fillStyle = '#ffffff';
        cx.fillRect(0, 0, size, size);
      }
      cx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
      return jpeg ? canvas.toDataURL('image/jpeg', 0.87) : canvas.toDataURL('image/png');
    };
    let out = render(Math.min(128, side), false);
    if (out.length > 60000) out = render(Math.min(128, side), true);
    if (out.length > 60000) out = render(96, true);
    bitmap.close();
    return out || null;
  } catch {
    return null;
  }
}

/** 添加 / 编辑网站的内联表单 */
export function SiteForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: SiteEntry;
  onSubmit: (draft: SiteDraft) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const { t } = useLang();
  // 标签初值（第七十六轮多选）：既有 tags 优先（siteTags 兼容迁移前的旧单字段）；
  // 老站点只有 needVpn 标记时预填 VPN，保存即正式写入 tags
  const [tags, setTags] = useState<string[]>(() => {
    const existing = initial ? siteTags(initial) : [];
    return existing.length ? existing : initial?.needVpn ? ['VPN'] : [];
  });
  // 自定义标签输入只是待添加草稿：回车 / 失焦 / 保存时并入 tags（沿用第二十六轮「输完即是标签」的手感）
  const [customTag, setCustomTag] = useState('');
  const tagsFull = tags.length >= SITE_TAGS_MAX_COUNT;
  const commitCustomTag = () => {
    const t = cleanSiteTag(customTag);
    setCustomTag('');
    if (t && !tags.includes(t) && tags.length < SITE_TAGS_MAX_COUNT) {
      setTags((prev) => (prev.includes(t) || prev.length >= SITE_TAGS_MAX_COUNT ? prev : [...prev, t]));
    }
  };
  const toggleTag = (value: string) => {
    setTags((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : prev.length < SITE_TAGS_MAX_COUNT ? [...prev, value] : prev,
    );
  };
  const [pinned, setPinned] = useState(!!initial?.pinned);
  const [error, setError] = useState('');
  /* 图标编辑（第四十九轮）：三态初值取站点既有配置（存量站点无字段 = auto）；
     autoLogo 只在用户点了「重新检索」时才有值，代表按当前名称/网址重取的自动图标 */
  const [iconMode, setIconMode] = useState<'auto' | 'text' | 'upload'>(initial?.iconMode ?? 'auto');
  const [iconText, setIconText] = useState(initial?.iconText ?? '');
  const [iconImage, setIconImage] = useState(initial?.iconImage ?? '');
  // 文字图标底色（空 = 按文字自动取色，与 groups.ts 的哈希取色一致；存量 popup 选过的色直接回显）
  const [iconColor, setIconColor] = useState(initial?.iconColor ?? '');
  const [autoLogo, setAutoLogo] = useState('');
  const iconTextComposing = useRef(false);
  const iconFileRef = useRef<HTMLInputElement>(null);

  // 大预览实时反映当前模式：upload 用图、text 用字母图、auto 用（重取过的或既有的）自动图标
  const previewSrc =
    iconMode === 'upload' && iconImage
      ? iconImage
      : iconMode === 'text' && iconText.trim()
        ? letterIconDataUri(iconText.trim(), iconColor || undefined)
        : autoLogo || initial?.logo || logoForSite(name.trim() || '站点', normalizeUrl(url) || 'https://example.com');

  const submit = () => {
    const finalUrl = normalizeUrl(url);
    if (!name.trim()) return setError(t('menu.formErrorName'));
    if (!finalUrl || !finalUrl.includes('.')) return setError(t('menu.formErrorUrl'));
    if (iconMode === 'text' && ![...iconText.trim()].length) return setError(t('menu.formErrorIconText'));
    if (iconMode === 'upload' && !iconImage) return setError(t('menu.formErrorIconImage'));
    // auto 模式保存时始终按当前名称/网址重取一次：预览的最后兜底就是这条地址，
    // 保存带上它，预览与落盘才一致（否则存量旧 logo 会把预览的好图标顶掉，出现“预览有标、保存无效”）；
    // 名称/网址变了又没手动重检索时同样重取（与改版前每次保存重算图标的老行为一致）
    const identityChanged = !!initial && (name.trim() !== initial.name || finalUrl !== initial.url);
    // 标签：已选列表 + 输入框里还没回车的自定义草稿（有空位才并入），统一清洗封顶 2 个
    const pendingCustom = cleanSiteTag(customTag);
    const finalTags = cleanSiteTags(pendingCustom && !tags.includes(pendingCustom) ? [...tags, pendingCustom] : tags);
    onSubmit({
      // 保存时硬截断兜底：即使输入绕过了 maxLength（如程序填充）也不会存入超长文本
      name: name.trim().slice(0, SITE_NAME_MAX),
      url: finalUrl,
      description: description.trim().slice(0, SITE_DESC_MAX),
      // 别名（第二十六轮）：表单不再提供编辑入口，但既有别名数据原样回传保留，继续供搜索直达
      aliases: [...(initial?.aliases ?? [])],
      pinned,
      tags: finalTags,
      iconMode,
      iconText: iconText.trim(),
      iconColor,
      iconImage,
      autoLogo: autoLogo || (iconMode === 'auto' || identityChanged ? logoForSite(name.trim(), finalUrl) : ''),
    });
  };

  return (
    <div className="rounded-2xl bg-indigo-500/[0.07] border border-indigo-300/20 p-3 flex flex-col gap-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="relative">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('menu.formNamePlaceholder')}
            maxLength={SITE_NAME_MAX}
            className={`${inputCls} pr-11`}
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/30 pointer-events-none">
            {name.length}/{SITE_NAME_MAX}
          </span>
        </div>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('menu.formUrlPlaceholder')} className={inputCls} />
      </div>
      <div className="relative">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('menu.formDescPlaceholder')}
          maxLength={SITE_DESC_MAX}
          className={`${inputCls} pr-11`}
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/30 pointer-events-none">
          {description.length}/{SITE_DESC_MAX}
        </span>
      </div>
      {/* 图标编辑（第四十九轮）：大预览 + 三种来源切换（自动检索 / 文字 / 上传图片），保存才落盘 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="site-icon-frame w-10 h-10 rounded-xl bg-white flex items-center justify-center overflow-hidden shrink-0">
          <img
            src={previewSrc}
            alt=""
            data-icon-preview
            className="w-7 h-7 object-contain"
            onError={(e) => {
              const t = e.target as HTMLImageElement;
              if (!t.src.startsWith('data:')) t.src = siteLogoFallback(name || '站点');
            }}
          />
        </span>
        <span className="flex items-center rounded-lg bg-white/5 border border-white/10 overflow-hidden shrink-0">
          {(
            [
              ['auto', t('menu.formIconAuto')],
              ['text', t('menu.formIconText')],
              ['upload', t('menu.formIconUpload')],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              data-icon-mode={m}
              onClick={() => setIconMode(m)}
              className={`text-[11px] px-2.5 py-1.5 transition-colors ${
                iconMode === m ? 'bg-indigo-500/70 text-white font-medium' : 'text-white/50 hover:text-white/85'
              }`}
            >
              {label}
            </button>
          ))}
        </span>
        {iconMode === 'auto' && (
          <button
            type="button"
            data-icon-refetch
            onClick={() => setAutoLogo(logoForSite(name.trim() || '站点', normalizeUrl(url) || 'https://example.com'))}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-white/8 hover:bg-white/12 text-white/70 transition-colors shrink-0"
          >
            <RefreshCw size={11} /> {t('menu.formRefetch')}
          </button>
        )}
        {iconMode === 'text' && (
          <input
            value={iconText}
            // 输入法组词期间不截断（2026-10-29 用户反馈：每击必截会打断组词，
            // 3 个字母以上的拼音根本输不进去）；组词结束后再限 2 字
            onCompositionStart={() => {
              iconTextComposing.current = true;
            }}
            onCompositionEnd={(e) => {
              iconTextComposing.current = false;
              setIconText([...e.currentTarget.value].slice(0, 2).join(''));
            }}
            onChange={(e) => {
              const v = e.target.value;
              setIconText(iconTextComposing.current ? v : [...v].slice(0, 2).join(''));
            }}
            placeholder={t('menu.formIconTextPlaceholder')}
            data-icon-text
            className="w-28 shrink-0 bg-white/5 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs outline-none focus:border-white/40 placeholder:text-white/30"
          />
        )}
        {iconMode === 'upload' && (
          <>
            <button
              type="button"
              data-icon-upload
              onClick={() => iconFileRef.current?.click()}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-white/8 hover:bg-white/12 text-white/70 transition-colors shrink-0"
            >
              <Upload size={11} /> {iconImage ? t('menu.formChangeImage') : t('menu.formChooseImage')}
            </button>
            <input
              ref={iconFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  void compressIconImage(f).then((dataUrl) => {
                    if (dataUrl) setIconImage(dataUrl);
                    else setError(t('menu.formErrorImageRead'));
                  });
                }
                e.target.value = '';
              }}
            />
            {iconImage && (
              <span className="text-[10px] text-emerald-300 shrink-0">{t('menu.formCompressed', { kb: Math.max(1, Math.round(iconImage.length / 1024)) })}</span>
            )}
          </>
        )}
      </div>
      {/* 文字图标底色：仅 text 模式显示；色板与自动取色同源（LETTER_ICON_COLORS），空 = 自动 */}
      {iconMode === 'text' && (
        <div className="flex items-center gap-1.5 flex-wrap" data-icon-colors>
          <span className="text-[11px] text-white/50">{t('menu.formIconBg')}</span>
          {LETTER_ICON_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              data-icon-color={c}
              title={c}
              aria-label={c}
              onClick={() => setIconColor(c)}
              className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 ${
                iconColor === c ? 'border-indigo-400 ring-2 ring-indigo-400/50' : 'border-white/20'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <button
            type="button"
            data-icon-color-auto
            title={t('menu.formIconBgAuto')}
            aria-label={t('menu.formIconBgAuto')}
            onClick={() => setIconColor('')}
            className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 ${
              iconColor === '' ? 'border-indigo-400 ring-2 ring-indigo-400/50' : 'border-white/20'
            }`}
            style={{ background: 'conic-gradient(#f87171, #facc15, #4ade80, #38bdf8, #a78bfa, #f87171)' }}
          />
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {/* 标签（第二十六轮；第三十九轮预设配色；第七十六轮改多选、最多 2 个）：自定义输入（灰色系，
            规则不变：仅英文字母、自动转大写、最多 4 个，回车/失焦并入已选）+ 三个写死预设按钮
            （VPN 绿 / App 蓝 / Mark 红，与徽标同色）。点预设 = 勾选/取消；选满 2 个后其余预设与
            输入框禁用并给提示；已选的自定义标签以灰色小片呈现、点 × 移除（腾出位置可再选）。 */}
        <input
          value={customTag}
          onChange={(e) => setCustomTag(cleanSiteTag(e.target.value))}
          onBlur={commitCustomTag}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitCustomTag();
            }
          }}
          placeholder={t('menu.formCustomTagPlaceholder')}
          maxLength={SITE_TAG_MAX}
          disabled={tagsFull}
          data-site-tag-input
          className="w-32 shrink-0 bg-white/5 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs outline-none focus:border-white/40 placeholder:text-white/30 disabled:opacity-40 disabled:cursor-not-allowed"
        />
        {SITE_TAG_PRESETS.map((p) => {
          const active = tags.includes(p.value);
          const blocked = !active && tagsFull;
          return (
            <button
              key={p.value}
              type="button"
              data-tag-preset={p.value}
              data-active={active ? 'true' : undefined}
              disabled={blocked}
              onClick={() => toggleTag(p.value)}
              className={`shrink-0 text-[11px] font-semibold px-2.5 py-1.5 rounded-xl border transition-colors ${p.btnCls} ${
                active ? p.btnActiveCls : ''
              } ${blocked ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {p.label}
            </button>
          );
        })}
        {tags
          .filter((tag) => !SITE_TAG_PRESETS.some((p) => p.value === tag))
          .map((tag) => (
            <span
              key={tag}
              data-custom-tag-chip={tag}
              className="flex items-center gap-1 shrink-0 text-[11px] font-semibold px-2 py-1.5 rounded-xl border bg-white/10 text-white/70 border-white/25"
            >
              {tag}
              <button
                type="button"
                aria-label={t('menu.formRemoveTag', { tag })}
                onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                className="text-white/50 hover:text-white"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        {tagsFull && (
          <span data-tag-limit-hint className="text-[10px] text-white/35 shrink-0">
            {t('menu.formTagLimit')}
          </span>
        )}
        <label className="flex items-center gap-1.5 text-[11px] text-white/60 shrink-0 cursor-pointer select-none ml-auto">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="accent-amber-400" />
          {t('menu.formPinned')}
        </label>
      </div>
      {error && <p className="text-[11px] text-red-300">{error}</p>}
      <div className="flex items-center gap-2 pt-0.5">
        <button onClick={submit} className="flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-indigo-500/80 hover:bg-indigo-500 text-white transition-colors">
          <Check size={12} /> {t('menu.save')}
        </button>
        <button onClick={onCancel} className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/12 text-white/70 transition-colors">
          <X size={12} /> {t('menu.cancel')}
        </button>
      </div>
    </div>
  );
}

/**
 * 展开态里的一行站点：点击打开站点；编辑 / 删除改走右键菜单（第十六轮追加，
 * 悬停不再冒出铅笔/垃圾桶图标）。编辑态由父级控制（菜单点「编辑」后进入）。
 * 编辑模式（标题行开关）时：点击行改开编辑表单、行尾出垃圾桶一键删除。
 */
function EditableSiteRow({
  site,
  groupId,
  store,
  editing,
  onEndEdit,
  onSiteMenu,
  formSpanCls,
  dragging = false,
  guardClick,
  editMode = false,
  onEditSite,
}: {
  site: SiteEntry;
  groupId: string;
  store: LocalStore;
  editing: boolean;
  onEndEdit: () => void;
  onSiteMenu: (e: React.MouseEvent, site: SiteEntry) => void;
  /** 编辑表单在网格中的跨列类（3 列布局时跨满 3 列） */
  formSpanCls: string;
  /** 组内拖动排序（第三十八轮）：本行是否为被拖行（原位占位样式） */
  dragging?: boolean;
  /** 点击守卫：刚拖完时吞掉紧随的 click，避免顺带打开站点 */
  guardClick?: () => boolean;
  /** 编辑模式：行点击开编辑、行尾出垃圾桶 */
  editMode?: boolean;
  /** 编辑模式下行点击：打开该站点的编辑表单 */
  onEditSite?: () => void;
}) {
  const { t } = useLang();
  if (editing) {
    return (
      <div className={formSpanCls}>
        <SiteForm
          initial={site}
          onSubmit={(draft) => {
            store.updateSite(groupId, site.id!, draft);
            onEndEdit();
          }}
          onCancel={onEndEdit}
        />
      </div>
    );
  }

  return (
    <div
      data-site-row={site.name}
      data-site-drag-id={site.id}
      style={dragging ? SITE_DRAG_PLACEHOLDER_STYLE : undefined}
      onContextMenu={(e) => onSiteMenu(e, site)}
      className="flex items-center gap-2.5 px-2 py-[7px] rounded-2xl hover:bg-white/6 transition-colors relative"
    >
      <button
        onClick={() => {
          if (guardClick?.()) return;
          // 编辑模式：行点击开编辑表单，不打开网站
          if (editMode) {
            onEditSite?.();
            return;
          }
          window.open(site.url, '_blank');
        }}
        className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
      >
        <SiteLogo logo={siteIconSrc(site)} name={site.name} url={site.url} size={34} imgSize={23} grayscale={site.dead} />
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className={`text-[13px] font-semibold truncate min-w-0 ${site.dead ? 'text-white/45' : ''}`}>{site.name}</span>
            {site.pinned && <Pin size={11} className="text-amber-400 fill-amber-400 shrink-0" />}
            {/* 标签徽标（第七十六轮）：从行尾挪到名字正后方、与图钉同区，最多 2 个 */}
            <SiteTagBadges site={site} />
            {site.dead && (
              <span className="text-[9px] font-medium text-red-300 bg-red-500/15 px-1.5 py-0.5 rounded shrink-0">{t('menu.dead')}</span>
            )}
          </span>
          <span className="block text-[11px] text-white/45 truncate mt-0.5">{site.description}</span>
        </span>
      </button>
      {editMode && (
        <button
          type="button"
          data-site-delete
          title={t('menu.delete')}
          aria-label={`${t('menu.delete')}${site.name}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (site.id) store.deleteSite(groupId, site.id);
          }}
          className="shrink-0 p-1.5 rounded-lg text-white/40 hover:text-red-300 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * B 型列表卡的展开态主体：卡内可滚动的行式列表 + 添加网站。
 * 组操作（改名/删组/切形态/失效提示）第十二轮起上移到 GroupListCard 的标题行，与组名同一行。
 * 只有 B 卡在主页原地展开；C 卡走 GroupPanel 弹窗，不用这里。
 * 列数（第二十八轮修订）：展开态站点网格恒为 3 列，不随卡片宽度设置（1 栏/2 栏）变化
 * （第十六轮⑥曾按 colSpan 分档 3/2 列，用户实测 1 栏宽展开只有 2 列太空，改恒 3 列）；
 * 收起态列数在 GroupListCard 里另行按宽度走，不受此处影响。
 * 站点行操作（第十六轮⑤）：悬停无图标，右键弹站点菜单（打开/编辑/删除），编辑态由这里控制。
 */
export default function GroupExpandedBody({
  group,
  store,
  editRequestId,
  onEditRequestDone,
  editMode = false,
}: {
  group: NavGroup;
  store: LocalStore;
  /** 兼容既有调用方传参：展开态列数已恒为 3 列，不再使用此值 */
  colSpan?: 1 | 2;
  /** 收起态行左滑「编辑」的直达请求（第七十三轮）：展开挂载后打开该站点的编辑表单，随即回调清空 */
  editRequestId?: string | null;
  onEditRequestDone?: () => void;
  /** 编辑模式（标题行开关）：行点击改开编辑表单、每行行尾出垃圾桶一键删除 */
  editMode?: boolean;
}) {
  const [addMode, setAddMode] = useState<'choice' | 'custom' | 'pool' | null>(null);
  const [menu, setMenu] = useState<SiteMenuState | null>(null);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  /** 左滑操作条当前打开的行（第七十三轮）：同列表只开一行 */
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null);
  const { t } = useLang();

  // 收起态左滑「编辑」直达：展开体挂载（或请求变更）时打开对应站点的编辑表单
  React.useEffect(() => {
    if (!editRequestId) return;
    setEditingSiteId(editRequestId);
    onEditRequestDone?.();
  }, [editRequestId, onEditRequestDone]);
  const sorted = sortSites(group.sites);
  /** 组内拖动排序（第三十八轮）：行网格内拖动换位，置顶区/普通区不跨区；
   * 本区在 data-nodrag 滚动区内，按下不会触发整卡拖拽排序，两套手势互不干扰。
   * 展开态拖出本组：配 groupId + onMoveToGroup，指针拖出源卡片即转跨组（见 useSiteDragSort）。 */
  const siteDrag = useSiteDragSort({
    sites: sorted,
    onReorder: (ids) => store.reorderSites(group.id, ids),
    groupId: group.id,
    onMoveToGroup: (siteId, targetGroupId) => store.moveSite(group.id, siteId, targetGroupId),
  });

  const handleSiteMenu = (e: React.MouseEvent, site: SiteEntry) => {
    // 只出站点菜单：阻止冒泡到卡片包装层（否则会同时弹出卡的尺寸菜单），并屏蔽浏览器默认菜单
    e.preventDefault();
    e.stopPropagation();
    setMenu({ ...siteMenuPosition(e), site });
  };

  return (
    /* 展开体内点击只做组内操作（加站/开站点等），不冒泡到卡片触发收起 */
    <div className="flex-1 min-h-0 flex flex-col" onClick={(e) => e.stopPropagation()}>
      {/* 站点列表：卡内滚动（data-nodrag：此区域内按下拖动不触发整卡拖拽排序） */}
      <div data-nodrag className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
        {sorted.length === 0 && !addMode && (
          <p className="text-xs text-white/35 py-6 text-center">{t('menu.emptyGroupExpanded')}</p>
        )}
        <div
          className="grid grid-cols-1 gap-x-2 content-start min-[480px]:grid-cols-3"
          data-expanded-grid
          data-cross-source
          onPointerDownCapture={(e) => {
            // 左滑操作条开着时，按到该行之外（别行/空白/加站格）先收起（第七十三轮）
            if (!swipeOpenId) return;
            const row = (e.target as HTMLElement).closest('[data-swipe-row]');
            if (!row || row.getAttribute('data-swipe-row') !== swipeOpenId) setSwipeOpenId(null);
          }}
          onPointerDown={siteDrag.onContainerPointerDown}
          onDragStart={siteDrag.onContainerDragStart}
        >
          {siteDrag.items.map((site) => (
            <React.Fragment key={site.id ?? site.name}>
              {editingSiteId !== null && editingSiteId === site.id ? (
                <EditableSiteRow
                  site={site}
                  groupId={group.id}
                  store={store}
                  editing
                  onEndEdit={() => setEditingSiteId(null)}
                  onSiteMenu={handleSiteMenu}
                  formSpanCls="col-span-1 min-[480px]:col-span-3"
                  dragging={siteDrag.isDragging(site)}
                  guardClick={siteDrag.consumeSuppressClick}
                />
              ) : (
                /* 左滑露出编辑/删除（第七十三轮）：与组内拖拽排序靠方向仲裁共存——
                   横向占优归左滑（捕获阶段截断 move，排序 pending 不激活），纵向归排序/滚动 */
                <SwipeableRow
                  rowKey={site.id ?? site.name}
                  openKey={swipeOpenId}
                  onOpenKeyChange={setSwipeOpenId}
                  gestureLock={siteDrag.isCrossActive}
                  onDragEscape={(x, y) => siteDrag.activateCrossNow(x, y)}
                  onEdit={() => setEditingSiteId(site.id ?? null)}
                  onDelete={() => {
                    if (site.id) store.deleteSite(group.id, site.id);
                  }}
                >
                  {(swipeGuard) => (
                    <EditableSiteRow
                      site={site}
                      groupId={group.id}
                      store={store}
                      editing={false}
                      onEndEdit={() => setEditingSiteId(null)}
                      onSiteMenu={handleSiteMenu}
                      formSpanCls="col-span-1 min-[480px]:col-span-3"
                      dragging={siteDrag.isDragging(site)}
                      guardClick={() => siteDrag.consumeSuppressClick() || swipeGuard()}
                      editMode={editMode}
                      onEditSite={() => setEditingSiteId(site.id ?? null)}
                    />
                  )}
                </SwipeableRow>
              )}
            </React.Fragment>
          ))}
          {/* 加站格子：紧跟最后一个站点，与站点行同尺寸的虚线框（唯一的加站入口）；
              点开先二选一：自定义（手动输名称网址）/ 在杂盒里找（导航池多选加入） */}
          {!addMode && (
            <button
              onClick={() => setAddMode('choice')}
              className="flex items-center justify-center gap-1 px-2 py-[7px] min-h-[48px] rounded-2xl border border-dashed border-white/15 text-[11px] text-white/50 hover:text-white/85 hover:border-white/30 transition-colors"
            >
              <Plus size={13} /> {t('menu.addSiteChoice')}
            </button>
          )}
        </div>
        {addMode === 'choice' && (
          <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                data-add-choice-custom
                onClick={() => setAddMode('custom')}
                className="rounded-xl border border-white/10 bg-white/[0.03] hover:border-white/25 px-3 py-2.5 text-left transition-colors"
              >
                <span className="block text-[12px] font-medium">{t('menu.addCustom')}</span>
                <span className="block text-[11px] text-white/40 mt-0.5">{t('menu.addCustomDesc')}</span>
              </button>
              <button
                data-add-choice-pool
                onClick={() => setAddMode('pool')}
                className="rounded-xl border border-indigo-400/40 bg-indigo-500/10 hover:border-indigo-400/70 px-3 py-2.5 text-left transition-colors"
              >
                <span className="block text-[12px] font-medium">{t('menu.findInBox')}</span>
                <span className="block text-[11px] text-white/40 mt-0.5">{t('menu.addPoolDesc')}</span>
              </button>
            </div>
            <button
              onClick={() => setAddMode(null)}
              className="mt-2 w-full py-1.5 rounded-xl bg-white/10 text-[12px] text-white/70 hover:text-white transition-colors"
            >
              {t('menu.cancel')}
            </button>
          </div>
        )}
        {addMode === 'custom' && (
          <div className="mt-2">
            <SiteForm
              onSubmit={(draft) => {
                store.addSite(group.id, draft);
                setAddMode(null);
              }}
              onCancel={() => setAddMode('choice')}
            />
          </div>
        )}
        {addMode === 'pool' && (
          <SitePoolPicker
            group={group}
            onAdd={(sites) => {
              // 池子条目直转 SiteDraft：图标用池子自带 logo（品牌图或各站 favicon），
              // VPN 标记转标签；一次加多个，顺序按池子原顺序
              for (const s of sites) {
                store.addSite(group.id, {
                  name: s.name,
                  url: s.url,
                  description: s.description,
                  aliases: [],
                  pinned: false,
                  tags: s.needVpn ? ['VPN'] : [],
                  iconMode: 'auto',
                  iconText: '',
                  iconColor: '',
                  iconImage: '',
                  autoLogo: s.logo,
                });
              }
              setAddMode(null);
            }}
            onBack={() => setAddMode('choice')}
            onClose={() => setAddMode(null)}
          />
        )}
      </div>

      {/* 组内拖动排序的浮动快照（第三十八轮） */}
      {siteDrag.dragLayer}

      {/* 站点右键菜单（打开/编辑/删除）：渲染在滚动区之外，fixed 定位不被裁剪 */}
      {menu && (
        <SiteContextMenu
          state={menu}
          onClose={() => setMenu(null)}
          onOpen={(site) => window.open(site.url, '_blank')}
          onEdit={(site) => setEditingSiteId(site.id ?? null)}
          onDelete={(site) => {
            if (site.id) store.deleteSite(group.id, site.id);
          }}
        />
      )}
    </div>
  );
}
