import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@shared/tokens.css";

import { Pagina } from "./Pagina";

// La hoja de sistema es siempre clara: es una referencia impresa, no una app.
document.body.style.background = "#DDDFE9";
document.body.style.color = "#171A28";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <Pagina />
  </StrictMode>,
);
