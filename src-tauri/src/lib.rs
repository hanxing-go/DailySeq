use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
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

    let temp_path = write_synced_temp_file(&path, contents.as_bytes())?;
    replace_data_file(&temp_path, &path)?;

    Ok(repaired)
}

fn write_synced_temp_file(target_path: &Path, contents: &[u8]) -> Result<PathBuf, String> {
    let parent = target_path
        .parent()
        .ok_or_else(|| "failed to resolve DayNote data directory".to_string())?;
    let file_name = target_path
        .file_name()
        .ok_or_else(|| "failed to resolve DayNote data file name".to_string())?
        .to_string_lossy();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();

    for attempt in 0..100 {
        let temp_path = parent.join(format!(
            ".{file_name}.tmp-{}-{timestamp}-{attempt}",
            std::process::id()
        ));
        let mut file = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
        {
            Ok(file) => file,
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "failed to create temporary DayNote data file: {error}"
                ))
            }
        };

        let write_result = file
            .write_all(contents)
            .and_then(|()| file.flush())
            .and_then(|()| file.sync_all())
            .map_err(|error| format!("failed to write temporary DayNote data file: {error}"));
        drop(file);

        if let Err(error) = write_result {
            let _ = fs::remove_file(&temp_path);
            return Err(error);
        }

        return Ok(temp_path);
    }

    Err("failed to create a unique temporary DayNote data file".to_string())
}

#[cfg(not(target_os = "windows"))]
fn replace_data_file(temp_path: &Path, target_path: &Path) -> Result<(), String> {
    fs::rename(temp_path, target_path)
        .map_err(|error| format!("failed to replace DayNote data file: {error}"))
}

#[cfg(target_os = "windows")]
fn replace_data_file(temp_path: &Path, target_path: &Path) -> Result<(), String> {
    if !target_path
        .try_exists()
        .map_err(|error| format!("failed to inspect DayNote data file: {error}"))?
    {
        return fs::rename(temp_path, target_path)
            .map_err(|error| format!("failed to install DayNote data file: {error}"));
    }

    let backup_path = backup_path_for(target_path)?;

    if backup_path
        .try_exists()
        .map_err(|error| format!("failed to inspect DayNote data backup: {error}"))?
    {
        fs::remove_file(&backup_path)
            .map_err(|error| format!("failed to remove previous DayNote data backup: {error}"))?;
    }

    replace_existing_file_windows(target_path, temp_path, &backup_path)
}

#[cfg(target_os = "windows")]
fn backup_path_for(target_path: &Path) -> Result<PathBuf, String> {
    let mut backup_name = target_path
        .file_name()
        .ok_or_else(|| "failed to resolve DayNote data backup name".to_string())?
        .to_os_string();
    backup_name.push(".bak");

    Ok(target_path.with_file_name(backup_name))
}

#[cfg(target_os = "windows")]
fn replace_existing_file_windows(
    target_path: &Path,
    temp_path: &Path,
    backup_path: &Path,
) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::null_mut;

    #[link(name = "kernel32")]
    extern "system" {
        #[link_name = "ReplaceFileW"]
        fn replace_file_w(
            replaced_file_name: *const u16,
            replacement_file_name: *const u16,
            backup_file_name: *const u16,
            replace_flags: u32,
            exclude: *mut core::ffi::c_void,
            reserved: *mut core::ffi::c_void,
        ) -> i32;
    }

    fn wide_path(path: &Path) -> Vec<u16> {
        path.as_os_str().encode_wide().chain(Some(0)).collect()
    }

    let target_wide = wide_path(target_path);
    let temp_wide = wide_path(temp_path);
    let backup_wide = wide_path(backup_path);

    let succeeded = unsafe {
        replace_file_w(
            target_wide.as_ptr(),
            temp_wide.as_ptr(),
            backup_wide.as_ptr(),
            0,
            null_mut(),
            null_mut(),
        )
    };

    if succeeded == 0 {
        return Err(format!(
            "failed to replace DayNote data file: {}",
            std::io::Error::last_os_error()
        ));
    }

    Ok(())
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
