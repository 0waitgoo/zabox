mod desktop_login;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};

use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Default)]
struct ShortcutBinding {
    shortcut: std::sync::Mutex<Option<Shortcut>>,
    pressed: std::sync::atomic::AtomicBool,
}

#[tauri::command]
fn set_expand_shortcut(app: tauri::AppHandle, enabled: bool, accelerator: String,
    binding: tauri::State<'_, ShortcutBinding>) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    let desired = if enabled { Some(accelerator.parse::<Shortcut>().map_err(|e| e.to_string())?) } else { None };
    let mut current = binding.shortcut.lock().map_err(|_| "快捷键状态不可用")?;
    if *current == desired { return Ok(()); }
    let manager = app.global_shortcut();
    // Register the replacement first; a conflict must leave the previous binding usable.
    if let Some(next) = desired { manager.register(next).map_err(|e| e.to_string())?; }
    if let Some(previous) = *current {
        if let Err(error) = manager.unregister(previous) {
            if let Some(next) = desired { let _ = manager.unregister(next); }
            return Err(error.to_string());
        }
    }
    *current = desired;
    binding.pressed.store(false, Ordering::Relaxed);
    Ok(())
}

fn restore_window(window: &tauri::WebviewWindow) {
    let _ = window.set_skip_taskbar(false);
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.emit("window-restore", ());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(desktop_login::LoginState::default())
        .manage(ShortcutBinding::default())
        .invoke_handler(tauri::generate_handler![
            set_expand_shortcut,
            desktop_login::start_desktop_login,
            desktop_login::wait_desktop_login,
            desktop_login::cancel_desktop_login,
        ])
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Focused(true)) {
                // Taskbar activation must also restore an off-screen edge strip.
                let _ = window.emit("window-restore", ());
            }
        })
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, _shortcut, event| {
            use std::sync::atomic::Ordering;
            let binding = app.state::<ShortcutBinding>();
            if event.state() == ShortcutState::Released {
                binding.pressed.store(false, Ordering::Relaxed);
            } else if !binding.pressed.swap(true, Ordering::Relaxed) {
                if let Some(window) = app.get_webview_window("main") {
                    let recover = !window.is_visible().unwrap_or(true) || window.is_minimized().unwrap_or(false);
                    if recover { restore_window(&window); }
                    let _ = window.emit("window-shortcut", recover);
                }
            }
        }).build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 重复启动不再开第二个窗口：直接把已有窗口弹出来（稳定优化）。
            if let Some(window) = app.get_webview_window("main") {
                restore_window(&window);
            }
        }))
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
                .show_menu_on_left_click(false)
                .tooltip("杂盒计划（点击恢复窗口）")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            restore_window(&window);
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.set_skip_taskbar(true);
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
                    // 窗口已隐藏时在系统层直接恢复（不依赖页面逻辑——页面逻辑失效时
                    // 点托盘也没反应，用户就会以为软件关了）；其余状态（可见/细边/
                    // 最小化）仍交给前端按状态处理。
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if !window.is_visible().unwrap_or(true) || window.is_minimized().unwrap_or(false) {
                                restore_window(&window);
                            } else {
                                let _ = window.emit("tray-toggle", ());
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

#[cfg(test)]
mod shortcut_tests {
    use super::*;
    use tauri_plugin_global_shortcut::{Code, Modifiers};
    #[test]
    fn frontend_key_codes_parse_to_native_shortcuts() {
        assert_eq!("Control+Backquote".parse::<Shortcut>().unwrap(), Shortcut::new(Some(Modifiers::CONTROL), Code::Backquote));
        assert_eq!("Control+Alt+KeyK".parse::<Shortcut>().unwrap(), Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyK));
    }
}
