import { getCurrentWindow } from "@tauri-apps/api/window";
import "./styles.css";

const appWindow = getCurrentWindow();

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

document.querySelector<HTMLInputElement>(".composer input")?.focus();
