import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Tipografías self-hosted: el video no puede depender de que haya red.
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@shared/tokens.css";

import { App } from "./App";
import { ProveedorEstado } from "./estado";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ProveedorEstado>
      <App />
    </ProveedorEstado>
  </StrictMode>,
);
