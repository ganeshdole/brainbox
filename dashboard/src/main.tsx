import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SessionProvider } from "@hono/auth-js/react";
import { RouterProvider } from "react-router-dom";

import "@brainbox/replay/styles.css";
import "./index.css";
import "./lib/authConfig";
import { router } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");
createRoot(root).render(
  <StrictMode>
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  </StrictMode>,
);
