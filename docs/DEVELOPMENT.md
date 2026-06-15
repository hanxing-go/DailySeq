# DayNote Development Guide

DayNote is a lightweight cross-platform desktop sticky-note planner. The product goal is simple: press one global shortcut, add or review daily plans, and leave the computer feeling almost untouched.

## Tech Stack

- Desktop shell: Tauri 2
- Core runtime: Rust
- UI: Vanilla TypeScript, HTML, CSS
- Build tool: Vite
- Local storage: JSON under the Tauri app data directory

This stack keeps the app small because it uses the operating system WebView instead of bundling Chromium. It also keeps the code easy to audit: no React/Vue runtime, no heavy component library, and no remote service dependency.

## Platform Strategy

DayNote targets Windows, macOS, and Linux.

- Windows development needs Rust, MSVC Build Tools, Node.js, and npm.
- macOS development needs Rust, Node.js, npm, and Xcode Command Line Tools.
- End users should receive platform installers or app bundles and should not need Rust, Node.js, or npm.

## Product Shape

The main window is a compact always-on-top note panel, not a full dashboard. It should feel like a refined desktop object:

- Small floating panel.
- Fast global summon shortcut.
- Always-on-top while visible.
- Tray/menu-bar resident behavior.
- Low CPU usage when idle.
- Local-first storage.
- Polished micro-interactions without animation loops.

## Default Shortcuts

- `Ctrl+Alt+D`: show or hide DayNote on Windows/Linux.
- `Command+Option+D`: show or hide DayNote on macOS.
- `Ctrl+Enter`: add the current task.
- `Alt+Left`: previous day.
- `Alt+Right`: next day.
- `Ctrl+1`, `Ctrl+2`, `Ctrl+3`: set selected task importance to low, medium, high.
- `Space`: toggle selected task completion when the list has focus.
- `Delete`: remove selected task.

## Data Model

Persist plans by ISO date:

```json
{
  "days": {
    "2026-06-15": {
      "tasks": [
        {
          "id": "uuid",
          "text": "Write plan",
          "importance": "high",
          "done": false,
          "createdAt": "2026-06-15T12:00:00.000Z",
          "completedAt": null,
          "order": 0
        }
      ]
    }
  },
  "settings": {
    "theme": "jade"
  }
}
```

The app should tolerate missing or older fields and repair them in memory before saving. Importance defaults to `medium` for new tasks and repaired tasks, and `order` is normalized on load so the visible list follows stored task order.

## Feature Milestones

Each milestone must be implemented and committed separately.

1. Project skeleton and desktop shell.
   - Tauri 2 app scaffold.
   - Vite TypeScript front end.
   - Always-on-top note-sized window.
   - Tray/menu-bar entry.
   - Global show/hide shortcut.

2. Daily TODO storage.
   - Add task.
   - Toggle completion.
   - Delete task.
   - Persist by day.
   - Default new task importance to `medium` until importance controls are implemented.
   - Store the JSON file as `daynote.json` in the Tauri app data directory.

3. Importance and ordering.
   - Low, medium, high importance.
   - Quick controls.
   - Keyboard shortcuts.
   - Drag reorder.
   - The list order follows `order`, not importance.
   - Loading failures must block editing, importance changes, and drag saves.

4. Date navigation.
   - Show current viewed date.
   - Previous and next day buttons.
   - Keyboard navigation.
   - Future-day planning.

5. UI polish and reward effects.
   - Beautiful compact Chinese-friendly visual language.
   - Smooth add/complete interactions.
   - Special all-done celebration.
   - Lightweight CSS-only themes.

6. Packaging docs.
   - Development setup.
   - Cross-platform build commands.
   - Installer output notes.

## Implementation Rules

