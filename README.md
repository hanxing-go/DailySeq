# DailySeq

<p align="center">
  <strong>A refined desktop sticky-note planner for daily, weekly, and monthly focus.</strong>
</p>

<p align="center">
  <a href="#zh-cn">简体中文</a> ·
  <a href="#en">English</a> ·
  <a href="#ja">日本語</a>
</p>

<p align="center">
  <a href="https://github.com/hanxing-go/DailySeq/releases/tag/v1.0.0">Download v1.0.0</a>
</p>

---

<h2 id="zh-cn">简体中文</h2>

DailySeq 是一款轻量、优雅、离线优先的桌面便签式计划工具。它不是一个沉重的项目管理系统，而是一张随叫随到的精致桌面便签：用一个全局快捷键唤出，快速写下今天、本周或本月真正要推进的事项，然后回到工作本身。

## 核心优势

- **快速捕捉**：通过全局快捷键打开或隐藏悬浮面板，不打断当前工作流。
- **三层计划视图**：支持 Day、Week、Month 三种计划粒度，适合日清单、周推进和月目标。
- **始终在手边**：窗口紧凑、置顶、无边框，关闭时隐藏到托盘而不是退出。
- **本地优先**：计划数据保存在本机 Tauri 应用数据目录下的 `dailyseq.json`，无需账号、无需云服务、无遥测。
- **任务控制完整**：添加、完成、删除、双击编辑、低/中/高重要性、手动拖拽排序一应俱全。
- **数据保护**：数据文件加载中或解析失败时自动锁定编辑，避免空数据覆盖已有计划。
- **轻量架构**：基于 Tauri 2、Rust 和 Vanilla TypeScript，使用系统 WebView，不捆绑 Chromium，不引入重型前端框架。
- **克制的交互质感**：纸感界面、主题切换、完成反馈、全完成奖励都以短促的一次性动效呈现，不制造持续干扰。

## 功能概览

### 计划视图

DailySeq 支持三个互相独立的计划维度：

| 视图 | 适用场景 | 存储键 |
| --- | --- | --- |
| Day | 今天要完成的小事、明天安排、回看昨天 | 本地 ISO 日期，如 `2026-06-22` |
| Week | 本周要推进的重点 | 本地周一日期，如 `2026-06-22` |
| Month | 本月方向和阶段目标 | 年月键，如 `2026-06` |

切换日期、周或月份不会自动写入空计划；只有真正修改任务时才会保存。

### 任务能力

- 新增任务，默认低重要性。
- 双击任务卡片可直接修改内容。
- 完成或恢复任务，已完成任务自动沉到未完成任务下方。
- 删除任务。
- 设置低、中、高重要性，未完成任务会按高、中、低重新分组。
- 拖拽同一完成状态分组内的任务来调整顺序。
- 通过键盘快捷键完成常见操作。

### 桌面体验

- 主窗口是一个紧凑的置顶便签面板。
- 面板边缘和空白区域可拖动窗口。
- 按钮、输入框、任务卡片、滚动条和任务控件保持原生交互，不会误触发窗口拖动。
- 关闭按钮和 `Esc` 会隐藏窗口到托盘。
- 托盘菜单支持显示、隐藏和退出。

## 安装

前往 Release 页面下载最新安装包：

