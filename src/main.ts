import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./styles.css";

const DEFAULT_IMPORTANCE = "medium";
const LOCALE = "zh-CN";
const LOAD_BLOCKED_PLACEHOLDER = "读取失败，暂时无法编辑";

type Importance = "low" | "medium" | "high";

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
const today = new Date();
const todayKey = toIsoDate(today);

let data: DaynoteData = createEmptyData();
let focusedTaskId: string | null = null;
let isSaving = false;
let isLoadBlocked = false;

const weekdayElement = requireElement<HTMLElement>("#weekday");
const dateTitleElement = requireElement<HTMLHeadingElement>("#date-title");
const composerElement = requireElement<HTMLFormElement>("#composer");
const taskInputElement = requireElement<HTMLInputElement>("#task-input");
const addTaskButtonElement = requireElement<HTMLButtonElement>("#add-task");
const statusMessageElement = requireElement<HTMLParagraphElement>("#status-message");
const emptyStateElement = requireElement<HTMLElement>("#empty-state");
const taskListElement = requireElement<HTMLUListElement>("#task-list");

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

taskListElement.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const taskItem = target.closest<HTMLLIElement>("[data-task-id]");

  if (!taskItem) {
    return;
  }

  focusedTaskId = taskItem.dataset.taskId ?? null;

  if (target.closest("[data-action='toggle']")) {
    void toggleTask(taskItem.dataset.taskId);
  }

  if (target.closest("[data-action='delete']")) {
    void deleteTask(taskItem.dataset.taskId);
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

  const taskId = target.closest<HTMLElement>("[data-task-id]")?.dataset.taskId ?? focusedTaskId;
  const actionButton = target.closest<HTMLButtonElement>("button[data-action]");

  if (!taskId) {
    return;
  }

  if (event.key === " " || event.code === "Space") {
    if (actionButton) {
      return;
    }

    event.preventDefault();
    void toggleTask(taskId);
  }

  if (event.key === "Delete") {
    event.preventDefault();
    void deleteTask(taskId);
  }
});

setTodayHeader(today);
void initialize();

async function initialize() {
  setStatus("正在读取今天的计划...");
  updateBusyState();

  try {
    data = repairData(await invoke<DaynoteData>("load_daynote_data"));
    ensureTodayPlan();
    isLoadBlocked = false;
    setStatus("");
  } catch (error) {
    data = createEmptyData();
    ensureTodayPlan();
    isLoadBlocked = true;
    taskInputElement.value = "";
    setStatus(
      `读取失败：${formatError(error)}。为避免覆盖已有数据，DayNote 已暂时阻止编辑和保存。请重启应用，或检查应用数据目录中的 daynote.json。`,
      true,
    );
  }

  updateBusyState();
  render();
  if (!isLoadBlocked) {
    taskInputElement.focus();
  }
}

async function addTask() {
  const text = taskInputElement.value.trim();

  if (isLoadBlocked || !text || isSaving) {
    return;
  }

  const tasks = getTodayTasks();
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
  render();
  await persist("已添加");
  focusTask(task.id);
}

async function toggleTask(taskId: string | undefined) {
  if (isLoadBlocked || !taskId || isSaving) {
    return;
  }

  const task = findTask(taskId);

  if (!task) {
    return;
  }

  task.done = !task.done;
  task.completedAt = task.done ? new Date().toISOString() : null;
  focusedTaskId = task.id;
  render();
  await persist(task.done ? "已完成" : "已恢复");
  focusTask(task.id);
}

async function deleteTask(taskId: string | undefined) {
  if (isLoadBlocked || !taskId || isSaving) {
    return;
  }

  const tasks = getTodayTasks();
  const index = tasks.findIndex((task) => task.id === taskId);

  if (index === -1) {
    return;
  }

  tasks.splice(index, 1);
  resequenceTasks(tasks);
  focusedTaskId = tasks[Math.min(index, tasks.length - 1)]?.id ?? null;
  render();
  await persist("已删除");

  if (focusedTaskId) {
    focusTask(focusedTaskId);
  } else {
    taskInputElement.focus();
  }
}

