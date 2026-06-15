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

This milestone intentionally keeps the note content static. Persistence, daily navigation behavior, task actions, and importance controls belong to later milestones.
