import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Harness } from "./Harness.tsx";

const el = document.getElementById("app");
if (el) {
  createRoot(el).render(
    <StrictMode>
      <Harness />
    </StrictMode>,
  );
}
