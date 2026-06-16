# DailySeq Release Checklist

Use this checklist when preparing a local release or a CI release job.

## Preconditions

- Build on the same operating system as the artifact you want to ship, unless a CI job is explicitly configured for cross-compilation.
- End users receive platform installers or app bundles. They do not need Rust, Node.js, npm, or this repository.
- Keep versions aligned across `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` for a real release.
- Do not clean build folders or touch local `dailyseq.json` user data as part of packaging.

## Verify

From the repository root:

```sh
npm run build
npm run check
```

Direct Rust checks:

```sh
cd src-tauri
cargo check
cargo fmt -- --check
```

On Windows, add Cargo to the current PowerShell session if needed:

```powershell
$env:Path = "C:\Users\12099\.cargo\bin;$env:Path"
```

## Package

```sh
npm run bundle
```

Equivalent aliases:

```sh
npm run build:desktop
npm run tauri:build
```

Windows helper:

```powershell
.\scripts\Package-Windows.ps1 -Bundle
```

## Artifact Locations

Windows:

```text
src-tauri/target/release/bundle/msi/
src-tauri/target/release/bundle/nsis/
```

Typical Windows names:

```text
DailySeq_0.1.0_x64_en-US.msi
DailySeq_0.1.0_x64-setup.exe
```

macOS and Linux artifacts are produced by Tauri under platform-specific folders in:

```text
src-tauri/target/release/bundle/
```

## Smoke Test

- Install or launch the packaged app.
- Toggle the panel with the global shortcut.
- Add, complete, delete, prioritize, and drag reorder tasks.
- Navigate to yesterday and tomorrow, edit a task, then return to today.
- Press `Esc` while focus is in the task input and confirm the window stays visible.
- Press `Esc` while focus is outside text editing and confirm the window hides to the tray/menu bar.
- Click the top-left close button and confirm the window hides to the tray/menu bar.
- Close the panel and confirm the app remains available from the tray/menu bar.
- Quit and restart, then confirm saved tasks are still present.
- Confirm unsigned build warnings are expected until signing/notarization is configured.
