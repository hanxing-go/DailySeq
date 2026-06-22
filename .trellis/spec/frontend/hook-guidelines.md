# Hook Guidelines

> This project does not currently use React custom hooks.

---

## Overview

DailySeq is a single TypeScript entrypoint in `src/main.ts` with module-scope
state, DOM event handlers, and Tauri commands. There are no `use*` exports in
`src/`, no React runtime, and no hook-based state layer.

The current pattern is:

- keep shared behavior as plain helper functions
- keep task-specific state in module-level variables
- wire UI events directly to small async handlers

Example:

```ts
let focusedTaskId: string | null = null;

composerElement.addEventListener("submit", (event) => {
  event.preventDefault();
  void addTask();
});
```

---

## Custom Hook Patterns

Do not introduce custom hooks just to create an abstraction. In this project,
plain helpers are the right default unless a repeated stateful pattern appears
and there is an actual React lifecycle to bind to.

If hooks are ever added later:

- name them `useX`
- keep them feature-local unless the same pattern is reused in multiple places
- extract only when the logic is stateful and repeated

---

## Data Fetching

There is no React Query or SWR setup here. App data is loaded and saved through
Tauri command calls and local async helpers.

Use the command boundary for serialization and error handling:

```ts
data = repairData(await invoke<DailySeqData>("load_dailyseq_data"));
```

Do not split the command call, parsing, and error handling across multiple
helpers unless the same flow is reused.

---

## Naming Conventions

- No `use*` functions exist today.
- If a custom hook is added in the future, its name must start with `use` and
  describe one concern clearly.
- Keep helper names descriptive and imperative when they are not hooks
  (`addTask`, `toggleTask`, `persist`, `render`).

---

## Common Mistakes

- Treating a plain helper as a hook.
- Adding a `hooks/` folder before there is a repeated pattern to justify it.
- Assuming the app has React state or a hook lifecycle because the word
  "hook" appears in the spec.
- Moving direct DOM/Tauri code into a fake hook abstraction when a local helper
  is simpler and clearer.
