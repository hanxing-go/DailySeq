# Component Guidelines

> How components are built in this project.

---

## Overview

<!--
Document your project's component conventions here.

Questions to answer:
- What component patterns do you use?
- How are props defined?
- How do you handle composition?
- What accessibility standards apply?
-->

(To be filled by the team)

### Current Pattern: Date Header Controls

The main date label is the date-selection entry point. In `index.html`, keep
the visible date in `#date-title` inside `#date-title-button`, and render the
calendar with the project-owned `.date-picker-popover` DOM instead of a native
`input[type="date"]`.

Why: the app's lightweight sticky-note surface should avoid duplicated date
labels and browser-native calendar styling that cannot match the paper-like UI.

Good:

```html
<button id="date-title-button" type="button" aria-haspopup="dialog">
  <span id="date-title">6月16日 周二</span>
</button>
<div id="date-picker-popover" class="date-picker-popover" role="dialog"></div>
```

Avoid:

```html
<button id="today-button">今天</button>
<input id="date-picker" type="date" />
```

Do not keep a return-to-today control in the header. Put that action inside
the calendar popover as a quiet secondary text button, and hide it when the
current day/week/month is already being viewed.

### Current Pattern: Task Card Inline Editing

Task cards support inline text editing from a double-click, while card
reordering stays owned by the existing pointer-drag flow in `src/main.ts`.

Why: a normal click should still focus or use the task controls, and pointer
movement beyond `DRAG_START_THRESHOLD` should still start sorting. Inline edit
state must make the active card non-sortable and render the edit field as an
interactive target so dragging cannot start from inside the input.

Good:

```ts
taskListElement.addEventListener("dblclick", (event) => {
  const taskItem = target.closest<HTMLElement>("[data-task-id]");
  if (!taskItem || isInteractiveTaskTarget(target)) return;
  beginTaskTextEdit(taskId);
});
```

```ts
item.dataset.sortable = String(!isEditingLocked() && !isDeleting && !isEditing);
editInput.dataset.taskEdit = "true";
```

Avoid:

```ts
// Do not overload click or pointerdown to enter text editing.
taskListElement.addEventListener("pointerdown", () => beginTaskTextEdit(taskId));
```

Keyboard contract: Enter saves, Escape cancels, and blur saves. Empty edited
text is treated as cancel so task cards cannot become blank.

---

## Component Structure

<!-- Standard structure of a component file -->

(To be filled by the team)

---

## Props Conventions

<!-- How props should be defined and typed -->

(To be filled by the team)

---

## Styling Patterns

<!-- How styles are applied (CSS modules, styled-components, Tailwind, etc.) -->

(To be filled by the team)

---

## Accessibility

<!-- A11y requirements and patterns -->

(To be filled by the team)

---

## Common Mistakes

<!-- Component-related mistakes your team has made -->

(To be filled by the team)
