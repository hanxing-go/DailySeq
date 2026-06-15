# DayNote

DayNote is a lightweight desktop sticky-note planner built with Tauri 2, Rust, and a Vanilla TypeScript/Vite front end.

## Development

Install dependencies:

```sh
npm install
```

Run the desktop app in development:

```sh
npm run tauri:dev
```

Build the web front end:

```sh
npm run build
```

Check the Rust shell:

```sh
cd src-tauri
cargo check
```

Build the desktop bundle:

```sh
npm run tauri:build
```

## Desktop Shell

- The main window is a compact always-on-top note panel.
- The window is transparent, undecorated, and draggable from the header/date area.
- Closing the window hides it so DayNote can remain resident in the tray/menu bar.
- The tray/menu-bar entry supports show/hide and quit.
- The global shortcut is `Ctrl+Alt+D` on Windows/Linux. On macOS, the Rust registration maps to `Command+Option+D`, matching the platform preference from `docs/DEVELOPMENT.md`.

## Daily TODO Storage

- Plans are persisted as JSON in the Tauri app data directory, under `daynote.json`.
- Saves write a synced temporary file in the same directory before replacing `daynote.json`, so the existing data file is not truncated before the new JSON is complete.
- If DayNote cannot load or parse the existing data file, the UI blocks editing and saving with a Chinese error message instead of overwriting the file with empty or new data.
- Tasks are stored under local ISO date keys in the `days` map.
- New tasks use `importance: "medium"` by default.
- Add, toggle complete, delete, importance changes, and manual ordering all apply to the currently viewed day.
- Keyboard support: `Ctrl+Enter` adds the typed task, `Alt+Left` / `Alt+Right` move to the previous / next day when focus is not in a text field, `Space` toggles a focused task, `Delete` removes a focused task, and `Ctrl+1` / `Ctrl+2` / `Ctrl+3` set focused task importance to low / medium / high.

## Importance and Ordering

- Each task has a lightweight low / medium / high importance control shown directly on the task row.
- Click an importance segment to save that level immediately. Importance is visual metadata only; the list does not auto-sort by importance.
- Drag a task row and drop it above or below another task to change its manual order. DayNote resequences the `order` field and persists the new order after the drop.
- If loading `daynote.json` fails, importance controls and drag sorting are disabled along with other editing actions to protect the existing file from being overwritten.

## Date Navigation

- The header shows the currently viewed day, including an actual date. Today, tomorrow, and yesterday receive a short natural label.
- Use the left and right header buttons, or `Alt+Left` / `Alt+Right`, to move by one day.
- Future planning and past review use the same task operations as today. Empty days are not written into `daynote.json` just because they were viewed; a day is saved only after its tasks are changed.
