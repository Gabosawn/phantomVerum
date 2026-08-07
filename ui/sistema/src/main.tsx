import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

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

import { Pagina } from "./Pagina";

// La hoja de sistema es una referencia de la marca: siempre oscura, sobre Void.
document.body.style.background = "#07090F";
document.body.style.color = "#EDEAE6";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <Pagina />
  </StrictMode>,
);