[DailySeq v1.0.0 Release](https://github.com/hanxing-go/DailySeq/releases/tag/v1.0.0)

当前 v1.0.0 提供 Windows x64 安装包：

- `DailySeq_1.0.0_x64-setup.exe`
- `DailySeq_1.0.0_x64_en-US.msi`

已发布用户只需要安装包，不需要安装 Rust、Node.js、npm 或克隆本仓库。

## 默认快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+Alt+D` | Windows/Linux 显示或隐藏 DailySeq |
| `Command+Option+D` | macOS 显示或隐藏 DailySeq |
| `Esc` | 焦点不在文本输入中时隐藏窗口到托盘 |
| `Ctrl+Enter` | 添加当前输入的任务 |
| `Alt+Left` / `Alt+Right` | 切换到上一个/下一个日、周或月计划 |
| `Space` | 切换聚焦任务的完成状态 |
| `Delete` | 删除聚焦任务 |
| `Ctrl+1` / `Ctrl+2` / `Ctrl+3` | 设置聚焦任务为低/中/高重要性 |

## 数据与隐私

- DailySeq 默认离线运行。
- 数据保存在本机 `dailyseq.json`。
- 保存时先写入同目录临时文件，再替换正式数据文件，降低写入中断导致的数据损坏风险。
- 不需要账户。
- 不上传计划内容。
- 不包含遥测。
- 不依赖远程字体或远程资源。

## 技术栈

- Desktop shell: Tauri 2
- Native runtime: Rust
- Front end: Vanilla TypeScript, HTML, CSS
- Build tool: Vite
- Storage: local JSON managed by the Tauri Rust side

## 本地开发

安装依赖：

```sh
npm install
```

启动开发环境：

```sh
npm run tauri:dev
```

前端构建：

```sh
npm run build
```

综合检查：

```sh
npm run check
```

打包当前平台的桌面安装包：

```sh
npm run bundle
```

等价命令：

```sh
npm run build:desktop
npm run tauri:build
```

Windows 打包产物通常位于：

```text
src-tauri/target/release/bundle/msi/
src-tauri/target/release/bundle/nsis/
```

## 平台要求

开发者需要先安装 Tauri 官方前置依赖。系统包名称可能随平台变化，请以官方文档为准：

https://v2.tauri.app/start/prerequisites/

Windows 开发通常需要 Node.js LTS、Rust MSVC toolchain、Microsoft C++ Build Tools 和 WebView2 Runtime。macOS 需要 Node.js、Rust 和 Xcode Command Line Tools。Linux 需要 Node.js、Rust、WebKitGTK 以及对应发行版的构建工具。

---

<h2 id="en">English</h2>

DailySeq is a lightweight, elegant, local-first desktop sticky-note planner. It is not a heavy project management suite. It is a refined note panel that appears when you need it, captures what matters today, this week, or this month, and then gets out of the way.

## Why DailySeq

- **Instant capture**: summon or hide the panel with a global shortcut.
- **Three planning horizons**: Day, Week, and Month views for daily execution, weekly momentum, and monthly direction.
- **Always within reach**: compact, always-on-top, borderless, and tray-resident.
- **Local-first by design**: plans are stored on your machine as `dailyseq.json`; no account, no cloud dependency, no telemetry.
- **Complete task controls**: add, complete, delete, double-click edit, prioritize, and drag reorder tasks.
- **Data-safe behavior**: editing is blocked while data is loading or when the data file cannot be parsed, preventing accidental overwrites.
- **Small modern desktop stack**: Tauri 2, Rust, and Vanilla TypeScript use the system WebView instead of bundling Chromium.
- **Calm interaction polish**: paper-like themes, concise task feedback, and one-shot completion rewards without continuous motion.

## Feature Overview

### Planning Views

DailySeq keeps three independent planning scopes:

| View | Best for | Storage key |
| --- | --- | --- |
| Day | today, tomorrow, yesterday, and specific dated plans | local ISO date, such as `2026-06-22` |
| Week | weekly priorities and momentum | local Monday date, such as `2026-06-22` |
| Month | monthly direction and stage goals | month key, such as `2026-06` |

Viewing an empty date, week, or month does not create saved data. DailySeq writes a plan only after tasks change.

### Task Workflow

- Add tasks with low importance by default.
- Double-click a task card to edit its content inline.
- Complete or restore a task; completed tasks stay below unfinished tasks.
- Delete tasks.
- Set low, medium, or high importance; unfinished tasks regroup by high, medium, then low.
- Drag tasks within the same completion group to manually reorder them.
- Use keyboard shortcuts for fast repeated actions.

### Desktop Behavior

- The main window is a compact always-on-top note panel.
- The panel edge and blank shell areas can drag the window.
- Buttons, inputs, task cards, scrollbars, and task controls keep their normal interactions.
- The close button and `Esc` hide the window to the tray instead of quitting.
- The tray/menu-bar entry supports show, hide, and quit.

## Installation

Download the latest installer from the Release page:

[DailySeq v1.0.0 Release](https://github.com/hanxing-go/DailySeq/releases/tag/v1.0.0)

The current v1.0.0 release includes Windows x64 installers:

- `DailySeq_1.0.0_x64-setup.exe`
- `DailySeq_1.0.0_x64_en-US.msi`

Released users only need the installer. Rust, Node.js, npm, and this repository are required only for development or packaging.

## Default Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Alt+D` | Show or hide DailySeq on Windows/Linux |
| `Command+Option+D` | Show or hide DailySeq on macOS |
| `Esc` | Hide the window to the tray when focus is outside text editing |
| `Ctrl+Enter` | Add the typed task |
| `Alt+Left` / `Alt+Right` | Move to the previous/next day, week, or month |
| `Space` | Toggle the focused task |
| `Delete` | Delete the focused task |
| `Ctrl+1` / `Ctrl+2` / `Ctrl+3` | Set focused task importance to low/medium/high |

## Data and Privacy

- DailySeq runs offline by default.
- Plans are stored locally in `dailyseq.json`.
- Saves write a temporary file in the same directory before replacing the real data file.
- No account is required.
- Task content is not uploaded.
- No telemetry is included.
- No remote fonts or remote assets are used.

## Tech Stack

- Desktop shell: Tauri 2
- Native runtime: Rust
- Front end: Vanilla TypeScript, HTML, CSS
- Build tool: Vite
- Storage: local JSON managed by the Tauri Rust side

## Local Development

Install dependencies:

```sh
npm install
```

Start the desktop development shell:

```sh
npm run tauri:dev
```

Build the front end:

```sh
npm run build
```

Run the combined local check:

```sh
npm run check
```

Package the desktop app for the current host platform:

```sh
npm run bundle
```

Equivalent aliases:

```sh
npm run build:desktop
npm run tauri:build
```

Windows release artifacts are usually written to:

```text
src-tauri/target/release/bundle/msi/
src-tauri/target/release/bundle/nsis/
```

## Platform Requirements

Install the official Tauri prerequisites before developing or packaging. The official documentation is the source of truth when operating system package names change:

https://v2.tauri.app/start/prerequisites/

Windows development typically requires Node.js LTS, Rust with the MSVC toolchain, Microsoft C++ Build Tools, and WebView2 Runtime. macOS requires Node.js, Rust, and Xcode Command Line Tools. Linux requires Node.js, Rust, WebKitGTK, and distro-specific build packages.

---

<h2 id="ja">日本語</h2>

DailySeq は、軽量で上品なローカルファーストのデスクトップ付箋型プランナーです。重たいプロジェクト管理ツールではありません。必要な瞬間にショートカットで呼び出し、今日・今週・今月の本当に進めたいことを書き留め、すぐに作業へ戻るための小さなデスクトップパネルです。

## DailySeq の強み

- **すばやい記録**：グローバルショートカットでパネルを表示・非表示。
- **3 つの計画スコープ**：Day、Week、Month により、日々の実行、週次の推進、月次の方向づけを分けて管理。
- **常に手元にある体験**：コンパクト、常に最前面、ボーダーレス、トレイ常駐。
- **ローカルファースト**：計画データは端末内の `dailyseq.json` に保存。アカウント不要、クラウド不要、テレメトリなし。
- **十分なタスク操作**：追加、完了、削除、ダブルクリック編集、重要度設定、ドラッグ並べ替えに対応。
- **データ保護**：データ読み込み中、または既存データを解析できない場合は編集をロックし、誤った上書きを防止。
- **小さく現代的なデスクトップ構成**：Tauri 2、Rust、Vanilla TypeScript を採用し、Chromium を同梱せずシステム WebView を利用。
- **落ち着いた操作感**：紙のようなテーマ、短いフィードバック、全完了時の一度きりの演出で、作業の集中を邪魔しません。

## 機能概要

### 計画ビュー

DailySeq は 3 つの独立した計画スコープを持ちます。

| ビュー | 用途 | 保存キー |
| --- | --- | --- |
| Day | 今日、明日、昨日、特定日のタスク | ローカル ISO 日付、例 `2026-06-22` |
| Week | 週次の重点と進捗 | ローカル月曜の日付、例 `2026-06-22` |
| Month | 月次の方向性と段階目標 | 年月キー、例 `2026-06` |

空の日・週・月を表示しただけでは保存データは作成されません。タスクを変更したときだけ保存されます。

### タスク操作

- 新規タスクは低重要度で追加されます。
- タスクカードをダブルクリックすると、その場で内容を編集できます。
- タスクの完了・復元に対応し、完了済みタスクは未完了タスクの下に配置されます。
- タスクを削除できます。
- 低・中・高の重要度を設定でき、未完了タスクは高・中・低の順に整理されます。
- 同じ完了状態のグループ内でドラッグして手動並べ替えできます。
- キーボードショートカットで反復操作を素早く実行できます。

### デスクトップ動作

- メインウィンドウはコンパクトな常時最前面のノートパネルです。
- パネルの端や空白部分からウィンドウをドラッグできます。
- ボタン、入力欄、タスクカード、スクロールバー、タスク操作部品は通常の操作を維持します。
- 閉じるボタンと `Esc` はアプリを終了せず、ウィンドウをトレイへ隠します。
- トレイ/メニューバーから表示、非表示、終了を操作できます。

## インストール

最新のインストーラーは Release ページからダウンロードできます。

[DailySeq v1.0.0 Release](https://github.com/hanxing-go/DailySeq/releases/tag/v1.0.0)

現在の v1.0.0 リリースには Windows x64 インストーラーが含まれます。

- `DailySeq_1.0.0_x64-setup.exe`
- `DailySeq_1.0.0_x64_en-US.msi`

通常の利用者はインストーラーだけで利用できます。Rust、Node.js、npm、このリポジトリは開発またはパッケージ作成時のみ必要です。

## 既定ショートカット

| ショートカット | 動作 |
| --- | --- |
| `Ctrl+Alt+D` | Windows/Linux で DailySeq を表示・非表示 |
| `Command+Option+D` | macOS で DailySeq を表示・非表示 |
| `Esc` | テキスト編集中でない場合、ウィンドウをトレイへ隠す |
| `Ctrl+Enter` | 入力中のタスクを追加 |
| `Alt+Left` / `Alt+Right` | 前/次の日・週・月へ移動 |
| `Space` | フォーカス中のタスクの完了状態を切り替え |
| `Delete` | フォーカス中のタスクを削除 |
| `Ctrl+1` / `Ctrl+2` / `Ctrl+3` | フォーカス中のタスクを低/中/高重要度に設定 |

## データとプライバシー

- DailySeq は既定でオフライン動作します。
- 計画データはローカルの `dailyseq.json` に保存されます。
- 保存時は同じディレクトリに一時ファイルを書き込み、その後に正式なデータファイルを置き換えます。
- アカウントは不要です。
- タスク内容はアップロードされません。
- テレメトリは含まれていません。
- リモートフォントやリモートアセットは使用しません。

## 技術スタック

- Desktop shell: Tauri 2
- Native runtime: Rust
- Front end: Vanilla TypeScript, HTML, CSS
- Build tool: Vite
- Storage: Tauri の Rust 側で管理するローカル JSON

## ローカル開発

依存関係をインストールします。

```sh
npm install
```

デスクトップ開発環境を起動します。

```sh
npm run tauri:dev
```

フロントエンドをビルドします。

```sh
npm run build
```

ローカルチェックを実行します。

```sh
npm run check
```

現在のホスト OS 向けにデスクトップアプリをパッケージします。

```sh
npm run bundle
```

同等のコマンド:

```sh
npm run build:desktop
npm run tauri:build
```

Windows のリリース成果物は通常、以下に生成されます。

```text
src-tauri/target/release/bundle/msi/
src-tauri/target/release/bundle/nsis/
```

## プラットフォーム要件

開発またはパッケージ作成の前に、Tauri 公式の前提条件をインストールしてください。OS パッケージ名が変わる場合があるため、公式ドキュメントを正とします。

https://v2.tauri.app/start/prerequisites/

Windows 開発では通常、Node.js LTS、Rust MSVC toolchain、Microsoft C++ Build Tools、WebView2 Runtime が必要です。macOS では Node.js、Rust、Xcode Command Line Tools が必要です。Linux では Node.js、Rust、WebKitGTK、各ディストリビューションのビルド用パッケージが必要です。
