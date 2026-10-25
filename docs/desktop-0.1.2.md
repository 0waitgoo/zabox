# 杂盒计划 0.1.2：浏览器登录权限修复

0.1.1 点击 GitHub 登录时报 `Not allowed to open url https://zahe.hiitun.top/...`，发生在打开浏览器之前。
原因是 capability 只启用了 `opener:allow-open-url` 命令，没有给该命令配置允许打开的网址范围。

本次只修改桌面登录相关的权限、版本与回归测试：

- 为 opener 明确允许 `https://zahe.hiitun.top/*`，包含动态端口和校验码的查询字符串。
- 其他域名、本地文件及非 HTTPS 地址继续不允许打开。
- 新增 Rust 回归测试，用 opener 同款 `glob::Pattern` 匹配器验证安装包实际使用的 capability 文件，覆盖多个端口及拒绝其他域名的情况。
- 桌面版本更新为 0.1.2，已有窗口行为和数据存储标识不变。

完整登录依赖 `docs/desktop-0.1.1.md` 中的网站授权回跳页面。0.1.2 安装包解决“打不开浏览器”的权限问题，但网站仍需发布该 PR 的 `src/main.tsx` 和 `src/services/desktopLoginBridge.ts` 才能完成授权返回。

Windows 验收：覆盖安装 0.1.2，点 GitHub 登录，确认浏览器可以打开；网站发布后，在 GitHub 授权并确认软件显示“已连接 GitHub”。
