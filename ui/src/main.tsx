import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { IssuerView } from "./views/IssuerView";
import { WhistleblowerView } from "./views/WhistleblowerView";
import { ProsecutorView } from "./views/ProsecutorView";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <div className="shell">
        <header className="top">
          <a className="brand" href="/">
            PhantomTrace
          </a>
          <nav>
            <a href="/issuer">Issuer</a>
            <a href="/report">Report</a>
            <a href="/prosecutor">Prosecutor</a>
          </nav>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Navigate to="/report" replace />} />
            <Route path="/issuer" element={<IssuerView />} />
            <Route path="/report" element={<WhistleblowerView />} />
            <Route path="/prosecutor" element={<ProsecutorView />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  </StrictMode>,
);
