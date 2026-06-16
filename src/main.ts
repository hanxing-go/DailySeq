import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./styles.css";

type Importance = "low" | "medium" | "high";
type DropPosition = "before" | "after";
type PlanScope = "week" | "day" | "month";

const DEFAULT_IMPORTANCE: Importance = "low";
const LOCALE = "zh-CN";
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const WEEK_IN_MS = 7 * DAY_IN_MS;
const DRAG_START_THRESHOLD = 6;
const DRAG_SCROLL_EDGE_SIZE = 42;
const DRAG_SCROLL_MAX_STEP = 14;
const TASK_COMPLETION_FEEDBACK_MS = 1200;
const TASK_LAYOUT_ANIMATION_MS = 620;
const LOADING_PLACEHOLDER = "正在读取计划，暂时无法编辑";
const LOAD_BLOCKED_PLACEHOLDER = "读取失败，暂时无法编辑";
const REWARD_SPARKS = [
  { x: -112, y: -30, delay: 20 },
  { x: -86, y: 34, delay: 80 },
  { x: -56, y: -70, delay: 110 },
  { x: -24, y: 62, delay: 40 },
  { x: 18, y: -86, delay: 140 },
  { x: 46, y: 48, delay: 70 },
  { x: 76, y: -54, delay: 0 },
  { x: 104, y: 22, delay: 120 },
  { x: 128, y: -18, delay: 170 },
  { x: 2, y: -44, delay: 50 },
] as const;
const IMPORTANCE_LABELS: Record<Importance, string> = {
  low: "低",
  medium: "中",
  high: "高",
};
const IMPORTANCE_SORT_ORDER: Record<Importance, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

interface Task {
  id: string;
  text: string;
  importance: Importance;
  done: boolean;
  createdAt: string;
  completedAt: string | null;
  order: number;
}

interface DayPlan {
  tasks: Task[];
}

type PlanMap = Record<string, DayPlan>;

interface DaynoteData {
  days: PlanMap;
  weeks: PlanMap;
  months: PlanMap;
  settings: {
    theme: string;
  };
}

interface TaskDragCandidate {
  taskId: string;
  pointerId: number;
  startX: number;
  startY: number;
  item: HTMLElement;
}

interface TaskDragState extends TaskDragCandidate {
  lastY: number;
}

const appWindow = getCurrentWindow();

let data: DaynoteData = createEmptyData();
let currentPlanScope: PlanScope = "day";
let viewedDate = startOfLocalDay(new Date());
let viewedDateKey = toIsoDate(viewedDate);
let focusedTaskId: string | null = null;
let isLoading = true;
let isSaving = false;
let isLoadBlocked = false;
let draggedTaskId: string | null = null;
let dropTargetTaskId: string | null = null;
let dropPosition: DropPosition = "before";
let taskDragCandidate: TaskDragCandidate | null = null;
let taskDragState: TaskDragState | null = null;
let suppressNextTaskClick = false;
let dragScrollFrame = 0;
let recentlyAddedTaskId: string | null = null;
let recentlyCompletedTaskId: string | null = null;
let addFeedbackTimer: number | null = null;
let completeFeedbackTimer: number | null = null;
let rewardTimer: number | null = null;
const allDoneStateByPlan = new Map<string, boolean>();

const noteShellElement = requireElement<HTMLElement>("#app");
const scopeTabElements = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-plan-scope]"));
const weekdayElement = requireElement<HTMLElement>("#weekday");
const dateTitleElement = requireElement<HTMLHeadingElement>("#date-title");
const todayButtonElement = requireElement<HTMLButtonElement>("#today-button");
const datePickerElement = requireElement<HTMLInputElement>("#date-picker");
const previousDayButtonElement = requireElement<HTMLButtonElement>("#previous-day");
const nextDayButtonElement = requireElement<HTMLButtonElement>("#next-day");
const hideToTrayButtonElement = requireElement<HTMLButtonElement>("#hide-to-tray");
const composerElement = requireElement<HTMLFormElement>("#composer");
const taskInputElement = requireElement<HTMLInputElement>("#task-input");
const addTaskButtonElement = requireElement<HTMLButtonElement>("#add-task");
const statusMessageElement = requireElement<HTMLParagraphElement>("#status-message");
const emptyStateElement = requireElement<HTMLElement>("#empty-state");
const emptyStateTitleElement = requireElement<HTMLParagraphElement>("#empty-state-title");
const emptyStateDetailElement = requireElement<HTMLElement>("#empty-state-detail");
const taskListElement = requireElement<HTMLUListElement>("#task-list");
const allDoneRewardElement = requireElement<HTMLElement>("#all-done-reward");

noteShellElement.addEventListener("pointerdown", (event) => {
  if (!canStartWindowDrag(event)) {
    return;
  }

  void appWindow.startDragging();
});

composerElement.addEventListener("submit", (event) => {
  event.preventDefault();
  void addTask();
});

taskInputElement.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.ctrlKey) {
    event.preventDefault();
    void addTask();
  }
});

scopeTabElements.forEach((button) => {
  button.addEventListener("click", () => {
    const scope = button.dataset.planScope;

    if (isPlanScope(scope)) {
      switchPlanScope(scope);
    }
  });

  button.addEventListener("keydown", handleScopeTabKeyDown);
});

previousDayButtonElement.addEventListener("click", () => {
  navigatePlan(-1);
});

nextDayButtonElement.addEventListener("click", () => {
  navigatePlan(1);
});

todayButtonElement.addEventListener("click", () => {
  goToToday();
});

datePickerElement.addEventListener("change", () => {
  goToPickedDate(datePickerElement.value);
});

hideToTrayButtonElement.addEventListener("click", () => {
  void hideToTray();
});

document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.isComposing) {
    return;
  }

  if (isTextEntryElement(document.activeElement)) {
    return;
  }

  if (isHideToTrayShortcut(event)) {
    event.preventDefault();
    void hideToTray();
    return;
  }

  if (!isDayNavigationShortcut(event)) {
    return;
  }

  event.preventDefault();
  navigatePlan(event.key === "ArrowLeft" ? -1 : 1);
});

