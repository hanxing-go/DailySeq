# State Management

> How state is managed in this project.

---

## Overview

DailySeq keeps ephemeral UI state in local TypeScript variables and persists shared app settings in the `DailySeqData` payload. Theme selection is the main durable UI setting: the frontend writes `data.settings.theme`, the root app shell reads it through `data-theme`, and the Tauri backend repairs older stored values before they are rendered.

---

## State Categories

- Local state: open popovers, drag state, active focus targets, temporary edit buffers.
- Shared persisted state: plan data, calendar scope, and `settings.theme`.
- Derived state: filtered task lists, sorted task views, and the active theme swatch list.
- URL state: not used for the current desktop app shell.

---

## Scenario: Persisted Theme Switching

### 1. Scope / Trigger
- Trigger: adding a new theme or changing how an existing theme is stored or rendered.
- Why this matters: the theme id is persisted in settings, mirrored to `data-theme` on `#app`, and normalized by the backend. A mismatch can break styling or resurrect legacy ids.

### 2. Signatures
- Frontend theme union: `type ThemeId = "jade-paper" | "soft-blue" | "mint-paper"`
- Frontend registry: `const THEMES: Array<{ id: ThemeId; label: string }>`
- Persisted field: `DailySeqData.settings.theme: ThemeId`
- DOM contract: `#app[data-theme="<theme-id>"]`
- Backend normalizer: `normalize_theme(value: &str) -> String`

### 3. Contracts
- The theme menu is the source of truth for user selection.
- `data.settings.theme` must always be one of the allowed theme ids before render.
- The frontend applies the current theme id to the app shell via `data-theme`.
- The backend must normalize stored settings during repair/load.
- Legacy aliases must map forward:
  - `jade` -> `jade-paper`
  - `mint` -> `mint-paper`
  - `mint-blue` -> `mint-paper`
- Unknown values must fall back to the default theme.

### 4. Validation & Error Matrix
- Empty persisted theme -> default `jade-paper`.
- Unknown persisted theme -> default `jade-paper`.
- Legacy alias -> modern theme id.
- New CSS selector without a `ThemeId` entry -> no menu option and no persisted path.
- New `ThemeId` without backend whitelist -> storage repair rewrites it to default.
- `data-theme` set without matching CSS -> page falls back to base shell styles only.

### 5. Good/Base/Bad Cases
- Good: add a new theme by updating `ThemeId`, `THEMES`, `normalizeTheme`, `normalize_theme`, and the theme CSS block together.
- Base: keep `jade-paper` as the default and let the app shell re-apply it on load.
- Bad: store user-facing labels such as `浅绿` in settings instead of stable ids.
- Bad: add a theme palette in CSS but forget the backend repair whitelist.

### 6. Tests Required
- Frontend test for `normalizeTheme` handling allowed ids, aliases, and unknown values.
- Backend test for `normalize_theme` preserving allowed ids and defaulting invalid values.
- UI verification that changing theme updates `data-theme` and persists across reload.
- Regression check for older settings files that still contain `jade` or `mint-blue`.

### 7. Wrong vs Correct
#### Wrong
```ts
data.settings.theme = "blue";
```
#### Correct
```ts
data.settings.theme = "soft-blue";
```

#### Wrong
```rust
match value.trim() {
  "jade" => "jade-paper".to_string(),
  _ => DEFAULT_THEME.to_string(),
}
```
#### Correct
```rust
match value.trim() {
  "jade" => DEFAULT_THEME.to_string(),
  "jade-paper" | "soft-blue" | "mint-paper" => value.trim().to_string(),
  "mint" | "mint-blue" => "mint-paper".to_string(),
  _ => DEFAULT_THEME.to_string(),
}
```
