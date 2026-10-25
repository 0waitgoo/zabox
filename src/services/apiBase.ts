/**
 * 本站接口基址（扩展线第 1 步）：
 * - 网站版构建不注入 VITE_API_BASE → API_BASE 为 ''，所有请求保持相对 /api 现状，一字不变；
 * - 扩展构建（npm run build:ext）注入 VITE_API_BASE=https://zahe.hiitun.top，
 *   扩展页面（chrome-extension://…）没有相对 /api，统一改走线上绝对地址。
 * 服务端 /api 已带 Access-Control-Allow-Origin: *（含 OPTIONS 预检，2026-10-24 线上实查确认），
 * 且 manifest 已申请该域名的 host_permissions，双保险。
 */
export const API_BASE: string = import.meta.env?.VITE_API_BASE ?? '';

/**
 * 是否为浏览器扩展构建（build:ext 注入 VITE_ZABOX_EXT=1）。
 * 扩展里 GitHub OAuth 回跳不可用（没有站点根地址可回跳）：数据菜单隐藏 OAuth 登录入口，
 * 改走方案 B「粘贴令牌」直连同步（见 DataMenu / githubSync）。网站版恒为 false，UI 零变化。
 */
export const IS_EXTENSION_BUILD: boolean = import.meta.env?.VITE_ZABOX_EXT === '1';