taskListElement.addEventListener("click", (event) => {
  if (suppressNextTaskClick) {
    event.preventDefault();
    event.stopPropagation();
    suppressNextTaskClick = false;
    return;
  }

  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const taskItem = target.closest<HTMLElement>("[data-task-id]");

  if (!taskItem) {
    return;
  }

  const taskId = taskItem.dataset.taskId ?? null;
  focusedTaskId = taskId;

  const importanceButton = target.closest<HTMLButtonElement>("button[data-importance]");

  if (importanceButton) {
    const importance = importanceButton.dataset.importance;

    if (taskId && isImportance(importance)) {
      void setTaskImportance(taskId, importance);
    }

    return;
  }

  if (target.closest("[data-action='toggle']")) {
    void toggleTask(taskId);
    return;
  }

  if (target.closest("[data-action='delete']")) {
    void deleteTask(taskId);
  }
});

taskListElement.addEventListener("focusin", (event) => {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  focusedTaskId = target.closest<HTMLElement>("[data-task-id]")?.dataset.taskId ?? null;
});

taskListElement.addEventListener("pointerdown", (event) => {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  if (event.button !== 0 || isEditingLocked()) {
    return;
  }

  const taskItem = target.closest<HTMLElement>("[data-task-id]");

  if (!taskItem || isInteractiveTaskTarget(target)) {
    return;
  }

  const taskId = taskItem.dataset.taskId ?? null;

  if (!taskId) {
    return;
  }

  taskDragCandidate = {
    taskId,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    item: taskItem,
  };
});

document.addEventListener("pointermove", (event) => {
  if (!taskDragCandidate || event.pointerId !== taskDragCandidate.pointerId || isEditingLocked()) {
    return;
  }

  const distance = Math.hypot(event.clientX - taskDragCandidate.startX, event.clientY - taskDragCandidate.startY);

  if (!taskDragState) {
    if (distance < DRAG_START_THRESHOLD) {
      return;
    }

    beginTaskDrag(taskDragCandidate, event);
  }

  if (!taskDragState) {
    return;
  }

  event.preventDefault();
  taskDragState.lastY = event.clientY;
  setDropTargetFromPoint(event.clientY);
  scheduleDragAutoScroll();
});

document.addEventListener("pointerup", (event) => {
  if (!taskDragCandidate || event.pointerId !== taskDragCandidate.pointerId) {
    return;
  }

  finishTaskDrag(event.clientY);
});

document.addEventListener("pointercancel", (event) => {
  if (!taskDragCandidate || event.pointerId !== taskDragCandidate.pointerId) {
    return;
  }

  clearDragState();
});

taskListElement.addEventListener("keydown", (event) => {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const taskItem = target.closest<HTMLElement>("[data-task-id]");

  if (!taskItem) {
    return;
  }

  const taskId = taskItem.dataset.taskId ?? null;
  const isInteractive = Boolean(target.closest("button, input, textarea, select, a, [role='button']"));

  if (taskId && event.ctrlKey && isPriorityShortcut(event.key)) {
    event.preventDefault();
    void setTaskImportance(taskId, importanceFromShortcut(event.key));
    return;
  }

  if (!isInteractive && (event.key === " " || event.code === "Space")) {
    event.preventDefault();
    void toggleTask(taskId);
    return;
  }

  if (!isInteractive && event.key === "Delete") {
    event.preventDefault();
    void deleteTask(taskId);
  }
});

renderDateHeader();
updateBusyState();
void initialize();

async function initialize() {
  setStatus("正在读取计划...");
  updateBusyState();

  try {
    data = repairData(await invoke<DaynoteData>("load_daynote_data"));
    isLoading = false;
    isLoadBlocked = false;
    setStatus("");
  } catch (error) {
    isLoading = false;
    data = createEmptyData();
    isLoadBlocked = true;
    taskInputElement.value = "";
    clearDragState();
    setStatus(
      `读取失败：${formatError(error)}。为避免覆盖已有数据，DayNote 已暂停编辑和保存。请重启应用，或检查应用数据目录中的 daynote.json。`,
      true,
    );
  }

  updateBusyState();
  render();
  recordViewedAllDoneState();

  if (!isLoadBlocked) {
    taskInputElement.focus();
  }
}

async function addTask() {
  const text = taskInputElement.value.trim();

  if (isEditingLocked() || !text) {
    return;
  }

  const tasks = getMutableViewedTasks();
  const task: Task = {
    id: createTaskId(),
    text,
    importance: DEFAULT_IMPORTANCE,
    done: false,
    createdAt: new Date().toISOString(),
    completedAt: null,
    order: getNextOrder(tasks),
  };

  tasks.push(task);
  sortAndResequenceTasks(tasks);
  taskInputElement.value = "";
  focusedTaskId = task.id;
  markTaskAsAdded(task.id);
  recordViewedAllDoneState();
  render();
  await persist("已添加");
  focusTask(task.id);
}

async function toggleTask(taskId: string | null) {
  if (isEditingLocked() || !taskId) {
    return;
  }

  const task = findTask(taskId);

  if (!task) {
    return;
  }

  const wasAllDone = getRecordedAllDoneState();
  const taskLayoutBeforeToggle = captureTaskLayout();
  task.done = !task.done;
  task.completedAt = task.done ? new Date().toISOString() : null;
  task.order = task.done ? getPreviousOrderInGroup(getViewedTasks(), true, task.id) : getNextOrderInGroup(getViewedTasks(), false, task.importance, task.id);
  sortAndResequenceTasks(getViewedTasks());
  focusedTaskId = task.id;
  if (task.done) {
    markTaskAsCompleted(task.id);
  } else if (recentlyCompletedTaskId === task.id) {
    clearCompletedFeedback();
  }
  render();
  animateTaskLayoutFrom(taskLayoutBeforeToggle);
  const shouldReward = recordAllDoneTransition(wasAllDone);
  const saved = await persist(shouldReward ? formatAllDoneSaveStatus() : task.done ? "已完成" : "已恢复", {
    rerender: false,
  });
  if (saved && shouldReward) {
    triggerAllDoneReward();
  }
  focusTask(task.id);
}

async function setTaskImportance(taskId: string, importance: Importance) {
  if (isEditingLocked()) {
    return;
  }

  const task = findTask(taskId);

  if (!task || task.importance === importance) {
    return;
  }

  task.importance = importance;
  sortAndResequenceTasks(getViewedTasks());
  focusedTaskId = task.id;
  render();
  await persist(`已设为${IMPORTANCE_LABELS[importance]}重要性`);
  focusTask(task.id);
}

