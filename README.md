# DayNote

DayNote is a lightweight desktop sticky-note planner built with Tauri 2, Rust, and a Vanilla TypeScript/Vite front end.

## What It Does

- Summon or hide a compact always-on-top note panel with one global shortcut.
- Plan daily, weekly, and monthly TODOs bound to the currently viewed date.
- Add, complete, delete, prioritize, and manually reorder tasks.
- Persist local data in the Tauri app data directory as `daynote.json`.
- Protect existing data by blocking edits while the data file is loading or if it cannot be parsed.
- Stay resident in the tray/menu bar so closing the panel hides it instead of quitting.
- Show small one-shot interaction polish, including add/complete feedback and an all-done reward.

## Tech Stack and Targets

- Desktop shell: Tauri 2
- Native runtime: Rust
- Front end: Vanilla TypeScript, HTML, CSS
- Build tool: Vite
- Storage: local JSON managed by the Tauri Rust side
- Target platforms: Windows, macOS, and Linux desktop

Released users should download the installer or app bundle for their platform. They do not need Rust, Node.js, npm, or this repository unless they want to develop or package DayNote themselves.

## Default Shortcuts

- `Ctrl+Alt+D`: show or hide DayNote on Windows/Linux.
- `Command+Option+D`: show or hide DayNote on macOS.
- `Esc`: hide the visible DayNote window to the tray/menu bar.
- `Ctrl+Enter`: add the typed task.
- `Alt+Left` / `Alt+Right`: move to the previous / next day, week, or month for the active plan view when focus is not in a text field.
- `Space`: toggle a focused task.
- `Delete`: remove a focused task.
- `Ctrl+1` / `Ctrl+2` / `Ctrl+3`: set focused task importance to low / medium / high.

## Development Requirements

Install the platform requirements first, then run the project commands below. The official Tauri prerequisites are the source of truth when an operating system package name changes: https://v2.tauri.app/start/prerequisites/

### Windows

- Node.js LTS and npm.
- Rust through `rustup`, using the MSVC toolchain.
- Microsoft C++ Build Tools with "Desktop development with C++".
- Microsoft Edge WebView2 Runtime. It is already present on most Windows 10 version 1803+ and Windows 11 installations.
- For MSI packaging, Windows VBSCRIPT optional feature must be enabled if the MSI builder reports `failed to run light.exe`.

### macOS

- Node.js LTS and npm.
- Rust through `rustup`.
- Xcode Command Line Tools: `xcode-select --install`.
- A macOS host or macOS CI runner is required to produce macOS app bundles/installers. Public distribution normally also needs Apple signing/notarization outside this repository.

### Linux

- Node.js LTS and npm.
- Rust through `rustup`.
- Tauri Linux system packages for your distro, including WebKitGTK and build tools.
- On Debian/Ubuntu, start with the package list from the Tauri prerequisites page, including `libwebkit2gtk-4.1-dev`, `build-essential`, `curl`, `wget`, `file`, `libxdo-dev`, `libssl-dev`, `libayatana-appindicator3-dev`, and `librsvg2-dev`.

## Install Dependencies

From the repository root:

```sh
npm install
```

## Development Run

```sh
npm run tauri:dev
```

This starts the Vite dev server on `127.0.0.1` and opens the Tauri desktop shell.

## Verification

Run the front-end build:

```sh
npm run build
```

Run the combined local check:

```sh
npm run check
```

`npm run check` runs the TypeScript/Vite build, Rust `cargo check`, and Rust formatting check.

The Rust checks can also be run directly:

```sh
cd src-tauri
cargo check
cargo fmt -- --check
```

On Windows, if `cargo` is installed but not visible in the current terminal, add it for that session:

```powershell
$env:Path = "C:\Users\12099\.cargo\bin;$env:Path"
```

## Packaging

Build the desktop bundle for the current host platform:

```sh
npm run bundle
```

The aliases below are equivalent:

```sh
npm run build:desktop
npm run tauri:build
```

Tauri packages for the platform it is running on. Build macOS packages on macOS, Linux packages on Linux, and Windows packages on Windows or a Windows CI runner. Cross-compiling is possible for some targets, but DayNote treats native platform builds or CI jobs as the normal release path.

### Windows Output

`src-tauri/tauri.conf.json` currently has `"bundle": { "targets": "all" }`, so a successful Windows package build produces MSI and NSIS installers when the local toolchain supports both.