async function persist(successMessage: string) {
  if (isLoadBlocked) {
    return;
  }

  isSaving = true;
  updateBusyState();
  setStatus("正在保存...");

  try {
    data = repairData(await invoke<DaynoteData>("save_daynote_data", { data }));
    setStatus(successMessage);
  } catch (error) {
    setStatus(`保存失败：${formatError(error)}`, true);
  } finally {
    isSaving = false;
    updateBusyState();
    render();
  }
}

function render() {
  const tasks = getTodayTasks();

  emptyStateElement.hidden = tasks.length > 0;
  taskListElement.hidden = tasks.length === 0;
  taskListElement.replaceChildren(...tasks.map(renderTask));
}

function renderTask(task: Task) {
  const item = document.createElement("li");
  item.className = `task-item${task.done ? " is-done" : ""}`;
  item.dataset.taskId = task.id;
  item.tabIndex = 0;
  item.setAttribute("aria-label", `${task.done ? "已完成" : "未完成"}：${task.text}`);

  const toggleButton = document.createElement("button");
  toggleButton.className = "task-toggle";
  toggleButton.type = "button";
  toggleButton.disabled = isLoadBlocked;
  toggleButton.dataset.action = "toggle";
  toggleButton.setAttribute("aria-label", task.done ? `标记为未完成：${task.text}` : `标记为完成：${task.text}`);
  toggleButton.setAttribute("aria-pressed", String(task.done));

  const textElement = document.createElement("span");
  textElement.className = "task-text";
  textElement.textContent = task.text;

  const deleteButton = document.createElement("button");
  deleteButton.className = "task-delete";
  deleteButton.type = "button";
  deleteButton.disabled = isLoadBlocked;
  deleteButton.dataset.action = "delete";
  deleteButton.setAttribute("aria-label", `删除计划：${task.text}`);
  deleteButton.textContent = "×";

  item.append(toggleButton, textElement, deleteButton);

  return item;
}

function setTodayHeader(date: Date) {
  weekdayElement.textContent = new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
  }).format(date);
  dateTitleElement.textContent = new Intl.DateTimeFormat(LOCALE, {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function updateBusyState() {
  taskInputElement.disabled = isLoadBlocked || isSaving;
  taskInputElement.placeholder = isLoadBlocked
    ? LOAD_BLOCKED_PLACEHOLDER
    : "写下一件今天要完成的小事";
  addTaskButtonElement.disabled = isLoadBlocked || isSaving;
  composerElement.toggleAttribute("aria-disabled", isLoadBlocked);
  taskListElement.toggleAttribute("aria-busy", isSaving);
}

function setStatus(message: string, isError = false) {
  statusMessageElement.textContent = message;
  statusMessageElement.classList.toggle("is-error", isError);
}

function ensureTodayPlan() {
  data.days[todayKey] ??= { tasks: [] };
  data.days[todayKey].tasks = repairTasks(data.days[todayKey].tasks);
}

function getTodayTasks() {
  ensureTodayPlan();
  return data.days[todayKey].tasks;
}

function findTask(taskId: string) {
  return getTodayTasks().find((task) => task.id === taskId);
}

function repairData(value: DaynoteData | null | undefined): DaynoteData {
  const repaired = value ?? createEmptyData();
  repaired.days ??= {};
  repaired.settings ??= { theme: "jade" };
  repaired.settings.theme ||= "jade";

  for (const day of Object.values(repaired.days)) {
    day.tasks = repairTasks(day.tasks ?? []);
  }

  return repaired;
}

function repairTasks(tasks: Task[]) {
  const repaired = tasks
    .filter((task) => task.id && task.text.trim())
    .map((task) => ({
      ...task,
      text: task.text.trim(),
      importance: isImportance(task.importance) ? task.importance : DEFAULT_IMPORTANCE,
      completedAt: task.done ? task.completedAt : null,
    }))
    .sort((first, second) => first.order - second.order);

  resequenceTasks(repaired);

  return repaired;
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

function focusTask(taskId: string) {
  requestAnimationFrame(() => {
    taskListElement.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(taskId)}"]`)?.focus();
  });
}

function isImportance(value: string): value is Importance {
  return value === "low" || value === "medium" || value === "high";
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