async function deleteTask(taskId: string | null) {
  if (isEditingLocked() || !taskId) {
    return;
  }

  const tasks = getViewedTasks();
  const index = tasks.findIndex((task) => task.id === taskId);

  if (index === -1) {
    return;
  }

  const wasAllDone = getRecordedAllDoneState();
  if (recentlyAddedTaskId === taskId) {
    clearAddedFeedback();
  }
  if (recentlyCompletedTaskId === taskId) {
    clearCompletedFeedback();
  }
  tasks.splice(index, 1);
  sortAndResequenceTasks(tasks);
  focusedTaskId = tasks[Math.min(index, tasks.length - 1)]?.id ?? null;
  render();
  const shouldReward = recordAllDoneTransition(wasAllDone);
  const saved = await persist(shouldReward ? "剩下的计划都完成了" : "已删除");
  if (saved && shouldReward) {
    triggerAllDoneReward();
  }

  if (focusedTaskId) {
    focusTask(focusedTaskId);
  } else {
    taskInputElement.focus();
  }
}

async function persist(successMessage: string, options: { rerender?: boolean } = {}) {
  if (isLoading || isLoadBlocked) {
    return false;
  }

  isSaving = true;
  updateBusyState();
  setStatus("正在保存...");

  try {
    data = repairData(await invoke<DaynoteData>("save_daynote_data", { data }));
    setStatus(successMessage);
    return true;
  } catch (error) {
    setStatus(`保存失败：${formatError(error)}`, true);
    return false;
  } finally {
    isSaving = false;
    updateBusyState();
    if (options.rerender !== false) {
      render();
    }
  }
}

async function hideToTray() {
  try {
    await invoke("hide_main_window");
  } catch (error) {
    setStatus(`关闭到托盘失败：${formatError(error)}`, true);
  }
}

function render() {
  renderScopeTabs();
  renderDateHeader();
  renderEmptyState();

  const tasks = getViewedTasks();

  emptyStateElement.hidden = tasks.length > 0;
  taskListElement.hidden = tasks.length === 0;
  taskListElement.setAttribute("aria-label", `${formatReadableViewedDate()}的计划`);
  taskListElement.replaceChildren(...tasks.map(renderTask));
}

function renderTask(task: Task) {
  const item = document.createElement("li");
  item.className = `task-item${task.done ? " is-done" : ""}`;
  if (task.id === recentlyAddedTaskId) {
    item.classList.add("is-new");
  }
  if (task.id === recentlyCompletedTaskId) {
    item.classList.add("is-completing");
  }
  item.dataset.taskId = task.id;
  item.dataset.importance = task.importance;
  item.dataset.sortable = String(!isEditingLocked());
  item.tabIndex = 0;
  item.setAttribute(
    "aria-label",
    `${task.done ? "已完成" : "未完成"}，重要性 ${IMPORTANCE_LABELS[task.importance]}，${task.text}`,
  );

  const toggleButton = document.createElement("button");
  toggleButton.className = "task-toggle";
  toggleButton.type = "button";
  toggleButton.disabled = isEditingLocked();
  toggleButton.dataset.action = "toggle";
  toggleButton.setAttribute(
    "aria-label",
    task.done ? `标记为未完成：${task.text}` : `标记为已完成：${task.text}`,
  );
  toggleButton.setAttribute("aria-pressed", String(task.done));

  const content = document.createElement("div");
  content.className = "task-content";

  const textElement = document.createElement("span");
  textElement.className = "task-text";
  textElement.textContent = task.text;

  const meta = document.createElement("div");
  meta.className = "task-meta";

  const importanceGroup = document.createElement("div");
  importanceGroup.className = "task-importance";
  importanceGroup.setAttribute("role", "group");
  importanceGroup.setAttribute("aria-label", "设置重要性");

  for (const importance of ["low", "medium", "high"] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `priority-button priority-${importance}`;
    button.dataset.importance = importance;
    button.disabled = isEditingLocked();
    button.textContent = IMPORTANCE_LABELS[importance];
    button.setAttribute("aria-label", `设为${IMPORTANCE_LABELS[importance]}重要性`);
    button.setAttribute("aria-pressed", String(task.importance === importance));
    if (task.importance === importance) {
      button.classList.add("is-active");
    }
    importanceGroup.append(button);
  }

  meta.append(importanceGroup);
  content.append(textElement, meta);

  const deleteButton = document.createElement("button");
  deleteButton.className = "task-delete";
  deleteButton.type = "button";
  deleteButton.disabled = isEditingLocked();
  deleteButton.dataset.action = "delete";
  deleteButton.setAttribute("aria-label", `删除任务：${task.text}`);
  deleteButton.textContent = "×";

  item.append(toggleButton, content, deleteButton);

  if (task.id === recentlyCompletedTaskId) {
    const sheen = document.createElement("span");
    sheen.className = "task-sheen";
    sheen.setAttribute("aria-hidden", "true");
    item.append(sheen);
  }

  return item;
}

function navigatePlan(offset: number) {
  if (isLoading || isSaving) {
    return;
  }

  setViewedDate(addPlanOffset(viewedDate, currentPlanScope, offset));
}

function goToToday() {
  if (isLoading || isSaving) {
    return;
  }

  setViewedDate(new Date());
}

function goToPickedDate(value: string) {
  if (isLoading || isSaving) {
    return;
  }

  const pickedDate = parseIsoDateInput(value);

  if (!pickedDate) {
    datePickerElement.value = viewedDateKey;
    return;
  }

  setViewedDate(pickedDate);
}

function setViewedDate(date: Date) {
  viewedDate = startOfLocalDay(date);
  viewedDateKey = toIsoDate(viewedDate);
  focusedTaskId = null;
  if (!isLoadBlocked) {
    setStatus("");
  }
  clearDragState();
  hideAllDoneReward();
  updateBusyState();
  render();
  recordViewedAllDoneState();
}

function switchPlanScope(scope: PlanScope) {
  if (currentPlanScope === scope || isLoading || isSaving) {
    return;
  }

  currentPlanScope = scope;
  focusedTaskId = null;
  if (!isLoadBlocked) {
    setStatus("");
  }
  clearDragState();
  hideAllDoneReward();
  updateBusyState();
  render();
  recordViewedAllDoneState();
}

function handleScopeTabKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing) {
    return;
  }

  const currentTab = event.currentTarget;

  if (!(currentTab instanceof HTMLButtonElement) || currentTab.disabled) {
    return;
  }

  const currentIndex = scopeTabElements.indexOf(currentTab);

  if (currentIndex === -1) {
    return;
  }

  let nextIndex: number;

  switch (event.key) {
    case "ArrowRight":
    case "ArrowDown":
      nextIndex = (currentIndex + 1) % scopeTabElements.length;
      break;
    case "ArrowLeft":
    case "ArrowUp":
      nextIndex = (currentIndex - 1 + scopeTabElements.length) % scopeTabElements.length;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = scopeTabElements.length - 1;
      break;
    default:
      return;
  }

  const nextTab = scopeTabElements[nextIndex];
  const nextScope = nextTab?.dataset.planScope;

  if (!nextTab || !isPlanScope(nextScope)) {
    return;
  }

  event.preventDefault();
  switchPlanScope(nextScope);
  nextTab.focus();
}

function renderScopeTabs() {
  const navigationLocked = isLoading || isSaving;

  scopeTabElements.forEach((button) => {
    const isSelected = button.dataset.planScope === currentPlanScope;
    button.classList.toggle("is-active", isSelected);
    button.disabled = navigationLocked;
    button.tabIndex = isSelected ? 0 : -1;
    button.setAttribute("aria-selected", String(isSelected));
  });

  noteShellElement.dataset.planScope = currentPlanScope;
}

function renderDateHeader() {
  previousDayButtonElement.setAttribute("aria-label", getNavigationLabel(-1));
  previousDayButtonElement.title = getNavigationLabel(-1);
  nextDayButtonElement.setAttribute("aria-label", getNavigationLabel(1));
  nextDayButtonElement.title = getNavigationLabel(1);
  todayButtonElement.disabled = isLoading || isSaving || getDayOffset(viewedDate) === 0;
  todayButtonElement.title = currentPlanScope === "day" ? "回到今天" : "回到今天所在计划";
  todayButtonElement.setAttribute("aria-label", todayButtonElement.title);
  datePickerElement.value = viewedDateKey;

  if (currentPlanScope === "week") {
    weekdayElement.textContent = formatWeekRange(viewedDate);
    dateTitleElement.textContent = `${formatShortViewedDate()}计划`;
    return;
  }

  if (currentPlanScope === "month") {
    weekdayElement.textContent = formatShortViewedDate();
    dateTitleElement.textContent = formatMonthLabel(viewedDate);
    return;
  }

  const relativeLabel = getRelativeDateLabel(viewedDate);

  weekdayElement.textContent = relativeLabel ? `${relativeLabel} · ${formatWeekday(viewedDate)}` : formatWeekday(viewedDate);
  dateTitleElement.textContent = formatCalendarDate(viewedDate);
}

function renderEmptyState() {
  if (currentPlanScope === "week") {
    renderScopedEmptyState("week");
    return;
  }

  if (currentPlanScope === "month") {
    renderScopedEmptyState("month");
    return;
  }

  const dayOffset = getDayOffset(viewedDate);

  if (isLoadBlocked) {
    emptyStateTitleElement.textContent = `${formatShortViewedDate()}暂时无法编辑。`;
    emptyStateDetailElement.textContent = "读取失败后，DayNote 不会保存新内容。";
    emptyStateElement.setAttribute("aria-label", `${formatReadableViewedDate()}的空计划`);
    return;
  }

  if (dayOffset === 0) {
    emptyStateTitleElement.textContent = "今天还很安静。";
    emptyStateDetailElement.textContent = "输入一条计划后，这里会成为你的轻量清单。";
  } else if (dayOffset === 1) {
    emptyStateTitleElement.textContent = "明天还没有安排。";
    emptyStateDetailElement.textContent = "可以先放下一条轻量计划。";
  } else if (dayOffset === -1) {
    emptyStateTitleElement.textContent = "昨天没有留下计划。";
    emptyStateDetailElement.textContent = "需要回看或补记时，可以在这里添加。";
  } else if (dayOffset > 0) {
    emptyStateTitleElement.textContent = "这一天还没有安排。";
    emptyStateDetailElement.textContent = "提前写下要做的事，到了当天就不用重新想。";
  } else {
    emptyStateTitleElement.textContent = "这一天没有留下计划。";
    emptyStateDetailElement.textContent = "需要回看或补记时，可以在这里添加。";
  }

  emptyStateElement.setAttribute("aria-label", `${formatReadableViewedDate()}的空计划`);
}

function renderScopedEmptyState(scope: Exclude<PlanScope, "day">) {
  if (isLoadBlocked) {
    emptyStateTitleElement.textContent = `${formatShortViewedDate()}暂时无法编辑。`;
    emptyStateDetailElement.textContent = "读取失败后，DayNote 不会保存新内容。";
    emptyStateElement.setAttribute("aria-label", `${formatReadableViewedDate()}的空计划`);
    return;
  }

  if (scope === "week") {
    emptyStateTitleElement.textContent = `${formatShortViewedDate()}还没有安排。`;
    emptyStateDetailElement.textContent = "写下这一周要推进的计划，周计划会单独保存。";
  } else {
    emptyStateTitleElement.textContent = `${formatShortViewedDate()}还没有安排。`;
    emptyStateDetailElement.textContent = "写下这个月要推进的计划，月计划会单独保存。";
  }

  emptyStateElement.setAttribute("aria-label", `${formatReadableViewedDate()}的空计划`);
}

function updateBusyState() {
  const locked = isEditingLocked();
  const navigationLocked = isLoading || isSaving;

  renderScopeTabs();
  taskInputElement.disabled = locked;
  taskInputElement.placeholder = isLoading
    ? LOADING_PLACEHOLDER
    : isLoadBlocked
      ? LOAD_BLOCKED_PLACEHOLDER
      : getInputPlaceholder();
  addTaskButtonElement.disabled = locked;
  previousDayButtonElement.disabled = navigationLocked;
  nextDayButtonElement.disabled = navigationLocked;
  composerElement.toggleAttribute("aria-disabled", locked);
  taskListElement.toggleAttribute("aria-busy", isLoading || isSaving);
  taskListElement.setAttribute("aria-disabled", String(locked));
}

function isEditingLocked() {
  return isLoading || isSaving || isLoadBlocked;
}

function setStatus(message: string, isError = false) {
  statusMessageElement.textContent = message;
  statusMessageElement.classList.toggle("is-error", isError);
}

function markTaskAsAdded(taskId: string) {
  if (addFeedbackTimer !== null) {
    window.clearTimeout(addFeedbackTimer);
  }

  recentlyAddedTaskId = taskId;
  addFeedbackTimer = window.setTimeout(() => {
    clearAddedFeedback();
  }, 520);
}

