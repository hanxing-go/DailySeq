import { getCurrentWindow } from "@tauri-apps/api/window";
import "./styles.css";

const appWindow = getCurrentWindow();

document.querySelectorAll<HTMLElement>("[data-tauri-drag-region]").forEach((item) => {
  item.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    void appWindow.startDragging();
  });
});

document.querySelector<HTMLInputElement>(".composer input")?.focus();
