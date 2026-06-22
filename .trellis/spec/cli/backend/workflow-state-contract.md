# Workflow-State Contract

## Scenario: Per-Turn Workflow-State Injection

### 1. Scope / Trigger
- Trigger: AI platform prompt hooks that inject the current Trellis workflow
  state into each turn.
- Source of truth: `[workflow-state:STATUS]` blocks in `.trellis/workflow.md`.
- Parser: `.trellis/scripts/common/workflow_phase.py` strips these blocks from
  phase summaries; platform injectors read the blocks directly from
  `workflow.md`.
- Why this matters: phase routing lives in the prompt breadcrumb, so required
  workflow steps must be present in the corresponding state block.

### 2. Signatures
- Block syntax:
  ```md
  [workflow-state:in_progress]
  prompt text
  [/workflow-state:in_progress]
  ```
- Status token: `[A-Za-z0-9_-]+`
- Current live statuses:
  - `no_task`
  - `planning`
  - `planning-inline`
  - `in_progress`
  - `in_progress-inline`
  - `completed`

### 3. Contracts
- `no_task` is a pseudo-status used when no active task resolves.
- `planning` maps to task JSON `status: planning`.
- `planning-inline` is the Codex inline variant of `planning`.
- `in_progress` maps to task JSON `status: in_progress` and must cover
  implementation, check, spec update, and commit reminders.
- `in_progress-inline` is the Codex inline variant of `in_progress`.
- `completed` exists for future lifecycle designs but is currently not reached
  in normal archive flow because `task.py archive` moves the task directory and
  clears active-session pointers in the same operation.
- If an injector cannot find a matching block, it should degrade visibly rather
  than silently inventing fallback workflow text.

### 4. Validation & Error Matrix
- Missing matching `[workflow-state:STATUS]` block -> visible generic fallback.
- Malformed close tag -> block is not recognized.
- Required Phase step missing from matching state block -> AI may skip the step.
- Custom status without a writer -> block is dead text.
- `completed` block in current flow -> dead text unless a future command creates
  an explicit active completed state before archive.

### 5. Good/Base/Bad Cases
- Good: `in_progress-inline` says `trellis-before-dev -> edit -> trellis-check
  -> validation -> trellis-update-spec -> commit`.
- Base: `planning-inline` tells Codex to skip JSONL curation and load context
  directly through `trellis-before-dev` in Phase 2.
- Bad: updating Phase 3.4 commit rules without adding a commit reminder to the
  `in_progress` and `in_progress-inline` blocks.

### 6. Tests Required
- Regression test that every required-once workflow walkthrough step has a
  matching enforcement/reminder line in the phase's state block.
- Parser test that workflow-state blocks are stripped from phase summaries.
- Parser test that status tokens allow letters, digits, underscores, and
  hyphens.

### 7. Wrong vs Correct
#### Wrong
```md
[workflow-state:in_progress]
Flow: implement -> check -> finish.
[/workflow-state:in_progress]
```
#### Correct
```md
[workflow-state:in_progress]
Flow: implement -> check -> update spec -> commit -> finish.
[/workflow-state:in_progress]
```

#### Wrong
Adding `status: blocked` to a task without adding a matching
`[workflow-state:blocked]` block and a lifecycle writer.

#### Correct
Add the status writer, the workflow-state block, and tests for the new routing.

## Scenario: Task Lifecycle Hooks

### 1. Scope / Trigger
- Trigger: Trellis task lifecycle commands.
- Relevant commands:
  - `task.py create`
  - `task.py start`
  - `task.py finish`
  - `task.py archive`
- Why this matters: hooks are the extension point for external sync
  (notifications, issue trackers, bookkeeping). They must not break the
  core task workflow.
- Current project state: hooks are optional, shell-based, and best-effort.
  The repo includes an example consumer at
  `.trellis/scripts/hooks/linear_sync.py`.