function markTaskAsCompleted(taskId: string) {
  if (completeFeedbackTimer !== null) {
    window.clearTimeout(completeFeedbackTimer);
  }

  recentlyCompletedTaskId = taskId;
  completeFeedbackTimer = window.setTimeout(() => {
    clearCompletedFeedback();
  }, TASK_COMPLETION_FEEDBACK_MS);
}

function clearAddedFeedback() {
  if (addFeedbackTimer !== null) {
    window.clearTimeout(addFeedbackTimer);
  }

  const taskId = recentlyAddedTaskId;
  recentlyAddedTaskId = null;
  addFeedbackTimer = null;

  if (!taskId) {
    return;
  }

  taskListElement
    .querySelector<HTMLElement>(`[data-task-id="${CSS.escape(taskId)}"]`)
    ?.classList.remove("is-new");
}

function clearCompletedFeedback() {
  if (completeFeedbackTimer !== null) {
    window.clearTimeout(completeFeedbackTimer);
  }

  const taskId = recentlyCompletedTaskId;
  recentlyCompletedTaskId = null;
  completeFeedbackTimer = null;

  if (!taskId) {
    return;
  }

  const taskItem = taskListElement.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(taskId)}"]`);

  if (!taskItem) {
    return;
  }

  taskItem.classList.remove("is-completing");
  taskItem.querySelector<HTMLElement>(".task-sheen")?.remove();
}

function getRecordedAllDoneState() {
  return allDoneStateByPlan.get(getViewedPlanStateKey()) ?? isViewedPlanAllDone();
}

function recordViewedAllDoneState() {
  allDoneStateByPlan.set(getViewedPlanStateKey(), isViewedPlanAllDone());
}

function recordAllDoneTransition(wasAllDone: boolean) {
  const isAllDone = isViewedPlanAllDone();
  allDoneStateByPlan.set(getViewedPlanStateKey(), isAllDone);

  return !wasAllDone && isAllDone;
}

function isViewedPlanAllDone() {
  const tasks = getViewedTasks();

  return tasks.length > 0 && tasks.every((task) => task.done);
}

function triggerAllDoneReward() {
  if (rewardTimer !== null) {
    window.clearTimeout(rewardTimer);
  }

  allDoneRewardElement.replaceChildren(...createRewardPieces());
  allDoneRewardElement.hidden = false;
  noteShellElement.classList.remove("is-rewarding");
  void noteShellElement.offsetWidth;
  noteShellElement.classList.add("is-rewarding");
  setStatus(formatAllDoneRewardStatus());

  rewardTimer = window.setTimeout(() => {
    hideAllDoneReward();
  }, 1350);
}

function hideAllDoneReward() {
  if (rewardTimer !== null) {
    window.clearTimeout(rewardTimer);
    rewardTimer = null;
  }

  noteShellElement.classList.remove("is-rewarding");
  allDoneRewardElement.hidden = true;
  allDoneRewardElement.replaceChildren();
}

function createRewardPieces() {
  const pieces: HTMLElement[] = [];
  const seal = document.createElement("div");
  seal.className = "reward-seal";
  seal.textContent = formatAllDoneRewardSeal();
  pieces.push(seal);

  for (let index = 0; index < 10; index += 1) {
    const spark = document.createElement("span");
    spark.className = "reward-spark";
    spark.style.setProperty("--spark-x", `${REWARD_SPARKS[index].x}px`);
    spark.style.setProperty("--spark-y", `${REWARD_SPARKS[index].y}px`);
    spark.style.setProperty("--spark-delay", `${REWARD_SPARKS[index].delay}ms`);
    pieces.push(spark);
  }

  return pieces;
}

function formatAllDoneRewardStatus() {
  if (currentPlanScope === "week") {
    return "当前周计划已全部完成";
  }

  if (currentPlanScope === "month") {
    return "当前月计划已全部完成";
  }

  const relativeLabel = getRelativeDateLabel(viewedDate);

  return relativeLabel ? `${relativeLabel}清单已全部完成` : "当前清单已全部完成";
}

function formatAllDoneRewardSeal() {
  if (currentPlanScope === "week") {
    return "本周已清";
  }

  if (currentPlanScope === "month") {
    return "本月已清";
  }

  const relativeLabel = getRelativeDateLabel(viewedDate);

  return relativeLabel ? `${relativeLabel}已清` : "当前已清";
}

function formatAllDoneSaveStatus() {
  if (currentPlanScope === "week") {
    return "当前周计划已全部完成";
  }

  if (currentPlanScope === "month") {
    return "当前月计划已全部完成";
  }

  const relativeLabel = getRelativeDateLabel(viewedDate);

  if (relativeLabel === "今天") {
    return "当前清单已全部完成";
  }

  if (relativeLabel) {
    return `${relativeLabel}清单已全部完成`;
  }

  return `${formatCalendarDate(viewedDate)}清单已全部完成`;
}

function getViewedTasks() {
  return getViewedPlanMap()[getViewedPlanKey()]?.tasks ?? [];
}

function getMutableViewedTasks() {
  const planMap = getViewedPlanMap();
  const plan = (planMap[getViewedPlanKey()] ??= { tasks: [] });
  plan.tasks = repairTasks(plan.tasks ?? []);

  return plan.tasks;
}

function findTask(taskId: string) {
  return getViewedTasks().find((task) => task.id === taskId);
}

function getViewedPlanMap() {
  return getPlanMap(currentPlanScope);
}

function getPlanMap(scope: PlanScope) {
  if (scope === "week") {
    return data.weeks;
  }

  if (scope === "month") {
    return data.months;
  }

  return data.days;
}

function getViewedPlanKey() {
  if (currentPlanScope === "week") {
    return getWeekKey(viewedDate);
  }

  if (currentPlanScope === "month") {
    return getMonthKey(viewedDate);
  }

  return viewedDateKey;
}

function getViewedPlanStateKey() {
  return `${currentPlanScope}:${getViewedPlanKey()}`;
}

function repairData(value: DaynoteData | null | undefined): DaynoteData {
  const source = value ?? createEmptyData();
  const repaired: DaynoteData = {
    days: {},
    weeks: {},
    months: {},
    settings: {
      theme: typeof source.settings?.theme === "string" && source.settings.theme.trim()
        ? source.settings.theme.trim()
        : "jade",
    },
  };

  repairPlanMap(source.days, repaired.days);
  repairPlanMap(source.weeks, repaired.weeks);
  repairPlanMap(source.months, repaired.months);

  return repaired;
}

