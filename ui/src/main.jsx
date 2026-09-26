import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { App } from "./App.jsx";
import "./styles.css";

createRoot(/** @type {HTMLElement} */ (document.getElementById("root"))).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
