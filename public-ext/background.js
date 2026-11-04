/**
 * 杂盒 ZaBox 后台脚本（MV3 service worker，纯 chrome.* API、无依赖，不经过打包、原样拷入扩展包）：
 * - 网页右键菜单「添加到杂盒主页」：点一下把当前网页加进主页的 tab 组（没有 tab 组就新建）；
 * - worker 里没有 localStorage，投递给已打开的杂盒新标签页（同 App 内的桥接负责落盘与同步）；
 *   没有新标签页在听时先存 chrome.storage.local 待办队列，新标签页打开时由桥接取走落盘。
 */
const MENU_ID = 'zabox-add-current-page';
const PENDING_KEY = 'zabox-pending-adds';

function setupMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: '添加到杂盒主页',
      contexts: ['page', 'link'],
    });
  });
}
chrome.runtime.onInstalled.addListener(setupMenu);
chrome.runtime.onStartup.addListener(setupMenu);

function siteFromClick(info, tab) {
  if (info.linkUrl) {
    let name = info.linkUrl;
    try {
      name = new URL(info.linkUrl).hostname;
    } catch {
      /* 链接解析失败就用原地址当名字 */
    }
    return { name, url: info.linkUrl };
  }
  if (tab && tab.url) return { name: tab.title || tab.url, url: tab.url };
  return null;
}

function isHttpUrl(url) {
  return /^https?:\/\//i.test(url || '');
}

function normalizeUrl(url) {
  return String(url).trim().replace(/\/+$/, '');
}

async function queuePending(site) {
  const data = await chrome.storage.local.get(PENDING_KEY);
  const list = Array.isArray(data[PENDING_KEY]) ? data[PENDING_KEY] : [];
  if (list.some((s) => s && typeof s.url === 'string' && normalizeUrl(s.url) === normalizeUrl(site.url))) return;
  list.push(site);
  await chrome.storage.local.set({ [PENDING_KEY]: list });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  const site = siteFromClick(info, tab);
  if (!site || !isHttpUrl(site.url)) return;
  // 只投递给一个已打开的杂盒新标签页（避免新标签页与侧边栏同时在听造成重复添加）；
  // 没有页面在听、或投递失败时进待办队列，等新标签页打开时取走。
  try {
    const ownUrl = chrome.runtime.getURL('index.html');
    const tabs = await chrome.tabs.query({ url: ownUrl });
    if (tabs.length > 0) {
      const delivered = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'zabox-add-site', site }, () => {
          resolve(!chrome.runtime.lastError);
        });
      });
      if (delivered) return;
    }
  } catch {
    /* 投递异常时走待办队列，不丢 */
  }
  await queuePending(site);
});