function repairPlanMap(source: PlanMap | undefined, target: PlanMap) {
  for (const [key, plan] of Object.entries(source ?? {})) {
    const tasks = Array.isArray((plan as DayPlan | undefined)?.tasks) ? (plan as DayPlan).tasks : [];
    target[key] = { tasks: repairTasks(tasks) };
  }
}

function repairTasks(tasks: Array<Partial<Task> | null | undefined>) {
  const repaired = tasks
    .map((task, index) => {
      const id = typeof task?.id === "string" ? task.id.trim() : "";
      const text = typeof task?.text === "string" ? task.text.trim() : "";
      const importance = isImportance(task?.importance) ? task.importance : DEFAULT_IMPORTANCE;
      const createdAt = typeof task?.createdAt === "string" && task.createdAt.trim()
        ? task.createdAt.trim()
        : new Date().toISOString();
      const completedAt =
        Boolean(task?.done) && typeof task?.completedAt === "string" && task.completedAt.trim()
          ? task.completedAt.trim()
          : null;

      return {
        id: id || (text ? createTaskId() : ""),
        text,
        importance,
        done: Boolean(task?.done),
        createdAt,
        completedAt,
        order: normalizeOrder(task?.order, index),
        sourceIndex: index,
      };
    })
    .filter((task) => task.id && task.text)
    .sort((first, second) => {
      return compareTasksByListOrder(first, second) || first.sourceIndex - second.sourceIndex;
    })
    .map(({ sourceIndex: _sourceIndex, ...task }) => task);

  resequenceTasks(repaired);

  return repaired;
}

function normalizeOrder(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function moveTask(sourceTaskId: string, targetTaskId: string, position: DropPosition) {
  const tasks = getViewedTasks();
  const fromIndex = tasks.findIndex((task) => task.id === sourceTaskId);
  const targetIndex = tasks.findIndex((task) => task.id === targetTaskId);

  if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) {
    return false;
  }

  if (!tasksBelongToSameOrderGroup(tasks[fromIndex], tasks[targetIndex])) {
    return false;
  }

  if (position === "before" && fromIndex === targetIndex - 1) {
    return false;
  }

  if (position === "after" && fromIndex === targetIndex + 1) {
    return false;
  }

  const [movedTask] = tasks.splice(fromIndex, 1);

  let insertIndex = position === "before" ? targetIndex : targetIndex + 1;

  if (fromIndex < insertIndex) {
    insertIndex -= 1;
  }

  tasks.splice(insertIndex, 0, movedTask);
  resequenceTasks(tasks);

  return true;
}

function resequenceTasks(tasks: Task[]) {
  tasks.forEach((task, index) => {
    task.order = index;
  });
}

function sortAndResequenceTasks(tasks: Task[]) {
  tasks.sort(compareTasksByListOrder);
  resequenceTasks(tasks);
}

function compareTasksByListOrder(first: Pick<Task, "done" | "importance" | "order">, second: Pick<Task, "done" | "importance" | "order">) {
  if (first.done !== second.done) {
    return first.done ? 1 : -1;
  }

  if (!first.done) {
    const importanceDelta = IMPORTANCE_SORT_ORDER[first.importance] - IMPORTANCE_SORT_ORDER[second.importance];

    if (importanceDelta !== 0) {
      return importanceDelta;
    }
  }

  return first.order - second.order;
}

function tasksBelongToSameOrderGroup(first: Task, second: Task) {
  if (first.done || second.done) {
    return first.done === second.done;
  }

  return first.importance === second.importance;
}

function getNextOrder(tasks: Task[]) {
  return tasks.reduce((nextOrder, task) => Math.max(nextOrder, task.order + 1), 0);
}

function getNextOrderInGroup(tasks: Task[], done: boolean, importance: Importance, ignoredTaskId: string | null = null) {
  return tasks.reduce((nextOrder, task) => {
    if (task.id === ignoredTaskId || task.done !== done || (!done && task.importance !== importance)) {
      return nextOrder;
    }

    return Math.max(nextOrder, task.order + 1);
  }, 0);
}

function getPreviousOrderInGroup(tasks: Task[], done: boolean, ignoredTaskId: string | null = null) {
  const groupOrders = tasks
    .filter((task) => task.id !== ignoredTaskId && task.done === done)
    .map((task) => task.order);

  return groupOrders.length > 0 ? Math.min(...groupOrders) - 1 : 0;
}

function createEmptyData(): DaynoteData {
  return {
    days: {},
    weeks: {},
    months: {},
    settings: {
      theme: "jade",
    },
  };
}

function createTaskId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseIsoDateInput(value: string) {
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/.exec(value);

  if (!match?.groups) {
    return null;
  }

  const year = Number(match.groups.year);
  const monthIndex = Number(match.groups.month) - 1;
  const day = Number(match.groups.day);
  const date = new Date(year, monthIndex, day);

  if (date.getFullYear() !== year || date.getMonth() !== monthIndex || date.getDate() !== day) {
    return null;
  }

  return date;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, dayOffset: number) {
  const nextDate = startOfLocalDay(date);
  nextDate.setDate(nextDate.getDate() + dayOffset);

  return nextDate;
}

function addMonths(date: Date, monthOffset: number) {
  const nextDate = startOfLocalDay(date);
  const targetDay = nextDate.getDate();

  nextDate.setDate(1);
  nextDate.setMonth(nextDate.getMonth() + monthOffset);
  nextDate.setDate(Math.min(targetDay, getDaysInMonth(nextDate)));

  return nextDate;
}

function addPlanOffset(date: Date, scope: PlanScope, offset: number) {
  if (scope === "week") {
    return addDays(date, offset * 7);
  }

  if (scope === "month") {
    return addMonths(date, offset);
  }

  return addDays(date, offset);
}

function getDaysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function getDayOffset(date: Date) {
  return Math.round((startOfLocalDay(date).getTime() - startOfLocalDay(new Date()).getTime()) / DAY_IN_MS);
}

function getWeekOffset(date: Date) {
  return Math.round((getWeekStart(date).getTime() - getWeekStart(new Date()).getTime()) / WEEK_IN_MS);
}

function getMonthOffset(date: Date) {
  const today = new Date();

  return (date.getFullYear() - today.getFullYear()) * 12 + date.getMonth() - today.getMonth();
}

function getRelativeDateLabel(date: Date) {
  const dayOffset = getDayOffset(date);

  if (dayOffset === 0) {
    return "今天";
  }

  if (dayOffset === 1) {
    return "明天";
  }

  if (dayOffset === -1) {
    return "昨天";
  }

  return null;
}

