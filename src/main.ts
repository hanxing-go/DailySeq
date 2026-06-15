import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./styles.css";

type Importance = "low" | "medium" | "high";
type DropPosition = "before" | "after";

const DEFAULT_IMPORTANCE: Importance = "medium";
const LOCALE = "zh-CN";
const DAY_IN_MS = 24 * 60 * 60 * 1000;
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

interface DaynoteData {
  days: Record<string, DayPlan>;
  settings: {
    theme: string;
  };
}

const appWindow = getCurrentWindow();

let data: DaynoteData = createEmptyData();
let viewedDate = startOfLocalDay(new Date());
let viewedDateKey = toIsoDate(viewedDate);
let focusedTaskId: string | null = null;
let isLoading = true;
let isSaving = false;
let isLoadBlocked = false;
let draggedTaskId: string | null = null;
let dropTargetTaskId: string | null = null;
let dropPosition: DropPosition = "before";
let recentlyAddedTaskId: string | null = null;
let recentlyCompletedTaskId: string | null = null;
let addFeedbackTimer: number | null = null;
let completeFeedbackTimer: number | null = null;
let rewardTimer: number | null = null;
const allDoneStateByDate = new Map<string, boolean>();

const noteShellElement = requireElement<HTMLElement>("#app");
const weekdayElement = requireElement<HTMLElement>("#weekday");
const dateTitleElement = requireElement<HTMLHeadingElement>("#date-title");
const previousDayButtonElement = requireElement<HTMLButtonElement>("#previous-day");
const nextDayButtonElement = requireElement<HTMLButtonElement>("#next-day");
const composerElement = requireElement<HTMLFormElement>("#composer");
const taskInputElement = requireElement<HTMLInputElement>("#task-input");
const addTaskButtonElement = requireElement<HTMLButtonElement>("#add-task");
const statusMessageElement = requireElement<HTMLParagraphElement>("#status-message");
const emptyStateElement = requireElement<HTMLElement>("#empty-state");
const emptyStateTitleElement = requireElement<HTMLParagraphElement>("#empty-state-title");
const emptyStateDetailElement = requireElement<HTMLElement>("#empty-state-detail");
const taskListElement = requireElement<HTMLUListElement>("#task-list");
const allDoneRewardElement = requireElement<HTMLElement>("#all-done-reward");

