/**
 * 中英文文案字典（2026-10-31 第一轮）：
 * - 语言只存本机 localStorage（`zabox-lang`），与显示偏好同口径：不进 store、不参与
 *   JSON 导出/导入、不随云同步走，换设备各设各的；
 * - 用户数据（站点名、编组名、计划任务文字、备注）一律不翻译，只翻界面文案；
 * - 取词缺英文时回落中文、缺中文时回落 key，界面永不空白。
 * 新增文案时先在这里加 zh/en 两条，再在组件里用 t('key') 取。
 */

export type Lang = 'zh' | 'en';

export const LANG_STORAGE_KEY = 'zabox-lang';

export function loadLang(): Lang {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY) === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // 隐私模式等写盘失败时只影响本次会话的记忆，下次打开回落中文
  }
}

type Dict = Record<string, string>;

const zh: Dict = {
  'topbar.homeTitle': '杂盒 ZaBox · 回到主页',
  'topbar.navAi': 'AI 导航',
  'topbar.lang': '切换语言',
  'topbar.modeAria': '顶栏模式：搜索或 AI 整理',
  'topbar.searchMode': '搜索模式',
  'topbar.searchTitle': '搜索网站、编组（⌘K）',
  'topbar.search': '搜索',
  'topbar.aiMode': 'AI 整理模式',
  'topbar.aiTitle': 'AI 整理：一键分类 / 搜集网站',
  'topbar.aiOrganize': '整理',
  'search.aria': '搜索网站和编组',
  'search.placeholder': '搜索网站、编组…试试拼音首字母或别名，如 db / gpt',
  'search.resultsAria': '搜索结果',
  'search.empty': '没有找到相关站点或编组',
  'search.groupsHeading': '编组',
  'search.sitesInGroup': '{n} 个站点 · 点击展开编组',
  'search.sitesHeading': '站点 · 回车按语言搜网页',
  'search.invalid': '失效',
  'search.clear': '清除',
  'search.alias': '别名 · {alias}',
  'search.webHeading': '网页搜索',
  'search.searchOn': '在{engine}中搜索“{q}”',
  'search.defaultEngine': '默认',
  'card.siteCount': '{n} 个站点',
  'card.emptyStack': '点开添加第一个网站',
  'card.groupLabel': '{name} 编组',
  'ai.title': 'AI 整理',
  'ai.placeholder': '一句话，让 AI 帮你整理网站… 比如：把 AI 绘画的网站归到一组 / 找几个免费商用图库',
  'ai.categorize': '一键分类',
  'ai.collect': '搜集网站',
  'ai.collectAction': '一键搜集网站',
  'ai.settingsTitle': 'AI 设置（服务商与口令，只存本机）',
  'ai.settings': 'AI 设置',
  'ai.fillIcons': '补图标',
  'ai.fillTitle': '补图标',
  'ai.fillScanning': '正在检查第 {done}/{total} 个…',
  'ai.fillFound': '找到 {found} 个站的图标，{missing} 个没找到；勾选确认后点应用才生效。',
  'ai.fillNone': '当前页面没有需要补图标的站。',
  'ai.fillNotFound': '扫描了 {scanned} 个站，其中 {missing} 个站没找到可用图标，仍会显示字标。',
  'ai.fillApply': '应用图标（{n} 站）',
  'ai.fillDone': '已补 {n} 个站的图标。',
  'ai.fillRescan': '重新扫描',
  'ai.fillNote': '只补显示字标的站；你手动设过文字图标或上传过图标的站会跳过，不用 AI 口令。',
};

const en: Dict = {
  'topbar.homeTitle': 'ZaBox · Back to home',
  'topbar.navAi': 'AI Nav',
  'topbar.lang': 'Switch language',
  'topbar.modeAria': 'Top bar mode: search or AI organize',
  'topbar.searchMode': 'Search mode',
  'topbar.searchTitle': 'Search sites and groups (⌘K)',
  'topbar.search': 'Search',
  'topbar.aiMode': 'AI organize mode',
  'topbar.aiTitle': 'AI organize: categorize in one click / collect sites',
  'topbar.aiOrganize': 'Organize',
  'search.aria': 'Search sites and groups',
  'search.placeholder': 'Search sites & groups… try initials or aliases, e.g. db / gpt',
  'search.resultsAria': 'Search results',
  'search.empty': 'No matching sites or groups',
  'search.groupsHeading': 'Groups',
  'search.sitesInGroup': '{n} sites · click to expand group',
  'search.sitesHeading': 'Sites · Enter searches the web by language',
  'search.invalid': 'Broken',
  'search.clear': 'Clear',
  'search.alias': 'Alias: {alias}',
  'search.webHeading': 'Web search',
  'search.searchOn': 'Search "{q}" on {engine}',
  'search.defaultEngine': 'Default',
  'card.siteCount': '{n} sites',
  'card.emptyStack': 'Open to add the first site',
  'card.groupLabel': '{name} group',
  'ai.title': 'AI Organize',
  'ai.placeholder': 'One sentence, let AI organize your sites… e.g. group all AI art sites together / find free stock photo sites',
  'ai.categorize': 'Categorize',
  'ai.collect': 'Collect sites',
  'ai.collectAction': 'Collect sites in one click',
  'ai.settingsTitle': 'AI settings (provider & key, stored only in this browser)',
  'ai.settings': 'AI settings',
  'ai.fillIcons': 'Fill icons',
  'ai.fillTitle': 'Fill missing icons',
  'ai.fillScanning': 'Checking {done} of {total}…',
  'ai.fillFound': 'Found icons for {found} sites, {missing} not found. Check and apply to save.',
  'ai.fillNone': 'No sites on this page need an icon.',
  'ai.fillNotFound': 'Checked {scanned} sites; {missing} have no usable icon and will keep showing a letter.',
  'ai.fillApply': 'Apply icons ({n} sites)',
  'ai.fillDone': 'Applied icons to {n} sites.',
  'ai.fillRescan': 'Scan again',
  'ai.fillNote': 'Only sites showing a letter icon are scanned; sites with a custom text or uploaded icon are skipped. No AI key needed.',
};

/** 取文案：英文缺词回落中文，中文缺词回落 key；支持 {n} 占位替换。 */
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const raw = (lang === 'en' ? en[key] : zh[key]) ?? zh[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}