function formatCalendarDate(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  if (year !== new Date().getFullYear()) {
    return `${year}年${month}月${day}日`;
  }

  return `${month}月${day}日`;
}

function formatWeekRangeDate(date: Date, includeYear: boolean) {
  const year = includeYear ? `${date.getFullYear()}年` : "";

  return `${year}${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatWeekday(date: Date) {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
  }).format(date);
}

function formatReadableViewedDate() {
  if (currentPlanScope === "week") {
    return `${formatShortViewedDate()} ${formatWeekRange(viewedDate, true)}`;
  }

  if (currentPlanScope === "month") {
    return `${formatShortViewedDate()} ${formatMonthLabel(viewedDate)}`;
  }

  const relativeLabel = getRelativeDateLabel(viewedDate);
  const dateLabel = formatCalendarDate(viewedDate);

  return relativeLabel ? `${relativeLabel} ${dateLabel}` : dateLabel;
}

function formatShortViewedDate() {
  if (currentPlanScope === "week") {
    const weekOffset = getWeekOffset(viewedDate);

    if (weekOffset === 0) {
      return "本周";
    }

    if (weekOffset === 1) {
      return "下周";
    }

    if (weekOffset === -1) {
      return "上周";
    }

    return "这一周";
  }

  if (currentPlanScope === "month") {
    const monthOffset = getMonthOffset(viewedDate);

    if (monthOffset === 0) {
      return "本月";
    }

    if (monthOffset === 1) {
      return "下月";
    }

    if (monthOffset === -1) {
      return "上月";
    }

    return "这个月";
  }

  return getRelativeDateLabel(viewedDate) ?? "这一天";
}

function getInputPlaceholder() {
  if (currentPlanScope === "week") {
    return "写下一件这周要推进的事";
  }

  if (currentPlanScope === "month") {
    return "写下一件这个月要推进的事";
  }

  const dayOffset = getDayOffset(viewedDate);

  if (dayOffset === 0) {
    return "写下一件今天要完成的小事";
  }

  if (dayOffset === 1) {
    return "写下一件明天要安排的小事";
  }

  if (dayOffset === -1) {
    return "补记一件昨天的计划";
  }

  return dayOffset > 0 ? "安排这一天的计划" : "补记这一天的计划";
}

function getWeekStart(date: Date) {
  const weekStart = startOfLocalDay(date);
  const day = weekStart.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;

  weekStart.setDate(weekStart.getDate() + mondayOffset);

  return weekStart;
}

function getWeekEnd(date: Date) {
  return addDays(getWeekStart(date), 6);
}

function getWeekKey(date: Date) {
  return toIsoDate(getWeekStart(date));
}

function getMonthKey(date: Date) {
  return toIsoDate(date).slice(0, 7);
}

function formatWeekRange(date: Date, alwaysIncludeYear = false) {
  const start = getWeekStart(date);
  const end = getWeekEnd(date);
  const includeStartYear = alwaysIncludeYear || start.getFullYear() !== end.getFullYear();
  const includeEndYear = alwaysIncludeYear || end.getFullYear() !== new Date().getFullYear();

  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    const startYear = includeStartYear ? `${start.getFullYear()}年` : "";

    return `${startYear}${start.getMonth() + 1}月${start.getDate()}日 - ${end.getDate()}日`;
  }

  return `${formatWeekRangeDate(start, includeStartYear)}-${formatWeekRangeDate(end, includeEndYear)}`;
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat(LOCALE, {
    year: "numeric",
    month: "long",
  }).format(date);
}

function getNavigationLabel(offset: -1 | 1) {
  if (currentPlanScope === "week") {
    return `${offset < 0 ? "上一周" : "下一周"}（Alt+${offset < 0 ? "Left" : "Right"}）`;
  }

  if (currentPlanScope === "month") {
    return `${offset < 0 ? "上一月" : "下一月"}（Alt+${offset < 0 ? "Left" : "Right"}）`;
  }

  return `${offset < 0 ? "上一天" : "下一天"}（Alt+${offset < 0 ? "Left" : "Right"}）`;
}

function focusTask(taskId: string) {
  if (!taskId) {
    return;
  }

  requestAnimationFrame(() => {
    taskListElement.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(taskId)}"]`)?.focus();
  });
}

function captureTaskLayout() {
  const layout = new Map<string, DOMRect>();

  taskListElement.querySelectorAll<HTMLElement>("[data-task-id]").forEach((item) => {
    const taskId = item.dataset.taskId;

    if (taskId) {
      layout.set(taskId, item.getBoundingClientRect());
    }
  });

  return layout;
}