document.querySelectorAll<HTMLElement>("[data-tauri-drag-region]").forEach((item) => {
  item.addEventListener("pointerdown", (event) => {
    const target = event.target;
    const isInteractive =
      target instanceof Element &&
      Boolean(target.closest("button, input, textarea, select, a, [role='button']"));

    if (event.button !== 0 || isInteractive) {
      return;
    }

    void appWindow.startDragging();
  });
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

previousDayButtonElement.addEventListener("click", () => {
  navigateDay(-1);
});

nextDayButtonElement.addEventListener("click", () => {
  navigateDay(1);
});

document.addEventListener("keydown", (event) => {
  if (!isDayNavigationShortcut(event) || isTextEntryElement(document.activeElement)) {
    return;
  }

  event.preventDefault();
  navigateDay(event.key === "ArrowLeft" ? -1 : 1);
});

taskListElement.addEventListener("click", (event) => {
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

taskListElement.addEventListener("dragstart", (event) => {
  const target = event.target;

  if (!(target instanceof Element) || isEditingLocked()) {
    event.preventDefault();
    return;
  }

  const taskItem = target.closest<HTMLElement>("[data-task-id]");

  if (!taskItem || target.closest("button, input, textarea, select, a, [role='button']")) {
    event.preventDefault();
    return;
  }

  const taskId = taskItem.dataset.taskId ?? null;

  if (!taskId) {
    event.preventDefault();
    return;
  }

  draggedTaskId = taskId;
  dropTargetTaskId = null;
  dropPosition = "before";
  focusedTaskId = taskId;
  updateDragIndicators();

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskId);
  }
});

taskListElement.addEventListener("dragover", (event) => {
  if (!draggedTaskId || isEditingLocked()) {
    return;
  }

  const target = resolveDropTarget(event);

  if (!target) {
    return;
  }

  event.preventDefault();

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }

  setDropTarget(target.taskId, target.position);
});

taskListElement.addEventListener("drop", (event) => {
  if (!draggedTaskId || isEditingLocked()) {
    return;
  }

  event.preventDefault();

  const target = resolveDropTarget(event);
  const sourceTaskId = draggedTaskId;

  clearDragState();

  if (!target || !sourceTaskId) {
    focusTask(sourceTaskId ?? focusedTaskId ?? "");
    return;
  }

  const moved = moveTask(sourceTaskId, target.taskId, target.position);

  if (!moved) {
    focusTask(sourceTaskId);
    return;
  }

  focusedTaskId = sourceTaskId;
  render();
  void persist("已调整顺序");
  focusTask(sourceTaskId);
});

taskListElement.addEventListener("dragend", () => {
  clearDragState();
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
    order: tasks.length,
  };

  tasks.push(task);
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
  task.done = !task.done;
  task.completedAt = task.done ? new Date().toISOString() : null;
  focusedTaskId = task.id;
  if (task.done) {
    markTaskAsCompleted(task.id);
  } else if (recentlyCompletedTaskId === task.id) {
    clearCompletedFeedback();
  }
  render();
  const shouldReward = recordAllDoneTransition(wasAllDone);
  const saved = await persist(shouldReward ? formatAllDoneSaveStatus() : task.done ? "已完成" : "已恢复");
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
  resequenceTasks(tasks);
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

async function persist(successMessage: string) {
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
    render();
  }
}

function render() {
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
  item.tabIndex = 0;
  item.draggable = !isEditingLocked();
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

function navigateDay(dayOffset: number) {
  if (isLoading || isSaving) {
    return;
  }

  viewedDate = addDays(viewedDate, dayOffset);
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

function renderDateHeader() {
  const relativeLabel = getRelativeDateLabel(viewedDate);
  const dateLabel = formatCalendarDate(viewedDate);

  weekdayElement.textContent = formatWeekday(viewedDate);
  dateTitleElement.textContent = relativeLabel ? `${relativeLabel} · ${dateLabel}` : dateLabel;
}

function renderEmptyState() {
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

function updateBusyState() {
  const locked = isEditingLocked();
  const navigationLocked = isLoading || isSaving;

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
  }, 720);
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
  return allDoneStateByDate.get(viewedDateKey) ?? isViewedDayAllDone();
}

function recordViewedAllDoneState() {
  allDoneStateByDate.set(viewedDateKey, isViewedDayAllDone());
}

function recordAllDoneTransition(wasAllDone: boolean) {
  const isAllDone = isViewedDayAllDone();
  allDoneStateByDate.set(viewedDateKey, isAllDone);

  return !wasAllDone && isAllDone;
}

function isViewedDayAllDone() {
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
  const relativeLabel = getRelativeDateLabel(viewedDate);

  return relativeLabel ? `${relativeLabel}清单已全部完成` : "当前清单已全部完成";
}

function formatAllDoneRewardSeal() {
  const relativeLabel = getRelativeDateLabel(viewedDate);

  return relativeLabel ? `${relativeLabel}已清` : "当前已清";
}

function formatAllDoneSaveStatus() {
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
  return data.days[viewedDateKey]?.tasks ?? [];
}

function getMutableViewedTasks() {
  const dayPlan = (data.days[viewedDateKey] ??= { tasks: [] });
  dayPlan.tasks = repairTasks(dayPlan.tasks ?? []);

  return dayPlan.tasks;
}

function findTask(taskId: string) {
  return getViewedTasks().find((task) => task.id === taskId);
}

function repairData(value: DaynoteData | null | undefined): DaynoteData {
  const source = value ?? createEmptyData();
  const repaired: DaynoteData = {
    days: {},
    settings: {
      theme: typeof source.settings?.theme === "string" && source.settings.theme.trim()
        ? source.settings.theme.trim()
        : "jade",
    },
  };

  for (const [date, day] of Object.entries(source.days ?? {})) {
    const tasks = Array.isArray((day as DayPlan | undefined)?.tasks) ? (day as DayPlan).tasks : [];
    repaired.days[date] = { tasks: repairTasks(tasks) };
  }

  return repaired;
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
    .sort((first, second) => first.order - second.order || first.sourceIndex - second.sourceIndex)
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

function createEmptyData(): DaynoteData {
  return {
    days: {},
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

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, dayOffset: number) {
  const nextDate = startOfLocalDay(date);
  nextDate.setDate(nextDate.getDate() + dayOffset);

  return nextDate;
}

function getDayOffset(date: Date) {
  return Math.round((startOfLocalDay(date).getTime() - startOfLocalDay(new Date()).getTime()) / DAY_IN_MS);
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
  const options: Intl.DateTimeFormatOptions = {
    month: "numeric",
    day: "numeric",
  };

  if (date.getFullYear() !== new Date().getFullYear()) {
    options.year = "numeric";
  }

  return new Intl.DateTimeFormat(LOCALE, options).format(date);
}

function formatWeekday(date: Date) {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
  }).format(date);
}

function formatReadableViewedDate() {
  const relativeLabel = getRelativeDateLabel(viewedDate);
  const dateLabel = formatCalendarDate(viewedDate);

  return relativeLabel ? `${relativeLabel} ${dateLabel}` : dateLabel;
}

function formatShortViewedDate() {
  return getRelativeDateLabel(viewedDate) ?? "这一天";
}

function getInputPlaceholder() {
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

function focusTask(taskId: string) {
  if (!taskId) {
    return;
  }

  requestAnimationFrame(() => {
    taskListElement.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(taskId)}"]`)?.focus();
  });
}

function resolveDropTarget(event: DragEvent) {
  const target = event.target;

  if (!(target instanceof Element)) {
    return resolveEndDropTarget();
  }

  const taskItem = target.closest<HTMLElement>("[data-task-id]");

  if (!taskItem) {
    return resolveEndDropTarget();
  }

  const taskId = taskItem.dataset.taskId ?? null;

  if (!taskId || taskId === draggedTaskId) {
    return null;
  }

  const rect = taskItem.getBoundingClientRect();
  const position: DropPosition = event.clientY > rect.top + rect.height / 2 ? "after" : "before";

  return { taskId, position };
}

function resolveEndDropTarget() {
  const lastTaskItem = taskListElement.querySelector<HTMLElement>("[data-task-id]:last-child");
  const taskId = lastTaskItem?.dataset.taskId ?? null;

  if (!taskId || taskId === draggedTaskId) {
    return null;
  }

  return { taskId, position: "after" as DropPosition };
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
  draggedTaskId = null;
  dropTargetTaskId = null;
  dropPosition = "before";
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

function isImportance(value: string | undefined): value is Importance {
  return value === "low" || value === "medium" || value === "high";
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