Look under:

```text
src-tauri/target/release/bundle/msi/
src-tauri/target/release/bundle/nsis/
```

Typical file names are similar to:

```text
DayNote_0.1.0_x64_en-US.msi
DayNote_0.1.0_x64-setup.exe
```

The exact architecture or locale segment can vary by host and Tauri configuration.

### macOS and Linux Output

Build macOS and Linux packages on matching hosts or CI. End users simply download and install the matching platform artifact; they do not install developer toolchains.

### Windows Helper Script

For a local Windows release check:

```powershell
.\scripts\Package-Windows.ps1
```

To also build installers after verification:

```powershell
.\scripts\Package-Windows.ps1 -Bundle
```

## Desktop Shell Details

- The main window is a compact always-on-top note panel.
- The window is transparent, undecorated, and draggable from the panel edge and blank shell areas.
- Buttons, text fields, task cards, importance controls, delete/complete controls, and the task list scrollbar keep their normal interactions instead of starting a window drag.
- Closing the window hides it so DayNote can remain resident in the tray/menu bar.
- Use the top-left close button or `Esc` to hide the visible window to the tray/menu bar.
- The tray/menu-bar entry supports show/hide and quit.
- The global shortcut is `Ctrl+Alt+D` on Windows/Linux. On macOS, the Rust registration maps to `Command+Option+D`, matching the platform preference from `docs/DEVELOPMENT.md`.

## Plan Storage

- Plans are persisted as JSON in the Tauri app data directory, under `daynote.json`.
- Saves write a synced temporary file in the same directory before replacing `daynote.json`, so the existing data file is not truncated before the new JSON is complete.
- While DayNote is initially loading `daynote.json`, editing and saving are locked so empty in-memory data cannot overwrite the existing file.
- If DayNote cannot load or parse the existing data file, the UI blocks editing and saving with a Chinese error message instead of overwriting the file with empty or new data.
- Tasks are stored under local ISO date keys in the `days` map, Monday week-start ISO keys in the `weeks` map, and `YYYY-MM` keys in the `months` map.
- Older data files that only contain `days` remain valid; missing `weeks` and `months` maps are repaired in memory before saving.
- New tasks use `importance: "low"` by default.
- Add, toggle complete, delete, importance changes, and manual ordering all apply to the active day, week, or month plan.
- Keyboard support: `Esc` hides DayNote to the tray/menu bar, `Ctrl+Enter` adds the typed task, `Alt+Left` / `Alt+Right` move to the previous / next day, week, or month for the active plan view when focus is not in a text field, `Space` toggles a focused task, `Delete` removes a focused task, and `Ctrl+1` / `Ctrl+2` / `Ctrl+3` set focused task importance to low / medium / high.

## Importance and Ordering

- Each task has a lightweight low / medium / high importance control shown directly on the task row.
- Click an importance segment to save that level immediately without changing the task's current position.
- Drag a task row and drop it above or below another task to change the manual order across the whole active plan. DayNote resequences the `order` field and persists the new order after the drop.
- If loading `daynote.json` fails, importance controls and drag sorting are disabled along with other editing actions to protect the existing file from being overwritten.

## Date Navigation

- The header shows the currently viewed day, including an actual date. Today, tomorrow, and yesterday receive a short natural label.
- Use the compact top switch to choose Week, Day, or Month plans. Day is selected by default.
- In Day view, the left and right header buttons, or `Alt+Left` / `Alt+Right`, move by one day.
- In Week view, the same controls move by one week and the title shows the bound week range. The week key is the local Monday start date.
- In Month view, the same controls move by one month and the title shows the bound month.
- Use the compact Today button to jump back to today's date, week, or month, and use the date picker to choose any local calendar date.
- Future planning and past review use the same task operations as today. Empty days, weeks, and months are not written into `daynote.json` just because they were viewed; a plan is saved only after its tasks are changed.

## UI Polish

- The fixed theme uses a warm paper-like surface with jade accents and restrained cinnabar / gold highlights.
- Adding a task gives a brief entry highlight, and completing a task gives a short check bounce plus a light sheen.
- When the active plan reaches all done for the first time, DayNote shows a one-shot stamp-and-spark reward above the list using the current plan label. The add / complete feedback clears in place so keyboard focus stays on the same task.