function animateTaskLayoutFrom(previousLayout: Map<string, DOMRect>) {
  if (previousLayout.size === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  requestAnimationFrame(() => {
    taskListElement.querySelectorAll<HTMLElement>("[data-task-id]").forEach((item) => {
      const taskId = item.dataset.taskId;
      const previousRect = taskId ? previousLayout.get(taskId) : null;

      if (!previousRect) {
        return;
      }

      const nextRect = item.getBoundingClientRect();
      const deltaY = previousRect.top - nextRect.top;

      if (Math.abs(deltaY) < 1) {
        return;
      }

      item.animate(
        [
          { translate: `0 ${deltaY}px`, offset: 0 },
          { translate: "0 0", offset: 1 },
        ],
        {
          duration: TASK_LAYOUT_ANIMATION_MS,
          easing: "cubic-bezier(0.2, 0.85, 0.2, 1)",
        },
      );
    });
  });
}

function beginTaskDrag(candidate: TaskDragCandidate, event: PointerEvent) {
  draggedTaskId = candidate.taskId;
  dropTargetTaskId = null;
  dropPosition = "before";
  focusedTaskId = candidate.taskId;
  taskDragState = {
    ...candidate,
    lastY: event.clientY,
  };
  taskListElement.classList.add("is-sorting");

  try {
    candidate.item.setPointerCapture(candidate.pointerId);
  } catch {
    // Pointer capture is a nicety here; document-level listeners still keep the drag usable.
  }

  updateDragIndicators();
  setDropTargetFromPoint(event.clientY);
}

function suppressTaskClickOnce() {
  suppressNextTaskClick = true;
  window.setTimeout(() => {
    suppressNextTaskClick = false;
  }, 0);
}

function finishTaskDrag(clientY: number) {
  if (!taskDragCandidate) {
    return;
  }

  const sourceTaskId = draggedTaskId;

  if (!taskDragState) {
    taskDragCandidate = null;
    return;
  }

  setDropTargetFromPoint(clientY);

  const targetTaskId = dropTargetTaskId;
  const targetPosition = dropPosition;

  clearDragState();

  if (!sourceTaskId || !targetTaskId) {
    focusTask(sourceTaskId ?? focusedTaskId ?? "");
    return;
  }

  const moved = moveTask(sourceTaskId, targetTaskId, targetPosition);

  if (!moved) {
    focusTask(sourceTaskId);
    return;
  }

  focusedTaskId = sourceTaskId;
  render();
  suppressTaskClickOnce();
  void persist("已调整顺序");
  focusTask(sourceTaskId);
}

function setDropTargetFromPoint(clientY: number) {
  const target = resolveDropTargetFromPoint(clientY);

  if (!target) {
    setDropTarget(null, "before");
    return;
  }

  setDropTarget(target.taskId, target.position);
}

function resolveDropTargetFromPoint(clientY: number) {
  const draggedTask = draggedTaskId ? findTask(draggedTaskId) : null;

  if (!draggedTask) {
    return null;
  }

  const taskItems = Array.from(taskListElement.querySelectorAll<HTMLElement>("[data-task-id]")).filter((item) => {
    const taskId = item.dataset.taskId ?? "";
    const task = findTask(taskId);

    return task && task.id !== draggedTask.id && tasksBelongToSameOrderGroup(task, draggedTask);
  });

  if (taskItems.length === 0) {
    return null;
  }

  for (const item of taskItems) {
    const rect = item.getBoundingClientRect();
    const taskId = item.dataset.taskId ?? null;

    if (taskId && clientY < rect.top + rect.height / 2) {
      return { taskId, position: "before" as DropPosition };
    }
  }

  const lastTaskId = taskItems.at(-1)?.dataset.taskId ?? null;

  return lastTaskId ? { taskId: lastTaskId, position: "after" as DropPosition } : null;
}

function autoScrollTaskList(clientY: number) {
  const rect = taskListElement.getBoundingClientRect();
  let scrollStep = 0;

  if (clientY < rect.top + DRAG_SCROLL_EDGE_SIZE) {
    scrollStep = -Math.ceil(((rect.top + DRAG_SCROLL_EDGE_SIZE - clientY) / DRAG_SCROLL_EDGE_SIZE) * DRAG_SCROLL_MAX_STEP);
  } else if (clientY > rect.bottom - DRAG_SCROLL_EDGE_SIZE) {
    scrollStep = Math.ceil(((clientY - (rect.bottom - DRAG_SCROLL_EDGE_SIZE)) / DRAG_SCROLL_EDGE_SIZE) * DRAG_SCROLL_MAX_STEP);
  }

  if (scrollStep === 0) {
    return false;
  }

  const previousScrollTop = taskListElement.scrollTop;
  taskListElement.scrollTop += scrollStep;

  return taskListElement.scrollTop !== previousScrollTop;
}

function scheduleDragAutoScroll() {
  if (dragScrollFrame) {
    return;
  }

  dragScrollFrame = window.requestAnimationFrame(runDragAutoScroll);
}

function runDragAutoScroll() {
  dragScrollFrame = 0;

  if (!taskDragState) {
    return;
  }

  const didScroll = autoScrollTaskList(taskDragState.lastY);
  setDropTargetFromPoint(taskDragState.lastY);

  if (didScroll) {
    scheduleDragAutoScroll();
  }
}

function setDropTarget(taskId: string | null, position: DropPosition) {
  if (dropTargetTaskId === taskId && dropPosition === position) {
    return;
  }

  dropTargetTaskId = taskId;
  dropPosition = position;
  updateDragIndicators();
}

function clearDragState() {
  if (dragScrollFrame) {
    window.cancelAnimationFrame(dragScrollFrame);
    dragScrollFrame = 0;
  }

  if (taskDragCandidate?.item.hasPointerCapture(taskDragCandidate.pointerId)) {
    taskDragCandidate.item.releasePointerCapture(taskDragCandidate.pointerId);
  }

  taskDragCandidate = null;
  taskDragState = null;
  draggedTaskId = null;
  dropTargetTaskId = null;
  dropPosition = "before";
  taskListElement.classList.remove("is-sorting");
  updateDragIndicators();
}

function updateDragIndicators() {
  taskListElement.querySelectorAll<HTMLElement>(".task-item").forEach((item) => {
    const taskId = item.dataset.taskId ?? "";
    item.classList.toggle("is-dragging", taskId === draggedTaskId);
    item.classList.toggle("is-drop-before", taskId === dropTargetTaskId && dropPosition === "before");
    item.classList.toggle("is-drop-after", taskId === dropTargetTaskId && dropPosition === "after");
  });
}

function isInteractiveTaskTarget(target: Element) {
  return Boolean(target.closest("button, input, textarea, select, a, [role='button']"));
}

function canStartWindowDrag(event: PointerEvent) {
  if (event.button !== 0) {
    return false;
  }

  const target = event.target;

  if (!(target instanceof Element)) {
    return false;
  }

  return !isWindowDragBlockedTarget(target);
}

function isWindowDragBlockedTarget(target: Element) {
  return Boolean(
    target.closest(
      [
        "button",
        "input",
        "textarea",
        "select",
        "a",
        "[role='button']",
        "[contenteditable='true']",
        "[data-task-id]",
        "#task-list",
        ".top-bar",
        ".composer",
      ].join(", "),
    ),
  );
}

function isImportance(value: string | undefined): value is Importance {
  return value === "low" || value === "medium" || value === "high";
}

function isPlanScope(value: string | undefined): value is PlanScope {
  return value === "week" || value === "day" || value === "month";
}

function isHideToTrayShortcut(event: KeyboardEvent) {
  return (
    event.key === "Escape" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

function isDayNavigationShortcut(event: KeyboardEvent) {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }

  return event.key === "ArrowLeft" || event.key === "ArrowRight";
}

function isTextEntryElement(element: Element | null) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  return (
    element.isContentEditable ||
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  );
}

function isPriorityShortcut(key: string) {
  return key === "1" || key === "2" || key === "3";
}

function importanceFromShortcut(key: string): Importance {
  if (key === "1") {
    return "low";
  }

  if (key === "2") {
    return "medium";
  }

  return "high";
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function requireElement<T extends HTMLElement>(selector: string) {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }

  return element;
}
