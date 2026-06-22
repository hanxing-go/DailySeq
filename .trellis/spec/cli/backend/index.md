# Backend / Lifecycle Hooks

> Task lifecycle hook contract for Trellis commands.

---

## Overview

Read this layer before changing any task lifecycle command or hook behavior.
It documents the actual runtime contract used by `task.py` and the common
task helpers.

---

## Pre-Development Checklist

- Read [`workflow-state-contract.md`](./workflow-state-contract.md)
- Read the task lifecycle code in:
  - `.trellis/scripts/task.py`
  - `.trellis/scripts/common/task_store.py`
  - `.trellis/scripts/common/task_utils.py`
  - `.trellis/scripts/common/config.py`

---

## Quality Check

- Hook commands are best-effort and must not block task creation, start, or
  finish flow.
- `TASK_JSON_PATH` must point at the task's `task.json` for the current event.
- `after_archive` runs only after the archive move and auto-commit gate have
  succeeded.