### 2. Signatures
- Config signature: `.trellis/config.yaml`
  ```yaml
  hooks:
    after_create:
      - "python .trellis/scripts/hooks/linear_sync.py create"
    after_start:
      - "python .trellis/scripts/hooks/linear_sync.py start"
    after_finish:
      - "python .trellis/scripts/hooks/linear_sync.py sync"
    after_archive:
      - "python .trellis/scripts/hooks/linear_sync.py archive"
  ```
- Loader signature: `get_hooks(event: str, repo_root: Path | None = None) -> list[str]`
- Runner signature: `run_task_hooks(event: str, task_json_path: Path, repo_root: Path) -> None`
- Lifecycle writers:
  - `cmd_create` writes `status: planning` and calls `after_create`
  - `cmd_start` writes `status: in_progress` and calls `after_start`
  - `cmd_finish` clears the active-task pointer and calls `after_finish`
  - `cmd_archive` writes `status: completed`, sets `completedAt`, moves the task, then calls `after_archive`

### 3. Contracts
- Supported hook events: `after_create`, `after_start`, `after_finish`,
  `after_archive`.
- Hook config must be a YAML list under `hooks.<event>`.
- Each list item is stringified and executed as a shell command.
- Commands run with `shell=True` and `cwd` set to the repo root.
- Commands inherit the current environment plus:
  - `TASK_JSON_PATH` = absolute path to the current event's `task.json`
- `TASK_JSON_PATH` points to the source task file for create/start/finish and
  to the archived task file for archive.
- Hook commands run in list order.
- A failing hook does not stop later hooks in the same list.

### 4. Validation & Error Matrix
- Missing `hooks` section -> no-op.
- Non-dict `hooks` value -> no-op.
- Unknown event key -> no-op.
- Non-list event value -> no-op.
- Hook command exits non-zero -> warning to stderr, main command continues.
- Hook subprocess raises an exception -> warning to stderr, main command continues.
- `task.py finish` with no current task -> no hook call.
- `task.py archive` when archive auto-commit fails -> returns 1 before
  `after_archive` runs.
- `task.py start` in degraded session mode still runs `after_start`; missing
  session identity does not disable hooks.

### Hook Reachability Matrix

| Event | Writer | Task JSON path | Status visible to hook | Blocking behavior |
|-------|--------|----------------|------------------------|-------------------|
| `after_create` | `cmd_create` | active task path | `planning` | warning-only |
| `after_start` | `cmd_start` | active task path | `in_progress` | warning-only |
| `after_finish` | `cmd_finish` | active task path | unchanged | warning-only |
| `after_archive` | `cmd_archive` | archived task path | `completed` | warning-only after archive succeeds |

### 5. Good/Base/Bad Cases
- Good: `after_create` syncs the newly written task, including parent linkage.
- Base: `after_start` updates external state after the task enters
  `in_progress`.
- Base: `after_finish` emits notifications when the active pointer is cleared,
  but does not imply task completion.
- Bad: using a hook to enforce core workflow correctness.
- Bad: assuming hook failure will abort archive or roll back the status write.

### 6. Tests Required
- Unit test `get_hooks` for:
  - missing config
  - malformed config
  - list-valued event
- Unit test `run_task_hooks` for:
  - `TASK_JSON_PATH` injection
  - repo-root working directory
  - sequential execution
  - warning-only failure handling
- Integration test or manual verification for lifecycle ordering:
  - `create` writes task data before hook execution
  - `start` updates status before hook execution
  - `finish` clears the active pointer before hook execution
  - `archive` runs hooks only after archive move and auto-commit gate

### 7. Wrong vs Correct
#### Wrong
```yaml
hooks:
  after_start: "python .trellis/scripts/hooks/linear_sync.py start"
```
#### Correct
```yaml
hooks:
  after_start:
    - "python .trellis/scripts/hooks/linear_sync.py start"
```

#### Wrong
Treating hook failure as a task failure.

#### Correct
Treating hook failure as a warning and letting the task command continue.