- Prefer native Tauri APIs over adding heavy dependencies.
- Avoid background timers unless they are strictly necessary.
- Avoid continuous animations. Use short CSS transitions triggered by user action.
- Keep the app offline-first.
- Treat local data as user-owned: write `daynote.json` through a synced same-directory temporary file before replacement, and block edits/saves during initial loading or after a load failure so unreadable or not-yet-loaded data is not overwritten.
- Keep all text readable in Simplified Chinese.
- Do not introduce telemetry.
- Do not use remote fonts or remote assets.
- Commit after every completed milestone.

## Date Navigation Notes

- The main panel always reflects the currently viewed ISO date key, not just today.
- Viewing an empty past or future day does not create a new saved day until the user edits that day.
- When load failure protection is active, users can still browse dates and read empty states, but task edits, ordering, and saves remain blocked.

## UI Polish Notes

- The visual direction is fixed: warm paper surface, jade primary controls, with small cinnabar and gold accents.
- Task add and completion feedback are short, one-shot transitions only; there are no continuous motion loops.
- A full-day completion reward appears once when a day transitions from not-all-done to all-done, and it is not retriggered just by revisiting the same completed date.

## Verification

For each milestone:

- Run `npm install` if dependencies changed.
- Run `npm run build`.
- Run `npm run check` before release or when packaging scripts/docs change.
- Run `cargo check` inside `src-tauri` when Rust code changed, or when confirming release readiness.
- Run `cargo fmt -- --check` inside `src-tauri` before committing Rust-facing changes.
- Commit only after the app builds or clearly document why verification is blocked.

## Release and Packaging Flow

DayNote releases are built as native desktop artifacts. Users install those artifacts directly and do not need Rust, Node.js, npm, or the source tree.

1. Confirm the worktree and version inputs.
   - Inspect `git status --short` and keep unrelated user changes intact.
   - Keep `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` versions aligned when cutting a real release.
   - Review `src-tauri/tauri.conf.json` bundle targets. DayNote currently uses `"targets": "all"`.

2. Install dependencies when needed.
   - Run `npm install` after dependency or lockfile changes.
   - Do not add new runtime dependencies for packaging docs or helper scripts.

3. Run verification.
   - `npm run build`
   - `npm run check`
   - `cd src-tauri && cargo check`
   - `cd src-tauri && cargo fmt -- --check`

4. Package on the target host.
   - Windows: `npm run bundle` from the repository root, or `.\scripts\Package-Windows.ps1 -Bundle`.
   - macOS: run the same package command on macOS or macOS CI. Public distribution normally needs signing/notarization configured outside this milestone.
   - Linux: run the package command on the Linux distro or Linux CI image that matches the intended artifact family.

5. Inspect artifacts.
   - Windows MSI: `src-tauri/target/release/bundle/msi/`.
   - Windows NSIS setup exe: `src-tauri/target/release/bundle/nsis/`.
   - macOS/Linux outputs are under the matching `src-tauri/target/release/bundle/` subdirectories produced by Tauri on those hosts.

6. Smoke test the packaged app.
   - Install or launch the artifact on a clean-ish user profile when possible.
   - Confirm the global shortcut toggles the panel.
   - Add, complete, delete, prioritize, reorder, and navigate dates.
   - Close the window and confirm tray/menu-bar show/hide and quit behavior.
   - Restart the app and confirm `daynote.json` data persisted.

## Commit and Review Flow

- Keep one milestone or cohesive fix per commit.
- Use concise conventional commit messages, for example `docs: add release workflow`.
- Before commit, review `git diff --check` and the staged diff.
- If another contributor has changed files, integrate with those changes instead of reverting them.
- Review should focus on behavior risk, data safety, packaging correctness, and missing verification.
- Documentation-only packaging changes should not modify core app behavior.

## Lightweight Boundaries

- The app remains local-first and offline-first.
- No telemetry, remote fonts, remote assets, or network service dependency.
- No background timers or continuous animation loops unless a future feature strictly requires them.
- Packaging helpers must be readable, non-destructive, and avoid cleaning build directories or deleting user data.
- Prefer native Tauri and standard toolchain commands over new project dependencies.
- Keep release docs practical: commands, artifact paths, platform limits, and smoke checks matter more than process ceremony.
