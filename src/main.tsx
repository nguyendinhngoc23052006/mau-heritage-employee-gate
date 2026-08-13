import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("#root element missing from index.html");
}

const root = createRoot(rootEl);

(async () => {
  try {
    const { App } = await import("./App");
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    rootEl.textContent = `Failed to start: ${message}`;
  }
})();
