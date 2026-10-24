use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // 系统托盘（任务栏右下角）：点托盘图标收起/放出窗口，右键菜单可显示、
            // 隐藏、退出。窗口的最小化按钮仍是标准最小化到任务栏；托盘是另一条
            // “收起来”的路，窗口藏进托盘后点图标即可恢复。
            let handle = app.handle();
            let show = MenuItem::with_id(handle, "show", "显示窗口", true, None::<&str>)?;
            let hide = MenuItem::with_id(handle, "hide", "隐藏到托盘", true, None::<&str>)?;
            let quit = MenuItem::with_id(handle, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(handle, &[&show, &hide, &quit])?;
            let _tray = TrayIconBuilder::new()
                .icon(handle.default_window_icon().cloned().unwrap())
                .menu(&menu)
                .tooltip("杂盒计划")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // 只响应松开（Up）：Click 在按下和松开各发一次，不过滤会在一次
                    // 点击里连续收起又弹出，看起来就是“很不自然的闪烁”。
                    // 口径（用户定）：点一下收起（藏进托盘），再点一下弹出窗口。
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(handle)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
