use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_SHOW_HIDE_ID: &str = "show_hide";
const TRAY_QUIT_ID: &str = "quit";

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            register_global_shortcut(app.handle())?;
            build_tray(app.handle())?;
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_SHOW_HIDE_ID => {
                if let Err(error) = toggle_main_window(app) {
                    eprintln!("failed to toggle DayNote window: {error}");
                }
            }
            TRAY_QUIT_ID => app.exit(0),
            _ => {}
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();

                if let Err(error) = window.hide() {
                    eprintln!("failed to hide DayNote window: {error}");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running DayNote");
}

fn register_global_shortcut(app: &AppHandle<Wry>) -> tauri::Result<()> {
    // Tauri's programmatic API is portable across desktop targets. On macOS this maps
    // to Command+Option+D; on Windows and Linux it maps to Ctrl+Alt+D.
    let modifiers = if cfg!(target_os = "macos") {
        Modifiers::SUPER | Modifiers::ALT
    } else {
        Modifiers::CONTROL | Modifiers::ALT
    };
    let shortcut = Shortcut::new(Some(modifiers), Code::KeyD);
    let app_handle = app.clone();

    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                if let Err(error) = toggle_main_window(&app_handle) {
                    eprintln!("failed to toggle DayNote window from shortcut: {error}");
                }
            }
        })
        .map_err(|error| tauri::Error::Anyhow(error.into()))?;

    Ok(())
}

fn build_tray(app: &AppHandle<Wry>) -> tauri::Result<()> {
    let show_hide = MenuItem::with_id(
        app,
        TRAY_SHOW_HIDE_ID,
        "Show/Hide DayNote",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, TRAY_QUIT_ID, "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_hide, &quit])?;

    TrayIconBuilder::with_id("daynote")
        .tooltip("DayNote")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Err(error) = toggle_main_window(tray.app_handle()) {
                    eprintln!("failed to toggle DayNote window from tray: {error}");
                }
            }
        })
        .icon(tauri::include_image!("icons/icon.png"))
        .build(app)?;

    Ok(())
}

fn toggle_main_window(app: &AppHandle<Wry>) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Ok(());
    };

    if window.is_visible()? {
        window.hide()?;
    } else {
        window.show()?;
        window.set_focus()?;
    }

    Ok(())
}
