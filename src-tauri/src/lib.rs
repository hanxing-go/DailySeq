use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_SHOW_HIDE_ID: &str = "show_hide";
const TRAY_QUIT_ID: &str = "quit";
const STORAGE_FILE_NAME: &str = "daynote.json";
const DEFAULT_THEME: &str = "jade";
const DEFAULT_IMPORTANCE: &str = "medium";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DaynoteData {
    #[serde(default)]
    days: BTreeMap<String, DayPlan>,
    #[serde(default)]
    settings: Settings,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
struct DayPlan {
    #[serde(default)]
    tasks: Vec<Task>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Task {
    #[serde(default)]
    id: String,
    #[serde(default)]
    text: String,
    #[serde(default = "default_importance")]
    importance: String,
    #[serde(default)]
    done: bool,
    #[serde(default = "default_timestamp")]
    created_at: String,
    #[serde(default)]
    completed_at: Option<String>,
    #[serde(default)]
    order: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct Settings {
    #[serde(default = "default_theme")]
    theme: String,
}

impl Default for DaynoteData {
    fn default() -> Self {
        Self {
            days: BTreeMap::new(),
            settings: Settings::default(),
        }
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: DEFAULT_THEME.to_string(),
        }
    }
}

impl DaynoteData {
    fn repaired(mut self) -> Self {
        if self.settings.theme.trim().is_empty() {
            self.settings.theme = DEFAULT_THEME.to_string();
        }

        for (date, day) in self.days.iter_mut() {
            for (index, task) in day.tasks.iter_mut().enumerate() {
                task.id = task.id.trim().to_string();
                task.text = task.text.trim().to_string();

                if task.id.is_empty() && !task.text.is_empty() {
                    task.id = format!("repaired-{date}-{index}");
                }

                if task.importance.trim().is_empty() {
                    task.importance = DEFAULT_IMPORTANCE.to_string();
                }

                if !matches!(task.importance.as_str(), "low" | "medium" | "high") {
                    task.importance = DEFAULT_IMPORTANCE.to_string();
                }

                if task.created_at.trim().is_empty() {
                    task.created_at = default_timestamp();
                }

                if !task.done {
                    task.completed_at = None;
                }
            }

            day.tasks
                .retain(|task| !task.id.trim().is_empty() && !task.text.is_empty());
            day.tasks.sort_by_key(|task| task.order);

            for (index, task) in day.tasks.iter_mut().enumerate() {
                task.order = index as u32;
            }
        }

        self
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            load_daynote_data,
            save_daynote_data
        ])
        .setup(|app| {
            build_tray(app.handle())?;
            if let Err(error) = register_global_shortcut(app.handle()) {
                eprintln!("failed to register DayNote global shortcut: {error}");
            }
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

#[tauri::command]
fn load_daynote_data(app: AppHandle<Wry>) -> Result<DaynoteData, String> {
    let path = storage_path(&app)?;

    if !path.exists() {
        return Ok(DaynoteData::default());
    }

    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read DayNote data file: {error}"))?;

    if contents.trim().is_empty() {
        return Ok(DaynoteData::default());
    }

    serde_json::from_str::<DaynoteData>(&contents)
        .map(DaynoteData::repaired)
        .map_err(|error| format!("failed to parse DayNote data file: {error}"))
}

#[tauri::command]
fn save_daynote_data(app: AppHandle<Wry>, data: DaynoteData) -> Result<DaynoteData, String> {
    let repaired = data.repaired();
    let path = storage_path(&app)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create DayNote data directory: {error}"))?;
    }

    let contents = serde_json::to_string_pretty(&repaired)
        .map_err(|error| format!("failed to serialize DayNote data: {error}"))?;

    fs::write(&path, contents)
        .map_err(|error| format!("failed to write DayNote data file: {error}"))?;

    Ok(repaired)
}

fn storage_path(app: &AppHandle<Wry>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(STORAGE_FILE_NAME))
        .map_err(|error| format!("failed to resolve DayNote data directory: {error}"))
}

fn default_importance() -> String {
    DEFAULT_IMPORTANCE.to_string()
}

fn default_theme() -> String {
    DEFAULT_THEME.to_string()
}

fn default_timestamp() -> String {
    "1970-01-01T00:00:00.000Z".to_string()
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
